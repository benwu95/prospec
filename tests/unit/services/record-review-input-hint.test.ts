import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const digests = vi.hoisted(() => ({ change: [] as (string | null)[], deltaSpec: [] as (string | null)[] }));
vi.mock('../../../src/lib/drift-sources.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/drift-sources.js')>()),
  computeChangeDigest: () => digests.change.shift() ?? null,
  computeDeltaSpecDigest: () => digests.deltaSpec.shift() ?? null,
}));

const { execute } = await import('../../../src/services/check.service.js');
const { UNTRACKED_INPUTS_HINT } = await import('../../../src/lib/drift-checker.js');

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'record-review-hint-'));
  mkdirSync(path.join(root, '.prospec/changes/c1'), { recursive: true });
  writeFileSync(path.join(root, '.prospec/changes/c1/metadata.yaml'), 'name: c1\ncreated_at: "2026-10-24"\nstatus: implemented\nscale: standard\n');
  writeFileSync(path.join(root, '.prospec/changes/c1/delta-spec.md'), '# Delta Spec\n');
  writeFileSync(path.join(root, '.prospec.yaml'), 'project:\n  name: fixture\n');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  digests.change = [];
  digests.deltaSpec = [];
});

const reasonOf = async (): Promise<string> => {
  const result = await execute({ cwd: root, change: 'c1', recordReview: true });
  if (result.kind !== 'record-review' || result.recorded) throw new Error('expected a refused record-review');
  return result.reason ?? '';
};

describe('record-review refusal hint (REQ-CLI-052)', () => {
  it('names the untracked-input rule when the change digest moves while recording', async () => {
    digests.change = ['D1', 'D2'];
    digests.deltaSpec = ['S', 'S'];
    expect(await reasonOf()).toContain(UNTRACKED_INPUTS_HINT);
  });

  it('keeps the hint when the delta-spec is also unprovable', async () => {
    digests.change = ['D1', 'D2'];
    digests.deltaSpec = [null, null];
    expect(await reasonOf()).toContain(UNTRACKED_INPUTS_HINT);
  });

  it('omits the hint when only the delta-spec moved', async () => {
    digests.change = ['D1', 'D1'];
    digests.deltaSpec = ['S1', 'S2'];
    expect(await reasonOf()).not.toContain(UNTRACKED_INPUTS_HINT);
  });

  it('omits the hint when the recomputed change digest is unprovable', async () => {
    digests.change = ['D1', null];
    digests.deltaSpec = ['S', 'S'];
    expect(await reasonOf()).not.toContain(UNTRACKED_INPUTS_HINT);
  });
});
