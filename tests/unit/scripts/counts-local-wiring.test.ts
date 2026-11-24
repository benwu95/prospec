import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import { gitIn } from '../../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../../helpers/private-tmpdir.js';
import { TEST_QUEUE_BUSY_EXIT_CODE } from '../../../src/types/test-queue.js';
import type { ExclusiveOptions, ExclusiveResult } from '../../../src/services/exclusive.service.js';
import { localTestCountsFor } from '../../../scripts/counts/local-source.js';
import { LOCAL_REPORT, workTreeDigest } from '../../../scripts/counts/report-source.js';

// The default wiring of the local counts path — no dependency overridden — with only the
// exclusive service replaced, so no test run and no queue turn is ever taken here.
const execute = vi.hoisted(() => vi.fn<(options: ExclusiveOptions) => Promise<ExclusiveResult>>());
vi.mock('../../../src/services/exclusive.service.js', () => ({ execute }));

// Real git in temp repos (PB-010): the nearest sibling declares 90s.
vi.setConfig({ testTimeout: 90_000 });

const tmp = usePrivateTmpdir('counts-local-wiring');
let seq = 0;

function repo(): string {
  const root = path.join(tmp, `r${seq++}`);
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  gitIn(root, 'init', '-q');
  fs.writeFileSync(path.join(root, '.gitignore'), `${LOCAL_REPORT}\n`);
  fs.writeFileSync(path.join(root, 'tests', 'a.test.ts'), '');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-q', '-m', 'base');
  return root;
}

function writeStampedReport(root: string): void {
  const d = workTreeDigest(root);
  const testResults = [{ name: path.join(root, 'tests', 'a.test.ts'), assertionResults: [{}, {}, {}] }];
  fs.writeFileSync(path.join(root, LOCAL_REPORT), JSON.stringify({ testResults, prospecCounts: { workTreeDigest: 'digest' in d ? d.digest : 'none' } }));
}

describe('localTestCountsFor — default wiring', () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it('names the refusal on stderr, runs `pnpm test` in this root under the queue, and counts what it wrote', async () => {
    const root = repo();
    execute.mockImplementationOnce(async () => {
      writeStampedReport(root);
      return { kind: 'ran', command: 'pnpm test', exitCode: 0, timedOut: false, timeoutMs: 1 };
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const outcome = await localTestCountsFor(root);
      expect(outcome).toMatchObject({ kind: 'counts', result: { counts: { 'tests.total': 3 } } });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0]![0]).toMatchObject({ cwd: root, argv: ['pnpm', 'test'] });
      expect(warn).toHaveBeenCalledWith(
        `not reusing the local test report: no vitest report at ${LOCAL_REPORT} — running \`pnpm test\` once under the repository test queue`,
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('stops with the busy exit code when the queue stays busy', async () => {
    execute.mockResolvedValueOnce({
      kind: 'busy', command: 'pnpm test', busy: { seq: 2, ahead: 1, lease_ms: 30_000, queue_dir: '/q' } as never,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const outcome = await localTestCountsFor(repo());
      expect(outcome).toMatchObject({ kind: 'stop', exitCode: TEST_QUEUE_BUSY_EXIT_CODE });
    } finally {
      warn.mockRestore();
    }
  });
});
