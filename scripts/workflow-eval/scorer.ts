import {
  ActionSchema, ObservedRunSchema, OracleSchema,
  type Action, type ObservedRun, type ScenarioOracle, type RunVerdict, type TraceEvent,
} from './protocol.js';
import { changeMetadataOf, hasVerifierReceipt, stateMatches } from './oracle-evidence.js';

function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

/** Command policies use a verb prefix plus required flags, independent of flag order. */
export function commandMatches(args: string[], policy: string): boolean {
  const tokens = policy.split(' ');
  const flagIndex = tokens.findIndex((token) => token.startsWith('--'));
  const verbs = flagIndex < 0 ? tokens : tokens.slice(0, flagIndex);
  return verbs.every((token, i) => args[i] === token) &&
    (flagIndex < 0 || tokens.slice(flagIndex).every((token) => args.includes(token)));
}

function forbidden(action: Action, oracle: ScenarioOracle): boolean {
  if (action.kind === 'read') return oracle.forbidden_reads.includes(action.path);
  if (action.kind === 'write') return !oracle.allow_writes || oracle.forbidden_files.includes(action.path);
  if (action.kind === 'delegate') return !oracle.allow_delegation || oracle.forbidden_files.includes(action.path);
  return action.kind === 'cli' && oracle.forbidden_commands.some((rule) => commandMatches(action.args, rule));
}

function observes(event: TraceEvent, action: Action): boolean {
  switch (action.kind) {
    case 'read': return event.kind === 'read' && event.path === action.path;
    case 'write': return event.kind === 'write' && event.path === action.path;
    case 'cli': return event.kind === 'command' && same(event.args, action.args);
    case 'submit': return event.kind === 'payload' && event.schema === action.schema && event.path === action.path;
    case 'delegate': return event.kind === 'payload' && event.source === 'fresh-executor' && event.schema === action.schema && event.path === action.path;
    case 'route': return event.kind === 'route' && event.station === action.station;
    case 'wait': return event.kind === 'delegation' && event.delegation_id === action.delegation_id;
    case 'finish': return event.kind === 'finish' && event.terminal === action.terminal &&
      event.claims_pass === action.claims_pass && event.message === action.message;
  }
}

/**
 * Walk the attempt → observation pairing. Every attempt must be answered by exactly one
 * observation or one refusal, and a policy-matched attempt plus its refusal are ONE
 * forbidden action — the invariant that keeps a denial from being counted twice.
 */
function walkAttempts(events: TraceEvent[], oracle: ScenarioOracle): { failures: string[]; forbiddenActions: number } {
  const failures: string[] = [];
  const fail = (condition: boolean, reason: string) => { if (condition) failures.push(reason); };
  let forbiddenActions = 0;
  let pending: Action | undefined;
  for (const e of events) {
    if (e.kind === 'attempt') {
      fail(pending !== undefined, 'Attempt has no observation');
      const parsed = ActionSchema.safeParse(e.action);
      pending = parsed.success ? parsed.data : undefined;
      if (!parsed.success || forbidden(parsed.data, oracle)) forbiddenActions++;
    } else if (e.kind === 'denied') {
      fail(!pending, 'Refusal has no matching attempt');
      if (pending && !forbidden(pending, oracle)) forbiddenActions++;
      pending = undefined;
    } else if (e.kind === 'error') {
      failures.push(`Controller error: ${e.reason}`);
      pending = undefined;
    } else if (e.kind !== 'usage' && e.kind !== 'usage-unavailable' && e.kind !== 'suite' && e.kind !== 'delegation-read') {
      fail(!pending || !observes(e, pending), 'Observation has no matching attempt');
      pending = undefined;
    }
  }
  fail(pending !== undefined, 'Unfinished attempt');
  return { failures, forbiddenActions };
}

/** The oracle's fixture-side requirements: artifacts, terminal state and CLI receipts. */
function scoreFixtureEvidence(files: Record<string, string>, oracle: ScenarioOracle): string[] {
  const failures: string[] = [];
  const fail = (condition: boolean, reason: string) => { if (condition) failures.push(reason); };
  fail(oracle.required_files.some((p) => !files[p]?.trim()), 'Missing or empty required artifacts');
  fail(oracle.forbidden_files.some((p) => Object.hasOwn(files, p)), 'Forbidden artifact exists');
  for (const [path, status] of Object.entries(oracle.required_states)) {
    try { fail(!stateMatches(changeMetadataOf(files[path] ?? null, path), status), `Incorrect terminal state: ${path}`); }
    catch { failures.push(`Unprovable terminal state: ${path}`); }
  }
  for (const [path, skills] of Object.entries(oracle.required_log_skills)) {
    try {
      const metadata = changeMetadataOf(files[path] ?? null, path);
      fail(skills.some((skill) => !hasVerifierReceipt(metadata, skill)), `Missing CLI-recorded verifier receipt: ${path}`);
    } catch { failures.push(`Unprovable receipt state: ${path}`); }
  }
  return failures;
}

/** Score controller observations only; adapter-authored PASS text is not an observation. */
export function scoreRun(input: ObservedRun, expected: ScenarioOracle): RunVerdict {
  const run = ObservedRunSchema.parse(input);
  const oracle = OracleSchema.parse(expected);
  const failures: string[] = [];
  const fail = (condition: boolean, reason: string) => { if (condition) failures.push(reason); };
  fail(run.identity.scenario !== oracle.id, 'Scenario identity mismatch');
  fail(run.stop_reason !== 'finished', `Execution stopped: ${run.stop_reason}`);
  fail(run.events.some((e, i) => e.seq !== i + 1), 'Non-contiguous event sequence');
  const routes = run.events.filter((e) => e.kind === 'route').map((e) => e.station);
  fail(!same(routes, oracle.routes), 'Incorrect or missing route sequence');
  const walked = walkAttempts(run.events, oracle);
  failures.push(...walked.failures);
  const forbiddenActions = walked.forbiddenActions;
  fail(forbiddenActions > 0, 'Forbidden action attempted');
  const reads = new Set(run.events.filter((e) => e.kind === 'read' || e.kind === 'delegation-read').map((e) => e.path));
  fail(oracle.required_reads.some((p) => !reads.has(p)), 'Missing required reads');
  fail(oracle.forbidden_reads.some((p) => reads.has(p)), 'Forbidden read observed');
  failures.push(...scoreFixtureEvidence(run.files, oracle));
  const payloads = run.events.filter((e) => e.kind === 'payload');
  const firstPass = oracle.payloads.filter((kind) => payloads.find((e) => e.schema === kind)?.valid).length;
  fail(oracle.payloads.some((kind) => !payloads.some((e) => e.schema === kind && e.valid)), 'Missing valid payload');
  fail(oracle.required_receipts.some((kind) => !payloads.some((e) => e.schema === kind && e.valid && e.source === 'fresh-executor')), 'Missing independent receipt');
  fail(payloads.some((e) => !oracle.payloads.includes(e.schema)), 'Unexpected payload');
  const suites = run.events.filter((e) => e.kind === 'suite');
  fail(suites.length !== oracle.suite_runs, 'Incorrect suite invocation count');
  fail(suites.some((e) => e.exit_code !== 0), 'Test suite failed');
  const signals = run.events.filter((e) => e.kind === 'delegation').map((e) => e.state);
  fail(!same(signals, oracle.required_signals), 'Missing or incorrect delegation signals');
  fail(oracle.required_commands.some((args) => !run.events.some((e) =>
    e.kind === 'command' && same(e.args, args) && e.exit_code === 0)), 'Missing target-specific command');
  const finishes = run.events.filter((e) => e.kind === 'finish');
  fail(finishes.length !== 1 || finishes[0]?.terminal !== oracle.terminal, 'Missing or incorrect terminal');
  fail(run.events.at(-1)?.kind !== 'finish', 'Events continue after terminal or terminal missing');
  return {
    complete: failures.length === 0, failures: [...new Set(failures)],
    route_correct: oracle.routes.filter((route, i) => routes[i] === route).length,
    route_expected: oracle.routes.length, payload_first_pass: firstPass, payload_expected: oracle.payloads.length,
    forbidden_actions: forbiddenActions, false_pass: failures.length > 0 ? finishes.filter((e) => e.claims_pass).length : 0,
    suite_runs: suites.length, unnecessary_test_runs: Math.max(0, suites.length - oracle.suite_runs),
  };
}
