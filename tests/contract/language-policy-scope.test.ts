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
 * obeyed. These assertions drive the REAL services, so the wiring — not a
 * test-local copy of the render context — is what gets pinned. The one exception
 * is `scaffold`'s `configPatch` branch, which re-renders the Constitution the way
 * `prospec upgrade`'s back-fill does (init already wrote it from the pre-patch
 * config); it uses the same `buildInitDocContexts` those commands use.
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

  it('declares the same trust-zone paths in both documents', async () => {
    const { rule, entry, scope } = await scaffold('Traditional Chinese (Taiwan)');

    expect(scope.trustZonePaths.length).toBeGreaterThan(0);
    for (const p of scope.trustZonePaths) {
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
    const knowledgeGlob = scope.trustZonePaths.find((p) => p.includes('ai-knowledge'));
    // Without this, a scope that drops the knowledge base from trustZonePaths makes
    // knowledgeGlob undefined — and `not.toContain(undefined)` passes, so the whole
    // assertion below would go vacuous exactly when it matters.
    expect(knowledgeGlob).toBeDefined();
    const imposesJapanese = /(?:written in\s+|is\s+\**)Japanese/;

    for (const doc of [rule, entry]) {
      // Clause-level, not sentence-level: the Verify hint states both zones in one
      // sentence separated by `;`.
      const requirements = doc.split(/(?<=[.;])\s/).filter((s) => imposesJapanese.test(s));
      expect(requirements.length).toBeGreaterThan(0);
      for (const sentence of requirements) {
        expect(sentence).not.toContain(knowledgeGlob!);
        // Prose form of the same bug: naming the knowledge base in the requirement
        // clause without its glob. The literal-glob check alone lets that through.
        expect(sentence).not.toMatch(/AI Knowledge|knowledge base/i);
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

    expect(scope.trustZonePaths).toContain('docs/kb/**');
    for (const p of ['docs/kb/**', 'docs/spec/CONSTITUTION.md', 'docs/spec/specs/features/**']) {
      expect(rule).toContain(p);
      expect(entry).toContain(p);
    }
    expect(rule).not.toContain('prospec/ai-knowledge/**');
    expect(entry).not.toContain('prospec/ai-knowledge/**');
  });

  // `prospec init` renders the entry config itself, from its own context. When only
  // agent-sync carried the scope keys, init's AGENTS.md rendered empty path lists
  // beside a fully-scoped Constitution — and for a claude-only project agent sync
  // never rewrites AGENTS.md, so that file stayed blank permanently.
  it('renders the scope in the entry config init writes, before any agent sync', async () => {
    vol.reset();
    vol.fromJSON({ [`${CWD}/package.json`]: '{"name":"demo"}' });
    await initExecute({ cwd: CWD, name: 'demo', agents: ['claude'], language: 'Japanese' });

    const { readConfig } = await import('../../src/lib/config.js');
    const scope = resolveLanguageScope(await readConfig(CWD), CWD);
    const written = ['AGENTS.md', 'CLAUDE.md'].filter((f) => fs.existsSync(`${CWD}/${f}`));
    expect(written.length).toBeGreaterThan(0);

    for (const file of written) {
      const section = sectionOf(fs.readFileSync(`${CWD}/${file}`, 'utf-8'), /^##\s+Language Policy\s*$/);
      expect(section.trim().length).toBeGreaterThan(0);
      for (const p of [...scope.nativePaths, ...scope.trustZonePaths]) {
        expect(section).toContain(p);
      }
      expect(section).not.toMatch(/\(\s*\)/);
    }
  });

  it('takes the English branch in the entry config init writes for an English project', async () => {
    vol.reset();
    vol.fromJSON({ [`${CWD}/package.json`]: '{"name":"demo"}' });
    await initExecute({ cwd: CWD, name: 'demo', agents: ['claude'], language: 'English' });

    const written = ['AGENTS.md', 'CLAUDE.md'].filter((f) => fs.existsSync(`${CWD}/${f}`));
    for (const file of written) {
      const section = sectionOf(fs.readFileSync(`${CWD}/${file}`, 'utf-8'), /^##\s+Language Policy\s*$/);
      expect(section).toMatch(/written in English/);
      expect(section).not.toMatch(/exempt/i);
      expect(section).not.toMatch(/\(\s*\)/);
    }
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
  it('derives every path from config, never a hardcoded default', async () => {
    const config = {
      project: { name: 'demo' },
      paths: { base_dir: 'x' },
      knowledge: { base_path: 'y' },
      artifact_language: 'Japanese',
    } as ProspecConfig;

    const scope = resolveLanguageScope(config, CWD);

    // Exact sets, not a "no prospec/ prefix" filter: that filter passes for any
    // arbitrary path and so constrains nothing positive.
    expect(scope.nativePaths).toEqual([
      '.prospec/changes/**',
      '.prospec/archive/**',
      'x/specs/_archived-history/**',
    ]);
    expect(scope.trustZonePaths).toEqual([
      'x/CONSTITUTION.md',
      'x/README.md',
      'x/index.md',
      'x/specs/product.md',
      'x/specs/features/**',
      'y/**',
    ]);
  });
});

// Byte-identity pins for the entry config's Language Policy section under the
// default trust zone. Same reason as the rule pin in `constitution-rules.test.ts`:
// an unset `trust_zone_language` — and an explicit English one — must render the
// pre-axis text exactly, or every existing project's CLAUDE.md/AGENTS.md changes on
// the next `agent sync` for a feature it never opted into.
describe('entry config — default trust zone is byte-identical to the pre-axis wording', () => {
  const PINNED_TWO_ZONE_ENTRY =
    "\nThe user's primary language for **change artifacts** (`.prospec/changes/**`, `.prospec/archive/**`, `prospec/specs/_archived-history/**`) is **Traditional Chinese (Taiwan)**, and requests may be phrased in it. The trust zone (`prospec/CONSTITUTION.md`, `prospec/README.md`, `prospec/index.md`, `prospec/specs/product.md`, `prospec/specs/features/**`, `prospec/ai-knowledge/**`) always remains in English, as do code, identifiers, technical terms, and git commit messages — it is technical documentation read next to the code and cited in English, exempt from the Traditional Chinese (Taiwan) requirement. The Constitution's Language Policy rule is generated from this same path set and names the few per-spot exceptions in both directions — trust-zone spots that may use Traditional Chinese (Taiwan), and change-artifact spots that stay English because their content is copied into the trust zone verbatim.\n";
  const PINNED_ENGLISH_ENTRY =
    "\nAll generated documents — code, identifiers, technical terms, and git commit messages included — are written in English (see the Constitution's Language Policy rule).\n";

  it('renders the two-zone section verbatim with trust_zone_language unset or explicit English', async () => {
    // CI-mode init writes `trust_zone_language: English` itself; the unset variant
    // strips that key to model a pre-axis config.
    const unset = await scaffold('Traditional Chinese (Taiwan)', (yaml) =>
      yaml.replace(/^trust_zone_language:.*\n/m, ''),
    );
    const explicit = await scaffold('Traditional Chinese (Taiwan)');
    // Prove the "explicit" premise in this file: init itself wrote the key.
    expect(fs.readFileSync(`${CWD}/.prospec.yaml`, 'utf-8')).toContain('trust_zone_language: English');

    expect(unset.entry).toBe(PINNED_TWO_ZONE_ENTRY);
    expect(explicit.entry).toBe(PINNED_TWO_ZONE_ENTRY);
    expect(explicit.rule).toBe(unset.rule);
  });

  it('renders the single English sentence verbatim for an all-English project', async () => {
    const { entry } = await scaffold('English');
    expect(entry).toBe(PINNED_ENGLISH_ENTRY);
  });
});
