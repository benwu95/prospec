import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatChangePlanOutput } from '../../../src/cli/formatters/change-plan-output.js';
import type { ChangePlanResult } from '../../../src/services/change-plan.service.js';

function makeResult(overrides: Partial<ChangePlanResult> = {}): ChangePlanResult {
  return {
    changeName: 'add-login',
    changeDir: '.prospec/changes/add-login',
    createdFiles: ['.prospec/changes/add-login/plan.md'],
    relatedModules: [],
    ...overrides,
  };
}

function captureStdout(): { calls: () => string } {
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  return {
    calls: () => spy.mock.calls.map((c) => String(c[0])).join(''),
  };
}

describe('formatChangePlanOutput', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes nothing when logLevel is quiet (L18 then-branch / early return)', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    formatChangePlanOutput(makeResult(), 'quiet');
    expect(spy).not.toHaveBeenCalled();
  });

  it('uses the default normal logLevel when omitted (L16 default-arg) and emits output', () => {
    const out = captureStdout();
    // Called with a single argument so the default parameter value is exercised.
    formatChangePlanOutput(makeResult());
    const text = out.calls();
    expect(text).not.toBe('');
    // The status line names the concrete target state it transitions to.
    expect(text).toMatch(/Updated metadata\.yaml status\s*→\s*plan/);
  });

  it('lists every created file with a checkmark prefix (L23-24 loop body)', () => {
    const out = captureStdout();
    formatChangePlanOutput(
      makeResult({
        createdFiles: ['a/plan.md', 'b/delta-spec.md'],
      }),
      'normal',
    );
    const text = out.calls();
    // Each created file is its own checkmark line: "✓ Created <file>".
    expect(text).toMatch(/✓\s*Created a\/plan\.md/);
    expect(text).toMatch(/✓\s*Created b\/delta-spec\.md/);
    // Two distinct files → two distinct Created lines.
    expect(text.match(/Created /g)?.length).toBe(2);
  });

  it('emits no Created lines when createdFiles is empty but still writes status + next steps', () => {
    const out = captureStdout();
    formatChangePlanOutput(makeResult({ createdFiles: [] }), 'normal');
    const text = out.calls();
    expect(text).not.toContain('Created ');
    expect(text).toContain('Updated metadata.yaml status');
    expect(text).toContain('Then run');
  });

  it('renders the Related modules block when relatedModules is non-empty (L31 then-branch)', () => {
    const out = captureStdout();
    formatChangePlanOutput(
      makeResult({ relatedModules: ['auth', 'session'] }),
      'normal',
    );
    const text = out.calls();
    expect(text).toContain('Related modules:');
    // Each module is rendered as its own indented bullet line, not merely
    // mentioned somewhere in the output (which the next-steps text could fake).
    expect(text).toMatch(/●\s*auth/);
    expect(text).toMatch(/●\s*session/);
    // The header precedes the bullets, and the modules render in input order.
    const headerIdx = text.indexOf('Related modules:');
    const authIdx = text.indexOf('auth');
    const sessionIdx = text.indexOf('session');
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(authIdx).toBeGreaterThan(headerIdx);
    expect(sessionIdx).toBeGreaterThan(authIdx);
  });

  it('omits the Related modules block when relatedModules is empty (L31 else-branch)', () => {
    const out = captureStdout();
    formatChangePlanOutput(makeResult({ relatedModules: [] }), 'normal');
    const text = out.calls();
    expect(text).not.toContain('Related modules:');
  });

  it('emits the three next-step suggestions wired to the change name', () => {
    const out = captureStdout();
    formatChangePlanOutput(
      makeResult({ changeName: 'my-change', relatedModules: [] }),
      'verbose',
    );
    const text = out.calls();
    expect(text).toContain('.prospec/changes/my-change/plan.md');
    expect(text).toContain('.prospec/changes/my-change/delta-spec.md');
    expect(text).toContain('prospec change tasks');
    expect(text).toContain('to generate the task list');
  });

  it('terminates the rendered block with a trailing newline (L51 join + newline)', () => {
    const out = captureStdout();
    formatChangePlanOutput(makeResult(), 'normal');
    const text = out.calls();
    expect(text.endsWith('\n')).toBe(true);
  });
});
