import { posix } from 'node:path';
import { z } from 'zod';
import { STATUS_STATION } from '../../src/lib/status-router.js';
import { changeMetadataOf, hasVerifierReceipt, stateMatches } from './oracle-evidence.js';
import { SDD_STATIONS, STATION_SKILLS, type SddStation } from '../../src/types/status.js';
import { observedLedger } from './context.js';
import { NativeCliSchema } from './native.js';
import { OracleSchema, SCENARIO_IDS, validatePayload, type PayloadKind, type ScenarioOracle } from './protocol.js';
import { commandMatches } from './scorer.js';

/** Only positively observed operations are evidence; absence is never proof of a clean run. */
export const OUTCOMES = ['satisfied', 'violated', 'unobserved'] as const;
type Outcome = (typeof OUTCOMES)[number];
type Evidence = 'artifact' | 'cli-record' | 'attributed' | 'inferred-from-absence' | 'observed-tools' | 'none';
type Dimension = { strict: Outcome; graded: Outcome; evidence: Evidence; detail: string[] };
/** Every dimension a native capture is judged on; a missing one is a coding error, not a pass. */
export const NATIVE_DIMENSIONS = ['execution', 'artifacts', 'state', 'cli_receipts', 'payloads',
  'independent_receipt', 'routes', 'endpoint', 'required_reads', 'forbidden_reads',
  'external_reads', 'forbidden_commands', 'required_commands', 'write_policy',
  'delegation_policy', 'delegation_signals', 'suite_runs'] as const;
type DimensionName = (typeof NATIVE_DIMENSIONS)[number];

/**
 * The dimensions a native capture can actually ESTABLISH, and therefore the only ones
 * `complete` is computed over.
 *
 * Everything else is DISCLOSED: reported with its outcome, never scored. Five review
 * rounds established why. A native trace cannot settle who authored an artifact
 * (enumerating the model's write shapes was bypassed twice — C3-1, S4-1 — and requiring
 * a matching CLI invocation instead made legitimate gate-owned transitions permanently
 * unprovable — C5-1), and its negative detectors are positive-only: a satisfied
 * `forbidden_commands` means no violation was SEEN, which is not the same claim. Scoring
 * evidence this weak is what produced false greens in every round; reporting it keeps
 * the signal without letting it decide anything.
 */
export const NATIVE_CERTIFIED = ['execution', 'artifacts', 'payloads', 'independent_receipt',
  'routes', 'endpoint', 'required_reads', 'required_commands'] as const;
export const NATIVE_DISCLOSED = NATIVE_DIMENSIONS.filter((name) =>
  !(NATIVE_CERTIFIED as readonly string[]).includes(name));
export type NativeOperation = { kind: 'read' | 'write' | 'command' | 'delegate'; actor: 'parent' | 'child';
  path: string | null; args: string[]; external: boolean; completed: boolean };

const nonNegative = z.number().int().nonnegative();
/**
 * The per-run metrics this adjudicator produces — the single source every
 * consumer parses against, so a field added or renamed here breaks them loudly.
 */
export const NativeMetricsSchema = z.strictObject({
  complete: z.boolean(), failures: z.array(z.string()),
  route_correct: nonNegative, route_expected: nonNegative,
  payload_valid: nonNegative, payload_expected: nonNegative,
  forbidden_actions: nonNegative, false_pass: nonNegative,
  suite_runs: nonNegative, unnecessary_test_runs: nonNegative,
});

const artifacts = z.object({ encoding: z.literal('base64'),
  files: z.record(z.string(), z.string()), unavailable: z.array(z.string()) });
export const NativeCaptureSchema = z.object({
  identity: z.object({ executor: z.object({ cli: NativeCliSchema, model: z.string().min(1) }),
    project_root: z.string().min(1), scenario: z.object({ id: z.enum(SCENARIO_IDS) }),
    config_digest: z.string().min(1), runtime_digest: z.string().min(1), instructions_digest: z.string().min(1) }),
  before: z.object({ artifacts }),
  after: z.object({ artifacts, runtime_unchanged: z.boolean() }),
  transport: z.object({ exit_code: z.number().int().nullable(), duration_ms: z.number().finite().nonnegative(),
    failure: z.string().nullable(), observation: z.object({ records: z.array(z.record(z.string(), z.unknown())),
      parse_errors: z.array(z.number()), terminal_success: z.boolean() }) }),
});

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null => typeof value === 'string' && value ? value : null;

/** Split a recorded shell string; the quotes are the ones this evaluator's own prompt uses. */
export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = ''; let quote: string | null = null; let quoted = false;
  for (const char of command) {
    if (quote) { if (char === quote) quote = null; else current += char; continue; }
    if (char === '"' || char === "'") { quote = char; quoted = true; continue; }
    if (/\s/.test(char)) {
      if (current || quoted) { tokens.push(current); current = ''; quoted = false; }
      // An unquoted newline SEPARATES commands; dropping it as plain whitespace merges
      // two invocations into one token stream and hides the second one's verb.
      if (char === '\n') tokens.push('\n');
      continue;
    }
    current += char;
  }
  if (current || quoted) tokens.push(current);
  return tokens;
}

/**
 * Native tool records → operations, per CLI. Containment is judged here so every
 * dimension downstream sees one normalized view.
 */
export function observeNativeOperations(cli: 'claude' | 'agy', records: Record<string, unknown>[], root: string): NativeOperation[] {
  // A recorded path is resolved against the fixture root BEFORE containment is
  // judged: `..` segments and relative paths both reach outside otherwise.
  const locate = (value: unknown) => {
    const recorded = text(value);
    if (recorded === null) return { path: null, external: false };
    // `~` is expanded by a shell, never by this evaluator: resolving it against the
    // fixture root would call the host HOME (where the forwarded login cache lives) inside.
    if (recorded === '~' || recorded.startsWith('~/') || /^~[A-Za-z0-9._-]+/.test(recorded)) return { path: recorded, external: true };
    const absolute = posix.resolve(root, recorded);
    if (absolute === root) return { path: '.', external: false };
    const inside = posix.relative(root, absolute);
    return inside === '' || inside.startsWith('..') || posix.isAbsolute(inside)
      ? { path: absolute, external: true } : { path: inside, external: false };
  };
  return cli === 'claude' ? observeClaudeOperations(records, locate) : observeAgyOperations(records, locate);
}

type Locator = (value: unknown) => { path: string | null; external: boolean };
/**
 * Path-like candidates INSIDE one shell token. A path does not have to be the whole
 * token: `--include=/etc/shadow`, `-f/etc/passwd`, `CONF=/etc/passwd` and
 * `file:///etc/passwd` all carry one, and each of those bypassed a whole-token test
 * (round-4 S4-2). So the token is split on the separators that attach a value, and
 * every part that looks like a path is judged.
 */
function pathCandidates(token: string): string[] {
  const parts = token.split(/[=,:]+/).flatMap((part) => {
    // `-f/etc/passwd`: the value is attached directly to a short flag.
    const attached = /^-{1,2}[A-Za-z][A-Za-z0-9-]*(\/.*)$/.exec(part);
    return attached ? [attached[1]!] : [part];
  });
  return parts.filter((part) => part.length > 0 &&
    (part.startsWith('/') || part.startsWith('~') || part.startsWith('./') || part.startsWith('../') || part.includes('/')));
}
/**
 * Containment for a shell command: the executable and the frozen runtime script sit
 * outside the fixture by design, so only the remaining path-like ARGUMENTS are judged.
 * Reading the host's home through `cat` was invisible while the same path via the Read
 * tool was a violation (round-3 S3-1).
 */
/**
 * The path-like ARGUMENTS a command names: its verbs plus any environment assignment
 * (which the verb window strips yet which still names a file the command opens —
 * round-4 S4-2). The interpreter, wrapper and frozen runtime script sit in the prefix
 * and live outside the fixture by design, so they are never candidates.
 */
const commandArguments = (args: string[]): string[] =>
  commandSegments(args).flatMap((segment) => [...segment.verbs, ...segment.assignments])
    .flatMap(pathCandidates);

function commandEscapes(args: string[], locate: Locator): string | null {
  for (const candidate of commandArguments(args)) {
    const located = locate(candidate);
    if (located.external) return located.path;
  }
  return null;
}

/** Fixture-relative paths a command names as arguments — what it read or wrote. */
export function commandPaths(args: string[], root: string): string[] {
  const paths: string[] = [];
  for (const candidate of commandArguments(args)) {
    const absolute = posix.resolve(root, candidate);
    const inside = posix.relative(root, absolute);
    if (inside && !inside.startsWith('..') && !posix.isAbsolute(inside) && !paths.includes(inside)) paths.push(inside);
  }
  return paths;
}
const operation = (kind: NativeOperation['kind'], actor: NativeOperation['actor'],
  located: { path: string | null; external: boolean }, args: string[], completed: boolean): NativeOperation =>
  ({ kind, actor, ...located, args, completed });

/** Claude attributes delegated work through `parent_tool_use_id`, so child tools are visible. */
function observeClaudeOperations(records: Record<string, unknown>[], locate: Locator): NativeOperation[] {
  const operations: NativeOperation[] = [];
  const failed = new Set<string>(); const settled = new Set<string>();
  for (const record of records) for (const block of z.array(z.unknown()).catch([]).parse(object(record.message).content)) {
    const result = object(block);
    if (result.type !== 'tool_result') continue;
    const id = text(result.tool_use_id);
    if (id) { settled.add(id); if (result.is_error === true) failed.add(id); }
  }
  for (const record of records) {
    const actor = text(record.parent_tool_use_id) ? 'child' : 'parent';
    for (const block of z.array(z.unknown()).catch([]).parse(object(record.message).content)) {
      const use = object(block);
      if (use.type !== 'tool_use') continue;
      const id = text(use.id) ?? '';
      const input = object(use.input);
      const done = settled.has(id) && !failed.has(id);
      const none = { path: null, external: false };
      if (use.name === 'Read') operations.push(operation('read', actor, locate(input.file_path), [], done));
      else if (use.name === 'Write' || use.name === 'Edit') operations.push(operation('write', actor, locate(input.file_path), [], done));
      else if (use.name === 'Bash') {
        const args = tokenizeCommand(text(input.command) ?? '');
        const escaped = commandEscapes(args, locate);
        operations.push(operation('command', actor, escaped === null ? none : { path: escaped, external: true }, args, done));
      }
      else if (use.name === 'Agent' || use.name === 'Task') operations.push(operation('delegate', actor, none, [], done));
    }
  }
  return operations;
}

/**
 * AGY reports a subagent step but not the tools inside it, so its child operations are
 * structurally invisible here. One AGY tool also occupies an ACTIVE and a DONE step;
 * the pair is one operation.
 */
function observeAgyOperations(records: Record<string, unknown>[], locate: Locator): NativeOperation[] {
  const operations: NativeOperation[] = [];
  const steps = new Map<number, { step: Record<string, unknown>; completed: boolean }>();
  for (const record of records) {
    const step = object(record.step_update);
    const index = typeof step.step_index === 'number' ? step.step_index : null;
    if (index === null) continue;
    const seen = steps.get(index);
    const completed = step.state === 'DONE' || seen?.completed === true;
    steps.set(index, { step: seen?.step ?? step, completed });
  }
  const none = { path: null, external: false };
  for (const [, { step, completed }] of [...steps].sort(([a], [b]) => a - b)) {
    if (step.step_type === 'subagent') { operations.push(operation('delegate', 'parent', none, [], completed)); continue; }
    if (step.step_type !== 'tool') continue;
    const parameters = object(object(step.tool_info).parameters);
    const name = text(step.tool_name);
    if (name === 'view_file' || name === 'read_file' || name === 'list_dir') {
      operations.push(operation('read', 'parent', locate(parameters.AbsolutePath ?? parameters.DirectoryPath), [], completed));
    } else if (name === 'write_to_file' || name === 'replace_file_content' || name === 'edit_file') {
      operations.push(operation('write', 'parent', locate(parameters.TargetFile ?? parameters.AbsolutePath), [], completed));
    } else if (name === 'run_command') {
      const args = tokenizeCommand(text(parameters.CommandLine) ?? '');
      const escaped = commandEscapes(args, locate);
      operations.push(operation('command', 'parent', escaped === null ? none : { path: escaped, external: true }, args, completed));
    }
  }
  return operations;
}

const SEPARATORS = /(&&|\|\||;|\n|\||&)/;
// Wrappers that precede the real executable. `timeout` is not hypothetical: this
// evaluator's own Docker transport invokes the CLI through it (round-3 C3-2).
const INTERPRETERS = new Set(['node', 'nodejs', 'npx', 'env', 'time', 'sudo', 'nice', 'xargs',
  'timeout', 'nohup', 'stdbuf', 'exec', 'command', 'setsid', 'ionice']);
/** `timeout`'s duration sits between the wrapper and the command it runs. */
const isDuration = (token: string) => /^\d+(\.\d+)?[smhd]?$/.test(token);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const basename = (token: string) => token.slice(token.lastIndexOf('/') + 1);
const isScript = (token: string) => /\.(mjs|cjs|js)$/.test(token);
const isFlag = (token: string) => token.startsWith('-') && token !== '-';
const isAssignment = (token: string) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);

/**
 * One recorded shell string can chain several commands, and each carries its own
 * executable. The frozen CLI is `<node> <runtime script> <verb>`, so the verbs are
 * whatever follows the script; interpreters, their flags, environment assignments and
 * `sh -c "…"` wrappers all sit in front of it. Every one of those shapes hid a
 * forbidden verb from detection until it was handled here (S2-1), so the parse is
 * deliberately generous about prefixes and anchored on the script token.
 */
export function commandSegments(args: string[]): { executable: string | null; verbs: string[]; assignments: string[] }[] {
  // The split KEEPS its separators (capturing group): dropping them would merge
  // `check --change x;node runtime.mjs archive` into one segment and lose the second verb.
  const tokens = args.flatMap((token) => token.split(SEPARATORS))
    // A newline IS a separator, so it must survive trimming.
    .map((token) => token === '\n' ? token : token.trim()).filter((token) => token.length > 0);
  const segments: string[][] = [[]];
  for (const token of tokens) {
    if (/^(&&|\|\||;|\n|\||&)$/.test(token)) { segments.push([]); continue; }
    segments.at(-1)!.push(token);
  }
  return segments.filter((entry) => entry.length > 0).flatMap(parseSegment);
}

function parseSegment(tokens: string[]): { executable: string | null; verbs: string[]; assignments: string[] }[] {
  let index = 0;
  let wrapped = false;
  const assignments: string[] = [];
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (isAssignment(token)) { assignments.push(token); index++; continue; }
    if (isFlag(token)) { index++; continue; }
    if (INTERPRETERS.has(basename(token))) { wrapped = true; index++; continue; }
    // `timeout --signal=TERM 60s <command>`: the duration can sit behind the wrapper's
    // own flags, so it is skipped by position in the prefix, not by adjacency.
    if (wrapped && isDuration(token)) { index++; continue; }
    break;
  }
  // `sh -c "<command>"` carries its whole command inside one token: parse that instead.
  const shell = tokens.findIndex((token) => SHELLS.has(basename(token)));
  if (shell >= 0 && shell <= index) {
    const payload = tokens.slice(shell + 1).find((token) => !isFlag(token));
    return payload === undefined ? [] : commandSegments(tokenizeCommand(payload));
  }
  const executable = tokens[index] ?? null;
  // A script in the executable position is the frozen runtime being interpreted, so the
  // verbs follow it. A script as an ARGUMENT (`cat suite.cjs`) is data, not the command.
  return executable !== null && isScript(executable)
    ? [{ executable, verbs: tokens.slice(index + 1), assignments }]
    : [{ executable, verbs: tokens.slice(index), assignments }];
}

const SKILL_STATIONS = new Map(Object.entries(STATION_SKILLS).map(([station, skill]) => [skill, station as SddStation]));

/**
 * The station a frozen-CLI invocation mutates — never a narrated intent.
 *
 * Two gate-owned transitions are NOT spelled `change …`: `verify record` and `archive`
 * (round-5 C5-1 found both resolving to null). And a positional read of `<to>` breaks on
 * `change status --change x tasks`, the CLI's own documented flag order, while `--skill`
 * in the same function was already flag-driven (round-5 C5-2) — so every operand here is
 * found by name, never by offset.
 */
export function stationOfCommand(args: string[]): SddStation | null {
  const positional = args.filter((token, index) => !token.startsWith('-') &&
    !(index > 0 && args[index - 1]!.startsWith('--') && args[index - 1] !== '--'));
  if (positional[0] === 'verify' && positional[1] === 'record') return 'verify';
  if (positional[0] === 'archive') return 'archive';
  const index = positional.indexOf('change');
  if (index < 0) return null;
  const verb = positional[index + 1];
  const skill = args[args.indexOf('--skill') + 1];
  if (verb && (SDD_STATIONS as readonly string[]).includes(verb)) return verb as SddStation;
  if (verb === 'status') return STATUS_STATION[positional[index + 2] as keyof typeof STATUS_STATION] ?? null;
  return verb === 'log' && skill ? SKILL_STATIONS.get(skill) ?? null : null;
}

/**
 * Only a segment whose executable IS the frozen runtime script counts as a CLI
 * invocation. Without this anchor `echo change plan` read as the plan station
 * (round-5 S5-1); `suite_runs` already anchored on its executable the same way.
 */
const frozenCliSegments = (args: string[]) => commandSegments(args)
  .filter((segment) => segment.executable !== null && isScript(segment.executable));

/** Stations proven by the frozen CLI's own invocations — never by narrated intent. */
export function stationsFromCommands(operations: NativeOperation[]): SddStation[] {
  const stations: SddStation[] = [];
  for (const operation of operations) {
    if (operation.kind !== 'command' || !operation.completed) continue;
    // Per SEGMENT: one Bash call can chain two station mutations, and the second one
    // is invisible to a scan that stops at the first `change` token it finds.
    for (const segment of frozenCliSegments(operation.args)) {
      const station = stationOfCommand(segment.verbs);
      if (station && stations.at(-1) !== station) stations.push(station);
    }
  }
  return stations;
}

const verdictOf = (violations: string[], proven: boolean): Outcome =>
  violations.length > 0 ? 'violated' : proven ? 'satisfied' : 'unobserved';
const dimension = (strict: Outcome, evidence: Evidence, detail: string[] = [], graded = strict): Dimension =>
  ({ strict, graded, evidence, detail });

const decode = (files: Record<string, string>, path: string): string | null =>
  Object.hasOwn(files, path) ? Buffer.from(files[path]!, 'base64').toString('utf8') : null;


/** Did the process itself finish, on the frozen runtime, with a readable trace? */
function judgeExecution(capture: z.infer<typeof NativeCaptureSchema>): Dimension {
  const observation = capture.transport.observation;
  const stopped = [
    ...(capture.transport.failure ? [`Transport failure: ${capture.transport.failure}`] : []),
    ...(capture.transport.exit_code === 0 ? [] : [`Nonzero exit: ${capture.transport.exit_code}`]),
    ...(observation.terminal_success ? [] : ['No terminal result record']),
    ...(observation.parse_errors.length ? [`Malformed trace lines: ${observation.parse_errors.length}`] : []),
    ...(capture.after.runtime_unchanged ? [] : ['Frozen runtime changed during the run']),
  ];
  return dimension(verdictOf(stopped, true), 'cli-record', stopped);
}

/**
 * Artifacts, terminal state, CLI-recorded receipts and schema-valid payloads. Artifacts
 * and payloads are provable from the captured fixture alone, so those verdicts hold even
 * where native tool visibility does not. State and receipts additionally consume the
 * observed operations, because a well-formed artifact says nothing about WHO wrote it —
 * hence their `cli-record` evidence label.
 */
function judgeFixtureEvidence(before: Record<string, string>, after: Record<string, string>, oracle: ScenarioOracle,
  operations: NativeOperation[], root: string) {
  // Who WROTE a governed metadata file cannot be settled from a native trace. Two
  // approaches failed: enumerating the model's write shapes (round-3 C3-1 patched the
  // write tool, round-4 S4-1 walked in through shell redirection), and then requiring a
  // matching CLI invocation, which made a legitimate `verify record` / `archive`
  // transition permanently unprovable (round-5 C5-1). These dimensions are therefore
  // DISCLOSED rather than certified (see NATIVE_CERTIFIED): an observed direct touch is
  // still reported, because it is real signal, but nothing here gates completion.
  const governed = new Set([...Object.keys(oracle.required_states), ...Object.keys(oracle.required_log_skills)]);
  const touched = operations.filter((operation) => operation.completed && (
    (operation.kind === 'write' && operation.path !== null && governed.has(operation.path)) ||
    (operation.kind === 'command' && commandPaths(operation.args, root).some((path) => governed.has(path)))))
    .flatMap((operation) => operation.kind === 'write' ? [operation.path!] : commandPaths(operation.args, root).filter((path) => governed.has(path)));
  const authored = [...new Set(touched)].map((path) => `Model-authored change metadata, not a CLI record: ${path}`);
  const artifactFailures = [
    ...oracle.required_files.filter((path) => !decode(after, path)?.trim()).map((path) => `Missing artifact: ${path}`),
    ...oracle.forbidden_files.filter((path) => Object.hasOwn(after, path)).map((path) => `Forbidden artifact: ${path}`),
  ];
  const states: string[] = [];
  const receipts: string[] = [];
  const metadataOf = (path: string) => changeMetadataOf(decode(after, path), path);
  for (const [path, status] of Object.entries(oracle.required_states)) {
    try { if (!stateMatches(metadataOf(path), status)) states.push(`Unexpected state in ${path}: expected ${status}`); }
    catch { states.push(`Unreadable change metadata: ${path}`); }
  }
  for (const [path, skills] of Object.entries(oracle.required_log_skills)) {
    try {
      const metadata = metadataOf(path);
      for (const skill of skills) {
        if (!hasVerifierReceipt(metadata, skill)) receipts.push(`Missing CLI-recorded receipt in ${path}: ${skill}`);
      }
    } catch { receipts.push(`Unreadable change metadata: ${path}`); }
  }
  // Payload candidates are the JSON files this run actually produced or rewrote.
  const produced = Object.keys(after).filter((path) => path.endsWith('.json') && after[path] !== before[path]);
  const payloadPaths = new Map<PayloadKind, string[]>();
  const payloadFailures: string[] = [];
  for (const kind of oracle.payloads) {
    // EVERY schema-valid candidate, not the first: picking one lets a parent-written
    // receipt hide behind another valid payload that happens to come earlier.
    const matches = produced.filter((path) => {
      try { return validatePayload(kind, JSON.parse(decode(after, path) ?? '')).success; } catch { return false; }
    });
    if (matches.length) payloadPaths.set(kind, matches); else payloadFailures.push(`No schema-valid payload for ${kind}`);
  }
  // Each dimension carries only its OWN diagnostics: sharing one array made
  // `cli_receipts` report the state's failures and vice versa (round-5 C5-3).
  // `states` is the ARTIFACT verdict, kept apart from `authored`: the terminal-state
  // question `endpoint` asks is whether the change is parked where the oracle says, and
  // a disclosed authorship observation must not leak into that certified dimension.
  return {
    states, authored, payloadPaths, handWritten: [...new Set(touched)],
    dimensions: {
      artifacts: dimension(verdictOf(artifactFailures, true), 'artifact', artifactFailures),
      state: dimension(verdictOf([...states, ...authored], true), 'artifact', [...states, ...authored]),
      cli_receipts: dimension(verdictOf([...receipts, ...authored], true), 'artifact', [...receipts, ...authored]),
      payloads: dimension(verdictOf(payloadFailures, true), 'artifact', payloadFailures),
    } satisfies Partial<Record<DimensionName, Dimension>>,
  };
}


/**
 * The dimensions that depend on OBSERVED tools. Native visibility is incomplete, so
 * every one of these is a positive detector: a satisfied negative dimension means no
 * violation was seen, never that none occurred.
 */
function judgeObservedPolicies(operations: NativeOperation[], oracle: ScenarioOracle) {
  const observed = {} as Record<DimensionName, Dimension>;
  const reads = new Set(operations.filter((operation) => operation.kind === 'read' && operation.completed).map((operation) => operation.path));
  const missingReads = oracle.required_reads.filter((path) => !reads.has(path)).map((path) => `Unobserved required read: ${path}`);
  observed.required_reads = dimension(missingReads.length ? 'unobserved' : 'satisfied', 'observed-tools', missingReads);
  const forbiddenReads = oracle.forbidden_reads.filter((path) => reads.has(path)).map((path) => `Forbidden read observed: ${path}`);
  observed.forbidden_reads = dimension(forbiddenReads.length ? 'violated' : 'satisfied', 'observed-tools', forbiddenReads);
  // An attempt counts even when the CLI denied it: reaching outside the fixture is the
  // signal, and the frozen bundle carries the very instructions under measurement.
  const external = operations.filter((operation) => operation.external)
    .map((operation) => `${operation.kind} attempted outside the project root: ${operation.path}`);
  observed.external_reads = dimension(external.length ? 'violated' : 'satisfied', 'observed-tools', external);

  // Each chained segment is judged on its own verbs; the policy names the CLI verb.
  const commands = operations.filter((operation) => operation.kind === 'command')
    .flatMap((operation) => commandSegments(operation.args).map((segment) => ({ completed: operation.completed, ...segment })));
  const forbiddenCommands = commands.filter(({ verbs }) => oracle.forbidden_commands.some((rule) => commandMatches(verbs, rule)))
    .map(({ verbs }) => `Forbidden command observed: ${verbs.join(' ')}`);
  observed.forbidden_commands = dimension(forbiddenCommands.length ? 'violated' : 'satisfied', 'observed-tools', forbiddenCommands);
  const required = oracle.required_commands.filter((args) => !commands.some((observed) =>
    observed.completed && JSON.stringify(observed.verbs) === JSON.stringify(args)))
    .map((args) => `Unobserved required command: ${args.join(' ')}`);
  observed.required_commands = dimension(required.length ? 'unobserved' : 'satisfied', 'cli-record', required);
  // A read-only scenario grants no write or delegation, so either one observed is a violation.
  const writes = oracle.allow_writes ? [] : operations.filter((operation) => operation.kind === 'write')
    .map((operation) => `Write in a read-only scenario: ${operation.path}`);
  observed.write_policy = dimension(writes.length ? 'violated' : 'satisfied', 'observed-tools', writes);
  const delegations = oracle.allow_delegation ? [] : operations.filter((operation) => operation.kind === 'delegate')
    .map(() => 'Delegation in a scenario that forbids it');
  observed.delegation_policy = dimension(delegations.length ? 'violated' : 'satisfied', 'observed-tools', delegations);
  // Delegation pending/timeout transitions are gateway state; a native trace has none.
  observed.delegation_signals = dimension(oracle.required_signals.length ? 'unobserved' : 'satisfied',
    oracle.required_signals.length ? 'none' : 'observed-tools',
    oracle.required_signals.length ? ['Native capture cannot observe delegation state transitions'] : []);
  // Only the suite actually EXECUTED counts: reading or grepping it is not a run,
  // and a refused invocation never reached the suite at all.
  const suiteRuns = commands.filter(({ completed, executable }) =>
    completed && executable !== null && basename(executable) === 'suite.cjs').length;
  const suiteDetail = suiteRuns === oracle.suite_runs ? [] : [`Observed ${suiteRuns} suite runs, expected ${oracle.suite_runs}`];
  observed.suite_runs = dimension(suiteRuns > oracle.suite_runs ? 'violated' : suiteRuns === oracle.suite_runs ? 'satisfied' : 'unobserved',
    'observed-tools', suiteDetail);

  const forbiddenActions = forbiddenReads.length + forbiddenCommands.length + external.length +
    writes.length + delegations.length +
    operations.filter((operation) => operation.kind === 'write' && operation.path && oracle.forbidden_files.includes(operation.path)).length;
  return { dimensions: observed, forbiddenActions, suiteRuns };
}


/**
 * Independence of a required receipt. A parent write contradicts it under both
 * standards; an unattributable file that only appeared after delegation is credited
 * under `graded` alone, because AGY's subagent tools never enter the parent stream.
 */
function judgeIndependentReceipt(operations: NativeOperation[], payloadPaths: Map<PayloadKind, string[]>,
  before: Record<string, string>, oracle: ScenarioOracle): Dimension {
  const independence: string[] = [];
  let strictReceipts = true; let gradedReceipts = true; let evidence: Evidence = 'none';
  for (const kind of oracle.required_receipts) {
    const paths = payloadPaths.get(kind) ?? [];
    const writes = operations.filter((operation) => operation.kind === 'write' && operation.path !== null && paths.includes(operation.path));
    if (!paths.length) { strictReceipts = false; gradedReceipts = false; continue; }
    if (writes.some((operation) => operation.actor === 'parent')) {
      independence.push(`Controller-visible parent write to ${kind} receipt: ${writes.find((operation) => operation.actor === 'parent')!.path}`);
      strictReceipts = false; gradedReceipts = false; evidence = 'observed-tools';
    } else if (writes.some((operation) => operation.actor === 'child')) {
      if (evidence === 'none') evidence = 'attributed';
    } else {
      // No attributable author: only delegation plus a newly appeared file supports it.
      strictReceipts = false;
      evidence = 'inferred-from-absence';
      if (!operations.some((operation) => operation.kind === 'delegate') || paths.every((path) => Object.hasOwn(before, path))) gradedReceipts = false;
    }
  }
  return { strict: independence.length ? 'violated' : strictReceipts ? 'satisfied' : 'unobserved',
    graded: independence.length ? 'violated' : gradedReceipts ? 'satisfied' : 'unobserved', evidence, detail: independence };
}

/**
 * Which stations this run actually reached, and whether it stopped where the oracle
 * says. `strict` counts frozen-CLI mutations only; `graded` also counts reading that
 * station's own skill, without which a diagnostic station is permanently unobservable.
 */
function judgeRoutes(operations: NativeOperation[], oracle: ScenarioOracle, states: string[]) {
  const executed = stationsFromCommands(operations);
  // A `handoff` terminal names the station the change is handed TO; it runs no
  // station work, so its evidence is the parked state, not an invocation.
  const executable = oracle.terminal === 'handoff' ? oracle.routes.slice(0, -1) : [...oracle.routes];
  // A mutation at an unexpected station is a wrong route; reading another station's
  // skill is exploration, so extra reads never manufacture a violation.
  const extra = executed.filter((station, index) => executable[index] !== station);
  const routeDetail = extra.length ? [`Unexpected station sequence: ${executed.join(' → ') || 'none'}`] : [];
  const parked = oracle.terminal !== 'handoff' || states.length === 0;
  const strictRoute = executed.length === executable.length && executable.every((station, index) => executed[index] === station);
  // Graded evidence adds the station's own skill read: a diagnostic station mutates
  // nothing, so demanding a CLI record there would make it permanently unobservable.
  const evidenceAt = (station: SddStation) => operations.findIndex((operation) => operation.completed &&
    ((operation.kind === 'command' && frozenCliSegments(operation.args).some((segment) => stationOfCommand(segment.verbs) === station)) ||
      (operation.kind === 'read' && operation.path === `.agents/skills/${STATION_SKILLS[station]}/SKILL.md`)));
  const routeEvidence = executable.map(evidenceAt);
  const gradedRoute = routeEvidence.every((at, index) => at >= 0 && (index === 0 || at > routeEvidence[index - 1]!));
  const handoffCredit = (proven: boolean) => oracle.terminal === 'handoff' && proven && parked ? 1 : 0;
  const routeCorrect = {
    strict: executable.filter((station, index) => executed[index] === station).length + handoffCredit(strictRoute),
    graded: routeEvidence.filter((at) => at >= 0).length + handoffCredit(gradedRoute),
  };
  const routes_ = dimension(verdictOf(routeDetail, strictRoute && parked), 'cli-record', routeDetail,
    verdictOf(routeDetail, gradedRoute && parked));
  const endpoint = (proven: boolean): Outcome => routeDetail.length > 0 || states.length > 0 ? 'violated'
    : proven && parked ? 'satisfied' : 'unobserved';
  const endpoint_ = dimension(endpoint(strictRoute), 'artifact',
    strictRoute && parked ? [] : [`Terminal ${oracle.terminal} not proven by station evidence and parked state`],
    endpoint(gradedRoute));
  return { dimensions: { routes: routes_, endpoint: endpoint_ } satisfies Partial<Record<DimensionName, Dimension>>, routeCorrect };
}

/**
 * Adjudicate one native capture against its oracle under two evidence standards:
 * `strict` credits only directly attributed observations, `graded` additionally
 * credits delegation that can only be inferred from the absence of a parent write.
 * Neither standard turns a process exit code, a SUCCESS record or narrated text
 * into workflow completion.
 */
export function adjudicateNativeCapture(input: unknown, expected: ScenarioOracle) {
  const capture = NativeCaptureSchema.parse(input);
  const oracle = OracleSchema.parse(expected);
  const { cli, model } = capture.identity.executor;
  if (capture.identity.scenario.id !== oracle.id) throw new Error('Capture and oracle scenario identity mismatch');
  const root = capture.identity.project_root;
  const before = capture.before.artifacts.files;
  const after = capture.after.artifacts.files;
  const operations = observeNativeOperations(cli, capture.transport.observation.records, root);
  const dimensions = {} as Record<DimensionName, Dimension>;
  const observation = capture.transport.observation;
  dimensions.execution = judgeExecution(capture);
  const fixture = judgeFixtureEvidence(before, after, oracle, operations, root);
  Object.assign(dimensions, fixture.dimensions);
  const { states, payloadPaths } = fixture;

  dimensions.independent_receipt = judgeIndependentReceipt(operations, payloadPaths, before, oracle);
  const routes = judgeRoutes(operations, oracle, states);
  Object.assign(dimensions, routes.dimensions);
  const { routeCorrect } = routes;
  const policies = judgeObservedPolicies(operations, oracle);
  Object.assign(dimensions, policies.dimensions);
  const { suiteRuns } = policies;
  // A model-authored metadata write is itself a forbidden action, not merely weak evidence.
  const forbiddenActions = policies.forbiddenActions + fixture.handWritten.length;
  const missing = NATIVE_DIMENSIONS.filter((name) => !Object.hasOwn(dimensions, name));
  if (missing.length) throw new Error(`Unjudged dimensions: ${missing.join(', ')}`);
  const metrics = (standard: 'strict' | 'graded') => {
    // Certified dimensions only: a disclosed one is reported, never scored.
    const failures = NATIVE_CERTIFIED.filter((name) => dimensions[name][standard] !== 'satisfied');
    // Only a contradicted CERTIFIED dimension turns a claimed success into a false PASS;
    // a dimension this evaluator cannot establish leaves the run incomplete at most.
    const contradicted = NATIVE_CERTIFIED.some((name) => dimensions[name][standard] === 'violated');
    return { complete: failures.length === 0, failures: [...failures],
      route_correct: routeCorrect[standard], route_expected: oracle.routes.length,
      payload_valid: payloadPaths.size, payload_expected: oracle.payloads.length,
      forbidden_actions: forbiddenActions,
      false_pass: contradicted && observation.terminal_success ? 1 : 0,
      suite_runs: suiteRuns, unnecessary_test_runs: Math.max(0, suiteRuns - oracle.suite_runs) };
  };
  // What this run actually loaded from the shipped instructions — the quantity this
  // change exists to reduce. Skipping a mandatory file reads less; that is a finding
  // about the run, never a smaller requirement.
  const instruction = /^\.agents\/skills\/([a-z0-9-]+)\//;
  const context = observedLedger(operations.filter((operation) =>
    operation.kind === 'read' && operation.completed && operation.path && instruction.test(operation.path))
    .map((operation) => ({ path: operation.path!, content: decode(before, operation.path!) ?? decode(after, operation.path!),
      station: SKILL_STATIONS.get(instruction.exec(operation.path!)![1]!) ?? 'other' })));
  return { version: 1 as const, scenario: oracle.id, cli, model, project_root: root, context,
    digests: { config: capture.identity.config_digest, runtime: capture.identity.runtime_digest,
      instructions: capture.identity.instructions_digest },
    transport: { exit_code: capture.transport.exit_code, duration_ms: capture.transport.duration_ms,
      terminal_success: observation.terminal_success, records: observation.records.length, parse_errors: observation.parse_errors.length },
    operations: operations.length, dimensions,
    metrics: { strict: NativeMetricsSchema.parse(metrics('strict')), graded: NativeMetricsSchema.parse(metrics('graded')) },
    certified: [...NATIVE_CERTIFIED],
    disclosed: Object.fromEntries(NATIVE_DISCLOSED.map((name) =>
      [name, { strict: dimensions[name].strict, graded: dimensions[name].graded, detail: dimensions[name].detail }])),
    disclosure: [
      `Completion is scored over the certified dimensions only (${NATIVE_CERTIFIED.join(', ')}). The rest — ${NATIVE_DISCLOSED.join(', ')} — are reported and never scored: a native trace cannot establish who authored an artifact, and its negative detectors only ever prove that no violation was SEEN.`,
      'Native tool visibility is incomplete: a satisfied negative dimension means no violation was observed, not that none occurred.',
      'The strict standard credits only directly attributed operations; the graded standard also credits delegation inferred from the absence of a parent write.',
      cli === 'agy' ? 'AGY does not report a subagent\'s own tool calls, so delegated authorship is never directly attributable.'
        : 'Claude attributes delegated tool calls through parent_tool_use_id.',
      'Remote provider cancellation and CLI-internal turns remain unverified; this is one capture, not a certified comparison.',
      ...(oracle.required_signals.length ? ['This scenario expects delegation state transitions that a native capture cannot observe; it cannot be completed natively.'] : []),
    ] };
}
export type NativeAdjudication = ReturnType<typeof adjudicateNativeCapture>;
