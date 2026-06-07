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
