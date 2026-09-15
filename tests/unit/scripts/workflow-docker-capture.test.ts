import { expect, it, vi } from 'vitest';
import { DockerCapture, DockerCaptureSchema } from '../../../scripts/workflow-eval/docker-capture.js';
import { DOCKER_ENV_KEYS } from '../../../scripts/workflow-eval/native-docker.js';
import { boundedProcess } from '../../../scripts/workflow-eval/process.js';
import { prepareFixture, disposeFixture } from '../../../scripts/workflow-eval/fixtures.js';
import { ScenarioSchema } from '../../../scripts/workflow-eval/protocol.js';
import { readFile } from 'node:fs/promises';
vi.setConfig({ testTimeout: 90_000 });
vi.mock('../../../scripts/workflow-eval/process.js', async (original) => ({
  ...await original<typeof import('../../../scripts/workflow-eval/process.js')>(), boundedProcess: vi.fn(),
}));
const config = { target: { command: '/bin/docker', container: 'a'.repeat(64), image: `sha256:${'b'.repeat(64)}`,
  uid: 1000, cwd: '/home/evaluator/new-fixture' }, node: '/opt/node/bin/node', runtime: '/opt/eval/runtime.mjs', cli: '/home/evaluator/.local/bin/agy' };
it('refuses non-owned deployment sources before any Docker operation', async () => {
  vi.mocked(boundedProcess).mockReset();
  await expect(new DockerCapture(config).deploy('/some/development/repo')).rejects.toThrow(/owned/i);
  expect(boundedProcess).not.toHaveBeenCalled();
});
it('collects JSON evidence without extracting an archive or forwarding host secrets', async () => {
  vi.mocked(boundedProcess).mockReset().mockResolvedValueOnce({ output: '{"encoding":"base64","files":{"tasks.md":"YQ=="},"unavailable":[]}', stderr: '', exitCode: 0 });
  expect(await new DockerCapture(config).files()).toMatchObject({ files: { 'tasks.md': 'YQ==' } });
  const call = vi.mocked(boundedProcess).mock.calls[0]![0];
  expect(call.args.slice(0, 9)).toEqual(['exec', '-i', '--user', '1000', '--workdir', config.target.cwd, config.target.container, config.node, '-e']);
  expect(call.args).not.toContain('tar');
  // The docker CLI gets the docker allowlist (a non-default daemon needs DOCKER_*),
  // and nothing outside it: the assertion is the key SET, not one literal value.
  expect(Object.keys(call.env!).every((key) => (DOCKER_ENV_KEYS as readonly string[]).includes(key))).toBe(true);
  expect(call.env).toHaveProperty('PATH');
  expect(call.env).not.toHaveProperty('PRIVATE_HOST_VALUE');
});
it('rejects controller failures and malformed captures', async () => {
  const capture = new DockerCapture(config);
  vi.mocked(boundedProcess).mockReset().mockResolvedValueOnce({ output: '', stderr: 'failure', exitCode: 1 });
  await expect(capture.files()).rejects.toThrow(/Docker controller/i);
  vi.mocked(boundedProcess).mockResolvedValueOnce({ output: '{}', stderr: '', exitCode: 0 });
  await expect(capture.files()).rejects.toThrow();
});
it('refuses unsafe runtime paths and unknown configuration fields', () => {
  expect(DockerCaptureSchema.safeParse({ ...config, runtime: '/opt/../runtime.mjs' }).success).toBe(false);
  expect(DockerCaptureSchema.safeParse({ ...config, privileged: true }).success).toBe(false);
});
it('copies only a newly created owned fixture and stops on a pre-existing destination', async () => {
  const scenario = ScenarioSchema.parse(JSON.parse(await readFile('tests/fixtures/workflow-eval/public/quick.json', 'utf8')));
  const { cwd } = await prepareFixture(scenario);
  try {
    const capture = new DockerCapture(config);
    vi.mocked(boundedProcess).mockReset().mockResolvedValue({ output: '', stderr: '', exitCode: 0 });
    await capture.deploy(cwd);
    const calls = vi.mocked(boundedProcess).mock.calls.map(([opts]) => opts.args);
    expect(calls).toHaveLength(3);
    expect(calls[0]!.at(-1)).toBe(config.target.cwd);
    expect(calls[1]).toEqual(['cp', `${cwd}/.`, `${config.target.container}:${config.target.cwd}`]);
    expect(calls[2]).toEqual(['exec', '--user', '0', config.target.container, 'chown', '-R', '1000:1000', config.target.cwd]);
    vi.mocked(boundedProcess).mockReset().mockResolvedValueOnce({ output: '', stderr: 'exists', exitCode: 1 });
    await expect(capture.deploy(cwd)).rejects.toThrow();
    expect(boundedProcess).toHaveBeenCalledTimes(1);
  } finally { await disposeFixture(cwd); }
});
it.each(['match', 'runtime', 'version'])('checks frozen runtime and native CLI version (%s)', async (mode) => {
  const identity = { Id: config.target.container, Image: config.target.image, State: { Running: true, Paused: false }, Mounts: [],
    HostConfig: { Privileged: false, PortBindings: {}, CapAdd: null, Devices: [], NetworkMode: 'bridge', PidMode: '', IpcMode: 'private', UTSMode: '',
      SecurityOpt: ['no-new-privileges'], Memory: 100, NanoCpus: 100, PidsLimit: 100 } };
  vi.mocked(boundedProcess).mockReset()
    .mockResolvedValueOnce({ output: JSON.stringify([identity]), stderr: '', exitCode: 0 })
    .mockResolvedValueOnce({ output: 'c'.repeat(64), stderr: '', exitCode: 0 })
    .mockResolvedValueOnce({ output: '1.0', stderr: '', exitCode: 0 });
  const promise = new DockerCapture(config).preflight((mode === 'runtime' ? 'd' : 'c').repeat(64), mode === 'version' ? '2.0' : '1.0');
  if (mode === 'match') expect(await promise).toMatchObject({ target: config.target });
  else await expect(promise).rejects.toThrow(/changed/);
});
it('retains unavailable status without inventing a CLI result', async () => {
  const capture = new DockerCapture(config);
  vi.mocked(boundedProcess).mockReset().mockResolvedValueOnce({ output: 'tasks', stderr: '', exitCode: 0 });
  expect(await capture.status()).toEqual({ output: 'tasks', error: null });
  vi.mocked(boundedProcess).mockResolvedValueOnce({ output: '', stderr: '', exitCode: 1 });
  expect(await capture.status()).toEqual({ output: null, error: 'Container source CLI status unavailable' });
});
