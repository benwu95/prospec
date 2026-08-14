import * as path from 'node:path';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { assembleWholeSpec, readSpecSlices } from '../lib/spec-read.js';
import { renderSpecSlices, type SpecSlice } from '../lib/spec-slices.js';
import { PrerequisiteError } from '../types/errors.js';

/**
 * `prospec spec show` — the REQ-scoped feature-spec read (REQ-SERVICES-084).
 *
 * verify and archive judge a change against the requirements it touches, not
 * against a whole capability record: `sdd-workflow.md` alone is over ten times the
 * per-file spec budget, and it grows with every archived change rather than with
 * this one. Feature resolution, the contained read, selector expansion and slice
 * selection all live in the shared `lib/spec-read` entry the MCP tool routes
 * through too — so the two surfaces cannot answer one question two ways. This
 * service adds no parse of its own; it applies only its own no-selector policy
 * (whole spec when no flag, refuse when a flag carries no usable id).
 *
 * The read is the file on disk at that moment, deliberately: archive's graduation
 * judges the MERGED spec (PB-015), so a cached or reconstructed copy would answer
 * a different question than the one asked.
 */

export interface SpecShowOptions {
  cwd?: string;
  /** Feature slug — the spec's filename without `.md`. */
  feature: string;
  /** REQ ids; each entry may itself be a comma-separated list. */
  req?: string[];
  /** Story ids (`US-1`); same comma tolerance. */
  story?: string[];
}

export interface SpecShowResult {
  feature: string;
  /** Repo-relative path of the spec that was read. */
  path: string;
  slices: SpecSlice[];
  /** Selectors that matched nothing, each with the flag it came from — the caller
   *  decides how loudly to say so, and can name the right KIND while doing it. */
  misses: { selector: string; kind: 'req' | 'story' }[];
  /** The rendered source: the selected slices, or the whole spec when unselected. */
  text: string;
}

export async function execute(options: SpecShowOptions): Promise<SpecShowResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  const paths = resolveBasePaths(config, cwd);
  const featuresDir = path.join(paths.specsPath, 'features');
  const relPath = path.relative(cwd, path.join(featuresDir, `${options.feature}.md`));

  // One reader, one refusal: the shared entry resolves through `readFeatureSpec`,
  // which already enforces realpath containment, the `_archived*` exclusion and the
  // resource-name guard, so a traversing or escaped name never reaches the
  // filesystem through this service.
  const result = readSpecSlices(featuresDir, options.feature, {
    req: options.req,
    story: options.story,
  });

  if (result.status === 'not-found') {
    // Filtered like the MCP listing: naming a spec the read path would refuse
    // anyway makes the refusal an inventory of unreadable files.
    throw new PrerequisiteError(
      `no active feature spec named "${options.feature}"`,
      result.available.length === 0
        ? 'No feature specs exist yet — they are written by /prospec-archive'
        : `Available feature specs: ${result.available.join(', ')}`,
    );
  }

  if (result.status === 'no-selector') {
    // A selector FLAG that expands to nothing is not the same as no flag at all.
    // `--req ''`, `--req ,` and `--req '  '` used to fall into the whole-spec branch
    // and print the entire capability record with exit 0 — silently restoring the
    // read this command exists to replace, and a station loop produces exactly that
    // argument when its REQ list is empty.
    if (result.flagsGiven > 0) {
      throw new PrerequisiteError(
        `no usable id in the selectors given for "${options.feature}"`,
        'Pass at least one REQ id or story id, or omit --req/--story entirely to print the whole spec',
      );
    }
    return { feature: options.feature, path: relPath, slices: [], misses: [], text: assembleWholeSpec(result.content) };
  }

  return {
    feature: options.feature,
    path: relPath,
    slices: result.selection.slices,
    // The KIND comes from the flag the selector arrived on, never guessed from its
    // shape: `--story 34` is a story miss and `--req us-1` is a requirement miss,
    // and a shape heuristic mislabelled both.
    misses: result.selection.misses.map((selector) => ({
      selector,
      kind: result.story.some((s) => s.trim().toUpperCase() === selector) ? 'story' : 'req',
    })),
    text: renderSpecSlices(result.selection),
  };
}
