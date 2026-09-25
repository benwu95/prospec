import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readCandidateFiles } from '../../../src/lib/plan-candidates.js';

let root: string;
let changeDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'plan-candidates-'));
  changeDir = path.join(root, '.prospec', 'changes', 'pick-arch');
  mkdirSync(changeDir, { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('readCandidateFiles (REQ-SERVICES-118)', () => {
  it('reads the option files in order and the decision, ignoring other files', () => {
    mkdirSync(path.join(changeDir, 'candidates'));
    writeFileSync(path.join(changeDir, 'candidates/option-b.json'), 'b');
    writeFileSync(path.join(changeDir, 'candidates/option-a.json'), 'a');
    writeFileSync(path.join(changeDir, 'candidates/notes.md'), 'n');
    writeFileSync(path.join(changeDir, 'candidates/decision.json'), 'd');
    expect(readCandidateFiles(changeDir)).toEqual({
      candidates: [
        { file: 'option-a.json', content: 'a' },
        { file: 'option-b.json', content: 'b' },
      ],
      decision: { file: 'decision.json', content: 'd' },
    });
  });

  it('reads an absent or non-directory candidates as empty instead of throwing', () => {
    expect(readCandidateFiles(changeDir)).toEqual({ candidates: [], decision: null });
    writeFileSync(path.join(changeDir, 'candidates'), 'not a directory');
    expect(readCandidateFiles(changeDir)).toEqual({ candidates: [], decision: null });
  });

  it('reads a file resolving outside the change directory as unreadable', () => {
    const outside = path.join(root, 'outside.json');
    writeFileSync(outside, '{"id":"option-a"}');
    mkdirSync(path.join(changeDir, 'candidates'));
    symlinkSync(outside, path.join(changeDir, 'candidates/option-a.json'));
    symlinkSync(outside, path.join(changeDir, 'candidates/decision.json'));
    expect(readCandidateFiles(changeDir)).toEqual({
      candidates: [{ file: 'option-a.json', content: null }],
      decision: { file: 'decision.json', content: null },
    });
  });
});
