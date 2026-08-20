import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  detectTestCommand,
  hasPackageJsonTestScript,
  resolveProjectTestCommand,
} from '../../../src/lib/project-runner.js';
import type { ProspecConfig } from '../../../src/types/config.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

describe('hasPackageJsonTestScript', () => {
  it('returns true when package.json has a non-empty test script', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
    });
    expect(hasPackageJsonTestScript('/project')).toBe(true);
  });

  it('returns false when package.json has no test script or is missing', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ scripts: { build: 'tsc' } }),
    });
    expect(hasPackageJsonTestScript('/project')).toBe(false);
    expect(hasPackageJsonTestScript('/non-existent')).toBe(false);
  });
});

describe('detectTestCommand', () => {
  it('detects Rust cargo test from Cargo.toml', () => {
    vol.fromJSON({
      '/project/Cargo.toml': '[package]\nname = "my-rust-app"\n',
    });
    expect(detectTestCommand('/project')).toBe('cargo test');
  });

  it('detects Python pytest runners from lockfiles', () => {
    vol.fromJSON({ '/project/poetry.lock': '' });
    expect(detectTestCommand('/project')).toBe('poetry run pytest');

    vol.reset();
    vol.fromJSON({ '/project/pdm.lock': '' });
    expect(detectTestCommand('/project')).toBe('pdm run pytest');

    vol.reset();
    vol.fromJSON({ '/project/uv.lock': '' });
    expect(detectTestCommand('/project')).toBe('uv run pytest');
  });

  it('detects Python pytest from configuration files', () => {
    vol.fromJSON({ '/project/pytest.ini': '[pytest]\n' });
    expect(detectTestCommand('/project')).toBe('pytest');

    vol.reset();
    vol.fromJSON({ '/project/pyproject.toml': '[tool.pytest]\n' });
    expect(detectTestCommand('/project')).toBe('pytest');

    vol.reset();
    vol.fromJSON({ '/project/setup.py': '' });
    expect(detectTestCommand('/project')).toBe('pytest');

    vol.reset();
    vol.fromJSON({ '/project/requirements.txt': 'pytest>=7.0\n' });
    expect(detectTestCommand('/project')).toBe('pytest');
  });

  it('detects Go go test from go.mod', () => {
    vol.fromJSON({
      '/project/go.mod': 'module example.com/app\n\ngo 1.22\n',
    });
    expect(detectTestCommand('/project')).toBe('go test ./...');
  });

  it('detects Node.js test runners based on lockfiles and package.json', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
      '/project/pnpm-lock.yaml': '',
    });
    expect(detectTestCommand('/project')).toBe('pnpm test');

    vol.reset();
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ scripts: { test: 'jest' } }),
      '/project/yarn.lock': '',
    });
    expect(detectTestCommand('/project')).toBe('yarn test');

    vol.reset();
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ scripts: { test: 'bun test' } }),
      '/project/bun.lockb': '',
    });
    expect(detectTestCommand('/project')).toBe('bun test');

    vol.reset();
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
    });
    expect(detectTestCommand('/project')).toBe('npm test');
  });

  it('detects Makefile test target', () => {
    vol.fromJSON({
      '/project/Makefile': 'all:\n\ttarget\n\ntest:\n\tpytest\n',
    });
    expect(detectTestCommand('/project')).toBe('make test');
  });

  it('returns null when no known manifest or test script is present', () => {
    vol.fromJSON({
      '/project/README.md': '# Project\n',
    });
    expect(detectTestCommand('/project')).toBeNull();
  });
});

describe('resolveProjectTestCommand', () => {
  it('prefers explicit tech_stack.test_command over all manifests', () => {
    vol.fromJSON({
      '/project/Cargo.toml': '',
      '/project/package.json': JSON.stringify({ scripts: { test: 'npm run test' } }),
    });
    const config: ProspecConfig = {
      project: { name: 'test' },
      tech_stack: { test_command: 'custom-runner --ci' },
    };
    expect(resolveProjectTestCommand(config, '/project')).toBe('custom-runner --ci');
  });

  it('uses configured package manager with package.json test script', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
    });
    const config: ProspecConfig = {
      project: { name: 'test' },
      tech_stack: { package_manager: 'pnpm' },
    };
    expect(resolveProjectTestCommand(config, '/project')).toBe('pnpm test');
  });

  it('falls back to dynamic detection when tech_stack is unset', () => {
    vol.fromJSON({
      '/project/go.mod': 'module myapp\n',
    });
    const config: ProspecConfig = {
      project: { name: 'test' },
    };
    expect(resolveProjectTestCommand(config, '/project')).toBe('go test ./...');
  });

  it('autodetects pnpm test from lockfile when package_manager is unset', () => {
    vol.fromJSON({
      '/project/package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
      '/project/pnpm-lock.yaml': '',
    });
    const config: ProspecConfig = {
      project: { name: 'test' },
    };
    expect(resolveProjectTestCommand(config, '/project')).toBe('pnpm test');
  });
});
