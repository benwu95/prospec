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

// A Windows checkout hands every consumer CRLF lines (the Git for Windows installer
// sets `core.autocrlf=true`; git's own default is `false`), and this repo ships no
// `.gitattributes` to force LF back. `$` without the `m` flag
// anchors the string end and `.` never matches `\r`, so the whole grammar missed
// every line: four consumers (drift task facts, `prospec status` routing,
// `change progress`, archive task stats) then agreed a populated tasks.md had no
// tasks at all — and zero is a legal value for a list not yet written.
describe('parseTaskLine line endings', () => {
  const TASKS = [
    '- [x] T1 implement schema ~10 lines',
    '- [ ] T2 [M] run agent sync ~5 lines',
    '- [X] T3 [P] [V] mutation-verify ~5 lines',
    '* [ ] untagged id-less task',
    '## not a task line',
  ].join('\n');

  const parseAll = (text: string) => text.split('\n').map(parseTaskLine);

  it('reads a CRLF task list identically to its LF form', () => {
    const lf = parseAll(TASKS);
    const crlf = parseAll(TASKS.replace(/\n/g, '\r\n'));
    // Whole-record equality, not counts: a matcher that dropped `kind` or kept
    // `\r` in `text` would still agree on how many lines parsed.
    expect(crlf).toEqual(lf);
    // Anti-vacuity: the differential is meaningless if the LF side parses nothing.
    expect(lf.filter((t) => t !== null)).toHaveLength(4);
  });

  it('parses a mixed-ending list per line, not by document', () => {
    const mixed = '- [x] T1 done\r\n- [ ] T2 [V] check\n';
    expect(mixed.split('\n').map(parseTaskLine).filter((t) => t !== null)).toEqual([
      { checked: true, kind: 'code', text: 'T1 done' },
      { checked: false, kind: 'verification', text: 'T2 [V] check' },
    ]);
  });
});
