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

  it('does not expand XML/DTD entities (processEntities disabled)', () => {
    const pom =
      '<!DOCTYPE project [<!ENTITY inj "PWNED">]><project><dependencies><dependency><groupId>g</groupId><artifactId>&inj;</artifactId><version>1</version></dependency></dependencies></project>';
    const deps = parseMavenDependencies(pom);
    expect(deps[0]?.name).not.toContain('PWNED');
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
});
