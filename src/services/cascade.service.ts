import type { TastemakerPresentation } from '../types/cascade.js';

/**
 * Tastemaker delivery helpers for autonomous cascading. Station transitions are
 * NOT evaluated here: `prospec status` (`lib/status-router`) is the single
 * transition authority the cascade consults at every Step 5 [NEXT].
 */

export interface TastemakerSummaryOptions {
  changeName: string;
  verifyGrade: 'S' | 'A';
  gitDiffSummary: string;
  deltaSpecSummary: string;
}

/**
 * Generate Tastemaker presentation summary upon reaching Grade S/A.
 */
export function generateTastemakerSummary(
  options: TastemakerSummaryOptions,
): TastemakerPresentation {
  return {
    changeName: options.changeName,
    verifyGrade: options.verifyGrade,
    gitDiffSummary: options.gitDiffSummary,
    deltaSpecSummary: options.deltaSpecSummary,
    verifiedAt: new Date().toISOString(),
    nextStep: 'human_signoff',
  };
}

/**
 * Format Tastemaker presentation as clean Markdown report.
 */
export function formatTastemakerPresentation(
  presentation: TastemakerPresentation,
): string {
  return [
    `# Tastemaker Delivery Review: ${presentation.changeName}`,
    '',
    `> **Verify Quality Grade:** **${presentation.verifyGrade}** (Graduation Criteria Met)`,
    `> **Verified At:** ${presentation.verifiedAt}`,
    '',
    '## Delta-Spec Summary',
    presentation.deltaSpecSummary,
    '',
    '## Git Diff Summary',
    presentation.gitDiffSummary,
    '',
    '---',
    '### Tastemaker Action Required',
    'Autonomous cascading has halted successfully for human sign-off.',
    '- Please review the working tree changes and verify findings.',
    '- To accept and commit, proceed with standard atomic git commit.',
    '- To archive the change, run `prospec-archive`.',
  ].join('\n');
}
