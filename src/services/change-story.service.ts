import * as fs from 'node:fs';
import * as path from 'node:path';
import { AlreadyExistsError } from '../types/errors.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { ensureDir, atomicWrite } from '../lib/fs-utils.js';
import { renderTemplate } from '../lib/template.js';
import { stringifyYaml } from '../lib/yaml-utils.js';
import { INDEX_COLUMN, INDEX_TABLE_COLUMNS } from '../types/knowledge.js';

export interface ChangeStoryOptions {
  name: string;
  description?: string;
  cwd?: string;
}

export interface RelatedModule {
  name: string;
  description: string;
}

export interface ChangeStoryResult {
  changeName: string;
  changeDir: string;
  createdFiles: string[];
  relatedModules: RelatedModule[];
  description?: string;
}

/**
 * Execute the change story workflow:
 *
 * 1. Read config to get knowledge base path
 * 2. Validate change directory does not exist → AlreadyExistsError
 * 3. Match related modules from _index.md keywords
 * 4. Render proposal.md and metadata.yaml templates
 * 5. Write files to .prospec/changes/{name}/
 */
export async function execute(options: ChangeStoryOptions): Promise<ChangeStoryResult> {
  const cwd = options.cwd ?? process.cwd();
  const changeName = options.name;

  // 1. Read config
  const config = await readConfig(cwd);
  const { knowledgePath } = resolveBasePaths(config, cwd);
  const knowledgeBasePath = path.relative(cwd, knowledgePath);

  // 2. Validate change directory does not exist
  const changeDir = path.join(cwd, '.prospec', 'changes', changeName);
  if (fs.existsSync(changeDir)) {
    throw new AlreadyExistsError(`.prospec/changes/${changeName}`);
  }

  // 3. Match related modules from _index.md
  const relatedModules = matchRelatedModules(changeName, knowledgeBasePath, cwd);

  // 4. Create change directory
  await ensureDir(changeDir);

  // 5. Write artifacts — proposal.md renders from its Markdown template;
  // metadata.yaml is pure data, serialized with the yaml library (the same
  // path change-plan/change-tasks/archive already use to update it), so any
  // user-provided text is escaped correctly by construction.
  const proposalContext = {
    change_name: changeName,
    description: options.description,
    related_modules: relatedModules.length > 0 ? relatedModules : undefined,
  };

  const createdFiles: string[] = [];

  // proposal.md
  const proposalContent = renderTemplate('change/proposal.md.hbs', proposalContext);
  const proposalPath = path.join(changeDir, 'proposal.md');
  await atomicWrite(proposalPath, proposalContent);
  createdFiles.push(`.prospec/changes/${changeName}/proposal.md`);

  // metadata.yaml
  const metadata = {
    name: changeName,
    created_at: new Date().toISOString(),
    status: 'story',
    ...(relatedModules.length > 0
      ? { related_modules: relatedModules.map((m) => m.name) }
      : {}),
    ...(options.description ? { description: options.description } : {}),
  };
  const metadataPath = path.join(changeDir, 'metadata.yaml');
  await atomicWrite(metadataPath, stringifyYaml(metadata));
  createdFiles.push(`.prospec/changes/${changeName}/metadata.yaml`);

  return {
    changeName,
    changeDir,
    createdFiles,
    relatedModules,
    description: options.description,
  };
}

/**
 * Match related modules by comparing change name keywords against _index.md.
 *
 * Reads the _index.md Markdown table and matches keywords from module entries
 * against words extracted from the kebab-case change name.
 */
function matchRelatedModules(
  changeName: string,
  knowledgeBasePath: string,
  cwd: string,
): RelatedModule[] {
  const indexPath = path.join(cwd, knowledgeBasePath, '_index.md');

  let indexContent: string;
  try {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  } catch {
    // No _index.md — return empty (not an error, just no modules to match)
    return [];
  }

  // Extract words from kebab-case change name
  const changeWords = changeName
    .toLowerCase()
    .split('-')
    .filter((w) => w.length > 1);

  if (changeWords.length === 0) return [];

  // Parse _index.md table rows against the canonical column schema
  // (types/knowledge.ts): | Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
  const lines = indexContent.split('\n');
  const modules: RelatedModule[] = [];

  for (const line of lines) {
    if (!line.startsWith('|')) continue;

    // Position-stable cells: drop only the boundary empties from the surrounding
    // pipes; keep empty middle cells so column indices stay aligned. Rows with
    // fewer columns than the canonical schema (e.g. the Loading Rules table) are
    // not module rows — skip them.
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());

    // Skip header/separator rows by their ROW ROLE, not a whole-line substring:
    // the separator row is all dash/colon cells; the header row's first cell is
    // the literal 'Module' label. A data row whose Description contains '---'
    // must NOT be mistaken for a separator (it was, under the old includes check).
    if (cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (cells[INDEX_COLUMN.MODULE]?.toLowerCase() === 'module') continue;

    if (cells.length < INDEX_TABLE_COLUMNS.length) continue;

    const moduleName = cells[INDEX_COLUMN.MODULE] ?? '';
    if (!moduleName) continue;
    const keywordsCell = cells[INDEX_COLUMN.KEYWORDS];
    if (!keywordsCell) continue;
    // Drop empty keywords from stray/double commas — an empty keyword makes
    // `word.includes(keyword)` true for every change, matching every module.
    const keywords = keywordsCell
      .toLowerCase()
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    const description = cells[INDEX_COLUMN.DESCRIPTION] ?? '';

    // Check if any change word matches any module keyword
    const isMatch = changeWords.some((word) =>
      keywords.some((keyword) => keyword.includes(word) || word.includes(keyword)),
    );

    if (isMatch) {
      modules.push({ name: moduleName, description });
    }
  }

  return modules;
}
