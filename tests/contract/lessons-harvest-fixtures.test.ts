import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseYaml } from '../../src/lib/yaml-utils.js';

// Synthetic archived-change corpus for the knowledge flywheel (BL-029).
// The harvest itself is an LLM Skill step verified by dogfood, not here (REQ-TESTS-025
// deliberate exclusion). This guards that the dogfood corpus stays well-formed and keeps
// encoding the recurrence / no-skip scenarios a harvester must discriminate.
const ROOT = path.resolve(__dirname, '../fixtures/lessons-harvest');
const read = (c: string, f: string) =>
  fs.readFileSync(path.join(ROOT, c, f), 'utf-8');
const meta = (c: string) =>
  parseYaml(read(c, 'metadata.yaml'), `${c}/metadata.yaml`) as {
    status: string;
    quality_log: { result: string; warnings: string[] }[];
  };
const hasUncheckedManual = (tasks: string) =>
  tasks.split('\n').some((l) => /^- \[ \].*\[M\]/.test(l));

const CHANGES = ['2026-05-01-alpha', '2026-05-08-beta', '2026-05-15-gamma'];

describe('lessons-harvest fixtures (BL-029)', () => {
  it('every change parses with an archived status and a quality_log array', () => {
    for (const c of CHANGES) {
      const m = meta(c);
      expect(m.status).toBe('archived');
      expect(Array.isArray(m.quality_log)).toBe(true);
    }
  });

  it('alpha+beta encode the same recurring FAIL across distinct changes', () => {
    const a = meta('2026-05-01-alpha').quality_log[0]!;
    const b = meta('2026-05-08-beta').quality_log[0]!;
    expect(a.result).toBe('FAIL');
    expect(b.result).toBe('FAIL');
    expect(a.warnings[0]).toEqual(b.warnings[0]); // shared lesson-key candidate
  });

  it('manual-skip recurs in alpha+beta but not in the all-complete gamma', () => {
    expect(hasUncheckedManual(read('2026-05-01-alpha', 'tasks.md'))).toBe(true);
    expect(hasUncheckedManual(read('2026-05-08-beta', 'tasks.md'))).toBe(true);
    expect(hasUncheckedManual(read('2026-05-15-gamma', 'tasks.md'))).toBe(false);
  });
});
