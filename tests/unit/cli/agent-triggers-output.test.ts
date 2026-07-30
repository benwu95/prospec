import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatAgentTriggersOutput,
  formatAgentTriggersWriteOutput,
} from '../../../src/cli/formatters/agent-triggers-output.js';
import type {
  AgentTriggersResult,
  AgentTriggersWriteResult,
} from '../../../src/services/agent-triggers.service.js';

// BEL (0x07) is a C0 control char that picocolors never emits (it only uses ESC
// for color), so asserting "no BEL in output" proves the injected control bytes
// were stripped without being confused by terminal-color escape sequences.
const BEL = String.fromCharCode(0x07);

afterEach(() => {
  vi.restoreAllMocks();
});

function capture(fn: () => void): { out: string; err: string } {
  const outWrites: string[] = [];
  const errWrites: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    outWrites.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    errWrites.push(String(chunk));
    return true;
  });
  fn();
  return { out: outWrites.join(''), err: errWrites.join('') };
}

function scaffoldResult(overrides: Partial<AgentTriggersResult> = {}): AgentTriggersResult {
  return {
    artifactLanguage: 'Traditional Chinese (Taiwan)',
    isEnglish: false,
    missing: [{ name: 'prospec-plan', baseline: ['plan', 'architecture'] }],
    ...overrides,
  };
}

describe('agent-triggers-output (scaffold)', () => {
  it('emits the paste-ready skill_triggers scaffold on stdout', () => {
    const { out, err } = capture(() => formatAgentTriggersOutput(scaffoldResult(), 'normal'));
    expect(out).toContain('skill_triggers:');
    expect(out).toContain('  prospec-plan:');
    expect(out).toContain('    - plan');
    expect(err).toBe('');
  });

  it('routes the informational notes to stderr, suppressed in quiet', () => {
    const english = capture(() =>
      formatAgentTriggersOutput(scaffoldResult({ isEnglish: true }), 'normal'),
    );
    expect(english.out).toBe('');
    expect(english.err).toContain('artifact_language is English');

    const complete = capture(() =>
      formatAgentTriggersOutput(scaffoldResult({ missing: [] }), 'normal'),
    );
    expect(complete.out).toBe('');
    expect(complete.err).toContain('already have a Traditional Chinese (Taiwan) skill_triggers entry');

    const quiet = capture(() =>
      formatAgentTriggersOutput(scaffoldResult({ isEnglish: true }), 'quiet'),
    );
    expect(quiet.out).toBe('');
    expect(quiet.err).toBe('');
  });

  it('strips control characters from the artifact language read from .prospec.yaml', () => {
    const scaffold = capture(() =>
      formatAgentTriggersOutput(scaffoldResult({ artifactLanguage: `Fran${BEL}çais` }), 'normal'),
    );
    expect(scaffold.out.includes(BEL)).toBe(false);
    expect(scaffold.out).toContain('Français');

    const note = capture(() =>
      formatAgentTriggersOutput(
        scaffoldResult({ artifactLanguage: `Fran${BEL}çais`, missing: [] }),
        'normal',
      ),
    );
    expect(note.err.includes(BEL)).toBe(false);
    expect(note.err).toContain('Français');
  });
});

function writeResult(overrides: Partial<AgentTriggersWriteResult> = {}): AgentTriggersWriteResult {
  return {
    written: ['prospec-plan'],
    skippedExisting: [],
    configPath: '.prospec.yaml',
    ...overrides,
  };
}

describe('agent-triggers-output (write-back)', () => {
  it('prints inserted and skipped skills with the sync follow-up', () => {
    const { out } = capture(() =>
      formatAgentTriggersWriteOutput(
        writeResult({ skippedExisting: ['prospec-verify'] }),
        'normal',
      ),
    );
    expect(out).toContain('Inserted skill_triggers for 1 skill(s) into .prospec.yaml');
    expect(out).toContain('- prospec-plan');
    expect(out).toContain('Skipped (existing entries are never overwritten): prospec-verify');
    expect(out).toContain('prospec agent sync');
  });

  it('prints nothing in quiet mode', () => {
    const { out } = capture(() => formatAgentTriggersWriteOutput(writeResult(), 'quiet'));
    expect(out).toBe('');
  });

  it('strips control characters from the write-back skill lists', () => {
    const { out } = capture(() =>
      formatAgentTriggersWriteOutput(
        writeResult({
          written: [`writ${BEL}ten-skill`],
          skippedExisting: [`skip${BEL}ped-skill`],
        }),
        'normal',
      ),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('written-skill');
    expect(out).toContain('skipped-skill');
  });
});
