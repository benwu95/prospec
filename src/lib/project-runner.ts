import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProspecConfig } from '../types/config.js';

/**
 * Check if a file exists synchronously.
 */
function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Check if package.json in cwd declares a non-empty test script.
 */
export function hasPackageJsonTestScript(cwd: string): boolean {
  try {
    const raw = fs.readFileSync(path.resolve(cwd, 'package.json'), 'utf-8');
    const pkg: unknown = JSON.parse(raw);
    if (typeof pkg !== 'object' || pkg === null) return false;
    const scripts = (pkg as { scripts?: unknown }).scripts;
    if (typeof scripts !== 'object' || scripts === null) return false;
    const test = (scripts as { test?: unknown }).test;
    return typeof test === 'string' && test.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a Makefile contains a test target.
 */
function hasMakefileTestTarget(cwd: string): boolean {
  for (const filename of ['Makefile', 'makefile']) {
    const makefilePath = path.resolve(cwd, filename);
    if (fileExists(makefilePath)) {
      try {
        const content = fs.readFileSync(makefilePath, 'utf-8');
        if (/^test\s*:/m.test(content)) return true;
      } catch {
        // ignore read error
      }
    }
  }
  return false;
}

/**
 * Dynamically detect standard test commands across various programming ecosystems.
 */
export function detectTestCommand(cwd: string): string | null {
  // 1. Rust ecosystem
  if (fileExists(path.resolve(cwd, 'Cargo.toml'))) {
    return 'cargo test';
  }

  // 2. Python ecosystem
  if (fileExists(path.resolve(cwd, 'poetry.lock'))) {
    return 'poetry run pytest';
  }
  if (fileExists(path.resolve(cwd, 'pdm.lock'))) {
    return 'pdm run pytest';
  }
  if (fileExists(path.resolve(cwd, 'uv.lock'))) {
    return 'uv run pytest';
  }
  if (
    fileExists(path.resolve(cwd, 'pytest.ini')) ||
    fileExists(path.resolve(cwd, 'pyproject.toml')) ||
    fileExists(path.resolve(cwd, 'setup.py')) ||
    fileExists(path.resolve(cwd, 'requirements.txt'))
  ) {
    return 'pytest';
  }

  // 3. Go ecosystem
  if (fileExists(path.resolve(cwd, 'go.mod'))) {
    return 'go test ./...';
  }

  // 4. Node.js / JavaScript / TypeScript ecosystem
  if (hasPackageJsonTestScript(cwd)) {
    if (fileExists(path.resolve(cwd, 'pnpm-lock.yaml'))) return 'pnpm test';
    if (fileExists(path.resolve(cwd, 'yarn.lock'))) return 'yarn test';
    if (fileExists(path.resolve(cwd, 'bun.lockb')) || fileExists(path.resolve(cwd, 'bun.lock'))) return 'bun test';
    return 'npm test';
  }

  // 5. Generic Makefile
  if (hasMakefileTestTarget(cwd)) {
    return 'make test';
  }

  return null;
}

/**
 * Canonical test command resolution for projects:
 * 1. Declared `tech_stack.test_command` in .prospec.yaml takes highest precedence.
 * 2. Package manager fallback if `package.json` test script is present.
 * 3. Dynamic multi-language detection across ecosystem manifests.
 */
export function resolveProjectTestCommand(config: ProspecConfig, cwd: string): string | null {
  const declared = config.tech_stack?.test_command?.trim();
  if (declared !== undefined && declared.length > 0) return declared;

  const pm = config.tech_stack?.package_manager?.trim();
  if (pm !== undefined && pm.length > 0 && hasPackageJsonTestScript(cwd)) {
    return `${pm} test`;
  }

  return detectTestCommand(cwd);
}
