import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { adjudicateNativeCapture, observeContentArrivals, observeNativeOperations } from '../../../scripts/workflow-eval/native-adjudication.js';
import { OracleSchema } from '../../../scripts/workflow-eval/protocol.js';

const root = '/home/evaluator/quick';
const encode = (files: Record<string, string>) => ({ encoding: 'base64' as const,
  files: Object.fromEntries(Object.entries(files).map(([path, content]) => [path, Buffer.from(content).toString('base64')])), unavailable: [] });
const report = JSON.stringify({ verdict: 'WARN', evidence: 'Read tasks.md, proposal.md and the rubric.',
  dimensions: Object.fromEntries(['bidirectional_coverage', 'dag_topological_order', 'tdd_module_closure', 'task_sizing_schema']
    .map((name) => [name, { result: name === 'tdd_module_closure' ? 'WARN' : 'PASS', rationale: `${name} rationale` }])) });
const metadata = (status: string, logged = true) => `name: x\ncreated_at: "2026-09-05"\nstatus: ${status}\nscale: quick\n` +
  (logged ? 'quality_log:\n  - skill: prospec-tasks\n    date: 2026-09-06\n    result: WARN\n    warnings:\n      - "sizing advisory"\n    verifier_verdict: WARN\n' : '');
const stationFiles = Object.fromEntries(['tasks', 'review', 'verify', 'archive'].map((station) =>
  [`.agents/skills/prospec-${station}/SKILL.md`, `# ${station} instructions\n`]));
const before: Record<string, string> = { ...stationFiles, '.prospec/changes/x/metadata.yaml': metadata('story', false), '.prospec/changes/x/proposal.md': '# Proposal: x\n', 'README.md': '# Fixture\n' };
const after = { ...before, '.prospec/changes/x/metadata.yaml': metadata('tasks'),
  '.prospec/changes/x/tasks.md': '# Tasks: x\n\n- [ ] T1 fix spelling\n', '.prospec/changes/x/tasks-verifier-report.json': report };

const claudeUse = (name: string, input: Record<string, unknown>, id: string, child = false, payload: unknown = name === 'Read'
  ? before[String(input.file_path).replace(`${root}/`, '')] ?? null : 'ok') => ([
  { type: 'assistant', ...(child ? { parent_tool_use_id: 'toolu_agent' } : {}), message: { content: [{ type: 'tool_use', id, name, input }] } },
  { type: 'user', ...(child ? { parent_tool_use_id: 'toolu_agent' } : {}), message: { content: [{ type: 'tool_result', tool_use_id: id, content: payload }] } },
]);
const agyTool = (index: number, tool_name: string, parameters: Record<string, unknown>) => ([
  { event: 'step_update', step_update: { step_index: index, state: 'ACTIVE', step_type: 'tool', tool_name, tool_info: { name: tool_name, parameters } } },
  { event: 'step_update', step_update: { step_index: index, state: 'DONE', step_type: 'tool', tool_name, tool_info: { name: tool_name, parameters } } },
]);
const cli = `"/opt/node/bin/node" "/opt/prospec-eval/workflow-runtime.mjs"`;
const claudeRecords = (skillContent: string | null = null) => [
  ...claudeUse('Read', { file_path: `${root}/.agents/skills/prospec-ff/SKILL.md` }, 't1', false, skillContent),
  ...claudeUse('Read', { file_path: `${root}/.prospec/changes/x/proposal.md` }, 't2'),
  ...claudeUse('Bash', { command: `${cli} change tasks --change x` }, 't3'),
  ...claudeUse('Write', { file_path: `${root}/.prospec/changes/x/tasks.md` }, 't4'),
  ...claudeUse('Agent', { subagent_type: 'general-purpose', prompt: 'independent verifier' }, 'toolu_agent'),
  ...claudeUse('Write', { file_path: `${root}/.prospec/changes/x/tasks-verifier-report.json` }, 't5', true),
  ...claudeUse('Bash', { command: `${cli} change log --change x --skill prospec-tasks --verifier-report .prospec/changes/x/tasks-verifier-report.json` }, 't6'),
  { type: 'result', subtype: 'success', is_error: false },
];
const agyRecords = () => [
  ...agyTool(2, 'view_file', { AbsolutePath: `${root}/.agents/skills/prospec-ff/SKILL.md` }),
  ...agyTool(4, 'view_file', { AbsolutePath: `${root}/.prospec/changes/x/proposal.md` }),
  ...agyTool(6, 'run_command', { CommandLine: `${cli} change tasks --change x` }),
  ...agyTool(8, 'write_to_file', { TargetFile: `${root}/.prospec/changes/x/tasks.md` }),
  { event: 'step_update', step_update: { step_index: 10, state: 'DONE', step_type: 'subagent', tool_name: 'invoke_subagent',
    subagent_info: { subagents: [{ role: 'Task Verifier', initial_prompt: 'write the report' }] } } },
  ...agyTool(12, 'run_command', { CommandLine: `${cli} change log --change x --skill prospec-tasks --verifier-report .prospec/changes/x/tasks-verifier-report.json` }),
  { event: 'result', result: { status: 'SUCCESS', response: 'handoff' } },
];
const capture = (cliName: 'claude' | 'agy', overrides: { after?: Record<string, string>; records?: unknown[]; transport?: Record<string, unknown> } = {}) => ({
  identity: { executor: { cli: cliName, model: cliName === 'claude' ? 'claude-fable-5-1' : 'gemini-3.8-flash-high' },
    project_root: root, scenario: { id: 'quick' }, config_digest: 'c'.repeat(64), runtime_digest: 'r'.repeat(64), instructions_digest: 'i'.repeat(64) },
  before: { artifacts: encode(before) },
  after: { artifacts: encode(overrides.after ?? after), runtime_unchanged: true },
  transport: { exit_code: 0, duration_ms: 215086, failure: null, ...overrides.transport,
    observation: { records: overrides.records ?? (cliName === 'claude' ? claudeRecords() : agyRecords()), parse_errors: [], terminal_success: true,
      ...(overrides.transport?.observation as object ?? {}) } },
});
const oracle = async () => OracleSchema.parse(JSON.parse(await readFile('tests/fixtures/workflow-eval/private/quick.json', 'utf8')));

describe('native capture adjudication', () => {
  it('maps native tool records to attributed operations per CLI', () => {
    const claude = observeNativeOperations('claude', claudeRecords(), root);
    expect(claude.filter((o) => o.kind === 'read').map((o) => o.path)).toEqual(['.agents/skills/prospec-ff/SKILL.md', '.prospec/changes/x/proposal.md']);
    expect(claude.find((o) => o.actor === 'child')).toMatchObject({ kind: 'write', path: '.prospec/changes/x/tasks-verifier-report.json', completed: true });
    expect(claude.find((o) => o.kind === 'command')?.args).toEqual(['/opt/node/bin/node', '/opt/prospec-eval/workflow-runtime.mjs', 'change', 'tasks', '--change', 'x']);
    const agy = observeNativeOperations('agy', agyRecords(), root);
    expect(agy.filter((o) => o.kind === 'read').map((o) => o.path)).toEqual(['.agents/skills/prospec-ff/SKILL.md', '.prospec/changes/x/proposal.md']);
    expect(agy.filter((o) => o.actor === 'child')).toEqual([]);
    expect(agy.filter((o) => o.kind === 'delegate')).toHaveLength(1);
    // One completed tool is one operation, not one per ACTIVE/DONE step.
    expect(agy.filter((o) => o.kind === 'write')).toHaveLength(1);
  });
  it('certifies an attributed Claude capture under both evidence standards', async () => {
    const result = adjudicateNativeCapture(capture('claude'), await oracle());
    expect(result.metrics.strict.failures).toEqual([]);
    expect(result.metrics.strict.complete).toBe(true);
    expect(result.metrics.graded.complete).toBe(true);
    expect(result.dimensions.independent_receipt).toMatchObject({ strict: 'satisfied', graded: 'satisfied', evidence: 'attributed' });
    expect(result.metrics.strict).toMatchObject({ route_correct: 2, route_expected: 2, payload_valid: 1, payload_expected: 1,
      forbidden_actions: 0, false_pass: 0, suite_runs: 0, unnecessary_test_runs: 0 });
    expect(result.disclosure.join(' ')).toMatch(/visibility/i);
  });
  it('measures the instruction context a run actually loaded from the fixture', async () => {
    const skill = '.agents/skills/prospec-ff/SKILL.md';
    const withSkill = { ...before, [skill]: '# ff\n'.repeat(200) };
    const loaded = adjudicateNativeCapture({ ...capture('claude', { records: claudeRecords(withSkill[skill]) }),
      before: { artifacts: encode(withSkill) }, after: { artifacts: encode({ ...after, [skill]: withSkill[skill] }), runtime_unchanged: true } },
      await oracle());
    expect(loaded.context.available).toBe(true);
    expect(loaded.context.loads.map((load) => load.path)).toEqual([skill]);
    expect(loaded.context.estimated_tokens).toBeGreaterThan(0);
    expect(loaded.context.loads[0]!.station).toBe('other');
    // Reading a file the capture did not retain leaves the measurement unavailable, not zero.
    const missing = adjudicateNativeCapture(capture('claude'), await oracle());
    expect(missing.context.available).toBe(false);
    expect(missing.context.errors.join(' ')).toContain(skill);
    expect(missing.context.estimated_tokens).toBe(0);
    // Only shipped instructions count; project files the model reads are not the budget.
    expect(loaded.context.loads.some((load) => load.path.includes('proposal.md'))).toBe(false);
  });
  it('leaves an unattributable AGY receipt unproven under the strict standard only', async () => {
    const result = adjudicateNativeCapture(capture('agy'), await oracle());
    expect(result.dimensions.independent_receipt).toMatchObject({ strict: 'unobserved', graded: 'satisfied', evidence: 'inferred-from-absence' });
    expect(result.metrics.strict.complete).toBe(false);
    expect(result.metrics.strict.failures).toEqual(['independent_receipt', 'required_reads']);
    // An unobservable dimension is not a contradicted claim: this run is incomplete, not a false PASS.
    expect(result.metrics.strict.false_pass).toBe(0);
    expect(result.metrics.graded.false_pass).toBe(0);
    expect(result.metrics.graded.complete).toBe(false);
    expect(result.dimensions.required_reads.strict).toBe('unobserved');
    // A parent-written receipt is not independent under either standard.
    const parentWritten = capture('agy', { records: [...agyRecords().slice(0, -1),
      ...agyTool(14, 'write_to_file', { TargetFile: `${root}/.prospec/changes/x/tasks-verifier-report.json` })] });
    const written = adjudicateNativeCapture(parentWritten, await oracle());
    expect(written.dimensions.independent_receipt).toMatchObject({ strict: 'violated', graded: 'violated' });
    expect(written.metrics.graded.complete).toBe(false);
  });
  it('detects contradicted artifacts, state, receipts and payloads from the fixture itself', async () => {
    const missing = { ...before, '.prospec/changes/x/metadata.yaml': metadata('story', false) };
    const empty = adjudicateNativeCapture(capture('claude', { after: missing }), await oracle());
    expect(empty.dimensions.artifacts.strict).toBe('violated');
    expect(empty.dimensions.state.strict).toBe('violated');
    expect(empty.dimensions.cli_receipts.strict).toBe('violated');
    expect(empty.dimensions.payloads.strict).toBe('violated');
    // A terminal success over contradicted evidence is a false PASS, never a pass.
    expect(empty.metrics.strict.false_pass).toBe(1);
    expect(empty.metrics.graded.complete).toBe(false);
    // A logged station without a verifier verdict is not a recorded receipt.
    const unverified = adjudicateNativeCapture(capture('claude', { after: { ...after,
      '.prospec/changes/x/metadata.yaml': metadata('tasks').replace('    verifier_verdict: WARN\n', '') } }), await oracle());
    expect(unverified.dimensions.cli_receipts.strict).toBe('violated');
    expect(unverified.dimensions.state.strict).toBe('satisfied');
    const forbidden = adjudicateNativeCapture(capture('claude', { after: { ...after, '.prospec/changes/x/plan.md': '# Plan\n' } }), await oracle());
    expect(forbidden.dimensions.artifacts.strict).toBe('violated');
    const invalid = adjudicateNativeCapture(capture('claude', { after: { ...after, '.prospec/changes/x/tasks-verifier-report.json': '{"verdict":"PASS"}' } }), await oracle());
    expect(invalid.dimensions.payloads.strict).toBe('violated');
    expect(invalid.dimensions.payloads.detail.join(' ')).toMatch(/prospec-tasks/);
  });
  it('counts observed violations without inferring absence of unobserved ones', async () => {
    const violations = adjudicateNativeCapture(capture('claude', { records: [...claudeRecords().slice(0, -1),
      ...claudeUse('Read', { file_path: `${root}/.prospec/changes/x/plan.md` }, 'v1'),
      ...claudeUse('Read', { file_path: '/Users/dev/prospec/tests/fixtures/workflow-eval/private/quick.json' }, 'v2'),
      ...claudeUse('Bash', { command: `${cli} verify --change x` }, 'v3'),
      ...claudeUse('Bash', { command: 'node suite.cjs' }, 'v4'),
      { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
    expect(violations.dimensions.forbidden_reads.strict).toBe('violated');
    expect(violations.dimensions.external_reads.strict).toBe('violated');
    expect(violations.dimensions.external_reads.detail.join(' ')).toMatch(/attempted outside the project root/);
    expect(violations.dimensions.forbidden_commands.strict).toBe('violated');
    expect(violations.dimensions.suite_runs).toMatchObject({ strict: 'violated', graded: 'violated' });
    expect(violations.metrics.strict.forbidden_actions).toBe(3);
    expect(violations.metrics.strict.unnecessary_test_runs).toBe(1);
    // These are DISCLOSED dimensions: the counts and outcomes are reported, and
    // completion is computed without them, because "no violation was seen" is not
    // the same claim as "none occurred".
    for (const name of ['forbidden_reads', 'external_reads', 'forbidden_commands', 'suite_runs'] as const) {
      expect(violations.certified as readonly string[], name).not.toContain(name);
      expect(violations.disclosed[name], name).toMatchObject({ strict: 'violated' });
      expect(violations.metrics.strict.failures, name).not.toContain(name);
    }
    // The COST of the demotion, pinned so it cannot surprise a reader: this run visibly
    // read a forbidden file, reached outside the project, ran a forbidden command and an
    // unnecessary suite — and it is still `complete`, because completion is scored only
    // over what a native trace can establish. Everything it did is in the report; none
    // of it is in the score. A consumer that needs those four facts must read
    // `disclosed`, and `compare-native` surfaces them as warnings.
    expect(violations.metrics.strict.complete).toBe(true);
    expect(violations.metrics.strict.forbidden_actions).toBe(3);
    expect(violations.metrics.strict.false_pass).toBe(0);
  });
  it('refuses to certify a truncated or failed execution', async () => {
    const timeout = adjudicateNativeCapture(capture('claude', { transport: { exit_code: 124, observation: { terminal_success: false } } }), await oracle());
    expect(timeout.dimensions.execution.strict).toBe('violated');
    expect(timeout.metrics.strict.complete).toBe(false);
    expect(timeout.metrics.graded.complete).toBe(false);
    expect(timeout.metrics.strict.false_pass).toBe(0);
    const nonzero = adjudicateNativeCapture(capture('claude', { transport: { exit_code: 1 } }), await oracle());
    expect(nonzero.dimensions.execution.strict).toBe('violated');
    expect(nonzero.dimensions.execution.detail.join(' ')).toMatch(/exit/i);
    const failed = adjudicateNativeCapture(capture('claude', { transport: { failure: 'Process killed' } }), await oracle());
    expect(failed.dimensions.execution.strict).toBe('violated');
    const parseErrors = adjudicateNativeCapture(capture('claude', { transport: { observation: { parse_errors: [3] } } }), await oracle());
    expect(parseErrors.dimensions.execution.strict).toBe('violated');
    const drifted = { ...capture('claude'), after: { artifacts: encode(after), runtime_unchanged: false } };
    expect(adjudicateNativeCapture(drifted, await oracle()).dimensions.execution.strict).toBe('violated');
  });
  it('scores the route from CLI evidence and the endpoint from the parked state', async () => {
    const beyond = adjudicateNativeCapture(capture('claude', { records: [...claudeRecords().slice(0, -1),
      ...claudeUse('Bash', { command: `${cli} change status implemented --change x` }, 'r1'),
      { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
    expect(beyond.dimensions.routes.strict).toBe('violated');
    const noCli = adjudicateNativeCapture(capture('claude', { records: [...claudeUse('Write', { file_path: `${root}/.prospec/changes/x/tasks.md` }, 'w1'),
      { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
    expect(noCli.dimensions.routes.strict).toBe('unobserved');
    expect(noCli.metrics.strict.route_correct).toBe(0);
    expect(noCli.dimensions.endpoint.strict).toBe('unobserved');
  });
  it('grants no station credit to a denied or failed frozen-CLI invocation', async () => {
    // A refused mutation is an attempt, not station evidence: the CLI never ran it.
    const denied = claudeRecords().map((record: Record<string, unknown>) => {
      const block = ((record.message as { content?: unknown[] } | undefined)?.content ?? [])[0] as Record<string, unknown> | undefined;
      return block?.type === 'tool_result' && ['t2', 't3', 't6'].includes(String(block.tool_use_id))
        ? { ...record, message: { content: [{ ...block, is_error: true }] } } : record;
    });
    const result = adjudicateNativeCapture(capture('claude', { records: denied }), await oracle());
    expect(result.dimensions.routes.strict).toBe('unobserved');
    expect(result.dimensions.endpoint.strict).toBe('unobserved');
    expect(result.metrics.strict.route_correct).toBe(0);
    expect(result.metrics.strict.complete).toBe(false);
    // The graded standard credits the station's own skill read, which this run never made.
    expect(result.dimensions.routes.graded).toBe('unobserved');
    // A denied read is likewise no evidence of a required read.
    expect(result.dimensions.required_reads.strict).toBe('unobserved');
  });
  it('resolves traversal and relative paths before judging containment', async () => {
    const escaped = adjudicateNativeCapture(capture('claude', { records: [...claudeRecords().slice(0, -1),
      ...claudeUse('Read', { file_path: `${root}/../../etc/passwd` }, 'x1'),
      { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
    expect(escaped.dimensions.external_reads.strict).toBe('violated');
    expect(escaped.dimensions.external_reads.detail.join(' ')).toContain('/etc/passwd');
    const relative = adjudicateNativeCapture(capture('claude', { records: [...claudeRecords().slice(0, -1),
      ...claudeUse('Read', { file_path: '../../../etc/shadow' }, 'x2'),
      { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
    expect(relative.dimensions.external_reads.strict).toBe('violated');
    // A relative path INSIDE the root stays internal and keeps its fixture-relative identity.
    const inside = observeNativeOperations('claude', claudeUse('Read', { file_path: './.prospec/changes/x/proposal.md' }, 'x3'), root);
    expect(inside[0]).toMatchObject({ path: '.prospec/changes/x/proposal.md', external: false });
  });
  it('matches a forbidden verb through interpreters, script paths and chained commands', async () => {
    const runtime = '/opt/prospec-eval/workflow-runtime.mjs';
    const shapes = [`node ${runtime} archive --change x`,
      `cd ${root} && ${runtime} archive --change x`,
      `env FORCE_COLOR=0 /opt/node/bin/node ${runtime} archive --change x`,
      // Every shape below escaped detection until the segmenter handled it (S2-1).
      `sh -c "node ${runtime} archive --change x"`,
      `bash -lc "${runtime} archive --change x"`,
      `node --enable-source-maps ${runtime} archive --change x`,
      `env -i node ${runtime} archive --change x`,
      `node ${runtime} check --change x;node ${runtime} archive --change x`,
      `node ${runtime} check --change x\nnode ${runtime} archive --change x`,
      // Wrapper commands (round-3 C3-2) — the Docker transport itself uses `timeout`.
      `timeout 60 node ${runtime} archive --change x`,
      `timeout --signal=TERM 60s ${runtime} archive --change x`,
      `nohup node ${runtime} archive --change x`,
      `exec ${runtime} archive --change x`,
      `stdbuf -oL node ${runtime} archive --change x`];
    for (const [index, command] of shapes.entries()) {
      const result = adjudicateNativeCapture(capture('claude', { records: [...claudeRecords().slice(0, -1),
        ...claudeUse('Bash', { command }, `f${index}`),
        { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
      expect(result.dimensions.forbidden_commands.strict, command).toBe('violated');
      expect(result.metrics.strict.forbidden_actions, command).toBeGreaterThan(0);
    }
  });
  it('sees a station change in every chained segment, and treats an unexpanded ~ as outside', async () => {
    const runtime = '/opt/prospec-eval/workflow-runtime.mjs';
    // Two station mutations in ONE Bash call: the second must not be invisible.
    const chained = adjudicateNativeCapture(capture('claude', { records: [
      ...claudeUse('Read', { file_path: `${root}/.agents/skills/prospec-ff/SKILL.md` }, 'k1'),
      ...claudeUse('Bash', { command: `node ${runtime} change tasks --change x && node ${runtime} change status implemented --change x` }, 'k2'),
      { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
    expect(chained.dimensions.routes.strict).toBe('violated');
    expect(chained.dimensions.routes.detail.join(' ')).toContain('implement');
    // `~` is never expanded by this evaluator, so it cannot be judged as inside the fixture.
    const home = adjudicateNativeCapture(capture('claude', { records: [...claudeRecords().slice(0, -1),
      ...claudeUse('Read', { file_path: '~/.claude/.credentials.json' }, 'h1'),
      { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
    expect(home.dimensions.external_reads.strict).toBe('violated');
    expect(home.dimensions.external_reads.detail.join(' ')).toContain('~/.claude/.credentials.json');
  });
  it('judges receipt independence over every schema-valid candidate, not just the first', async () => {
    // A parent-written receipt must not hide behind another valid payload that sorts first.
    const decoy = '.prospec/changes/x/aaa-tasks-verifier-report.json';
    // The decoy is FIRST in key order, which is what `find` follows.
    const withDecoy = Object.fromEntries([[decoy, after['.prospec/changes/x/tasks-verifier-report.json']!],
      ...Object.entries(after)]) as Record<string, string>;
    const masked = adjudicateNativeCapture(capture('claude', { after: withDecoy, records: [...claudeRecords().slice(0, -1),
      ...claudeUse('Write', { file_path: `${root}/.prospec/changes/x/tasks-verifier-report.json` }, 'p1'),
      { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
    expect(masked.dimensions.independent_receipt.strict).toBe('violated');
    expect(masked.dimensions.independent_receipt.graded).toBe('violated');
  });
  it('judges containment of shell command arguments, not only tool paths', async () => {
    // Reading outside the fixture through a shell was invisible while the same path via
    // the Read tool was a violation (round-3 S3-1).
    for (const command of ['cat ~/.claude/.credentials.json', 'cat /etc/passwd',
      'grep -r token /Users/dev/other-project',
      // Shapes that bypassed the token-level scan until round-4 S4-2.
      'grep -r token --include=/etc/shadow .', 'sed -f/etc/passwd -n p', 'CONF=/etc/passwd node -e 0',
      'cat ~root/.ssh/id_rsa', 'curl file:///etc/passwd']) {
      const escaped = adjudicateNativeCapture(capture('claude', { records: [...claudeRecords().slice(0, -1),
        ...claudeUse('Bash', { command }, 'e1'),
        { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
      expect(escaped.dimensions.external_reads.strict, command).toBe('violated');
    }
    // The frozen CLI legitimately lives outside the fixture, so invoking it is not an escape.
    const legitimate = adjudicateNativeCapture(capture('claude'), await oracle());
    expect(legitimate.dimensions.external_reads.strict).toBe('satisfied');
    // Nor is a fixture-relative argument.
    const inside = adjudicateNativeCapture(capture('claude', { records: [...claudeRecords().slice(0, -1),
      ...claudeUse('Bash', { command: 'cat .prospec/changes/x/proposal.md' }, 'i1'),
      { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
    expect(inside.dimensions.external_reads.strict).toBe('satisfied');
  });
  it('reports authorship and negative dimensions without scoring them', async () => {
    // Five rounds established that a native trace cannot settle authorship, and that its
    // negative detectors only prove "no violation was seen". Those dimensions are now
    // DISCLOSED: the observation is reported, and `complete` is computed without it.
    const shellWritten = adjudicateNativeCapture(capture('claude', { records: [...claudeRecords().slice(0, -1),
      ...claudeUse('Bash', { command: `cat > .prospec/changes/x/metadata.yaml <<'EOF'` }, 'sw2'),
      { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
    // The touch IS reported, under the dimension that owns it.
    expect(shellWritten.dimensions.state.strict).toBe('violated');
    expect(shellWritten.dimensions.state.detail.join(' ')).toMatch(/Model-authored/);
    expect(shellWritten.disclosed.state).toMatchObject({ strict: 'violated' });
    // …and it does not enter the score, in either direction.
    expect(shellWritten.metrics.strict.failures).not.toContain('state');
    expect(shellWritten.metrics.strict.false_pass).toBe(0);
    // Each dimension reports only its own diagnostics (round-5 C5-3).
    expect(shellWritten.dimensions.cli_receipts.detail.join(' ')).not.toMatch(/Unexpected state/);
    // The certified set is what `complete` is computed over, and it is stated in the report.
    expect(shellWritten.certified).not.toContain('state');
    expect(shellWritten.certified).not.toContain('forbidden_commands');
    expect(shellWritten.disclosure.join(' ')).toMatch(/reported and never scored/);
  });
  it('does not read a REFUSED write as authorship', async () => {
    // The mirror error of C3-1: a denied Edit is an attempt, so treating it as authorship
    // would fabricate a violation and a false PASS out of nothing (round-4 C4-1).
    const denied = [...claudeRecords().slice(0, -1),
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'dw1', name: 'Edit', input: { file_path: `${root}/.prospec/changes/x/metadata.yaml` } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'dw1', is_error: true, content: 'denied' }] } },
      { type: 'result', subtype: 'success', is_error: false }];
    const result = adjudicateNativeCapture(capture('claude', { records: denied }), await oracle());
    expect(result.dimensions.state.detail.join(' ')).not.toMatch(/Model-authored/);
    expect(result.dimensions.state.strict).toBe('satisfied');
    expect(result.dimensions.cli_receipts.strict).toBe('satisfied');
    expect(result.metrics.strict.false_pass).toBe(0);
  });
  it('reports a hand-written change metadata touch as a disclosed observation', async () => {
    // Round-3 C3-1 and round-4 S4-1 both showed a well-formed artifact proves nothing
    // about who wrote it. The touch is still surfaced — under its own dimension and in
    // the disclosed block — but it is not scored, because the trace cannot settle it.
    const handWritten = adjudicateNativeCapture(capture('claude', { records: [
      ...claudeUse('Read', { file_path: `${root}/.agents/skills/prospec-tasks/SKILL.md` }, 'h1'),
      ...claudeUse('Write', { file_path: `${root}/.prospec/changes/x/tasks.md` }, 'h2'),
      ...claudeUse('Write', { file_path: `${root}/.prospec/changes/x/metadata.yaml` }, 'h3'),
      { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
    expect(handWritten.dimensions.state).toMatchObject({ strict: 'violated', graded: 'violated' });
    expect(handWritten.dimensions.cli_receipts).toMatchObject({ strict: 'violated', graded: 'violated' });
    expect(handWritten.dimensions.state.detail.join(' ')).toMatch(/metadata\.yaml/);
    expect(handWritten.disclosed.cli_receipts).toMatchObject({ strict: 'violated' });
    expect(handWritten.metrics.strict.failures).not.toContain('state');
    // It still counts as a forbidden action, which is a reported number, not a gate.
    expect(handWritten.metrics.strict.forbidden_actions).toBeGreaterThan(0);
    // No CLI invocation ran at all, so the certified route evidence is what fails.
    expect(handWritten.metrics.strict.complete).toBe(false);
    expect(handWritten.metrics.strict.failures).toContain('routes');
  });
  it('counts a suite run only when the fixture suite is what actually executed', async () => {
    const inspected = adjudicateNativeCapture(capture('claude', { records: [...claudeRecords().slice(0, -1),
      ...claudeUse('Bash', { command: 'cat suite.cjs' }, 's1'),
      ...claudeUse('Bash', { command: 'grep -n handoff suite.cjs' }, 's2'),
      { type: 'result', subtype: 'success', is_error: false }] }), await oracle());
    // Reading the suite is not running it: quick expects zero suite runs.
    expect(inspected.dimensions.suite_runs.strict).toBe('satisfied');
    expect(inspected.metrics.strict.unnecessary_test_runs).toBe(0);
    const backfill = OracleSchema.parse(JSON.parse(await readFile('tests/fixtures/workflow-eval/private/proven-backfill.json', 'utf8')));
    const deniedSuite = adjudicateNativeCapture({ ...capture('claude', { records: [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'd1', name: 'Bash', input: { command: 'node suite.cjs' } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'd1', is_error: true, content: 'denied' }] } },
      { type: 'result', subtype: 'success', is_error: false }] }),
      identity: { ...capture('claude').identity, scenario: { id: 'proven-backfill' } } }, backfill);
    expect(deniedSuite.dimensions.suite_runs.strict).toBe('unobserved');
  });
  it('enforces read-only scenarios, required commands and unobservable delegation signals', async () => {
    const readOnly = OracleSchema.parse(JSON.parse(await readFile('tests/fixtures/workflow-eval/private/stale-delta.json', 'utf8')));
    const staleCapture = (records: unknown[]) => ({ ...capture('claude', { records }),
      identity: { ...capture('claude').identity, scenario: { id: 'stale-delta' } } });
    const check = `${cli} check --change x --json`;
    const clean = adjudicateNativeCapture(staleCapture([
      ...claudeUse('Read', { file_path: `${root}/.prospec/changes/x/delta-spec.md` }, 'c1'),
      ...claudeUse('Bash', { command: check }, 'c2'),
      { type: 'result', subtype: 'success', is_error: false }]), readOnly);
    expect(clean.dimensions.write_policy.strict).toBe('satisfied');
    expect(clean.dimensions.delegation_policy.strict).toBe('satisfied');
    expect(clean.dimensions.required_commands.strict).toBe('satisfied');
    const violating = adjudicateNativeCapture(staleCapture([
      ...claudeUse('Write', { file_path: `${root}/.prospec/changes/x/tasks.md` }, 'v1'),
      ...claudeUse('Agent', { subagent_type: 'general-purpose', prompt: 'verify this' }, 'v2'),
      { type: 'result', subtype: 'success', is_error: false }]), readOnly);
    // Reported, not scored: a read-only scenario's write and delegation policies are
    // negative detectors over an incomplete trace.
    expect(violating.dimensions.write_policy.strict).toBe('violated');
    expect(violating.dimensions.delegation_policy.strict).toBe('violated');
    expect(violating.disclosed.write_policy).toMatchObject({ strict: 'violated' });
    expect(violating.metrics.strict.failures).not.toContain('write_policy');
    // `required_commands` IS certified: it asks whether a required invocation ran.
    expect(violating.dimensions.required_commands.strict).toBe('unobserved');
    expect(violating.metrics.strict.failures).toContain('required_commands');
    // A required command that errored out was attempted, not performed.
    const errored = adjudicateNativeCapture(staleCapture([
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'e1', name: 'Bash', input: { command: check } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'e1', is_error: true, content: 'denied' }] } },
      { type: 'result', subtype: 'success', is_error: false }]), readOnly);
    expect(errored.dimensions.required_commands.strict).toBe('unobserved');
    expect(violating.metrics.strict.forbidden_actions).toBe(2);
    // A false PASS now requires a contradicted CERTIFIED dimension. The write and the
    // delegation are disclosed, so a claimed success over them is incomplete (its
    // required command and reads were never observed) but not a lie the evaluator can
    // prove — the honest consequence of scoring only what the trace establishes.
    expect(violating.metrics.strict.false_pass).toBe(0);
    expect(violating.metrics.strict.complete).toBe(false);
    // Delegation state transitions exist only in the mediated gateway, never in a native trace.
    const signals = OracleSchema.parse(JSON.parse(await readFile('tests/fixtures/workflow-eval/private/missing-receipt.json', 'utf8')));
    const pending = adjudicateNativeCapture({ ...capture('claude', { records: [{ type: 'result', subtype: 'success', is_error: false }] }),
      identity: { ...capture('claude').identity, scenario: { id: 'missing-receipt' } } }, signals);
    expect(pending.dimensions.delegation_signals).toMatchObject({ strict: 'unobserved', graded: 'unobserved' });
    expect(pending.disclosure.join(' ')).toMatch(/delegation state/i);
    expect(clean.dimensions.delegation_signals.strict).toBe('satisfied');
  });
  it('credits a station skill read as graded route evidence but never as a CLI mutation', async () => {
    const diagnostic = OracleSchema.parse(JSON.parse(await readFile('tests/fixtures/workflow-eval/private/reverify-c.json', 'utf8')));
    const asScenario = (records: unknown[]) => ({ ...capture('claude', { records }),
      identity: { ...capture('claude').identity, scenario: { id: 'reverify-c' } } });
    const read = adjudicateNativeCapture(asScenario([
      ...claudeUse('Read', { file_path: `${root}/.agents/skills/prospec-verify/SKILL.md` }, 'r1'),
      { type: 'result', subtype: 'success', is_error: false }]), diagnostic);
    expect(read.dimensions.routes).toMatchObject({ strict: 'unobserved', graded: 'satisfied' });
    expect(read.metrics.strict.route_correct).toBe(0);
    expect(read.metrics.graded.route_correct).toBe(1);
    const unread = adjudicateNativeCapture(asScenario([
      ...claudeUse('Read', { file_path: `${root}/.agents/skills/prospec-archive/SKILL.md` }, 'r2'),
      { type: 'result', subtype: 'success', is_error: false }]), diagnostic);
    // Reading an unrelated station is exploration, not a wrong route; only a mutation is.
    expect(unread.dimensions.routes).toMatchObject({ strict: 'unobserved', graded: 'unobserved' });
    // Station evidence out of order is not the expected route.
    const twoStation = OracleSchema.parse(JSON.parse(await readFile('tests/fixtures/workflow-eval/private/proven-backfill.json', 'utf8')));
    const ordered = (first: string, second: string) => adjudicateNativeCapture({ ...capture('claude', { records: [
      ...claudeUse('Read', { file_path: `${root}/.agents/skills/prospec-${first}/SKILL.md` }, 'o1'),
      ...claudeUse('Read', { file_path: `${root}/.agents/skills/prospec-${second}/SKILL.md` }, 'o2'),
      { type: 'result', subtype: 'success', is_error: false }] }),
      identity: { ...capture('claude').identity, scenario: { id: 'proven-backfill' } } }, twoStation);
    expect(ordered('review', 'verify').dimensions.routes.graded).toBe('satisfied');
    expect(ordered('verify', 'review').dimensions.routes.graded).toBe('unobserved');
    const mutated = adjudicateNativeCapture(asScenario([
      ...claudeUse('Read', { file_path: `${root}/.agents/skills/prospec-verify/SKILL.md` }, 'r3'),
      ...claudeUse('Bash', { command: `${cli} change tasks --change x` }, 'r4'),
      { type: 'result', subtype: 'success', is_error: false }]), diagnostic);
    expect(mutated.dimensions.routes).toMatchObject({ strict: 'violated', graded: 'violated' });
  });
  it('rejects a capture whose identity, encoding or scenario does not match', async () => {
    expect(() => adjudicateNativeCapture({ ...capture('claude'), identity: { ...capture('claude').identity, scenario: { id: 'stale-delta' } } }, undefined as never)).toThrow();
    const standard = OracleSchema.parse(JSON.parse(await readFile('tests/fixtures/workflow-eval/private/standard-ui.json', 'utf8')));
    expect(() => adjudicateNativeCapture(capture('claude'), standard)).toThrow(/scenario/i);
    expect(() => adjudicateNativeCapture({ ...capture('claude'), before: { artifacts: { encoding: 'utf8', files: {}, unavailable: [] } } }, standard)).toThrow();
  });
});

/**
 * Required instruction arrival is judged on CONTENT, not on the carrier (issue
 * #271): a host that loads a station through its own skill mechanism arrives at
 * the same frozen instructions a file read delivers. What is never enough is a
 * name, a success flag, a truncated or wrong payload, or a deduplicated load with
 * no earlier verified content in the same capture.
 */
describe('required instruction arrival — read and native skill load', () => {
  const skillPath = '.agents/skills/prospec-ff/SKILL.md';
  const skillBody = `---\nname: prospec-ff\n---\n\n# Prospec FF Skill\n\n${'Follow the cascading protocol.\n'.repeat(20)}`;
  const frozen = { ...before, [skillPath]: skillBody };
  // The oracle's required read is the proposal; this suite asks the same question
  // of the SKILL.md the graded route and the context ledger also key on, so the
  // required inventory is pointed at it explicitly.
  const requiredSkillOracle = async () => ({ ...(await oracle()), required_reads: [skillPath] });

  const claudeResult = (id: string, content: unknown) => ({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content }] },
  });
  const skillLoad = (id: string, content: unknown, name = 'prospec-ff') => [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Skill', input: { skill: name } }] } },
    claudeResult(id, content),
  ];
  const withRecords = (records: unknown[]) => ({
    ...capture('claude', { records, after: { ...after, [skillPath]: skillBody } }),
    before: { artifacts: encode(frozen) },
  });
  // The base run minus its own SKILL.md read, so each case supplies the arrival.
  const withoutSkillRead = () => claudeRecords().slice(2);

  it('credits a native skill load whose observed content is the frozen station instructions', async () => {
    const result = adjudicateNativeCapture(
      withRecords([...skillLoad('t0', skillBody), ...withoutSkillRead()]),
      await requiredSkillOracle(),
    );
    expect(result.dimensions.required_reads.strict).toBe('satisfied');
    expect(result.dimensions.required_reads.detail).toEqual([]);
  });

  it('accepts the same content delivered as text blocks', async () => {
    const result = adjudicateNativeCapture(
      withRecords([...skillLoad('t0', [{ type: 'text', text: skillBody }]), ...withoutSkillRead()]),
      await requiredSkillOracle(),
    );
    expect(result.dimensions.required_reads.strict).toBe('satisfied');
  });

  it('treats an equivalent file read and native load identically', async () => {
    const viaRead = adjudicateNativeCapture(withRecords(claudeRecords(skillBody)), await requiredSkillOracle());
    const viaLoad = adjudicateNativeCapture(
      withRecords([...skillLoad('t0', skillBody), ...withoutSkillRead()]),
      await requiredSkillOracle(),
    );
    expect(viaLoad.dimensions.required_reads).toEqual(viaRead.dimensions.required_reads);
    expect(viaLoad.metrics.graded.complete).toBe(viaRead.metrics.graded.complete);
  });

  it.each([
    ['a name-only invocation with no observed content', (): unknown[] => [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't0', name: 'Skill', input: { skill: 'prospec-ff' } }] } },
    ]],
    ['a failed load', (): unknown[] => [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't0', name: 'Skill', input: { skill: 'prospec-ff' } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't0', is_error: true, content: 'skill not found' }] } },
    ]],
    ['a truncated payload', (): unknown[] => skillLoad('t0', `${skillBody.slice(0, 40)}…[truncated]`)],
    ['content from another station', (): unknown[] => skillLoad('t0', '# A different skill entirely\n')],
    ['a deduplicated load with no earlier verified content', (): unknown[] => skillLoad('t0', 'Skill prospec-ff already loaded')],
  ])('leaves the requirement unobserved for %s', async (_label, records) => {
    const result = adjudicateNativeCapture(
      withRecords([...records(), ...withoutSkillRead()]),
      await requiredSkillOracle(),
    );
    expect(result.dimensions.required_reads.strict).toBe('unobserved');
    expect(result.dimensions.required_reads.detail.join(' ')).toContain(skillPath);
    expect(result.metrics.strict.complete).toBe(false);
  });

  it.each(['Skill prospec-ff already loaded', 'wrong station payload', 'truncated…'])('R271-C1 never re-injects earlier bytes for %s', (message) => {
    const operations = observeNativeOperations('claude', [
      ...skillLoad('full', skillBody), ...skillLoad('repeat', message),
    ], root);
    const arrivals = observeContentArrivals(operations, () => skillBody);
    expect(arrivals.filter((arrival) => arrival.content === skillBody)).toHaveLength(1);
  });

  it.each([null, 'ok', skillBody.slice(0, 40)])('R271-C2 does not certify a read from missing or partial content: %s', async (payload) => {
    const records = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'partial', name: 'Read', input: { file_path: `${root}/${skillPath}`, limit: 1 } }] } },
      claudeResult('partial', payload),
    ];
    const result = adjudicateNativeCapture(withRecords(records), await requiredSkillOracle());
    expect(result.dimensions.required_reads.strict).toBe('unobserved');
    expect(result.metrics.graded.route_correct).toBe(0);
    expect(result.context.loads.some((load) => load.bytes === Buffer.byteLength(skillBody))).toBe(false);
  });

  it('credits a deduplicated load only after the same content was verified in this capture', async () => {
    const result = adjudicateNativeCapture(
      withRecords([
        ...skillLoad('t0', skillBody),
        ...skillLoad('t9', 'Skill prospec-ff already loaded'),
        ...withoutSkillRead(),
      ]),
      await requiredSkillOracle(),
    );
    expect(result.dimensions.required_reads.strict).toBe('satisfied');
    // Only the observed marker is counted; the previously verified body is not reinjected.
    expect(result.context.loads.map((load) => load.path)).toEqual([skillPath, skillPath]);
    const [first, repeat] = result.context.loads;
    expect(repeat!.digest).not.toBe(first!.digest);
    expect(repeat!.bytes).toBe(Buffer.byteLength('Skill prospec-ff already loaded'));
    expect(result.context.estimated_tokens).toBe(first!.estimated_tokens + repeat!.estimated_tokens);
    expect(result.context.unique_estimated_tokens).toBe(result.context.estimated_tokens);
    // The ledger records the distinction: first injection, then a verified repeat.
    expect(result.context.loads.map((load) => [load.via, load.deduplicated])).toEqual([['load', false], ['load', true]]);
    const observed = observeContentArrivals(observeNativeOperations('claude', [
      ...skillLoad('full', skillBody), ...skillLoad('repeat', 'Skill prospec-ff already loaded'),
    ], root), () => skillBody);
    expect(observed.map((arrival) => arrival.deduplicated)).toEqual([false, true]);
  });

  it('records a marker with no earlier verified content as an unverified load, not a deduplicated one', async () => {
    const result = adjudicateNativeCapture(
      withRecords([...skillLoad('t9', 'Skill prospec-ff already loaded'), ...withoutSkillRead()]),
      await requiredSkillOracle(),
    );
    expect(result.context.loads.map((load) => [load.path, load.via, load.deduplicated])).toEqual([[skillPath, 'load', false]]);
    expect(result.dimensions.required_reads.strict).toBe('unobserved');
  });

  it.each([
    ['read first', (numbered: string, framed: string) => [
      ...claudeUse('Read', { file_path: `${root}/${skillPath}` }, 'r0', false, numbered), ...skillLoad('t0', framed)]],
    ['load first', (numbered: string, framed: string) => [
      ...skillLoad('t0', framed), ...claudeUse('Read', { file_path: `${root}/${skillPath}` }, 'r0', false, numbered)]],
  ])('counts the same instructions arriving by read and by native load as one unique content — %s', async (_order, records) => {
    // Each carrier frames the same frozen instructions differently: the read carries
    // line numbers, the host wraps its load in a header and a trailing note.
    const numbered = skillBody.split('\n').map((line, i) => `${i + 1}→${line}`).join('\n');
    const framed = `Loaded skill prospec-ff\n\n${skillBody}\n\n(skill content ends)`;
    const result = adjudicateNativeCapture(
      withRecords([...records(numbered, framed), ...withoutSkillRead()]),
      await requiredSkillOracle(),
    );
    const [first, second] = result.context.loads;
    expect(new Set([first!.via, second!.via])).toEqual(new Set(['read', 'load']));
    // Observed cost differs (framing bytes are real); the content does not.
    expect(first!.digest).not.toBe(second!.digest);
    expect(first!.canonical_digest).toBe(second!.canonical_digest);
    expect(result.context.estimated_tokens).toBe(first!.estimated_tokens + second!.estimated_tokens);
    // Unique is the SMALLEST observed cost of that content: never a byte that was not loaded.
    expect(result.context.unique_estimated_tokens).toBe(Math.min(first!.estimated_tokens, second!.estimated_tokens));
    expect(result.context.unique_estimated_tokens).toBeLessThanOrEqual(result.context.estimated_tokens);
  });

  it('R271-C5 never values unique content above what was observed: a frontmatter-less certified load counts its own bytes', async () => {
    const bodyOnly = skillBody.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
    const result = adjudicateNativeCapture(
      withRecords([...skillLoad('t0', bodyOnly), ...withoutSkillRead()]),
      await requiredSkillOracle(),
    );
    expect(result.dimensions.required_reads.strict).toBe('satisfied');
    const [load] = result.context.loads;
    expect(load!.canonical_digest).toBeDefined();
    // Uniqueness is keyed on the frozen content but VALUED at observed bytes only:
    // the frontmatter this host dropped was never loaded, so it is never counted.
    expect(result.context.unique_estimated_tokens).toBe(load!.estimated_tokens);
    expect(result.context.unique_estimated_tokens).toBeLessThanOrEqual(result.context.estimated_tokens);
  });

  it('keeps an uncertified payload out of the frozen-content uniqueness key', async () => {
    const result = adjudicateNativeCapture(
      withRecords([...skillLoad('t0', skillBody), ...skillLoad('t1', `${skillBody.slice(0, 40)}…[truncated]`), ...withoutSkillRead()]),
      await requiredSkillOracle(),
    );
    const [full, partial] = result.context.loads;
    expect(full!.canonical_digest).toBeDefined();
    expect(partial!.canonical_digest).toBeUndefined();
    // Partial bytes are their own (observed) entry: never merged into the certified content, never borrowed from it.
    expect(result.context.unique_estimated_tokens).toBe(full!.estimated_tokens + partial!.estimated_tokens);
  });

  it('measures a native load in the context ledger exactly as it measures a read', async () => {
    const viaRead = adjudicateNativeCapture(withRecords(claudeRecords(skillBody)), await oracle());
    const viaLoad = adjudicateNativeCapture(
      withRecords([...skillLoad('t0', skillBody), ...withoutSkillRead()]),
      await oracle(),
    );
    expect(viaLoad.context.available).toBe(true);
    expect(viaLoad.context.loads.map((load) => load.path)).toEqual([skillPath]);
    expect(viaLoad.context.estimated_tokens).toBe(viaRead.context.estimated_tokens);
    expect(viaLoad.context.loads[0]!.digest).toBe(viaRead.context.loads[0]!.digest);
  });

  it('never invents a load from an invocation name', async () => {
    const result = adjudicateNativeCapture(
      withRecords([
        { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't0', name: 'Skill', input: { skill: 'prospec-ff' } }] } },
        ...withoutSkillRead(),
      ]),
      await oracle(),
    );
    expect(result.context.loads).toEqual([]);
    expect(result.context.estimated_tokens).toBe(0);
  });

  it('accepts a certified native load as graded station evidence, like the station skill read', async () => {
    // The graded standard credits a station by the station's OWN skill arriving —
    // the only evidence a diagnostic station can leave. Which carrier delivered it
    // must not change the verdict, so the two captures carry nothing else.
    const stationSkill = '.agents/skills/prospec-tasks/SKILL.md';
    const stationBody = `# Prospec Tasks Skill\n\n${'Decompose the plan.\n'.repeat(20)}`;
    const stationFrozen = { ...before, [stationSkill]: stationBody };
    const only = (records: unknown[]) => ({
      ...capture('claude', { records, after: { ...after, [stationSkill]: stationBody } }),
      before: { artifacts: encode(stationFrozen) },
    });

    const viaRead = adjudicateNativeCapture(
      only(claudeUse('Read', { file_path: `${root}/${stationSkill}` }, 'r0', false, stationBody)),
      await oracle(),
    );
    const viaLoad = adjudicateNativeCapture(
      only(skillLoad('t0', stationBody, 'prospec-tasks')),
      await oracle(),
    );
    expect(viaRead.metrics.graded.route_correct).toBeGreaterThan(0);
    expect(viaLoad.metrics.graded.route_correct).toBe(viaRead.metrics.graded.route_correct);
    expect(viaLoad.dimensions.routes.graded).toBe(viaRead.dimensions.routes.graded);

    // …and a load that never delivered the content earns nothing.
    const nameOnly = adjudicateNativeCapture(
      only([{ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't0', name: 'Skill', input: { skill: 'prospec-tasks' } }] } }]),
      await oracle(),
    );
    expect(nameOnly.metrics.graded.route_correct).toBe(0);
  });

  it('leaves strict command-based routing untouched by a skill load', async () => {
    const noCommands = withRecords([...skillLoad('t0', skillBody)]);
    const result = adjudicateNativeCapture(noCommands, await oracle());
    // The strict standard still counts frozen-CLI mutations only — a loaded skill
    // is not a station having run.
    expect(result.metrics.strict.route_correct).toBe(0);
    expect(result.dimensions.routes.strict).not.toBe('satisfied');
  });

  it('requires each reference to carry its own arrival evidence', async () => {
    const referencePath = '.agents/skills/prospec-ff/references/cascade-protocol.md';
    const withReference = {
      ...(await oracle()),
      required_reads: [skillPath, referencePath],
    };
    const result = adjudicateNativeCapture(
      withRecords([...skillLoad('t0', skillBody), ...withoutSkillRead()]),
      withReference,
    );
    // Invoking the skill does not carry its reference closure.
    expect(result.dimensions.required_reads.strict).toBe('unobserved');
    expect(result.dimensions.required_reads.detail.join(' ')).toContain(referencePath);
  });
});
