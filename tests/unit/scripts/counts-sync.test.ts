import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { syncCounts, checkFailed } from '../../../scripts/counts/sync.js';
import type { TruthMap } from '../../../scripts/counts/types.js';

const TRUTH: TruthMap = {
  'tests.total': 1865,
  'tests.unit': 1204,
  'tests.contract': 580,
  'tests.integration': 38,
  'tests.e2e': 43,
  'tests.files': 78,
  'templates.hbs.total': 58,
  'templates.hbs.skills': 17,
  'templates.hbs.partials': 2,
  'templates.hbs.references': 19,
  'templates.hbs.agentConfig': 1,
  'templates.hbs.change': 4,
  'templates.hbs.initKnowledge': 15,
};

// A ledger-style historical line — no anchor matches it, so it must stay frozen.
const HISTORICAL = '> 測試數 1800→1860→1862 逐層重導（歷史，勿改）';

const README_STALE = [
  '[![Tests](https://img.shields.io/badge/tests-1800%20passing-success)](tests/)',
  HISTORICAL,
  '# Run all tests (1800 tests)',
  '**Test Coverage**: 1800 tests across 4 categories:',
  '- Unit tests (types + lib + services + cli): 1200 tests',
  '- Contract tests (CLI output + Skill format): 500 tests',
  '- Integration tests: 30 tests',
  '- E2E tests: 40 tests',
  '└── templates/    — Handlebars templates (50 .hbs files)',
].join('\n');

const INDEX_STALE = [
  '| **tests** | kw | al | Active | 4-layer test suite — 70 files, 1,800 tests (unit 1200 + contract 500 + integration 30 + e2e 40), incl. x | q | all |',
  '| **templates** | kw | al | Active | Handlebars template library — 15 skills + 1 shared partials, 17 references, 0 agent-config, 3 change, 12 init/knowledge (50 `.hbs`, English-only) | pure | — |',
].join('\n');

let root: string;
function setup(): string {
  root = mkdtempSync(path.join(os.tmpdir(), 'counts-sync-'));
  const write = (rel: string, body: string) => {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  };
  write('README.md', README_STALE);
  write('prospec/index.md', INDEX_STALE);
  return root;
}
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const read = (rel: string) => readFileSync(path.join(root, rel), 'utf-8');

describe('syncCounts write mode', () => {
  it('rewrites every whitelisted count to the truth value, in-place', async () => {
    setup();
    await syncCounts({ repoRoot: root, check: false, truth: TRUTH });
    const readme = read('README.md');
    expect(readme).toContain('badge/tests-1865%20passing');
    expect(readme).toContain('# Run all tests (1865 tests)');
    expect(readme).toContain('**Test Coverage**: 1865 tests across');
    expect(readme).toContain('Unit tests (types + lib + services + cli): 1204 tests');
    expect(readme).toContain('Integration tests: 38 tests');
    expect(readme).toContain('Handlebars templates (58 .hbs files)');

    const index = read('prospec/index.md');
    expect(index).toContain('78 files, 1,865 tests (unit 1204 + contract 580 + integration 38 + e2e 43)');
    expect(index).toContain('17 skills + 2 shared partials, 19 references, 1 agent-config, 4 change, 15 init/knowledge (58 `.hbs`');
  });

  it('never rewrites a non-anchored historical line', async () => {
    setup();
    await syncCounts({ repoRoot: root, check: false, truth: TRUTH });
    expect(read('README.md')).toContain(HISTORICAL);
  });

  it('reports written docs and per-number changes', async () => {
    setup();
    const report = await syncCounts({ repoRoot: root, check: false, truth: TRUTH });
    expect(report.written.sort()).toEqual(['README.md', 'prospec/index.md']);
    expect(report.changes.length).toBeGreaterThan(0);
    for (const c of report.changes) {
      expect(c.from).not.toBe(c.to);
    }
  });

  it('is idempotent — a second run makes no changes', async () => {
    setup();
    await syncCounts({ repoRoot: root, check: false, truth: TRUTH });
    const report2 = await syncCounts({ repoRoot: root, check: false, truth: TRUTH });
    expect(report2.changes).toHaveLength(0);
    expect(report2.written).toHaveLength(0);
  });

  it('skips missing docs without error (only README + index exist here)', async () => {
    setup();
    const report = await syncCounts({ repoRoot: root, check: false, truth: TRUTH });
    // tests/templates module READMEs are absent in this fixture — no throw, not written
    expect(report.written).not.toContain('prospec/ai-knowledge/modules/tests/README.md');
  });
});

describe('syncCounts --check (dry-run)', () => {
  it('reports drift but writes nothing', async () => {
    setup();
    const before = read('README.md');
    const report = await syncCounts({ repoRoot: root, check: true, truth: TRUTH });
    expect(report.changes.length).toBeGreaterThan(0);
    expect(report.written).toHaveLength(0);
    expect(read('README.md')).toBe(before); // untouched
  });

  it('reports no drift once the docs are already synced', async () => {
    setup();
    await syncCounts({ repoRoot: root, check: false, truth: TRUTH });
    const report = await syncCounts({ repoRoot: root, check: true, truth: TRUTH });
    expect(report.changes).toHaveLength(0);
  });
});

describe('syncCounts honest skip', () => {
  it('leaves test-count spots untouched when the test source was skipped, still fixing inventory', async () => {
    setup();
    const inventoryOnly: TruthMap = {
      'templates.hbs.total': 58,
      'templates.hbs.skills': 17,
      'templates.hbs.partials': 2,
      'templates.hbs.references': 19,
      'templates.hbs.agentConfig': 1,
      'templates.hbs.change': 4,
      'templates.hbs.initKnowledge': 15,
    };
    const report = await syncCounts({
      repoRoot: root,
      check: false,
      truth: inventoryOnly,
      skipped: [{ key: 'tests.total', reason: 'vitest unavailable' }],
    });
    // inventory fixed…
    expect(read('README.md')).toContain('Handlebars templates (58 .hbs files)');
    // …but every test count stays stale (no fabricated write)
    expect(read('README.md')).toContain('# Run all tests (1800 tests)');
    expect(report.changes.every((c) => c.key.startsWith('templates.'))).toBe(true);
    expect(report.skipped).toEqual([{ key: 'tests.total', reason: 'vitest unavailable' }]);
  });
});

describe('checkFailed (CI gate must fail closed)', () => {
  const base = { changes: [], written: [], skipped: [] };
  it('fails on drift', () => {
    expect(
      checkFailed({ ...base, changes: [{ doc: 'x', key: 'k', line: 1, from: '1', to: '2' }] }),
    ).toBe(true);
  });
  it('fails when a count source was skipped, even with no visible drift', () => {
    expect(checkFailed({ ...base, skipped: [{ key: 'tests.total', reason: 'unavailable' }] })).toBe(
      true,
    );
  });
  it('passes only when there is no drift and nothing was skipped', () => {
    expect(checkFailed(base)).toBe(false);
  });
});
