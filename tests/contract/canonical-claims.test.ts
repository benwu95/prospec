import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CANONICAL_CLAIMS } from '../../src/types/canonical-claims.js';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CanonicalClaim, CanonicalClaimSite } from '../../src/types/canonical-claims.js';
import { knowledgeSyncReasons } from '../../src/lib/knowledge-sync.js';
import { routeChange } from '../../src/lib/status-router.js';
import { buildInitDocContexts } from '../../src/lib/init-docs.js';
import { renderTemplate } from '../../src/lib/template.js';
import { withoutFencedBlocks } from '../../src/lib/markdown-fences.js';
import { execute as agentSync, getSkillReferences } from '../../src/services/agent-sync.service.js';
import { execute as init } from '../../src/services/init.service.js';
import { execute as upgrade } from '../../src/services/upgrade.service.js';
import { AGENT_CONFIGS, SKILL_DEFINITIONS } from '../../src/types/skill.js';
import type { ChangeRouteFacts } from '../../src/types/status.js';
import type { ProspecConfig } from '../../src/types/config.js';
import { executePlaybook } from '../../src/services/learn.service.js';
// Independent inventory: deleting a registry descriptor must not reduce the sample.
const INVENTORY = {
  related_module_halt: ['gap-message', 'router-gate', 'lifecycle-template', 'lifecycle-local', 'cli-en', 'cli-zh', 'spec-halt'],
  knowledge_sync_modules: ['knowledge-update', 'cascade-general', 'templates-readme', 'spec-prevention-description', 'spec-prevention-scenario', 'spec-update-description', 'spec-update-scenario'],
  backfill_sync_modules: ['archive-entry-backfill', 'archive-recheck-backfill', 'cascade-backfill', 'verify-backfill', 'readme-en', 'readme-zh', 'website-en', 'website-zh', 'spec-backfill-sync', 'spec-backfill-docs'],
};

describe('canonical claim registry', () => {
  it('has the three distinct bilingual phrase entries and the complete site inventory', () => {
    expect(Object.keys(CANONICAL_CLAIMS).sort()).toEqual(Object.keys(INVENTORY).sort());
    for (const [id, claim] of Object.entries(CANONICAL_CLAIMS)) {
      expect(claim.en).not.toBe('');
      expect(claim.zh).toMatch(/[\u4e00-\u9fff]/);
      expect(claim.sites.map((site) => site.id).sort()).toEqual(INVENTORY[id as keyof typeof INVENTORY].toSorted());
      expect(new Set(claim.sites.map((site) => site.id)).size).toBe(claim.sites.length);
      for (const site of claim.sites) {
        expect(site.path).not.toBe('');
        expect(site.start).not.toBe('');
        expect(site.end).not.toBe('');
      }
    }
  });
});


vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });
const CLAIMS: Record<string, CanonicalClaim> = CANONICAL_CLAIMS;
const sites = Object.entries(CLAIMS).flatMap(([key, claim]) => claim.sites.map((site) => ({ key, claim, site })));
const config: ProspecConfig = { version: '2.2.0', project: { name: 'claims' }, agents: [], artifact_language: 'English' };
const reasons = () => knowledgeSyncReasons({ unregistered: ['ghost'], relatedUnregistered: ['ghost'], stale: [], malformedIds: [], moduleMapUnreadable: false }, 'claim-test');
const route = () => routeChange({
  name: 'claim-test', status: 'verified', scale: 'standard', hasTasks: true, hasDesignSpec: false,
  uiScope: null, codeTasksTotal: 1, codeTasksDone: 1, hasReviewProvenance: true,
  lastVerifyGrade: 'A', lastPlanVerifierResult: null, lastTasksVerifierResult: null,
  knowledgeSyncReasons: reasons(), verifyBelowBarStreak: 0, planFlawsStreak: 0,
  tasksFlawsStreak: 0, maxStationRetries: 3, pauseAtPlan: false, planSignedOff: false,
} satisfies ChangeRouteFacts);

/** Select exactly one declared bounded site, excluding fenced examples. */
function sliceSite(text: string, site: CanonicalClaimSite): string {
  const visible = withoutFencedBlocks(text.split('\n')).join('\n');
  const start = visible.indexOf(site.start);
  expect(start, `${site.id}: missing start`).toBeGreaterThanOrEqual(0);
  expect(visible.indexOf(site.start, start + site.start.length), `${site.id}: ambiguous start`).toBe(-1);
  let end = visible.indexOf(site.end, start + site.start.length);
  expect(end, `${site.id}: missing end`).toBeGreaterThan(start);
  const heading = site.start.match(/^(#+) /);
  if (heading) {
    const bodyStart = start + site.start.length;
    const boundary = new RegExp(
      `\\n {0,3}(?:#{1,${heading[1]!.length}}(?:[ \\t]|(?=\\n|$))|(?:=+|-+)[ \\t]*(?=\\n|$))`,
    );
    const next = visible.slice(bodyStart).search(boundary);
    if (next !== -1) end = Math.min(end, bodyStart + next);
    expect(visible.slice(bodyStart, end).trim(), `${site.id}: empty section`).not.toBe('');
  }
  return visible.slice(start, end);
}
function phraseFor(claim: CanonicalClaim, site: CanonicalClaimSite): string {
  const phrase = claim[site.language];
  return site.markup === 'html' ? phrase.replace(/`([^`]+)`/g, '<code>$1</code>') : phrase;
}
function assertSite(text: string, claim: CanonicalClaim, site: CanonicalClaimSite): void {
  expect(sliceSite(text, site), site.id).toContain(phraseFor(claim, site));
}
function contentFor(site: CanonicalClaimSite): string {
  if (site.id === 'gap-message') return reasons()[0]!.message + '\n';
  if (site.id === 'router-gate') return route().blockingGates[0] + '\n';
  if (site.kind === 'template') return renderTemplate(site.path.replace('src/templates/', ''), {
    ...buildInitDocContexts(config, process.cwd()).standard, canonical_claims: CANONICAL_CLAIMS,
    knowledge_base_path: 'prospec/ai-knowledge', constitution_path: 'prospec/CONSTITUTION.md',
  });
  return readFileSync(site.path, 'utf8');
}

describe('bounded canonical consumption sites', () => {
  it.each(sites)('$site.id uses the canonical phrase', ({ claim, site }) => {
    assertSite(contentFor(site), claim, site);
  });
  it.each(sites)('$site.id rejects deletion, paraphrase and relocation', ({ claim, site }) => {
    const original = contentFor(site);
    assertSite(original, claim, site);
    const phrase = phraseFor(claim, site);
    const scope = sliceSite(original, site);
    for (const replacement of ['', 'a paraphrased rule']) {
      const mutated = original.replace(scope, scope.replace(phrase, replacement));
      expect(mutated).not.toBe(original);
      expect(() => assertSite(mutated, claim, site)).toThrow();
      const moved = mutated + '\n## Unrelated section\n' + phrase + '\n';
      expect(() => assertSite(moved, claim, site)).toThrow();
    }
  });
  it('cannot erase a descriptor to shrink the asserted sample', () => {
    for (const [key, claim] of Object.entries(CLAIMS)) {
      const expected = INVENTORY[key as keyof typeof INVENTORY].toSorted();
      for (const site of claim.sites) {
        const mutated = claim.sites.filter((candidate) => candidate.id !== site.id);
        expect(mutated).toHaveLength(claim.sites.length - 1);
        expect(() => expect(mutated.map((candidate) => candidate.id).sort()).toEqual(expected)).toThrow();
      }
    }
  });
  it('templates contain placeholders rather than a second phrase definition', () => {
    for (const { key, claim, site } of sites.filter(({ site }) => site.kind === 'template')) {
      const scope = sliceSite(readFileSync(site.path, 'utf8'), site);
      expect(scope).toContain(`{{canonical_claims.${key}.en}}`);
      expect(scope).not.toContain(claim.en);
    }
  });
  it('keeps the existing halt and cause/remedy decisions', () => {
    expect(reasons()).toHaveLength(1);
    expect(reasons()[0]!.code).toBe('KNOWLEDGE_INPUT_INVALID');
    expect(reasons()[0]!.remediation).toContain('register the module in module-map.yaml');
    expect(route().code).toBe('KNOWLEDGE_INPUT_INVALID');
    expect(route().next).toBeNull();
    expect(knowledgeSyncReasons({ unregistered: ['ghost'], stale: [], malformedIds: [], moduleMapUnreadable: false }, 'claim-test')[0]!.code).toBe('KNOWLEDGE_UNSYNCED');
    expect(knowledgeSyncReasons({ unregistered: [], stale: [], malformedIds: [], moduleMapUnreadable: false }, 'claim-test')).toEqual([]);
  });
  it('injects the registry through the shared init/upgrade context', () => {
    expect(buildInitDocContexts(config, process.cwd()).standard.canonical_claims).toBe(CANONICAL_CLAIMS);
  });
});

const created: string[] = [];
let syncRoot: string;
beforeAll(async () => {
  syncRoot = mkdtempSync(join(tmpdir(), 'prospec-claims-'));
  created.push(syncRoot);
  writeFileSync(join(syncRoot, '.prospec.yaml'), 'version: 2.2.0\nproject:\n  name: claims\nagents: [claude, codex, copilot, antigravity]\nartifact_language: English\n');
  mkdirSync(join(syncRoot, 'prospec'));
  await agentSync({ cwd: syncRoot });
});
afterAll(() => { for (const dir of created) rmSync(dir, { recursive: true, force: true }); });

describe('real generation supplies canonical text', () => {
  it.each(Object.keys(AGENT_CONFIGS) as (keyof typeof AGENT_CONFIGS)[])('%s deployed sites have their phrases', (host) => {
    for (const { claim, site } of sites.filter(({ site }) => site.kind === 'template' && site.id !== 'lifecycle-template')) {
      const template = site.path.replace('src/templates/skills/', '');
      const outputs = template.startsWith('references/')
        ? SKILL_DEFINITIONS.flatMap((skill) => getSkillReferences(skill.name)
          .filter((ref) => ref.templateName === template.replace('references/', ''))
          .map((ref) => `${skill.name}/references/${ref.outputName}`))
        : [`${template.replace(/\.hbs$/, '')}/SKILL.md`];
      expect(outputs.length).toBeGreaterThan(0);
      for (const output of outputs) assertSite(readFileSync(join(syncRoot, AGENT_CONFIGS[host].skillPath, output), 'utf8'), claim, site);
    }
  });
  it('init and upgrade use the same lifecycle phrase', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'prospec-claim-init-'));
    created.push(cwd);
    await init({ cwd, name: 'claims', agents: ['codex'], language: 'English', trustZoneLanguage: 'English' });
    const file = join(cwd, 'prospec/ai-knowledge/_status-lifecycle.md');
    const claim = CLAIMS.related_module_halt!;
    const site = claim.sites.find((site) => site.id === 'lifecycle-template')!;
    assertSite(readFileSync(file, 'utf8'), claim, site);
    rmSync(file);
    await upgrade({ cwd, interactive: false });
    assertSite(readFileSync(file, 'utf8'), claim, site);
  });
});


const AUTHORING_RULES = [
  'State the component’s own guarantees; reference another component’s REQ instead of describing its decision boundary.',
  'Derive set and condition wording from code predicates; quote registered canonical phrases verbatim.',
  'Use quantifiers (every, only, whenever, always, one per) and causal clauses (because, would) only when valid throughout the stated scope; otherwise delete them or reference the owning REQ.',
];
const authoringSites: CanonicalClaimSite[] = [
  { id: 'spec-authoring', path: 'src/templates/skills/references/delta-spec-format.hbs', kind: 'template', language: 'en', start: '## The `**Spec:**` Block', end: '### `**Dropped:**`' },
  { id: 'docs-lens', path: 'src/templates/skills/references/review-lenses-content.hbs', kind: 'template', language: 'en', start: '## Docs-Claims / Measurement-Attribution Lens', end: '## Parallel-Site Completeness Lens' },
  { id: 'playbook', path: 'prospec/ai-knowledge/_playbook.md', kind: 'authored', language: 'en', start: '### PB-003:', end: '### PB-006:' },
];
function assertAuthoring(text: string, site: CanonicalClaimSite): void {
  const scope = sliceSite(text, site);
  for (const rule of AUTHORING_RULES) expect(scope).toContain(rule);
}
describe('claim-authoring discipline', () => {
  it.each(authoringSites)('$id carries all three rules in its own section', (site) => {
    assertAuthoring(contentFor(site), site);
  });
  it.each(authoringSites)('$id cannot hide a removed rule in a neighboring section', (site) => {
    const original = contentFor(site);
    assertAuthoring(original, site);
    for (const rule of AUTHORING_RULES) {
      const scope = sliceSite(original, site);
      const mutant = original.replace(scope, scope.replace(rule, '')) + '\n## Elsewhere\n' + rule;
      expect(mutant).not.toBe(original);
      expect(() => assertAuthoring(mutant, site)).toThrow();
      const level = site.start.match(/^#+/)![0];
      for (const heading of [level + ' Other', ' ' + level + '\tOther', '  ' + level + ' Other', '   ' + level + ' Other', '# Other', 'Other\n---', 'Other\n===']) {
        const escaped = original.replace(scope, scope.replace(rule, `\n${heading}\n${rule}`));
        expect(escaped).not.toBe(original);
        expect(() => assertAuthoring(escaped, site)).toThrow();
      }
    }
  });
  it.each(['plan', 'implement', 'review'])('%s can read the PB-003 authoring rules', async (station) => {
    const result = await executePlaybook({ cwd: process.cwd(), station });
    const entry = result.catalog.find((item) => item.entry.id === 'PB-003');
    expect(entry?.bodySelected).toBe(true);
    for (const rule of AUTHORING_RULES) expect(entry?.entry.text).toContain(rule);
  });
  it('the authoring reference requires registration from three surfaces', () => {
    const scope = sliceSite(contentFor(authoringSites[0]!), authoringSites[0]!);
    expect(scope).toContain('three or more surfaces');
    expect(scope).toContain('register its canonical phrase and all consumption sites');
  });
});
