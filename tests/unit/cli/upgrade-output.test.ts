import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatUpgradeOutput } from '../../../src/cli/formatters/upgrade-output.js';
import type { UpgradeResult } from '../../../src/services/upgrade.service.js';

function captureStreams() {
  const stdoutCalls: string[] = [];
  const stderrCalls: string[] = [];
  const stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: unknown) => {
      stdoutCalls.push(String(chunk));
      return true;
    });
  const stderrSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: unknown) => {
      stderrCalls.push(String(chunk));
      return true;
    });
  return {
    stdoutSpy,
    stderrSpy,
    stdout: () => stdoutCalls.join(''),
    stderr: () => stderrCalls.join(''),
  };
}

const AL_NUDGE = {
  field: 'artifact_language',
  message:
    'no artifact_language set — AI-generated docs default to English. To author them in another language, set artifact_language in .prospec.yaml (then skill triggers can be localized).',
};

function baseResult(
  overrides: Partial<UpgradeResult['report']> = {},
  resultOverrides: Partial<Omit<UpgradeResult, 'report'>> = {},
): UpgradeResult {
  return {
    report: {
      versionFrom: '0.1.0',
      versionTo: '0.4.1',
      missingTriggers: [],
      nudges: [],
      docs: [],
      createdDocs: [],
      ...overrides,
    },
    agentSync: { agents: [], totalFiles: 3, warnings: [], hints: [] },
    nextStep: '/prospec-upgrade',
    resolvedNudges: [],
    rawScanRefreshed: true,
    ...resultOverrides,
  };
}

describe('formatUpgradeOutput', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints the version delta, agent sync, and the /prospec-upgrade hand-off', () => {
    const { stdout } = captureStreams();
    formatUpgradeOutput(baseResult(), 'normal');
    const text = stdout();
    expect(text).toContain('0.1.0');
    expect(text).toContain('0.4.1');
    expect(text).toContain('Upgrade report');
    expect(text).toContain('/prospec-upgrade');
  });

  it('confirms the raw-scan refresh when it ran, and omits the line when it did not', () => {
    const shown = captureStreams();
    formatUpgradeOutput(baseResult({}, { rawScanRefreshed: true }), 'normal');
    expect(shown.stdout()).toContain('raw-scan refreshed');
    vi.restoreAllMocks();

    const hidden = captureStreams();
    formatUpgradeOutput(baseResult({}, { rawScanRefreshed: false }), 'normal');
    expect(hidden.stdout()).not.toContain('raw-scan refreshed');
  });

  it('prints a config-field nudge (no artifact_language) instead of a misleading "up to date"', () => {
    const { stdout } = captureStreams();
    formatUpgradeOutput(baseResult({ nudges: [AL_NUDGE] }), 'normal');
    const text = stdout();
    expect(text).toContain('no artifact_language set');
    expect(text).toContain('artifact_language in .prospec.yaml');
    // No triggers are "missing" precisely because no language was chosen, so the
    // "up to date" line must NOT appear alongside the nudge.
    expect(text).not.toContain('skill triggers up to date');
  });

  it('prints each nudge on its own line when several fire', () => {
    const { stdout } = captureStreams();
    formatUpgradeOutput(
      baseResult({
        nudges: [AL_NUDGE, { field: 'future_field', message: 'future nudge message' }],
      }),
      'normal',
    );
    const text = stdout();
    expect(text).toContain('no artifact_language set');
    expect(text).toContain('future nudge message');
  });

  it('reports missing triggers when a language is set but some skills lack entries', () => {
    const { stdout } = captureStreams();
    formatUpgradeOutput(
      baseResult({ nudges: [], missingTriggers: ['prospec-upgrade'] }),
      'normal',
    );
    const text = stdout();
    expect(text).toContain('skills missing triggers: prospec-upgrade');
    expect(text).not.toContain('no artifact_language set');
  });

  it('reports triggers up to date when there are no nudges and no missing triggers', () => {
    const { stdout } = captureStreams();
    formatUpgradeOutput(baseResult({ nudges: [], missingTriggers: [] }), 'normal');
    const text = stdout();
    expect(text).toContain('skill triggers up to date');
    expect(text).not.toContain('no artifact_language set');
  });

  it('confirms a nudge the user filled in interactively', () => {
    const { stdout } = captureStreams();
    formatUpgradeOutput(
      baseResult(
        { nudges: [], missingTriggers: [] },
        { resolvedNudges: [{ field: 'artifact_language', value: '日本語' }] },
      ),
      'normal',
    );
    const text = stdout();
    expect(text).toContain('artifact_language set to 日本語');
    // The field was filled, so it must NOT also still be nagged as a pending nudge.
    expect(text).not.toContain('no artifact_language set');
  });

  it('prints a Docs inventory section — present ✓ and MISSING ✗ lines each carry the template', () => {
    const { stdout } = captureStreams();
    formatUpgradeOutput(
      baseResult({
        docs: [
          { path: 'prospec/CONSTITUTION.md', template: 'init/constitution.md.hbs', present: true },
          { path: 'prospec/ai-knowledge/_glossary.md', template: 'init/glossary.md.hbs', present: false },
        ],
      }),
      'normal',
    );
    const text = stdout();
    expect(text).toContain('Docs inventory:');
    expect(text).toContain('prospec/CONSTITUTION.md (template: init/constitution.md.hbs)');
    expect(text).toContain(
      'prospec/ai-knowledge/_glossary.md — MISSING (template: init/glossary.md.hbs)',
    );
    // one doc still missing (back-fill failed) → the hand-off count line appears
    expect(text).toContain('1 doc(s) still missing');
  });

  it('lists docs it back-filled this run under a created line', () => {
    const { stdout } = captureStreams();
    formatUpgradeOutput(
      baseResult({
        docs: [
          { path: 'prospec/ai-knowledge/_glossary.md', template: 'init/glossary.md.hbs', present: true },
        ],
        createdDocs: ['prospec/ai-knowledge/_glossary.md'],
      }),
      'normal',
    );
    const text = stdout();
    expect(text).toContain('created 1 missing doc(s): prospec/ai-knowledge/_glossary.md');
    // it was created (now present), so no "still missing" line
    expect(text).not.toContain('still missing');
  });

  it('omits the missing-count line when every doc is present', () => {
    const { stdout } = captureStreams();
    formatUpgradeOutput(
      baseResult({
        docs: [
          { path: 'prospec/CONSTITUTION.md', template: 'init/constitution.md.hbs', present: true },
        ],
      }),
      'normal',
    );
    const text = stdout();
    expect(text).toContain('Docs inventory:');
    expect(text).not.toContain('doc(s) missing');
    expect(text).not.toContain('MISSING');
  });

  it('strips control characters from doc paths (terminal-injection guard)', () => {
    const { stdout } = captureStreams();
    formatUpgradeOutput(
      baseResult({
        docs: [
          {
            path: 'prospec/[31mevil.md',
            template: 'init/constitution.md.hbs',
            present: false,
          },
        ],
      }),
      'normal',
    );
    expect(stdout()).not.toContain('[31m');
    expect(stdout()).not.toContain('');
  });

  it('suppresses all stdout in quiet mode but still flushes warnings to stderr', () => {
    const { stdoutSpy, stderr } = captureStreams();
    const result = baseResult({ nudges: [AL_NUDGE] });
    result.agentSync.warnings = ['a warning'];
    formatUpgradeOutput(result, 'quiet');
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderr()).toContain('a warning');
  });
});
