/**
 * Result contract of the `.gitignore` managed-block writer (REQ-LIB-106), shared by
 * the services that run it and the CLI formatter that renders it.
 */

export const GITIGNORE_BLOCK_STATUSES = ['created', 'updated', 'unchanged', 'skipped'] as const;

export type GitignoreBlockStatus = (typeof GITIGNORE_BLOCK_STATUSES)[number];

export interface GitignoreBlockResult {
  status: GitignoreBlockStatus;
  /** Conditions the block cannot fix, or why the writer skipped — one line each. */
  warnings: string[];
  /** Lines for the end of `.gitignore` that would re-include still-ignored skills; never written. */
  suggestedLines: string[];
}
