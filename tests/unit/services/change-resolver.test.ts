import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { resolveChange } from '../../../src/services/change-resolver.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import { select } from '@inquirer/prompts';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('@inquirer/prompts', () => ({ select: vi.fn() }));

beforeEach(() => {
  vol.reset();
  vi.mocked(select).mockReset();
});

describe('resolveChange', () => {
  it('returns the explicit change when its directory exists', async () => {
    vol.fromJSON({ '/p/.prospec/changes/add-auth/proposal.md': '' });
    await expect(resolveChange('/p', 'add-auth', false, 'pick')).resolves.toBe('add-auth');
    expect(vi.mocked(select)).not.toHaveBeenCalled();
  });

  it('throws PrerequisiteError when the explicit change is missing', async () => {
    vol.fromJSON({ '/p/.prospec/changes/other/proposal.md': '' });
    await expect(resolveChange('/p', 'nope', false, 'pick')).rejects.toThrow(PrerequisiteError);
  });

  it('throws when the changes directory does not exist', async () => {
    vol.fromJSON({ '/p/.prospec.yaml': 'x: 1\n' });
    await expect(resolveChange('/p', undefined, false, 'pick')).rejects.toThrow(PrerequisiteError);
  });

  it('throws when there are zero change directories', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/p/.prospec/changes', { recursive: true });
    await expect(resolveChange('/p', undefined, false, 'pick')).rejects.toThrow(PrerequisiteError);
  });

  it('auto-selects the single change without prompting', async () => {
    vol.fromJSON({ '/p/.prospec/changes/only-one/proposal.md': '' });
    await expect(resolveChange('/p', undefined, false, 'pick')).resolves.toBe('only-one');
    expect(vi.mocked(select)).not.toHaveBeenCalled();
  });

  it('throws in quiet mode with multiple changes, listing the names', async () => {
    vol.fromJSON({
      '/p/.prospec/changes/alpha/proposal.md': '',
      '/p/.prospec/changes/beta/proposal.md': '',
    });
    await expect(resolveChange('/p', undefined, true, 'pick')).rejects.toThrow(/alpha.*beta|beta.*alpha/);
    expect(vi.mocked(select)).not.toHaveBeenCalled();
  });

  it('prompts via select() with multiple changes when not quiet', async () => {
    vol.fromJSON({
      '/p/.prospec/changes/alpha/proposal.md': '',
      '/p/.prospec/changes/beta/proposal.md': '',
    });
    vi.mocked(select).mockResolvedValue('beta');
    await expect(resolveChange('/p', undefined, false, 'pick')).resolves.toBe('beta');
    expect(vi.mocked(select)).toHaveBeenCalledTimes(1);
  });

  it('ignores non-directory entries under the changes dir', async () => {
    vol.fromJSON({
      '/p/.prospec/changes/real-change/proposal.md': '',
      '/p/.prospec/changes/stray-file.txt': 'not a change',
    });
    // only the directory counts, so it auto-selects rather than treating the
    // stray file as a second change (which would force a prompt)
    await expect(resolveChange('/p', undefined, false, 'pick')).resolves.toBe('real-change');
    expect(vi.mocked(select)).not.toHaveBeenCalled();
  });
});
