import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatInitOutput } from '../../../src/cli/formatters/init-output.js';
import type { InitResult, TechStackResult } from '../../../src/services/init.service.js';

interface AgentInfoLike {
  name: string;
  id: string;
  detected: boolean;
}

function makeResult(overrides: Partial<InitResult> = {}): InitResult {
  const base: InitResult = {
    projectName: 'demo',
    techStack: {} as TechStackResult,
    agentInfos: [] as AgentInfoLike[],
    selectedAgents: [],
    artifactLanguage: 'English',
    createdFiles: [],
  };
  return { ...base, ...overrides };
}

function captureStdout(): { out: () => string; spy: ReturnType<typeof vi.spyOn> } {
  const spy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true) as unknown as ReturnType<typeof vi.spyOn>;
  const out = () =>
    (spy.mock.calls as unknown as string[][]).map((c) => String(c[0])).join('');
  return { out, spy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatInitOutput', () => {
  describe('quiet log level', () => {
    it('writes nothing and returns early', () => {
      const { out, spy } = captureStdout();
      formatInitOutput(makeResult({ createdFiles: ['a.txt'] }), 'quiet');
      expect(spy).not.toHaveBeenCalled();
      expect(out()).toBe('');
    });
  });

  describe('default log level argument (L21)', () => {
    it('defaults to normal output when logLevel is omitted', () => {
      const { out, spy } = captureStdout();
      formatInitOutput(makeResult({ createdFiles: ['.prospec.yaml'] }));
      expect(spy).toHaveBeenCalled();
      expect(out()).toContain('Created .prospec.yaml');
      expect(out()).toContain('AI Assistants:');
    });
  });

  describe('created files section', () => {
    it('emits one "Created" line per created file', () => {
      const { out } = captureStdout();
      formatInitOutput(
        makeResult({ createdFiles: ['CONSTITUTION.md', 'prospec/_index.md'] }),
        'normal',
      );
      const text = out();
      expect(text).toContain('Created CONSTITUTION.md');
      expect(text).toContain('Created prospec/_index.md');
    });

    it('omits any "Created" line when createdFiles is empty', () => {
      const { out } = captureStdout();
      formatInitOutput(makeResult({ createdFiles: [] }), 'verbose');
      expect(out()).not.toContain('Created ');
    });
  });

  describe('tech stack section (L34 / hasTechStack)', () => {
    it('omits the tech stack line when no values are detected', () => {
      const { out } = captureStdout();
      formatInitOutput(makeResult({ techStack: {} as TechStackResult }), 'normal');
      expect(out()).not.toContain('Tech stack detected:');
    });

    it('shows language only', () => {
      const { out } = captureStdout();
      formatInitOutput(
        makeResult({ techStack: { language: 'typescript' } as TechStackResult }),
        'normal',
      );
      const text = out();
      expect(text).toContain('Tech stack detected:');
      expect(text).toContain('Typescript');
    });

    it('joins language and framework with a slash, dropping package_manager when framework present (L83/L86/L88)', () => {
      const { out } = captureStdout();
      formatInitOutput(
        makeResult({
          techStack: {
            language: 'typescript',
            framework: 'next.js',
            package_manager: 'pnpm',
          } as TechStackResult,
        }),
        'normal',
      );
      const text = out();
      expect(text).toContain('Typescript / Next.js');
      expect(text).not.toContain('Pnpm');
    });

    it('includes package_manager when no framework is present (L88 else side)', () => {
      const { out } = captureStdout();
      formatInitOutput(
        makeResult({
          techStack: {
            language: 'php',
            package_manager: 'composer',
          } as TechStackResult,
        }),
        'normal',
      );
      const text = out();
      expect(text).toContain('Php / Composer');
    });

    it('shows package_manager alone when it is the only detected value (L80/L83 else, L118 third side)', () => {
      const { out } = captureStdout();
      formatInitOutput(
        makeResult({
          techStack: { package_manager: 'yarn' } as TechStackResult,
        }),
        'normal',
      );
      const text = out();
      expect(text).toContain('Tech stack detected:');
      expect(text).toContain('Yarn');
    });

    it('shows framework alone when language is absent (L80 else, L83 then)', () => {
      const { out } = captureStdout();
      formatInitOutput(
        makeResult({
          techStack: { framework: 'django' } as TechStackResult,
        }),
        'normal',
      );
      const text = out();
      expect(text).toContain('Tech stack detected:');
      expect(text).toContain('Django');
    });

    it('drops package_manager when framework present but language absent (L80 else, L83 then, L88 then)', () => {
      const { out } = captureStdout();
      formatInitOutput(
        makeResult({
          techStack: {
            framework: 'django',
            package_manager: 'composer',
          } as TechStackResult,
        }),
        'normal',
      );
      const text = out();
      expect(text).toContain('Tech stack detected:');
      expect(text).toContain('Django');
      expect(text).not.toContain('Composer');
    });
  });

  describe('AI Assistants section (L107/L109 formatAgentLine)', () => {
    it('marks detected agents with "(detected)" and undetected with "(not installed)"', () => {
      const { out } = captureStdout();
      formatInitOutput(
        makeResult({
          agentInfos: [
            { name: 'Claude Code', id: 'claude-code', detected: true },
            { name: 'GitHub Copilot CLI', id: 'copilot', detected: false },
          ] as AgentInfoLike[],
        }),
        'normal',
      );
      const text = out();
      expect(text).toContain('Claude Code (detected)');
      expect(text).toContain('GitHub Copilot CLI (not installed)');
    });

    it('always emits the "AI Assistants:" header even with no agents', () => {
      const { out } = captureStdout();
      formatInitOutput(makeResult({ agentInfos: [] }), 'normal');
      const text = out();
      expect(text).toContain('AI Assistants:');
      expect(text).not.toContain('(detected)');
      expect(text).not.toContain('(not installed)');
    });
  });

  describe('selected agents summary (L47)', () => {
    it('lists selected agents joined by commas when present', () => {
      const { out } = captureStdout();
      formatInitOutput(
        makeResult({ selectedAgents: ['claude-code', 'cursor'] }),
        'normal',
      );
      expect(out()).toContain('Selected agents: claude-code, cursor');
    });

    it('omits the selected-agents line when none selected (L47 else side)', () => {
      const { out } = captureStdout();
      formatInitOutput(makeResult({ selectedAgents: [] }), 'normal');
      expect(out()).not.toContain('Selected agents:');
    });
  });

  describe('document language and next steps (L63 isDefaultArtifactLanguage)', () => {
    it('shows the document language line and the agent sync next step', () => {
      const { out } = captureStdout();
      formatInitOutput(makeResult({ artifactLanguage: 'English' }), 'normal');
      const text = out();
      expect(text).toContain('Document language:');
      expect(text).toContain('English');
      expect(text).toContain('Language Policy added to CONSTITUTION.md');
      expect(text).toContain('prospec agent sync');
    });

    it('does NOT add the trigger-words tip for the default language (L63 then side)', () => {
      const { out } = captureStdout();
      formatInitOutput(makeResult({ artifactLanguage: 'English' }), 'normal');
      expect(out()).not.toContain('skill_triggers');
    });

    it('treats the default language case-insensitively, suppressing the tip for lowercase "english" (L63 isDefaultArtifactLanguage case-fold)', () => {
      const { out } = captureStdout();
      formatInitOutput(makeResult({ artifactLanguage: '  english  ' }), 'normal');
      const text = out();
      expect(text).toContain('Document language:');
      expect(text).not.toContain('skill_triggers');
    });

    it('adds the trigger-words tip for a non-default language (L63 else side)', () => {
      const { out } = captureStdout();
      formatInitOutput(
        makeResult({ artifactLanguage: '繁體中文' }),
        'normal',
      );
      const text = out();
      expect(text).toContain('Document language:');
      expect(text).toContain('繁體中文');
      expect(text).toContain('skill_triggers');
      expect(text).toContain('.prospec.yaml');
    });
  });

  describe('output termination', () => {
    it('writes the assembled output ending with a trailing newline', () => {
      const { out } = captureStdout();
      formatInitOutput(makeResult({ createdFiles: ['x'] }), 'normal');
      const text = out();
      expect(text.endsWith('\n')).toBe(true);
    });
  });
});
