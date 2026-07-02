import { INDEX_TABLE_COLUMNS } from '../types/knowledge.js';

/**
 * Context for `knowledge/index.md.hbs` and its `index-auto-block` partial.
 *
 * Single source for every index.md emitter (init, knowledge init, knowledge
 * generate, knowledge update) — the template consumes `base_dir` and expects
 * `index_table_columns` pre-joined, so building the context by hand risks the
 * emitters drifting apart (a missing `base_dir` renders "`/index.md`").
 */
export interface IndexTemplateOptions {
  projectName: string;
  techStack?: {
    language?: string;
    framework?: string;
    package_manager?: string;
  };
  /** Base dir relative to the repo root, forward slashes (e.g. `prospec`). */
  baseDir: string;
  /** Knowledge base relative to the repo root, forward slashes. */
  knowledgeBasePath: string;
  coreConventions: string[];
  demandConventions: string[];
  /** Prerendered Markdown module table (header + separator + rows). */
  modulesTable?: string;
}

export function buildIndexTemplateContext(
  options: IndexTemplateOptions,
): Record<string, unknown> {
  return {
    project_name: options.projectName,
    tech_stack: options.techStack,
    base_dir: options.baseDir,
    knowledge_base_path: options.knowledgeBasePath,
    core_conventions: options.coreConventions,
    demand_conventions: options.demandConventions,
    index_table_columns: INDEX_TABLE_COLUMNS.join(' | '),
    modules_table: options.modulesTable,
  };
}
