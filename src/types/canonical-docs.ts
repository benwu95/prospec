/**
 * Canonical / shipped convention docs — tracked but never user-customized.
 *
 * `prospec init` seeds these. The CLI never re-renders them on upgrade; refreshing
 * an init-created doc to the latest template is the consent-gated `/prospec-upgrade`
 * skill's job. This const is the single source for *which* docs are canonical.
 */
export interface CanonicalDoc {
  /** Handlebars template path under `src/templates/`. */
  template: string;
  /** Output filename under the knowledge base directory. */
  output: string;
}

export const CANONICAL_CONVENTION_DOCS: CanonicalDoc[] = [
  { template: 'init/status-lifecycle.md.hbs', output: '_status-lifecycle.md' },
  { template: 'init/module-readme-conventions.md.hbs', output: '_module-readme-conventions.md' },
  { template: 'init/diagram-conventions.md.hbs', output: '_diagram-conventions.md' },
];
