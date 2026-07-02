import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatKnowledgeOutput } from '../../../src/cli/formatters/knowledge-output.js';
import type { KnowledgeResult } from '../../../src/services/knowledge.service.js';

function captureStdout() {
  const calls: string[] = [];
  const spy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: unknown) => {
      calls.push(String(chunk));
      return true;
    });
  return { spy, output: () => calls.join('') };
}

function baseResult(overrides: Partial<KnowledgeResult> = {}): KnowledgeResult {
  return {
    moduleCount: 0,
    modules: [],
    generatedFiles: [],
    dryRun: false,
    ...overrides,
  };
}

describe('formatKnowledgeOutput', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns early and writes nothing when logLevel is quiet', () => {
    const { spy } = captureStdout();
    formatKnowledgeOutput(baseResult({ moduleCount: 3 }), 'quiet');
    expect(spy).not.toHaveBeenCalled();
  });

  it('defaults to normal log level and prints the module summary count', () => {
    const { spy, output } = captureStdout();
    // No logLevel arg exercises the L17 default-arg branch.
    formatKnowledgeOutput(baseResult({ moduleCount: 5 }));
    expect(spy).toHaveBeenCalled();
    const text = output();
    expect(text).toContain('Generated knowledge for');
    expect(text).toContain('5');
    expect(text).toContain('modules');
    // Next steps always present.
    expect(text).toContain('prospec agent sync');
    // Output terminates with a trailing newline.
    expect(text.endsWith('\n')).toBe(true);
  });

  it('omits the Modules section when there are no modules', () => {
    const { output } = captureStdout();
    formatKnowledgeOutput(baseResult({ moduleCount: 0, modules: [] }), 'normal');
    expect(output()).not.toContain('Modules:');
  });

  it('lists modules with file counts but no descriptions/keywords at normal level', () => {
    const { output } = captureStdout();
    formatKnowledgeOutput(
      baseResult({
        moduleCount: 1,
        modules: [
          {
            name: 'auth',
            description: 'authentication module description',
            fileCount: 4,
            keywords: ['login', 'session'],
          },
        ],
      }),
      'normal',
    );
    const text = output();
    expect(text).toContain('Modules:');
    expect(text).toContain('auth');
    expect(text).toContain('(4 files)');
    // verbose-only details must NOT appear at normal level.
    expect(text).not.toContain('authentication module description');
    expect(text).not.toContain('Keywords:');
  });

  it('iterates and renders every module in the list, not just the first', () => {
    const { output } = captureStdout();
    formatKnowledgeOutput(
      baseResult({
        moduleCount: 3,
        modules: [
          { name: 'auth', description: 'a', fileCount: 4, keywords: [] },
          { name: 'core', description: 'b', fileCount: 7, keywords: [] },
          { name: 'cli', description: 'c', fileCount: 2, keywords: [] },
        ],
      }),
      'normal',
    );
    const text = output();
    // Every module name and its own file count must appear (guards loop regressions).
    expect(text).toContain('auth');
    expect(text).toContain('(4 files)');
    expect(text).toContain('core');
    expect(text).toContain('(7 files)');
    expect(text).toContain('cli');
    expect(text).toContain('(2 files)');
  });

  it('includes descriptions and keywords for modules at verbose level', () => {
    const { output } = captureStdout();
    formatKnowledgeOutput(
      baseResult({
        moduleCount: 1,
        modules: [
          {
            name: 'auth',
            description: 'authentication module description',
            fileCount: 4,
            keywords: ['login', 'session'],
          },
        ],
      }),
      'verbose',
    );
    const text = output();
    expect(text).toContain('authentication module description');
    expect(text).toContain('Keywords:');
    expect(text).toContain('login, session');
  });

  it('omits the Keywords line at verbose level when a module has no keywords', () => {
    const { output } = captureStdout();
    formatKnowledgeOutput(
      baseResult({
        moduleCount: 1,
        modules: [
          {
            name: 'core',
            description: 'core description',
            fileCount: 2,
            keywords: [],
          },
        ],
      }),
      'verbose',
    );
    const text = output();
    // description still printed (verbose branch taken)...
    expect(text).toContain('core description');
    // ...but the empty keywords array suppresses the Keywords line.
    expect(text).not.toContain('Keywords:');
  });

  it('renders Created for created files and Updated for updated files', () => {
    const { output } = captureStdout();
    formatKnowledgeOutput(
      baseResult({
        moduleCount: 0,
        generatedFiles: [
          { path: 'ai-knowledge/auth/README.md', action: 'created' },
          { path: 'ai-knowledge/index.md', action: 'updated' },
        ],
      }),
      'normal',
    );
    const text = output();
    expect(text).toContain('Created ai-knowledge/auth/README.md');
    expect(text).toContain('Updated ai-knowledge/index.md');
  });

  it('does not print generated files when the list is empty', () => {
    const { output } = captureStdout();
    formatKnowledgeOutput(
      baseResult({ moduleCount: 0, generatedFiles: [] }),
      'normal',
    );
    const text = output();
    // The empty-list guard's only observable effect is suppressing the blank line +
    // file block; empty iteration can never emit 'Created'/'Updated', so pin the EXACT
    // output instead (a regression dropping the length>0 guard adds a stray blank line).
    expect(text).toBe(
      'Generated knowledge for 0 modules\n\n→ Run `prospec agent sync` to update AI agent configurations\n',
    );
  });

  it('suppresses the generated-files section in dry-run and shows the dry-run notice', () => {
    const { output } = captureStdout();
    formatKnowledgeOutput(
      baseResult({
        moduleCount: 0,
        dryRun: true,
        generatedFiles: [
          { path: 'ai-knowledge/auth/README.md', action: 'created' },
        ],
      }),
      'normal',
    );
    const text = output();
    // dryRun short-circuits the !result.dryRun guard: files are NOT listed.
    expect(text).not.toContain('Created ai-knowledge/auth/README.md');
    // ...and the dry-run notice IS printed.
    expect(text).toContain('Dry-run mode: no files were modified');
  });

  it('does not print the dry-run notice when dryRun is false', () => {
    const { output } = captureStdout();
    formatKnowledgeOutput(
      baseResult({ moduleCount: 1, dryRun: false }),
      'normal',
    );
    expect(output()).not.toContain('Dry-run mode');
  });
});
