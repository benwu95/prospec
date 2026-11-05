import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatConfigDiagnostics } from '../../../src/cli/formatters/config-diagnostics-output.js';

afterEach(() => vi.restoreAllMocks());

describe('config diagnostic output', () => {
  it('prints schema paths, same-object suggestions and one remedy on stderr without changing the exit code', () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const before = process.exitCode;
    formatConfigDiagnostics([
      { path: ['project', 'naem'], suggestion: 'name' },
      { path: ['extension'] },
    ]);
    expect(err.mock.calls.map(([chunk]) => String(chunk)).join('')).toBe(
      '⚠ Unknown config field project.naem (not declared in Prospec schema). Did you mean project.name?\n' +
      '⚠ Unknown config field extension (not declared in Prospec schema).\n' +
      '  → Rename or remove these fields in .prospec.yaml; prospec upgrade also removes unknown nested fields.\n',
    );
    expect(out).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(before);
  });

  it('sanitizes all file-derived path and suggestion segments', () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    formatConfigDiagnostics([{ path: ['project\u0007', 'naem\u001b'], suggestion: 'name\u0007' }]);
    const text = err.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(text).toContain('project.naem');
    expect(text).toContain('project.name');
    expect(text).not.toContain('\u0007');
    expect(text).not.toContain('\u001b');
  });

  it('writes nothing for an empty diagnostic list', () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    formatConfigDiagnostics([]);
    expect(err).not.toHaveBeenCalled();
  });
});
