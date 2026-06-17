import { describe, it, expect } from 'vitest';
import {
  parsePyprojectDependencies,
  parseCargoDependencies,
  parseGoModDependencies,
  parseRequirementsTxt,
  parseComposerDependencies,
  parseMavenDependencies,
  parseCsprojDependencies,
  parseVcpkgDependencies,
  parseConanfileTxtDependencies,
  parsePyprojectEntryPoints,
  parseCargoEntryPoints,
  csprojIsExecutable,
} from '../../../src/lib/manifest-parsers.js';

describe('parsePyprojectDependencies', () => {
  it('extracts PEP 621 [project.dependencies] with extras and markers', () => {
    const toml = [
      '[project]',
      'name = "demo"',
      'dependencies = [',
      '  "requests>=2.0,<3.0",',
      '  "flask[async]>=2",',
      '  "pkg @ git+https://example.com/pkg.git",',
      '  "rich; python_version<\'3.9\'",',
      ']',
    ].join('\n');
    const deps = parsePyprojectDependencies(toml);
    expect(deps).toEqual([
      { name: 'requests', version: '>=2.0,<3.0' },
      { name: 'flask', version: '>=2' },
      { name: 'pkg' },
      { name: 'rich' },
    ]);
  });

  it('extracts Poetry dependencies and drops the python constraint', () => {
    const toml = [
      '[tool.poetry.dependencies]',
      'python = "^3.11"',
      'requests = "^2.31"',
      'pydantic = { version = "^2.5", extras = ["email"] }',
      '',
      '[tool.poetry.group.dev.dependencies]',
      'pytest = "^8.0"',
    ].join('\n');
    const deps = parsePyprojectDependencies(toml);
    expect(deps).toEqual([
      { name: 'requests', version: '^2.31' },
      { name: 'pydantic', version: '^2.5' },
      { name: 'pytest', version: '^8.0' },
    ]);
  });

  it('flattens PEP 621 optional-dependencies', () => {
    const toml = [
      '[project]',
      'name = "demo"',
      'dependencies = ["click"]',
      '[project.optional-dependencies]',
      'test = ["pytest>=8"]',
    ].join('\n');
    expect(parsePyprojectDependencies(toml)).toEqual([
      { name: 'click' },
      { name: 'pytest', version: '>=8' },
    ]);
  });

  it('returns [] on malformed TOML', () => {
    expect(parsePyprojectDependencies('this is = = not toml')).toEqual([]);
  });
});

describe('parseCargoDependencies', () => {
  it('extracts dependencies, dev- and build- tables, string and table forms', () => {
    const toml = [
      '[dependencies]',
      'serde = "1.0"',
      'tokio = { version = "1", features = ["full"] }',
      '[dev-dependencies]',
      'criterion = "0.5"',
      '[build-dependencies]',
      'cc = "1.0"',
    ].join('\n');
    expect(parseCargoDependencies(toml)).toEqual([
      { name: 'serde', version: '1.0' },
      { name: 'tokio', version: '1' },
      { name: 'criterion', version: '0.5' },
      { name: 'cc', version: '1.0' },
    ]);
  });
});

describe('parseGoModDependencies', () => {
  it('parses block and single-line require, skipping replace/exclude/retract', () => {
    const gomod = [
      'module example.com/app',
      'go 1.22',
      'require (',
      '\tgithub.com/gin-gonic/gin v1.9.1',
      '\tgithub.com/spf13/cobra v1.8.0 // indirect',
      ')',
      'require github.com/stretchr/testify v1.8.4',
      'replace (',
      '\tgithub.com/old/pkg => github.com/new/pkg v1.0.0',
      ')',
      'exclude golang.org/x/text v0.3.0',
      'retract v1.0.1',
    ].join('\n');
    expect(parseGoModDependencies(gomod)).toEqual([
      { name: 'github.com/gin-gonic/gin', version: 'v1.9.1' },
      { name: 'github.com/spf13/cobra', version: 'v1.8.0' },
      { name: 'github.com/stretchr/testify', version: 'v1.8.4' },
    ]);
  });
});

describe('parseRequirementsTxt', () => {
  it('keeps the package name from a `name @ url` direct reference, dropping the url', () => {
    // PEP 508 direct reference: split on ` @ ` and retain only the name, so no
    // version key is emitted (the url is not a version specifier).
    expect(
      parseRequirementsTxt('mypkg @ https://example.com/mypkg.whl'),
    ).toEqual([{ name: 'mypkg' }]);
  });

  it('handles options, comments, continuations, markers, extras, URLs', () => {
    const req = [
      '# top comment',
      '-r base.txt',
      '--index-url https://pypi.org/simple',
      'flask==2.3.0  # inline comment',
      'requests>=2.0 \\',
      '  ; python_version >= "3.8"',
      'celery[redis]>=5',
      'git+https://github.com/x/y.git#egg=y',
      '-e .',
      'django',
    ].join('\n');
    expect(parseRequirementsTxt(req)).toEqual([
      { name: 'flask', version: '==2.3.0' },
      { name: 'requests', version: '>=2.0' },
      { name: 'celery', version: '>=5' },
      { name: 'django' },
    ]);
  });
});

describe('parseComposerDependencies', () => {
  it('extracts require/require-dev and skips platform packages', () => {
    const json = JSON.stringify({
      require: { php: '>=8.1', 'ext-json': '*', 'laravel/framework': '^11.0' },
      'require-dev': { 'phpunit/phpunit': '^11.0' },
    });
    expect(parseComposerDependencies(json)).toEqual([
      { name: 'laravel/framework', version: '^11.0' },
      { name: 'phpunit/phpunit', version: '^11.0' },
    ]);
  });

  it('returns [] on malformed JSON', () => {
    expect(parseComposerDependencies('{not json')).toEqual([]);
  });
});

describe('parseMavenDependencies', () => {
  it('extracts groupId:artifactId with version, single and multiple', () => {
    const pom = [
      '<project>',
      '  <dependencies>',
      '    <dependency>',
      '      <groupId>org.springframework.boot</groupId>',
      '      <artifactId>spring-boot-starter</artifactId>',
      '      <version>3.2.0</version>',
      '    </dependency>',
      '    <dependency>',
      '      <groupId>com.google.guava</groupId>',
      '      <artifactId>guava</artifactId>',
      '    </dependency>',
      '  </dependencies>',
      '</project>',
    ].join('\n');
    expect(parseMavenDependencies(pom)).toEqual([
      { name: 'org.springframework.boot:spring-boot-starter', version: '3.2.0' },
      { name: 'com.google.guava:guava' },
    ]);
  });
});

describe('parseCsprojDependencies', () => {
  it('extracts PackageReference Include + Version across ItemGroups', () => {
    const csproj = [
      '<Project Sdk="Microsoft.NET.Sdk">',
      '  <ItemGroup>',
      '    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />',
      '  </ItemGroup>',
      '  <ItemGroup>',
      '    <PackageReference Include="Serilog" Version="3.1.1" />',
      '  </ItemGroup>',
      '</Project>',
    ].join('\n');
    expect(parseCsprojDependencies(csproj)).toEqual([
      { name: 'Newtonsoft.Json', version: '13.0.3' },
      { name: 'Serilog', version: '3.1.1' },
    ]);
  });
});

describe('entry-point parsers', () => {
  it('parsePyprojectEntryPoints returns script targets (PEP 621 + Poetry)', () => {
    const toml = [
      '[project.scripts]',
      'demo = "demo.cli:main"',
      '[tool.poetry.scripts]',
      'legacy = "demo.legacy:run"',
    ].join('\n');
    expect(parsePyprojectEntryPoints(toml)).toEqual([
      'demo.cli:main',
      'demo.legacy:run',
    ]);
  });

  it('parseCargoEntryPoints prefers bin path, falls back to name', () => {
    const toml = [
      '[[bin]]',
      'name = "server"',
      'path = "src/bin/server.rs"',
      '[[bin]]',
      'name = "cli"',
    ].join('\n');
    expect(parseCargoEntryPoints(toml)).toEqual(['src/bin/server.rs', 'cli']);
  });

  it('csprojIsExecutable detects OutputType Exe', () => {
    const exe = '<Project><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>';
    const lib = '<Project><PropertyGroup><OutputType>Library</OutputType></PropertyGroup></Project>';
    expect(csprojIsExecutable(exe)).toBe(true);
    expect(csprojIsExecutable(lib)).toBe(false);
  });
});

describe('review-fix regressions', () => {
  it('de-duplicates a package declared in both PEP 621 and Poetry tables', () => {
    const toml = [
      '[project]',
      'name = "x"',
      'dependencies = ["requests>=2"]',
      '[tool.poetry.dependencies]',
      'python = "^3.11"',
      'requests = "^2.31"',
    ].join('\n');
    expect(parsePyprojectDependencies(toml)).toEqual([
      { name: 'requests', version: '>=2' },
    ]);
  });

  it('tolerates non-gofmt require-block spacing', () => {
    expect(
      parseGoModDependencies('module x\nrequire  (\n\tfoo.com/bar v1.2.3\n)\n'),
    ).toEqual([{ name: 'foo.com/bar', version: 'v1.2.3' }]);
  });

  it('strips a trailing // comment from a single-line require directive', () => {
    expect(
      parseGoModDependencies('require foo.com/bar v1.0.0 // indirect'),
    ).toEqual([{ name: 'foo.com/bar', version: 'v1.0.0' }]);
  });

  it('resets inSkippedBlock so a require after an exclude block still parses', () => {
    const gomod = [
      'require (',
      '\ta.com/x v1',
      ')',
      'exclude (',
      '\tb.com/y v2',
      ')',
      'require c.com/z v3',
    ].join('\n');
    // b.com/y is inside the exclude block and must be dropped; both requires parse.
    expect(parseGoModDependencies(gomod)).toEqual([
      { name: 'a.com/x', version: 'v1' },
      { name: 'c.com/z', version: 'v3' },
    ]);
  });

  it('does not expand XML/DTD entities (processEntities disabled)', () => {
    const pom =
      '<!DOCTYPE project [<!ENTITY inj "PWNED">]><project><dependencies><dependency><groupId>g</groupId><artifactId>&inj;</artifactId><version>1</version></dependency></dependencies></project>';
    // The dependency is still extracted, but the &inj; entity is kept literal
    // (not expanded to PWNED), proving processEntities:false is in effect.
    expect(parseMavenDependencies(pom)).toEqual([
      { name: 'g:&inj;', version: '1' },
    ]);
  });
});

describe('parseVcpkgDependencies', () => {
  it('extracts string and object dependency entries', () => {
    const json = JSON.stringify({
      dependencies: ['fmt', { name: 'boost', 'version>=': '1.80' }, { name: 'zlib' }],
    });
    expect(parseVcpkgDependencies(json)).toEqual([
      { name: 'fmt' },
      { name: 'boost', version: '1.80' },
      { name: 'zlib' },
    ]);
  });

  it('returns [] on malformed JSON or missing dependencies', () => {
    expect(parseVcpkgDependencies('{not json')).toEqual([]);
    expect(parseVcpkgDependencies('{}')).toEqual([]);
  });
});

describe('parseConanfileTxtDependencies', () => {
  it('extracts the [requires] section only, ignoring others and comments', () => {
    const conan = [
      '[requires]',
      'zlib/1.2.13',
      'fmt/[>=9.0]   # pinned range',
      'header-only',
      '',
      '[generators]',
      'CMakeDeps',
    ].join('\n');
    expect(parseConanfileTxtDependencies(conan)).toEqual([
      { name: 'zlib', version: '1.2.13' },
      { name: 'fmt', version: '[>=9.0]' },
      { name: 'header-only' },
    ]);
  });

  it('strips an inline # comment with no preceding whitespace', () => {
    // conanfile.txt uses #.*$ (whitespace not required before #), unlike
    // requirements.txt — so `zlib/1.2#c` yields version 1.2, not 1.2#c.
    expect(parseConanfileTxtDependencies('[requires]\nzlib/1.2#c')).toEqual([
      { name: 'zlib', version: '1.2' },
    ]);
  });

  it('treats a trailing-slash entry as name-only (empty version segment)', () => {
    // `pkg/` has a slash but nothing after it: slice(slash+1) is '' which
    // coerces to undefined, so no version key is emitted.
    expect(parseConanfileTxtDependencies('[requires]\npkg/')).toEqual([
      { name: 'pkg' },
    ]);
  });

  it('ignores lines before any [requires] section header', () => {
    const conan = ['stray/1.0', '[generators]', 'CMakeDeps'].join('\n');
    expect(parseConanfileTxtDependencies(conan)).toEqual([]);
  });
});

describe('parsePep508 edge cases (via parseRequirementsTxt)', () => {
  it('drops a line that is only an environment marker (empty before `;`)', () => {
    // `;` strips to an empty requirement → parsePep508 returns undefined.
    expect(parseRequirementsTxt('; python_version<"3.8"')).toEqual([]);
  });

  it('drops a line whose name fails the PEP 508 name grammar', () => {
    // Leading `=` is outside [A-Za-z0-9._-], so the name regex does not match.
    expect(parseRequirementsTxt('=== bad')).toEqual([]);
  });
});

describe('parsePyprojectDependencies — non-string and unparsable entries', () => {
  it('skips non-string entries in PEP 621 dependencies', () => {
    const toml = '[project]\ndependencies = [123, "real>=1"]';
    expect(parsePyprojectDependencies(toml)).toEqual([
      { name: 'real', version: '>=1' },
    ]);
  });

  it('skips a PEP 621 dependency string that fails PEP 508 parsing', () => {
    const toml = '[project]\ndependencies = ["===", "good"]';
    expect(parsePyprojectDependencies(toml)).toEqual([{ name: 'good' }]);
  });

  it('skips non-string entries inside an optional-dependencies group', () => {
    const toml = [
      '[project]',
      '[project.optional-dependencies]',
      'g = [123, "real"]',
    ].join('\n');
    expect(parsePyprojectDependencies(toml)).toEqual([{ name: 'real' }]);
  });

  it('skips an optional-dependency string that fails PEP 508 parsing', () => {
    const toml = [
      '[project]',
      '[project.optional-dependencies]',
      'g = ["==="]',
    ].join('\n');
    expect(parsePyprojectDependencies(toml)).toEqual([]);
  });

  it('drops the python constraint inside a Poetry group table', () => {
    const toml = [
      '[tool.poetry.group.dev.dependencies]',
      'python = "^3.11"',
      'pytest = "^8"',
    ].join('\n');
    expect(parsePyprojectDependencies(toml)).toEqual([
      { name: 'pytest', version: '^8' },
    ]);
  });

  it('emits name-only for a Poetry table dependency without a version field', () => {
    const toml = '[tool.poetry.dependencies]\npydantic = { extras = ["email"] }';
    expect(parsePyprojectDependencies(toml)).toEqual([{ name: 'pydantic' }]);
  });

  it('returns [] on malformed TOML (catch path)', () => {
    expect(parsePyprojectDependencies('a = = b')).toEqual([]);
  });
});

describe('depFromTomlValue branches (via parseCargoDependencies)', () => {
  it('emits name-only when a table dependency has no string version', () => {
    const toml = '[dependencies]\nserde = { features = ["derive"] }';
    expect(parseCargoDependencies(toml)).toEqual([{ name: 'serde' }]);
  });

  it('emits name-only when the value is neither string nor table', () => {
    const toml = '[dependencies]\nfoo = 123';
    expect(parseCargoDependencies(toml)).toEqual([{ name: 'foo' }]);
  });

  it('returns [] on malformed TOML (catch path)', () => {
    expect(parseCargoDependencies('a = = b')).toEqual([]);
  });
});

describe('parseComposerDependencies — non-object root and non-string version', () => {
  it('returns [] when the JSON root is not an object', () => {
    expect(parseComposerDependencies('[]')).toEqual([]);
  });

  it('emits name-only when a require version is not a string', () => {
    const json = JSON.stringify({ require: { 'a/b': 123 } });
    expect(parseComposerDependencies(json)).toEqual([{ name: 'a/b' }]);
  });
});

describe('parseMavenDependencies — edge entries and malformed XML', () => {
  it('skips a dependency entry that is not an element record', () => {
    const pom =
      '<project><dependencies><dependency>text</dependency></dependencies></project>';
    expect(parseMavenDependencies(pom)).toEqual([]);
  });

  it('skips a dependency with no artifactId', () => {
    const pom =
      '<project><dependencies><dependency><groupId>g</groupId></dependency></dependencies></project>';
    expect(parseMavenDependencies(pom)).toEqual([]);
  });

  it('uses artifactId alone as the name when groupId is absent', () => {
    const pom =
      '<project><dependencies><dependency><artifactId>art</artifactId><version>2</version></dependency></dependencies></project>';
    expect(parseMavenDependencies(pom)).toEqual([
      { name: 'art', version: '2' },
    ]);
  });

  it('coerces a numeric version to a string', () => {
    const pom =
      '<project><dependencies><dependency><artifactId>art</artifactId><version>3</version></dependency></dependencies></project>';
    expect(parseMavenDependencies(pom)).toEqual([
      { name: 'art', version: '3' },
    ]);
  });

  it('returns [] when the XML parser throws (catch path)', () => {
    expect(parseMavenDependencies('<?xml')).toEqual([]);
  });
});

describe('parseCsprojDependencies — edge entries and malformed XML', () => {
  it('skips an ItemGroup that is not an element record', () => {
    const csproj = '<Project><ItemGroup>hi</ItemGroup></Project>';
    expect(parseCsprojDependencies(csproj)).toEqual([]);
  });

  it('skips a PackageReference with no Include attribute', () => {
    const csproj =
      '<Project><ItemGroup><PackageReference Version="1"/></ItemGroup></Project>';
    expect(parseCsprojDependencies(csproj)).toEqual([]);
  });

  it('reads the version from a child <Version> element when the attribute is absent', () => {
    const csproj =
      '<Project><ItemGroup><PackageReference Include="Foo"><Version>9.9</Version></PackageReference></ItemGroup></Project>';
    expect(parseCsprojDependencies(csproj)).toEqual([
      { name: 'Foo', version: '9.9' },
    ]);
  });

  it('coerces a numeric version attribute to a string', () => {
    const csproj =
      '<Project><ItemGroup><PackageReference Include="Foo" Version="7"/></ItemGroup></Project>';
    expect(parseCsprojDependencies(csproj)).toEqual([
      { name: 'Foo', version: '7' },
    ]);
  });

  it('emits name-only when a PackageReference has no version', () => {
    const csproj =
      '<Project><ItemGroup><PackageReference Include="Foo"/></ItemGroup></Project>';
    expect(parseCsprojDependencies(csproj)).toEqual([{ name: 'Foo' }]);
  });

  it('returns [] when the XML parser throws (catch path)', () => {
    expect(parseCsprojDependencies('<?xml')).toEqual([]);
  });
});

describe('parsePyprojectEntryPoints — non-string values and malformed TOML', () => {
  it('ignores non-string script-table values', () => {
    const toml = '[project.scripts]\ndemo = { x = 1 }';
    expect(parsePyprojectEntryPoints(toml)).toEqual([]);
  });

  it('returns [] on malformed TOML (catch path)', () => {
    expect(parsePyprojectEntryPoints('a = = b')).toEqual([]);
  });
});

describe('parseCargoEntryPoints — non-record bins and missing targets', () => {
  it('skips a [[bin]] entry that is not a table', () => {
    expect(parseCargoEntryPoints('bin = ["str"]')).toEqual([]);
  });

  it('skips a [[bin]] table that declares neither path nor name', () => {
    expect(parseCargoEntryPoints('[[bin]]\nfoo = "x"')).toEqual([]);
  });

  it('returns [] on malformed TOML (catch path)', () => {
    expect(parseCargoEntryPoints('a = = b')).toEqual([]);
  });
});

describe('csprojIsExecutable — malformed XML', () => {
  it('returns false when the XML parser throws (catch path)', () => {
    expect(csprojIsExecutable('<?xml')).toBe(false);
  });

  it('returns false when there is no Exe OutputType', () => {
    expect(csprojIsExecutable('<Project><PropertyGroup/></Project>')).toBe(false);
  });
});

describe('parseVcpkgDependencies — object entry edge cases', () => {
  it('skips object entries that are null or lack a string name', () => {
    const json = JSON.stringify({
      dependencies: [{ foo: 'bar' }, null, { name: 'ok' }],
    });
    expect(parseVcpkgDependencies(json)).toEqual([{ name: 'ok' }]);
  });

  it('coerces a numeric version to a string', () => {
    const json = JSON.stringify({ dependencies: [{ name: 'a', version: 5 }] });
    expect(parseVcpkgDependencies(json)).toEqual([{ name: 'a', version: '5' }]);
  });
});
