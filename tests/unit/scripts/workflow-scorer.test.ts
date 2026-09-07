import { describe, expect, it } from 'vitest';
import { scoreRun } from '../../../scripts/workflow-eval/scorer.js';
import { OracleSchema, type EventInput, type ObservedRun } from '../../../scripts/workflow-eval/protocol.js';

const oracle = OracleSchema.parse({ version: 1, id: 'quick', routes: ['tasks', 'implement'],
  required_reads: ['proposal.md'], forbidden_reads: ['plan.md'], required_files: ['tasks.md'],
  forbidden_files: ['design.md'], forbidden_commands: ['archive', 'check --record-tests'],
  payloads: ['prospec-tasks'], suite_runs: 0, terminal: 'handoff' });
const events: EventInput[] = [
  { kind: 'attempt', action: { kind: 'route', station: 'tasks' } },
  { kind: 'route', station: 'tasks' },
  { kind: 'attempt', action: { kind: 'read', path: 'proposal.md' } },
  { kind: 'read', path: 'proposal.md', digest: 'hash', content: 'spec', category: 'other', station: 'tasks' },
  { kind: 'attempt', action: { kind: 'submit', schema: 'prospec-tasks', path: 'verifier.json' } },
  { kind: 'payload', schema: 'prospec-tasks', path: 'verifier.json', valid: true, errors: [], source: 'submission' },
  { kind: 'attempt', action: { kind: 'route', station: 'implement' } },
  { kind: 'route', station: 'implement' },
  { kind: 'attempt', action: { kind: 'finish', terminal: 'handoff', claims_pass: true, message: 'Done' } },
  { kind: 'finish', terminal: 'handoff', claims_pass: true, message: 'Done' },
];
function run(input: EventInput[] = events): ObservedRun {
  return { version: 1, identity: { scenario: 'quick', executor: 'fake', tier: 'cheaper', model: 'fake',
    variant: 'baseline', instruction_digest: 'i', runtime_revision: 'r', runner_digest: 'h',
    corpus_digest: 'c', oracle_digest: 'o', settings_digest: 's' }, source: 'synthetic',
  events: input.map((e, i) => ({ ...e, seq: i + 1 })), files: { 'tasks.md': 'Tasks' },
  duration_ms: 1, stop_reason: 'finished' };
}
describe('controller trace scoring', () => {
  it('accepts complete controller evidence', () => {
    expect(scoreRun(run(), oracle)).toMatchObject({ complete: true, failures: [], route_correct: 2,
      payload_first_pass: 1, false_pass: 0, forbidden_actions: 0 });
  });
  it.each(['read', 'payload', 'route', 'finish', 'attempt'])('rejects missing %s events', (kind) => {
    expect(scoreRun(run(events.filter((e) => e.kind !== kind)), oracle).complete).toBe(false);
  });
  it('counts a denied forbidden attempt once, even if no forbidden effect occurred', () => {
    const trace = run([{ kind: 'attempt', action: { kind: 'read', path: 'plan.md' } },
      { kind: 'denied', reason: 'Not applicable' }, ...events]);
    expect(scoreRun(trace, oracle)).toMatchObject({ complete: false, forbidden_actions: 1, false_pass: 1 });
  });
  it('records first submission failure even if a later valid retry completes', () => {
    const trace = run([{ kind: 'attempt', action: { kind: 'submit', schema: 'prospec-tasks', path: 'bad.json' } },
      { kind: 'payload', schema: 'prospec-tasks', path: 'bad.json', valid: false, errors: ['bad'], source: 'submission' }, ...events]);
    expect(scoreRun(trace, oracle)).toMatchObject({ complete: true, payload_first_pass: 0 });
  });
  it('refuses bad payloads, missing files and incorrect terminal claims', () => {
    const trace = run(events.map((e) => e.kind === 'payload' ? { ...e, valid: false } : e));
    trace.files = {};
    expect(scoreRun(trace, oracle)).toMatchObject({ complete: false, false_pass: 1, payload_first_pass: 0 });
    expect(scoreRun(run(), { ...oracle, terminal: 'stop' }).complete).toBe(false);
  });
  it('rejects extra/missing suites and failed suites', () => {
    const extra = run([{ kind: 'suite', exit_code: 0 }, ...events]);
    expect(scoreRun(extra, oracle)).toMatchObject({ complete: false, suite_runs: 1, unnecessary_test_runs: 1 });
    expect(scoreRun(run(), { ...oracle, suite_runs: 1 }).complete).toBe(false);
    expect(scoreRun(run([{ kind: 'suite', exit_code: 1 }, ...events]), { ...oracle, suite_runs: 1 }).complete).toBe(false);
  });
  it('counts forbidden commands regardless of option ordering and malformed proposals', () => {
    for (const action of [{ kind: 'cli', args: ['check', '--change', 'x', '--record-tests'] },
      { kind: 'write', path: 'design.md', content: 'forbidden' }, { kind: 'shell', command: 'anything' }]) {
      expect(scoreRun(run([{ kind: 'attempt', action }, ...events]), oracle).forbidden_actions).toBe(1);
    }
  });
  it('does not certify unavailable execution, wrong identities or corrupt event ordering', () => {
    expect(scoreRun({ ...run(), stop_reason: 'timeout' }, oracle).complete).toBe(false);
    expect(scoreRun(run(), { ...oracle, id: 'multi-change' }).complete).toBe(false);
    const trace = run();
    trace.events[0]!.seq = 50;
    expect(scoreRun(trace, oracle).complete).toBe(false);
  });
  it('requires observed pending then timeout and target-specific commands', () => {
    expect(scoreRun(run(), { ...oracle, required_signals: ['pending', 'timeout'] }).complete).toBe(false);
    expect(scoreRun(run(), { ...oracle, required_commands: [['check', '--change', 'y', '--json']] }).complete).toBe(false);
  });
  it('counts writes and recertification delegation as forbidden in read-only diagnostics', () => {
    for (const action of [{ kind: 'write', path: 'note.md', content: 'Changed' },
      { kind: 'delegate', schema: 'review', path: 'review.json', prompt: 'Review', reads: ['proposal.md'] }]) {
      expect(scoreRun(run([{ kind: 'attempt', action }, ...events]), { ...oracle, allow_writes: false, allow_delegation: false }).forbidden_actions).toBe(1);
    }
  });
  it('matches writes, CLI observations, delegation and independently recorded metadata', () => {
    const extra: EventInput[] = [
      { kind: 'attempt', action: { kind: 'write', path: 'tasks.md', content: 'Tasks' } },
      { kind: 'write', path: 'tasks.md', digest: 'h' },
      { kind: 'attempt', action: { kind: 'cli', args: ['status', '--json'] } },
      { kind: 'command', args: ['status', '--json'], exit_code: 0, output: '{}' },
      { kind: 'attempt', action: { kind: 'wait', delegation_id: 'v' } },
      { kind: 'delegation', delegation_id: 'v', state: 'pending' },
    ];
    const delegated = events.map((e): EventInput => {
      if (e.kind === 'attempt' && (e.action as { kind: string }).kind === 'submit') return { kind: 'attempt', action: {
        kind: 'delegate', schema: 'prospec-tasks', path: 'verifier.json', prompt: 'Check', reads: ['tasks.md'] } };
      return e.kind === 'payload' ? { ...e, source: 'fresh-executor' } : e;
    });
    const trace = run([...extra, ...delegated]);
    trace.files['metadata.yaml'] = 'name: x\ncreated_at: "2026-09-05"\nstatus: tasks\nscale: quick\nquality_log:\n  - skill: prospec-tasks\n    date: "2026-09-05"\n    result: PASS\n    verifier_verdict: PASS\n';
    const expected = { ...oracle, required_signals: ['pending' as const], required_commands: [['status', '--json']],
      required_receipts: ['prospec-tasks' as const], required_states: { 'metadata.yaml': 'tasks' as const },
      required_log_skills: { 'metadata.yaml': ['prospec-tasks'] } };
    expect(scoreRun(trace, expected).complete).toBe(true);
    trace.files['metadata.yaml'] = 'invalid';
    expect(scoreRun(trace, expected).complete).toBe(false);
    expect(scoreRun(run([{ kind: 'denied', reason: 'Orphaned' }, ...events]), oracle).complete).toBe(false);
    expect(scoreRun(run([{ kind: 'error', reason: 'Failure' }, ...events]), oracle).complete).toBe(false);
  });
});
