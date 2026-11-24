import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import { JsonReporter } from 'vitest/reporters';
import type { Vitest } from 'vitest/node';
import { gitIn } from '../../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../../helpers/private-tmpdir.js';
import StampedJsonReporter, { removeEarlierReport, reportPath } from '../../../scripts/counts/stamped-json-reporter.js';

// Real git in temp repos (PB-010): the nearest sibling, counts-from-report, declares 90s.
vi.setConfig({ testTimeout: 90_000 });

const tmp = usePrivateTmpdir('counts-stamped-reporter');
let seq = 0;

function repoWithFile(): string {
  const root = path.join(tmp, `r${seq++}`);
  fs.mkdirSync(root, { recursive: true });
  gitIn(root, 'init', '-q');
  fs.writeFileSync(path.join(root, 'a.txt'), 'a');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-q', '-m', 'base');
  return root;
}

function fakeVitest(root: string): Vitest {
  return {
    config: { root, outputFile: { json: 'report.json' }, passWithNoTests: true },
    logger: { log: vi.fn(), warn: vi.fn() },
    snapshot: { summary: { added: 0 } },
  } as unknown as Vitest;
}

function written(root: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(root, 'report.json'), 'utf-8')) as Record<string, unknown>;
}

describe('StampedJsonReporter', () => {
  let root: string;
  beforeEach(() => {
    root = repoWithFile();
  });

  it('is a vitest JSON reporter whose output keeps every JSON field and adds the stamp', async () => {
    const reporter = new StampedJsonReporter({});
    expect(reporter).toBeInstanceOf(JsonReporter);
    reporter.onInit(fakeVitest(root));
    await reporter.onTestRunEnd([], [], 'passed');
    const report = written(root);
    expect(report).toMatchObject({ numTotalTests: 0, success: true, testResults: [] });
    expect(report.prospecCounts).toEqual({ workTreeDigest: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it('passes a non-empty JSON report through unchanged apart from the stamp field', async () => {
    const input = {
      numTotalTests: 3,
      success: false,
      startTime: 1,
      testResults: [
        { name: path.join(root, 'tests/a.test.ts'), assertionResults: [{ title: 'x' }, { title: 'y' }], status: 'passed' },
        { name: path.join(root, 'tests/b.test.ts'), assertionResults: [{ title: 'z' }], status: 'failed' },
      ],
    };
    const reporter = new StampedJsonReporter({});
    reporter.onInit(fakeVitest(root));
    await reporter.writeReport(JSON.stringify(input));
    const { prospecCounts, ...rest } = written(root);
    expect(rest).toEqual(input);
    expect(prospecCounts).toBeDefined();
  });

  it('hands vitest\'s test modules to the JSON reporter unchanged', async () => {
    const parent = vi.spyOn(JsonReporter.prototype, 'onTestRunEnd').mockResolvedValue();
    try {
      const modules = [{ moduleId: 'a' }, { moduleId: 'b' }] as never[];
      const reporter = new StampedJsonReporter({});
      reporter.onInit(fakeVitest(root));
      await reporter.onTestRunEnd(modules, [], 'passed');
      expect(parent).toHaveBeenCalledTimes(1);
      expect(parent.mock.calls[0]![0]).toBe(modules);
    } finally {
      parent.mockRestore();
    }
  });

  it('removes the earlier report when the run starts', () => {
    fs.writeFileSync(path.join(root, 'report.json'), '{"old":true}');
    new StampedJsonReporter({}).onInit(fakeVitest(root));
    expect(fs.existsSync(path.join(root, 'report.json'))).toBe(false);
  });

  it('stamps a run whose files changed as unusable', async () => {
    const reporter = new StampedJsonReporter({});
    reporter.onInit(fakeVitest(root));
    fs.writeFileSync(path.join(root, 'a.txt'), 'changed');
    await reporter.onTestRunEnd([], [], 'passed');
    expect(written(root).prospecCounts).toEqual({ unusable: 'files changed while the run was in progress' });
  });

  it('stamps an interrupted run as unusable', async () => {
    const reporter = new StampedJsonReporter({});
    reporter.onInit(fakeVitest(root));
    await reporter.onTestRunEnd([], [], 'interrupted');
    expect(written(root).prospecCounts).toEqual({ unusable: 'the run was interrupted' });
  });

  it('still writes the report when the stamp cannot be computed', async () => {
    const plain = path.join(tmp, `plain${seq++}`);
    fs.mkdirSync(plain);
    const reporter = new StampedJsonReporter({});
    reporter.onInit(fakeVitest(plain));
    await expect(reporter.onTestRunEnd([], [], 'passed')).resolves.toBeUndefined();
    const stamp = written(plain).prospecCounts as { unusable?: string };
    expect(stamp.unusable).toMatch(/^work-tree digest unavailable at the run's start: /);
  });

  it('stamps the run unusable when the earlier report could not be removed', async () => {
    const reporter = new StampedJsonReporter({ outputFile: 'out/report.json' });
    fs.mkdirSync(path.join(root, 'out', 'report.json'), { recursive: true });
    reporter.onInit(fakeVitest(root));
    fs.rmSync(path.join(root, 'out', 'report.json'), { recursive: true });
    await reporter.onTestRunEnd([], [], 'passed');
    const report = JSON.parse(fs.readFileSync(path.join(root, 'out', 'report.json'), 'utf-8')) as { prospecCounts: { unusable?: string } };
    expect(report.prospecCounts.unusable).toMatch(/^could not remove the earlier report: /);
  });
});

describe('reportPath — vitest resolution of the JSON output file', () => {
  const root = path.join(path.sep, 'repo');
  const config = (outputFile: unknown) => ({ root, outputFile }) as unknown as Vitest['config'];

  it('prefers the reporter option', () => {
    expect(reportPath({ outputFile: 'a.json' }, config({ json: 'b.json' }))).toBe(path.resolve(root, 'a.json'));
  });

  it('reads a config string', () => {
    expect(reportPath({}, config('b.json'))).toBe(path.resolve(root, 'b.json'));
  });

  it("reads a config object's json key", () => {
    expect(reportPath({}, config({ json: 'c.json', junit: 'j.xml' }))).toBe(path.resolve(root, 'c.json'));
  });

  it('is undefined when no output file is configured', () => {
    expect(reportPath({}, config(undefined))).toBeUndefined();
    expect(reportPath({}, config({ junit: 'j.xml' }))).toBeUndefined();
  });
});

describe('removeEarlierReport', () => {
  it('treats a missing report as removed', () => {
    expect(removeEarlierReport(path.join(tmp, 'never-written.json'))).toBeUndefined();
  });

  it('names any other failure', () => {
    const dir = path.join(tmp, `dir${seq++}`);
    fs.mkdirSync(dir);
    expect(removeEarlierReport(dir)).toMatch(/^could not remove the earlier report: /);
  });
});
