import { probeGitWorkTree } from '../lib/git-prerequisite.js';
import { PrerequisiteError } from '../types/errors.js';

/**
 * Refuse unless `cwd` is inside a git work tree — the CLI entry check every
 * non-exempt command runs before its action (REQ-SETUP-025).
 */
export function requireGitWorkTree(cwd: string): void {
  const probe = probeGitWorkTree(cwd);
  switch (probe.state) {
    case 'work-tree':
      return;
    case 'git-missing':
      throw new PrerequisiteError(
        'git was not found on PATH',
        'Install git and make sure it is on PATH, then re-run the command',
      );
    case 'not-work-tree':
      throw new PrerequisiteError(
        `${cwd} is not inside a git work tree${probe.detail === null ? '' : ` (${probe.detail})`}`,
        'Run `git init` in the project root and commit the existing project files, or fix the error git reported, then re-run the command',
      );
    case 'git-failed':
      throw new PrerequisiteError(
        `git cannot run (${probe.detail})`,
        'Repair the git installation until `git --version` succeeds, then re-run the command',
      );
  }
}
