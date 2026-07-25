/**
 * Contract: the generated `bundled-templates.ts` matches `src/templates/`.
 *
 * `renderTemplate` resolves the bundle BEFORE the filesystem, so every other
 * contract test validates the generated bundle — a developer who edits a `.hbs`
 * and forgets `pnpm bundle` gets a green suite and ships the old template (both
 * the standalone binary and `agent sync` read the bundle). This test is the only
 * thing that turns that into a red.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BUNDLED_TEMPLATES } from '../../src/lib/bundled-templates.js';

const TEMPLATES_DIR = path.resolve(import.meta.dirname, '../../src/templates');

/** Every `.hbs` under src/templates, as bundle keys (posix, templates-relative). */
function templateKeys(dir: string, prefix = ''): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return templateKeys(path.join(dir, entry.name), key);
      return entry.name.endsWith('.hbs') ? [key] : [];
    })
    .sort();
}

describe('bundled templates stay in sync with src/templates', () => {
  const keys = templateKeys(TEMPLATES_DIR);

  it('bundles every template on disk, and no extras', () => {
    expect(keys.length).toBeGreaterThan(0);
    expect(Object.keys(BUNDLED_TEMPLATES).sort()).toEqual(keys);
  });

  it('bundles each template byte-for-byte', () => {
    const drifted = keys.filter(
      (key) => BUNDLED_TEMPLATES[key] !== fs.readFileSync(path.join(TEMPLATES_DIR, key), 'utf-8'),
    );

    expect(drifted, `run \`pnpm bundle\`: ${drifted.join(', ')}`).toEqual([]);
  });
});
