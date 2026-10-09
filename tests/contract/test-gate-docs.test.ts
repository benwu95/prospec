import { renderTemplate } from '../../src/lib/template.js';
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Public-doc contract for the fresh-test gates (REQ-TEMPLATES-234, REQ-CLI-043):
 * the bilingual CLI references and the public workflow summaries describe the same refusal
 * conditions, exemptions and counting limitation — in English technical tokens
 * both languages share, so parity is checked token by token.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');

/** The bullet block of one CLI-reference command entry (`- **\`prospec …\`**` → next bullet). */
function entryOf(doc: string, command: string): string {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`- **\`${command}`));
  expect(start, `entry not found: ${command}`).toBeGreaterThanOrEqual(0);
  let end = start + 1;
  while (end < lines.length && !lines[end]!.startsWith('- **`') && !lines[end]!.startsWith('#')) end++;
  const body = lines.slice(start, end).join('\n');
  expect(body.trim().length).toBeGreaterThan(0);
  return body;
}

const STATUS_TOKENS = ['implemented', 'prospec check --record-tests --change', 'tests: not-adjudicated', 'backfill'];
const MERGE_TOKENS = ['prospec check --record-tests --change', 'tests: not-adjudicated', 'test_failures', 'persistent_test_failure', 'ESCALATE_TO_HUMAN', '3'];

describe('docs/reference/cli-reference*.md — change status and review merge refusal conditions', () => {
  const docs = { en: read('docs/reference/cli-reference.md'), zh: read('docs/reference/cli-reference.zh-TW.md') };

  it.each(Object.entries(docs))('%s: change status documents the fresh-green refusal, remediation and explicit exemptions', (_lang, doc) => {
    const entry = entryOf(doc, 'prospec change status');
    for (const token of STATUS_TOKENS) expect(entry, token).toContain(token);
    expect(entry).toMatch(/fresh|最新/);
  });

  it.each(Object.entries(docs))('%s: review merge distinguishes zero-write refusals from the metrics-only write and states the observed-attempt limitation', (_lang, doc) => {
    const entry = entryOf(doc, 'prospec review merge');
    for (const token of MERGE_TOKENS) expect(entry, token).toContain(token);
    expect(entry).toMatch(/metrics/);
    expect(entry).toMatch(/observ|觀測/);
    expect(entry).not.toMatch(/--max-test-failures|--threshold/);
  });

  it('both languages carry the same set of technical tokens (parity)', () => {
    for (const command of ['prospec change status', 'prospec review merge']) {
      const en = entryOf(docs.en, command);
      const zh = entryOf(docs.zh, command);
      for (const token of [...STATUS_TOKENS, ...MERGE_TOKENS]) {
        expect(en.includes(token), `${command}: ${token}`).toBe(zh.includes(token));
      }
    }
  });
});

describe('public workflow summaries — bilingual parity for the test gate', () => {
  it.each([
    ['docs/guides/upgrading.md', 'Gated, resumable execution'],
    ['docs/guides/upgrading.zh-TW.md', '受 gate 管理、可恢復的執行'],
  ])('%s names the fresh-green requirement on implemented and review merge in its workflow row', (file, rowTitle) => {
    const row = read(file).split('\n').find((l) => l.includes(rowTitle));
    expect(row, rowTitle).toBeDefined();
    expect(row).toContain('prospec check --record-tests');
    expect(row).toContain('implemented');
    expect(row).toContain('review merge');
    expect(row).toContain('not-adjudicated');
  });
});

describe('docs/reference/cli-reference*.md — knowledge update never retires a module for a REMOVED requirement', () => {
  const docs = { en: read('docs/reference/cli-reference.md'), zh: read('docs/reference/cli-reference.zh-TW.md') };
  // #311 R4-1: pin the positive meaning on the REMOVED bullet itself — another
  // bullet's `module-map` (or the old sentence's absence) must not satisfy it.
  const neverRetires = { en: 'never deprecates or unregisters it from `module-map.yaml`', zh: '不會棄用模組或從 module-map 移除' } as const;

  it.each(Object.entries(docs))('%s REMOVED bullet lists the module as README-pending and says it is never retired', (lang, doc) => {
    const entry = entryOf(doc, 'prospec knowledge update');
    const removed = entry.split('\n').find((l) => l.includes('REMOVED'));
    expect(removed, 'REMOVED bullet missing').toBeDefined();
    expect(removed).toContain('README-pending');
    expect(removed).toContain('module-map');
    expect(removed).toContain(neverRetires[lang as keyof typeof neverRetires]);
    expect(entry).not.toMatch(/deprecation banners? for removed|為已移除模組加上棄用標記/);
  });
});

describe('docs/reference/cli-reference*.md — related_modules correction and the knowledge-sync input halt (REQ-CLI-060, REQ-CLI-039)', () => {
  const docs = { en: read('docs/reference/cli-reference.md'), zh: read('docs/reference/cli-reference.zh-TW.md') };
  const neverRemoves = { en: 'never removes a registered module', zh: '絕不移除已註冊模組' } as const;
  // the Behavior sentence, not a token: an entry inverted to "may remove" must go red
  const entryRule = {
    en: 'It never removes a registered module — that would narrow the knowledge-sync gate',
    zh: '絕不移除已註冊模組——那會讓 knowledge-sync 閘門變窄',
  } as const;
  // a related_modules name an ADDED REQ also produces is knowledge-update's to create:
  // only the related-only name halts, so the qualifier is part of the rule
  const haltRoute = {
    en: [
      'a `related_modules` name the map does not register and no ADDED REQ introduces as a new module',
      'routes to `next: null` with stable code `KNOWLEDGE_INPUT_INVALID`',
      'stale modules still route to `prospec-knowledge-update` (`KNOWLEDGE_UNSYNCED`)',
    ],
    zh: [
      'module-map 未註冊、且沒有 ADDED REQ 以新模組引入的 `related_modules` 名稱',
      '會路由至 `next: null` 並帶穩定代碼 `KNOWLEDGE_INPUT_INVALID`',
      'stale 模組仍路由至 `prospec-knowledge-update`（`KNOWLEDGE_UNSYNCED`）',
    ],
  } as const;

  it.each(['prospec/ai-knowledge/_status-lifecycle.md', 'src/templates/init/status-lifecycle.md.hbs'])(
    '%s names the knowledge-sync input halt with the related-only qualifier',
    (file) => {
      const content = file.endsWith('.hbs') ? renderTemplate('init/status-lifecycle.md.hbs', {}) : read(file);
      const bullet = content.split('\n').find((l) => l.startsWith('- **`prospec-knowledge-update`**'));
      expect(bullet, 'knowledge-update bullet missing').toBeDefined();
      expect(bullet).toContain('a `related_modules` name the map does not register and no ADDED REQ introduces as a new module');
      expect(bullet).toContain('`code: KNOWLEDGE_INPUT_INVALID`');
    },
  );

  it.each(Object.entries(docs))('%s documents `prospec change related-modules` and its no-narrowing rule', (lang, doc) => {
    const entry = entryOf(doc, 'prospec change related-modules');
    expect(entry).toContain('related_modules');
    expect(entry).toContain('module-map.yaml');
    expect(entry).toContain(entryRule[lang as keyof typeof entryRule]);
    // every refusal of an untrustworthy map, the outside-root one included
    expect(entry).toContain(lang === 'en' ? 'resolves outside the knowledge root, refuses' : '解析到 knowledge root 之外時，以該原因拒收');
    const row = doc.split('\n').find((l) => l.startsWith('| `prospec change related-modules'));
    expect(row, 'summary row missing').toBeDefined();
    expect(row).toContain(neverRemoves[lang as keyof typeof neverRemoves]);
    const story = entryOf(doc, 'prospec change story');
    expect(story.split('\n').find((l) => l.includes('--related-module'))).toContain('prospec change related-modules');
  });

  it.each(Object.entries(docs))('%s status entry lists KNOWLEDGE_INPUT_INVALID among the null-next codes', (lang, doc) => {
    const entry = entryOf(doc, 'prospec status');
    const bullet = entry.split('\n').find((l) => l.includes('KNOWLEDGE_INPUT_INVALID') && l.includes('KNOWLEDGE_UNSYNCED'));
    expect(bullet, 'knowledge-sync halt bullet missing').toBeDefined();
    for (const phrase of haltRoute[lang as keyof typeof haltRoute]) expect(bullet).toContain(phrase);
    // the halt clause never names knowledge-update as its route (each language's own clause separator)
    const haltClauseRoutesToUpdate =
      lang === 'en'
        ? /KNOWLEDGE_INPUT_INVALID`?[^;]*route[^;]*to `prospec-knowledge-update`/
        : /KNOWLEDGE_INPUT_INVALID`?[^；]*路由至 `prospec-knowledge-update`/;
    expect(bullet).not.toMatch(haltClauseRoutesToUpdate);
    expect(entry).toMatch(/`AWAITING_HUMAN_PLAN_SIGNOFF`[^\n]*`KNOWLEDGE_INPUT_INVALID`[^\n]*`code`/);
  });
});
