import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatKnowledgeUpdateOutput } from '../../../src/cli/formatters/knowledge-update-output.js';
import type { KnowledgeUpdateForChangeResult } from '../../../src/services/knowledge-update.service.js';

// BEL (0x07) is a C0 control char that picocolors never emits (it only uses ESC
// for color), so asserting "no BEL in output" proves the injected control bytes
// were stripped without being confused by terminal-color escape sequences.
const BEL = String.fromCharCode(0x07);

afterEach(() => {
  vi.restoreAllMocks();
});

function captureStdout(fn: () => void): string {
  const writes: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  });
  fn();
  return writes.join('');
}

function baseResult(
  overrides: Partial<KnowledgeUpdateForChangeResult> = {},
): KnowledgeUpdateForChangeResult {
  return {
    created: [],
    updated: [],
    deprecated: [],
    readmePending: [],
    generatedFiles: [],
    warnings: [],
    ...overrides,
  };
}

describe('knowledge-update-output', () => {
  // `README content pending` is a parse contract quoted by
  // src/templates/skills/prospec-knowledge-update.hbs — the phrase must stay stable.
  it('pins the `README content pending` parse contract', () => {
    const out = captureStdout(() =>
      formatKnowledgeUpdateOutput(baseResult({ readmePending: ['services'] }), 'normal'),
    );
    expect(out).toContain('README content pending');
    expect(out).toContain('- services');
  });

  it('prints generated files, deprecations, and warnings', () => {
    const out = captureStdout(() =>
      formatKnowledgeUpdateOutput(
        baseResult({
          changeName: 'feat-x',
          generatedFiles: [{ path: 'prospec/ai-knowledge/services/README.md', action: 'created' }],
          deprecated: ['old-module'],
          warnings: ['non-canonical REQ id skipped'],
        }),
        'normal',
      ),
    );
    expect(out).toContain('Knowledge update driven by change feat-x');
    expect(out).toContain('created: prospec/ai-knowledge/services/README.md');
    expect(out).toContain('deprecated: old-module');
    expect(out).toContain('non-canonical REQ id skipped');
  });

  it('prints the nothing-to-update fallback', () => {
    const out = captureStdout(() => formatKnowledgeUpdateOutput(baseResult(), 'normal'));
    expect(out).toContain('Nothing to update');
  });

  it('prints nothing in quiet mode', () => {
    const out = captureStdout(() =>
      formatKnowledgeUpdateOutput(baseResult({ readmePending: ['services'] }), 'quiet'),
    );
    expect(out).toBe('');
  });

  it('strips control characters from paths, module names, and warnings', () => {
    const out = captureStdout(() =>
      formatKnowledgeUpdateOutput(
        baseResult({
          changeName: `evil${BEL}change`,
          generatedFiles: [{ path: `gen${BEL}path.md`, action: 'updated' }],
          deprecated: [`dep${BEL}module`],
          readmePending: [`pend${BEL}module`],
          warnings: [`warn${BEL}text`],
        }),
        'normal',
      ),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('evilchange');
    expect(out).toContain('genpath.md');
    expect(out).toContain('depmodule');
    expect(out).toContain('pendmodule');
    expect(out).toContain('warntext');
  });
});
