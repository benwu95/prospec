import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TechStack } from '../types/config.js';

export interface TechStackResult {
  language?: string;
  framework?: string;
  package_manager?: string;
  source?: 'config' | 'auto-detected' | 'mixed';
}

/**
 * Detect the project's tech stack.
 *
 * `.prospec.yaml`'s `tech_stack` is authoritative: when `configTechStack` is
 * provided its fields win, and auto-detection only fills the gaps. This stops a
 * stray root `package.json` (e.g. prospec installed via npm into a Python
 * project) from mislabelling the stack — the root cause of BUG-001.
 *
 * Auto-detection rules (fallback only):
 * - package.json → Node.js; if tsconfig.json exists → TypeScript
 * - requirements.txt or pyproject.toml → Python
 * - Unrecognised → returns empty fields
 */
export function detectTechStack(
  cwd?: string,
  configTechStack?: TechStack,
): TechStackResult {
  const dir = cwd ?? process.cwd();
  const detected = autoDetectTechStack(dir);

  const configLanguage = configTechStack?.language;
  const configFramework = configTechStack?.framework;
  const configPackageManager = configTechStack?.package_manager;
  const hasConfig = Boolean(
    configLanguage || configFramework || configPackageManager,
  );

  if (!hasConfig) {
    return {
      ...detected,
      source: detected.language ? 'auto-detected' : undefined,
    };
  }

  const merged: TechStackResult = {
    language: configLanguage ?? detected.language,
    framework: configFramework ?? detected.framework,
    package_manager: configPackageManager ?? detected.package_manager,
  };

  // 'config' when every populated field came from config; 'mixed' when
  // auto-detection had to fill at least one gap the config left open.
  const filledFromDetection =
    (!configLanguage && detected.language !== undefined) ||
    (!configFramework && detected.framework !== undefined) ||
    (!configPackageManager && detected.package_manager !== undefined);
  merged.source = filledFromDetection ? 'mixed' : 'config';

  return merged;
}

function autoDetectTechStack(dir: string): TechStackResult {
  const result: TechStackResult = {};

  // Node.js / TypeScript detection
  const pkgPath = path.join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    const tsconfigPath = path.join(dir, 'tsconfig.json');
    result.language = existsSync(tsconfigPath) ? 'typescript' : 'javascript';
    result.package_manager = detectNodePackageManager(dir);

    // Framework detection from package.json dependencies
    try {
      const raw = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      result.framework = detectNodeFramework(allDeps);
    } catch {
      // Ignore parse errors
    }

    return result;
  }

  // Python detection
  const requirementsPath = path.join(dir, 'requirements.txt');
  const pyprojectPath = path.join(dir, 'pyproject.toml');
  if (existsSync(requirementsPath) || existsSync(pyprojectPath)) {
    result.language = 'python';
    result.package_manager = existsSync(pyprojectPath) ? 'poetry' : 'pip';
    return result;
  }

  return result;
}

function existsSync(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function detectNodePackageManager(dir: string): string {
  if (existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(dir, 'bun.lockb')) || existsSync(path.join(dir, 'bun.lock'))) return 'bun';
  return 'npm';
}

function detectNodeFramework(
  deps: Record<string, string>,
): string | undefined {
  // Higher-specificity meta-frameworks first: they carry react/vue as direct
  // deps, so without this ordering Gatsby/Remix/etc. mislabel as react/vue
  // (same rationale as next-before-react / nuxt-before-vue).
  const frameworks: [string, string][] = [
    ['next', 'next.js'],
    ['nuxt', 'nuxt'],
    ['gatsby', 'gatsby'],
    ['@remix-run/react', 'remix'],
    ['astro', 'astro'],
    ['@builder.io/qwik', 'qwik'],
    ['solid-js', 'solid'],
    ['@angular/core', 'angular'],
    ['vue', 'vue'],
    ['react', 'react'],
    ['express', 'express'],
    ['fastify', 'fastify'],
    ['koa', 'koa'],
    ['hono', 'hono'],
    ['svelte', 'svelte'],
  ];

  for (const [pkg, name] of frameworks) {
    if (pkg in deps) return name;
  }

  return undefined;
}
