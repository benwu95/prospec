import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { registerChangeCommand } from '../../../src/cli/commands/change-story.js';
import { execute as executeAcceptance } from '../../../src/services/change-acceptance.service.js';
import { execute as executeStory } from '../../../src/services/change-story.service.js';

vi.mock('../../../src/services/change-acceptance.service.js', () => ({
  execute: vi.fn(),
}));

vi.mock('../../../src/services/change-story.service.js', () => ({
  execute: vi.fn(),
}));

vi.mock('../../../src/cli/formatters/change-story-output.js', () => ({
  formatChangeStoryOutput: vi.fn(),
  formatChangeAcceptanceOutput: vi.fn(),
}));

describe('change story command grammar and mutation delegation (REQ-SERVICES-114, REQ-TESTS-123)', () => {
  beforeEach(() => {
    vi.mocked(executeAcceptance).mockReset();
    vi.mocked(executeStory).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates --freeze-scenarios to change-acceptance service', async () => {
    const program = new Command();
    registerChangeCommand(program);
    vi.mocked(executeAcceptance).mockResolvedValue({
      changeName: 'my-change',
      mode: 'freeze',
      revision: 1,
      digest: 'abc123digest',
      origin: 'story',
      capturedStatus: 'story',
      scenariosCount: 2,
      noop: false,
    });

    await program.parseAsync(['node', 'prospec', 'change', 'story', 'my-change', '--freeze-scenarios']);

    expect(executeAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my-change',
        mode: 'freeze',
      }),
    );
    expect(executeStory).not.toHaveBeenCalled();
  });

  it('delegates --amend-scenarios with reason and expected digest to change-acceptance service', async () => {
    const program = new Command();
    registerChangeCommand(program);
    vi.mocked(executeAcceptance).mockResolvedValue({
      changeName: 'my-change',
      mode: 'amend',
      revision: 2,
      digest: 'newdigest',
      origin: 'story',
      capturedStatus: 'story',
      scenariosCount: 3,
      noop: false,
    });

    await program.parseAsync([
      'node',
      'prospec',
      'change',
      'story',
      'my-change',
      '--amend-scenarios',
      '--reason',
      'clarified edge case',
      '--expected-digest',
      'olddigest',
    ]);

    expect(executeAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my-change',
        mode: 'amend',
        reason: 'clarified edge case',
        expectedDigest: 'olddigest',
      }),
    );
    expect(executeStory).not.toHaveBeenCalled();
  });

  it('refuses when both --freeze-scenarios and --amend-scenarios are supplied', async () => {
    const program = new Command();
    registerChangeCommand(program);

    await expect(
      program.parseAsync([
        'node',
        'prospec',
        'change',
        'story',
        'my-change',
        '--freeze-scenarios',
        '--amend-scenarios',
        '--reason',
        'r',
        '--expected-digest',
        'd',
      ]),
    ).rejects.toThrow(/both --freeze-scenarios and --amend-scenarios/i);
  });

  it('refuses when --freeze-scenarios is combined with create-only options', async () => {
    const program = new Command();
    registerChangeCommand(program);

    await expect(
      program.parseAsync([
        'node',
        'prospec',
        'change',
        'story',
        'my-change',
        '--freeze-scenarios',
        '--description',
        'some desc',
      ]),
    ).rejects.toThrow(/cannot be combined with create options/i);
  });

  it('refuses when --amend-scenarios is missing --reason', async () => {
    const program = new Command();
    registerChangeCommand(program);

    await expect(
      program.parseAsync([
        'node',
        'prospec',
        'change',
        'story',
        'my-change',
        '--amend-scenarios',
        '--expected-digest',
        'olddigest',
      ]),
    ).rejects.toThrow(/--amend-scenarios requires --reason/i);
  });

  it('refuses when --amend-scenarios is missing --expected-digest', async () => {
    const program = new Command();
    registerChangeCommand(program);

    await expect(
      program.parseAsync([
        'node',
        'prospec',
        'change',
        'story',
        'my-change',
        '--amend-scenarios',
        '--reason',
        'some reason',
      ]),
    ).rejects.toThrow(/--amend-scenarios requires --expected-digest/i);
  });
});
