import { describe, it, expect } from 'vitest';
import {
  normalizeLens,
  isConfirmedFinding,
  calculateLensYield,
  recommendLensRetirement,
  DEFAULT_LENS_THRESHOLDS,
  type ChangeReviewEntry,
} from '../../../src/lib/lens-yield.js';

describe('lens-yield library', () => {
  describe('normalizeLens', () => {
    it('trims whitespace and converts to lowercase', () => {
      expect(normalizeLens('  Correctness  ')).toBe('correctness');
      expect(normalizeLens('Security')).toBe('security');
      expect(normalizeLens('TEST-QUALITY')).toBe('test-quality');
    });
  });

  describe('isConfirmedFinding', () => {
    it('returns true for confirmed, fixed, verified statuses', () => {
      expect(isConfirmedFinding('confirmed')).toBe(true);
      expect(isConfirmedFinding('fixed')).toBe(true);
      expect(isConfirmedFinding('verified')).toBe(true);
    });

    it('returns false for open, not-found, invalid, or dropped', () => {
      expect(isConfirmedFinding('open')).toBe(false);
      expect(isConfirmedFinding('not-found')).toBe(false);
      expect(isConfirmedFinding('invalid')).toBe(false);
      expect(isConfirmedFinding('dropped')).toBe(false);
      expect(isConfirmedFinding('')).toBe(false);
      expect(isConfirmedFinding(undefined)).toBe(false);
    });
  });

  describe('calculateLensYield', () => {
    it('returns empty array when corpus is empty', () => {
      expect(calculateLensYield([])).toEqual([]);
    });

    it('ignores rows without lens field or empty lens', () => {
      const corpus: ChangeReviewEntry[] = [
        {
          changeName: 'change-1',
          rows: [
            { location: 'file.ts', severity: 'major', lens: '', status: 'fixed', summary: 'test' },
          ],
        },
      ];
      expect(calculateLensYield(corpus)).toEqual([]);
    });

    it('aggregates invocations and confirmed findings across changes', () => {
      const corpus: ChangeReviewEntry[] = [
        {
          changeName: 'change-1',
          date: '2026-01-01',
          lensesRun: ['correctness', 'security'],
          rows: [
            { location: 'a.ts', severity: 'critical', lens: 'correctness', status: 'fixed', summary: 'bug 1' },
            { location: 'b.ts', severity: 'major', lens: 'security', status: 'not-found', summary: 'false positive' },
          ],
        },
        {
          changeName: 'change-2',
          date: '2026-01-02',
          lensesRun: ['correctness', 'performance'],
          rows: [
            { location: 'c.ts', severity: 'major', lens: 'correctness', status: 'confirmed', summary: 'bug 2' },
            { location: 'd.ts', severity: 'minor', lens: 'performance', status: 'fixed', summary: 'perf 1' },
          ],
        },
        {
          changeName: 'change-3',
          date: '2026-01-03',
          lensesRun: ['security'],
          rows: [
            { location: 'e.ts', severity: 'major', lens: 'security', status: 'not-found', summary: 'false positive 2' },
          ],
        },
      ];

      const stats = calculateLensYield(corpus, { consecutive_zero_threshold: 2, min_invocations: 2 });
      expect(stats.length).toBe(3);

      const correctness = stats.find((s) => s.lens.toLowerCase() === 'correctness');
      expect(correctness).toBeDefined();
      expect(correctness?.invocations).toBe(2);
      expect(correctness?.confirmed_findings).toBe(2);
      expect(correctness?.yield_ratio).toBe(1);
      expect(correctness?.confirmed_per_invocation).toBe(1);
      expect(correctness?.consecutive_zero_changes).toBe(0);
      expect(correctness?.last_yield_change).toBe('change-2');
      expect(correctness?.action).toBe('keep');

      const security = stats.find((s) => s.lens.toLowerCase() === 'security');
      expect(security).toBeDefined();
      expect(security?.invocations).toBe(2);
      expect(security?.confirmed_findings).toBe(0);
      expect(security?.yield_ratio).toBe(0);
      expect(security?.consecutive_zero_changes).toBe(2);
      expect(security?.action).toBe('retire');
      expect(security?.reason).toContain('Consecutive zero confirmed findings');

      const performance = stats.find((s) => s.lens.toLowerCase() === 'performance');
      expect(performance).toBeDefined();
      expect(performance?.invocations).toBe(1);
      expect(performance?.confirmed_findings).toBe(1);
      expect(performance?.action).toBe('keep');
    });

    it('accounts for declared lenses with zero findings in a change', () => {
      const corpus: ChangeReviewEntry[] = [
        {
          changeName: 'change-1',
          date: '2026-01-01',
          lensesRun: ['correctness', 'security'],
          rows: [
            { location: 'a.ts', severity: 'critical', lens: 'correctness', status: 'fixed', summary: 'bug 1' },
          ],
        },
        {
          changeName: 'change-2',
          date: '2026-01-02',
          lensesRun: ['security'],
          rows: [],
        },
      ];

      const stats = calculateLensYield(corpus);
      const security = stats.find((s) => s.lens === 'security');
      expect(security).toBeDefined();
      expect(security?.invocations).toBe(2);
      expect(security?.confirmed_findings).toBe(0);
      expect(security?.invocation_source).toBe('declared');
    });

    it('marks low-yield lens as review when above min_invocations for declared lenses', () => {
      const corpus: ChangeReviewEntry[] = [
        {
          changeName: 'c1',
          lensesRun: ['style'],
          rows: [
            { location: 'a.ts', severity: 'major', lens: 'style', status: 'not-found', summary: 'f1' },
            { location: 'b.ts', severity: 'major', lens: 'style', status: 'not-found', summary: 'f2' },
          ],
        },
        {
          changeName: 'c2',
          lensesRun: ['style'],
          rows: [
            { location: 'c.ts', severity: 'major', lens: 'style', status: 'not-found', summary: 'f3' },
          ],
        },
        {
          changeName: 'c3',
          lensesRun: ['style'],
          rows: [
            { location: 'd.ts', severity: 'minor', lens: 'style', status: 'fixed', summary: 'f4' },
          ],
        },
        {
          changeName: 'c4',
          lensesRun: ['style'],
          rows: [
            { location: 'e.ts', severity: 'major', lens: 'style', status: 'not-found', summary: 'f5' },
          ],
        },
      ];

      // 4 invocations, 1 confirmed finding -> yield ratio = 0.25
      const stats = calculateLensYield(corpus, {
        consecutive_zero_threshold: 5,
        min_invocations: 3,
        min_yield: 0.3,
      });

      const style = stats.find((s) => s.lens === 'style');
      expect(style).toBeDefined();
      expect(style?.invocations).toBe(4);
      expect(style?.confirmed_findings).toBe(1);
      expect(style?.yield_ratio).toBe(0.25);
      expect(style?.consecutive_zero_changes).toBe(1);
      expect(style?.action).toBe('review');
      expect(style?.reason).toContain('below threshold');
    });

    it('keeps proxy rows as keep action even when thresholds would otherwise trigger', () => {
      const corpus: ChangeReviewEntry[] = [
        {
          changeName: 'c1',
          rows: [{ location: 'a.ts', severity: 'major', lens: 'proxy-lens', status: 'not-found', summary: 'f1' }],
        },
        {
          changeName: 'c2',
          rows: [{ location: 'b.ts', severity: 'major', lens: 'proxy-lens', status: 'not-found', summary: 'f2' }],
        },
        {
          changeName: 'c3',
          rows: [{ location: 'c.ts', severity: 'major', lens: 'proxy-lens', status: 'not-found', summary: 'f3' }],
        },
      ];

      const stats = calculateLensYield(corpus, { consecutive_zero_threshold: 2, min_invocations: 2 });
      const proxy = stats.find((s) => s.lens === 'proxy-lens');
      expect(proxy?.invocation_source).toBe('rows');
      expect(proxy?.action).toBe('keep');
      expect(proxy?.reason).toContain('proxy (rows only)');
    });
  });

  describe('declared vs rows-proxy invocations', () => {
    it('keeps an undeclared lens that reported findings visible as a rows-proxy invocation', () => {
      const corpus: ChangeReviewEntry[] = [
        {
          changeName: 'c1',
          lensesRun: ['correctness'],
          rows: [
            { location: 'a.ts', severity: 'critical', lens: 'spec-architecture', status: 'fixed', summary: 'f1' },
            { location: 'b.ts', severity: 'major', lens: 'correctness', status: 'not-found', summary: 'f2' },
          ],
        },
      ];
      const stats = calculateLensYield(corpus);
      const spec = stats.find((s) => s.lens === 'spec-architecture');
      expect(spec?.invocations).toBe(1);
      expect(spec?.declared_invocations).toBe(0);
      expect(spec?.confirmed_findings).toBe(1);
      expect(spec?.invocation_source).toBe('rows');
      const correctness = stats.find((s) => s.lens === 'correctness');
      expect(correctness?.declared_invocations).toBe(1);
      expect(correctness?.invocation_source).toBe('declared');
    });

    it('lets declared zero-yield runs retire a lens even when a legacy rows-only change also names it', () => {
      const corpus: ChangeReviewEntry[] = [
        {
          changeName: 'legacy',
          rows: [{ location: 'a.ts', severity: 'major', lens: 'security', status: 'fixed', summary: 'old' }],
        },
        ...[1, 2, 3, 4, 5, 6].map((n) => ({ changeName: `c${n}`, lensesRun: ['security', 'correctness'], rows: [] })),
      ];
      const stats = calculateLensYield(corpus, { consecutive_zero_threshold: 5, min_invocations: 3, min_yield: 0.1 });
      const security = stats.find((s) => s.lens === 'security');
      expect(security?.invocations).toBe(7);
      expect(security?.declared_invocations).toBe(6);
      expect(security?.invocation_source).toBe('declared');
      expect(security?.consecutive_zero_changes).toBe(6);
      expect(security?.action).toBe('retire');
      expect(security?.reason).toContain('6 declared invocations');
    });

    it('does not recommend retirement below min_invocations declared runs, and says why', () => {
      const corpus: ChangeReviewEntry[] = [1, 2].map((n) => ({ changeName: `c${n}`, lensesRun: ['style'], rows: [] }));
      const stats = calculateLensYield(corpus, { consecutive_zero_threshold: 2, min_invocations: 3, min_yield: 0.1 });
      const style = stats.find((s) => s.lens === 'style');
      expect(style?.action).toBe('keep');
      expect(style?.reason).toContain('below min_invocations');
    });
  });

  describe('recommendLensRetirement', () => {
    it('sorts results by yield_ratio ascending', () => {
      const stats = [
        {
          lens: 'High',
          invocations: 5,
          confirmed_findings: 5,
          yield_ratio: 1.0,
          consecutive_zero_changes: 0,
          action: 'keep' as const,
          invocation_source: 'declared' as const,
        },
        {
          lens: 'Zero',
          invocations: 5,
          confirmed_findings: 0,
          yield_ratio: 0.0,
          consecutive_zero_changes: 5,
          action: 'keep' as const,
          invocation_source: 'declared' as const,
        },
        {
          lens: 'Mid',
          invocations: 5,
          confirmed_findings: 2,
          yield_ratio: 0.4,
          consecutive_zero_changes: 1,
          action: 'keep' as const,
          invocation_source: 'declared' as const,
        },
      ];

      const res = recommendLensRetirement(stats, DEFAULT_LENS_THRESHOLDS);
      expect(res[0]?.lens).toBe('Zero');
      expect(res[1]?.lens).toBe('Mid');
      expect(res[2]?.lens).toBe('High');
    });
  });
});
