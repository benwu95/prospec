/**
 * Contract: the seeded Constitution rule and the agent entry config declare ONE
 * language scope.
 *
 * `prospec init` writes both `CONSTITUTION.md` and (via `agent sync`)
 * `CLAUDE.md`/`AGENTS.md`. They used to spell the scope out by hand and drifted
 * into a `[MUST]`-level contradiction: the Constitution demanded the AI Knowledge
 * base in the artifact language while the entry config declared it permanently
 * English. Verify audits only the Constitution and grades a MUST violation as
 * FAIL, so a fresh project failed its first verify whichever document its agent
 * obeyed. These assertions drive the REAL services (no re-implemented context) so
 * the wiring — not a test-local copy of it — is what gets pinned.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { resolveLanguageScope } from '../../src/lib/language-policy.js';
import type { ProspecConfig } from '../../src/types/config.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

import { execute as initExecute } from '../../src/services/init.service.js';
import { execute as agentSyncExecute } from '../../src/services/agent-sync.service.js';

const CWD = '/p';

/** Slice one Markdown section out of a doc — bare toContain over a whole file gives false greens (PB-001). */
function sectionOf(content: string, headingPattern: RegExp): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{2,4}\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

async function scaffold(
  language: string,
  configPatch?: (yaml: string) => string,
): Promise<{ rule: string; entry: string; scope: ReturnType<typeof resolveLanguageScope> }> {
  vol.reset();
  vol.fromJSON({ [`${CWD}/package.json`]: '{"name":"demo"}' });

  await initExecute({ cwd: CWD, name: 'demo', agents: ['claude'], language });

  if (configPatch) {
    const configPath = `${CWD}/.prospec.yaml`;
    fs.writeFileSync(configPath, configPatch(fs.readFileSync(configPath, 'utf-8')), 'utf-8');
    // The Constitution is written by init from the pre-patch config, so re-render
    // it from the patched one the way `prospec upgrade`'s back-fill would.
    const { buildInitDocContexts } = await import('../../src/lib/init-docs.js');
    const { renderTemplate } = await import('../../src/lib/template.js');
    const { readConfig } = await import('../../src/lib/config.js');
    const patched = await readConfig(CWD);
    const { baseDir } = (await import('../../src/lib/config.js')).resolveBasePaths(patched, CWD);
    fs.mkdirSync(baseDir, { recursive: true });
    fs.writeFileSync(
      `${baseDir}/CONSTITUTION.md`,
      renderTemplate('init/constitution.md.hbs', buildInitDocContexts(patched, CWD).standard),
      'utf-8',
    );
  }

  await agentSyncExecute({ cwd: CWD });

  const { readConfig } = await import('../../src/lib/config.js');
  const config = await readConfig(CWD);
  const { constitutionPath } = (await import('../../src/lib/config.js')).resolveBasePaths(config, CWD);

  return {
    rule: sectionOf(fs.readFileSync(constitutionPath, 'utf-8'), /Language Policy\s*$/),
    entry: sectionOf(fs.readFileSync(`${CWD}/CLAUDE.md`, 'utf-8'), /^##\s+Language Policy\s*$/),
    scope: resolveLanguageScope(config, CWD),
  };
}

beforeEach(() => vol.reset());

describe('Language Policy scope agreement (Constitution ⇄ entry config)', () => {
  it('declares the same artifact-language paths in both documents', async () => {
    const { rule, entry, scope } = await scaffold('Traditional Chinese (Taiwan)');

    expect(scope.nativePaths.length).toBeGreaterThan(0);
    for (const p of scope.nativePaths) {
      expect(rule).toContain(p);
      expect(entry).toContain(p);
    }
  });

  it('declares the same English trust zone in both documents', async () => {
    const { rule, entry, scope } = await scaffold('Traditional Chinese (Taiwan)');

    expect(scope.englishPaths.length).toBeGreaterThan(0);
    for (const p of scope.englishPaths) {
      expect(rule).toContain(p);
      expect(entry).toContain(p);
    }
  });

  it('never puts the knowledge base under the artifact-language requirement', async () => {
    const { rule, entry, scope } = await scaffold('Japanese');

    // The pre-fix bug in one line: the Constitution requiring the knowledge base
    // in the artifact language while the entry config called it English. Scoped to
    // the sentences that actually impose the requirement, so a later mention of
    // the same path in the English clause is not mistaken for a violation.
    const knowledgeGlob = scope.englishPaths.find((p) => p.includes('ai-knowledge'))!;
    const imposesJapanese = /written in Japanese|is \*\*Japanese\*\*/;

    for (const doc of [rule, entry]) {
      // Clause-level, not sentence-level: the Verify hint states both zones in one
      // sentence separated by `;`.
      const requirements = doc.split(/(?<=[.;])\s/).filter((s) => imposesJapanese.test(s));
      expect(requirements.length).toBeGreaterThan(0);
      for (const sentence of requirements) {
        expect(sentence).not.toContain(knowledgeGlob);
      }
    }
  });

  it('keeps the named in-zone exceptions in the Constitution only (L0 stays lean)', async () => {
    const { rule, entry } = await scaffold('Traditional Chinese (Taiwan)');

    expect(rule).toContain('_lessons-ledger.md');
    expect(rule).toContain('_glossary.md');
    expect(entry).not.toContain('_lessons-ledger.md');
    expect(entry).toMatch(/Constitution's Language Policy rule/);
  });

  it('renders a relocated base_dir and knowledge.base_path in both documents', async () => {
    const { rule, entry, scope } = await scaffold('Japanese', (yaml) =>
      yaml
        .replace('base_dir: prospec', 'base_dir: docs/spec')
        .replace('base_path: prospec/ai-knowledge', 'base_path: docs/kb'),
    );

    expect(scope.englishPaths).toContain('docs/kb/**');
    for (const p of ['docs/kb/**', 'docs/spec/CONSTITUTION.md', 'docs/spec/specs/features/**']) {
      expect(rule).toContain(p);
      expect(entry).toContain(p);
    }
    expect(rule).not.toContain('prospec/ai-knowledge/**');
    expect(entry).not.toContain('prospec/ai-knowledge/**');
  });

  it('states one English zone for an English project, with no exemption clause', async () => {
    const { rule, entry } = await scaffold('English');

    expect(rule).toContain('English');
    expect(rule).not.toMatch(/exempt|trust zone/i);
    expect(rule).not.toContain('.prospec/changes/**');
    expect(entry).toContain('English');
    expect(entry).not.toMatch(/exempt/i);
  });
});

describe('resolveLanguageScope is the single source both documents read', () => {
  it('derives every rendered path from config, never a hardcoded default', async () => {
    const config = {
      project: { name: 'demo' },
      paths: { base_dir: 'x' },
      knowledge: { base_path: 'y' },
      artifact_language: 'Japanese',
    } as ProspecConfig;

    const scope = resolveLanguageScope(config, CWD);

    expect(scope.nativePaths.concat(scope.englishPaths).filter((p) => p.startsWith('prospec/'))).toEqual([]);
  });
});
