import { isSafeResourceName, listFeatureSpecs, loadFeatureSpecContent } from './knowledge-reader.js';
import { indexSpec, type SpecContent } from './spec-headings.js';
import { selectSpecSlices, type SpecSelection } from './spec-slices.js';

/**
 * The one entry below the service layer that turns a feature name plus optional
 * selectors into the source a narrow-read surface serves (REQ-LIB-055). The CLI
 * `spec show` service and the MCP `get_spec_requirements` tool both route their
 * feature resolution, contained read, selector expansion and slice selection
 * through here, so the parsing and messaging layers cannot answer one question two
 * ways — the drift PR #149's review caught twice. Only the "no-selector" policy,
 * deliberately different between the two surfaces, stays above.
 *
 * WHAT to quote is still the pure `spec-slices`/`spec-headings` functions this
 * composes (REQ-LIB-046 unchanged); this module adds the I/O and the resolution,
 * not a second parse.
 */

export interface SpecReadSelectors {
  /** REQ ids; each entry may itself be a comma-separated list. */
  req?: string[];
  /** Story ids (`US-1`); same comma tolerance. */
  story?: string[];
}

export type SpecReadResult =
  /** The name resolved to nothing (absent, archived, or unsafe). `available` is
   *  the guard-filtered list of specs that DO exist — the actionable half of a
   *  refusal, so a surface names it without echoing the caller-supplied name. */
  | { status: 'not-found'; available: string[] }
  /** Read succeeded but no usable selector remained after expansion. `content`
   *  lets a surface render the whole spec; `flagsGiven` is the RAW flag count, so a
   *  surface can tell "no flag at all" from "a flag that carried no usable id". */
  | { status: 'no-selector'; content: SpecContent; flagsGiven: number }
  /** Read succeeded and selectors matched the selection engine. `req`/`story` are
   *  the EXPANDED selectors, so a surface can label a miss by the flag it came from. */
  | { status: 'sliced'; selection: SpecSelection; req: string[]; story: string[] };

/** One flag may carry several ids; both shapes must reach one selector set. */
function expand(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((value) => value.split(',')).filter((v) => v.trim() !== '');
}

/**
 * Resolve a feature, read it contained, expand its selectors and select the
 * slices — as a discriminated result, so each surface applies its own no-selector
 * policy on top. The read is the file on disk at that moment (via
 * `loadFeatureSpecContent`), never cached: a station judging a merged spec must see
 * what was actually written.
 */
export function readSpecSlices(
  featuresDir: string,
  feature: string,
  selectors: SpecReadSelectors,
): SpecReadResult {
  const loaded = loadFeatureSpecContent(featuresDir, feature);
  const content = loaded ? loaded.specContent : null;
  if (content === null) {
    // Filtered like the MCP listing: naming a spec the read path would refuse
    // anyway makes the refusal an inventory of unreadable files.
    return { status: 'not-found', available: listFeatureSpecs(featuresDir).filter(isSafeResourceName) };
  }
  const req = expand(selectors.req);
  const story = expand(selectors.story);
  if (req.length === 0 && story.length === 0) {
    // A selector FLAG that expands to nothing is not the same as no flag at all:
    // the surface reads `flagsGiven` to keep those two apart.
    const flagsGiven = (selectors.req ?? []).length + (selectors.story ?? []).length;
    return { status: 'no-selector', content, flagsGiven };
  }
  const selection = selectSpecSlices(content, indexSpec(content, { includeStruck: true }), {
    req,
    story,
  });
  return { status: 'sliced', selection, req, story };
}

/**
 * The whole spec text — the main file, then each slice body — for the CLI
 * whole-spec fallback and the MCP `spec://feature/{name}` resource alike, so the
 * two surfaces cannot disagree on what "the whole spec" is.
 */
export function assembleWholeSpec(content: SpecContent): string {
  if (typeof content === 'string') return content;
  return content.main + '\n\n' + Object.values(content.slices).join('\n\n');
}

/**
 * reqId → the feature slugs whose spec defines it, across every feature spec
 * (main file plus slices). The cross-feature REQ-location index
 * `classifyRoutingResolution` reads to decide whether a delta-spec's `**Feature:**`
 * routing header actually hosts its REQ id. Struck REQs are included
 * (`includeStruck`) so a deprecated REQ still counts as defined — the same walk and
 * rule `collectReqDefinitions` and the narrow REQ read build on, so the routing
 * verdict never disagrees with what those surfaces consider a definition.
 */
export function buildReqHomeIndex(featuresDir: string): Map<string, Set<string>> {
  const homes = new Map<string, Set<string>>();
  for (const feature of listFeatureSpecs(featuresDir)) {
    const loaded = loadFeatureSpecContent(featuresDir, feature);
    if (loaded === null) continue;
    for (const req of indexSpec(loaded.specContent, { includeStruck: true }).requirements) {
      const carriers = homes.get(req.id) ?? new Set<string>();
      carriers.add(feature);
      homes.set(req.id, carriers);
    }
  }
  return homes;
}
