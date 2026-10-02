/** A bounded consumption site; paths describe this repository, never downstream output. */
export interface CanonicalClaimSite {
  readonly id: string;
  readonly path: string;
  readonly kind: 'runtime' | 'template' | 'authored';
  readonly language: 'en' | 'zh';
  readonly start: string;
  readonly end: string;
  readonly markup?: 'html';
}

export interface CanonicalClaim {
  readonly en: string;
  readonly zh: string;
  readonly sites: readonly CanonicalClaimSite[];
}

/** Text only: the classifier, router and synchronization skills retain their own decisions. */
export const CANONICAL_CLAIMS = {
  related_module_halt: {
    en: 'a `related_modules` name the map does not register and no ADDED REQ introduces as a new module',
    zh: 'module-map 未註冊、且沒有 ADDED REQ 以新模組引入的 `related_modules` 名稱',
    sites: [
      { id: 'gap-message', path: 'src/lib/knowledge-sync.ts', kind: 'runtime', language: 'en', start: 'knowledge-sync input', end: '\n' },
      { id: 'router-gate', path: 'src/lib/status-router.ts', kind: 'runtime', language: 'en', start: 'knowledge-sync inputs repaired', end: '\n' },
      { id: 'lifecycle-template', path: 'src/templates/init/status-lifecycle.md.hbs', kind: 'template', language: 'en', start: '- **`prospec-knowledge-update`**', end: '\n' },
      { id: 'lifecycle-local', path: 'prospec/ai-knowledge/_status-lifecycle.md', kind: 'authored', language: 'en', start: '- **`prospec-knowledge-update`**', end: '\n' },
      { id: 'cli-en', path: 'reference/cli-reference.md', kind: 'authored', language: 'en', start: '    - At `verified`,', end: '\n' },
      { id: 'cli-zh', path: 'reference/cli-reference.zh-TW.md', kind: 'authored', language: 'zh', start: '    - 在 `verified`，', end: '\n' },
      { id: 'spec-halt', path: 'prospec/specs/features/sdd-workflow/us-37.md', kind: 'authored', language: 'en', start: "`lib/knowledge-sync` is the single owner", end: '\n' },
    ],
  },
  knowledge_sync_modules: {
    en: 'the modules `prospec knowledge update --change` reports as created or README-pending ∪ `metadata.related_modules` ∪ the modules a working-tree diff attributes through the module map (generated artifacts included)',
    zh: '`prospec knowledge update --change` 回報為 created 或 README-pending 的模組 ∪ `metadata.related_modules` ∪ working-tree diff 經 module-map 歸屬的模組（包含 generated artifacts）',
    sites: [
      { id: 'knowledge-update', path: 'src/templates/skills/prospec-knowledge-update.hbs', kind: 'template', language: 'en', start: 'After reviewing/updating the README', end: '\n' },
      { id: 'cascade-general', path: 'src/templates/skills/references/cascade-protocol.hbs', kind: 'template', language: 'en', start: '   - **Sync affected-module Knowledge**:', end: '\n' },
      { id: 'templates-readme', path: 'prospec/ai-knowledge/modules/templates/README.md', kind: 'authored', language: 'en', start: '- The modules the prevention point', end: '\n' },
      { id: 'spec-prevention-description', path: 'prospec/specs/features/sdd-workflow/us-37.md', kind: 'authored', language: 'en', start: "Before the final effective review/tests/verify", end: '\n' },
      { id: 'spec-prevention-scenario', path: 'prospec/specs/features/sdd-workflow/us-37.md', kind: 'authored', language: 'en', start: "- WHEN the commit prompt names the modules to sync, THEN", end: '\n' },
      { id: 'spec-update-description', path: 'prospec/specs/features/ai-knowledge/us-310.md', kind: 'authored', language: 'en', start: "`/prospec-knowledge-update`'s mechanical work", end: '\n' },
      { id: 'spec-update-scenario', path: 'prospec/specs/features/ai-knowledge/us-310.md', kind: 'authored', language: 'en', start: "- WHEN 3e names the affected modules, THEN", end: '\n' },
    ],
  },
  backfill_sync_modules: {
    en: 'the modules `prospec knowledge update --change` reports ∪ `metadata.related_modules`',
    zh: '`prospec knowledge update --change` 回報的 modules ∪ `metadata.related_modules`',
    sites: [
      { id: 'archive-entry-backfill', path: 'src/templates/skills/prospec-archive.hbs', kind: 'template', language: 'en', start: '  - **`metadata.scale: backfill`**', end: '\n' },
      { id: 'archive-recheck-backfill', path: 'src/templates/skills/prospec-archive.hbs', kind: 'template', language: 'en', start: '1. Reuse the Entry Gate', end: '\n' },
      { id: 'cascade-backfill', path: 'src/templates/skills/references/cascade-protocol.hbs', kind: 'template', language: 'en', start: '   - **Sync affected-module Knowledge**:', end: '\n' },
      { id: 'verify-backfill', path: 'src/templates/skills/references/verify-backfill.hbs', kind: 'template', language: 'en', start: '- **Knowledge Sync**:', end: '\n' },
      { id: 'readme-en', path: 'README.md', kind: 'authored', language: 'en', start: '5. **Knowledge Sync**', end: '\n' },
      { id: 'readme-zh', path: 'README.zh-TW.md', kind: 'authored', language: 'zh', start: '5. **Knowledge Sync**', end: '\n' },
      { id: 'website-en', path: 'docs/index.html', kind: 'authored', language: 'en', start: '<li data-i18n="brownfield.c1.li3">', end: '</li>', markup: 'html' },
      { id: 'website-zh', path: 'docs/i18n.js', kind: 'authored', language: 'zh', start: "    'brownfield.c1.li3':", end: '\n', markup: 'html' },
      { id: 'spec-backfill-sync', path: 'prospec/specs/features/sdd-workflow/us-37.md', kind: 'authored', language: 'en', start: "- WHEN `scale: backfill`, THEN sync the READMEs", end: '\n' },
      { id: 'spec-backfill-docs', path: 'prospec/specs/features/sdd-workflow/us-37.md', kind: 'authored', language: 'en', start: "- WHEN the backfill Knowledge Sync step is read", end: '\n' },
      { id: 'spec-backfill-scenario', path: 'prospec/specs/features/sdd-workflow/us-23.md', kind: 'authored', language: 'en', start: '- WHEN archive processes a proven backfill', end: '\n' },
      { id: 'lifecycle-template-backfill', path: 'src/templates/init/status-lifecycle.md.hbs', kind: 'template', language: 'en', start: '- **`prospec-promote-backfill`**', end: '\n' },
      { id: 'lifecycle-local-backfill', path: 'prospec/ai-knowledge/_status-lifecycle.md', kind: 'authored', language: 'en', start: '- **`prospec-promote-backfill`**', end: '\n' },
    ],
  },
} as const satisfies Record<string, CanonicalClaim>;
