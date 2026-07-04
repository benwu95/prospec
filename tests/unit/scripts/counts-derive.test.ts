import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { deriveTestCounts, deriveInventory } from '../../../scripts/counts/derive.js';

describe('deriveTestCounts', () => {
  it('buckets a vitest json report into total + per-layer + file count', () => {
    const report = {
      testResults: [
        { name: '/repo/tests/unit/lib/a.test.ts', assertionResults: [{}, {}, {}] },
        { name: '/repo/tests/unit/services/b.test.ts', assertionResults: [{}, {}] },
        { name: '/repo/tests/contract/c.test.ts', assertionResults: [{}] },
        { name: '/repo/tests/integration/d.test.ts', assertionResults: [{}, {}, {}, {}] },
        { name: '/repo/tests/e2e/e.test.ts', assertionResults: [{}] },
      ],
    };
    expect(deriveTestCounts(report)).toEqual({
      'tests.total': 11,
      'tests.unit': 5,
      'tests.contract': 1,
      'tests.integration': 4,
      'tests.e2e': 1,
      'tests.files': 5,
    });
  });

  it('counts a file with no bucketable layer into total but not any layer', () => {
    const report = {
      testResults: [
        { name: '/repo/tests/unit/a.test.ts', assertionResults: [{}, {}] },
        { name: '/repo/tests/weird/x.test.ts', assertionResults: [{}, {}, {}] },
      ],
    };
    const out = deriveTestCounts(report)!;
    expect(out['tests.total']).toBe(5);
    expect(out['tests.unit']).toBe(2);
    expect(out['tests.files']).toBe(2);
  });

  it('normalizes windows path separators when bucketing', () => {
    const report = {
      testResults: [{ name: 'C:\\repo\\tests\\unit\\a.test.ts', assertionResults: [{}, {}] }],
    };
    expect(deriveTestCounts(report)!['tests.unit']).toBe(2);
  });

  it('returns null for an empty or resultless report (caller skips, never fabricates)', () => {
    expect(deriveTestCounts({})).toBeNull();
    expect(deriveTestCounts({ testResults: [] })).toBeNull();
  });
});

describe('deriveInventory', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('counts .hbs files under src/templates by category', () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'counts-inv-'));
    const t = (rel: string) => {
      const abs = path.join(dir, 'src/templates', rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, 'x');
    };
    t('skills/prospec-a.hbs');
    t('skills/prospec-b.hbs');
    t('skills/_partial.hbs');
    t('skills/references/r1.hbs');
    t('skills/references/nested/r2.hbs');
    t('agent-configs/claude.hbs');
    t('change/proposal.hbs');
    t('change/tasks.hbs');
    t('init/x.hbs');
    t('knowledge/y.hbs');
    t('knowledge/z.hbs');

    expect(deriveInventory(dir)).toEqual({
      'templates.hbs.total': 11,
      'templates.hbs.skills': 2,
      'templates.hbs.partials': 1,
      'templates.hbs.references': 2,
      'templates.hbs.agentConfig': 1,
      'templates.hbs.change': 2,
      'templates.hbs.initKnowledge': 3,
    });
  });
});
