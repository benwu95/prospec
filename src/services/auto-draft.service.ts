import * as path from 'node:path';
import { deriveFixChangeName, normalizeIssueRef, sanitizeChangeSlug } from '../lib/change-metadata.js';

import {
  isDefaultArtifactLanguage,
  readConfig,
  resolveArtifactLanguage,
  resolveBasePaths,
} from '../lib/config.js';
import { isDraftableFinding } from '../lib/draftable-findings.js';
import { moduleAttributor } from '../lib/drift-sources.js';
import { readFileIfExists } from '../lib/fs-utils.js';
import { loadModuleMap } from '../lib/knowledge-reader.js';
import { buildAutoDraftProposal } from '../lib/auto-draft-template.js';
import { execute as changeStoryExecute } from './change-story.service.js';
import type { AutoDraftOptions, AutoDraftResult, DraftedChange } from '../types/auto-draft.js';
import type { ChangeScale } from '../types/change.js';
import type { DriftCheckId, DriftFinding } from '../types/drift-report.js';
import { DriftReportSchema } from '../types/drift-report.js';
import { AlreadyExistsError, PrerequisiteError } from '../types/errors.js';

/**
 * The scale each drift check's fix is drafted at.
 *
 * Exhaustive over `DRIFT_CHECK_IDS` on purpose: typed as a total Record, so
 * adding a check to the frozen registry fails to compile until someone decides
 * how its fix should be drafted. A hand-listed switch answered `standard` for a
 * new id silently, and that is the one question this table exists to ask.
 */
const SCALE_BY_CHECK: Record<DriftCheckId, ChangeScale> = {
  'req-references': 'standard',
  'file-paths': 'quick',
  'import-direction': 'standard',
  'knowledge-health': 'standard',
  'task-completion': 'standard',
  'dangling-prefix': 'standard',
  'feature-modules': 'standard',
  'mcp-readme-counts': 'quick',
  'review-provenance': 'standard',
  'metadata-completeness': 'quick',
  'knowledge-size': 'quick',
  'test-provenance': 'standard',
  'constitution-severity': 'standard',
  'artifact-language': 'quick',
  'spec-counters': 'quick',
  'delta-spec-provenance': 'standard',
  'unjustified-budget-override': 'quick',
  'canonical-doc-drift': 'quick',
  // Never actually drafted: its findings anchor to a `.prospec/changes/**/delta-spec.md`
  // path, which `isDraftableFinding` excludes (the fix is editing that same change's
  // delta-spec, not opening a new one). The value is a placeholder the total Record demands.
  'delta-spec-landing-fidelity': 'quick',
  // A fix renumbers a colliding REQ id in the trust zone and sweeps its
  // references — spec-touching, cross-file work like req-references.
  'req-id-uniqueness': 'standard',
};

/**
 * Determine the default change scale for a check id.
 *
 * `--check` is free-form, so an id outside the registry is legitimate here and
 * takes `standard` — the safe direction, since it only adds stations.
 */
function defaultScaleForCheck(checkId: string): ChangeScale {
  return SCALE_BY_CHECK[checkId as DriftCheckId] ?? 'standard';
}

/** What a finding's `source_path` was attributed to, and whether that is a real module. */
interface Attribution {
  target: string;
  /** Set only when `target` is a name from module-map.yaml, so it is safe as `related_modules`. */
  module?: string;
}

/**
 * Attribute a finding to a subject, using the project's CONFIGURED roots.
 *
 * Path shapes are never guessed by literal regex: `knowledge.base_path` and
 * `paths.base_dir` are both configurable, and module ownership is already
 * declared in module-map.yaml. A finding that matches nothing is `general` —
 * never the file basename, which manufactured module names like `README` for
 * every module at once and merged their findings into a single change.
 */
function attributeFinding(
  finding: DriftFinding,
  roots: {
    knowledgeRel: string;
    specsRel: string;
    toModule: (relPath: string) => string | null;
    declared: ReadonlySet<string>;
  },
): Attribution {
  const normPath = finding.source_path.replace(/\\/g, '/');

  // path.posix.join, never concatenation: `knowledge.base_path: "."` relativises
  // to '' and `${''}/modules/` is the root-anchored '/modules/', which no
  // repo-relative source_path can start with. The generator side already joins.
  const modulesRoot = `${path.posix.join(roots.knowledgeRel, 'modules')}/`;
  if (normPath.startsWith(modulesRoot)) {
    const name = normPath.slice(modulesRoot.length).split('/')[0];
    // Claimed as a MODULE only when module-map declares that name. The segment
    // is raw report text: a stray `*` or backtick in it would be refused by
    // BareModuleNameSchema at the metadata write — after proposal.md was
    // already on disk. (Path attribution cannot answer this: module-map's
    // `paths` point at source, never at the knowledge tree.)
    if (name && roots.declared.has(name)) return { target: name, module: name };
    if (name) return { target: name };
  }

  const attributed = roots.toModule(normPath);
  if (attributed) return { target: attributed, module: attributed };

  const featuresRoot = `${path.posix.join(roots.specsRel, 'features')}/`;
  if (normPath.startsWith(featuresRoot)) {
    const rest = normPath.slice(featuresRoot.length).split('/')[0];
    if (rest) return { target: path.basename(rest, path.extname(rest)) };
  }

  return { target: 'general' };
}

/**
 * One change's worth of drift.
 *
 * Carries the facts the proposal needs rather than the raw findings: every
 * finding contributes its own detail AND its own path, so a group that merges
 * unrelated subjects under `general` still says which file each line is about.
 */
interface FindingGroup {
  target: string;
  module?: string;
  checkId: string;
  items: Array<{ detail: string; sourcePath: string }>;
  remedies: string[];
}

/**
 * Group findings by target and check id to avoid excessive fragmented changes.
 */
function groupFindings(
  findings: DriftFinding[],
  roots: Parameters<typeof attributeFinding>[1],
): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();

  for (const finding of findings) {
    const { target, module } = attributeFinding(finding, roots);
    const key = `${target}:${finding.check}`;
    const item = { detail: finding.detail, sourcePath: finding.source_path };
    const remedy = finding.knowledge_size?.remedy;

    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      // Every DISTINCT remedy, not the first one: a merged group whose findings
      // converge differently must not present one arbitrary fix as the fix.
      if (remedy && !existing.remedies.includes(remedy)) existing.remedies.push(remedy);
      // A later finding may attribute what an earlier one could not. Leaving
      // the group unattributed would make `related_modules` depend on the
      // report's ORDER — the same two findings, swapped, giving two answers.
      if (existing.module === undefined && module !== undefined) existing.module = module;
    } else {
      groups.set(key, {
        target,
        ...(module !== undefined ? { module } : {}),
        checkId: finding.check,
        items: [item],
        remedies: remedy ? [remedy] : [],
      });
    }
  }

  return Array.from(groups.values());
}

/**
 * The change name for one group — a pure function of that group alone.
 *
 * `deriveFixChangeName` sanitises to a `[a-z0-9_-]` slug, so several different
 * targets flatten onto the same name: every non-Latin target becomes the empty
 * slug and then `general`, and `a/b` and `a-b` both become `a-b`. Two groups
 * sharing a name is not a collision that can be papered over — the first writes
 * the change, the second is refused by the existence check and reported as
 * `skipped` in the exact words real idempotency uses, and its findings vanish.
 *
 * So the suffix is appended whenever the slug is LOSSY, judged from the target
 * alone. Deciding it from "did any other group in this run collide" would make
 * a change's directory depend on what else the report happened to contain: the
 * same target would land in `fix-general-x` on one run and
 * `fix-general-x-9z6ib9` on the next, and re-drafting would create a second
 * change instead of skipping the first.
 */
function changeNameFor(group: FindingGroup): string {
  const base = deriveFixChangeName(group.target, group.checkId);
  return slugIsLossy(group.target) ? `${base}-${stableSuffix(group.target)}` : base;
}

/**
 * Whether the slugger cannot round-trip this target, i.e. whether some OTHER
 * target could produce the same slug.
 *
 * Not "is it non-ASCII": `a/b`, `A B` and `x--y` are all lossy too. The test is
 * the general one — does the target already read as its own slug?
 */
function slugIsLossy(target: string): boolean {
  return sanitizeChangeSlug(target) !== target;
}

/** A short, stable, slug-safe fingerprint of a string the slugger cannot keep. */
function stableSuffix(value: string): string {
  let hash = 0x811c9dc5;
  for (const ch of value) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).slice(0, 6);
}

/** Read and validate a drift report, naming which of the three failures happened. */
async function readReport(cwd: string, relPath: string): Promise<DriftFinding[]> {
  const text = await readFileIfExists(path.resolve(cwd, relPath));
  // `readFileIfExists` returns '' for ENOENT only; a real read error propagates.
  // Absent, empty and malformed are three different things to fix, so they get
  // three different sentences.
  if (text === '') {
    throw new PrerequisiteError(
      `Drift report not found or empty: ${relPath} — run \`prospec check --json\` to generate it`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new PrerequisiteError(
      `${relPath} is not valid JSON (${err instanceof Error ? err.message : String(err)}) — regenerate it with \`prospec check --json\``,
    );
  }

  const parsed = DriftReportSchema.safeParse(json);
  if (!parsed.success) {
    // The field paths, not the raw ZodError dump: the issue array runs to dozens
    // of lines and buries the one fact the user can act on.
    const fields = parsed.error.issues.slice(0, 5).map((i) => i.path.join('.') || '(root)');
    const more = parsed.error.issues.length > fields.length ? ', …' : '';
    throw new PrerequisiteError(
      `${relPath} does not match the drift report schema (${fields.join(', ')}${more}) — regenerate it with \`prospec check --json\``,
    );
  }
  return parsed.data.structural.findings;
}

/**
 * Auto-draft service: converts drift findings or manual targets into
 * standard change proposals under `.prospec/changes/fix-<target>-<check-id>/`.
 */
export async function execute(options: AutoDraftOptions = {}): Promise<AutoDraftResult> {
  const cwd = options.cwd ?? process.cwd();
  const changesDir = path.resolve(cwd, '.prospec/changes');

  const fromSource = options.fromReport !== undefined || options.findings !== undefined;
  const manual =
    options.target !== undefined || options.reason !== undefined || options.checkId !== undefined;
  if (manual && fromSource) {
    // `--check` is listed here too: with a report source every group takes its
    // check id from the finding, so the flag would be accepted and dropped.
    throw new PrerequisiteError(
      'Give either a drift report or an explicit --target/--reason/--check, not both — otherwise one of them is silently ignored',
    );
  }

  let rawFindings: DriftFinding[] = [];
  // An explicitly named `--target` is the caller's answer, not something to
  // re-derive: it is usually not a path at all, so path attribution would
  // silently rename their change to `fix-general-*`.
  let manualGroup: FindingGroup | undefined;

  const config = await readConfig(cwd);
  const { constitutionPath, knowledgePath, specsPath } = resolveBasePaths(config, cwd);
  const artifactLanguage = resolveArtifactLanguage(config);
  const moduleMap = loadModuleMap(knowledgePath, cwd);
  const toPosixRel = (abs: string): string => path.relative(cwd, abs).replace(/\\/g, '/');
  const roots = {
    knowledgeRel: toPosixRel(knowledgePath),
    specsRel: toPosixRel(specsPath),
    toModule: moduleMap ? moduleAttributor(moduleMap) : () => null,
    declared: new Set(moduleMap?.modules.map((m) => m.name) ?? []),
  };

  if (manual) {
    const target = options.target || 'general';
    // No synthetic DriftFinding: `--check` is free-form and `'drift'` is not in
    // the frozen id vocabulary, so casting one into the report type would put a
    // value on the wire that no consumer of that type may see.
    manualGroup = {
      target,
      ...(roots.declared.has(target) ? { module: target } : {}),
      checkId: options.checkId || 'drift',
      items: [
        {
          detail: options.reason || `Manual drift fix request for ${target}`,
          sourcePath: target,
        },
      ],
      remedies: [],
    };
  } else if (options.findings !== undefined) {
    // Presence, not truthiness — the same rule `fromSource` above applies.
    // An EMPTY finding list is a caller saying "nothing to draft", which is a
    // clean run; treating it as "no source given" turned that into an error.
    rawFindings = options.findings;
  } else if (options.fromReport !== undefined && options.fromReport !== '') {
    rawFindings = await readReport(cwd, options.fromReport);
  } else {
    // No source at all is a caller error, not an empty result: reporting "no
    // findings to draft" here would hand an agent a clean verdict for a drift
    // report nobody read.
    throw new PrerequisiteError(
      'No drift source given — pass --from-report, --target/--reason, or call with findings',
    );
  }

  const groups = manualGroup
    ? [manualGroup]
    : groupFindings(rawFindings.filter(isDraftableFinding), roots);

  const results: DraftedChange[] = [];
  let createdCount = 0;
  let skippedCount = 0;

  for (const group of groups) {
    const { target, module, checkId, items, remedies } = group;
    const changeName = changeNameFor(group);
    const relChangeDir = path.relative(cwd, path.join(changesDir, changeName));
    const scale = options.scale ?? defaultScaleForCheck(checkId);
    const base = {
      name: changeName,
      changeDir: relChangeDir,
      target,
      checkId,
      scale,
      remedies,
    };

    const proposalContent = buildAutoDraftProposal({
      target,
      checkId,
      items,
      remedies,
      ...(module !== undefined ? { module } : {}),
      artifactLanguage,
      languageIsEnglish: isDefaultArtifactLanguage(artifactLanguage),
      constitutionPath: toPosixRel(constitutionPath),
      // The command that actually ran: a manually targeted draft read no report.
      draftedBy: manualGroup ? 'prospec change auto-draft' : 'prospec check --auto-draft',
    });

    // The scaffold is created by the same service `prospec change story` uses —
    // its AlreadyExistsError IS the idempotency signal, so a directory that
    // already exists is never inspected, matched by name, or overwritten.
    try {
      await changeStoryExecute({
        cwd,
        name: changeName,
        // ALWAYS passed, empty included: an omitted key falls through to
        // change-story's index.md keyword matching, which would attach four
        // guessed modules to a change whose subject could not be attributed.
        relatedModules: module !== undefined ? [module] : [],
        scale,
        proposalBody: proposalContent,
        ...(options.issue !== undefined ? { issue: normalizeIssueRef(options.issue) } : {}),
        ...(options.dryRun ? { dryRun: true } : {}),

      });
    } catch (err) {
      if (err instanceof AlreadyExistsError) {
        results.push({
          ...base,
          action: 'skipped',
          skipReason: `Change already exists: ${changeName}`,
        });
        skippedCount++;
        continue;
      }
      // One group's failure is reported as that group's failure and the rest
      // still run: throwing here would discard `results`, so directories this
      // loop already wrote would exist on disk with nothing naming them.
      results.push({
        ...base,
        action: 'failed',
        skipReason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    results.push({ ...base, action: 'created' });
    createdCount++;
  }

  return {
    changes: results,
    createdCount,
    skippedCount,
    failedCount: results.filter((c) => c.action === 'failed').length,
    dryRun: options.dryRun ?? false,
  };
}
