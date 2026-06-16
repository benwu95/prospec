import { parse as parseToml } from 'smol-toml';
import { XMLParser } from 'fast-xml-parser';

export interface ManifestDependency {
  name: string;
  version?: string;
}

/**
 * Deterministic, LLM-free parsers for backend-ecosystem manifest files.
 *
 * Each function takes raw file CONTENT (the caller reads the file) and returns
 * extracted data, swallowing malformed input by returning an empty result —
 * raw-scan must never throw on a broken manifest. Keeping these as pure
 * content→data functions also makes them trivially testable without fs.
 */

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

/**
 * Extract a package name (and optional version spec) from a PEP 508 / pip
 * requirement string: `flask[async]>=2,<3 ; python_version<'3.8'` → flask.
 */
function parsePep508(spec: string): ManifestDependency | undefined {
  const withoutMarker = spec.split(';')[0]!.trim();
  if (!withoutMarker) return undefined;

  // `name @ url` direct reference — keep the name, drop the URL.
  const atRef = withoutMarker.split(/\s+@\s+/)[0]!.trim();
  const match = atRef.match(/^([A-Za-z0-9._-]+)\s*(?:\[[^\]]*\])?\s*(.*)$/);
  if (!match) return undefined;
  const name = match[1]!;
  const version = match[2]!.trim();
  return version ? { name, version } : { name };
}

/** Coerce a TOML dependency value (string version or `{ version = ... }`). */
function depFromTomlValue(
  name: string,
  value: unknown,
): ManifestDependency {
  if (typeof value === 'string') return { name, version: value };
  const table = asRecord(value);
  const version = table && typeof table.version === 'string' ? table.version : undefined;
  return version ? { name, version } : { name };
}

function depsFromTomlTable(table: unknown): ManifestDependency[] {
  const record = asRecord(table);
  if (!record) return [];
  return Object.entries(record).map(([name, value]) =>
    depFromTomlValue(name, value),
  );
}

/**
 * pyproject.toml — PEP 621 `[project.dependencies]` (+ optional-dependencies)
 * and Poetry `[tool.poetry.dependencies]` (+ group dependencies). The Poetry
 * implicit `python` constraint is dropped (it is a runtime bound, not a dep).
 */
export function parsePyprojectDependencies(
  content: string,
): ManifestDependency[] {
  try {
    const root = asRecord(parseToml(content));
    if (!root) return [];
    const deps: ManifestDependency[] = [];

    const project = asRecord(root.project);
    if (project) {
      for (const entry of asArray(project.dependencies)) {
        if (typeof entry === 'string') {
          const dep = parsePep508(entry);
          if (dep) deps.push(dep);
        }
      }
      const optional = asRecord(project['optional-dependencies']);
      if (optional) {
        for (const group of Object.values(optional)) {
          for (const entry of asArray(group)) {
            if (typeof entry === 'string') {
              const dep = parsePep508(entry);
              if (dep) deps.push(dep);
            }
          }
        }
      }
    }

    const poetry = asRecord(asRecord(root.tool)?.poetry);
    if (poetry) {
      for (const dep of depsFromTomlTable(poetry.dependencies)) {
        if (dep.name !== 'python') deps.push(dep);
      }
      const groups = asRecord(poetry.group);
      if (groups) {
        for (const group of Object.values(groups)) {
          for (const dep of depsFromTomlTable(asRecord(group)?.dependencies)) {
            if (dep.name !== 'python') deps.push(dep);
          }
        }
      }
    }

    // De-duplicate by name (keep first) — a hybrid PEP 621 + Poetry layout can
    // declare the same package in both tables.
    const seen = new Set<string>();
    return deps.filter((dep) => {
      if (seen.has(dep.name)) return false;
      seen.add(dep.name);
      return true;
    });
  } catch {
    return [];
  }
}

/** Cargo.toml — `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`. */
export function parseCargoDependencies(content: string): ManifestDependency[] {
  try {
    const root = asRecord(parseToml(content));
    if (!root) return [];
    return [
      ...depsFromTomlTable(root.dependencies),
      ...depsFromTomlTable(root['dev-dependencies']),
      ...depsFromTomlTable(root['build-dependencies']),
    ];
  } catch {
    return [];
  }
}

/**
 * go.mod — `require` directives (single-line and block form). `replace`,
 * `exclude`, and `retract` directives (and their blocks) are skipped so they
 * are not mistaken for dependencies.
 */
export function parseGoModDependencies(content: string): ManifestDependency[] {
  const deps: ManifestDependency[] = [];
  let inRequireBlock = false;
  let inSkippedBlock = false;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line) continue;

    if (inRequireBlock || inSkippedBlock) {
      if (line === ')') {
        inRequireBlock = false;
        inSkippedBlock = false;
        continue;
      }
      if (inRequireBlock) {
        const parts = line.split(/\s+/);
        if (parts[0]) deps.push({ name: parts[0], version: parts[1] });
      }
      continue;
    }

    if (/^require\s*\($/.test(line)) {
      inRequireBlock = true;
      continue;
    }
    if (/^(replace|exclude|retract)\s*\($/.test(line)) {
      inSkippedBlock = true;
      continue;
    }
    const single = line.match(/^require\s+(\S+)\s+(\S+)/);
    if (single) deps.push({ name: single[1]!, version: single[2]! });
  }

  return deps;
}

/**
 * requirements.txt — line scanner that tolerates pip's real-world syntax:
 * skips option lines (`-r`/`-c`/`-e`/`--hash`/`--index-url`), VCS/URL refs,
 * full-line and inline (` #`) comments, joins backslash continuations, and
 * strips environment markers and extras before extracting name + version.
 */
export function parseRequirementsTxt(content: string): ManifestDependency[] {
  const deps: ManifestDependency[] = [];

  // Join backslash line continuations first.
  const joined = content.replace(/\\\r?\n/g, ' ');
  for (const rawLine of joined.split('\n')) {
    // Strip inline comments (pip requires whitespace before the `#`).
    const line = rawLine.replace(/\s+#.*$/, '').replace(/^#.*$/, '').trim();
    if (!line) continue;
    if (line.startsWith('-')) continue; // -r, -c, -e, --hash, --index-url, ...
    if (/^[a-z+]+:\/\//i.test(line) || line.startsWith('git+')) continue; // URL/VCS
    const dep = parsePep508(line);
    if (dep) deps.push(dep);
  }

  return deps;
}

/** composer.json — `require` + `require-dev`, excluding platform packages. */
export function parseComposerDependencies(
  content: string,
): ManifestDependency[] {
  try {
    const root = asRecord(JSON.parse(content));
    if (!root) return [];
    const deps: ManifestDependency[] = [];
    for (const key of ['require', 'require-dev']) {
      const table = asRecord(root[key]);
      if (!table) continue;
      for (const [name, version] of Object.entries(table)) {
        if (name === 'php' || name.startsWith('ext-') || name.startsWith('lib-')) {
          continue; // platform constraints, not packages
        }
        deps.push(
          typeof version === 'string' ? { name, version } : { name },
        );
      }
    }
    return deps;
  } catch {
    return [];
  }
}

function xmlParser(): XMLParser {
  // processEntities:false — manifest files are untrusted input; disabling
  // DTD/entity processing keeps parsing deterministic and immune to any
  // entity expansion, independent of the library's default.
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false,
  });
}

/** Maven pom.xml — direct `project.dependencies.dependency[]`. */
export function parseMavenDependencies(content: string): ManifestDependency[] {
  try {
    const root = asRecord(xmlParser().parse(content));
    const project = asRecord(root?.project);
    const dependencies = asRecord(project?.dependencies);
    const deps: ManifestDependency[] = [];
    for (const entry of asArray(dependencies?.dependency)) {
      const dep = asRecord(entry);
      if (!dep) continue;
      const groupId = typeof dep.groupId === 'string' ? dep.groupId : undefined;
      const artifactId =
        typeof dep.artifactId === 'string' ? dep.artifactId : undefined;
      if (!artifactId) continue;
      const name = groupId ? `${groupId}:${artifactId}` : artifactId;
      const version =
        typeof dep.version === 'string' || typeof dep.version === 'number'
          ? String(dep.version)
          : undefined;
      deps.push(version ? { name, version } : { name });
    }
    return deps;
  } catch {
    return [];
  }
}

/** .NET .csproj — `PackageReference` items (Include + Version attr or child). */
export function parseCsprojDependencies(content: string): ManifestDependency[] {
  try {
    const root = asRecord(xmlParser().parse(content));
    const project = asRecord(root?.Project);
    const deps: ManifestDependency[] = [];
    for (const groupEntry of asArray(project?.ItemGroup)) {
      const group = asRecord(groupEntry);
      if (!group) continue;
      for (const refEntry of asArray(group.PackageReference)) {
        const ref = asRecord(refEntry);
        const name = ref && typeof ref['@_Include'] === 'string' ? ref['@_Include'] : undefined;
        if (!name) continue;
        const attrVersion = ref && (ref['@_Version'] ?? ref.Version);
        const version =
          typeof attrVersion === 'string' || typeof attrVersion === 'number'
            ? String(attrVersion)
            : undefined;
        deps.push(version ? { name, version } : { name });
      }
    }
    return deps;
  } catch {
    return [];
  }
}

/** pyproject.toml — script entry-point targets (PEP 621 + Poetry). */
export function parsePyprojectEntryPoints(content: string): string[] {
  try {
    const root = asRecord(parseToml(content));
    if (!root) return [];
    const targets: string[] = [];
    const scriptTables = [
      asRecord(asRecord(root.project)?.scripts),
      asRecord(asRecord(asRecord(root.tool)?.poetry)?.scripts),
    ];
    for (const table of scriptTables) {
      if (!table) continue;
      for (const value of Object.values(table)) {
        if (typeof value === 'string') targets.push(value);
      }
    }
    return targets;
  } catch {
    return [];
  }
}

/** Cargo.toml — `[[bin]]` targets (path when present, else name). */
export function parseCargoEntryPoints(content: string): string[] {
  try {
    const root = asRecord(parseToml(content));
    const targets: string[] = [];
    for (const entry of asArray(root?.bin)) {
      const bin = asRecord(entry);
      if (!bin) continue;
      if (typeof bin.path === 'string') targets.push(bin.path);
      else if (typeof bin.name === 'string') targets.push(bin.name);
    }
    return targets;
  } catch {
    return [];
  }
}

/** .NET .csproj — whether the project builds an executable (`OutputType=Exe`). */
export function csprojIsExecutable(content: string): boolean {
  try {
    const root = asRecord(xmlParser().parse(content));
    const project = asRecord(root?.Project);
    for (const groupEntry of asArray(project?.PropertyGroup)) {
      const group = asRecord(groupEntry);
      const outputType = group?.OutputType;
      if (typeof outputType === 'string' && outputType.toLowerCase() === 'exe') {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * vcpkg.json — manifest-mode `dependencies`: string names, or objects
 * `{ name, "version>=" }`. (CMake itself is imperative and not parsed.)
 */
export function parseVcpkgDependencies(content: string): ManifestDependency[] {
  try {
    const root = asRecord(JSON.parse(content));
    const deps: ManifestDependency[] = [];
    for (const entry of asArray(root?.dependencies)) {
      if (typeof entry === 'string') {
        deps.push({ name: entry });
        continue;
      }
      const obj = asRecord(entry);
      if (!obj || typeof obj.name !== 'string') continue;
      const name = obj.name;
      const raw = obj['version>='] ?? obj.version;
      const version =
        typeof raw === 'string' || typeof raw === 'number' ? String(raw) : undefined;
      deps.push(version ? { name, version } : { name });
    }
    return deps;
  } catch {
    return [];
  }
}

/**
 * conanfile.txt — packages under the `[requires]` section (`name/version`).
 * The imperative conanfile.py form is not parsed.
 */
export function parseConanfileTxtDependencies(
  content: string,
): ManifestDependency[] {
  const deps: ManifestDependency[] = [];
  let inRequires = false;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    if (line.startsWith('[')) {
      inRequires = line === '[requires]';
      continue;
    }
    if (!inRequires) continue;
    const slash = line.indexOf('/');
    if (slash === -1) {
      deps.push({ name: line });
    } else {
      const name = line.slice(0, slash);
      const version = line.slice(slash + 1) || undefined;
      deps.push(version ? { name, version } : { name });
    }
  }

  return deps;
}
