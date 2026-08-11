/**
 * Contract: the generated-artifact paths and its producer share ONE source.
 *
 * `BUNDLED_TEMPLATES_SOURCE` is used in prospec.yaml's generated_artifacts exclusion.
 * If the bundler could name its own output path independently, moving that output
 * would leave the configuration pointing at a path nothing writes (REQ-LIB-039).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BUNDLED_TEMPLATES_SOURCE } from '../../src/lib/generated-artifacts.js';
import { OUTPUT_FILE } from '../../scripts/bundle-templates.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

describe('generated-artifact registry', () => {
  it('is where the templates bundler resolves its own output path', () => {
    expect(OUTPUT_FILE).toBe(path.resolve(REPO_ROOT, BUNDLED_TEMPLATES_SOURCE));
  });

  it('holds the only copy of that path — the producer re-types none of it', () => {
    const producer = fs.readFileSync(path.join(REPO_ROOT, 'scripts/bundle-templates.ts'), 'utf-8');

    // Pins the WRITE TARGET, not merely the export — the equality above still
    // holds if the bundler keeps a private path and writes there instead.
    expect(producer).toMatch(/writeFileSync\(\s*OUTPUT_FILE\s*,/);
    // A second literal is the drift this contract exists to prevent: it would
    // keep passing both assertions above while the two copies diverge.
    expect(producer).not.toContain(path.posix.basename(BUNDLED_TEMPLATES_SOURCE));
  });
});
