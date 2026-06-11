import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseYaml } from '../../src/lib/yaml-utils.js';
import { scanDir } from '../../src/lib/scanner.js';
import { rankByRelevance, selectWithinBudget } from '../../src/lib/token-accounting.js';
import type { AssemblyStrategy } from '../../src/types/measurement.js';

/**
 * Context assembly for the three measured strategies. Contexts are
 * live-referenced: assembled from the repo at run time; the corpus only
 * stores task descriptions.
 *
 * Repo contents are read once per run into a Map (the same snapshot serves
 * every task and provider), and every assembled context starts with a
 * task-unique header line — without it, providers' prompt caches persist
 * across loop iterations and task N>1's "cold" call would be served from
 * task N-1's cache. Cold/warm within one task still share the exact same
 * assembled string.
 */

export const NAIVE_RAG_TOKEN_BUDGET = 20_000;

export interface CorpusTask {
  id: string;
  title: string;
  modules: string[];
  description: string;
}

export interface Corpus {
  id: string;
  tasks: CorpusTask[];
}

export class AssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssemblyError';
  }
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/;

/** Load corpus.yaml + per-task markdown files (YAML frontmatter + body). */
export function loadCorpus(corpusDir: string): Corpus {
  const metaPath = path.join(corpusDir, 'corpus.yaml');
  const meta = parseYaml<{ id: string }>(fs.readFileSync(metaPath, 'utf-8'), metaPath);

  const tasks: CorpusTask[] = [];
  const entries = fs.readdirSync(corpusDir).filter((f) => f.endsWith('.md')).sort();
  for (const entry of entries) {
    const taskPath = path.join(corpusDir, entry);
    const raw = fs.readFileSync(taskPath, 'utf-8');
    const match = FRONTMATTER_PATTERN.exec(raw);
    if (!match) {
      throw new AssemblyError(`Corpus task ${entry} has no YAML frontmatter`);
    }
    const frontmatter = parseYaml<{ title: string; modules: string[] }>(match[1]!, taskPath);
    tasks.push({
      id: entry.replace(/\.md$/, ''),
      title: frontmatter.title,
      modules: frontmatter.modules,
      description: (match[2] ?? '').trim(),
    });
  }
  return { id: meta.id, tasks };
}

function fileSection(relPath: string, content: string): string {
  return `=== ${relPath} ===\n${content}\n`;
}

/** All source + spec/knowledge files, the raw material for full-dump and naive-rag. */
export async function listRepoFiles(cwd: string): Promise<string[]> {
  const result = await scanDir(['src/**/*.ts', 'prospec/**/*.md'], { cwd });
  return [...result.files].sort();
}

/** Read every repo file once — the single snapshot all assemblies draw from. */
export function readRepoContents(cwd: string, files: string[]): Map<string, string> {
  const contents = new Map<string, string>();
  for (const relPath of files) {
    try {
      contents.set(relPath, fs.readFileSync(path.join(cwd, relPath), 'utf-8'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AssemblyError(`Referenced file does not exist: ${relPath}`);
      }
      throw err;
    }
  }
  return contents;
}

/** Baseline: dump the entire codebase + all specs/knowledge. Task-independent. */
export function assembleFullDump(contents: Map<string, string>): string {
  return [...contents.entries()].map(([f, c]) => fileSection(f, c)).join('\n');
}

/**
 * Baseline: naive selective context — deterministic keyword ranking over
 * file paths AND contents, top files until the token budget is reached.
 * The budget counts the full emitted section (header included).
 */
export function assembleNaiveRag(contents: Map<string, string>, task: CorpusTask): string {
  const ranked = rankByRelevance(
    `${task.title} ${task.description}`,
    [...contents.entries()].map(([f, c]) => ({ id: f, text: `${f}\n${c}` })),
  );
  const sections = new Map([...contents.entries()].map(([f, c]) => [f, fileSection(f, c)]));
  const selected = selectWithinBudget(
    ranked.map((r) => ({ id: r.id, text: sections.get(r.id) ?? '' })),
    NAIVE_RAG_TOKEN_BUDGET,
  );
  if (selected.length === 0) {
    throw new AssemblyError(`naive-rag selected no files for task ${task.id}`);
  }
  return selected.map((f) => sections.get(f) ?? '').join('\n');
}

/**
 * prospec: layered progressive disclosure — L0 (_index + _conventions)
 * followed by L1 (related module READMEs), stable content first.
 */
export function assembleProspec(contents: Map<string, string>, task: CorpusTask): string {
  const knowledgeBase = 'prospec/ai-knowledge';
  const knowledgeFile = (relPath: string): string => {
    const content = contents.get(relPath);
    if (content === undefined) {
      throw new AssemblyError(`Referenced file does not exist: ${relPath}`);
    }
    return fileSection(relPath, content);
  };

  const sections = [
    knowledgeFile(`${knowledgeBase}/_conventions.md`),
    knowledgeFile(`${knowledgeBase}/_index.md`),
  ];
  for (const moduleName of [...task.modules].sort()) {
    sections.push(knowledgeFile(`${knowledgeBase}/modules/${moduleName}/README.md`));
  }
  return sections.join('\n');
}

/**
 * Assemble all three strategies for one task; throws AssemblyError on missing
 * refs. `fullDump` is passed in pre-built (task-independent). Each context is
 * prefixed with a task-unique header to keep cross-task cold calls genuinely
 * cold (see module doc).
 */
export function assembleAll(
  contents: Map<string, string>,
  task: CorpusTask,
  fullDump: string,
): Record<AssemblyStrategy, string> {
  const taskHeader = `=== measurement task: ${task.id} ===\n\n`;
  return {
    'full-dump': taskHeader + fullDump,
    'naive-rag': taskHeader + assembleNaiveRag(contents, task),
    prospec: taskHeader + assembleProspec(contents, task),
  };
}
