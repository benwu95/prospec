import { mkdir, open, readFile, lstat, stat, unlink, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { atomicWrite } from '../../src/lib/fs-utils.js';
import { digest } from './context.js';
import { RequestQuota } from './executor.js';
import { fixtureCli, prepareFixture } from './fixtures.js';
import { AGY_COMMAND_GUIDANCE, AGY_FILE_GUIDANCE, CLAUDE_TOOL_GUIDANCE, NativeCliSchema, nativeArguments, runNativeCli } from './native.js';
import { FixturePathSchema, type Scenario } from './protocol.js';
import { boundedProcess } from './process.js';
import { captureNativeFiles } from './native-files.js';
import { DockerCapture } from './docker-capture.js';
export { captureNativeFiles } from './native-files.js';

const positive = z.number().int().positive().safe();
export const NativeConfigSchema = z.strictObject({
  version: z.literal(1), execution_mode: z.literal('native-subscription'),
  max_requests: positive, prior_requests: z.number().int().nonnegative().safe(),
  timeout_ms: positive, max_output_bytes: positive,
  executors: z.array(z.strictObject({ cli: NativeCliSchema, command: z.string().refine(isAbsolute),
    model: z.string().min(1), version: z.string().min(1), tier: z.enum(['stronger', 'cheaper']) })).length(2),
}).superRefine((config, ctx) => {
  if (new Set(config.executors.map((e) => e.cli)).size !== 2 || new Set(config.executors.map((e) => e.tier)).size !== 2 || config.prior_requests > config.max_requests)
    ctx.addIssue({ code: 'custom', message: 'Require both CLIs, both tiers and valid prior accounting' });
});
const LedgerSchema = z.strictObject({ version: z.literal(1), config_digest: z.string(), consumed: z.number().int().nonnegative().safe() });
const snapshotSchema = z.strictObject({ version: z.literal(1), instructions: z.record(FixturePathSchema, z.string()) });

// Both CLIs match an invoked command against their own allow rules literally, so a
// shell-safe path stays bare: quoting it turns an approved command into a denied one.
/**
 * The only host variables a native capture forwards to the MEASURED CLI. Locale,
 * terminal and CA settings keep it usable; HOME carries the cached subscription login.
 * A variable missing here surfaces as a launch failure — recoverable, unlike a leaked
 * secret. Docker's own settings are NOT here: they belong to the transport, not to the
 * model under measurement (see `DOCKER_ENV_KEYS` in `docker-capture.ts`).
 */
export const NATIVE_ENV_KEYS = ['PATH', 'HOME', 'SHELL', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'TERM', 'TMPDIR', 'TZ', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME',
  'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS'] as const;

const shellPath = (path: string) => /^[A-Za-z0-9_./-]+$/.test(path) ? path : JSON.stringify(path);

/**
 * Everything that must hold before a launch is reserved: a frozen standalone runtime,
 * the container's own identity, and an executable whose reported version still matches
 * the configured one. Refusing here costs no quota; refusing later costs a launch.
 */
async function preflightNativeExecutor(executor: { cli: string; command: string; version: string; model: string },
  runtimePath: string, docker: DockerCapture | undefined) {
  const runtime = resolve(runtimePath);
  if (!runtime.endsWith('.mjs') || !(await lstat(runtime)).isFile()) throw new Error('Require frozen standalone .mjs runtime');
  const runtimeDigest = digest(await readFile(runtime, 'utf8'));
  const dockerIdentity = docker ? await docker.preflight(runtimeDigest, executor.version) : undefined;
  if (!docker) {
    if (!(await stat(executor.command)).isFile()) throw new Error('Native CLI executable unavailable');
    const version = await boundedProcess({ command: executor.command, args: ['--version'], input: '', timeoutMs: 10000, maxBytes: 10000 });
    if (version.exitCode !== 0 || version.output.trim() !== executor.version) throw new Error('Native CLI version changed');
  }
  return { runtime, runtimeDigest, dockerIdentity };
}

/**
 * The launch prompt. Both executors get the SAME task text; only the per-CLI tool
 * guidance differs, and that guidance is appended only where the matching permission
 * scope actually exists (an unscoped session has no allow list to describe).
 */
function nativeLaunchPrompt(scenario: Scenario, projectRoot: string, runtimeNode: string, runtimePath: string,
  cli: string, docker: boolean, scoped: boolean) {
  const prompt = `${scenario.task}\n\nProject root: ${JSON.stringify(projectRoot)}. Resolve all project paths against this root and use it as the working directory for native commands and delegated work, even if a native tool starts elsewhere. If this root is unavailable, stop; do not search other projects for substitute instructions or artifacts.\n\nRead .agents/skills/${scenario.entry_skill}/SKILL.md and follow the supplied workflow. Use native tools. Work only in this disposable project; do not modify global settings, use billing fallbacks, or write to other projects. Do not commit, push, or publish. For every prospec invocation use this frozen CLI command instead of an installed executable: ${shellPath(runtimeNode)} ${shellPath(runtimePath)}. Stop at the requested scenario endpoint; do not invent independent receipts. Report blocked or unobservable steps honestly.`;
  // Claude guidance matches the scoped session settings; an unscoped session has no such allow list.
  const nativePrompt = prompt + (cli === 'agy'
    ? AGY_FILE_GUIDANCE + (docker ? AGY_COMMAND_GUIDANCE : '')
    : scoped ? CLAUDE_TOOL_GUIDANCE : '');
  return nativePrompt;
}

/**
 * The launch ledger, read under the caller's exclusive lock. Consumption only ever
 * moves forward and stays bound to this configuration's digest, so a crashed run
 * cannot be silently reset and a changed configuration cannot inherit its count.
 */
async function openLaunchQuota(ledgerPath: string, configDigest: string,
  config: { prior_requests: number; max_requests: number }): Promise<RequestQuota> {
  let consumed = config.prior_requests;
  try {
    const ledger = LedgerSchema.parse(JSON.parse(await readFile(ledgerPath, 'utf8')));
    if (ledger.config_digest !== configDigest || ledger.consumed < consumed) throw new Error('Native accounting identity mismatch');
    consumed = ledger.consumed;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (consumed >= config.max_requests) throw new Error('Request limit exhausted');
  return new RequestQuota(config.max_requests, consumed);
}

/**
 * The capture's identity record: what ran, against which frozen content, under which
 * permission scope. Written before the launch so a crashed run still identifies itself.
 */
function captureIdentity(context: {
  config: z.infer<typeof NativeConfigSchema>; executor: z.infer<typeof NativeConfigSchema>['executors'][number];
  cwd: string; projectRoot: string; docker: DockerCapture | undefined; dockerIdentity: unknown;
  dockerScope: DockerCapture['claudeScope'];
  scope: { cwd: string; runtime: string } | undefined; scopedPermissions: boolean;
  configDigest: string; runtimeDigest: string; snapshot: z.infer<typeof snapshotSchema>; scenario: Scenario;
}) {
  const { config, executor, cwd, projectRoot, docker, dockerIdentity, dockerScope, scope, scopedPermissions,
    configDigest, runtimeDigest, snapshot, scenario } = context;
  return { version: 1, mode: config.execution_mode, executor, cwd, project_root: projectRoot,
    ...(docker ? { docker: docker.config, docker_identity: dockerIdentity, docker_digest: digest(JSON.stringify(docker.config)) } : {}),
    config_digest: configDigest, runtime_digest: runtimeDigest, instructions_digest: digest(JSON.stringify(snapshot)),
    scoped_permissions: scopedPermissions,
    permission_args: nativeArguments(executor.cli, executor.model, '', config.timeout_ms, scope, dockerScope),
    scenario: scenario, workflow_verdict: 'unassessed', ambient_context: docker ? 'container-local; not comprehensively isolated' : 'not isolated',
    scope: 'Single native capture, not a certified baseline or comparison' };
}

/**
 * An ALLOWLIST, not a name denylist: a denylist forwards every credential variable
 * nobody thought to name. The cached subscription login lives in HOME, so it is
 * retained; nothing else that could carry a secret is passed.
 */
const forwardedEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {};
  for (const key of NATIVE_ENV_KEYS) if (process.env[key] !== undefined) env[key] = process.env[key];
  return env;
};

/** One explicit native scenario capture. Never passes its observations to the mediated scorer. */
export async function captureNativeScenario(options: {
  config: unknown; executor: string; scenario: Scenario; instructions: unknown; runtime: string;
  output: string; ledger: string;
  scopedPermissions?: boolean;
  docker?: unknown;
}) {
  const config = NativeConfigSchema.parse(options.config);
  const snapshot = snapshotSchema.parse(options.instructions);
  const executor = config.executors.find((e) => e.cli === options.executor);
  if (!executor) throw new Error('Unknown native executor');
  if (options.docker !== undefined && options.scopedPermissions) throw new Error('Docker cannot use host scoped permissions');
  const docker = options.docker === undefined ? undefined : new DockerCapture(options.docker);
  const dockerScope = docker?.claudeScope;
  // Validate session settings before preflight, fixture deployment, or quota reservation.
  if (dockerScope) nativeArguments(executor.cli, executor.model, '', config.timeout_ms, undefined, dockerScope);
  const { runtime, runtimeDigest, dockerIdentity } = await preflightNativeExecutor(executor, options.runtime, docker);
  const configDigest = digest(JSON.stringify(config));
  const ledgerPath = resolve(options.ledger);
  // Exclusive lock prevents concurrent launches or an accidental reset after a crash.
  const lock = await open(ledgerPath + '.lock', 'wx', 0o600);
  try {
    const quota = await openLaunchQuota(ledgerPath, configDigest, config);
    const output = resolve(options.output);
    await mkdir(output, { mode: 0o700 }); // Refuse overwrite/retry of an existing capture.
    const { cwd } = await prepareFixture(options.scenario, snapshot.instructions, runtime);
    if (docker) await docker.deploy(cwd);
    const projectRoot = docker?.config.target.cwd ?? cwd;
    const runtimeNode = docker?.config.node ?? process.execPath;
    const runtimePath = docker?.config.runtime ?? runtime;
    const files = () => docker ? docker.files() : captureNativeFiles(cwd);
    const scope = options.scopedPermissions ? { cwd: await realpath(cwd), runtime } : undefined;
    // Preserve this owned fixture, including failed runs, for independent inspection.
    const save = (name: string, value: unknown) => atomicWrite(join(output, name), JSON.stringify(value, null, 2) + '\n');
    const status = async () => { if (docker) return docker.status();
      try { return { output: fixtureCli(cwd, ['status']), error: null }; }
      catch { return { output: null, error: 'Source CLI status unavailable' }; } };
    await save('identity.json', captureIdentity({ config, executor, cwd, projectRoot, docker, dockerIdentity,
      dockerScope, scope, scopedPermissions: options.scopedPermissions === true, configDigest, runtimeDigest,
      snapshot, scenario: options.scenario }));
    await save('before.json', { artifacts: await files(), status: await status() });
    const nativePrompt = nativeLaunchPrompt(options.scenario, projectRoot, runtimeNode, runtimePath,
      executor.cli, docker !== undefined, scope !== undefined || dockerScope !== undefined);
    const result = await runNativeCli({ ...executor, prompt: nativePrompt, cwd, env: forwardedEnv(), quota, scope, dockerScope,
      ...(docker ? { docker: docker.config.target, command: docker.config.cli } : {}),
      timeoutMs: config.timeout_ms, maxBytes: config.max_output_bytes,
      beforeLaunch: async (count) => {
        await atomicWrite(ledgerPath, JSON.stringify({ version: 1, config_digest: configDigest, consumed: count }) + '\n');
        await save('launch.json', { prompt: nativePrompt, requests_consumed: count, state: 'reserved', recorded_at: new Date().toISOString() });
      } });
    await save('transport.json', result);
    await save('after.json', { artifacts: await files(), status: await status(),
      runtime_unchanged: runtimeDigest === (docker ? await docker.runtimeHash() : digest(await readFile(runtime, 'utf8'))) });
    return { cwd, output, requests_consumed: result.requests_consumed, workflow_verdict: 'unassessed' as const };
  } finally { await lock.close(); await unlink(ledgerPath + '.lock'); }
}
