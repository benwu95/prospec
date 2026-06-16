import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { detectTechStack } from '../../../src/lib/detector.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

describe('detectTechStack', () => {
  it('should detect TypeScript when package.json and tsconfig.json exist', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ name: 'test' }),
      '/project/tsconfig.json': '{}',
    });
    const result = detectTechStack('/project');
    expect(result.language).toBe('typescript');
    expect(result.package_manager).toBe('npm');
  });

  it('should detect JavaScript when only package.json exists', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ name: 'test' }),
    });
    const result = detectTechStack('/project');
    expect(result.language).toBe('javascript');
  });

  it('should detect Python with requirements.txt', () => {
    vol.fromJSON({
      '/project/requirements.txt': 'flask\n',
    });
    const result = detectTechStack('/project');
    expect(result.language).toBe('python');
    expect(result.package_manager).toBe('pip');
  });

  it('should detect Python with pyproject.toml', () => {
    vol.fromJSON({
      '/project/pyproject.toml': '[tool.poetry]\nname = "test"\n',
    });
    const result = detectTechStack('/project');
    expect(result.language).toBe('python');
    expect(result.package_manager).toBe('poetry');
  });

  it('should return empty result for unknown projects', () => {
    vol.fromJSON({ '/project/.gitignore': '*.log' });
    const result = detectTechStack('/project');
    expect(result.language).toBeUndefined();
    expect(result.framework).toBeUndefined();
  });

  it('should detect npm as default package manager', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ name: 'test' }),
    });
    const result = detectTechStack('/project');
    expect(result.package_manager).toBe('npm');
  });

  it('should detect pnpm package manager', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ name: 'test' }),
      '/project/pnpm-lock.yaml': '',
    });
    const result = detectTechStack('/project');
    expect(result.package_manager).toBe('pnpm');
  });

  it('should detect yarn package manager', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ name: 'test' }),
      '/project/yarn.lock': '',
    });
    const result = detectTechStack('/project');
    expect(result.package_manager).toBe('yarn');
  });

  it('should detect bun package manager', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ name: 'test' }),
      '/project/bun.lockb': '',
    });
    const result = detectTechStack('/project');
    expect(result.package_manager).toBe('bun');
  });

  it('should detect Next.js framework', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({
        name: 'test',
        dependencies: { next: '^14.0.0', react: '^18' },
      }),
    });
    const result = detectTechStack('/project');
    expect(result.framework).toBe('next.js');
  });

  it('should detect Express framework', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({
        name: 'test',
        dependencies: { express: '^4.0.0' },
      }),
    });
    const result = detectTechStack('/project');
    expect(result.framework).toBe('express');
  });

  it('should detect Vue framework', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({
        name: 'test',
        dependencies: { vue: '^3.0.0' },
      }),
    });
    const result = detectTechStack('/project');
    expect(result.framework).toBe('vue');
  });

  it('should detect framework from devDependencies', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({
        name: 'test',
        devDependencies: { svelte: '^4.0.0' },
      }),
    });
    const result = detectTechStack('/project');
    expect(result.framework).toBe('svelte');
  });

  it('should prefer a meta-framework over its underlying react/vue dep', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({
        name: 'test',
        dependencies: { gatsby: '^5.0.0', react: '^18.0.0' },
      }),
    });
    expect(detectTechStack('/project').framework).toBe('gatsby');

    vol.reset();
    vol.fromJSON({
      '/project/package.json': JSON.stringify({
        name: 'test',
        dependencies: { '@remix-run/react': '^2.0.0', react: '^18.0.0' },
      }),
    });
    expect(detectTechStack('/project').framework).toBe('remix');
  });

  it('should mark source as auto-detected when no config override', () => {
    vol.fromJSON({ '/project/package.json': JSON.stringify({ name: 'test' }) });
    const result = detectTechStack('/project');
    expect(result.source).toBe('auto-detected');
  });

  it('should leave source undefined for unknown projects without config', () => {
    vol.fromJSON({ '/project/.gitignore': '*.log' });
    const result = detectTechStack('/project');
    expect(result.source).toBeUndefined();
  });

  // BUG-001: .prospec.yaml tech_stack is authoritative — a stray root
  // package.json (e.g. prospec installed via npm into a Python project) must
  // not mislabel the stack.
  it('should let config override a misleading detected package.json', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ name: 'prospec-installed' }),
      '/project/pnpm-lock.yaml': '',
    });
    const result = detectTechStack('/project', {
      language: 'python',
      package_manager: 'poetry',
    });
    expect(result.language).toBe('python');
    expect(result.package_manager).toBe('poetry');
    expect(result.source).toBe('config');
  });

  it('should let auto-detection fill gaps the config leaves open (mixed)', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({
        name: 'test',
        dependencies: { react: '^18' },
      }),
    });
    const result = detectTechStack('/project', { language: 'typescript' });
    expect(result.language).toBe('typescript'); // from config
    expect(result.framework).toBe('react'); // filled by detection
    expect(result.package_manager).toBe('npm'); // filled by detection
    expect(result.source).toBe('mixed');
  });

  it('should report source=config when config covers every populated field', () => {
    vol.fromJSON({ '/project/.gitignore': '*.log' });
    const result = detectTechStack('/project', {
      language: 'go',
      package_manager: 'go mod',
    });
    expect(result.language).toBe('go');
    expect(result.package_manager).toBe('go mod');
    expect(result.source).toBe('config');
  });

  it('should ignore an empty config object and fall back to detection', () => {
    vol.fromJSON({ '/project/requirements.txt': 'flask\n' });
    const result = detectTechStack('/project', {});
    expect(result.language).toBe('python');
    expect(result.source).toBe('auto-detected');
  });
});

describe('detectTechStack — backend languages', () => {
  const cases: Array<[string, Record<string, string>, string, string]> = [
    ['Go', { '/project/go.mod': 'module x\n' }, 'go', 'go modules'],
    ['Rust', { '/project/Cargo.toml': '[package]\nname = "x"\n' }, 'rust', 'cargo'],
    ['Java (Maven)', { '/project/pom.xml': '<project/>' }, 'java', 'maven'],
    ['Java (Gradle)', { '/project/build.gradle': '' }, 'java', 'gradle'],
    ['Java (Gradle Kotlin DSL)', { '/project/build.gradle.kts': '' }, 'java', 'gradle'],
    ['C#', { '/project/App.csproj': '<Project/>' }, 'c#', 'nuget'],
    ['Ruby', { '/project/Gemfile': "source 'https://rubygems.org'\n" }, 'ruby', 'bundler'],
    ['PHP', { '/project/composer.json': '{}' }, 'php', 'composer'],
  ];

  it.each(cases)('detects %s', (_label, files, language, pm) => {
    vol.fromJSON(files);
    const result = detectTechStack('/project');
    expect(result.language).toBe(language);
    expect(result.package_manager).toBe(pm);
    expect(result.source).toBe('auto-detected');
  });

  it('lets a Node package.json win over a backend manifest (existing precedence)', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ name: 'x' }),
      '/project/go.mod': 'module x\n',
    });
    expect(detectTechStack('/project').language).not.toBe('go');
  });

  it('matches pom.xml / *.csproj tree-wide when a file list is given', () => {
    vol.fromJSON({ '/project/.gitignore': '' });
    expect(
      detectTechStack('/project', undefined, ['src/App.csproj']).language,
    ).toBe('c#');
    expect(
      detectTechStack('/project', undefined, ['backend/pom.xml']).language,
    ).toBe('java');
  });

  it('detects Swift from Package.swift', () => {
    const result = detectTechStack('/project', undefined, ['Package.swift', 'Sources/App/main.swift']);
    expect(result.language).toBe('swift');
    expect(result.package_manager).toBe('spm');
  });

  it('splits C vs C++ by source extension under a C-family build file', () => {
    expect(
      detectTechStack('/project', undefined, ['CMakeLists.txt', 'src/main.cpp']),
    ).toMatchObject({ language: 'c++', package_manager: 'cmake' });
    expect(
      detectTechStack('/project', undefined, ['CMakeLists.txt', 'src/main.c']),
    ).toMatchObject({ language: 'c', package_manager: 'cmake' });
  });

  it('derives the C-family package manager from the manifest', () => {
    expect(
      detectTechStack('/project', undefined, ['vcpkg.json', 'main.cpp']).package_manager,
    ).toBe('vcpkg');
    expect(
      detectTechStack('/project', undefined, ['conanfile.txt', 'main.c']).package_manager,
    ).toBe('conan');
  });

  it('does NOT treat a bare Makefile as a C/C++ signal', () => {
    expect(
      detectTechStack('/project', undefined, ['Makefile', 'src/main.c']).language,
    ).toBeUndefined();
  });

  it('lets .prospec.yaml tech_stack override the C/C++ heuristic', () => {
    const result = detectTechStack(
      '/project',
      { language: 'c', package_manager: 'cmake' },
      ['CMakeLists.txt', 'src/main.cpp'], // heuristic would say c++
    );
    expect(result.language).toBe('c');
    expect(result.source).toBe('config');
  });
});
