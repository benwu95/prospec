import { afterEach, expect, it, vi } from 'vitest';
import { formatHistoryPathsOutput, formatHistoryImportOutput } from '../../../src/cli/formatters/history-output.js';
import type { HistoryPaths } from '../../../src/types/history.js';
const paths: HistoryPaths = { sourceProjectRoot: '/source\u0007', historyProjectRoot: '/main', archiveRoot: '/main/archive', abandonedRoot: '/main/abandoned', operationsRoot: '/main/operations', commonDir: null, worktree: '/source', projectPrefix: '' };
afterEach(() => vi.restoreAllMocks());
it('sanitizes every human path and diagnostic', () => {
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  formatHistoryPathsOutput({ paths, diagnostics: [{ path: '/path\u0007', reason: 'reason\u0007' }] });
  expect(out.mock.calls.flat().join('')).toContain('/source'); expect(out.mock.calls.flat().join('')).not.toContain('\u0007');
  expect(err.mock.calls.flat().join('')).toContain('reason'); expect(err.mock.calls.flat().join('')).not.toContain('\u0007');
});
it('keeps quiet successes silent and failures visible with sanitized entry fields', () => {
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const entry = { kind: 'archive' as const, identity: 'id\u0007', source: '/source\u0007', destination: '/target\u0007' };
  formatHistoryImportOutput({ paths, dryRun: true, entries: [{ ...entry, outcome: 'identical' }, { ...entry, outcome: 'failed', reason: 'cause\u0007' }] }, 'quiet');
  expect(out).not.toHaveBeenCalled(); expect(err.mock.calls.flat().join('')).toContain('failed archive/id'); expect(err.mock.calls.flat().join('')).not.toContain('\u0007');
});

it('renders every retained recovery location on quiet partial failures', () => {
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const details = { phase: 'complete' as const, sourceDir: '/source\u0007', stagingDir: '/stage\u0007', finalDir: '/final\u0007', operationPath: '/journal\u0007' };
  formatHistoryImportOutput({ paths, dryRun: false, entries: [{ kind: 'archive', identity: 'old', source: details.sourceDir, destination: details.finalDir, outcome: 'failed', details, reason: `complete: ${details.sourceDir}, ${details.stagingDir}, ${details.finalDir}, ${details.operationPath}` }] }, 'quiet');
  const text = err.mock.calls.flat().join('');
  for (const location of ['/source', '/stage', '/final', '/journal']) expect(text).toContain(location);
  expect(out).not.toHaveBeenCalled(); expect(text).toContain('complete'); expect(text).not.toContain('\u0007');
});
