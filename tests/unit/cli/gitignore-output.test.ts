import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatGitignoreStatus, writeGitignoreWarnings } from '../../../src/cli/formatters/gitignore-output.js';
import { formatInitOutput } from '../../../src/cli/formatters/init-output.js';
import { formatAgentSyncOutput } from '../../../src/cli/formatters/agent-sync-output.js';
import { formatQuickstartOutput } from '../../../src/cli/formatters/quickstart-output.js';
import { formatUpgradeOutput } from '../../../src/cli/formatters/upgrade-output.js';
import type { InitResult, TechStackResult } from '../../../src/services/init.service.js';
import type { AgentSyncFullResult } from '../../../src/services/agent-sync.service.js';
import type { GitignoreBlockResult } from '../../../src/types/gitignore-block.js';
import type { LogLevel } from '../../../src/types/config.js';

function captureStreams() {
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  return {
    stdout: () => out.mock.calls.map((c) => String(c[0])).join(''),
    stderr: () => err.mock.calls.map((c) => String(c[0])).join(''),
  };
}

afterEach(() => vi.restoreAllMocks());

const sync = (gitignore?: GitignoreBlockResult): AgentSyncFullResult => ({
  agents: [], totalFiles: 0, warnings: [], hints: [], ...(gitignore ? { gitignore } : {}),
});

const FORMATTERS: Array<[string, (g: GitignoreBlockResult, level: LogLevel) => void]> = [
  ['init', (gitignore, level) => formatInitOutput({
    projectName: 'demo', techStack: {} as TechStackResult, agentInfos: [], selectedAgents: [],
    artifactLanguage: 'English', trustZoneLanguage: 'English', createdFiles: [], gitignore,
  } satisfies InitResult, level)],
  ['agent sync', (gitignore, level) => formatAgentSyncOutput(sync(gitignore), level)],
  ['quickstart', (gitignore, level) => formatQuickstartOutput({ steps: [], agentSync: sync(), gitignore, nextStep: 'prospec-quickstart' }, level)],
  ['upgrade', (gitignore, level) => formatUpgradeOutput({
    report: { versionFrom: '0.1.0', versionTo: '0.2.0', missingTriggers: [], nudges: [], docs: [], createdDocs: [], staleLanguagePolicy: false },
    agentSync: sync(gitignore), nextStep: '/prospec-upgrade', resolvedNudges: [], rawScanRefreshed: true,
  }, level)],
];

describe('formatGitignoreStatus (REQ-CLI-063)', () => {
  it('names the file and the block purpose for created and updated, and nothing otherwise', () => {
    expect(formatGitignoreStatus({ status: 'created', warnings: [], suggestedLines: [] })).toMatch(/Created \.gitignore \(prospec block: ignores local artifacts, re-includes prospec skills\)$/);
    expect(formatGitignoreStatus({ status: 'updated', warnings: [], suggestedLines: [] })).toMatch(/Updated \.gitignore \(prospec block/);
    expect(formatGitignoreStatus({ status: 'unchanged', warnings: [], suggestedLines: [] })).toBeUndefined();
    expect(formatGitignoreStatus({ status: 'skipped', warnings: ['x'], suggestedLines: [] })).toBeUndefined();
    expect(formatGitignoreStatus(undefined)).toBeUndefined();
  });

  it('writes each warning to stderr, sanitized', () => {
    const s = captureStreams();
    writeGitignoreWarnings({ status: 'skipped', warnings: ['bad\u001b[31m path'], suggestedLines: [] });
    expect(s.stderr()).toContain('bad');
    expect(s.stderr()).not.toContain('\u001b[31m');
    expect(s.stderr()).not.toContain('Add these lines');
  });

  it('writes the suggested lines after one instruction line, in order, sanitized and unindented so they paste as they are', () => {
    const s = captureStreams();
    writeGitignoreWarnings({ status: 'updated', warnings: ['w'], suggestedLines: ['!/.claude/', '/.claude/*', '!/x\u001b[31m'] });
    const lines = s.stderr().split('\n');
    const at = lines.findIndex((l) => l.includes('Add these lines at the end of .gitignore'));
    expect(at).toBeGreaterThan(lines.findIndex((l) => l.includes(' w')));
    expect(lines.slice(at + 1, at + 4)).toEqual(['!/.claude/', '/.claude/*', '!/x[31m']);
  });
});

describe.each(FORMATTERS)('%s output', (_name, format) => {
  it.each([['created', 'Created .gitignore'], ['updated', 'Updated .gitignore']] as const)('prints the %s line', (status, line) => {
    const s = captureStreams();
    format({ status, warnings: [], suggestedLines: [] }, 'normal');
    expect(s.stdout()).toContain(line);
  });

  it('prints no .gitignore line when the block is unchanged or skipped', () => {
    const s = captureStreams();
    format({ status: 'unchanged', warnings: [], suggestedLines: [] }, 'normal');
    format({ status: 'skipped', warnings: [], suggestedLines: [] }, 'normal');
    expect(s.stdout()).not.toContain('.gitignore');
  });

  it('keeps the status line out of quiet mode but still writes warnings and suggested lines to stderr', () => {
    const s = captureStreams();
    format({ status: 'created', warnings: ['still ignored'], suggestedLines: ['!/.claude/'] }, 'quiet');
    expect(s.stdout()).not.toContain('.gitignore');
    expect(s.stderr()).toContain('still ignored');
    expect(s.stderr().split('\n')).toContain('!/.claude/');
  });
});
