import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatAgentSyncOutput } from '../../../src/cli/formatters/agent-sync-output.js';
import type { AgentSyncFullResult } from '../../../src/services/agent-sync.service.js';
import type { AgentSyncResult } from '../../../src/types/skill.js';

function makeAgent(over: Partial<AgentSyncResult> = {}): AgentSyncResult {
  return {
    agent: 'claude',
    configFile: 'CLAUDE.md',
    skillFiles: [],
    referenceFiles: [],
    removedSkills: [],
    ...over,
  };
}

function makeResult(over: Partial<AgentSyncFullResult> = {}): AgentSyncFullResult {
  return {
    agents: [],
    totalFiles: 0,
    warnings: [],
    hints: [],
    ...over,
  };
}

function spyStreams() {
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  return {
    out,
    err,
    stdout: () => out.mock.calls.map((c) => String(c[0])).join(''),
    stderr: () => err.mock.calls.map((c) => String(c[0])).join(''),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('formatAgentSyncOutput', () => {
  describe('warnings (always emitted on stderr)', () => {
    it('writes each warning to stderr with a marker, even in quiet mode', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({ warnings: ['unknown skill foo', 'unknown skill bar'] }),
        'quiet',
      );

      const stderr = s.stderr();
      expect(stderr).toContain('unknown skill foo');
      expect(stderr).toContain('unknown skill bar');
      expect(stderr).toContain('⚠');
    });

    it('emits no warnings when warnings array is empty', () => {
      const s = spyStreams();
      formatAgentSyncOutput(makeResult({ warnings: [] }), 'normal');
      expect(s.err).not.toHaveBeenCalled();
    });

    it('emits warnings on stderr AND the body on stdout in normal mode (streams are independent)', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({ warnings: ['w1'], agents: [makeAgent()], totalFiles: 1 }),
        'normal',
      );
      // Warning goes to stderr; the summary body goes to stdout — not mixed.
      expect(s.stderr()).toContain('w1');
      expect(s.stdout()).not.toContain('w1');
      expect(s.stdout()).toMatch(/Synced .*1.* agent,/);
    });
  });

  describe('quiet log level (L25 if#0)', () => {
    it('returns before writing any stdout summary', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({ agents: [makeAgent()], totalFiles: 3 }),
        'quiet',
      );
      // Quiet still flushes warnings to stderr, but nothing to stdout.
      expect(s.out).not.toHaveBeenCalled();
    });

    it('writes warnings to stderr but skips the stdout body in quiet mode', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({ warnings: ['w1'], agents: [makeAgent()], totalFiles: 1 }),
        'quiet',
      );
      expect(s.stderr()).toContain('w1');
      expect(s.out).not.toHaveBeenCalled();
    });
  });

  describe('summary line pluralization (L32 cond-expr)', () => {
    it('uses singular "agent" when exactly one agent (cond#1)', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({ agents: [makeAgent()], totalFiles: 5 }),
        'normal',
      );
      const stdout = s.stdout();
      expect(stdout).toMatch(/Synced .*1.* agent,/);
      expect(stdout).not.toMatch(/Synced .*1.* agents,/);
      expect(stdout).toContain('generated');
      expect(stdout).toContain('5');
    });

    it('uses plural "agents" for zero agents (cond#0)', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({ agents: [], totalFiles: 0 }),
        'normal',
      );
      expect(s.stdout()).toMatch(/Synced .*0.* agents,/);
    });

    it('uses plural "agents" for multiple agents (cond#0)', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({
          agents: [makeAgent({ agent: 'claude' }), makeAgent({ agent: 'codex' })],
          totalFiles: 8,
        }),
        'normal',
      );
      expect(s.stdout()).toMatch(/Synced .*2.* agents,/);
    });
  });

  describe('tree prefixes for last vs non-last agent (L38/L39 cond-expr)', () => {
    it('uses the branch prefix for non-last agents and the corner prefix for the last', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({
          agents: [
            makeAgent({ agent: 'claude', configFile: 'CLAUDE.md' }),
            makeAgent({ agent: 'codex', configFile: 'AGENTS.md' }),
          ],
          totalFiles: 4,
        }),
        'normal',
      );
      const stdout = s.stdout();
      // First (non-last) agent gets ├──; last agent gets └──
      expect(stdout).toContain('├── ');
      expect(stdout).toContain('└── ');
      expect(stdout).toContain('claude');
      expect(stdout).toContain('codex');
      // Non-last child prefix uses the vertical bar pipe.
      expect(stdout).toContain('│   ');
      expect(stdout).toContain('CLAUDE.md');
      expect(stdout).toContain('AGENTS.md');
    });

    it('single agent is treated as last (corner prefix, no branch prefix)', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({ agents: [makeAgent({ agent: 'claude' })], totalFiles: 1 }),
        'normal',
      );
      const stdout = s.stdout();
      expect(stdout).toContain('└── ');
      expect(stdout).not.toContain('├── ');
    });
  });

  describe('normal log level skill/reference summary (L62 else, L69 if)', () => {
    it('shows skill count and a references count line when refs exist (L69 if#0)', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({
          agents: [
            makeAgent({
              skillFiles: ['a/SKILL.md', 'b/SKILL.md'],
              referenceFiles: ['a/ref1.md', 'a/ref2.md', 'a/ref3.md'],
            }),
          ],
          totalFiles: 5,
        }),
        'normal',
      );
      const stdout = s.stdout();
      expect(stdout).toMatch(/2.* skills/);
      expect(stdout).toMatch(/3.* references/);
      // Normal mode summarizes; it does NOT print individual skill file paths.
      expect(stdout).not.toContain('a/SKILL.md');
      expect(stdout).not.toContain('a/ref1.md');
    });

    it('omits the references line when there are no reference files (L69 if#1)', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({
          agents: [
            makeAgent({ skillFiles: ['a/SKILL.md'], referenceFiles: [] }),
          ],
          totalFiles: 1,
        }),
        'normal',
      );
      const stdout = s.stdout();
      expect(stdout).toMatch(/1.* skills/);
      expect(stdout).not.toContain('references');
    });

    it('reports zero skills when no skill files exist', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({
          agents: [makeAgent({ skillFiles: [], referenceFiles: [] })],
          totalFiles: 0,
        }),
        'normal',
      );
      expect(s.stdout()).toMatch(/0.* skills/);
    });

    it('reports swept orphan skills (REQ-AGNT-032)', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({ agents: [makeAgent({ removedSkills: ['prospec-gone'] })] }),
        'normal',
      );
      expect(s.stdout()).toContain('prospec-gone');
    });

    it('omits the orphan line when nothing was swept (REQ-AGNT-032)', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({ agents: [makeAgent({ removedSkills: [] })] }),
        'normal',
      );
      expect(s.stdout()).not.toMatch(/orphan/i);
    });
  });

  describe('verbose log level (L50 if#0)', () => {
    it('lists each individual skill file and reference file path', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({
          agents: [
            makeAgent({
              skillFiles: ['skills/explore/SKILL.md', 'skills/plan/SKILL.md'],
              referenceFiles: ['skills/explore/references/r.md'],
            }),
          ],
          totalFiles: 3,
        }),
        'verbose',
      );
      const stdout = s.stdout();
      expect(stdout).toContain('skills/explore/SKILL.md');
      expect(stdout).toContain('skills/plan/SKILL.md');
      expect(stdout).toContain('skills/explore/references/r.md');
      // Verbose lists files; it must NOT emit the "N skills" / "N references"
      // summary lines (those are the normal-mode counts). The digit-space-noun
      // pattern is what distinguishes the summary line from a file path.
      expect(stdout).not.toMatch(/\d skills/);
      expect(stdout).not.toMatch(/\d references/);
    });

    it('emits only the config line when verbose agent has no skills or references', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({
          agents: [makeAgent({ configFile: 'CLAUDE.md', skillFiles: [], referenceFiles: [] })],
          totalFiles: 1,
        }),
        'verbose',
      );
      const stdout = s.stdout();
      expect(stdout).toContain('CLAUDE.md');
      expect(stdout).not.toMatch(/skills/);
    });
  });

  describe('hints (L78-80)', () => {
    it('prints each hint with an info marker', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({
          agents: [makeAgent()],
          totalFiles: 1,
          hints: ['populate skill_triggers for zh-TW', 'second hint'],
        }),
        'normal',
      );
      const stdout = s.stdout();
      expect(stdout).toContain('populate skill_triggers for zh-TW');
      expect(stdout).toContain('second hint');
      expect(stdout).toContain('ℹ');
    });

    it('omits hint lines when hints array is empty', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({ agents: [makeAgent()], totalFiles: 1, hints: [] }),
        'normal',
      );
      expect(s.stdout()).not.toContain('ℹ');
    });
  });

  describe('next-steps footer and default arg (L18, L84-85, L89)', () => {
    it('always appends the next-steps suggestion and terminates with a newline', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({ agents: [makeAgent()], totalFiles: 1 }),
        'normal',
      );
      const stdout = s.stdout();
      expect(stdout).toContain('/prospec-explore');
      expect(stdout).toContain('AI agent configurations are ready');
      expect(stdout.endsWith('\n')).toBe(true);
    });

    it('defaults logLevel to normal when omitted (L18 default-arg)', () => {
      const s = spyStreams();
      formatAgentSyncOutput(
        makeResult({
          agents: [makeAgent({ skillFiles: ['s/SKILL.md'], referenceFiles: [] })],
          totalFiles: 1,
        }),
      );
      const stdout = s.stdout();
      // Default = normal: summarized count, not individual paths nor early quiet return.
      expect(stdout).toMatch(/1.* skills/);
      expect(stdout).not.toContain('s/SKILL.md');
      expect(s.out).toHaveBeenCalled();
    });
  });
});
