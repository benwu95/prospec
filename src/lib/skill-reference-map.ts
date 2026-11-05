/**
 * Pure projections of the station reference registry.
 *
 * Everything here is data in, data out: no filesystem, no Handlebars, no
 * services. `prospec status` calls this on its ordinary path, so a dependency on
 * the template engine here would put the renderer on that path too.
 */
import type { ChangeScale } from '../types/change.js';
import { TemplateError } from '../types/errors.js';
import type { StationReferenceMapRow } from '../types/status.js';
import {
  STATION_REFERENCES,
  type StationReferenceFile,
  type StationReferenceUse,
} from '../types/station-references.js';

/** What the caller knows about the change the map is being projected for. */
export interface ReferenceApplicability {
  scale: ChangeScale;
}

export interface StatusReferenceOptions extends ReferenceApplicability {
  /** Deployment root of the resolved agent, e.g. `.claude/skills`. */
  skillPath: string;
  /** Resolves project targets; omitted leaves them out rather than guessing. */
  knowledgeBasePath?: string;
}

/** Deployed path of a reference under a skill, always forward-slashed. */
export const referenceDeploymentPath = (skillPath: string, skillName: string, outputName: string): string =>
  `${skillPath}/${skillName}/references/${outputName}`;

/**
 * The files a skill deploys, in registry order. A reference read at several load
 * points is ONE file: deduplication happens here, never in the load points.
 */
export function projectStationDeployment(skillName: string): StationReferenceFile[] {
  return [...(STATION_REFERENCES[skillName]?.files ?? [])];
}

/**
 * Whether a load point applies to a change. Only the scale is decided here; any
 * other runtime condition stays visible as the load point's `conditionHint`.
 */
export function isUseApplicable(use: StationReferenceUse, facts: ReferenceApplicability): boolean {
  return use.scales === undefined || use.scales.includes(facts.scale);
}

/**
 * One row per applicable load point, in registry order — the map `prospec status`
 * prints for the next station. A reference read at two phases is two rows: the
 * map is of load points, not of files.
 */
export function projectStatusReferenceMap(
  skillName: string,
  options: StatusReferenceOptions,
): StationReferenceMapRow[] {
  const rows: StationReferenceMapRow[] = [];
  for (const use of STATION_REFERENCES[skillName]?.uses ?? []) {
    if (!isUseApplicable(use, options)) continue;
    const referencePath = resolveTarget(use, skillName, options.skillPath, options.knowledgeBasePath);
    if (referencePath === undefined) continue;
    rows.push({
      phase: use.phase,
      referencePath,
      purpose: use.purpose,
      loading: use.loading,
      ...(use.conditionHint === undefined ? {} : { conditionHint: use.conditionHint }),
    });
  }
  return rows;
}

/**
 * The paths a load point names, or undefined when it names a project file and
 * the caller supplied no project root — an unresolved path is omitted, never
 * emitted with a placeholder in it.
 */
function resolveTarget(
  use: StationReferenceUse,
  skillName: string,
  skillPath: string,
  knowledgeBasePath: string | undefined,
): string | undefined {
  if (use.target.kind === 'reference') {
    return referenceDeploymentPath(skillPath, skillName, use.target.reference);
  }
  if (knowledgeBasePath === undefined) return undefined;
  return use.target.path.replace('{{knowledge_base_path}}', knowledgeBasePath);
}

/**
 * The loads a station's Startup Loading marks `**MANDATORY**`, as deployed
 * paths — the dependency edges the workflow-eval mandatory inventory declares.
 *
 * Deliberately narrower than "what a run must read": `startup-conditional` reads
 * are required too, but the recorded ceilings were measured from the literal
 * marker, and widening the metric here would silently move every one of them.
 */
export function projectStartupMandatory(
  skillName: string,
  options: { skillPath: string; knowledgeBasePath: string },
): string[] {
  const paths: string[] = [];
  for (const use of STATION_REFERENCES[skillName]?.uses ?? []) {
    if (use.loading !== 'startup-mandatory') continue;
    const resolved = resolveTarget(use, skillName, options.skillPath, options.knowledgeBasePath);
    if (resolved !== undefined && !paths.includes(resolved)) paths.push(resolved);
  }
  return paths;
}

/** How one citation is written inside a slot. */
function citation(outputName: string, style: 'link' | 'code'): string {
  const target = `references/${outputName}`;
  return style === 'code' ? `\`${target}\`` : `[\`${target}\`](${target})`;
}

/**
 * The prose a registry-owned map slot renders, in place, inside a skill template.
 *
 * Throws rather than returning an empty string for an unknown skill or slot: a
 * map that silently renders to nothing is exactly the failure this registry
 * exists to prevent, and a template typo must not survive a sync.
 */
export function renderStationReferenceSlot(skillName: string, slotId: string): string {
  const entry = STATION_REFERENCES[skillName];
  if (entry === undefined) {
    throw new TemplateError(
      `Unknown skill '${skillName}' in a station reference slot`,
      'Name a skill declared in STATION_REFERENCES (src/types/station-references.ts)',
    );
  }
  const slot = entry.slots.find((candidate) => candidate.id === slotId);
  if (slot === undefined) {
    throw new TemplateError(
      `Unknown station reference slot '${slotId}' for '${skillName}'`,
      `Declare the slot in STATION_REFERENCES, or use one of: ${entry.slots.map((s) => s.id).join(', ') || '(none)'}`,
    );
  }
  const byId = new Map(entry.uses.map((use) => [use.id, use]));
  const groups = slot.groups.map((group) => {
    const citations = group.uses.map((id) => {
      const use = byId.get(id);
      if (use === undefined) {
        throw new TemplateError(
          `Station reference slot '${slotId}' of '${skillName}' names unknown use '${id}'`,
          'Every slot group entry must be a use id declared on the same skill',
        );
      }
      if (use.target.kind !== 'reference') {
        throw new TemplateError(
          `Station reference slot '${slotId}' of '${skillName}' renders project target '${id}'`,
          'A slot renders deployed references only; a project file stays in the template prose',
        );
      }
      return citation(use.target.reference, group.style ?? 'link');
    });
    const last = group.lastJoiner ?? group.joiner;
    const joined =
      citations.length > 1
        ? `${citations.slice(0, -1).join(group.joiner)}${last}${citations[citations.length - 1]!}`
        : (citations[0] ?? '');
    return `${group.lead ?? ''}${joined}${group.tail}`;
  });
  return `${slot.prefix ?? ''}${groups.join(slot.groupSeparator ?? ', ')}${slot.suffix ?? ''}`;
}
