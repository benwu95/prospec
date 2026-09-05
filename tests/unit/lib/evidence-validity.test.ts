import { describe, it, expect } from 'vitest';
import { evaluateReviewProvenance, evaluateTestProvenance } from '../../../src/lib/drift-checker.js';
import type { ReviewProvenanceSource, TestProvenanceSource } from '../../../src/lib/drift-sources.js';
const change = { name: 'x', source_path: 'x/metadata.yaml', status: 'verified', scale: 'full', recorded_digest: 'same', backfill_draft_present: false, version_supported: true };
const review = (over = {}) => ({ available: true, current_digest: 'same', working_tree_clean: true, changes: [{ ...change, ...over }] }) satisfies ReviewProvenanceSource;
const test = (over = {}) => ({ ...review(), command_unavailable_reason: null, changes: [{ ...change, recorded_exit_code: 0, recorded_command: 'test', attempt_matches: true, ...over }] }) satisfies TestProvenanceSource;
describe('evidence validity', () => {
  it('requires recognized versions even when a legacy digest happens to match', () => {
    expect(evaluateReviewProvenance(review({ version_supported: false })).result.status).toBe('fail');
    expect(evaluateTestProvenance(test({ version_supported: false })).result.status).toBe('fail');
  });
  it.each(['running', 'failed', 'unprovable', 'timeout'])('does not restore an older PASS after %s', (outcome) => {
    expect(evaluateTestProvenance(test({ attempt_matches: false, attempt_outcome: outcome })).result.status).toBe('fail');
  });
  it('skips an unavailable attempt with its actual reason without restoring older PASS (V-265-1)', () => {
    const result = evaluateTestProvenance(test({ attempt_matches: false, attempt_outcome: 'unavailable', attempt_command: 'missing-test', attempt_reason: 'spawn ENOENT' }));
    expect(result.result).toMatchObject({ status: 'skipped', reason: expect.stringContaining('spawn ENOENT') });
    expect(result.result.reason).toContain('missing-test');
    expect(result.findings).toEqual([]);
  });
  it('reports actual uncertified attempt diagnostics (V-265-2)', () => {
    const result = evaluateTestProvenance(test({ attempt_matches: false, attempt_outcome: 'timeout', attempt_command: 'node test.js', attempt_reason: 'timed out after 10 ms', attempt_signal: 'SIGKILL' }));
    expect(result.result.status).toBe('fail');
    expect(result.findings[0]?.detail).toContain('node test.js');
    expect(result.findings[0]?.detail).toContain('timed out after 10 ms');
    expect(result.findings[0]?.detail).toContain('SIGKILL');
    expect(result.findings[0]?.detail).not.toContain('exited 0');
  });
  it('keeps durable failure before command-unavailable and backfill skips', () => {
    const source = test({ recorded_exit_code: 1, attempt_outcome: 'unavailable', scale: 'backfill', backfill_draft_present: true });
    expect(evaluateTestProvenance({ ...source, command_unavailable_reason: 'missing command' }).result.status).toBe('fail');
  });
  it('does not infer an earlier review from a clean committed mutation', () => {
    const result = evaluateReviewProvenance({ ...review(), current_digest: 'changed' });
    expect(result.result.status).toBe('fail');
    expect(result.findings[0]?.detail).not.toContain('predates');
    expect(result.findings[0]?.detail).toContain('re-run prospec-review');
  });
});
