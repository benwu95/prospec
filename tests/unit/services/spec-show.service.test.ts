import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vol } from 'memfs';
import * as path from 'node:path';
import { execute } from '../../../src/services/spec-show.service.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs.promises, default: memfs.fs.promises };
});

/**
 * The REQ-scoped read's only I/O layer (REQ-SERVICES-084): resolve one feature
 * spec through the canonical contained reader, then delegate every decision about
 * WHAT to quote to the pure lib functions.
 */
const cwd = '/repo';

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
].join('\n');

beforeEach(() => {
  vol.reset();
  vol.fromJSON({
    '/repo/.prospec.yaml': 'version: 1.0.0\nproject:\n  name: quiz\npaths:\n  base_dir: prospec\n',
    '/repo/prospec/specs/features/quiz.md': SPEC,
    '/repo/prospec/specs/features/other.md': '#### REQ-OTHER-001: other\nBody.\n',
    '/repo/prospec/specs/features/_archived-old.md': '#### REQ-OLD-001: gone\nBody.\n',
  });
});

afterEach(() => {
  vol.reset();
});

describe('spec-show service', () => {
  it('returns the requested requirement slices with the resolved spec path', async () => {
    const result = await execute({ cwd, feature: 'quiz', req: ['REQ-QUIZ-002'] });
    expect(result.feature).toBe('quiz');
    expect(result.path).toBe(path.join('prospec', 'specs', 'features', 'quiz.md'));
    expect(result.slices.map((s) => s.id)).toEqual(['REQ-QUIZ-002']);
    expect(result.text).toContain('#### REQ-QUIZ-002: second');
    expect(result.misses).toEqual([]);
  });

  it('expands comma-separated and repeated selectors to the same selection', async () => {
    const commas = await execute({ cwd, feature: 'quiz', req: ['REQ-QUIZ-001,REQ-QUIZ-002'] });
    const repeated = await execute({
      cwd,
      feature: 'quiz',
      req: ['REQ-QUIZ-001', 'REQ-QUIZ-002'],
    });
    expect(commas.slices.map((s) => s.id)).toEqual(['REQ-QUIZ-001', 'REQ-QUIZ-002']);
    expect(commas.text).toBe(repeated.text);
    expect(commas.misses).toEqual(repeated.misses);
  });

  it('reports unmatched selectors rather than an empty success, with the flag they came from', async () => {
    const result = await execute({ cwd, feature: 'quiz', req: ['REQ-QUIZ-404'], story: ['US-9'] });
    expect(result.slices).toEqual([]);
    // The kind comes from the flag, never from the selector's shape: `--story 34`
    // and `--req us-1` were both mislabelled by a `startsWith('US-')` guess.
    expect(result.misses).toEqual([
      { selector: 'REQ-QUIZ-404', kind: 'req' },
      { selector: 'US-9', kind: 'story' },
    ]);
  });

  it('labels a story-shaped id asked for as a REQ by the flag it arrived on', async () => {
    const result = await execute({ cwd, feature: 'quiz', req: ['US-1'], story: ['34'] });
    expect(result.misses).toEqual([
      { selector: 'US-1', kind: 'req' },
      { selector: '34', kind: 'story' },
    ]);
  });

  it('refuses a selector flag that expands to nothing instead of printing the whole spec', async () => {
    // `--req ''`, `--req ,` and `--req '  '` fell into the whole-spec branch with
    // exit 0 — the read this command exists to replace, and exactly what a station
    // loop passes when its REQ list is empty.
    for (const empty of ['', ',', '  ', ',,,']) {
      await expect(execute({ cwd, feature: 'quiz', req: [empty] }), empty).rejects.toThrow(
        PrerequisiteError,
      );
    }
    await expect(execute({ cwd, feature: 'quiz', story: [''] })).rejects.toThrow(PrerequisiteError);
  });

  it('returns the whole spec when no selector is given', async () => {
    const result = await execute({ cwd, feature: 'quiz' });
    expect(result.text).toBe(SPEC);
    expect(result.slices).toEqual([]);
    expect(result.misses).toEqual([]);
  });

  it('refuses an absent feature and names the ones that exist', async () => {
    await expect(execute({ cwd, feature: 'nope' })).rejects.toThrow(PrerequisiteError);
    // The names live in `suggestion`, which is the field the CLI prints as the
    // actionable half of a refusal — asserting only the message would pass while
    // the user was told nothing they could act on.
    await expect(execute({ cwd, feature: 'nope' })).rejects.toMatchObject({
      suggestion: expect.stringContaining('other, quiz'),
    });
  });

  it('refuses an archived spec — historical material is not the capability record', async () => {
    await expect(execute({ cwd, feature: '_archived-old' })).rejects.toThrow(PrerequisiteError);
  });

  it('refuses a traversing feature name before it reaches the filesystem', async () => {
    for (const feature of ['../../etc/passwd', 'a/b', '.hidden']) {
      await expect(execute({ cwd, feature }), feature).rejects.toThrow(PrerequisiteError);
    }
  });

  it('refuses a spec symlinked outside the features root', async () => {
    vol.symlinkSync('/outside.md', '/repo/prospec/specs/features/escaped.md');
    vol.writeFileSync('/outside.md', '#### REQ-ESCAPED-001: nope\n');
    await expect(execute({ cwd, feature: 'escaped' })).rejects.toThrow(PrerequisiteError);
  });
});
