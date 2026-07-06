/**
 * Guard: the type-check config must cover `tests/`.
 *
 * If `tests/` is dropped from the type-check program (removed from `include`, or
 * re-added to `exclude`), a type-only import break in a test file silently escapes
 * `pnpm typecheck` — esbuild strips it at runtime so `pnpm test` stays green and
 * lint says nothing (PB-008). This contract pins the coverage so that regression
 * turns red here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface TypecheckConfig {
  compilerOptions?: Record<string, unknown>;
  include?: string[];
  exclude?: string[];
}

const readJson = <T>(rel: string): T =>
  JSON.parse(readFileSync(path.resolve(process.cwd(), rel), 'utf-8')) as T;

describe('typecheck config covers tests (PB-008 gate)', () => {
  const cfg = readJson<TypecheckConfig>('tsconfig.typecheck.json');

  it('includes tests/ and src/ in the type-check program', () => {
    const include = cfg.include ?? [];
    expect(include.some((p) => p.startsWith('tests/'))).toBe(true);
    expect(include.some((p) => p.startsWith('src/'))).toBe(true);
  });

  it('does not exclude tests/ (which would silently re-drop them)', () => {
    const exclude = cfg.exclude ?? [];
    expect(exclude.some((p) => p === 'tests' || p.startsWith('tests/'))).toBe(false);
  });

  it('is noEmit with rootDir "." so tests type-check without TS6059 or emit', () => {
    expect(cfg.compilerOptions?.noEmit).toBe(true);
    expect(cfg.compilerOptions?.rootDir).toBe('.');
  });

  it('the `typecheck` npm script runs this config', () => {
    const pkg = readJson<{ scripts?: Record<string, string> }>('package.json');
    expect(pkg.scripts?.typecheck ?? '').toContain('tsconfig.typecheck.json');
  });
});
