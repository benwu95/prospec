import { isProvenanceAudited } from '../types/change.js';
import { assessDrops } from './landing-fidelity.js';
import { KNOWLEDGE_SIZE_RULES, type KnowledgeSizeRule } from '../types/config.js';
import {
  DRIFT_CHECK_IDS,
  DRIFT_REPORT_FILENAME,
  DRIFT_REPORT_VERSION,
  DriftReportSchema,
  type DriftCheckId,
  type DriftCheckResult,
  type ConstitutionInventory,
  type DriftFinding,
  type DriftReport,
  type KnowledgeHealth,
  type KnowledgeSizeFinding,
} from '../types/drift-report.js';
import { DriftReportInvalid } from '../types/errors.js';
import type { ModuleMap } from '../types/module-map.js';
import type {
  ArtifactLanguageSource,
  ConstitutionRuleSource,
  FeatureMapGovernanceSource,
  GitTimestampSource,
  ImportEdgeSource,
  KnowledgeSizeSource,
  LinkSource,
  McpReadmeCountSource,
  MetadataCompletenessSource,
  ReqDefinitionIndex,
  ReqIdUniquenessSource,
  ReqReference,
  ReviewProvenanceSource,
  DeltaSpecProvenanceSource,
  DeltaSpecLandingFidelitySource,
  SpecCounterSource,
  TaskSource,
  TestProvenanceSource,
  BudgetOverrideSource,
  CanonicalDocDriftSource,
} from './drift-sources.js';
import { TOKEN_ESTIMATOR_LABEL } from './token-accounting.js';

/**
 * Drift evaluators — zero-LLM pure functions over collector data
 * (REQ-LIB-014..016). No I/O happens here: identical inputs produce an
 * identical report, which is what makes `prospec check` a regression-safe
 * CI gate.
 */

export interface DependencyRules {
  /** module → modules it may import (self-imports are never edges). */
  allowed: ReadonlyMap<string, ReadonlySet<string>>;
  source: 'module-map' | 'constitution-fallback';
}

/** Constitution-declared layering used when a project has no module-map.yaml. */
export const CONSTITUTION_LAYERS = ['cli', 'services', 'lib', 'types'] as const;

export interface DriftCheckInputs {
  reqDefinitions: ReqDefinitionIndex;
  reqIdUniqueness: ReqIdUniquenessSource;
  reqReferences: ReqReference[];
  links: LinkSource;
  importEdges: ImportEdgeSource;
  dependencyRules: DependencyRules;
  timestamps: GitTimestampSource;
  tasks: TaskSource;
  featureMapGovernance: FeatureMapGovernanceSource;
  mcpReadmeCounts: McpReadmeCountSource;
  reviewProvenance: ReviewProvenanceSource;
  deltaSpecProvenance: DeltaSpecProvenanceSource;
  deltaSpecLandingFidelity: DeltaSpecLandingFidelitySource;
  metadataCompleteness: MetadataCompletenessSource;
  knowledgeSize: KnowledgeSizeSource;
  budgetOverrides: BudgetOverrideSource;
  testProvenance: TestProvenanceSource;
  constitutionRules: ConstitutionRuleSource;
  artifactLanguage: ArtifactLanguageSource;
  specCounters: SpecCounterSource;
  canonicalDocDrift: CanonicalDocDriftSource;
  generatedAt: string;
}

interface CheckOutcome {
  result: DriftCheckResult;
  findings: DriftFinding[];
  knowledgeHealth?: KnowledgeHealth;
  constitution?: ConstitutionInventory;
}

/** Derive allowed-import rules from module-map depends_on declarations. */
export function buildDependencyRules(moduleMap: ModuleMap): DependencyRules {
  const allowed = new Map<string, ReadonlySet<string>>();
  for (const entry of moduleMap.modules) {
    allowed.set(entry.name, new Set(entry.relationships?.depends_on ?? []));
  }
  return { allowed, source: 'module-map' };
}

/** Fallback module map from the Constitution layering — each layer may import all lower layers. */
export function constitutionFallbackModuleMap(): ModuleMap {
  return {
    modules: CONSTITUTION_LAYERS.map((name, i) => ({
      name,
      paths: [`src/${name}`],
      keywords: [],
      relationships: { depends_on: CONSTITUTION_LAYERS.slice(i + 1) },
    })),
  };
}

export function constitutionFallbackRules(): DependencyRules {
  return { ...buildDependencyRules(constitutionFallbackModuleMap()), source: 'constitution-fallback' };
}

export function evaluateReqReferences(
  defs: ReqDefinitionIndex,
  refs: ReqReference[],
): CheckOutcome {
  if (!defs.available) {
    return skipped('req-references', defs.reason ?? 'source unavailable');
  }
  const defined = new Set(defs.ids);
  const findings: DriftFinding[] = refs
    .filter((r) => !defined.has(r.id))
    .map((r) => ({
      check: 'req-references' as const,
      severity: 'fail' as const,
      source_path: r.source_path,
      line: r.line,
      detail: `dangling reference: ${r.id} is not defined in any feature spec`,
    }));
  return outcome('req-references', findings);
}

export function evaluateReqIdUniqueness(src: ReqIdUniquenessSource): CheckOutcome {
  if (!src.available) {
    return skipped('req-id-uniqueness', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  for (const [id, defs] of src.definitions) {
    // A REQ id must be defined exactly once. Two or more definition sites is a
    // collision — cross-feature (the common case) or a duplicate within one
    // feature's main + slice; either breaks the id as a stable requirement key.
    if (defs.length < 2) continue;
    const where = defs.map((d) => `${d.source_path}:${d.line} (${d.feature})`).join(', ');
    // One finding per definition site, so every location is anchored; the detail
    // names all sites (with their feature) so a reader sees the full collision
    // from any one of them.
    for (const d of defs) {
      findings.push({
        check: 'req-id-uniqueness' as const,
        severity: 'fail' as const,
        source_path: d.source_path,
        line: d.line,
        detail: `duplicate REQ id: ${id} is defined in ${defs.length} places (${where})`,
      });
    }
  }
  return outcome('req-id-uniqueness', findings);
}

export function evaluateFilePaths(links: LinkSource): CheckOutcome {
  if (!links.available) {
    return skipped('file-paths', links.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = links.links
    .filter((l) => !l.exists)
    .map((l) => ({
      check: 'file-paths' as const,
      severity: 'fail' as const,
      source_path: l.source_path,
      line: l.line,
      detail: `broken link: ${l.raw_target} → ${l.resolved_path} does not exist`,
    }));
  return outcome('file-paths', findings);
}

export function evaluateImportDirection(
  edges: ImportEdgeSource,
  rules: DependencyRules,
): CheckOutcome {
  if (!edges.available) {
    return skipped('import-direction', edges.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = edges.edges
    .filter((e) => !(rules.allowed.get(e.from_module)?.has(e.to_module) ?? false))
    .map((e) => ({
      check: 'import-direction' as const,
      severity: 'fail' as const,
      source_path: e.from_path,
      line: e.line,
      detail:
        `illegal import: ${e.from_module} → ${e.to_module} (${e.specifier}) — ` +
        `${e.from_module} does not declare ${e.to_module} in depends_on (${rules.source})`,
    }));
  return outcome('import-direction', findings);
}

/** Staleness is permanently WARN-class — it must never fail a build (REQ-LIB-015). */
export function evaluateKnowledgeHealth(timestamps: GitTimestampSource): CheckOutcome {
  if (!timestamps.available) {
    return skipped('knowledge-health', timestamps.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  const healthModules: KnowledgeHealth['modules'] = [];
  for (const m of timestamps.modules) {
    // Staleness is judged against the module's explicit `last_verified` confirmation
    // time (module-map.yaml), not the inferred git commit time of its knowledge files.
    // No README, or no `last_verified`, is stale by the coverage rule regardless of
    // timestamps. The commit-time keys stay in the report (frozen contract) but no
    // longer drive the verdict (REQ-LIB-015).
    const stale = !m.readme_exists
      ? true
      : m.last_verified === null
        ? true
        : isStale(m.last_src_commit, m.last_verified);
    healthModules.push({
      name: m.name,
      last_src_commit: m.last_src_commit,
      last_readme_commit: m.last_readme_commit,
      ...(m.last_sub_module_commit === null
        ? {}
        : { last_sub_module_commit: m.last_sub_module_commit }),
      stale,
      ...(m.last_verified === null ? {} : { last_verified: m.last_verified }),
    });
    if (!m.readme_exists) {
      findings.push({
        check: 'knowledge-health',
        severity: 'warn',
        source_path: m.readme_path,
        detail: `coverage gap: module "${m.name}" has no README`,
      });
    } else if (stale) {
      findings.push({
        check: 'knowledge-health',
        severity: 'warn',
        source_path: m.readme_path,
        detail:
          m.last_verified === null
            ? `stale knowledge: module "${m.name}" has no last_verified — its knowledge is unconfirmed against source`
            : `stale knowledge: module "${m.name}" source last commit ${m.last_src_commit} ` +
              `is newer than its last_verified ${m.last_verified}`,
      });
    }
  }
  const documented = timestamps.modules.filter((m) => m.readme_exists).length;
  return {
    ...outcome('knowledge-health', findings),
    knowledgeHealth: {
      modules: healthModules,
      coverage: { documented, total: timestamps.modules.length },
    },
  };
}

/** Completion counts code tasks only — unchecked [M]/[V] never fail (REQ-LIB-016). */
export function evaluateTaskCompletion(tasks: TaskSource): CheckOutcome {
  if (!tasks.available) {
    return skipped('task-completion', tasks.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  for (const change of tasks.changes) {
    for (const t of change.tasks) {
      if (t.kind === 'code' && !t.checked) {
        findings.push({
          check: 'task-completion',
          severity: 'fail',
          source_path: change.tasks_path,
          line: t.line,
          detail: `unchecked code task in change "${change.name}": ${t.text}`,
        });
      }
    }
  }
  return outcome('task-completion', findings);
}

/**
 * REQ-prefix legality lint — every REQ prefix in a feature spec must be a
 * module-map module or a feature-map-declared req_prefix. Permanently WARN-class
 * (a naming-consistency lint, not feature↔module ground truth); its detection
 * ceiling is human curation completeness. Skips entirely when feature-map.yaml
 * is absent. One finding per distinct illegal prefix, at its first occurrence.
 */
export function evaluateDanglingPrefix(src: FeatureMapGovernanceSource): CheckOutcome {
  if (!src.available) {
    return skipped('dangling-prefix', src.reason ?? 'source unavailable');
  }
  const moduleSet = new Set(src.moduleNames.map((m) => m.toLowerCase()));
  // REQ prefixes are canonically uppercase; normalize declared req_prefixes so a
  // curator's lowercase `req_prefixes: [dom]` does not spuriously flag REQ-DOM-*.
  const declared = new Set<string>();
  for (const f of src.featureMap.features) for (const p of f.req_prefixes ?? []) declared.add(p.toUpperCase());
  const flagged = new Set<string>();
  const findings: DriftFinding[] = [];
  for (const spec of src.specs) {
    for (const r of spec.reqs) {
      if (flagged.has(r.prefix)) continue;
      if (moduleSet.has(r.prefix.toLowerCase()) || declared.has(r.prefix.toUpperCase())) continue;
      flagged.add(r.prefix);
      findings.push({
        check: 'dangling-prefix',
        severity: 'warn',
        source_path: spec.source_path,
        line: r.line,
        detail:
          `dangling REQ prefix: "${r.prefix}" (e.g. ${r.id}) is neither a module-map module ` +
          `nor a feature-map req_prefix — declare it in feature-map.yaml or fix the typo`,
      });
    }
  }
  return outcome('dangling-prefix', findings);
}

/**
 * Self-validating feature→module edge — every module-prefix REQ a feature spec
 * owns implies its module is in that feature's feature-map `modules`. The RHS is
 * self-evident (no human curation), so a violation is an objective error and
 * FAIL-class. Skips when feature-map.yaml is absent; a feature spec with no
 * feature-map entry is skipped (dangling-prefix still covers its prefixes).
 */
export function evaluateFeatureModules(src: FeatureMapGovernanceSource): CheckOutcome {
  if (!src.available) {
    return skipped('feature-modules', src.reason ?? 'source unavailable');
  }
  const moduleSet = new Set(src.moduleNames.map((m) => m.toLowerCase()));
  const declaredByFeature = new Map<string, ReadonlySet<string>>();
  for (const f of src.featureMap.features) {
    declaredByFeature.set(f.feature, new Set(f.modules.map((m) => m.toLowerCase())));
  }
  const flagged = new Set<string>();
  const findings: DriftFinding[] = [];
  for (const spec of src.specs) {
    const declared = declaredByFeature.get(spec.feature);
    if (declared === undefined) continue;
    for (const r of spec.reqs) {
      const module = r.prefix.toLowerCase();
      if (!moduleSet.has(module) || declared.has(module)) continue;
      const key = `${spec.feature}|${module}`;
      if (flagged.has(key)) continue;
      flagged.add(key);
      findings.push({
        check: 'feature-modules',
        severity: 'fail',
        source_path: spec.source_path,
        line: r.line,
        detail:
          `feature "${spec.feature}" owns ${r.id} (module-prefix "${r.prefix}") but its ` +
          `feature-map modules do not list "${module}" — add "${module}" to feature-map.yaml`,
      });
    }
  }
  return outcome('feature-modules', findings);
}

/**
 * MCP README declared counts must match the code they name — drift is WARN-class
 * (REQ-LIB-020). Mechanizes the count-accuracy gap the other checks leave to
 * human review; whitelist-bounded in the collector to the MCP registration
 * pattern, so unmatched prose never reaches here. Skips when module-map is absent
 * (no module boundaries). The `mcp-` id keeps the scope honest — root-README
 * badges/inventory counts are deliberately out of scope.
 */
export function evaluateMcpReadmeCounts(src: McpReadmeCountSource): CheckOutcome {
  if (!src.available) {
    return skipped('mcp-readme-counts', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = src.claims
    .filter((c) => c.claimed !== c.actual)
    .map((c) => ({
      check: 'mcp-readme-counts' as const,
      severity: 'warn' as const,
      source_path: c.readme_path,
      line: c.line,
      detail:
        `count drift: README claims ${c.claimed} ${c.noun} for ${c.source_path} ` +
        `but the code has ${c.actual}`,
    }));
  return outcome('mcp-readme-counts', findings);
}

/**
 * Spec counters — a feature spec's frontmatter `story_count`/`req_count` against
 * the body it describes (REQ-LIB-042). WARN-class: `archive finalize` normally
 * rewrites the value on the next archive, so this is a visibility signal for the
 * window in between — except where that recount REFUSES (a declared counter the
 * body would zero), and there the warn is the durable signal that a human must
 * converge the spec. The counts arrive already derived by `readSpecCounters`, the
 * writer's own function — this evaluator only compares.
 *
 * A counter the frontmatter never declares is out of scope (`null`), not a
 * finding: adding it is the writer's job, and reporting it here would red every
 * project whose specs predate the counters.
 */
export function evaluateSpecCounters(src: SpecCounterSource): CheckOutcome {
  if (!src.available) {
    return skipped('spec-counters', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  for (const spec of src.specs) {
    for (const field of ['story_count', 'req_count'] as const) {
      const declared = spec.declared[field];
      if (declared === null || declared === spec.actual[field]) continue;
      findings.push({
        check: 'spec-counters' as const,
        severity: 'warn' as const,
        source_path: spec.source_path,
        detail:
          `counter drift: frontmatter declares ${field} ${declared} ` +
          `but the body holds ${spec.actual[field]}`,
      });
    }
  }
  return outcome('spec-counters', findings);
}

/**
 * Review provenance — an audited, non-backfill change must carry a review
 * baseline whose digest still matches the current code (REQ-LIB-024). Absent →
 * fail (review never ran); mismatch → fail (code changed since review, re-review
 * needed). FAIL-class: this is the machine gate that makes review non-skippable
 * before verify. The audited statuses come from `PROVENANCE_AUDITED_STATUSES`:
 * `implemented` AND `verified`, so the window between verify and archive is
 * covered — grade S/A ends neither the audit nor the need to re-review. Earlier
 * statuses are exempt (review is not yet due) and `archived` is unreachable
 * rather than forgiven: its bundle has left `.prospec/changes/`, so the collector
 * never enumerates it. Backfill is exempt only when proven by
 * `backfill-draft.md` (`scale` alone is hand-editable, #103); an unavailable
 * source (not git / no changes dir / no digest) skips.
 *
 * HEAD is inside the digest, so the verify S/A feature commit itself stales the
 * baseline. That red is honest, and the remedy is the PB-016 order: commit, then
 * re-record both baselines, then archive.
 *
 * Assumes a single change in flight at a time (the normal prospec workflow): the
 * one whole-tree `current_digest` is compared against every change, so with
 * concurrent changes, editing one flips the others stale — over-blocking
 * (fail-closed), never fail-open. Widening the audited statuses widens that
 * over-blocking; it cannot open the gate.
 */
export function evaluateReviewProvenance(src: ReviewProvenanceSource): CheckOutcome {
  if (!src.available) {
    return skipped('review-provenance', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  for (const c of src.changes) {
    if (!isProvenanceAudited(c.status)) continue;
    // Draft-gated like test-provenance (issue #103): `scale` is hand-editable, so
    // only a proven backfill (backfill-draft.md present) skips the review gate.
    if (c.scale === 'backfill' && c.backfill_draft_present) continue;
    if (c.recorded_digest === null) {
      findings.push({
        check: 'review-provenance',
        severity: 'fail',
        source_path: c.source_path,
        detail:
          `no review recorded for change "${c.name}" — run /prospec-review before /prospec-verify`,
      });
    } else if (c.recorded_digest !== src.current_digest) {
      findings.push({
        check: 'review-provenance',
        severity: 'fail',
        source_path: c.source_path,
        // A clean working tree means the mismatch is commit-induced (a commit landed
        // after the baseline was recorded — HEAD is inside the digest), not a code
        // change, so the cheap remedy is to re-record; only a dirty/unknown tree keeps
        // the code-changed wording. The gate FAILs either way — only the remedy differs.
        detail:
          src.working_tree_clean === true
            ? `stale review for change "${c.name}": the working tree is clean, so the recorded ` +
              'review predates the current commit — re-record with `prospec check --record-review` ' +
              '(a full /prospec-review is only needed if code changed before the commit)'
            : `stale review for change "${c.name}": code changed since the recorded review — ` +
              `re-run /prospec-review`,
      });
    }
  }
  return outcome('review-provenance', findings);
}

/**
 * Delta-spec provenance — an audited change must carry a delta-spec baseline whose
 * fingerprint still matches its `delta-spec.md` (REQ-LIB-045). FAIL-class, and the
 * one gate aimed at the artifact rather than the code: `computeChangeDigest`
 * excludes `.prospec/`, so review- and test-provenance both stay green when a
 * review round corrects a REQ's behavior and the correction is never folded back
 * into its `**Spec:**` block — and archive then copies the pre-review text verbatim
 * into the trust zone, reverting the fix.
 *
 * Every branch fails CLOSED. Absent → fail (no baseline proves anything); mismatch
 * → fail (the block moved after review saw it); present-but-unreadable → fail with
 * its OWN reason, because reporting that as "stale" would send the author to edit a
 * file they cannot read. Only two things pass without a comparison: a scale that
 * carries no delta-spec (nothing graduates verbatim from it) and a backfill proven
 * by `backfill-draft.md` — a proven backfill never runs review, so no baseline can
 * ever exist for it and the alternative would be making every backfill permanently
 * unarchivable. `scale` alone buys nothing, matching the other two gates.
 *
 * Audited statuses come from the shared `PROVENANCE_AUDITED_STATUSES`, so all three
 * provenance gates cover the same window — `verified` included, which is where this
 * one earns its keep: the landing blocks graduate at archive, after verify.
 */
export function evaluateDeltaSpecProvenance(src: DeltaSpecProvenanceSource): CheckOutcome {
  if (!src.available) {
    return skipped('delta-spec-provenance', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  const fail = (c: DeltaSpecProvenanceSource['changes'][number], detail: string): void => {
    findings.push({
      check: 'delta-spec-provenance',
      severity: 'fail',
      source_path: c.source_path,
      detail,
    });
  };
  for (const c of src.changes) {
    if (!isProvenanceAudited(c.status)) continue;
    // Nothing graduates verbatim from a change with no delta-spec.
    if (!c.delta_spec_present) continue;
    // Draft-gated exactly like the other two gates (issue #103).
    if (c.scale === 'backfill' && c.backfill_draft_present) continue;
    if (c.current_digest === null) {
      fail(
        c,
        `delta-spec for change "${c.name}" could not be read — its landing blocks cannot be ` +
          `proven current, so archive must not graduate them`,
      );
    } else if (c.recorded_digest === null) {
      fail(
        c,
        `no delta-spec baseline recorded for change "${c.name}" — run ` +
          `\`prospec check --record-review\` so the \`**Spec:**\` blocks archive graduates ` +
          `can be proven to match what review saw`,
      );
    } else if (c.recorded_digest !== c.current_digest) {
      fail(
        c,
        `stale delta-spec for change "${c.name}": the delta-spec changed since the recorded ` +
          `baseline. If review corrected behavior, fold the correction into the \`**Spec:**\` ` +
          `block and re-record; the block, not the code, is what archive copies verbatim`,
      );
    }
  }
  return outcome('delta-spec-provenance', findings);
}

/**
 * Delta-spec landing fidelity — surfaces at every `prospec check` the trust-zone
 * bullet loss that archive catches fail-closed only at graduation, after the
 * feature commit (REQ-CLI-034). For each MODIFIED entry whose `**Spec:**` block
 * replaces an existing REQ body, the undeclared drops are computed from the SAME
 * `assessDrops` the archive write path uses (issue #202), so a finding here and
 * archive's refusal can never disagree.
 *
 * A mis-pointing routing header (`**Feature:**` naming a feature that does not host
 * the REQ id) → fail, so it can no longer pass by skipping the comparison (issue
 * #211). Undeclared drop → fail (naming the REQ and the bullet); a stale declaration
 * and a prose `**Dropped:**` block that declares nothing → warn; a declared drop and
 * an excluded entry (ADDED-like or no Spec block) produce nothing.
 */
export function evaluateDeltaSpecLandingFidelity(
  src: DeltaSpecLandingFidelitySource,
): CheckOutcome {
  if (!src.available) {
    return skipped('delta-spec-landing-fidelity', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  for (const e of src.entries) {
    // Routing-header resolution comes FIRST — a MODIFIED/REMOVED entry whose
    // `**Feature:**` names a feature that does not host the REQ id, while the REQ
    // demonstrably lives in ANOTHER feature, fails regardless of whether it carries
    // a Spec block (so a REMOVED or a Spec-less MODIFIED cannot dodge it). This is
    // the reproducible #211 misplacement: landing it would append a stale duplicate
    // in the wrong feature. `not-found` (the REQ lives nowhere yet) is left to the
    // existing exclusion below — it is a legitimate create-and-deprecate shape, not
    // a mis-route. Archive refuses the SAME wrong-feature entry from the SAME
    // classifier, so a finding here and its refusal agree.
    if (e.resolution.kind === 'wrong-feature') {
      findings.push({
        check: 'delta-spec-landing-fidelity',
        severity: 'fail',
        source_path: e.source_path,
        detail:
          `${e.reqId} in change "${e.change}": its \`**Feature:**\` names "${e.feature}", but ` +
          `the REQ lives in "${e.resolution.home}" — route it to that feature, or express a ` +
          `cross-feature move explicitly (a mis-pointing header would append a stale duplicate)`,
      });
      continue;
    }
    // A non-empty `**Dropped:**` block that parsed to zero declarations is prose,
    // not an assertion the tool can act on — warn so a "none" is not mistaken for a
    // verified claim (issue #202 M1).
    if (e.droppedBlockPresent && e.declared.length === 0) {
      findings.push({
        check: 'delta-spec-landing-fidelity',
        severity: 'warn',
        source_path: e.source_path,
        detail:
          `${e.reqId} in change "${e.change}": its \`**Dropped:**\` block carries text but no list ` +
          `item, so nothing is declared — write each dropped bullet as a \`- \` item, or remove the block`,
      });
    }
    // Excluded from the drop comparison — resolution already passed above, so this
    // is a REMOVED entry or a MODIFIED with no `**Spec:**` block (nothing to diff).
    if (e.landing === '' || e.existingBody === null) continue;
    const sets = assessDrops(e.existingBody, e.landing, e.declared);
    for (const bullet of sets.undeclared) {
      findings.push({
        check: 'delta-spec-landing-fidelity',
        severity: 'fail',
        source_path: e.source_path,
        detail:
          `${e.reqId} in change "${e.change}": the \`**Spec:**\` landing block drops an authored ` +
          `trust-zone bullet without declaring it — restore it into the body or list it under ` +
          `\`**Dropped:**\`: ${bullet.text.trim()}`,
      });
    }
    for (const bullet of sets.stale) {
      findings.push({
        check: 'delta-spec-landing-fidelity',
        severity: 'warn',
        source_path: e.source_path,
        detail:
          `${e.reqId} in change "${e.change}": \`**Dropped:**\` declares a bullet the landing block ` +
          `did not drop (stale declaration — the delta-spec may describe an older body): ${bullet.text.trim()}`,
      });
    }
  }
  return outcome('delta-spec-landing-fidelity', findings);
}

/**
 * Metadata completeness — a change whose metadata.yaml is missing a required
 * field (name/created_at/status/scale), or that is verified/archived yet records
 * no /prospec-verify S/A grade in quality_log, fails (FAIL-class). Backs the
 * /prospec-archive Entry Gate so incomplete metadata cannot enter the permanent
 * record. In-progress changes (story/plan/tasks/implemented) are exempt from the
 * grade rule — the collector only sets missing_verify_grade for graded statuses.
 * An unavailable source (no `.prospec/changes/`) skips, never a fabricated pass.
 */
export function evaluateMetadataCompleteness(src: MetadataCompletenessSource): CheckOutcome {
  if (!src.available) {
    return skipped('metadata-completeness', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  for (const c of src.changes) {
    if (c.missing_fields.length > 0) {
      findings.push({
        check: 'metadata-completeness',
        severity: 'fail',
        source_path: c.source_path,
        detail:
          `incomplete metadata for change "${c.name}": missing required field(s) ` +
          `${c.missing_fields.join(', ')}`,
      });
    }
    if (c.missing_verify_grade) {
      findings.push({
        check: 'metadata-completeness',
        severity: 'fail',
        source_path: c.source_path,
        detail:
          `change "${c.name}" is ${c.status} but quality_log records no ` +
          `/prospec-verify S/A grade`,
      });
    }
  }
  return outcome('metadata-completeness', findings);
}

/**
 * Knowledge size budget — a measured knowledge file over the budget its load
 * surface is graded against warns (REQ-LIB-027). Every surface is graded through
 * one registry (`KNOWLEDGE_SIZE_RULES`), so which budget applies and what an
 * over-budget file should DO about it live together instead of in per-kind
 * branches; only a surface whose rule declares a `lineKey` is graded on lines.
 * WARN-class: the progressive-loading budget is a pressure signal against silent
 * regrowth, never a build breaker. L0 (agent-injected config) is out of scope. An
 * unavailable source (no knowledge base) skips, never a fabricated pass.
 */
export function evaluateKnowledgeSize(src: KnowledgeSizeSource): CheckOutcome {
  if (!src.available) {
    return skipped('knowledge-size', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  // The prose `detail` and the structured `knowledge_size` are two views of the
  // same fact — kept side by side so the `detail` wording stays byte-identical
  // (existing consumers/tests read it) while the formatter groups off the struct.
  const warn = (source_path: string, detail: string, knowledge_size: KnowledgeSizeFinding): void => {
    findings.push({ check: 'knowledge-size', severity: 'warn', source_path, detail, knowledge_size });
  };
  for (const item of src.items) {
    const rule: KnowledgeSizeRule = KNOWLEDGE_SIZE_RULES[item.kind];
    const tokenBudget = src.budget[rule.tokenKey];
    if (item.tokens > tokenBudget) {
      warn(
        item.source_path,
        `${rule.label} over token budget: ${item.tokens} tokens (${TOKEN_ESTIMATOR_LABEL}) ` +
          `> ${tokenBudget} ${rule.tokenKey} budget — ${rule.remedy}`,
        {
          surface: rule.label,
          budget_key: rule.tokenKey,
          budget: tokenBudget,
          actual: item.tokens,
          unit: 'tokens',
          tier: 'over',
          remedy: rule.remedy,
        },
      );
    } else if (src.budget.headroom !== undefined) {
      const headroomThreshold = Math.floor(tokenBudget * src.budget.headroom);
      if (item.tokens > headroomThreshold) {
        warn(
          item.source_path,
          `${rule.label} pressure signal: ${item.tokens} tokens (${TOKEN_ESTIMATOR_LABEL}) ` +
            `approaches ${tokenBudget} ${rule.tokenKey} budget (headroom ${src.budget.headroom})`,
          {
            surface: rule.label,
            budget_key: rule.tokenKey,
            budget: tokenBudget,
            actual: item.tokens,
            unit: 'tokens',
            tier: 'headroom',
          },
        );
      }
    }
    if (rule.lineKey === undefined) continue;
    const lineBudget = src.budget[rule.lineKey];
    if (item.lines > lineBudget) {
      warn(
        item.source_path,
        `${rule.label} over line budget: ${item.lines} lines > ${lineBudget} ` +
          `${rule.lineKey} budget — ${rule.remedy}`,
        {
          surface: rule.label,
          budget_key: rule.lineKey,
          budget: lineBudget,
          actual: item.lines,
          unit: 'lines',
          tier: 'over',
          remedy: rule.remedy,
        },
      );
    }
  }
  return outcome('knowledge-size', findings);
}

/**
 * Budget overrides — any token_budget override > default must have an adjacent YAML comment.
 */
export function evaluateBudgetOverrides(src: BudgetOverrideSource): CheckOutcome {
  if (!src.available) {
    return skipped('unjustified-budget-override', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  for (const override of src.overrides) {
    if (!override.hasComment) {
      findings.push({
        check: 'unjustified-budget-override',
        severity: 'warn',
        source_path: src.source_path,
        line: override.line,
        detail: `unjustified budget override: token_budget.${override.key} is set to ${override.value} (default ${override.defaultValue}) without a comment. Add a comment explaining why this module needs more space.`,
      });
    }
  }
  return outcome('unjustified-budget-override', findings);
}

/**
 * Canonical Doc Drift — compares present canonical docs against template-rendered content.
 * WARN-class: divergent docs should be replaced with `prospec init` or manual sync.
 */
export function evaluateCanonicalDocDrift(src: CanonicalDocDriftSource): CheckOutcome {
  if (!src.available) {
    return skipped('canonical-doc-drift', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  for (const doc of src.docs) {
    if (!doc.matches) {
      findings.push({
        check: 'canonical-doc-drift',
        severity: 'warn',
        source_path: doc.source_path,
        detail: `canonical doc drift: ${doc.source_path} diverges from its template-rendered content. Restore it using its canonical template.`,
      });
    }
  }
  return outcome('canonical-doc-drift', findings);
}

/**
 * Test provenance — an audited change must carry a recorded test run whose
 * digest still matches the current code AND whose exit code is zero (REQ-LIB-033).
 * Absent → fail (the suite was never recorded); digest mismatch → fail (code
 * changed since the run); non-zero exit → fail (the suite failed). FAIL-class:
 * this is what makes verify's test dimension a machine verdict instead of an
 * agent's self-report. The audited statuses are `PROVENANCE_AUDITED_STATUSES` —
 * the same registry review-provenance reads, so the two gates cannot cover
 * different windows; a change before tests are due is exempt and `archived` is
 * unreachable. An unavailable source (not git / no changes dir / no digest) skips.
 *
 * **A recorded failure outranks an unresolvable command.** When the test command
 * cannot run on this machine (unset, or a Windows shim), the missing/stale
 * branches skip honestly — you cannot demand a run that cannot spawn — but a
 * recorded non-zero exit still FAILs: it is a fact that needs no runnable command
 * (issue #103; same principle as the backfill ordering below, one level up).
 *
 * **The backfill relaxation is per-branch, not wholesale.** A proven backfill
 * (`backfill-draft.md` present) records pre-existing brownfield code, so a
 * *missing* or *stale* record is the expected "outcome unknown" state and is
 * exempt — but a recorded run that actually FAILED is never exempt, because the
 * verify skill's own contract is "never suppress a recorded non-zero exit" and
 * that dimension now adopts this status verbatim. The relaxation keys on the
 * draft, not on the hand-editable `scale`, so `scale: backfill` cannot be typed
 * into metadata to bypass the tested-code gate for new work.
 *
 * Shares collectReviewProvenance's single-in-flight-change assumption: the one
 * whole-tree digest is compared against every change, so concurrent changes
 * over-block (fail-closed), never fail-open.
 */
export function evaluateTestProvenance(src: TestProvenanceSource): CheckOutcome {
  if (!src.available) {
    return skipped('test-provenance', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  for (const c of src.changes) {
    if (!isProvenanceAudited(c.status)) continue;
    const provenBackfill = c.scale === 'backfill' && c.backfill_draft_present;
    if (c.recorded_exit_code !== 0 && (c.recorded_exit_code !== null || c.recorded_digest !== null)) {
      // Checked FIRST — before staleness, before the unresolvable-command skip —
      // and never exempt under backfill: a recorded failure is a KNOWN failure
      // whatever the tree or the toolchain did afterwards, and the verify contract
      // this status feeds is absolute — "never suppress a recorded non-zero exit".
      // Any later ordering opens a suppression path (stale+failing backfill via the
      // exempt branch; a red record via a command that stopped resolving — #103).
      findings.push({
        check: 'test-provenance',
        severity: 'fail',
        source_path: c.source_path,
        detail:
          `failing test run for change "${c.name}": \`${c.recorded_command}\` exited ` +
          `${c.recorded_exit_code === null ? 'without a status' : c.recorded_exit_code}` +
          (c.recorded_digest === src.current_digest ? '' : ' (and the record is stale)'),
      });
      continue;
    }
    // Missing/stale demand a (re-)run — meaningless to demand when the command
    // cannot spawn on this machine; those branches skip honestly below. Loose
    // `!= null` on purpose: a source built before this field existed must read
    // as "command resolvable", never as a skip.
    if (src.command_unavailable_reason != null) continue;
    if (c.recorded_digest === null) {
      if (provenBackfill) continue; // brownfield code legitimately has no run
      findings.push({
        check: 'test-provenance',
        severity: 'fail',
        source_path: c.source_path,
        detail:
          `no test run recorded for change "${c.name}" — run ` +
          '`prospec check --record-tests` before /prospec-verify',
      });
    } else if (c.recorded_digest !== src.current_digest) {
      // Stale with a GREEN record means "current outcome unknown", which for proven
      // brownfield code is the same exempt state as no record at all — and failing it
      // would punish recording a run while staying silent rewards not recording one.
      if (provenBackfill) continue;
      findings.push({
        check: 'test-provenance',
        severity: 'fail',
        source_path: c.source_path,
        // Same clean-tree distinction as review-provenance: a clean tree means the
        // recorded run predates the current commit (outcome unknown, not a failure),
        // so re-record; a dirty/unknown tree keeps the code-changed wording.
        detail:
          src.working_tree_clean === true
            ? `stale test run for change "${c.name}": the working tree is clean, so the recorded ` +
              'run predates the current commit — re-record with `prospec check --record-tests` ' +
              '(the suite outcome is unknown after the commit, not a failure)'
            : `stale test run for change "${c.name}": code changed since the recorded run — ` +
              're-run `prospec check --record-tests`',
      });
    }
  }
  if (findings.length === 0 && src.command_unavailable_reason != null) {
    return skipped('test-provenance', src.command_unavailable_reason);
  }
  return outcome('test-provenance', findings);
}

/**
 * Constitution severity — every principle heading must carry an RFC-2119 tag so
 * verify can grade a violation by weight (REQ-LIB-032). WARN-class: an untagged
 * rule is still auditable, verify just falls back to judgment grading for it, so
 * this is a pressure signal against severity-free prose, never a build breaker.
 * Emits the rule inventory verify audits 1:1 against; an unavailable source (no
 * Constitution, or one declaring no principles) skips — no facts must never
 * present as a pass.
 */
export function evaluateConstitutionSeverity(src: ConstitutionRuleSource): CheckOutcome {
  if (!src.available) {
    return skipped('constitution-severity', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = src.rules
    .filter((r) => r.severity === null)
    .map((r) => ({
      check: 'constitution-severity' as const,
      severity: 'warn' as const,
      source_path: src.source_path,
      line: r.line,
      detail:
        `untagged principle: "${r.name}" carries no [MUST]/[SHOULD]/[MAY] severity — ` +
        'verify cannot grade its violation by weight',
    }));
  return {
    ...outcome('constitution-severity', findings),
    constitution: { rules: src.rules },
  };
}

/**
 * Report change artifacts whose PROSE carries no character in the project's
 * artifact language (the collector strips fenced code before the test). Every finding is WARN-class: a fail tier for the committed record
 * needs a shrink-only legacy exemption first (see the collector), and a check
 * that reds a repo's pre-existing artifacts on day one gets switched off.
 */
export function evaluateArtifactLanguage(src: ArtifactLanguageSource): CheckOutcome {
  if (!src.available) {
    return skipped('artifact-language', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = src.files
    .filter((f) => !f.hasScript)
    .map((f) => ({
      check: 'artifact-language' as const,
      severity: 'warn' as const,
      source_path: f.path,
      detail:
        `no ${src.language} prose found — change artifacts are written in ` +
        `${src.language} (Constitution Language Policy)`,
    }));
  return outcome('artifact-language', findings);
}

/** Run all evaluators and assemble a schema-validated, deterministically ordered report. */
export function runChecks(inputs: DriftCheckInputs): DriftReport {
  const outcomes: Record<DriftCheckId, CheckOutcome> = {
    'req-references': evaluateReqReferences(inputs.reqDefinitions, inputs.reqReferences),
    'file-paths': evaluateFilePaths(inputs.links),
    'import-direction': evaluateImportDirection(inputs.importEdges, inputs.dependencyRules),
    'knowledge-health': evaluateKnowledgeHealth(inputs.timestamps),
    'task-completion': evaluateTaskCompletion(inputs.tasks),
    'dangling-prefix': evaluateDanglingPrefix(inputs.featureMapGovernance),
    'feature-modules': evaluateFeatureModules(inputs.featureMapGovernance),
    'mcp-readme-counts': evaluateMcpReadmeCounts(inputs.mcpReadmeCounts),
    'review-provenance': evaluateReviewProvenance(inputs.reviewProvenance),
    'metadata-completeness': evaluateMetadataCompleteness(inputs.metadataCompleteness),
    'knowledge-size': evaluateKnowledgeSize(inputs.knowledgeSize),
    'test-provenance': evaluateTestProvenance(inputs.testProvenance),
    'constitution-severity': evaluateConstitutionSeverity(inputs.constitutionRules),
    'artifact-language': evaluateArtifactLanguage(inputs.artifactLanguage),
    'spec-counters': evaluateSpecCounters(inputs.specCounters),
    'delta-spec-provenance': evaluateDeltaSpecProvenance(inputs.deltaSpecProvenance),
    'unjustified-budget-override': evaluateBudgetOverrides(inputs.budgetOverrides),
    'canonical-doc-drift': evaluateCanonicalDocDrift(inputs.canonicalDocDrift),
    'delta-spec-landing-fidelity': evaluateDeltaSpecLandingFidelity(inputs.deltaSpecLandingFidelity),
    'req-id-uniqueness': evaluateReqIdUniqueness(inputs.reqIdUniqueness),
  };
  const checks = DRIFT_CHECK_IDS.map((id) => outcomes[id].result);
  const findings = DRIFT_CHECK_IDS.flatMap((id) => outcomes[id].findings).sort(compareFindings);
  const report: DriftReport = {
    version: DRIFT_REPORT_VERSION,
    generated_at: inputs.generatedAt,
    structural: {
      checks,
      findings,
      knowledge_health: outcomes['knowledge-health'].knowledgeHealth,
      constitution: outcomes['constitution-severity'].constitution,
    },
    semantic: {
      status: 'not-checked',
      note: 'Semantic spec↔code consistency is /prospec-review territory — never graded here.',
    },
    summary: {
      fail_count: checks.filter((c) => c.status === 'fail').length,
      warn_count: checks.filter((c) => c.status === 'warn').length,
      skipped_count: checks.filter((c) => c.status === 'skipped').length,
    },
  };
  const parsed = DriftReportSchema.safeParse(report);
  if (!parsed.success) {
    throw new DriftReportInvalid(
      DRIFT_REPORT_FILENAME,
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return parsed.data;
}

function outcome(id: DriftCheckId, findings: DriftFinding[]): CheckOutcome {
  const hasFail = findings.some((f) => f.severity === 'fail');
  const status = hasFail ? 'fail' : findings.length > 0 ? 'warn' : 'pass';
  return { result: { id, status }, findings };
}

function skipped(id: DriftCheckId, reason: string): CheckOutcome {
  return { result: { id, status: 'skipped', reason }, findings: [] };
}

export function isStale(srcCommit: string | null, reference: string): boolean {
  // A null `last_verified` is intercepted as stale by the caller before this runs,
  // so the reference is always a real timestamp here; only a null source (no source
  // commits) short-circuits — nothing to be stale against.
  if (srcCommit === null) return false;
  const srcTs = Date.parse(srcCommit);
  const refTs = Date.parse(reference);
  if (isNaN(srcTs) || isNaN(refTs)) return true;
  // Compare by UTC calendar day, NOT by instant. `last_verified` is a wall-clock stamp
  // taken moments BEFORE the co-commit that carries it, so an instant comparison would
  // read every freshly-committed module as stale (commit time > stamp). Day granularity
  // keeps "verified and committed the same day" fresh while still catching source that
  // drifts to a later day. %cI carries each committer's own UTC offset — Date.parse
  // normalizes both to the same epoch before the day floor.
  const utcDay = (ts: number): number => Math.floor(ts / 86_400_000);
  return utcDay(srcTs) > utcDay(refTs);
}

// codepoint order, NOT localeCompare — ICU collation varies per environment
// and would break cross-machine report byte-identity
function byCodepoint(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

function compareFindings(a: DriftFinding, b: DriftFinding): number {
  return (
    byCodepoint(a.check, b.check) ||
    byCodepoint(a.source_path, b.source_path) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    byCodepoint(a.detail, b.detail)
  );
}
