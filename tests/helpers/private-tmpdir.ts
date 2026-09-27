import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

const TMP_VARS = ['TMPDIR', 'TEMP', 'TMP'] as const;

/**
 * Give this test file its own temporary directory for the whole run and remove
 * it after the file: `os.tmpdir()` — and so `snapshotRoot()` — reads the
 * environment on every call, so every delegation snapshot the file builds lands
 * under a root only this file uses. A cleanup keyed on ticket files misses the
 * snapshot of an issue refused midway or of a superseded attempt, and a cleanup
 * keyed on stems can delete another file's live snapshot in a parallel worker;
 * a private root has neither problem.
 */
export function usePrivateTmpdir(label: string): string {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), `prospec-test-${label}-`)));
  const saved = TMP_VARS.map((name) => [name, process.env[name]] as const);
  for (const name of TMP_VARS) process.env[name] = root;
  afterAll(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
