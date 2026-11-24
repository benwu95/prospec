import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitIn } from '../../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../../helpers/private-tmpdir.js';
import {
  countsFrom,
  expectedTestFiles,
  judgeStampedReport,
  LOCAL_REPORT,
  readReport,
  stampFor,
  workTreeDigest,
  type DigestResult,
} from '../../../scripts/counts/report-source.js';

// Real git in temp repos (PB-010): the nearest sibling, counts-from-report, declares 90s.
vi.setConfig({ testTimeout: 90_000 });

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tmp = usePrivateTmpdir('counts-report-source');

let seq = 0;
function freshDir(): string {
  const dir = path.join(tmp, `d${seq++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function write(root: string, rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

function digestOf(root: string): string {
  const d = workTreeDigest(root);
  if (!('digest' in d)) throw new Error(`no digest: ${d.reason}`);
  return d.digest;
}

describe('readReport / countsFrom — the reader `--from` and the stamped path share', () => {
  it('names a missing report exactly as `--from` always has', () => {
    expect(readReport(freshDir(), 'r.json')).toEqual({ reason: 'no vitest report at r.json' });
  });

  it('names an unparsable report as unreadable', () => {
    const dir = freshDir();
    write(dir, 'r.json', 'not json');
    const read = readReport(dir, 'r.json');
    expect('reason' in read && read.reason).toMatch(/^r\.json is not a readable vitest report: /);
  });

  it.each([
    ['null', 'expected a JSON object'],
    ['[1]', 'expected a JSON object'],
    ['{"testResults":5}', 'testResults is not an array'],
    ['{"testResults":[null]}', 'testResults[0] has no string name'],
    ['{"testResults":[{"assertionResults":[]}]}', 'testResults[0] has no string name'],
    ['{"testResults":[{"name":"/a.test.ts"},{"name":7}]}', 'testResults[1] has no string name'],
  ])('names valid JSON that is not a vitest report (%s) as unreadable instead of throwing', (json, why) => {
    const dir = freshDir();
    write(dir, 'r.json', json);
    expect(readReport(dir, 'r.json')).toEqual({ reason: `r.json is not a readable vitest report: ${why}` });
  });

  it('names a report with no results', () => {
    expect(countsFrom({ testResults: [] }, 'r.json')).toEqual({ counts: null, reason: 'r.json has no results' });
  });

  it('buckets a readable report', () => {
    const dir = freshDir();
    write(dir, 'r.json', JSON.stringify({ testResults: [{ name: '/x/tests/unit/a.test.ts', assertionResults: [{}, {}] }] }));
    const read = readReport(dir, 'r.json');
    if (!('report' in read)) throw new Error(read.reason);
    expect(countsFrom(read.report, 'r.json').counts).toMatchObject({ 'tests.total': 2, 'tests.unit': 2, 'tests.files': 1 });
  });
});

describe('workTreeDigest — preservation membership of the work tree', () => {
  let repo: string;
  let base: string;

  beforeEach(() => {
    repo = freshDir();
    gitIn(repo, 'init', '-q');
    write(repo, '.gitignore', 'ignored/\n');
    write(repo, 'tests/a.test.ts', 'a');
    write(repo, 'src/rows.yaml', 'rows: [1]');
    gitIn(repo, 'add', '-A');
    gitIn(repo, 'commit', '-q', '-m', 'base');
    base = digestOf(repo);
  });

  it('changes when a tracked test file is edited', () => {
    write(repo, 'tests/a.test.ts', 'a2');
    expect(digestOf(repo)).not.toBe(base);
  });

  it('changes when a non-test file a data-driven test enumerates is edited', () => {
    write(repo, 'src/rows.yaml', 'rows: [1, 2]');
    expect(digestOf(repo)).not.toBe(base);
  });

  it('changes when an untracked test file is added', () => {
    write(repo, 'tests/new.test.ts', 'n');
    expect(digestOf(repo)).not.toBe(base);
  });

  it('changes when a tracked file is deleted', () => {
    fs.rmSync(path.join(repo, 'src/rows.yaml'));
    expect(digestOf(repo)).not.toBe(base);
  });

  it('ignores files git ignores', () => {
    write(repo, 'ignored/x.test.ts', 'x');
    expect(digestOf(repo)).toBe(base);
  });

  it('is not redirected by an inherited GIT_DIR / GIT_WORK_TREE', () => {
    const other = freshDir();
    gitIn(other, 'init', '-q');
    write(other, 'elsewhere.txt', 'other repository');
    gitIn(other, 'add', '-A');
    gitIn(other, 'commit', '-q', '-m', 'other');
    vi.stubEnv('GIT_DIR', path.join(other, '.git'));
    vi.stubEnv('GIT_WORK_TREE', other);
    expect(digestOf(repo)).toBe(base);
  });

  it('reports a reason outside a git work tree', () => {
    const plain = freshDir();
    const d: DigestResult = workTreeDigest(plain);
    expect('reason' in d && d.reason.length > 0).toBe(true);
  });
});

describe('stampFor', () => {
  const ok = { digest: 'abc' };

  it('stamps the digest when both ends agree and the run was not interrupted', () => {
    expect(stampFor({ before: ok, after: ok, reason: 'passed' })).toEqual({ workTreeDigest: 'abc' });
    expect(stampFor({ before: ok, after: ok, reason: 'failed' })).toEqual({ workTreeDigest: 'abc' });
  });

  it('refuses when the start digest is unavailable', () => {
    expect(stampFor({ before: { reason: 'boom' }, after: ok, reason: 'passed' })).toEqual({
      unusable: "work-tree digest unavailable at the run's start: boom",
    });
  });

  it('refuses when the end digest is unavailable', () => {
    expect(stampFor({ before: ok, after: { reason: 'boom' }, reason: 'passed' })).toEqual({
      unusable: "work-tree digest unavailable at the run's end: boom",
    });
  });

  it('refuses when files changed during the run', () => {
    expect(stampFor({ before: ok, after: { digest: 'def' }, reason: 'passed' })).toEqual({
      unusable: 'files changed while the run was in progress',
    });
  });

  it('refuses an interrupted run', () => {
    expect(stampFor({ before: ok, after: ok, reason: 'interrupted' })).toEqual({ unusable: 'the run was interrupted' });
  });
});

describe('expectedTestFiles — vitest include/exclude, globbed the way vitest globs', () => {
  it('lists dot-directory test files and honours the default exclude', () => {
    const dir = freshDir();
    for (const rel of ['tests/a.test.ts', 'tests/.hidden/b.test.ts', 'tests/node_modules/c.test.ts', 'tests/d.ts', 'other/e.test.ts']) {
      write(dir, rel, '');
    }
    expect(expectedTestFiles(dir, { include: ['tests/**/*.test.ts'] })).toEqual(['tests/.hidden/b.test.ts', 'tests/a.test.ts']);
  });

  it('applies a configured exclude instead of the default', () => {
    const dir = freshDir();
    write(dir, 'tests/a.test.ts', '');
    write(dir, 'tests/e2e/b.test.ts', '');
    expect(expectedTestFiles(dir, { include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**'] })).toEqual(['tests/a.test.ts']);
  });

  it('reads the repository vitest config by default', () => {
    expect(expectedTestFiles(REPO_ROOT)).toContain('tests/unit/scripts/counts-report-source.test.ts');
  });
});

describe('judgeStampedReport', () => {
  const root = path.join(path.sep, 'repo');
  const expected = ['tests/a.test.ts', 'tests/b.test.ts'];
  const results = (...rels: string[]) => rels.map((rel) => ({ name: path.join(root, rel), assertionResults: [{}] }));
  const stamped = (prospecCounts: unknown, rels = expected) => ({ testResults: results(...rels), prospecCounts });
  const current = { digest: 'abc' };

  it('accepts a stamp equal to the current digest covering exactly the configured files', () => {
    expect(judgeStampedReport(stamped({ workTreeDigest: 'abc' }), current, expected, root, 'r.json')).toBeNull();
  });

  it('refuses a report without a stamp', () => {
    expect(judgeStampedReport({ testResults: results(...expected) }, current, expected, root, 'r.json')).toBe(
      'r.json carries no work-tree stamp (it was not written by `pnpm test`)',
    );
  });

  it('refuses a malformed stamp as no stamp', () => {
    expect(judgeStampedReport(stamped({ workTreeDigest: 7 }), current, expected, root, 'r.json')).toMatch(/carries no work-tree stamp/);
  });

  it('refuses a stamp the run marked unusable, with its reason', () => {
    expect(judgeStampedReport(stamped({ unusable: 'the run was interrupted' }), current, expected, root, 'r.json')).toBe(
      'r.json is unusable: the run was interrupted',
    );
  });

  it('refuses when the current digest is unavailable', () => {
    expect(judgeStampedReport(stamped({ workTreeDigest: 'abc' }), { reason: 'boom' }, expected, root, 'r.json')).toBe(
      'the current work-tree digest is unavailable: boom',
    );
  });

  it('refuses when files changed since the run', () => {
    expect(judgeStampedReport(stamped({ workTreeDigest: 'old' }), current, expected, root, 'r.json')).toBe(
      'files changed since r.json was written',
    );
  });

  it('refuses a run that skipped a configured test file (a path filter or --exclude)', () => {
    expect(judgeStampedReport(stamped({ workTreeDigest: 'abc' }, ['tests/a.test.ts']), current, expected, root, 'r.json')).toBe(
      'r.json does not cover the configured test files (missing tests/b.test.ts)',
    );
  });

  it('refuses a run that collected a file the configuration does not list', () => {
    expect(
      judgeStampedReport(stamped({ workTreeDigest: 'abc' }, [...expected, 'other/c.test.ts']), current, expected, root, 'r.json'),
    ).toBe('r.json does not cover the configured test files (unexpected other/c.test.ts)');
  });
});

describe('`pnpm test` writes the report the local reader reads', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> };
  const test = pkg.scripts.test ?? '';

  it('loads the stamping reporter from a file that exists', () => {
    const reporter = /--reporter=(\.\/scripts\/counts\/\S+)/.exec(test)?.[1];
    expect(reporter, 'the test script loads no stamping reporter').toBe('./scripts/counts/stamped-json-reporter.ts');
    expect(fs.existsSync(path.join(REPO_ROOT, reporter!))).toBe(true);
  });

  it('keeps vitest default terminal output alongside it', () => {
    expect(test).toMatch(/--reporter=default(\s|$)/);
  });

  it('writes the JSON output where the local reader looks', () => {
    expect(/--outputFile\.json=(\S+)/.exec(test)?.[1]).toBe(LOCAL_REPORT);
  });
});
