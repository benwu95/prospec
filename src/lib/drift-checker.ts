import {
  DRIFT_CHECK_IDS,
  DRIFT_REPORT_FILENAME,
  DRIFT_REPORT_VERSION,
  DriftReportSchema,
  type DriftCheckId,
  type DriftCheckResult,
  type DriftFinding,
  type DriftReport,
  type KnowledgeHealth,
} from '../types/drift-report.js';
import { DriftReportInvalid } from '../types/errors.js';
import type { ModuleMap } from '../types/module-map.js';
import type {
  FeatureMapGovernanceSource,
  GitTimestampSource,
  ImportEdgeSource,
  LinkSource,
  McpReadmeCountSource,
  MetadataCompletenessSource,
  ReqDefinitionIndex,
  ReqReference,
  ReviewProvenanceSource,
  TaskSource,
} from './drift-sources.js';

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
  metadataCompleteness: MetadataCompletenessSource;
  generatedAt: string;
}

interface CheckOutcome {
  result: DriftCheckResult;
  findings: DriftFinding[];
  knowledgeHealth?: KnowledgeHealth;
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
    const stale = m.readme_exists ? isStale(m.last_src_commit, m.last_readme_commit) : true;
    healthModules.push({
      name: m.name,
      last_src_commit: m.last_src_commit,
      last_readme_commit: m.last_readme_commit,
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
          `is newer than README last commit ${m.last_readme_commit}`,
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
 * Review provenance — an `implemented`, non-backfill change must carry a review
 * baseline whose digest still matches the current code (REQ-LIB-024). Absent →
 * fail (review never ran); mismatch → fail (code changed since review, re-review
 * needed). FAIL-class: this is the machine gate that makes review non-skippable
 * before verify. Backfill and non-`implemented` changes are exempt (not flagged);
 * an unavailable source (not git / no changes dir / no digest) skips.
 *
 * Assumes a single change in flight at a time (the normal prospec workflow): the
 * one whole-tree `current_digest` is compared against every change, so with
 * concurrent changes, editing one flips the others stale — over-blocking
 * (fail-closed), never fail-open.
 */
export function evaluateReviewProvenance(src: ReviewProvenanceSource): CheckOutcome {
  if (!src.available) {
    return skipped('review-provenance', src.reason ?? 'source unavailable');
  }
  const findings: DriftFinding[] = [];
  for (const c of src.changes) {
    if (c.status !== 'implemented' || c.scale === 'backfill') continue;
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

function isStale(srcCommit: string | null, readmeCommit: string | null): boolean {
  if (srcCommit === null || readmeCommit === null) return false;
  // %cI carries each committer's own UTC offset — epoch comparison, not string order.
  return Date.parse(srcCommit) > Date.parse(readmeCommit);
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
