import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { ReviewFindingsInputSchema, type ReviewFinding } from '../types/station.js';
import { atomicWrite, readFileIfExists } from '../lib/fs-utils.js';
import {
  parseReviewRows,
  mergeFindings,
  roundCounts,
  renderReviewDocument,
  type ReviewRoundCounts,
} from '../lib/review-merge.js';
import { resolveChange } from './change-resolver.js';

export interface ReviewMergeOptions {
  /** Explicit change name; resolved interactively when omitted. */
  change?: string;
  cwd?: string;
  quiet?: boolean;
  /** Path to this round's findings JSON (an array of findings). */
  findingsPath: string;
}

export interface ReviewMergeResult {
  changeName: string;
  reviewPath: string;
  /** Cumulative table size after the merge. */
  totalRows: number;
  /** This ROUND's structured counts — the `change log` review fields. */
  round: ReviewRoundCounts;
}

/**
 * `prospec review merge` — deterministic bookkeeping for the cumulative
 * review.md table. The reviewer supplies the round's findings as JSON (their
 * judgment, including cross-round identity via `id`); the merge, severity max,
 * carry-forward, and rendering are mechanical (lib/review-merge).
 */
export async function execute(options: ReviewMergeOptions): Promise<ReviewMergeResult> {
  const cwd = options.cwd ?? process.cwd();
  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Which change does this review round belong to?',
  );

  if (!fs.existsSync(options.findingsPath)) {
    throw new PrerequisiteError(
      `Findings file not found: ${options.findingsPath}`,
      'Write this round\'s findings as a JSON array and pass its path via --findings',
    );
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(fs.readFileSync(options.findingsPath, 'utf-8'));
  } catch {
    throw new PrerequisiteError(
      `Findings file is not valid JSON: ${options.findingsPath}`,
      'Emit the findings as a JSON array of {id?, location, severity, lens, status?, summary}',
    );
  }
  const parsed = ReviewFindingsInputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new PrerequisiteError(
      `Findings failed validation: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      'Each finding needs location, severity (minor|major|critical), lens, and summary',
    );
  }
  const findings: ReviewFinding[] = parsed.data;

  const reviewPath = path.join(cwd, '.prospec', 'changes', changeName, 'review.md');
  const existingContent = await readFileIfExists(reviewPath);
  const merged = mergeFindings(parseReviewRows(existingContent), findings);
  await atomicWrite(reviewPath, renderReviewDocument(existingContent, merged, changeName));

  return {
    changeName,
    reviewPath: path.join('.prospec', 'changes', changeName, 'review.md'),
    totalRows: merged.length,
    round: roundCounts(findings),
  };
}
