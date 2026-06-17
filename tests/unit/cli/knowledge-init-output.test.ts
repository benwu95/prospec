import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatKnowledgeInitOutput } from '../../../src/cli/formatters/knowledge-init-output.js';
import type { KnowledgeInitResult } from '../../../src/services/knowledge-init.service.js';

function baseResult(overrides: Partial<KnowledgeInitResult> = {}): KnowledgeInitResult {
  return {
    totalFiles: 3,
    scanDepth: 10,
    entryPoints: [],
    dependencies: [],
    configFiles: [],
    outputFiles: [],
    dryRun: false,
    rawScanOnly: false,
    ...overrides,
  };
}

describe('formatKnowledgeInitOutput', () => {
  let write: ReturnType<typeof vi.spyOn>;

  function captureWrite() {
    write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  }

  function output(): string {
    return write.mock.calls.map((c) => String(c[0])).join('');
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('quiet log level returns early without writing anything (L12 then)', () => {
    captureWrite();
    formatKnowledgeInitOutput(baseResult({ totalFiles: 99 }), 'quiet');
    expect(write).not.toHaveBeenCalled();
  });

  it('defaults to normal log level when omitted and writes the scan summary (L10 default-arg, L12 else)', () => {
    captureWrite();
    formatKnowledgeInitOutput(baseResult({ totalFiles: 7, scanDepth: 4 }));
    const out = output();
    expect(out).toContain('Scanned 7 files (depth: 4)');
    expect(out).toContain('Run');
    expect(out).toContain('/prospec-knowledge-generate');
    // No entry points / deps / created files in this minimal result.
    expect(out).not.toContain('Entry points:');
    expect(out).not.toContain('Dependencies:');
    expect(out).not.toContain('Created');
  });

  it('lists entry points when present (L22 then)', () => {
    captureWrite();
    formatKnowledgeInitOutput(
      baseResult({ entryPoints: ['src/index.ts', 'src/cli.ts'] }),
      'normal',
    );
    const out = output();
    expect(out).toContain('Entry points:');
    expect(out).toContain('src/index.ts');
    expect(out).toContain('src/cli.ts');
  });

  it('omits the entry points block when empty (L22 else)', () => {
    captureWrite();
    formatKnowledgeInitOutput(baseResult({ entryPoints: [] }), 'normal');
    expect(output()).not.toContain('Entry points:');
  });

  it('shows only the dependency count in normal mode (L31 else-if, L41 then)', () => {
    captureWrite();
    formatKnowledgeInitOutput(
      baseResult({
        dependencies: [
          { name: 'left-pad', version: '1.0.0' },
          { name: 'picocolors' },
        ],
      }),
      'normal',
    );
    const out = output();
    expect(out).toContain('Dependencies: 2');
    // Normal mode must NOT enumerate each dependency name.
    expect(out).not.toContain('left-pad');
    expect(out).not.toContain('picocolors');
  });

  it('omits dependencies entirely when there are none (L31 false, L41 false)', () => {
    captureWrite();
    formatKnowledgeInitOutput(baseResult({ dependencies: [] }), 'verbose');
    expect(output()).not.toContain('Dependencies:');
  });

  it('enumerates dependencies in verbose mode and renders versions conditionally (L31 then, L35 both sides)', () => {
    captureWrite();
    formatKnowledgeInitOutput(
      baseResult({
        dependencies: [
          { name: 'with-ver', version: '2.3.4' },
          { name: 'no-ver' },
        ],
      }),
      'verbose',
    );
    const out = output();
    expect(out).toContain('Dependencies: 2');
    // version present => "name @ version" (L35 then)
    expect(out).toContain('with-ver');
    expect(out).toContain('@ 2.3.4');
    // version absent => bare name, no " @ " suffix attached to it (L35 else)
    expect(out).toContain('no-ver');
    expect(out).not.toContain('no-ver @');
  });

  it('truncates the verbose dependency list past 20 entries (L38 then)', () => {
    const deps = Array.from({ length: 23 }, (_, i) => ({ name: `dep-${i}` }));
    captureWrite();
    formatKnowledgeInitOutput(baseResult({ dependencies: deps }), 'verbose');
    const out = output();
    expect(out).toContain('Dependencies: 23');
    // First 20 are listed.
    expect(out).toContain('dep-0');
    expect(out).toContain('dep-19');
    // 21st onward are not individually listed.
    expect(out).not.toContain('dep-20');
    expect(out).toContain('... and 3 more');
  });

  it('does not emit the truncation note at exactly 20 verbose dependencies (L38 else)', () => {
    const deps = Array.from({ length: 20 }, (_, i) => ({ name: `dep-${i}` }));
    captureWrite();
    formatKnowledgeInitOutput(baseResult({ dependencies: deps }), 'verbose');
    const out = output();
    expect(out).toContain('dep-19');
    expect(out).not.toContain('more');
  });

  it('lists created output files when not a dry run (L47 then, both binary sides true)', () => {
    captureWrite();
    formatKnowledgeInitOutput(
      baseResult({
        dryRun: false,
        outputFiles: ['ai-knowledge/raw-scan.md', 'ai-knowledge/_index.md'],
      }),
      'normal',
    );
    const out = output();
    expect(out).toContain('Created ai-knowledge/raw-scan.md');
    expect(out).toContain('Created ai-knowledge/_index.md');
  });

  it('omits created files when there are output files but it is a dry run (L47 binary-expr#0 short-circuit false)', () => {
    captureWrite();
    formatKnowledgeInitOutput(
      baseResult({ dryRun: true, outputFiles: ['ai-knowledge/raw-scan.md'] }),
      'normal',
    );
    const out = output();
    expect(out).not.toContain('Created');
    // dry-run notice instead.
    expect(out).toContain('Dry-run mode: no files were modified');
  });

  it('omits created files when not a dry run but there are no output files (L47 binary-expr#1 false)', () => {
    captureWrite();
    formatKnowledgeInitOutput(
      baseResult({ dryRun: false, outputFiles: [] }),
      'normal',
    );
    expect(output()).not.toContain('Created');
  });

  it('prints the curated-files-untouched note for raw-scan-only non-dry-run (L55 then, both binary sides true)', () => {
    captureWrite();
    formatKnowledgeInitOutput(
      baseResult({
        rawScanOnly: true,
        dryRun: false,
        outputFiles: ['ai-knowledge/raw-scan.md'],
      }),
      'normal',
    );
    const out = output();
    expect(out).toContain('Curated files (module-map.yaml, _index.md, _conventions.md) left untouched');
  });

  it('suppresses the curated-files note when raw-scan-only but dry run (L55 binary-expr#1 false)', () => {
    captureWrite();
    formatKnowledgeInitOutput(
      baseResult({ rawScanOnly: true, dryRun: true }),
      'normal',
    );
    const out = output();
    expect(out).not.toContain('left untouched');
    expect(out).toContain('Dry-run mode: no files were modified');
  });

  it('suppresses the curated-files note when not raw-scan-only (L55 binary-expr#0 false)', () => {
    captureWrite();
    formatKnowledgeInitOutput(
      baseResult({ rawScanOnly: false, dryRun: false }),
      'normal',
    );
    expect(output()).not.toContain('left untouched');
  });

  it('prints the dry-run notice when dryRun is true (L62 then)', () => {
    captureWrite();
    formatKnowledgeInitOutput(baseResult({ dryRun: true }), 'normal');
    const out = output();
    expect(out).toContain('Dry-run mode: no files were modified');
  });

  it('does not print the dry-run notice when dryRun is false (L62 else)', () => {
    captureWrite();
    formatKnowledgeInitOutput(baseResult({ dryRun: false }), 'normal');
    expect(output()).not.toContain('Dry-run mode');
  });

  it('always appends the next-steps guidance terminated by a trailing newline (L70-L75)', () => {
    captureWrite();
    formatKnowledgeInitOutput(baseResult(), 'normal');
    const out = output();
    expect(out).toContain('Run');
    expect(out).toContain('/prospec-knowledge-generate');
    expect(out).toContain('to analyze and generate module knowledge');
    expect(out.endsWith('\n')).toBe(true);
  });
});
