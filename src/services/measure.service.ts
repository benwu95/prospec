import * as fs from 'node:fs';
import * as path from 'node:path';
import { ZodError, type ZodType } from 'zod';
import { MeasurementReportInvalid, PrerequisiteError } from '../types/errors.js';
import {
  DEFAULT_REPORT_FILENAME,
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

/**
 * Execute the measure workflow — read-only:
 *
 * 1. Locate measurement-report.json (produced by `pnpm measure:tokens`)
 * 2. Validate it against MeasurementReportSchema
 * 3. Return the parsed report for display
 *
 * Never calls any provider API and never burns tokens.
 */
export async function execute(options: MeasureOptions): Promise<MeasureResult> {
  const cwd = options.cwd ?? process.cwd();
  const relPath = options.reportPath ?? DEFAULT_REPORT_FILENAME;
  const { reportPath, data } = loadReport(
    cwd,
    relPath,
    MeasurementReportSchema,
    'Run `pnpm measure:tokens` first to generate the report (requires a provider API key)',
  );
  return { reportPath, report: data };
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
