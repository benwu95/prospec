import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CandidateFileInput } from './artifact-validators.js';
import { readContainedText } from './knowledge-reader.js';

export const CANDIDATES_DIR = 'candidates';
export const DECISION_FILE = 'decision.json';
const CANDIDATE_FILE = /^option-.*\.json$/;

export interface CandidateFiles {
  candidates: CandidateFileInput[];
  /** null when `candidates/decision.json` is absent. */
  decision: CandidateFileInput | null;
}

/**
 * Read a change's (or an archived change's) `candidates/` as the candidate verdict
 * consumes it — the one place the directory and file names are spelled. A missing or
 * non-directory `candidates` reads as empty, so the verdict FAILs instead of throwing;
 * a file resolving outside the change directory (a symlink) reads as unreadable.
 */
export function readCandidateFiles(changeDir: string): CandidateFiles {
  const dir = path.join(changeDir, CANDIDATES_DIR);
  const read = (file: string): CandidateFileInput => ({
    file,
    content: readContainedText(path.join(dir, file), changeDir),
  });
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    entries = [];
  }
  return {
    candidates: entries.filter((f) => CANDIDATE_FILE.test(f)).sort().map(read),
    decision: entries.includes(DECISION_FILE) ? read(DECISION_FILE) : null,
  };
}
