import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Spawns `tsx` per case (PB-010: a spawn-bound file declares its own timeout).
vi.setConfig({ testTimeout: 30_000 });

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/sync-counts.ts');

function run(...args: string[]): { status: number | null; out: string } {
  const r = spawnSync('npx', ['tsx', SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    shell: false,
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/**
 * `--from` lets CI bucket the vitest report `test:coverage` just wrote instead
 * of running the suite a second time. Nothing can tell a fresh report from a
 * stale one, so the flag is read-only by construction and an unusable report is
 * a skip — never a pass. These are the two ways that could silently invert.
 */
describe('sync-counts --from (REQ-TESTS-070)', () => {
  it('refuses the rewrite mode — stale numbers must never be written into the docs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'counts-'));
    try {
      const report = path.join(dir, 'r.json');
      fs.writeFileSync(report, JSON.stringify({ testResults: [] }));
      const { status, out } = run('--from', report);
      expect(status, 'the write mode accepted a caller-named report').toBe(1);
      expect(out).toMatch(/only valid with --check/);
      // and it wrote nothing: the working tree's counts are still whatever they were
      expect(out).not.toMatch(/fixed .*:\d+/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an unreadable report is an unverified count, so --check exits non-zero', () => {
    // Asserted on the skip and the exit code only — both hold whatever state the
    // repo's own counts are in. `cannot verify` prints only when nothing ALSO
    // drifted, so asserting it would couple this test to unrelated staleness.
    const { status, out } = run('--check', '--from', 'no-such-report.json');
    expect(status, 'a missing report passed as verified').toBe(1);
    expect(out).toMatch(/no vitest report at no-such-report\.json/);
  });
});
