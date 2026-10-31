/**
 * Result contract of the CLI entry's git work-tree probe (REQ-SETUP-025): each
 * refusal state names a different remedy, so the probe keeps them apart.
 */
export type GitWorkTreeProbe =
  | { state: 'work-tree' }
  | { state: 'git-missing' }
  /** `detail` is the failure's first error line, or `null` when git ran cleanly and answered "not inside". */
  | { state: 'not-work-tree'; detail: string | null }
  | { state: 'git-failed'; detail: string };
