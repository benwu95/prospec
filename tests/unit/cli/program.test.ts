import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `src/cli/program.ts` holds the program factory and the parse/error-dispatch
 * loop, extracted out of `src/cli/index.ts` so the e2e suite can drive the CLI
 * in-process. The load-bearing guarantee is IMPORT PURITY: importing this
 * module must not parse argv, write output, or set an exit code (contrast:
 * importing `index.ts` runs `runProgram(process.argv)` on load). These tests
 * pin that guarantee and the per-call independence in-process runs depend on;
 * command behavior itself is covered end-to-end by the e2e suite driving
 * `runProgram()`, and createProgram's registration surface by `index.test.ts`.
 */
describe('program module import purity', () => {
  let exitBefore: typeof process.exitCode;
  let writes: string[];
  let origOut: typeof process.stdout.write;
  let origErr: typeof process.stderr.write;

  beforeEach(() => {
    exitBefore = process.exitCode;
    process.exitCode = undefined;
    writes = [];
    origOut = process.stdout.write;
    origErr = process.stderr.write;
    const cap = ((chunk: unknown): boolean => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stdout.write = cap;
    process.stderr.write = cap;
  });

  afterEach(() => {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    process.exitCode = exitBefore;
    vi.resetModules();
  });

  it('does not parse argv, write output, or set exitCode when the module evaluates', async () => {
    vi.resetModules();
    const mod = await import('../../../src/cli/program.js');
    expect(writes).toEqual([]);
    expect(process.exitCode).toBeUndefined();
    expect(typeof mod.createProgram).toBe('function');
    expect(typeof mod.runProgram).toBe('function');
  });
});

describe('createProgram independence', () => {
  it('returns a fresh, independent Command on each call', async () => {
    const { createProgram } = await import('../../../src/cli/program.js');
    const a = createProgram();
    const b = createProgram();
    expect(a).not.toBe(b);
    expect(a.name()).toBe('prospec');
    expect(b.name()).toBe('prospec');
  });
});
