import { readTemplateSource } from '../lib/template.js';

export interface ConfigExampleResult {
  /** The complete annotated `.prospec.yaml` reference text. */
  content: string;
}

/**
 * Return the complete annotated `.prospec.yaml` reference — every field prospec
 * reads, each with an example value and note — from the single bundled template.
 *
 * Static (no per-project rendering): the example documents the schema, not a
 * specific project, so it is safe to run before `prospec init`.
 */
export async function execute(): Promise<ConfigExampleResult> {
  return { content: readTemplateSource('references/config-example.yaml.hbs') };
}
