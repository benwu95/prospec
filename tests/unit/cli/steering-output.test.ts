import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatSteeringOutput } from '../../../src/cli/formatters/steering-output.js';
import type { SteeringResult } from '../../../src/services/steering.service.js';

type Module = SteeringResult['modules'][number];

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    name: 'core',
    description: 'Core domain logic',
    fileCount: 3,
    keywords: [],
    relationships: { depends_on: [], used_by: [] },
    ...overrides,
  };
}

function makeResult(overrides: Partial<SteeringResult> = {}): SteeringResult {
  return {
    fileCount: 10,
    moduleCount: 2,
    architecture: 'layered',
    entryPoints: [],
    modules: [],
    outputFiles: [],
    dryRun: false,
    ...overrides,
  };
}

function captureStdout(fn: () => void): { written: boolean; text: string } {
  const write = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  fn();
  const text = write.mock.calls.map((c) => String(c[0])).join('');
  return { written: write.mock.calls.length > 0, text };
}

describe('formatSteeringOutput', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes nothing in quiet mode (L25 then)', () => {
    const { written, text } = captureStdout(() =>
      formatSteeringOutput(makeResult({ fileCount: 99 }), 'quiet'),
    );
    expect(written).toBe(false);
    expect(text).toBe('');
  });

  it('writes the scan summary with file and module counts and architecture (L25 else, default arg path)', () => {
    const { written, text } = captureStdout(() =>
      formatSteeringOutput(
        makeResult({ fileCount: 42, moduleCount: 7, architecture: 'hexagonal' }),
      ),
    );
    expect(written).toBe(true);
    expect(text).toContain('Scanned');
    expect(text).toContain('42');
    expect(text).toContain('detected');
    expect(text).toContain('7');
    expect(text).toMatch(/Architecture:.*hexagonal/);
  });

  it('terminates the joined output with a trailing newline', () => {
    const { text } = captureStdout(() =>
      formatSteeringOutput(makeResult(), 'normal'),
    );
    expect(text.endsWith('\n')).toBe(true);
  });

  it('always emits the next-steps suggestion line (L97-98)', () => {
    const { text } = captureStdout(() =>
      formatSteeringOutput(makeResult(), 'normal'),
    );
    expect(text).toContain(
      'Module map and architecture docs are ready for AI assistants',
    );
  });

  describe('entry points section (L36)', () => {
    it('lists entry points in verbose mode when present (L36 then, both binary sides true)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(
          makeResult({ entryPoints: ['src/main.ts', 'src/cli.ts'] }),
          'verbose',
        ),
      );
      expect(text).toContain('Entry points:');
      expect(text).toContain('src/main.ts');
      expect(text).toContain('src/cli.ts');
    });

    it('omits entry points in normal mode even when present (L36 binary#0 false)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(
          makeResult({ entryPoints: ['src/main.ts'] }),
          'normal',
        ),
      );
      expect(text).not.toContain('Entry points:');
      expect(text).not.toContain('src/main.ts');
    });

    it('omits entry points in verbose mode when list is empty (L36 binary#1 false)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(makeResult({ entryPoints: [] }), 'verbose'),
      );
      expect(text).not.toContain('Entry points:');
    });
  });

  describe('modules list section (L45)', () => {
    it('lists each module with name, file count and description (L45 then)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(
          makeResult({
            modules: [
              makeModule({ name: 'auth', fileCount: 5, description: 'Authentication' }),
              makeModule({ name: 'db', fileCount: 2, description: 'Persistence' }),
            ],
          }),
          'normal',
        ),
      );
      expect(text).toContain('Modules:');
      expect(text).toContain('auth');
      expect(text).toContain('(5 files)');
      expect(text).toContain('Authentication');
      expect(text).toContain('db');
      expect(text).toContain('(2 files)');
      expect(text).toContain('Persistence');
    });

    it('omits the Modules section when there are no modules (L45 else)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(makeResult({ modules: [] }), 'normal'),
      );
      expect(text).not.toContain('Modules:');
    });
  });

  describe('module detail section (verbose only, L55/L57/L62/L70)', () => {
    it('renders keywords, depends_on and used_by when verbose and present (then sides)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(
          makeResult({
            modules: [
              makeModule({
                name: 'auth',
                keywords: ['login', 'session'],
                relationships: { depends_on: ['db', 'crypto'], used_by: ['api'] },
              }),
            ],
          }),
          'verbose',
        ),
      );
      expect(text).toContain('Keywords:');
      expect(text).toContain('login, session');
      expect(text).toContain('Depends on:');
      expect(text).toContain('db');
      expect(text).toContain('crypto');
      expect(text).toContain('Used by:');
      expect(text).toContain('api');
    });

    it('does not render detail labels in normal mode (L55 else)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(
          makeResult({
            modules: [
              makeModule({
                keywords: ['login'],
                relationships: { depends_on: ['db'], used_by: ['api'] },
              }),
            ],
          }),
          'normal',
        ),
      );
      expect(text).not.toContain('Keywords:');
      expect(text).not.toContain('Depends on:');
      expect(text).not.toContain('Used by:');
    });

    it('omits each detail label whose list is empty in verbose mode (L57/L62/L70 else sides)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(
          makeResult({
            modules: [
              makeModule({
                keywords: [],
                relationships: { depends_on: [], used_by: [] },
              }),
            ],
          }),
          'verbose',
        ),
      );
      expect(text).toContain('Modules:');
      expect(text).not.toContain('Keywords:');
      expect(text).not.toContain('Depends on:');
      expect(text).not.toContain('Used by:');
    });

    it('renders only the non-empty relationship side (depends_on present, used_by empty)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(
          makeResult({
            modules: [
              makeModule({
                relationships: { depends_on: ['db'], used_by: [] },
              }),
            ],
          }),
          'verbose',
        ),
      );
      expect(text).toContain('Depends on:');
      expect(text).not.toContain('Used by:');
    });
  });

  describe('output files section (L81)', () => {
    it('lists updated output files when not dry-run and list is non-empty (L81 then, both binary sides true)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(
          makeResult({
            dryRun: false,
            outputFiles: ['module-map.yaml', 'architecture.md'],
          }),
          'normal',
        ),
      );
      expect(text).toContain('Updated module-map.yaml');
      expect(text).toContain('Updated architecture.md');
    });

    it('omits output files when not dry-run but list is empty (L81 binary#1 false)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(
          makeResult({ dryRun: false, outputFiles: [] }),
          'normal',
        ),
      );
      expect(text).not.toContain('Updated');
    });

    it('omits output files when dry-run even if list is non-empty (L81 binary#0 false)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(
          makeResult({
            dryRun: true,
            outputFiles: ['module-map.yaml'],
          }),
          'normal',
        ),
      );
      expect(text).not.toContain('Updated module-map.yaml');
    });
  });

  describe('dry-run notice (L89)', () => {
    it('shows the dry-run notice when dryRun is true (L89 then)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(makeResult({ dryRun: true }), 'normal'),
      );
      expect(text).toContain('Dry-run mode: no files were modified');
    });

    it('omits the dry-run notice when dryRun is false (L89 else)', () => {
      const { text } = captureStdout(() =>
        formatSteeringOutput(makeResult({ dryRun: false }), 'normal'),
      );
      expect(text).not.toContain('Dry-run mode');
    });
  });
});
