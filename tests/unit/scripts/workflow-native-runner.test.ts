import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureNativeFiles, captureNativeScenario, NATIVE_ENV_KEYS, NativeConfigSchema } from '../../../scripts/workflow-eval/native-runner.js';
import { disposeFixture } from '../../../scripts/workflow-eval/fixtures.js';
import { ScenarioSchema } from '../../../scripts/workflow-eval/protocol.js';
import { main } from '../../../scripts/evaluate-workflow.js';
import { DockerCapture } from '../../../scripts/workflow-eval/docker-capture.js';
import { DOCKER_ENV_KEYS } from '../../../scripts/workflow-eval/native-docker.js';
import * as native from '../../../scripts/workflow-eval/native.js';

vi.setConfig({ testTimeout: 90_000 });
const roots: string[] = [];
const fixtures: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cwd of fixtures.splice(0)) await disposeFixture(cwd);
  for (const cwd of roots.splice(0)) await rm(cwd, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'native-runner-test-')); roots.push(root);
  const command = join(root, 'fake-cli');
  await writeFile(command, `#!${process.execPath}\nif(process.argv.includes('--version')){console.log('fake 1');process.exit(0)}\nrequire('node:fs').writeFileSync('native-result.md','actual artifact');console.log(JSON.stringify({event:'result',argv:process.argv.slice(2),result:{status:'SUCCESS',response:'PASS'}}));\n`);
  await chmod(command, 0o700);
  const runtime = join(root, 'runtime.mjs');
  await writeFile(runtime, await readFile('dist/cli-bundle.js'));
  const scenario = ScenarioSchema.parse(JSON.parse(await readFile('tests/fixtures/workflow-eval/public/quick.json', 'utf8')));
  const config = { version: 1, execution_mode: 'native-subscription', max_requests: 4, prior_requests: 2,
    timeout_ms: 10000, max_output_bytes: 10000, executors: [
      { cli: 'agy', command, model: 'test-model', version: 'fake 1', tier: 'cheaper' },
      { cli: 'claude', command, model: 'test-model', version: 'fake 1', tier: 'stronger' },
    ] };
  return { config, executor: 'agy', scenario, instructions: { version: 1, instructions: {} }, runtime,
    output: join(root, 'capture'), ledger: join(root, 'ledger.json') };
}

describe('native capture runner', () => {
  it('forwards only allowlisted host environment variables to the native CLI', async () => {
    const options = await setup();
    vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', 'x-api-key: leaked');
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'bedrock-token');
    vi.stubEnv('GH_TOKEN', 'gh-token');
    vi.stubEnv('NPM_TOKEN', 'npm-token');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-leaked');
    const launch = vi.spyOn(native, 'runNativeCli').mockImplementation(async (opts) => {
      const reservation = opts.quota.reserve();
      await opts.beforeLaunch?.(opts.quota.requestsConsumed);
      opts.quota.settle(reservation, null);
      return { stdout: '', stderr: '', exit_code: 0, failure: null, duration_ms: 1, requests_consumed: opts.quota.requestsConsumed,
        committed_usd: null, remote_cancellation: 'unverified', observation: native.observeNativeTrace('agy', '') };
    });
    const result = await captureNativeScenario(options); fixtures.push(result.cwd);
    const forwarded = Object.keys(launch.mock.calls[0]![0].env);
    // An allowlist, so a credential nobody named is excluded by construction.
    expect(forwarded.every((key) => (NATIVE_ENV_KEYS as readonly string[]).includes(key))).toBe(true);
    for (const leaked of ['ANTHROPIC_CUSTOM_HEADERS', 'AWS_BEARER_TOKEN_BEDROCK', 'GH_TOKEN', 'NPM_TOKEN', 'ANTHROPIC_API_KEY']) {
      expect(forwarded, leaked).not.toContain(leaked);
    }
    // The cached subscription login and executable lookup must survive.
    expect(forwarded).toContain('PATH');
    expect(NATIVE_ENV_KEYS).toContain('HOME');
    // Docker's own settings belong to the transport, not to the measured executor;
    // forwarding them here would both leak host config and still not reach the daemon.
    for (const key of ['DOCKER_HOST', 'DOCKER_CONFIG', 'DOCKER_CONTEXT']) {
      expect(NATIVE_ENV_KEYS as readonly string[], key).not.toContain(key);
      expect(DOCKER_ENV_KEYS as readonly string[], key).toContain(key);
    }
  });

  it.each(['agy', 'claude'])('routes Docker capture through container paths and persists the same shared launch ledger (%s)', async (executor) => {
    const options = await setup();
    const docker = { target: { command: '/bin/docker', container: 'a'.repeat(64), image: `sha256:${'b'.repeat(64)}`, uid: 1000, cwd: '/home/evaluator/fresh' },
      node: '/opt/node/bin/node', runtime: '/opt/eval/runtime.mjs', cli: `/home/evaluator/.local/bin/${executor}`,
      ...(executor === 'claude' ? { claude_write_directory: '/home/evaluator/fresh/.prospec/changes/x' } : {}) };
    const preflight = vi.spyOn(DockerCapture.prototype, 'preflight').mockResolvedValue({ target: docker.target,
      isolation: { mounts: [], network: 'bridge', memory: 100, cpus: 100, pids: 100 } });
    vi.spyOn(DockerCapture.prototype, 'deploy').mockResolvedValue();
    vi.spyOn(DockerCapture.prototype, 'files').mockResolvedValue({ encoding: 'base64', files: { 'container.md': 'YQ==' }, unavailable: [] });
    vi.spyOn(DockerCapture.prototype, 'status').mockResolvedValue({ output: 'container status', error: null });
    vi.spyOn(DockerCapture.prototype, 'runtimeHash').mockResolvedValue('changed');
    const launch = vi.spyOn(native, 'runNativeCli').mockImplementation(async (opts) => {
      const reservation = opts.quota.reserve();
      await opts.beforeLaunch?.(opts.quota.requestsConsumed);
      opts.quota.settle(reservation, null);
      return { stdout: '', stderr: '', exit_code: 0, failure: null, duration_ms: 1, requests_consumed: opts.quota.requestsConsumed,
        committed_usd: null, remote_cancellation: 'unverified', observation: native.observeNativeTrace('agy', '') };
    });
    const result = await captureNativeScenario({ ...options, executor, docker }); fixtures.push(result.cwd);
    expect(preflight).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/), 'fake 1');
    expect(launch.mock.calls[0]![0]).toMatchObject({ docker: docker.target, command: docker.cli });
    const prompt = launch.mock.calls[0]![0].prompt;
    expect(prompt).toContain(`Project root: "${docker.target.cwd}"`);
    // Shell-safe container paths stay unquoted so both CLIs' command allow rules match.
    expect(prompt).toContain(`${docker.node} ${docker.runtime}`);
    expect(prompt).not.toContain(`"${docker.node}"`);
    expect(prompt).not.toContain(result.cwd);
    expect(prompt).not.toContain(options.runtime);
    expect(prompt.includes('\n\nClaude session tools:\n')).toBe(executor === 'claude');
    expect(JSON.parse(await readFile(options.ledger, 'utf8')).consumed).toBe(3);
    const after = JSON.parse(await readFile(join(result.output, 'after.json'), 'utf8'));
    expect(after).toMatchObject({ artifacts: { files: { 'container.md': 'YQ==' } }, status: { output: 'container status' }, runtime_unchanged: false });
    const identity = JSON.parse(await readFile(join(result.output, 'identity.json'), 'utf8'));
    expect(identity.docker).toEqual(docker);
    expect(identity.docker_digest).toMatch(/^[a-f0-9]{64}$/);
    const sent = launch.mock.calls[0]![0];
    expect(identity.permission_args).toEqual(native.nativeArguments(sent.cli, sent.model, '', sent.timeoutMs, sent.scope, sent.dockerScope));
    if (executor === 'claude') expect(sent.dockerScope?.writeDirectory).toBe(docker.claude_write_directory);
    else expect(sent.dockerScope).toBeUndefined();
  });
  it('validates Docker capture configuration instead of silently running on the host', async () => {
    const options = await setup();
    await expect(captureNativeScenario({ ...options, docker: { target: { uid: 0 } } })).rejects.toThrow();
    await expect(readFile(options.ledger)).rejects.toThrow();
    await expect(captureNativeScenario({ ...options, docker: {}, scopedPermissions: true })).rejects.toThrow();
  });
  it.each(['agy', 'claude'])('records and sends ordinary-file guidance only for AGY (%s)', async (executor) => {
    const options = await setup();
    const result = await captureNativeScenario({ ...options, executor }); fixtures.push(result.cwd);
    const launch = JSON.parse(await readFile(join(result.output, 'launch.json'), 'utf8'));
    const transport = JSON.parse(await readFile(join(result.output, 'transport.json'), 'utf8'));
    const argv = transport.observation.records[0].argv as string[];
    expect(argv[argv.indexOf('-p') + 1]).toBe(launch.prompt);
    const guidance = launch.prompt.split('\n\nAGY file operations:\n')[1];
    if (executor === 'agy') {
      expect(guidance?.split('\n')).toEqual([
        '- Prospec documents and verifier JSON are ordinary project files, not Antigravity UI Artifacts.',
        '- For write_to_file, set IsArtifact=false and omit ArtifactMetadata; use native editing tools for existing files.',
        '- Do not create scratch or test files to probe permissions. Respect the configured write scope; this guidance grants no permissions.',
        '- If ordinary-file creation is unavailable, report the tool error and stop; do not work around it with shell writes.',
        '- Share these file-operation constraints with delegated workers; never fabricate their receipts.',
      ]);
      expect(guidance).not.toMatch(/IsArtifact=true|dangerously-skip-permissions|command\(\*\)/);
    } else {
      expect(guidance).toBeUndefined();
      expect(launch.prompt).not.toMatch(/ArtifactMetadata|IsArtifact/);
    }
  });
  it.each([
    { executor: 'claude', scopedPermissions: true, guided: true },
    { executor: 'claude', scopedPermissions: false, guided: false },
    { executor: 'agy', scopedPermissions: true, guided: false },
  ])('sends Claude tool guidance only with scoped session permissions (%o)', async ({ executor, scopedPermissions, guided }) => {
    const options = await setup();
    const result = await captureNativeScenario({ ...options, executor, scopedPermissions }); fixtures.push(result.cwd);
    const launch = JSON.parse(await readFile(join(result.output, 'launch.json'), 'utf8'));
    const transport = JSON.parse(await readFile(join(result.output, 'transport.json'), 'utf8'));
    const argv = transport.observation.records[0].argv as string[];
    expect(argv[argv.indexOf('-p') + 1]).toBe(launch.prompt);
    const guidance = launch.prompt.split('\n\nClaude session tools:\n')[1];
    if (guided) {
      expect(guidance?.split('\n')).toEqual([
        '- This session runs on a narrow session allow list; only its listed reads, writes and frozen CLI commands are approved. This guidance grants no permissions.',
        '- Open and check JSON or Markdown with the Read tool, including files a delegated worker wrote; do not parse them with python, node -e, perl, jq or other shell interpreters.',
        '- When a tool call is denied, report the denial and stop that approach; do not retry the same step through another interpreter, shell or path.',
        '- Share these tool constraints with delegated workers and read their written output back yourself; never fabricate their receipts.',
      ]);
      expect(guidance).not.toMatch(/dangerously-skip-permissions|permission-mode|sudo|chmod/);
      expect(launch.prompt).not.toMatch(/ArtifactMetadata|IsArtifact/);
    } else {
      expect(guidance).toBeUndefined();
      expect(launch.prompt).not.toMatch(/Read tool|interpreters/);
    }
  });
  it('states the container tool limits to AGY only where session settings enforce them', async () => {
    const options = await setup();
    const target = { command: '/bin/docker', container: 'a'.repeat(64), image: `sha256:${'b'.repeat(64)}`, uid: 1000, cwd: '/home/evaluator/fresh' };
    const docker = { target, node: '/opt/node/bin/node', runtime: '/opt/eval/runtime.mjs', cli: '/home/evaluator/.local/bin/agy' };
    vi.spyOn(DockerCapture.prototype, 'preflight').mockResolvedValue({ target, isolation: { mounts: [], network: 'bridge', memory: 1, cpus: 1, pids: 1 } });
    vi.spyOn(DockerCapture.prototype, 'deploy').mockResolvedValue();
    vi.spyOn(DockerCapture.prototype, 'files').mockResolvedValue({ encoding: 'base64', files: {}, unavailable: [] });
    vi.spyOn(DockerCapture.prototype, 'status').mockResolvedValue({ output: 'status', error: null });
    vi.spyOn(DockerCapture.prototype, 'runtimeHash').mockResolvedValue('same');
    const prompts: string[] = [];
    vi.spyOn(native, 'runNativeCli').mockImplementation(async (opts) => {
      prompts.push(opts.prompt);
      const reservation = opts.quota.reserve();
      await opts.beforeLaunch?.(opts.quota.requestsConsumed);
      opts.quota.settle(reservation, null);
      return { stdout: '', stderr: '', exit_code: 0, failure: null, duration_ms: 1, requests_consumed: opts.quota.requestsConsumed,
        committed_usd: null, remote_cancellation: 'unverified', observation: native.observeNativeTrace('agy', '') };
    });
    const contained = await captureNativeScenario({ ...options, docker }); fixtures.push(contained.cwd);
    const guidance = prompts[0]!.split('\n\nAGY container limits:\n')[1];
    expect(guidance?.split('\n')).toEqual([
      '- Only the frozen prospec CLI command named above and the read-only `git status` and `git ls-files` are approved shell commands.',
      '- Read only files inside the project root; the frozen CLI bundle and anything outside that root are denied.',
      '- Any denied tool call ends this headless session immediately; there is no second attempt and no alternative route.',
      '- Inspect the project with the native file tools instead of shell listing, reading or searching.',
      '- This guidance mirrors the approved rules; it grants no permissions and must not be worked around.',
    ]);
    expect(guidance).not.toMatch(/dangerously-skip-permissions|sudo|chmod/);
    expect(prompts[0]).toContain('AGY file operations:');
    const host = await captureNativeScenario({ ...options, output: options.output + '-host' }); fixtures.push(host.cwd);
    const hostPrompt = JSON.parse(await readFile(join(host.output, 'launch.json'), 'utf8')).prompt;
    expect(hostPrompt).toContain('AGY file operations:');
    expect(hostPrompt).not.toContain('AGY container limits:');
  });
  it('quotes the frozen CLI command only when the path is not shell-safe', async () => {
    const options = await setup();
    const spaced = join(await mkdtemp(join(tmpdir(), 'native runner space-')), 'runtime.mjs');
    roots.push(dirname(spaced));
    await writeFile(spaced, await readFile(options.runtime, 'utf8'));
    const plain = await captureNativeScenario(options); fixtures.push(plain.cwd);
    const plainPrompt = JSON.parse(await readFile(join(plain.output, 'launch.json'), 'utf8')).prompt;
    expect(plainPrompt).toContain(`${process.execPath} ${resolve(options.runtime)}`);
    const quoted = await captureNativeScenario({ ...options, runtime: spaced, output: options.output + '-quoted' });
    fixtures.push(quoted.cwd);
    const quotedPrompt = JSON.parse(await readFile(join(quoted.output, 'launch.json'), 'utf8')).prompt;
    expect(quotedPrompt).toContain(JSON.stringify(spaced));
  });
  it('keeps actual artifacts and source status, shares durable quota and refuses overwrites', async () => {
    const options = await setup();
    const result = await captureNativeScenario(options); fixtures.push(result.cwd);
    expect(result).toMatchObject({ requests_consumed: 3, workflow_verdict: 'unassessed' });
    const after = JSON.parse(await readFile(join(result.output, 'after.json'), 'utf8'));
    expect(Buffer.from(after.artifacts.files['native-result.md'], 'base64').toString()).toBe('actual artifact');
    expect(after.status.error).toBeNull();
    expect(after.runtime_unchanged).toBe(true);
    const transport = JSON.parse(await readFile(join(result.output, 'transport.json'), 'utf8'));
    const launch = JSON.parse(await readFile(join(result.output, 'launch.json'), 'utf8'));
    expect(launch.prompt).toContain(`Project root: ${JSON.stringify(result.cwd)}`);
    expect(launch.prompt).toContain('If this root is unavailable, stop');
    expect(launch.prompt).toContain('do not search other projects');
    expect(transport.observation.terminal_success).toBe(true);
    expect(transport.observation.workflow_verdict).toBe('unassessed');
    await expect(captureNativeScenario(options)).rejects.toThrow(/exist/i);
    const next = await captureNativeScenario({ ...options, output: options.output + '-2' }); fixtures.push(next.cwd);
    expect(next.requests_consumed).toBe(4);
    await expect(captureNativeScenario({ ...options, output: options.output + '-3' })).rejects.toThrow(/limit/i);
  });
  it('rejects changed identities, missing executors, versions and malformed configuration', async () => {
    const options = await setup();
    expect(NativeConfigSchema.safeParse({ ...options.config, budget_usd: 1 }).success).toBe(false);
    expect(NativeConfigSchema.safeParse({ ...options.config, executors: [options.config.executors[0], options.config.executors[0]] }).success).toBe(false);
    await expect(captureNativeScenario({ ...options, executor: 'unknown' })).rejects.toThrow(/executor/i);
    await expect(captureNativeScenario({ ...options, runtime: options.runtime + '.js' })).rejects.toThrow(/runtime/i);
    const changed = structuredClone(options.config); changed.executors[0]!.version = 'wrong';
    await expect(captureNativeScenario({ ...options, config: changed })).rejects.toThrow(/version/i);
    await writeFile(options.ledger, JSON.stringify({ version: 1, config_digest: 'wrong', consumed: 3 }));
    await expect(captureNativeScenario(options)).rejects.toThrow(/identity/i);
  });
  it('does not follow symlinks or read git internals, and reports oversized artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'native-files-')); roots.push(root);
    await mkdir(join(root, '.git'));
    await writeFile(join(root, '.git/secret'), 'not evidence');
    await mkdir(join(root, 'nested'));
    await writeFile(join(root, 'nested/small'), 'abc');
    await writeFile(join(root, 'oversized'), 'x'.repeat(100));
    await symlink(join(root, '.git/secret'), join(root, 'link'));
    const captured = await captureNativeFiles(root, 10);
    expect(captured.files).toEqual({ 'nested/small': Buffer.from('abc').toString('base64') });
    expect(captured.unavailable).toEqual(['link', 'oversized']);
  });
  it('requires live opt-in and exposes capture as UNASSESSED, not comparison PASS', async () => {
    await expect(main(['native'])).rejects.toThrow(/opt-in/i);
    const options = await setup();
    const config = options.output + '-config.json'; const instructions = options.output + '-instructions.json';
    await writeFile(config, JSON.stringify(options.config)); await writeFile(instructions, JSON.stringify(options.instructions));
    const messages: string[] = [];
    expect(await main(['native', '--live', '--config', config, '--instructions', instructions,
      '--runtime', options.runtime, '--executor', 'claude', '--scoped-permissions', '--scenario', 'quick', '--out', options.output, '--ledger', options.ledger], (m) => messages.push(m))).toBe(1);
    const identity = JSON.parse(await readFile(join(options.output, 'identity.json'), 'utf8')); fixtures.push(identity.cwd);
    expect(messages[0]).toContain('UNASSESSED');
    expect(identity.scoped_permissions).toBe(true);
    expect(identity.permission_args).toContain('--settings');
    const transport = JSON.parse(await readFile(join(options.output, 'transport.json'), 'utf8'));
    expect(transport.observation.records[0].argv).toContain('--settings');
    await expect(main(['native', '--live', '--scenario', 'unknown'])).rejects.toThrow(/scenario/i);
  });
});
