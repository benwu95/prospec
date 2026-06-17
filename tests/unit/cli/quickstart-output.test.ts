import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatQuickstartOutput } from '../../../src/cli/formatters/quickstart-output.js';
import type { QuickstartResult } from '../../../src/services/quickstart.service.js';

function captureStreams() {
  const stdoutCalls: string[] = [];
  const stderrCalls: string[] = [];
  const stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: unknown) => {
      stdoutCalls.push(String(chunk));
      return true;
    });
  const stderrSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: unknown) => {
      stderrCalls.push(String(chunk));
      return true;
    });
  return {
    stdoutSpy,
    stderrSpy,
    stdout: () => stdoutCalls.join(''),
    stderr: () => stderrCalls.join(''),
  };
}

function baseResult(overrides: Partial<QuickstartResult> = {}): QuickstartResult {
  return {
    steps: [],
    agentSync: {
      agents: [],
      totalFiles: 0,
      warnings: [],
      hints: [],
    },
    nextStep: '/prospec-quickstart',
    ...overrides,
  };
}

describe('formatQuickstartOutput', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emits warnings to stderr even in quiet mode and writes nothing to stdout', () => {
    const { stdoutSpy, stderr } = captureStreams();
    formatQuickstartOutput(
      baseResult({
        agentSync: {
          agents: [],
          totalFiles: 0,
          warnings: ['unknown skill foo ignored', 'second warning'],
          hints: ['ignored hint'],
        },
        steps: [{ name: 'init', status: 'created' }],
      }),
      'quiet',
    );
    // L25 quiet branch (if#0 true): stdout is fully suppressed.
    expect(stdoutSpy).not.toHaveBeenCalled();
    // L21-22: warnings still flushed to stderr, one per line.
    const err = stderr();
    expect(err).toContain('unknown skill foo ignored');
    expect(err).toContain('second warning');
    expect(err).toContain('⚠');
    // hints are part of the stdout body, so they must NOT leak to stderr.
    expect(err).not.toContain('ignored hint');
  });

  it('writes each warning on its own line to stderr (L22 trailing newline per warning)', () => {
    const { stderr } = captureStreams();
    formatQuickstartOutput(
      baseResult({
        agentSync: {
          agents: [],
          totalFiles: 0,
          warnings: ['first warning', 'second warning'],
          hints: [],
        },
      }),
      'quiet',
    );
    const err = stderr();
    // L22 writes `${⚠} ${warning}\n` per warning -> each warning ends in its own newline.
    expect(err).toContain('first warning\n');
    expect(err).toContain('second warning\n');
    // Two warnings -> two ⚠ glyphs, not one blob.
    expect(err.match(/⚠/g)).toHaveLength(2);
  });

  it('routes warnings to stderr and the body to stdout in the same non-quiet call', () => {
    const { stdout, stderr } = captureStreams();
    formatQuickstartOutput(
      baseResult({
        agentSync: {
          agents: [],
          totalFiles: 0,
          warnings: ['diagnostic warning'],
          hints: [],
        },
        steps: [{ name: 'init', status: 'created' }],
      }),
      'normal',
    );
    // L21-22 warnings land on stderr; L25 does NOT early-return in normal mode.
    expect(stderr()).toContain('diagnostic warning');
    // The step body + hand-off go to stdout, and the warning text must not leak there.
    const out = stdout();
    expect(out).toContain('init');
    expect(out).toContain('Scaffold ready');
    expect(out).not.toContain('diagnostic warning');
  });

  it('writes no stderr when there are no warnings', () => {
    const { stderrSpy } = captureStreams();
    formatQuickstartOutput(
      baseResult({ agentSync: { agents: [], totalFiles: 0, warnings: [], hints: [] } }),
      'normal',
    );
    // L21 loop body never runs with an empty warnings array.
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('defaults to normal level and prints the next-step hand-off command', () => {
    const { stdoutSpy, stdout } = captureStreams();
    // No logLevel argument exercises the L18 default-arg branch (=> normal).
    formatQuickstartOutput(baseResult({ nextStep: '/prospec-quickstart' }));
    expect(stdoutSpy).toHaveBeenCalled();
    const text = stdout();
    // L45-46: next-step section is always emitted in non-quiet mode.
    expect(text).toContain('Scaffold ready');
    expect(text).toContain('/prospec-quickstart');
    expect(text).toContain('generate AI Knowledge');
    // L50: output terminates with a trailing newline.
    expect(text.endsWith('\n')).toBe(true);
  });

  it('renders a created step with a check mark and the step name', () => {
    const { stdout } = captureStreams();
    formatQuickstartOutput(
      baseResult({ steps: [{ name: 'init', status: 'created' }] }),
      'normal',
    );
    const text = stdout();
    // L33-34: else branch (status !== 'skipped') -> green check + bare name.
    expect(text).toContain('✓');
    expect(text).toContain('init');
    // The "skipped" decoration must not appear for a created step.
    expect(text).not.toContain('already done, skipped');
  });

  it('renders a skipped step with the skipped decoration', () => {
    const { stdout } = captureStreams();
    formatQuickstartOutput(
      baseResult({ steps: [{ name: 'agent-sync', status: 'skipped' }] }),
      'normal',
    );
    const text = stdout();
    // L31-32: if#0 true (status === 'skipped') -> circle glyph + skipped note.
    expect(text).toContain('○');
    expect(text).toContain('agent-sync');
    expect(text).toContain('already done, skipped');
    // ...and the created-step check mark must not be present.
    expect(text).not.toContain('✓');
  });

  it('renders mixed created and skipped steps distinctly in order', () => {
    const { stdout } = captureStreams();
    formatQuickstartOutput(
      baseResult({
        steps: [
          { name: 'init', status: 'created' },
          { name: 'agent-sync', status: 'skipped' },
        ],
      }),
      'normal',
    );
    const text = stdout();
    // Both L31 sides exercised in a single call: created uses ✓, skipped uses ○.
    expect(text).toContain('✓');
    expect(text).toContain('○');
    const initIdx = text.indexOf('init');
    const syncIdx = text.indexOf('agent-sync');
    // Steps preserve execution order.
    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(syncIdx).toBeGreaterThan(initIdx);
  });

  it('prints agent-sync hints with the info glyph', () => {
    const { stdout } = captureStreams();
    formatQuickstartOutput(
      baseResult({
        agentSync: {
          agents: [],
          totalFiles: 0,
          warnings: [],
          hints: ['populate skill_triggers for zh-TW', 'second hint'],
        },
      }),
      'normal',
    );
    const text = stdout();
    // L39-41: each hint is emitted with the cyan info glyph.
    expect(text).toContain('ℹ');
    expect(text).toContain('populate skill_triggers for zh-TW');
    expect(text).toContain('second hint');
  });

  it('omits hint lines and the info glyph when there are no hints', () => {
    const { stdout } = captureStreams();
    formatQuickstartOutput(
      baseResult({
        agentSync: { agents: [], totalFiles: 0, warnings: [], hints: [] },
        steps: [{ name: 'init', status: 'created' }],
      }),
      'normal',
    );
    const text = stdout();
    // L39 loop body never runs: no info glyph in the output.
    expect(text).not.toContain('ℹ');
    // The next-step hand-off is still present.
    expect(text).toContain('Scaffold ready');
  });

  it('handles an empty result (no steps, no hints, no warnings) by still printing only the hand-off', () => {
    const { stderrSpy, stdout } = captureStreams();
    formatQuickstartOutput(baseResult(), 'verbose');
    const text = stdout();
    // No step glyphs and no hint glyph for a fully-empty result.
    expect(text).not.toContain('✓');
    expect(text).not.toContain('○');
    expect(text).not.toContain('ℹ');
    // Only the next-step section remains.
    expect(text).toContain('Scaffold ready');
    // No warnings -> stderr untouched.
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
