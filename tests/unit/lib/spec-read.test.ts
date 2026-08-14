import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import { readSpecSlices, assembleWholeSpec, type SpecReadSelectors } from '../../../src/lib/spec-read.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs.promises, default: memfs.fs.promises };
});

/**
 * The one shared entry below the service layer (REQ-LIB-055): resolution +
 * contained read + selector expansion + selection, as a discriminated result so
 * the CLI `spec show` service and the MCP `get_spec_requirements` tool each apply
 * their own no-selector policy without re-deriving the four steps below it.
 */
const FEATURES_DIR = '/repo/prospec/specs/features';

const SPEC = [
  '---',
  'feature: quiz',
  'status: active',
  '---',
  '',
  '## US-1: First story [P0]',
  '',
  '#### REQ-QUIZ-001: first',
  'Body one.',
  '',
  '#### REQ-QUIZ-002: second',
  'Body two.',
  '',
  '## Deprecated Requirements',
  '',
  '#### ~~REQ-QUIZ-003~~: retired',
  'Gone.',
  '',
].join('\n');

beforeEach(() => {
  vol.reset();
  vol.fromJSON({
    [`${FEATURES_DIR}/quiz.md`]: SPEC,
    [`${FEATURES_DIR}/other.md`]: '#### REQ-OTHER-001: other\nBody.\n',
    [`${FEATURES_DIR}/_archived-old.md`]: '#### REQ-OLD-001: gone\nBody.\n',
    // An unsafe name the read path would refuse anyway — the available list must
    // filter it, so a refusal never advertises a spec the reader cannot serve.
    [`${FEATURES_DIR}/-dash.md`]: '#### REQ-DASH-001: nope\nBody.\n',
  });
});

afterEach(() => {
  vol.reset();
});

describe('readSpecSlices', () => {
  it('reports not-found with the guard-filtered list of specs that do exist', () => {
    const result = readSpecSlices(FEATURES_DIR, 'nope', {});
    expect(result.status).toBe('not-found');
    // sorted, non-archived, and `-dash` filtered by isSafeResourceName
    expect(result).toMatchObject({ status: 'not-found', available: ['other', 'quiz'] });
  });

  it('reports not-found for an archived or traversing name, never a silent empty read', () => {
    for (const feature of ['_archived-old', '../../etc/passwd', 'a/b', '.hidden']) {
      expect(readSpecSlices(FEATURES_DIR, feature, {}).status, feature).toBe('not-found');
    }
  });

  it('reports no-selector with the read content and flagsGiven 0 when no flag is given', () => {
    const result = readSpecSlices(FEATURES_DIR, 'quiz', {});
    expect(result).toEqual({ status: 'no-selector', content: SPEC, flagsGiven: 0 });
  });

  it('keeps "flag given but empty" apart from "no flag" via flagsGiven', () => {
    // `--req ''`, `--req ,` expand to nothing but ARE flags — the surface refuses
    // them, so the count must survive the expansion that empties the ids.
    const cases: [SpecReadSelectors, number][] = [
      [{ req: [''] }, 1],
      [{ req: [','] }, 1],
      [{ req: ['  '] }, 1],
      [{ req: [''], story: [''] }, 2],
    ];
    for (const [selectors, flagsGiven] of cases) {
      const result = readSpecSlices(FEATURES_DIR, 'quiz', selectors);
      expect(result, JSON.stringify(selectors)).toMatchObject({ status: 'no-selector', flagsGiven });
    }
  });

  it('selects slices and carries the expanded selectors when selectors match', () => {
    const result = readSpecSlices(FEATURES_DIR, 'quiz', { req: ['REQ-QUIZ-002'] });
    expect(result.status).toBe('sliced');
    if (result.status !== 'sliced') throw new Error('unreachable');
    expect(result.selection.slices.map((s) => s.id)).toEqual(['REQ-QUIZ-002']);
    expect(result.selection.misses).toEqual([]);
    expect(result.req).toEqual(['REQ-QUIZ-002']);
    expect(result.story).toEqual([]);
  });

  it('routes a story-only selector to the sliced branch, not no-selector', () => {
    // Pins the AND in the no-selector guard: `req.length === 0 && story.length === 0`.
    // With only a story given, req is empty but the call still has a selector, so it
    // must slice — dropping the story clause would misroute this to no-selector.
    const result = readSpecSlices(FEATURES_DIR, 'quiz', { story: ['US-1'] });
    expect(result.status).toBe('sliced');
    if (result.status !== 'sliced') throw new Error('unreachable');
    expect(result.req).toEqual([]);
    expect(result.story).toEqual(['US-1']);
  });

  it('selects a struck requirement — the index is built with includeStruck, so a retired REQ is reachable and marked struck', () => {
    // Pins `includeStruck: true`: with it false the struck id is absent from the
    // index and this selection would be a miss instead of a struck slice.
    const result = readSpecSlices(FEATURES_DIR, 'quiz', { req: ['REQ-QUIZ-003'] });
    if (result.status !== 'sliced') throw new Error('unreachable');
    expect(result.selection.slices.map((s) => s.id)).toEqual(['REQ-QUIZ-003']);
    expect(result.selection.slices[0]?.struck).toBe(true);
    expect(result.selection.misses).toEqual([]);
  });

  it('expands comma-separated and repeated selectors to one selector set', () => {
    const commas = readSpecSlices(FEATURES_DIR, 'quiz', { req: ['REQ-QUIZ-001,REQ-QUIZ-002'] });
    const repeated = readSpecSlices(FEATURES_DIR, 'quiz', { req: ['REQ-QUIZ-001', 'REQ-QUIZ-002'] });
    if (commas.status !== 'sliced' || repeated.status !== 'sliced') throw new Error('unreachable');
    expect(commas.selection.slices.map((s) => s.id)).toEqual(['REQ-QUIZ-001', 'REQ-QUIZ-002']);
    expect(commas.selection.slices.map((s) => s.id)).toEqual(repeated.selection.slices.map((s) => s.id));
    expect(commas.req).toEqual(repeated.req);
  });

  it('returns a selector that matched nothing as a miss, not an empty result', () => {
    const result = readSpecSlices(FEATURES_DIR, 'quiz', { req: ['REQ-QUIZ-404'], story: ['US-9'] });
    if (result.status !== 'sliced') throw new Error('unreachable');
    expect(result.selection.slices).toEqual([]);
    expect(result.selection.misses).toEqual(['REQ-QUIZ-404', 'US-9']);
    expect(result.req).toEqual(['REQ-QUIZ-404']);
    expect(result.story).toEqual(['US-9']);
  });
});

describe('assembleWholeSpec', () => {
  it('returns a string spec verbatim', () => {
    expect(assembleWholeSpec('# whole\n\nbody\n')).toBe('# whole\n\nbody\n');
  });

  it('joins the main file and each slice body for a slice-based spec', () => {
    expect(assembleWholeSpec({ main: 'MAIN', slices: { a: 'ALPHA', b: 'BETA' } })).toBe(
      'MAIN\n\nALPHA\n\nBETA',
    );
  });

  it('appends the empty tail for a slice-based spec with no readable slices', () => {
    expect(assembleWholeSpec({ main: 'MAIN', slices: {} })).toBe('MAIN\n\n');
  });
});
