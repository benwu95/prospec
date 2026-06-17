import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatChangeStoryOutput } from '../../../src/cli/formatters/change-story-output.js';
import type { ChangeStoryResult } from '../../../src/services/change-story.service.js';

function makeResult(overrides: Partial<ChangeStoryResult> = {}): ChangeStoryResult {
  return {
    changeName: 'add-login',
    changeDir: '/repo/.prospec/changes/add-login',
    createdFiles: [
      '.prospec/changes/add-login/proposal.md',
      '.prospec/changes/add-login/metadata.yaml',
    ],
    relatedModules: [],
    ...overrides,
  };
}

function captureStdout(): { calls: () => string; restore: () => void } {
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  return {
    calls: () => spy.mock.calls.map((c) => String(c[0])).join(''),
    restore: () => spy.mockRestore(),
  };
}

describe('formatChangeStoryOutput', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns silently and writes nothing when logLevel is quiet', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    formatChangeStoryOutput(makeResult(), 'quiet');
    expect(spy).not.toHaveBeenCalled();
  });

  it('writes output when logLevel defaults to normal (default-arg branch)', () => {
    const out = captureStdout();
    // Called with no logLevel → exercises the L15 default arg = 'normal'
    formatChangeStoryOutput(makeResult());
    expect(out.calls()).toContain('Created');
    out.restore();
  });

  it('lists every created file with a Created prefix', () => {
    const out = captureStdout();
    formatChangeStoryOutput(
      makeResult({
        createdFiles: ['a/proposal.md', 'a/metadata.yaml'],
      }),
      'normal',
    );
    const text = out.calls();
    expect(text).toContain('Created a/proposal.md');
    expect(text).toContain('Created a/metadata.yaml');
    out.restore();
  });

  it('emits no Created lines when createdFiles is empty but still prints next steps', () => {
    const out = captureStdout();
    formatChangeStoryOutput(makeResult({ createdFiles: [] }), 'normal');
    const text = out.calls();
    expect(text).not.toContain('Created');
    expect(text).toContain('to generate the implementation plan');
    out.restore();
  });

  it('renders a Description line when description is provided (L27 then)', () => {
    const out = captureStdout();
    formatChangeStoryOutput(
      makeResult({ description: 'Implement OAuth login flow' }),
      'normal',
    );
    const text = out.calls();
    expect(text).toContain('Description:');
    expect(text).toContain('Implement OAuth login flow');
    out.restore();
  });

  it('omits the Description line when description is absent (L27 else)', () => {
    const out = captureStdout();
    formatChangeStoryOutput(makeResult({ description: undefined }), 'normal');
    expect(out.calls()).not.toContain('Description:');
    out.restore();
  });

  it('omits the Description line when description is an empty string (falsy branch)', () => {
    const out = captureStdout();
    formatChangeStoryOutput(makeResult({ description: '' }), 'normal');
    expect(out.calls()).not.toContain('Description:');
    out.restore();
  });

  it('renders a Related modules section listing each module name and description (L33 then)', () => {
    const out = captureStdout();
    formatChangeStoryOutput(
      makeResult({
        relatedModules: [
          { name: 'auth', description: 'authentication module' },
          { name: 'session', description: 'session handling' },
        ],
      }),
      'normal',
    );
    const text = out.calls();
    expect(text).toContain('Related modules:');
    expect(text).toContain('auth');
    expect(text).toContain('authentication module');
    expect(text).toContain('session');
    expect(text).toContain('session handling');
    out.restore();
  });

  it('omits the Related modules section when relatedModules is empty (L33 else)', () => {
    const out = captureStdout();
    formatChangeStoryOutput(makeResult({ relatedModules: [] }), 'normal');
    expect(out.calls()).not.toContain('Related modules:');
    out.restore();
  });

  it('always prints both next-step hints referencing the proposal path and plan command', () => {
    const out = captureStdout();
    formatChangeStoryOutput(makeResult({ changeName: 'my-change' }), 'normal');
    const text = out.calls();
    expect(text).toContain('.prospec/changes/my-change/proposal.md');
    expect(text).toContain('to fill in your User Story');
    expect(text).toContain('prospec change plan');
    expect(text).toContain('to generate the implementation plan');
    out.restore();
  });

  it('terminates the written output with a trailing newline', () => {
    const out = captureStdout();
    formatChangeStoryOutput(makeResult(), 'normal');
    expect(out.calls().endsWith('\n')).toBe(true);
    out.restore();
  });

  it('renders Description before Related modules when both are present', () => {
    const out = captureStdout();
    formatChangeStoryOutput(
      makeResult({
        description: 'desc-marker',
        relatedModules: [{ name: 'mod-marker', description: 'm' }],
      }),
      'normal',
    );
    const text = out.calls();
    expect(text.indexOf('desc-marker')).toBeLessThan(text.indexOf('mod-marker'));
    out.restore();
  });
});
