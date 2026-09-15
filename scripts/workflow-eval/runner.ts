import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite } from '../../src/lib/fs-utils.js';
import { isContainedPath } from '../../src/lib/knowledge-reader.js';
import type { SddStation } from '../../src/types/status.js';
import { ActionSchema, FixturePathSchema, validatePayload, type Action, type PayloadKind, type EventInput, type TraceEvent, type Scenario, type ObservedRun, type EvaluationConfig } from './protocol.js';
import { assertOwnedFixture, fixtureCliArgs, suiteCount, suiteResults, prepareFixture, disposeFixture } from './fixtures.js';
import { digest } from './context.js';
import { boundedProcess } from './process.js';
import type { ExecutorResponse, Message } from './executor.js';

/** One resolver for every model-controlled read, write and CLI payload path. */
export async function confinedPath(cwd: string, name: string): Promise<string> {
  assertOwnedFixture(cwd);
  FixturePathSchema.parse(name);
  if (/(^|\/)(private|[^/]*oracle[^/]*)(\/|$)/i.test(name)) throw new Error('Private evaluator data is inaccessible');
  const root = await lstat(cwd);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Invalid workspace root');
  let current = cwd;
  for (const part of name.split('/')) {
    current = join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !isContainedPath(current, cwd)) throw new Error('Symlink or containment escape');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // All existing ancestors were checked. Only this controller writes here;
      // an untrusted local process mutating the tree is outside the threat model.
    }
  }
  return current;
}

const rules: Record<string, { switches: string[]; values: string[] }> = {
  status: { switches: ['--json'], values: [] },
  check: { switches: ['--json', '--record-review', '--record-tests'], values: ['--change'] },
  'change tasks': { switches: [], values: ['--change'] },
  'change progress': { switches: [], values: ['--change'] },
  'change status tasks': { switches: [], values: ['--change'] },
  'change status plan': { switches: [], values: ['--change'] },
  'change log': { switches: [], values: ['--change', '--skill', '--verifier-report', '--result', '--warning'] },
  'verify record': { switches: [], values: ['--change', '--dimensions'] },
  'review merge': { switches: [], values: ['--change', '--findings', '--round', '--lenses'] },
};
const payloadFlags = ['--dimensions', '--findings', '--verifier-report'];
type DelegateAction = Extract<Action, { kind: 'delegate' }>;
interface GatewayExecution {
  timeoutMs: number; signal?: AbortSignal;
  delegate?: (action: DelegateAction, context: Record<string, string>) => Promise<{ content: string; usage: ExecutorResponse['usage'] }>;
}

export class Gateway {
  readonly events: TraceEvent[] = [];
  finished = false;
  private station: SddStation = 'story';
  private polls = 0;
  private readonly changes: Set<string>;
  private receipts = new Map<string, { digest: string; schema: PayloadKind }>();
  constructor(private readonly fixture: { cwd: string; initialSuiteCount: number }, private readonly scenario: Scenario, private readonly maxBytes: number,
    private readonly execution: GatewayExecution = { timeoutMs: 15000 }) {
    assertOwnedFixture(fixture.cwd);
    this.changes = new Set(Object.keys(scenario.files).flatMap((p) => /^\.prospec\/changes\/([^/]+)\/metadata.yaml$/.exec(p)?.[1] ?? []));
  }
  record(event: EventInput): void { this.events.push({ ...event, seq: this.events.length + 1 }); }
  private async cliAllowed(args: string[]): Promise<void> {
    const key = Object.keys(rules).sort((a, b) => b.length - a.length).find((k) => k.split(' ').every((part, i) => args[i] === part));
    if (!key) throw new Error('CLI command is not allowed');
    const rule = rules[key]!;
    const seen = new Set<string>();
    for (let i = key.split(' ').length; i < args.length; i++) {
      const flag = args[i]!;
      if (seen.has(flag)) throw new Error('Repeated CLI flag');
      seen.add(flag);
      if (rule.switches.includes(flag)) continue;
      if (!rule.values.includes(flag)) throw new Error('CLI argument is not allowed');
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing CLI argument');
      if (flag === '--change' && !this.changes.has(value)) throw new Error('Unknown target change');
      if (payloadFlags.includes(flag)) {
        const payload = await confinedPath(this.fixture.cwd, value);
        const stat = await lstat(payload);
        if (!stat.isFile() || stat.size > this.maxBytes) throw new Error('CLI payload size/type refused');
        const receipt = this.receipts.get(value);
        const schema = flag === '--dimensions' ? 'verify' : flag === '--findings' ? 'review' : args[args.indexOf('--skill') + 1];
        if (!receipt || receipt.schema !== schema || receipt.digest !== digest(await readFile(payload, 'utf8'))) throw new Error('Missing or edited independent receipt');
      }
    }
    if (key !== 'status' && !seen.has('--change')) throw new Error('Explicit target required');
    const change = args[args.indexOf('--change') + 1];
    for (const flag of payloadFlags) {
      const index = args.indexOf(flag);
      if (index >= 0 && !args[index + 1]!.startsWith(`.prospec/changes/${change}/`)) throw new Error('Receipt belongs to another change');
    }
  }
  private async applyRead(action: Extract<Action, { kind: 'read' }>): Promise<{ ok: boolean; text: string; halt?: 'timeout' | 'error' | 'forbidden' | 'budget' | 'limit' }> {
    const target = await confinedPath(this.fixture.cwd, action.path);
    const stat = await lstat(target);
    if (!stat.isFile() || stat.size > this.maxBytes) throw new Error('Read size/type refused');
    const content = await readFile(target, 'utf8');
    const category = action.path.endsWith('/SKILL.md') ? 'skill' : action.path.includes('/references/') ? 'reference' : 'other';
    this.record({ kind: 'read', path: action.path, digest: digest(content), content, category, station: this.station });
    return { ok: true, text: content };
  }

  private async applyWrite(action: Extract<Action, { kind: 'write' }>): Promise<{ ok: boolean; text: string; halt?: 'timeout' | 'error' | 'forbidden' | 'budget' | 'limit' }> {
    const target = await confinedPath(this.fixture.cwd, action.path);
    const match = /^\.prospec\/changes\/([^/]+)\/([^/]+\.(md|json))$/.exec(action.path);
    if (!match || !this.changes.has(match[1]!)) throw new Error('Only change Markdown/JSON artifacts may be written');
    await atomicWrite(target, action.content);
    this.record({ kind: 'write', path: action.path, digest: digest(action.content) });
    return { ok: true, text: 'Artifact written' };
  }

  private async applyDelegate(action: Extract<Action, { kind: 'delegate' }>): Promise<{ ok: boolean; text: string; halt?: 'timeout' | 'error' | 'forbidden' | 'budget' | 'limit' }> {
    if (!this.execution.delegate || this.scenario.delegation) throw new Error('Fresh delegation unavailable or already pending');
    const target = await confinedPath(this.fixture.cwd, action.path);
    const match = /^\.prospec\/changes\/([^/]+)\/[^/]+\.json$/.exec(action.path);
    if (!match || !this.changes.has(match[1]!)) throw new Error('Receipt target refused');
    const context: Record<string, string> = {};
    for (const path of action.reads) {
      const file = await confinedPath(this.fixture.cwd, path);
      const stat = await lstat(file);
      if (!stat.isFile() || stat.size > this.maxBytes) throw new Error('Delegated context size/type refused');
      const content = await readFile(file, 'utf8');
      context[path] = content;
      this.record({ kind: 'delegation-read', path, content, digest: digest(content), station: this.station,
        category: path.endsWith('/SKILL.md') ? 'skill' : path.includes('/references/') ? 'reference' : 'other' });
    }
    let response: Awaited<ReturnType<NonNullable<GatewayExecution['delegate']>>>;
    try { response = await this.execution.delegate(action, context); }
    catch (error) {
      const reason = error instanceof Error ? error.message : 'Delegated execution failed';
      this.record({ kind: 'error', reason });
      this.record({ kind: 'usage-unavailable', reason: 'Delegated execution failed' });
      return { ok: false, text: reason, halt: /request limit/i.test(reason) ? 'limit' : /budget/i.test(reason) ? 'budget' : /timeout|abort/i.test(reason) ? 'timeout' : 'error' };
    }
    this.record(response.usage ? { kind: 'usage', ...response.usage } : { kind: 'usage-unavailable', reason: 'Delegated usage unavailable' });
    let valid = false;
    let errors = ['Invalid delegated JSON'];
    try {
      const result = validatePayload(action.schema, JSON.parse(response.content));
      valid = result.success; errors = result.success ? [] : result.error.issues.map((i) => i.message);
    } catch { /* Keep invalid first-response evidence. */ }
    if (valid) {
      await atomicWrite(target, response.content);
      this.receipts.set(action.path, { digest: digest(response.content), schema: action.schema });
    }
    this.record({ kind: 'payload', schema: action.schema, path: action.path, valid, errors, source: 'fresh-executor' });
    return { ok: valid, text: valid ? `Independent receipt written: ${action.path}` : errors.join('; ') };
  }

  private async applySubmit(action: Extract<Action, { kind: 'submit' }>): Promise<{ ok: boolean; text: string; halt?: 'timeout' | 'error' | 'forbidden' | 'budget' | 'limit' }> {
    const target = await confinedPath(this.fixture.cwd, action.path);
    if ((await lstat(target)).size > this.maxBytes) throw new Error('Payload size refused');
    let valid = false;
    let errors = ['Invalid JSON'];
    try {
      const result = validatePayload(action.schema, JSON.parse(await readFile(target, 'utf8')));
      valid = result.success; errors = result.success ? [] : result.error.issues.map((i) => i.message);
    } catch { /* Invalid JSON is an observed first-submission failure. */ }
    this.record({ kind: 'payload', schema: action.schema, path: action.path, valid, errors, source: 'submission' });
    return { ok: valid, text: valid ? 'Payload schema valid; not a delegated receipt by itself.' : errors.join('; ') };
  }

  private async applyCli(action: Extract<Action, { kind: 'cli' }>): Promise<{ ok: boolean; text: string; halt?: 'timeout' | 'error' | 'forbidden' | 'budget' | 'limit' }> {
    await this.cliAllowed(action.args);
    const before = await suiteCount(this.fixture.cwd);
    let output: string;
    let code = 0;
    try {
      const result = await boundedProcess({ command: process.execPath, args: fixtureCliArgs(action.args, this.fixture.cwd), cwd: this.fixture.cwd,
        input: '', timeoutMs: this.execution.timeoutMs, maxBytes: this.maxBytes, signal: this.execution.signal });
      output = result.output; code = result.exitCode ?? 1;
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : 'CLI transport failed';
      this.record({ kind: 'error', reason });
      return { ok: false, text: reason, halt: /timeout|abort/i.test(reason) ? 'timeout' : 'error' };
    } finally {
      const count = await suiteCount(this.fixture.cwd);
      const results = await suiteResults(this.fixture.cwd);
      for (let i = before; i < count; i++) this.record({ kind: 'suite', exit_code: results[i] ?? null });
    }
    output = Buffer.from(output).subarray(0, this.maxBytes).toString('utf8');
    this.record({ kind: 'command', args: action.args, exit_code: code, output });
    return { ok: code === 0, text: output };
  }

  async apply(raw: unknown): Promise<{ ok: boolean; text: string; halt?: 'timeout' | 'error' | 'forbidden' | 'budget' | 'limit' }> {
    this.record({ kind: 'attempt', action: raw });
    try {
      if (this.finished) throw new Error('Run already finished');
      if (Buffer.byteLength(JSON.stringify(raw) ?? '') > this.maxBytes) throw new Error('Action bytes exceeded');
      const action = ActionSchema.parse(raw);
      switch (action.kind) {
        case 'route':
          this.station = action.station; this.record(action); return { ok: true, text: `Route: ${action.station}` };
        case 'finish':
          this.finished = true; this.record(action); return { ok: true, text: action.message };
        case 'wait': {
          const delegation = this.scenario.delegation;
          if (!delegation || action.delegation_id !== delegation.id) throw new Error('Unknown delegated task');
          const state = delegation.polls[Math.min(this.polls++, delegation.polls.length - 1)]!;
          this.record({ kind: 'delegation', delegation_id: delegation.id, state });
          return { ok: true, text: `Delegated task ${delegation.id}: ${state}; no receipt supplied.` };
        }
        case 'read': return await this.applyRead(action);
        case 'write': return await this.applyWrite(action);
        case 'delegate': return await this.applyDelegate(action);
        case 'submit': return await this.applySubmit(action);
        case 'cli': return await this.applyCli(action);
      }
    } catch {
      const reason = 'Action refused by the workspace/command policy';
      this.record({ kind: 'denied', reason });
      return { ok: false, text: reason, halt: 'forbidden' };
    }
  }
}

export interface RunOptions {
  scenario: Scenario; identity: ObservedRun['identity']; source: ObservedRun['source'];
  instructions: Record<string, string>; limits: EvaluationConfig;
  runtimeCli?: string;
  executor: { request(messages: Message[], signal?: AbortSignal): Promise<ExecutorResponse> };
  delegateExecutor?: { request(messages: Message[], signal?: AbortSignal): Promise<ExecutorResponse> };
}

/**
 * One fresh-context report request: the delegate receives only the selected files and
 * the prompt — no conversation, no prior verdict — and must answer with a write of the
 * requested path. Anything else is refused rather than accepted as a receipt.
 */
function freshReportDelegate(executor: NonNullable<RunOptions['delegateExecutor']>, signal: AbortSignal):
  NonNullable<GatewayExecution['delegate']> {
  return async (action, context) => {
    const response = await executor.request([{ role: 'user', content: JSON.stringify({
      task: action.prompt, schema: action.schema, context,
      instruction: `Independently evaluate these artifacts. Return one write action for ${action.path} whose content is the schema-valid JSON report. No conversation or prior verdict is supplied.`,
    }) }], signal);
    const write = ActionSchema.parse(response.action);
    if (write.kind !== 'write' || write.path !== action.path) throw new Error('Delegated report response refused');
    return { content: write.content, usage: response.usage };
  };
}

/** Public inputs only. The private oracle is deliberately absent from this API. */
export async function runScenario(options: RunOptions): Promise<ObservedRun> {
  if (process.platform === 'win32') throw new Error('Process-group termination unavailable on this platform');
  let fixture: Awaited<ReturnType<typeof prepareFixture>>;
  try { fixture = await prepareFixture(options.scenario, options.instructions, options.runtimeCli); }
  catch {
    return { version: 1, identity: options.identity, source: options.source, events: [{ seq: 1, kind: 'error', reason: 'Fixture preparation failed' }],
      files: {}, duration_ms: 0, stop_reason: 'error' };
  }
  const controller = new AbortController();
  const started = performance.now();
  const timer = setTimeout(() => controller.abort(), options.limits.timeout_ms);
  const gateway = new Gateway(fixture, options.scenario, options.limits.max_output_bytes,
    { timeoutMs: options.limits.timeout_ms, signal: controller.signal,
      delegate: options.delegateExecutor ? freshReportDelegate(options.delegateExecutor, controller.signal) : undefined });
  let stop_reason: ObservedRun['stop_reason'] = 'limit';
  const files: Record<string, string> = {};
  try {
    const messages: Message[] = [{ role: 'user', content: JSON.stringify({ task: options.scenario.task,
      entry_skill: options.scenario.entry_skill, files: Object.keys(options.scenario.files),
      instruction_paths: Object.keys(options.instructions),
      protocol: 'Propose one mediated action per response: read(path), write(path,content), cli(args), route(station), submit(schema,path), delegate(schema,path,prompt,reads), wait(delegation_id), finish(terminal,message,claims_pass). CLI args omit the prospec executable. No shell or direct filesystem tools. Delegate starts one fresh-context report request with only the selected files and prompt. A self-written schema-valid payload is not an independent receipt. Use the normal CLI sink after receiving an independent report.',
    }) }];
    for (let turn = 0; turn < options.limits.max_turns; turn++) {
      if (controller.signal.aborted) { stop_reason = 'timeout'; break; }
      const response = await options.executor.request(messages, controller.signal);
      gateway.record(response.usage ? { kind: 'usage', ...response.usage } : { kind: 'usage-unavailable', reason: 'Adapter supplied no usage' });
      const proposal = ActionSchema.safeParse(response.action);
      const addedActions = proposal.success && proposal.data.kind === 'delegate' ? 1 + proposal.data.reads.length : 1;
      if (gateway.events.filter((e) => e.kind === 'attempt' || e.kind === 'delegation-read').length + addedActions > options.limits.max_actions) {
        stop_reason = 'limit'; break;
      }
      const result = await gateway.apply(response.action);
      messages.push({ role: 'assistant', content: JSON.stringify(response.action) }, { role: 'tool', content: result.text });
      if (result.halt) { stop_reason = result.halt; break; }
      if (gateway.finished) { stop_reason = 'finished'; break; }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Execution failed';
    gateway.record({ kind: 'error', reason });
    gateway.record({ kind: 'usage-unavailable', reason: 'Execution ended without complete usage' });
    stop_reason = controller.signal.aborted || /timeout|abort/i.test(reason) ? 'timeout' : /request limit/i.test(reason) ? 'limit' : /budget/i.test(reason) ? 'budget' : 'error';
  } finally {
    clearTimeout(timer);
    try {
      for (const entry of await readdir(join(fixture.cwd, '.prospec/changes'), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const absolute = join(entry.parentPath, entry.name);
        const name = absolute.slice(fixture.cwd.length + 1).replaceAll('\\', '/');
        const target = await confinedPath(fixture.cwd, name);
        if ((await lstat(target)).size <= options.limits.max_output_bytes) files[name] = await readFile(target, 'utf8');
      }
    } finally { await disposeFixture(fixture.cwd); }
  }
  return { version: 1, identity: options.identity, source: options.source, events: gateway.events, files,
    duration_ms: performance.now() - started, stop_reason };
}
