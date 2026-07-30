import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/change-log.service.js';
import { MetadataValidationError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

const CWD = '/repo';
const PATH = '/repo/.prospec/changes/add-widget/metadata.yaml';

const METADATA = `name: add-widget
created_at: 2026-07-13T09:51:00.000Z
status: implemented
# note that must survive
scale: standard
`;

function seed(): void {
  vol.fromJSON({ [PATH]: METADATA });
}

describe('change-log service', () => {
  it('appends a review entry with structured counts and stamps today when no date given', async () => {
    seed();
    const result = await execute({
      cwd: CWD,
      entry: {
        skill: 'prospec-review',
        result: 'WARN',
        warnings: ['one unresolved major'],
        criticals_found: 1,
        criticals_fixed: 1,
        majors: 1,
      },
    });
    expect(result.changeName).toBe('add-widget');
    expect(result.entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const written = vol.readFileSync(PATH, 'utf-8') as string;
    expect(written).toContain('# note that must survive');
    expect(written).toContain('skill: prospec-review');
    expect(written).toContain('criticals_found: 1');
  });

  it('uses the explicit date and appends after existing entries', async () => {
    vol.fromJSON({
      [PATH]: `${METADATA}quality_log:
  - skill: prospec-ff
    date: 2026-07-29
    result: PASS
    warnings: []
`,
    });
    await execute({
      cwd: CWD,
      entry: { skill: 'prospec-verify', result: 'PASS', warnings: [], grade: 'S', date: '2026-07-30' },
    });
    const written = vol.readFileSync(PATH, 'utf-8') as string;
    const ffIndex = written.indexOf('prospec-ff');
    const verifyIndex = written.indexOf('prospec-verify');
    expect(ffIndex).toBeGreaterThan(-1);
    expect(verifyIndex).toBeGreaterThan(ffIndex);
    expect(written).toContain('grade: S');
    expect(written).toContain('date: 2026-07-30');
  });

  it('refuses a malformed entry and leaves the file untouched', async () => {
    seed();
    await expect(
      execute({
        cwd: CWD,
        // @ts-expect-error — a grade in `result` is the canonical malformation.
        entry: { skill: 'prospec-verify', result: 'A', warnings: [] },
      }),
    ).rejects.toThrow();
    expect(vol.readFileSync(PATH, 'utf-8')).toBe(METADATA);
  });

  it('refuses to write when the existing metadata fails the schema', async () => {
    vol.fromJSON({ [PATH]: METADATA.replace('status: implemented', 'status: shipped') });
    await expect(
      execute({ cwd: CWD, entry: { skill: 's', result: 'PASS', warnings: [] } }),
    ).rejects.toThrow(MetadataValidationError);
  });
});
