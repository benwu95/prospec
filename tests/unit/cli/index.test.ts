import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { vol } from 'memfs';
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { ConfigNotFound } from '../../../src/types/errors.js';

// Resolve the real version the same way src/cli/index.ts does, so the test
// pins the actual package.json wiring (catches a misrouted/stale value)
// rather than merely a semver-shaped string.
const pkg = createRequire(import.meta.url)('../../../package.json') as {
  version: string;
};

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

// Mock every command-registration module with a minimal command that has a
// no-op action. This keeps createProgram()'s preAction hook intact (it is
// defined in index.ts itself) while preventing real services from firing.
vi.mock('../../../src/cli/commands/init.js', () => ({
  registerInitCommand: (program: Command) =>
    program.command('init').action(() => undefined),
}));
vi.mock('../../../src/cli/commands/quickstart.js', () => ({
  registerQuickstartCommand: (program: Command) =>
    program.command('quickstart').action(() => undefined),
}));
vi.mock('../../../src/cli/commands/knowledge-generate.js', () => ({
  registerKnowledgeCommand: (program: Command) => {
    const knowledge = program.command('knowledge');
    knowledge.action(() => undefined);
    return knowledge;
  },
}));
vi.mock('../../../src/cli/commands/knowledge-init.js', () => ({
  registerKnowledgeInitCommand: (knowledge: Command) =>
    knowledge.command('init').action(() => undefined),
}));
vi.mock('../../../src/cli/commands/agent-sync.js', () => ({
  registerAgentCommand: (program: Command) =>
    program.command('agent').action(() => undefined),
}));
vi.mock('../../../src/cli/commands/change-story.js', () => ({
  registerChangeCommand: (program: Command) =>
    program.command('change').action(() => undefined),
}));
vi.mock('../../../src/cli/commands/change-plan.js', () => ({
  registerChangePlanCommand: (program: Command) =>
    program.command('plan').action(() => undefined),
}));
vi.mock('../../../src/cli/commands/change-tasks.js', () => ({
  registerChangeTasksCommand: (program: Command) =>
    program.command('tasks').action(() => undefined),
}));
vi.mock('../../../src/cli/commands/measure.js', () => ({
  registerMeasureCommand: (program: Command) =>
    program.command('measure').action(() => undefined),
}));
vi.mock('../../../src/cli/commands/check.js', () => ({
  registerCheckCommand: (program: Command) =>
    program.command('check').action(() => undefined),
}));
vi.mock('../../../src/cli/commands/mcp.js', () => ({
  registerMcpCommand: (program: Command) => {
    const mcp = program.command('mcp');
    mcp
      .command('serve')
      .option('--cwd <path>', 'project root')
      .action(() => undefined);
  },
}));

const handleErrorMock = vi.fn();
vi.mock('../../../src/cli/formatters/error-output.js', () => ({
  handleError: (...args: unknown[]) => handleErrorMock(...args),
}));

import { createProgram } from '../../../src/cli/index.js';

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/**
 * Build a fresh program with exitOverride already set (createProgram sets it),
 * and silence commander's own output so parse errors do not pollute the test
 * stream.
 */
function freshProgram(): Command {
  const program = createProgram();
  program.configureOutput({
    writeOut: () => undefined,
    writeErr: () => undefined,
  });
  return program;
}

describe('createProgram', () => {
  it('configures the program name and version from package.json', () => {
    const program = createProgram();
    expect(program.name()).toBe('prospec');
    // version must equal the real package.json field, proving the require
    // wiring (a stale literal or wrong field would still be semver-ish).
    expect(program.version()).toBe(pkg.version);
  });

  it('registers all top-level subcommands', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name()).sort();
    expect(names).toEqual(
      [
        'agent',
        'change',
        'check',
        'init',
        'knowledge',
        'mcp',
        'measure',
        'plan',
        'quickstart',
        'tasks',
        'upgrade',
      ].sort(),
    );
  });
});

describe('preAction config guard', () => {
  // L64 if#0: an init command short-circuits the guard (no .prospec.yaml read).
  it('skips the .prospec.yaml check for INIT_COMMANDS (init)', async () => {
    // No .prospec.yaml seeded — if the guard ran it would throw.
    const program = freshProgram();
    await expect(
      program.parseAsync(['node', 'prospec', 'init']),
    ).resolves.toBeDefined();
  });

  it('skips the check for the quickstart init command', async () => {
    const program = freshProgram();
    await expect(
      program.parseAsync(['node', 'prospec', 'quickstart']),
    ).resolves.toBeDefined();
  });

  // L64 if#1 (continue loop) + L69 if#1 (cmdName !== 'prospec') + L81 if#0
  // (existsSync false) -> throws ConfigNotFound with the default message.
  it('throws ConfigNotFound when .prospec.yaml is missing for a non-init command', async () => {
    const program = freshProgram();
    await expect(
      program.parseAsync(['node', 'prospec', 'check']),
    ).rejects.toBeInstanceOf(ConfigNotFound);
  });

  it('the thrown ConfigNotFound carries the no-path default message and code', async () => {
    const program = freshProgram();
    await program
      .parseAsync(['node', 'prospec', 'check'])
      .then(
        () => {
          throw new Error('expected guard to throw');
        },
        (err: unknown) => {
          expect(err).toBeInstanceOf(ConfigNotFound);
          const e = err as ConfigNotFound;
          expect(e.code).toBe('CONFIG_NOT_FOUND');
          expect(e.message).toBe('Config file .prospec.yaml not found');
        },
      );
  });

  // L81 if#1: .prospec.yaml present -> guard passes, action runs.
  it('passes the guard when .prospec.yaml exists in cwd', async () => {
    vol.fromJSON({ '.prospec.yaml': 'version: 1\n' }, process.cwd());
    const program = freshProgram();
    await expect(
      program.parseAsync(['node', 'prospec', 'check']),
    ).resolves.toBeDefined();
  });

  // L75 if#0 + L77 if#0: targetCwd defined, configPath missing -> throws
  // ConfigNotFound carrying the resolved path.
  it('throws ConfigNotFound with the resolved --cwd path when target .prospec.yaml is missing', async () => {
    const program = freshProgram();
    await program
      .parseAsync(['node', 'prospec', 'mcp', 'serve', '--cwd', '/other/proj'])
      .then(
        () => {
          throw new Error('expected guard to throw');
        },
        (err: unknown) => {
          expect(err).toBeInstanceOf(ConfigNotFound);
          // path-derived message proves the targetCwd branch (L74-77) ran.
          expect((err as ConfigNotFound).message).toContain(
            '/other/proj/.prospec.yaml',
          );
        },
      );
  });

  // L75 if#1 + L77 if#1 (existsSync true) + L78 return: targetCwd defined and
  // config present -> guard passes WITHOUT touching cwd's .prospec.yaml.
  it('passes the guard using --cwd target without requiring cwd .prospec.yaml', async () => {
    vol.fromJSON({ '/other/proj/.prospec.yaml': 'version: 1\n' }, '/');
    // deliberately no .prospec.yaml in process.cwd()
    const program = freshProgram();
    await expect(
      program.parseAsync([
        'node',
        'prospec',
        'mcp',
        'serve',
        '--cwd',
        '/other/proj',
      ]),
    ).resolves.toBeDefined();
  });

  // L64 if#0 via ancestor walk: `knowledge init` -> actionCommand is `init`
  // which IS in INIT_COMMANDS, so the guard returns even though `knowledge`
  // is not an init command. Proves the ancestor-walk short circuit on the
  // actionCommand's own name.
  it('skips the check for a nested init subcommand (knowledge init)', async () => {
    const program = freshProgram();
    await expect(
      program.parseAsync(['node', 'prospec', 'knowledge', 'init']),
    ).resolves.toBeDefined();
  });
});

describe('main entry point (error dispatch on parseAsync)', () => {
  let exitCodeBefore: typeof process.exitCode;

  beforeEach(() => {
    exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
    vi.resetModules();
  });

  /**
   * Re-import index.ts so its top-level main() runs against a controlled argv.
   * resetModules() ensures a fresh module instance each time; the vi.mock
   * factories above still apply because they are hoisted per-file.
   */
  async function runMain(argv: string[]): Promise<void> {
    vi.stubGlobal('process', Object.assign(process, { argv }));
    vi.resetModules();
    await import('../../../src/cli/index.js');
    // give the floating main() promise a tick to settle
    await new Promise((resolve) => setImmediate(resolve));
  }

  // L113 if#0 + L118 return: --version makes commander throw a CommanderError
  // with exitCode 0 -> main swallows it, never calling handleError, never
  // setting exitCode to 1.
  it('swallows a clean exit (--version) without calling handleError', async () => {
    await runMain(['node', 'prospec', '--version']);
    expect(handleErrorMock).not.toHaveBeenCalled();
    // The L113-118 swallow branch returns WITHOUT touching exitCode, so it
    // stays undefined — distinct from the commander-error branch (L128) which
    // sets it to exactly 1. `not.toBe(1)` would also pass for the error branch
    // mid-execution, so assert the exact untouched value.
    expect(process.exitCode).toBeUndefined();
  });

  it('swallows a clean exit (--help) without calling handleError', async () => {
    await runMain(['node', 'prospec', '--help']);
    expect(handleErrorMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  // L122 if#0 (true side): a commander parse error (unknown command) has a
  // code starting with 'commander.' and exitCode 1 -> main sets exitCode 1 and
  // returns WITHOUT calling handleError.
  it('sets exitCode 1 for a commander parse error without calling handleError', async () => {
    await runMain(['node', 'prospec', 'does-not-exist']);
    expect(handleErrorMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  // L122 if#1 (false side) + L132-133 + L133 binary-expr: a non-commander error
  // (ConfigNotFound from the preAction guard) flows through to handleError.
  // verbose is undefined here -> `opts.verbose ?? false` resolves to false.
  it('dispatches a guard ConfigNotFound to handleError with verbose=false by default', async () => {
    vol.reset();
    await runMain(['node', 'prospec', 'check']);
    expect(handleErrorMock).toHaveBeenCalledTimes(1);
    const [err, verbose] = handleErrorMock.mock.calls[0]!;
    // resetModules() gives the re-imported entry point a fresh errors.js
    // realm, so identity-based instanceof would compare across module
    // instances. Assert the machine-readable code instead — it still proves
    // the guard's ConfigNotFound (not a commander error) reached handleError.
    expect((err as ConfigNotFound).code).toBe('CONFIG_NOT_FOUND');
    expect(verbose).toBe(false);
  });

  // L133 binary-expr#0 (verbose provided): --verbose flips `opts.verbose ?? false`
  // to its left-hand truthy value.
  it('forwards verbose=true to handleError when --verbose is set', async () => {
    vol.reset();
    await runMain(['node', 'prospec', '--verbose', 'check']);
    expect(handleErrorMock).toHaveBeenCalledTimes(1);
    const [err, verbose] = handleErrorMock.mock.calls[0]!;
    expect((err as ConfigNotFound).code).toBe('CONFIG_NOT_FOUND');
    expect(verbose).toBe(true);
  });
});
