import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { registerChangeRelatedModulesCommand } from '../../../src/cli/commands/change-related-modules.js';
import { execute as executeRelated } from '../../../src/services/change-related-modules.service.js';
import { registerChangeCommand } from '../../../src/cli/commands/change-story.js';
import { execute as executeAcceptance } from '../../../src/services/change-acceptance.service.js';
import { execute as executeStory } from '../../../src/services/change-story.service.js';

vi.mock('../../../src/services/change-related-modules.service.js', () => ({ execute: vi.fn() }));
vi.mock('../../../src/cli/formatters/change-related-modules-output.js', () => ({ formatChangeRelatedModulesOutput: vi.fn() }));

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
    const program = new Command().exitOverride();
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


describe('explicit scope command inputs', () => {
  const programForScope = () => {
    const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
    registerChangeCommand(program);
    registerChangeRelatedModulesCommand(program);
    return program;
  };
  beforeEach(() => { vi.mocked(executeStory).mockReset(); vi.mocked(executeRelated).mockReset(); });
  it('refuses omitted creation scope before invoking the creator', async () => {
    await expect(programForScope().parseAsync(['node', 'prospec', 'change', 'story', 'scoped'])).rejects.toThrow(/related-module|scope/i);
    expect(executeStory).not.toHaveBeenCalled();
  });
  it('forwards a declared complete list', async () => {
    await programForScope().parseAsync(['node', 'prospec', 'change', 'story', 'scoped', '--related-module', 'lib', '--related-module', 'services']);
    expect(executeStory).toHaveBeenCalledWith(expect.objectContaining({ name: 'scoped', relatedModules: ['lib', 'services'] }));
  });
  it('forwards an explicit empty creation scope', async () => {
    await programForScope().parseAsync(['node', 'prospec', 'change', 'story', 'scoped', '--no-related-modules']);
    expect(executeStory).toHaveBeenCalledWith(expect.objectContaining({ relatedModules: [] }));
  });
  it.each([
    ['--related-module', 'lib', '--no-related-modules'],
    ['--no-related-modules', '--related-module', 'lib'],
  ])('refuses conflicting creation declarations %j', async (...flags) => {
    await expect(programForScope().parseAsync(['node', 'prospec', 'change', 'story', 'scoped', ...flags])).rejects.toThrow(/cannot|conflict/i);
    expect(executeStory).not.toHaveBeenCalled();
  });
  it.each(['--freeze-scenarios', '--amend-scenarios'])('rejects explicit empty in mutation mode %s', async mode => {
    await expect(programForScope().parseAsync(['node', 'prospec', 'change', 'story', 'scoped', mode, '--no-related-modules'])).rejects.toThrow(/create options/i);
    expect(executeStory).not.toHaveBeenCalled();
  });
  it('refuses correction with no declaration', async () => {
    await expect(programForScope().parseAsync(['node', 'prospec', 'change', 'related-modules', '--change', 'scoped'])).rejects.toThrow(/related-module|scope|module/i);
    expect(executeRelated).not.toHaveBeenCalled();
  });
  it('forwards complete correction and explicit empty through the existing service', async () => {
    await programForScope().parseAsync(['node', 'prospec', 'change', 'related-modules', 'lib', '--change', 'scoped']);
    expect(executeRelated).toHaveBeenLastCalledWith(expect.objectContaining({ change: 'scoped', modules: ['lib'] }));
    await programForScope().parseAsync(['node', 'prospec', 'change', 'related-modules', '--change', 'scoped', '--no-related-modules']);
    expect(executeRelated).toHaveBeenLastCalledWith(expect.objectContaining({ change: 'scoped', modules: [] }));
  });
  it('rejects correction mixing names and empty', async () => {
    await expect(programForScope().parseAsync(['node', 'prospec', 'change', 'related-modules', 'lib', '--change', 'scoped', '--no-related-modules'])).rejects.toThrow(/cannot|conflict/i);
    expect(executeRelated).not.toHaveBeenCalled();
  });
});
