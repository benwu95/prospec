import * as fs from 'node:fs';
import * as path from 'node:path';
import { ZodError, type ZodType } from 'zod';
import { MeasurementReportInvalid, PrerequisiteError } from '../types/errors.js';
import {
  
  DEFAULT_SIZE_REPORT_FILENAME,
  MeasurementReportSchema,
  SizeReportSchema,
  ProjectionReportSchema,
  PROJECT_WORKFLOW_SCALES,
  type MeasurementReport,
  type SizeReport,
  type ProjectionReport,
  type ProjectWorkflowScale,
} from '../types/measurement.js';
import { readChangeMetadata } from '../lib/change-metadata.js';
import { estimateTokens } from '../lib/token-accounting.js';
import { forbiddenArtifacts } from '../types/change.js';

export interface MeasureOptions {
  cwd?: string;
  /** Report file path, relative to cwd (default: measurement-report.json). */
  reportPath?: string;
  projectWorkflow?: boolean | string;
  change?: string;
}

export interface MeasureResult {
  reportPath: string;
  report: MeasurementReport;
}

export interface SizeMeasureResult {
  reportPath: string;
  sizeReport: SizeReport;
}

/** Read + JSON-parse + schema-validate a report file, shared by both modes.
 *  Missing file → PrerequisiteError with a mode-specific hint; malformed JSON or
 *  schema mismatch → MeasurementReportInvalid. */
function loadReport<T>(
  cwd: string,
  relPath: string,
  schema: ZodType<T>,
  missingHint: string,
): { reportPath: string; data: T } {
  const reportPath = path.resolve(cwd, relPath);

  if (!fs.existsSync(reportPath)) {
    throw new PrerequisiteError(`Measurement report not found: ${relPath}`, missingHint);
  }

  const raw = fs.readFileSync(reportPath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new MeasurementReportInvalid(relPath, err instanceof Error ? err.message : 'invalid JSON');
  }

  try {
    return { reportPath, data: schema.parse(parsed) };
  } catch (err) {
    const details =
      err instanceof ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : String(err);
    throw new MeasurementReportInvalid(relPath, details);
  }
}

import { parseLocalLogs, calculateTheoreticalBaseline } from '../lib/token-accounting.js';
import type { LocalLogSources } from '../lib/token-accounting.js';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function walkDir(dir: string, fileSuffix: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const list = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const item of list) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        results.push(...await walkDir(fullPath, fileSuffix));
      } else if (item.isFile() && item.name.endsWith(fileSuffix)) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') throw err;
  }
  return results;
}

export async function loadLocalLogs(homeDir: string = process.env.PROSPEC_MOCK_HOME || os.homedir()): Promise<LocalLogSources> {
  const sources: LocalLogSources = {};
  
  const agyBrainDir = path.join(homeDir, '.gemini', 'antigravity-cli', 'brain');
  sources.antigravity = [];
  try {
    const dirs = await fs.promises.readdir(agyBrainDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const transcriptPath = path.join(agyBrainDir, d.name, '.system_generated', 'logs', 'transcript.jsonl');
      const content = await safeReadFile(transcriptPath);
      if (content) {
        sources.antigravity.push({ logContent: content, sessionId: d.name, modelName: 'antigravity-session' });
      }
    }
  } catch { /* ignore */ }
  
  const claudeDir = path.join(homeDir, '.claude', 'projects');
  const claudeFiles = await walkDir(claudeDir, '.jsonl');
  if (claudeFiles.length > 0) {
    sources.claude = [];
    for (const f of claudeFiles) {
      const content = await safeReadFile(f);
      if (content) sources.claude.push({ sessionId: path.basename(f, '.jsonl'), content });
    }
  }
  
  const codexDirs = [path.join(homeDir, '.codex', 'sessions'), path.join(homeDir, '.codex', 'archived_sessions')];
  sources.codex = [];
  for (const cDir of codexDirs) {
    const cFiles = await walkDir(cDir, '.jsonl');
    for (const f of cFiles) {
      const content = await safeReadFile(f);
      if (content) sources.codex.push({ sessionId: path.basename(f, '.jsonl'), content });
    }
  }
  
  const copilotDir = path.join(homeDir, '.copilot', 'otel');
  const copilotFiles = await walkDir(copilotDir, '.jsonl');
  if (copilotFiles.length > 0) {
    sources.copilot = [];
    for (const f of copilotFiles) {
      const content = await safeReadFile(f);
      if (content) sources.copilot.push({ filename: f, content });
    }
  }
  
  return sources;
}

async function calculateCodebaseBaselineTokens(cwd: string): Promise<number> {
  const validExts = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.yaml', '.yml', 
    '.py', '.go', '.rs', '.cpp', '.h', '.c', '.java', '.cs', '.php', '.rb',
    '.swift', '.kt', '.html', '.css', '.scss', '.sql', '.sh'
  ]);
  
  let files: string[] = [];
  try {
    const { stdout } = await execFileAsync('git', ['ls-files', '-co', '--exclude-standard'], { cwd, maxBuffer: 10 * 1024 * 1024 });
    files = stdout.split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0 && validExts.has(path.extname(f).toLowerCase()))
      .map(f => path.join(cwd, f));
  } catch {
    // Fallback if not a git repo or git is not installed
    const tsFiles = await walkDir(path.join(cwd, 'src'), '.ts');
    const mdFiles = await walkDir(path.join(cwd, 'prospec'), '.md');
    files = [...tsFiles, ...mdFiles];
  }
  
  const contents: string[] = [];
  for (const f of files) {
    const c = await safeReadFile(f);
    if (c) contents.push(c);
  }
  return calculateTheoreticalBaseline(contents);
}

export async function execute(options: MeasureOptions): Promise<MeasureResult> {
  const cwd = options.cwd ?? process.cwd();
  
  const logs = await loadLocalLogs();
  const entries = parseLocalLogs(logs);
  const baselinePerTurn = await calculateCodebaseBaselineTokens(cwd);
  
  const defaultPricing = { input_usd_per_mtok: 0, output_usd_per_mtok: 0, cache_read_multiplier: 0, cache_write_multiplier: 0 };
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runsMap = new Map<string, any>();
  for (const entry of entries) {
    if (!runsMap.has(entry.source)) {
      runsMap.set(entry.source, {
        provider: entry.source === 'claude' ? 'anthropic' : entry.source === 'antigravity' ? 'google' : 'openai',
        source: entry.source,
        model: 'local-session',
        pricing: defaultPricing,
        aborted: false,
        spent_usd: 0,
        tasks: [],
        summary: {
          measured_tasks: 0,
          skipped_tasks: 0,
          failed_tasks: 0,
          prospec_cache_hit_rate: 0,
          comparisons: [{
            baseline: 'full-dump',
            baseline_input_cold: 0,
            prospec_input_cold: 0,
            input_saving_ratio: 0,
            baseline_output: 0,
            prospec_output: 0,
            baseline_effective_cost_usd: 0,
            prospec_effective_cost_usd: 0,
            effective_cost_saving_ratio: 0
          }]
        }
      });
    }
    const run = runsMap.get(entry.source);
    run.summary.measured_tasks += 1;
    const comp = run.summary.comparisons[0];
    comp.baseline_input_cold += baselinePerTurn;
    comp.prospec_input_cold += entry.rawInput;
    comp.baseline_output += entry.output;
    comp.prospec_output += entry.output;
  }
  
  const runs = Array.from(runsMap.values()).map(run => {
    const comp = run.summary.comparisons[0];
    if (comp.baseline_input_cold > 0) {
      comp.input_saving_ratio = (comp.baseline_input_cold - comp.prospec_input_cold) / comp.baseline_input_cold;
    }
    return run;
  });
  
  if (runs.length === 0) {
    throw new PrerequisiteError('No local logs found', 'Use an AI CLI to generate some logs first');
  }

  const report: MeasurementReport = {
    corpus: 'local-session',
    git_commit: 'HEAD',
    generated_at: new Date().toISOString(),
    runs
  };
  
  return { reportPath: 'local-report', report: MeasurementReportSchema.parse(report) };
}

/**
 * Execute the offline measure workflow — read-only, keyless:
 * validates a size-report.json (produced by `pnpm measure:tokens --offline`)
 * against SizeReportSchema and returns it for display. Size-only: no cache/cost.
 */
export async function executeOffline(options: MeasureOptions): Promise<SizeMeasureResult> {
  const cwd = options.cwd ?? process.cwd();
  const relPath = options.reportPath ?? DEFAULT_SIZE_REPORT_FILENAME;
  const { reportPath, data } = loadReport(
    cwd,
    relPath,
    SizeReportSchema,
    'Run `pnpm measure:tokens --offline` first to generate a keyless size estimate',
  );
  return { reportPath, sizeReport: data };
}

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return null;
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT' || e.code === 'EISDIR') return null;
    throw err;
  }
}

export async function executeProjection(options: MeasureOptions): Promise<ProjectionReport> {
  const cwd = options.cwd ?? process.cwd();

  const changeName = options.change;
  if (!changeName) {
    throw new Error('changeName is required for executeProjection');
  }

  const metadataPath = path.join(cwd, '.prospec', 'changes', changeName, 'metadata.yaml');
  let scale: ProjectWorkflowScale = 'standard';
  let relatedModules: string[] = [];
  if (fs.existsSync(metadataPath)) {
    const { metadata } = readChangeMetadata(metadataPath, changeName);
    if (metadata.scale) {
      scale = metadata.scale as ProjectWorkflowScale;
    }
    if (metadata.related_modules) {
      relatedModules = metadata.related_modules;
    }
  }

  if (typeof options.projectWorkflow === 'string' && options.projectWorkflow !== '') {
    if (!PROJECT_WORKFLOW_SCALES.includes(options.projectWorkflow as ProjectWorkflowScale)) {
      throw new Error(`Invalid project workflow scale: ${options.projectWorkflow}. Expected one of: ${PROJECT_WORKFLOW_SCALES.join(', ')}`);
    }
    scale = options.projectWorkflow as ProjectWorkflowScale;
  }

  let l1Tokens = 0;
  let l1Count = 0;
  const l1Files = ['prospec/index.md', 'prospec/ai-knowledge/_conventions.md', 'prospec/CONSTITUTION.md'];
  for (const file of l1Files) {
    const fullPath = path.join(cwd, file);
    const content = await safeReadFile(fullPath);
    if (content !== null) {
      l1Tokens += estimateTokens(content);
      l1Count += 1;
    }
  }

  let l2Tokens = 0;
  let l2Count = 0;
  for (const mod of relatedModules) {
    const readmePath = path.join(cwd, 'prospec', 'ai-knowledge', 'modules', path.basename(mod), 'README.md');
    const content = await safeReadFile(readmePath);
    if (content !== null) {
      l2Tokens += estimateTokens(content);
      l2Count += 1;
    }
  }

  let skillsTokens = 0;
  let skillsCount = 0;
  let refTokens = 0;
  let refCount = 0;

  let stationSkillNames: string[] = [];
  if (scale === 'backfill') {
    stationSkillNames = ['prospec-backfill-spec', 'prospec-promote-backfill', 'prospec-archive'];
  } else {
    stationSkillNames = ['prospec-new-story', 'prospec-plan', 'prospec-tasks', 'prospec-implement', 'prospec-review', 'prospec-verify', 'prospec-archive'];
  }

  const forbidden = forbiddenArtifacts(scale);
  if (forbidden.includes('plan.md')) {
    stationSkillNames = stationSkillNames.filter(name => name !== 'prospec-plan');
  }
  if (forbidden.includes('tasks.md')) {
    stationSkillNames = stationSkillNames.filter(name => name !== 'prospec-tasks');
  }

  for (const skillName of stationSkillNames) {
    const skillPath = path.join(cwd, '.agents', 'skills', skillName, 'SKILL.md');
    const skillContent = await safeReadFile(skillPath);
    if (skillContent !== null) {
      skillsTokens += estimateTokens(skillContent);
      skillsCount += 1;

      const refsDir = path.join(cwd, '.agents', 'skills', skillName, 'references');
      try {
        const stat = await fs.promises.stat(refsDir);
        if (stat.isDirectory()) {
          const refs = (await fs.promises.readdir(refsDir)).filter(f => f.endsWith('.md'));
          for (const ref of refs) {
            const refContent = await safeReadFile(path.join(refsDir, ref));
            if (refContent !== null) {
              refTokens += estimateTokens(refContent);
              refCount += 1;
            }
          }
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }
  }

  let specsTokens = 0;
  let specsCount = 0;
  const deltaSpecPath = path.join(cwd, '.prospec', 'changes', changeName, 'delta-spec.md');
  const deltaContent = forbidden.includes('delta-spec.md') ? null : await safeReadFile(deltaSpecPath);
  if (deltaContent !== null) {
    const featureMatches = deltaContent.match(/\*\*Feature\s*:?\s*\*\*\s*:?\s+([a-zA-Z0-9._/-]+)/g) || [];
    const features = new Set(featureMatches.map(m => m.replace(/\*\*Feature\s*:?\s*\*\*\s*:?\s+/, '').trim()));

    for (const feat of features) {
      if (feat.includes('..')) continue;
      const specPath = path.join(cwd, 'prospec', 'specs', 'features', `${feat}.md`);
      const specContent = await safeReadFile(specPath);
      if (specContent !== null) {
        specsTokens += estimateTokens(specContent);
        specsCount += 1;
      }
    }
  }

  const totalTokens = l1Tokens + l2Tokens + skillsTokens + refTokens + specsTokens;

  const result = {
    scale,
    l1: { tokens: l1Tokens, count: l1Count },
    l2: { tokens: l2Tokens, count: l2Count },
    skills: { tokens: skillsTokens, count: skillsCount },
    references: { tokens: refTokens, count: refCount },
    specs: { tokens: specsTokens, count: specsCount },
    total_tokens: totalTokens,
  };

  return ProjectionReportSchema.parse(result);
}
