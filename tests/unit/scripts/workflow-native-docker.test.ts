import { describe, expect, it, vi } from 'vitest';
import { nativeArguments, runNativeCli } from '../../../scripts/workflow-eval/native.js';
import { RequestQuota } from '../../../scripts/workflow-eval/executor.js';
import { boundedProcess, ProcessFailure } from '../../../scripts/workflow-eval/process.js';
import { DOCKER_ENV_KEYS, dockerEnv as launchedDockerEnv } from '../../../scripts/workflow-eval/native-docker.js';

vi.mock('../../../scripts/workflow-eval/process.js', async (original) => ({
  ...await original<typeof import('../../../scripts/workflow-eval/process.js')>(), boundedProcess: vi.fn(),
}));
const target = { command: '/usr/bin/docker', container: 'a'.repeat(64), image: `sha256:${'b'.repeat(64)}`,
  uid: 1000, cwd: '/home/evaluator/workflow-test' };
function inspection() {
  return { Id: target.container, Image: target.image, State: { Running: true, Paused: false }, Mounts: [],
    HostConfig: { Privileged: false, PortBindings: {}, CapAdd: null, Devices: [], NetworkMode: 'bridge',
      PidMode: '', IpcMode: 'private', UTSMode: '', SecurityOpt: ['no-new-privileges'], Memory: 2147483648, NanoCpus: 2000000000, PidsLimit: 256 } };
}
function options() {
  return { cli: 'agy' as const, command: '/home/evaluator/.local/bin/agy', model: 'flash', prompt: 'a task; not a shell command',
    cwd: '/tmp/local-fixture', timeoutMs: 300000, maxBytes: 500000,
    env: { PATH: '/bin', PRIVATE_HOST_VALUE: 'must not forward' }, quota: new RequestQuota(20, 12), docker: target };
}
function mockInspect(value: unknown) {
  vi.mocked(boundedProcess).mockReset().mockResolvedValueOnce({ output: JSON.stringify([value]), stderr: '', exitCode: 0 });
}
describe('native Docker transport', () => {
  it.each(['agy', 'claude'] as const)('pins container identity and uses the shared quota and raw trace owner (%s)', async (cli) => {
    mockInspect({ ...inspection(), Config: { Env: ['SENSITIVE=do-not-save'] } });
    const raw = JSON.stringify(cli === 'agy' ? { event: 'result', result: { status: 'SUCCESS', usage: { input_tokens: 3 } } }
      : { type: 'result', subtype: 'success', is_error: false, usage: { input_tokens: 3 } });
    vi.mocked(boundedProcess).mockResolvedValueOnce({ output: raw, stderr: '', exitCode: 0 });
    const opts = { ...options(), cli }; const beforeLaunch = vi.fn();
    const result = await runNativeCli({ ...opts, beforeLaunch });
    const inspect = vi.mocked(boundedProcess).mock.calls[0]![0];
    expect(inspect).toMatchObject({ command: '/usr/bin/docker', args: ['inspect', '--type', 'container', target.container] });
    // `inspect` and `exec` must reach the SAME daemon: a non-default DOCKER_HOST that
    // one of them drops makes preflight fail where the other would have succeeded.
    expect(Object.keys(inspect.env!).every((key) => (DOCKER_ENV_KEYS as readonly string[]).includes(key))).toBe(true);
    expect(new Set(Object.keys(inspect.env!))).toEqual(new Set(Object.keys(launchedDockerEnv())));
    const launched = vi.mocked(boundedProcess).mock.calls[1]![0];
    expect(launched.args).toEqual(['exec', '-i', '--user', '1000', '--env', 'DISABLE_AUTOUPDATER=1', '--workdir', target.cwd, target.container,
      'timeout', '--signal=TERM', '--kill-after=5s', '295s', opts.command,
      ...nativeArguments(cli, opts.model, opts.prompt, opts.timeoutMs)]);
    // In Docker mode the spawned process is the docker CLI: it gets the docker
    // allowlist, never the executor's own environment (which lives in the container).
    // Set EQUALITY on both sides — a subset assertion here let a symmetric narrowing of
    // this call site stay green while only `inspect` was guarded (round-4 T4-1).
    expect(new Set(Object.keys(launched.env!))).toEqual(new Set(Object.keys(launchedDockerEnv())));
    expect(launched.env).not.toHaveProperty('PRIVATE_HOST_VALUE');
    expect(beforeLaunch).toHaveBeenCalledExactlyOnceWith(13);
    expect(result).toMatchObject({ stdout: raw, requests_consumed: 13, remote_cancellation: 'unverified',
      observation: { workflow_verdict: 'unassessed', usage: { input_tokens: 3 } } });
    expect(boundedProcess).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('do-not-save');
  });
  it.each(['mount', 'privileged', 'port', 'host-network', 'host-pid', 'capability', 'stopped', 'image', 'missing-memory'])('refuses %s before quota reservation', async (kind) => {
    const data = inspection();
    const bad: unknown = kind === 'mount' ? { ...data, Mounts: [{ Source: '/host', Destination: '/repo' }] }
      : kind === 'stopped' ? { ...data, State: { Running: false, Paused: false } }
      : kind === 'image' ? { ...data, Image: 'sha256:' + 'c'.repeat(64) }
      : { ...data, HostConfig: { ...data.HostConfig, ...({ privileged: { Privileged: true }, port: { PortBindings: { '80/tcp': [] } },
        'host-network': { NetworkMode: 'host' }, 'host-pid': { PidMode: 'host' }, capability: { CapAdd: ['SYS_ADMIN'] }, 'missing-memory': { Memory: 0 } }[kind]) } };
    mockInspect(bad);
    const opts = options();
    await expect(runNativeCli(opts)).rejects.toThrow();
    expect(opts.quota.requestsConsumed).toBe(12);
    expect(boundedProcess).toHaveBeenCalledTimes(1);
  });
  it('retains launch failures without retry or quota refund', async () => {
    mockInspect(inspection());
    vi.mocked(boundedProcess).mockRejectedValueOnce(new ProcessFailure('Process timeout', 'partial', 'diagnostic', null));
    const result = await runNativeCli(options());
    expect(result).toMatchObject({ stdout: 'partial', stderr: 'diagnostic', failure: 'Process timeout', requests_consumed: 13 });
    expect(boundedProcess).toHaveBeenCalledTimes(2);
  });
  it.each([{ output: 'invalid JSON', stderr: '', exitCode: 0 }, { output: '[]', stderr: 'unavailable', exitCode: 1 }])('refuses invalid inspection before reserving quota', async (response) => {
    vi.mocked(boundedProcess).mockReset().mockResolvedValueOnce(response);
    const opts = options();
    await expect(runNativeCli(opts)).rejects.toThrow();
    expect(opts.quota.requestsConsumed).toBe(12);
    expect(boundedProcess).toHaveBeenCalledTimes(1);
  });
  it('rejects host permission paths and insufficient kill grace before inspection', async () => {
    vi.mocked(boundedProcess).mockReset();
    await expect(runNativeCli({ ...options(), scope: { cwd: '/tmp/fixture', runtime: '/tmp/runtime.mjs' } })).rejects.toThrow(/host scoped/i);
    await expect(runNativeCli({ ...options(), timeoutMs: 5000 })).rejects.toThrow(/grace/i);
    await expect(runNativeCli({ ...options(), command: 'agy' })).rejects.toThrow();
    expect(boundedProcess).not.toHaveBeenCalled();
  });
  it.each([{ uid: 0 }, { cwd: '/' }, { container: 'mutable-name' }, { command: 'docker' }, { cwd: '/tmp/../root' }])('refuses unsafe target %j without any process', async (override) => {
    vi.mocked(boundedProcess).mockReset();
    await expect(runNativeCli({ ...options(), docker: { ...target, ...override } })).rejects.toThrow();
    expect(boundedProcess).not.toHaveBeenCalled();
  });
});
