import { isProvenanceAudited } from '../types/change.js';
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
  ReqReference,
  ReviewProvenanceSource,
  DeltaSpecProvenanceSource,
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
    // A module's knowledge is its README plus every extracted sub-module sibling,
    // so the source is compared against the NEWEST of them — otherwise a change
    // that updates only a sub-module leaves the module permanently stale.
    const newestKnowledge = newerOf(m.last_readme_commit, m.last_sub_module_commit);
    const stale = m.readme_exists ? isStale(m.last_src_commit, newestKnowledge) : true;
    healthModules.push({
      name: m.name,
      last_src_commit: m.last_src_commit,
      last_readme_commit: m.last_readme_commit,
      ...(m.last_sub_module_commit === null
        ? {}
        : { last_sub_module_commit: m.last_sub_module_commit }),
      stale,
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
          `stale knowledge: module "${m.name}" source last commit ${m.last_src_commit} ` +
          `is newer than its newest knowledge commit ${newestKnowledge}`,
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
        detail:
          `stale review for change "${c.name}": code changed since the recorded review — ` +
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
  const warn = (source_path: string, detail: string): void => {
    findings.push({ check: 'knowledge-size', severity: 'warn', source_path, detail });
  };
  for (const item of src.items) {
    const rule: KnowledgeSizeRule = KNOWLEDGE_SIZE_RULES[item.kind];
    const tokenBudget = src.budget[rule.tokenKey];
    if (item.tokens > tokenBudget) {
      warn(
        item.source_path,
        `${rule.label} over token budget: ${item.tokens} tokens (${TOKEN_ESTIMATOR_LABEL}) ` +
          `> ${tokenBudget} ${rule.tokenKey} budget — ${rule.remedy}`,
      );
    } else if (src.budget.headroom !== undefined) {
      const headroomThreshold = Math.floor(tokenBudget * src.budget.headroom);
      if (item.tokens > headroomThreshold) {
        warn(
          item.source_path,
          `${rule.label} pressure signal: ${item.tokens} tokens (${TOKEN_ESTIMATOR_LABEL}) ` +
            `approaches ${tokenBudget} ${rule.tokenKey} budget (headroom ${src.budget.headroom})`,
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
        detail:
          `stale test run for change "${c.name}": code changed since the recorded run — ` +
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

function isStale(srcCommit: string | null, knowledgeCommit: string | null): boolean {
  if (srcCommit === null || knowledgeCommit === null) return false;
  // %cI carries each committer's own UTC offset — epoch comparison, not string order.
  return Date.parse(srcCommit) > Date.parse(knowledgeCommit);
}

/** The later of two commit stamps by instant; null only when both are null. */
function newerOf(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
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
