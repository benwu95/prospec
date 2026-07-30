import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/review-merge.service.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

const CWD = '/repo';
const REVIEW = '/repo/.prospec/changes/add-widget/review.md';
const FINDINGS = '/repo/round.json';

function seed(findings: unknown, review?: string): void {
  const files: Record<string, string> = {
    '/repo/.prospec/changes/add-widget/metadata.yaml': 'name: add-widget\n',
    [FINDINGS]: JSON.stringify(findings),
  };
  if (review !== undefined) files[REVIEW] = review;
  vol.fromJSON(files);
}

const round1 = [
  { id: 'F-1', location: 'src/a.ts:10', severity: 'critical', lens: 'correctness', status: 'fixed', summary: 'off-by-one' },
  { id: 'F-2', location: 'src/b.ts:5', severity: 'major', lens: 'security', summary: 'missing guard' },
];

describe('review-merge service', () => {
  it('creates review.md from the first round and reports the round counts', async () => {
    seed(round1);
    const result = await execute({ cwd: CWD, findingsPath: FINDINGS });
    expect(result.totalRows).toBe(2);
    expect(result.round).toEqual({ criticals_found: 1, criticals_fixed: 1, majors: 1 });
    const written = vol.readFileSync(REVIEW, 'utf-8') as string;
    expect(written).toContain('| F-1 | src/a.ts:10 | critical | correctness | fixed | off-by-one |');
  });

  it('merges a later round by id — drifted location updates, severity holds at max', async () => {
    seed(round1);
    await execute({ cwd: CWD, findingsPath: FINDINGS });
    vol.writeFileSync(
      FINDINGS,
      JSON.stringify([
        { id: 'F-2', location: 'src/b.ts:9', severity: 'minor', lens: 'security', status: 'fixed', summary: 'guard added' },
      ]),
    );
    const result = await execute({ cwd: CWD, findingsPath: FINDINGS });
    expect(result.totalRows).toBe(2);
    const written = vol.readFileSync(REVIEW, 'utf-8') as string;
    expect(written).toContain('| F-2 | src/b.ts:9 | major | security | fixed | guard added |');
    // round counts reflect THIS round only
    expect(result.round).toEqual({ criticals_found: 0, criticals_fixed: 0, majors: 0 });
  });

  it('rerunning the same round is byte-idempotent', async () => {
    seed(round1);
    await execute({ cwd: CWD, findingsPath: FINDINGS });
    const first = vol.readFileSync(REVIEW, 'utf-8');
    await execute({ cwd: CWD, findingsPath: FINDINGS });
    expect(vol.readFileSync(REVIEW, 'utf-8')).toBe(first);
  });

  it('rejects invalid JSON and schema violations with guidance, review.md untouched', async () => {
    seed(round1, '# existing\n');
    vol.writeFileSync(FINDINGS, 'not json');
    await expect(execute({ cwd: CWD, findingsPath: FINDINGS })).rejects.toThrow(
      /not valid JSON/,
    );
    vol.writeFileSync(FINDINGS, JSON.stringify([{ location: 'a', severity: 'blocker', lens: 'x', summary: 's' }]));
    await expect(execute({ cwd: CWD, findingsPath: FINDINGS })).rejects.toThrow(
      PrerequisiteError,
    );
    expect(vol.readFileSync(REVIEW, 'utf-8')).toBe('# existing\n');
  });
});
