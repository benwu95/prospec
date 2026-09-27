import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';

/** Identity and signing flags every git-fixture test passes, so a commit needs no global config. */
export const GIT_ID = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false'] as const;

/** Run git in `cwd` with the fixture identity; returns trimmed stdout. */
export function gitIn(cwd: string, ...args: string[]): string {
  return execFileSync('git', [...GIT_ID, ...args], { cwd, stdio: 'pipe' }).toString().trim();
}

/**
 * Every entry under `root`, keyed by relative path — a byte image of a directory:
 * `dir` for a directory, `link:<target>` for a symlink, else the file's mode and
 * base64 bytes — so two images are equal only when nothing (bytes or mode) moved.
 */
export function imageOf(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) {
        out.set(rel, 'dir');
        walk(full);
      } else if (entry.isSymbolicLink()) out.set(rel, `link:${readlinkSync(full)}`);
      // `Dirent` carries no mode: read it, so a chmod alone makes two images differ.
      else out.set(rel, `${(lstatSync(full).mode & 0o777).toString(8)}:${readFileSync(full).toString('base64')}`);
    }
  };
  walk(root);
  return out;
}
