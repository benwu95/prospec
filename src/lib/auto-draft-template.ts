import { renderTemplate } from './template.js';

/**
 * Context for the auto-drafted change proposal.
 *
 * The proposal is scaffolding, not finished prose: only the drift facts are
 * authoritative, and the template says so. Its headings are English like every
 * other shipped template — the language the project actually writes artifacts in
 * is named in the template, not assumed by hardcoding one.
 */
export interface AutoDraftProposalOptions {
  target: string;
  checkId: string;
  /** One entry per finding, each carrying its OWN path — a group that merged
   *  unattributable subjects must still say which file each line is about. */
  items: Array<{ detail: string; sourcePath: string }>;
  /** Every distinct remedy the group's findings reported, never just the first. */
  remedies: string[];
  /** The module from `module-map.yaml`, when the findings attributed to one.
   *  Absent makes the proposal say so instead of presenting `target` as a module. */
  module?: string;
  /** The project's `artifact_language`, so the template can state the obligation. */
  artifactLanguage: string;
  /** Whether `artifactLanguage` is the default English (no rewrite obligation). */
  languageIsEnglish: boolean;
  /** The project's resolved Constitution path — joined, never concatenated, so
   *  a `paths.base_dir` of `.` cannot render a root-anchored `/CONSTITUTION.md`. */
  constitutionPath: string;
  /** The command that produced this draft, so a manually targeted change does
   *  not claim a report it never read. */
  draftedBy: string;
}

/**
 * Collapse a report-supplied string to one line.
 *
 * The proposal is markdown, so the template interpolates raw (escaping would
 * corrupt it) — which means a value carrying newlines is not confined to its
 * bullet. A `detail` holding `\n## UI Scope\n**Scope:** full` forges a heading
 * `status`'s `parseUiScope` then reads as this change's routing fact. A drift
 * finding's detail is a one-line description by contract; this makes it one.
 */
const oneLine = (value: string): string => value.replace(/\s*[\r\n]+\s*/g, ' ').trim();

/** Render proposal.md content for an auto-drafted drift fix. */
export function buildAutoDraftProposal(options: AutoDraftProposalOptions): string {
  return renderTemplate('change/auto-draft-proposal.md.hbs', {
    target: oneLine(options.target),
    check_id: oneLine(options.checkId),
    items: options.items.map((i) => ({
      detail: oneLine(i.detail),
      sourcePath: oneLine(i.sourcePath),
    })),
    remedies: options.remedies.map(oneLine),
    module: options.module,
    artifact_language: options.artifactLanguage,
    language_is_english: options.languageIsEnglish,
    constitution_path: options.constitutionPath,
    drafted_by: options.draftedBy,
  });
}
