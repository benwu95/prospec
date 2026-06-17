import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatChangeTasksOutput } from '../../../src/cli/formatters/change-tasks-output.js';
import type { ChangeTasksResult } from '../../../src/services/change-tasks.service.js';

function makeResult(overrides: Partial<ChangeTasksResult> = {}): ChangeTasksResult {
  return {
    changeName: 'add-login',
    changeDir: '/repo/.prospec/changes/add-login',
    createdFiles: ['.prospec/changes/add-login/tasks.md'],
    relatedModules: [],
    ...overrides,
  };
}

describe('formatChangeTasksOutput', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes nothing when logLevel is 'quiet'", () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    formatChangeTasksOutput(makeResult(), 'quiet');
    expect(write).not.toHaveBeenCalled();
  });

  it("renders output by default (logLevel defaults to 'normal' when omitted)", () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    formatChangeTasksOutput(makeResult());
    expect(write).toHaveBeenCalledTimes(1);
    const out = write.mock.calls.flat().join('');
    // Default path produces real content (distinguishes default-arg from quiet early-return)
    expect(out).toContain('Updated metadata.yaml status');
  });

  it("renders output when logLevel is explicitly 'normal'", () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    formatChangeTasksOutput(makeResult(), 'normal');
    const out = write.mock.calls.flat().join('');
    expect(out).toContain('Updated metadata.yaml status');
  });

  it('lists each created file with a "Created" line', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    formatChangeTasksOutput(
      makeResult({
        createdFiles: ['a/tasks.md', 'b/plan.md'],
      }),
    );
    const out = write.mock.calls.flat().join('');
    expect(out).toContain('Created a/tasks.md');
    expect(out).toContain('Created b/plan.md');
  });

  it('emits no "Created" line when createdFiles is empty but still emits status + next steps', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    formatChangeTasksOutput(makeResult({ createdFiles: [] }));
    const out = write.mock.calls.flat().join('');
    expect(out).not.toContain('Created');
    expect(out).toContain('Updated metadata.yaml status');
    expect(out).toContain('to refine the task breakdown');
  });

  it('always writes the status-update line whose transition target is the tasks status', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    // Use a changeName WITHOUT "tasks" so the only "tasks" token is the status target,
    // not the next-steps `.../tasks.md` path — proving the line maps to status `tasks`.
    formatChangeTasksOutput(makeResult({ changeName: 'add-login' }));
    const out = write.mock.calls.flat().join('');
    // ANSI is stripped so the assertion is color-agnostic; changeName has no "tasks" token,
    // so matching "tasks" after the arrow proves the status target (not the tasks.md path).
    const plain = out.replace(new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g"), "");
    expect(plain).toMatch(/Updated metadata\.yaml status\s*\u2192\s*tasks/);
  });

  it('renders the Related modules section with one bullet per module when present', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    formatChangeTasksOutput(
      makeResult({ relatedModules: ['auth', 'cli'] }),
    );
    const out = write.mock.calls.flat().join('');
    // Strip ANSI so the bullet assertions are color-agnostic (pc.green('●') wraps the
    // marker in color codes when colors are enabled).
    const plain = out.replace(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g'), '');
    expect(plain).toContain('Related modules:');
    // Pin the per-module line format: two-space indent + '●' marker + module name.
    expect(plain).toContain('  ● auth');
    expect(plain).toContain('  ● cli');
    // Exactly one bullet line per module — guards against comma-joining or duplicate bullets.
    expect((plain.match(/^ {2}● /gm) ?? []).length).toBe(2);
  });

  it('omits the Related modules section when relatedModules is empty', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    formatChangeTasksOutput(makeResult({ relatedModules: [] }));
    const out = write.mock.calls.flat().join('');
    expect(out).not.toContain('Related modules:');
  });

  it('embeds the changeName in the next-steps tasks.md path', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    formatChangeTasksOutput(makeResult({ changeName: 'fix-bug-42' }));
    const out = write.mock.calls.flat().join('');
    expect(out).toContain('.prospec/changes/fix-bug-42/tasks.md');
    expect(out).toContain('/prospec-implement');
  });

  it('terminates the written payload with a trailing newline', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    formatChangeTasksOutput(makeResult());
    const out = write.mock.calls.flat().join('') as string;
    expect(out.endsWith('\n')).toBe(true);
  });
});
