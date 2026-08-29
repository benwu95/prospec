/**
 * Startup import-order guard (REQ-CLI-046).
 *
 * `enable-compile-cache` must run before everything (its own module so it beats
 * the hoisted imports), and `setup-color` must still precede any picocolors
 * consumer — reordering the latter re-enables color on non-TTY stdout. A static
 * source assertion because the invariant is about import ORDER in the entry
 * file, which no runtime probe reflects once modules are cached.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.resolve(__dirname, '../../../src/cli/index.ts');

describe('CLI entry import order (REQ-CLI-046)', () => {
  const src = readFileSync(INDEX, 'utf-8');
  const idx = (needle: string) => src.indexOf(needle);

  it('enables the compile cache before setup-color', () => {
    const cache = idx("import './enable-compile-cache.js'");
    const color = idx("import './setup-color.js'");
    expect(cache).toBeGreaterThanOrEqual(0);
    expect(color).toBeGreaterThanOrEqual(0);
    expect(cache).toBeLessThan(color);
  });

  it('imports setup-color before any picocolors consumer', () => {
    const color = idx("import './setup-color.js'");
    const pico = idx("from 'picocolors'");
    expect(color).toBeGreaterThanOrEqual(0);
    // picocolors is imported directly by index.ts; setup-color must precede it.
    if (pico >= 0) expect(color).toBeLessThan(pico);
  });

  it('runs enable-compile-cache before the first picocolors consumer', () => {
    const cache = idx("import './enable-compile-cache.js'");
    const pico = idx("from 'picocolors'");
    if (pico >= 0) expect(cache).toBeLessThan(pico);
  });
});
