import * as path from 'node:path';
import type { ProspecConfig } from '../types/config.js';
import { DEFAULT_BASE_DIR } from '../types/config.js';
import type { InitDoc } from '../types/conventions.js';
import { ALL_INITIAL_CONVENTION_DOCS } from '../types/conventions.js';
import type { TechStackResult } from './detector.js';
import { resolveBasePaths, resolveArtifactLanguage } from './config.js';
import { renderTemplate } from './template.js';
import { filterConventions } from './scanner.js';
import { buildIndexTemplateContext } from './index-template.js';
import { languagePolicyRule, exampleRulesFor } from './constitution-rules.js';

/**
 * The two Handlebars render contexts every `INIT_DOC_REGISTRY` doc needs.
 *
 * `standard` feeds all curated docs except the index; `index` feeds the doc
 * whose `context` is `'index'`. Both are derived purely from `.prospec.yaml`, so
 * a doc renders identically whether `prospec init` (greenfield) or
 * `prospec upgrade` (backfilling a missing doc) drives it — the single source
 * that stops the two commands' render logic from drifting apart.
 */
export interface InitDocContexts {
  standard: Record<string, unknown>;
  index: Record<string, unknown>;
}

/**
 * A resolved init-doc location: the absolute path to read/write and the
 * project-relative label to display. Knowledge-rooted docs resolve through
 * `resolveBasePaths().knowledgePath`, so a project that relocated
 * `knowledge.base_path` away from `<base_dir>/ai-knowledge` is handled at its
 * ACTUAL location — never the default path.
 */
export interface InitDocLocation {
  absPath: string;
  label: string;
}

/**
 * Build both render contexts from a resolved config.
 *
 * The `index` context passes no `modulesTable` — the same baseline `prospec
 * init` writes (an empty module table). `prospec upgrade` therefore backfills a
 * baseline `index.md`; enriching it with the real module table (and migrating a
 * legacy `_index.md`'s curated columns) stays the `/prospec-upgrade` skill's job.
 */
export function buildInitDocContexts(
  config: ProspecConfig,
  cwd: string,
): InitDocContexts {
  const { knowledgePath } = resolveBasePaths(config, cwd);
  const baseDir = config.paths?.base_dir ?? DEFAULT_BASE_DIR;
  const artifactLanguage = resolveArtifactLanguage(config);
  const techStack = (config.tech_stack ?? {}) as TechStackResult;

  const standard: Record<string, unknown> = {
    project_name: config.project.name,
    tech_stack: config.tech_stack,
    agents: config.agents ?? [],
    base_dir: baseDir,
    artifact_language: artifactLanguage,
    example_rules: [languagePolicyRule(artifactLanguage), ...exampleRulesFor(techStack)],
  };

  const { core: coreConventions, demand: demandConventions } =
    filterConventions(ALL_INITIAL_CONVENTION_DOCS);

  const index = buildIndexTemplateContext({
    projectName: config.project.name,
    techStack: config.tech_stack,
    baseDir,
    knowledgeBasePath: path.relative(cwd, knowledgePath).replace(/\\/g, '/'),
    coreConventions,
    demandConventions,
  });

  return { standard, index };
}

/**
 * Render one registry doc with the context its `InitDoc.context` selects.
 * Keying off the declared field (never a template-path string comparison) is
 * the registry's contract: Handlebars is non-strict, so the wrong context
 * renders empty holes instead of erroring.
 */
export function renderInitDoc(doc: InitDoc, contexts: InitDocContexts): string {
  return renderTemplate(
    doc.template,
    doc.context === 'index' ? contexts.index : contexts.standard,
  );
}

/**
 * Resolve a registry doc's absolute path and project-relative label at its
 * ACTUAL location (base docs under `paths.base_dir`, knowledge docs under the
 * resolved `knowledge.base_path`). The single source the docs inventory,
 * init's writes, and upgrade's backfill all share, so a doc is never checked
 * at one path and written at another.
 */
export function resolveInitDocLocation(
  doc: InitDoc,
  config: ProspecConfig,
  cwd: string,
): InitDocLocation {
  const { baseDir, knowledgePath } = resolveBasePaths(config, cwd);
  const baseLabel = config.paths?.base_dir ?? DEFAULT_BASE_DIR;
  const knowledgeLabel = path.relative(cwd, knowledgePath).split(path.sep).join('/');

  const rootDir = doc.root === 'knowledge' ? knowledgePath : baseDir;
  const rootLabel = doc.root === 'knowledge' ? knowledgeLabel : baseLabel;

  return {
    absPath: path.join(rootDir, doc.output),
    label: `${rootLabel}/${doc.output}`,
  };
}
