import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatKnowledgeVerifyOutput } from '../../../src/cli/formatters/knowledge-verify-output.js';
import type { KnowledgeVerifyResult } from '../../../src/services/knowledge-verify.service.js';

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

const result = (over: Partial<KnowledgeVerifyResult> = {}): KnowledgeVerifyResult => ({
  moduleMapPath: '/p/prospec/ai-knowledge/module-map.yaml',
  verified: ['lib', 'cli'],
  timestamp: '2026-08-14T12:00:00.000Z',
  ...over,
});

describe('knowledge-verify-output', () => {
  it('prints one line per verified module with the timestamp', () => {
    const out = captureStdout(() => formatKnowledgeVerifyOutput(result(), 'normal'));
    expect(out).toContain('verified lib @ 2026-08-14T12:00:00.000Z');
    expect(out).toContain('verified cli @ 2026-08-14T12:00:00.000Z');
  });

  it('writes nothing under quiet', () => {
    const out = captureStdout(() => formatKnowledgeVerifyOutput(result(), 'quiet'));
    expect(out).toBe('');
  });

  it('sanitizes terminal control bytes in a module name', () => {
    const out = captureStdout(() =>
      formatKnowledgeVerifyOutput(result({ verified: [`lib${BEL}`] }), 'normal'),
    );
    expect(out).not.toContain(BEL);
  });
});
