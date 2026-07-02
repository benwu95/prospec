/**
 * A convention doc's source: which Handlebars template renders it and where it
 * lands under the knowledge base directory. Shape shared by the canonical and
 * user-managed doc lists — ownership semantics live on each const, not here.
 */
export interface ConventionDocSource {
  /** Handlebars template path under `src/templates/`. */
  template: string;
  /** Output filename under the knowledge base directory. */
  output: string;
}

/**
 * Canonical / shipped convention docs — tracked but never user-customized.
 *
 * `prospec init` seeds these. The CLI never re-renders them on upgrade; refreshing
 * an init-created doc to the latest template is the consent-gated `/prospec-upgrade`
 * skill's job. This const is the single source for *which* docs are canonical.
 */
export const CANONICAL_CONVENTION_DOCS: ConventionDocSource[] = [
  { template: 'init/status-lifecycle.md.hbs', output: '_status-lifecycle.md' },
  { template: 'init/module-readme-conventions.md.hbs', output: '_module-readme-conventions.md' },
];

/**
 * User-managed convention docs.
 *
 * `prospec init` seeds these, but they are expected to be customized by the user.
 * They are explicitly kept out of the canonical list to prevent overwriting user
 * modifications. Same `{template, output}` shape as the canonical docs so both
 * lists feed `INIT_DOC_REGISTRY` by derivation — never restate a doc name.
 */
export const USER_MANAGED_CONVENTION_DOCS: ConventionDocSource[] = [
  { template: 'init/conventions.md.hbs', output: '_conventions.md' },
  { template: 'init/diagram-conventions.md.hbs', output: '_diagram-conventions.md' },
  { template: 'init/glossary.md.hbs', output: '_glossary.md' },
];

/**
 * Placeholder convention docs.
 * 
 * These files are NOT created during initialization. Instead, they are included as placeholders 
 * in `index.md` so the AI knows where to look for them if they are created later.
 */
export const PLACEHOLDER_CONVENTION_DOCS = [
  '_playbook.md',
  '_lessons-ledger.md',
];

/**
 * All convention files that are seeded or referenced during `prospec init`.
 */
export const ALL_INITIAL_CONVENTION_DOCS = [
  ...CANONICAL_CONVENTION_DOCS.map(d => d.output),
  ...USER_MANAGED_CONVENTION_DOCS.map(d => d.output),
  ...PLACEHOLDER_CONVENTION_DOCS,
];

/**
 * A curated document that `prospec init` creates.
 */
export interface InitDoc {
  /** Handlebars template path under `src/templates/`. */
  template: string;
  /**
   * Directory the doc lives under: `base` = the base dir (`paths.base_dir`),
   * `knowledge` = the knowledge base (`knowledge.base_path`, which a user may
   * relocate away from `<base_dir>/ai-knowledge` — consumers must resolve it
   * via `resolveBasePaths`, never by joining `base_dir + 'ai-knowledge'`).
   */
  root: 'base' | 'knowledge';
  /** Output path relative to the root directory. */
  output: string;
  /**
   * Which render context the template needs; absent = the standard init
   * context. Declared here so consumers key off the registry, never off a
   * template-path string comparison (which drifts silently — Handlebars is
   * non-strict, so a wrong context renders empty holes, not an error).
   */
  context?: 'index';
}

/**
 * Every curated document `prospec init` creates — the single source both
 * `init.service` (create) and `upgrade.service` (docs-inventory report) derive
 * from, so the upgrade flow can never drift out of sync with what init seeds.
 *
 * Deliberately excluded: `AGENTS.md` (zone-1 generated, owned by agent sync)
 * and `specs/.gitkeep` (not a document). Entries keep init's write order.
 */
/** Project a convention-doc source into its knowledge-rooted registry entry. */
export const asKnowledgeInitDoc = (doc: ConventionDocSource): InitDoc => ({
  template: doc.template,
  root: 'knowledge',
  output: doc.output,
});

export const INIT_DOC_REGISTRY: InitDoc[] = [
  { template: 'init/constitution.md.hbs', root: 'base', output: 'CONSTITUTION.md' },
  ...USER_MANAGED_CONVENTION_DOCS.map(asKnowledgeInitDoc),
  { template: 'knowledge/index.md.hbs', root: 'base', output: 'index.md', context: 'index' },
  ...CANONICAL_CONVENTION_DOCS.map(asKnowledgeInitDoc),
];

/**
 * Core convention files (L1) that agents must read at the start of every task.
 * Any convention not in this list is treated as a load-on-demand (L2) convention.
 * `_playbook.md` is deliberately absent: feedback-promotion governance keeps it
 * load-on-demand (progressive disclosure, TTL-governed), never core.
 */
export const CORE_CONVENTIONS = [
  '_conventions.md',
  '_diagram-conventions.md',
  '_glossary.md',
  '_status-lifecycle.md',
];
