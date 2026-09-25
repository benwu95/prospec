/**
 * Contract tests for CLI output format.
 *
 * Verifies that CLI commands produce output that matches
 * the contracts/cli-commands.md specification.
 *
 * Uses Commander.js exitOverride to capture output without process.exit().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProgram } from '../../src/cli/program.js';
import { VALID_AGENTS } from '../../src/types/config.js';
import type { Command } from 'commander';
import {
  HELP_ENRICHED_COMMANDS,
  HELP_SECTION_LABELS,
  COMMAND_HELP_SPECS,
} from '../../src/types/cli-help.js';

// Capture stdout/stderr
let stdoutOutput: string[] = [];
let stderrOutput: string[] = [];
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutOutput = [];
  stderrOutput = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdoutOutput.push(String(chunk));
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stderrOutput.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe('CLI Output Contract', () => {
  describe('prospec --version', () => {
    it('should output version number', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', '--version']);
      } catch (err) {
        // exitOverride throws on --version with exitCode 0
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      // Version should be a semver-like string
      expect(output.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('prospec --help', () => {
    it('should output the root usage line and program description', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      expect(output).toMatch(/Usage: prospec \[options\] \[command\]/);
      expect(output).toContain('Progressive Spec-Driven Development CLI');
    });

    it('should list available commands', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      expect(output).toContain('init');
      expect(output).toContain('knowledge');
      expect(output).toContain('agent');
      expect(output).toContain('change');
    });

    it('should show global options', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      expect(output).toContain('--verbose');
      expect(output).toContain('--quiet');
      expect(output).toContain('--version');
    });
  });

  describe('prospec init --help', () => {
    it('should show init-specific options', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', 'init', '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      expect(output).toContain('--name');
      expect(output).toContain('--agents');
    });
  });

  describe('prospec change --help', () => {
    it('should show change subcommands', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', 'change', '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      expect(output).toContain('story');
    });
  });

  describe('prospec change story --help', () => {
    it('should require name argument', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', 'change', 'story', '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      expect(output).toContain('<name>');
    });

    it('should show --description option', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', 'change', 'story', '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      expect(output).toContain('--description');
    });
  });

  describe('prospec change plan --help', () => {
    it('should show --change option', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', 'change', 'plan', '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      expect(output).toContain('--change');
    });
  });

  describe('prospec change tasks --help', () => {
    it('should show --change option', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', 'change', 'tasks', '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      expect(output).toContain('--change');
    });
  });

  describe('prospec agent --help', () => {
    it('should show agent subcommands', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', 'agent', '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      expect(output).toContain('sync');
    });
  });

  describe('prospec agent sync --help', () => {
    it('should show --cli option', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', 'agent', 'sync', '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      expect(output).toContain('--cli');
    });

    it('should list the supported CLIs from VALID_AGENTS', async () => {
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', 'agent', 'sync', '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      const output = stdoutOutput.join('');
      for (const agent of VALID_AGENTS) {
        expect(output).toContain(agent);
      }
      expect(output).toContain('antigravity');
      expect(output).not.toContain('gemini');
    });
  });

  describe('registry-driven enriched help (REQ-CLI-054 / REQ-TESTS-118)', () => {
    const LABELS = [
      HELP_SECTION_LABELS.whenToUse,
      HELP_SECTION_LABELS.example,
      HELP_SECTION_LABELS.returns,
    ];

    async function helpOf(commandPath: string): Promise<string> {
      stdoutOutput = [];
      const program = createProgram();
      try {
        await program.parseAsync(['node', 'prospec', ...commandPath.split(' '), '--help']);
      } catch (err) {
        if ((err as { exitCode?: number }).exitCode !== 0) throw err;
      }
      return stdoutOutput.join('');
    }

    /** Every leaf command path the program registers (`change log`, `status`, …). */
    function leafCommandPaths(cmd: Command, prefix: string[] = []): string[] {
      const own = cmd.commands.filter((c) => c.name() !== 'help');
      if (own.length === 0) return [prefix.join(' ')];
      return own.flatMap((c) => leafCommandPaths(c, [...prefix, c.name()]));
    }

    it('the three section labels are the literal strings the contract names', () => {
      // asserted as literals so the test is not a tautology over the constant
      expect(LABELS).toEqual(['When to use:', 'Example:', 'Returns:']);
    });

    for (const commandPath of HELP_ENRICHED_COMMANDS) {
      it(`prospec ${commandPath} --help carries the three sections and its registry example verbatim`, async () => {
        const output = await helpOf(commandPath);
        for (const label of ['When to use:', 'Example:', 'Returns:']) {
          expect(output, `${commandPath}: missing ${label}`).toContain(label);
        }
        const spec = COMMAND_HELP_SPECS[commandPath];
        for (const example of [spec.example, ...(spec.additionalExamples ?? [])]) {
          expect(output).toContain(`$ ${example}`);
          expect(example.startsWith(`prospec ${commandPath}`), `${commandPath}: example must be a complete command line`).toBe(true);
        }
        // sections appear in order after the Options block
        const order = ['When to use:', 'Example:', 'Returns:'].map((l) => output.indexOf(l));
        expect(order[0]).toBeGreaterThan(output.indexOf('Options:'));
        expect(order[0]).toBeLessThan(order[1]!);
        expect(order[1]).toBeLessThan(order[2]!);
      });
    }

    it('status help names the session start and the action: line; change log claims YAML-scalar escaping, never table escaping', async () => {
      const status = await helpOf('status');
      expect(status).toMatch(/first command of a session|start of a session|session start/i);
      expect(status).toContain('action:');
      // The help describes the same lines the formatter prints: `action:` names a
      // skill identity to invoke, and the skill FILE lives on a separate `fallback:`.
      expect(status).toMatch(/action:[^.]*invoke/i);
      expect(status).toContain('fallback:');
      // The condition the formatter actually applies: a resolved agent path, never the host.
      expect(status).toMatch(/fallback:[^.]*configures an agent/i);
      expect(status).not.toMatch(/action:` line naming the skill file/i);
      const changeLog = await helpOf('change log');
      expect(changeLog).toMatch(/YAML/);
      expect(changeLog).not.toContain('\\|');
      for (const writer of ['review merge', 'learn upsert'] as const) {
        const out = await helpOf(writer);
        expect(out, writer).toContain('\\|');
        expect(out, writer).toMatch(/identity/i);
      }
    });

    it('status help names the pause override and the halt codes; change log help names the human sign-off (REQ-CLI-056)', async () => {
      const status = await helpOf('status');
      expect(status).toContain('PROSPEC_PAUSE_AT');
      expect(status).toContain('AWAITING_HUMAN_PLAN_SIGNOFF');
      expect(status).toMatch(/fallback:[^.]*absent when `next` is null/i);
      const changeLog = await helpOf('change log');
      expect(changeLog).toContain('--signoff <option>');
      expect(changeLog).toMatch(/explicit human instruction/);
      expect(changeLog).toMatch(/recommended_option/);
      // the Example block itself carries a runnable sign-off, not only the prose
      const example = changeLog.slice(changeLog.indexOf('Example:'), changeLog.indexOf('Returns:'));
      expect(example).toMatch(/\$ prospec change log --skill prospec-plan --signoff option-a/);
    });

    it('registry ↔ program: every registry key is a registered leaf command, and every command whose help carries the three sections is a registry key (bidirectional)', async () => {
      const program = createProgram();
      const leaves = new Set(leafCommandPaths(program));
      for (const commandPath of HELP_ENRICHED_COMMANDS) {
        expect(leaves.has(commandPath), `registry key not registered: ${commandPath}`).toBe(true);
      }
      const enriched: string[] = [];
      for (const leaf of leaves) {
        if (leaf === '') continue;
        const output = await helpOf(leaf);
        if (['When to use:', 'Example:', 'Returns:'].every((l) => output.includes(l))) enriched.push(leaf);
      }
      expect(enriched.sort()).toEqual([...HELP_ENRICHED_COMMANDS].sort());
    });
  });

  describe('unknown command', () => {
    it('should exit with code 1 for unknown commands', async () => {
      const program = createProgram();
      await expect(
        program.parseAsync(['node', 'prospec', 'nonexistent']),
      ).rejects.toMatchObject({ exitCode: 1, code: 'commander.unknownCommand' });
    });
  });
});
