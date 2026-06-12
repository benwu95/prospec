import { describe, it, expect } from 'vitest';
import { parseTaskLine } from '../../../src/lib/task-markers.js';

describe('parseTaskLine (single frozen kind grammar)', () => {
  it('parses checked state, kind markers, and [P] composition', () => {
    expect(parseTaskLine('- [x] T1 implement schema ~10 lines')).toMatchObject({
      checked: true,
      kind: 'code',
    });
    expect(parseTaskLine('- [ ] T2 [M] run agent sync ~5 lines')).toMatchObject({
      checked: false,
      kind: 'manual',
    });
    expect(parseTaskLine('- [X] T3 [P] [V] mutation-verify ~5 lines')).toMatchObject({
      checked: true,
      kind: 'verification',
    });
    expect(parseTaskLine('* [ ] untagged id-less task')).toMatchObject({
      checked: false,
      kind: 'code',
    });
  });

  it('returns null for non-task lines', () => {
    expect(parseTaskLine('## Tasks')).toBeNull();
    expect(parseTaskLine('plain prose with [M] inside')).toBeNull();
  });

  it('does not read a mid-text [M] as a kind marker', () => {
    expect(parseTaskLine('- [ ] T4 document the [M] marker semantics')).toMatchObject({
      kind: 'code',
    });
  });
});
