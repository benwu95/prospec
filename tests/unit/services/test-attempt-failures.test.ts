import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { promises as fileSystem, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { execute } from '../../../src/services/check.service.js';
import { runTestCommand } from '../../../src/lib/test-runner.js';
import { readChangeMetadata, writeChangeMetadataDoc } from '../../../src/lib/change-metadata.js';
import { computeChangeState } from '../../../src/lib/drift-sources.js';
vi.mock('../../../src/lib/test-runner.js', async (original) => {
  const actual = await original<typeof import('../../../src/lib/test-runner.js')>();
  return { ...actual, runTestCommand: vi.fn(actual.runTestCommand) };
});
vi.mock('../../../src/lib/change-metadata.js', async (original) => {
  const actual = await original<typeof import('../../../src/lib/change-metadata.js')>();
  return { ...actual, writeChangeMetadataDoc: vi.fn(actual.writeChangeMetadataDoc) };
});
vi.mock('../../../src/lib/drift-sources.js', async (original) => {
  const actual = await original<typeof import('../../../src/lib/drift-sources.js')>();
  return { ...actual, computeChangeState: vi.fn(actual.computeChangeState) };
});
vi.setConfig({ testTimeout: 90_000 });
let root: string;
const meta = () => readChangeMetadata(path.join(root, '.prospec/changes/x/metadata.yaml'), 'x').metadata;
const run = () => execute({ cwd: root, change: 'x', recordTests: true });
const status = async () => { const r = await execute({ cwd: root }); if (r.kind !== 'report') throw Error('report'); return r.report.structural.checks.find(c => c.id === 'test-provenance')?.status; };
const outcome = (exit_code: number | null, extra = {}) => ({ command: `${process.execPath} -e process.exit(0)`, exit_code, timed_out: false, timeout_ms: 10, ...extra });
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'attempt-failure-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  mkdirSync(path.join(root, '.prospec/changes/x'), { recursive: true });
  writeFileSync(path.join(root, '.prospec/changes/x/metadata.yaml'), 'name: x\ncreated_at: today\nstatus: implemented\nscale: full\n');
  writeFileSync(path.join(root, '.prospec.yaml'), `version: "1.0"\nproject:\n  name: t\ntech_stack:\n  test_command: ${process.execPath} -e process.exit(0)\n`);
});
afterEach(() => { vi.clearAllMocks(); rmSync(root, { recursive: true, force: true }); });
it.each(['timeout', 'crash', 'unavailable'])('keeps a real failure through a later %s and clears only on stable success', async (kind) => {
  await run(); expect(await status()).toBe('pass');
  vi.mocked(runTestCommand).mockReturnValueOnce(outcome(1)); await run();
  vi.mocked(runTestCommand).mockReturnValueOnce(outcome(null, kind === 'timeout' ? { timed_out: true } : kind === 'crash' ? { signal: 'SIGSEGV' } : { error: 'unavailable' }));
  await run(); expect(await status()).toBe('fail'); expect(meta().test_provenance?.exit_code).toBe(1);
  expect(meta().test_attempt?.outcome).toBe(kind === 'crash' ? 'unprovable' : kind);
  await run(); expect(await status()).toBe('pass');
});
it('leaves running and invalidates older PASS when the runner throws', async () => {
  await run();
  vi.mocked(runTestCommand).mockImplementationOnce(() => { throw Error('runner crashed'); });
  await expect(run()).rejects.toThrow('runner crashed');
  expect(meta().test_attempt?.outcome).toBe('running'); expect(await status()).toBe('fail');
});
it('keeps running when final write fails, so older PASS never certifies it', async () => {
  await run();
  vi.mocked(runTestCommand).mockImplementationOnce(() => {
    vi.mocked(writeChangeMetadataDoc).mockRejectedValueOnce(Error('write failed'));
    return outcome(0);
  });
  expect(await run()).toMatchObject({ recorded: false });
  expect(meta().test_attempt?.outcome).toBe('running'); expect(await status()).toBe('fail');
});
it('persists actual nonzero exit even when after-capture fails', async () => {
  vi.mocked(runTestCommand).mockImplementationOnce(() => {
    vi.mocked(computeChangeState).mockReturnValueOnce({ digest: null, clean: null, reason: 'unreadable' });
    return outcome(7);
  });
  expect(await run()).toMatchObject({ recorded: true, exitCode: 7 });
  expect(meta().test_provenance?.exit_code).toBe(7); expect(meta().test_attempt?.outcome).toBe('failed');
  expect(await status()).toBe('fail');
});
it('migrates a legacy record only through a real successful invocation', async () => {
  const { doc } = readChangeMetadata(path.join(root, '.prospec/changes/x/metadata.yaml'), 'x');
  doc.set('test_provenance', { digest: computeChangeState(root).digest, command: 'legacy', exit_code: 0, date: 'today' });
  await writeChangeMetadataDoc(path.join(root, '.prospec/changes/x/metadata.yaml'), doc, 'x');
  expect(await status()).toBe('fail'); await run();
  expect(runTestCommand).toHaveBeenCalledTimes(1); expect(await status()).toBe('pass');
  expect(meta().test_provenance?.fingerprint_version).toBe('snapshot-v2');
});

it('records running and passing attempts without breaking metadata aliases (F-265-7)', async () => {
  const metadataPath = path.join(root, '.prospec/changes/x/metadata.yaml');
  writeFileSync(metadataPath, 'name: x\ncreated_at: today\nstatus: implemented\nscale: full\n# reusable module list\ncustom_modules: &modules [ lib ]\nrelated_modules: *modules\n');
  expect(await run()).toMatchObject({ recorded: true, exitCode: 0 });
  expect(meta().related_modules).toEqual(['lib']);
  expect(meta().custom_modules).toEqual(['lib']);
  expect(meta().test_attempt?.outcome).toBe('passed');
  expect(await status()).toBe('pass');
});

it.each(['none', 'passed', 'failed'])('keeps actual unavailable diagnostics after %s evidence (V-265-1)', async (prior) => {
  const configPath = path.join(root, '.prospec.yaml');
  if (prior === 'failed') writeFileSync(configPath, `version: "1.0"\nproject:\n  name: t\ntech_stack:\n  test_command: ${process.execPath} -e process.exit(1)\n`);
  if (prior !== 'none') await run();
  writeFileSync(configPath, 'version: "1.0"\nproject:\n  name: t\ntech_stack:\n  test_command: definitely-missing-prospec-265-executable\n');
  expect(await run()).toMatchObject({ recorded: false, exitCode: null });
  expect(meta().test_attempt).toMatchObject({ outcome: 'unavailable', reason: expect.stringContaining('ENOENT') });
  expect(meta().test_attempt?.exit_code).toBeUndefined();
  const result = await execute({ cwd: root });
  if (result.kind !== 'report') throw Error('report');
  const check = result.report.structural.checks.find(c => c.id === 'test-provenance');
  if (prior === 'failed') {
    expect(check?.status).toBe('fail');
    expect(meta().test_provenance?.exit_code).toBe(1);
  } else {
    expect(check).toMatchObject({ status: 'skipped', reason: expect.stringContaining('ENOENT') });
    expect(check?.reason).toContain('definitely-missing-prospec-265-executable');
  }
});

it('does not certify an old command against a newly resolved config snapshot (F-265-4)', async () => {
  const configPath = path.join(root, '.prospec.yaml');
  const original = fileSystem.readFile;
  let reads = 0;
  const spy = vi.spyOn(fileSystem, 'readFile').mockImplementation(async (file, options) => {
    const bytes = await original(file, options);
    if (String(file) === configPath && ++reads === 2) {
      writeFileSync(configPath, String(bytes).replace('process.exit(0)', 'process.exit(1)'));
    }
    return bytes;
  });
  try {
    expect(await run()).toMatchObject({ recorded: false });
    expect(reads).toBe(2);
    expect(await status()).toBe('fail');
    expect(meta().test_attempt?.outcome).toBe('unprovable');
  } finally { spy.mockRestore(); }
});
