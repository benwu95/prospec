import type { ChangeScale } from './change.js';
import type { DriftFinding } from './drift-report.js';

/**
 * Options for auto-drafting fix changes from drift findings or explicit targets.
 */
export interface AutoDraftOptions {
  cwd?: string;
  /** Path to a prospec-report.json file to parse findings from. */
  fromReport?: string;
  /** Direct list of drift findings to draft fixes for. */
  findings?: DriftFinding[];
  /** Explicit target module or identifier when drafting manually. */
  target?: string;
  /** Explicit reason or description when drafting manually. */
  reason?: string;
  /** Associated drift check ID (e.g. 'knowledge-size', 'import-direction'). */
  checkId?: string;
  /** Override default scale (defaults to 'quick' or 'standard' depending on finding). */
  scale?: ChangeScale;
  /** If true, simulate drafting without writing files to disk. */
  dryRun?: boolean;
  /** Associated issue / tracker reference (e.g. '#185'). */
  issue?: string;
}

export interface DraftedChange {
  /** The derived change name (e.g. 'fix-types-import-direction'). */
  name: string;
  /** Relative path to the change directory (e.g. '.prospec/changes/fix-types-import-direction'). */
  changeDir: string;
  /** The affected module or target subject. */
  target: string;
  /** The drift check ID that triggered this fix. */
  checkId: string;
  /** The assigned scale for this change. */
  scale: ChangeScale;
  /** Every DISTINCT remedy the group's findings reported. A merged group whose
   *  findings converge differently must not present one of them as the fix. */
  remedies: string[];
  /** What happened to this group. `failed` is reported, never thrown: one
   *  group's write failure must not discard the groups already written. */
  action: 'created' | 'skipped' | 'failed';
  /** Why it was skipped, or the error when it failed. */
  skipReason?: string;
}

export interface AutoDraftResult {
  /** The list of processed fix changes. */
  changes: DraftedChange[];
  /** Count of newly created change scaffolds — under `dryRun`, of scaffolds
   *  that WOULD be created. */
  createdCount: number;
  /** Count of skipped change scaffolds (idempotency guard). */
  skippedCount: number;
  /** Count of groups whose scaffold could not be written. */
  failedCount: number;
  /** Whether this run was a dry run. */
  dryRun: boolean;
}
