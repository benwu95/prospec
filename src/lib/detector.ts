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
 * Auto-detection rules (fallback only), in precedence order:
 * - package.json → Node.js; if tsconfig.json exists → TypeScript
 * - requirements.txt or pyproject.toml → Python
 * - go.mod → Go; Cargo.toml → Rust; pom.xml → Java/Maven;
 *   build.gradle(.kts) → Java/Gradle; *.csproj → C#; Gemfile → Ruby;
 *   composer.json → PHP (language + package manager only, no framework)
 * - Unrecognised → returns empty fields
 *
 * When `files` (a scanned relative-path list) is given, pom.xml and *.csproj
 * are matched tree-wide instead of root-only, so a manifest in a subdirectory
 * still identifies the language.
 */
export function detectTechStack(
  cwd?: string,
  configTechStack?: TechStack,
  files?: string[],
): TechStackResult {
  const dir = cwd ?? process.cwd();
  const detected = autoDetectTechStack(dir, files);

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

function autoDetectTechStack(dir: string, files?: string[]): TechStackResult {
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

  // Backend language detection by manifest presence (language + package manager
  // only; framework detection stays Node-specific). Ordered so the primary
  // build manifest wins on a polyglot tree.
  if (existsSync(path.join(dir, 'go.mod'))) {
    return { language: 'go', package_manager: 'go modules' };
  }
  if (existsSync(path.join(dir, 'Cargo.toml'))) {
    return { language: 'rust', package_manager: 'cargo' };
  }
  // pom.xml / *.csproj are matched tree-wide when the scanned file list is
  // available (so a manifest in a subdirectory still identifies the language),
  // falling back to a root-only lookup otherwise. This keeps language detection
  // consistent with the tree-wide dependency/entry-point collection in
  // raw-scan.service.
  const hasPom = files
    ? files.some((f) => path.basename(f) === 'pom.xml')
    : existsSync(path.join(dir, 'pom.xml'));
  if (hasPom) {
    return { language: 'java', package_manager: 'maven' };
  }
  if (
    existsSync(path.join(dir, 'build.gradle')) ||
    existsSync(path.join(dir, 'build.gradle.kts'))
  ) {
    return { language: 'java', package_manager: 'gradle' };
  }
  const hasCsproj = files
    ? files.some((f) => f.endsWith('.csproj'))
    : hasFileWithExtension(dir, '.csproj');
  if (hasCsproj) {
    return { language: 'c#', package_manager: 'nuget' };
  }
  if (existsSync(path.join(dir, 'Gemfile'))) {
    return { language: 'ruby', package_manager: 'bundler' };
  }
  if (existsSync(path.join(dir, 'composer.json'))) {
    return { language: 'php', package_manager: 'composer' };
  }
  // Swift ranked before C/C++ so a Swift project with a co-present vcpkg.json
  // resolves to swift (matching collectDependencies' Swift short-circuit).
  const hasSwift = files
    ? files.some((f) => path.basename(f) === 'Package.swift')
    : existsSync(path.join(dir, 'Package.swift'));
  if (hasSwift) {
    return { language: 'swift', package_manager: 'spm' };
  }
  // C/C++ — the C-vs-C++ split reads source extensions, so it needs the scanned
  // file list; gated on a C/C++-specific build file (a bare Makefile is too
  // generic to imply C/C++).
  if (files) {
    const cFamily = detectCFamily(files);
    if (cFamily) return cFamily;
  }

  return result;
}

const C_FAMILY_BUILD_FILES = new Set([
  'CMakeLists.txt',
  'conanfile.txt',
  'conanfile.py',
  'vcpkg.json',
  'meson.build',
]);
const CPP_SOURCE_EXT = /\.(cpp|cc|cxx|c\+\+|hpp|hh|hxx)$/i;
const C_SOURCE_EXT = /\.(c|h)$/i;

/**
 * Whether the scanned files contain any C or C++ source/header. Shared so the
 * C-family dependency collection in raw-scan.service gates on the same evidence
 * detectCFamily uses — keeping the Tech Stack and Dependencies sections aligned.
 */
export function hasCFamilySource(files: string[]): boolean {
  return files.some((f) => CPP_SOURCE_EXT.test(f) || C_SOURCE_EXT.test(f));
}

function detectCFamily(files: string[]): TechStackResult | undefined {
  const hasBuildFile = files.some(
    (f) => C_FAMILY_BUILD_FILES.has(path.basename(f)) || f.endsWith('.cmake'),
  );
  if (!hasBuildFile) return undefined;
  const hasCpp = files.some((f) => CPP_SOURCE_EXT.test(f));
  const hasC = files.some((f) => C_SOURCE_EXT.test(f));
  const language = hasCpp ? 'c++' : hasC ? 'c' : undefined;
  if (!language) return undefined;
  return { language, package_manager: cFamilyPackageManager(files) };
}

function cFamilyPackageManager(files: string[]): string {
  const has = (name: string): boolean =>
    files.some((f) => path.basename(f) === name);
  if (has('vcpkg.json')) return 'vcpkg';
  if (has('conanfile.txt') || has('conanfile.py')) return 'conan';
  if (has('meson.build')) return 'meson';
  return 'cmake';
}

function hasFileWithExtension(dir: string, ext: string): boolean {
  try {
    return fs.readdirSync(dir).some((entry) => String(entry).endsWith(ext));
  } catch {
    return false;
  }
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
