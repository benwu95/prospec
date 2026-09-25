import { posix } from 'node:path';
import { forbiddenArtifacts } from '../types/change.js';
import {
  CandidatePayloadSchema,
  DecisionPayloadSchema,
  type CandidatePayload,
  type DecisionGradedBy,
  type DecisionPayload,
} from '../types/station.js';
import type { PlanDecisionOption } from '../types/change.js';
import type { DependencyRules } from './drift-checker.js';
import { isSafeResourceName } from './knowledge-reader.js';

/**
 * Structural fact-checkers for the artifact kinds `prospec validate` grades
 * (issue #107). Pure and I/O-free — the validate service collects file
 * contents / git state and passes them in.
 *
 * Honest boundary (delta-spec REQ-CLI-031): `slug` and `promote-scaffold` are
 * complete machine verdicts. `backfill-draft` and `design-spec` report the
 * STRUCTURAL SUBSET — sections, route headers, raw `[NEEDS CLARIFICATION]`
 * count and locations. The >50% guardrail's story-level denominator and
 * heuristic-WHY exemption, and design component-set extraction from proposal
 * prose, are semantic judgment: the skill applies them over these facts.
 */

export interface ValidationFinding {
  level: 'FAIL' | 'INFO';
  message: string;
}

export interface ValidationVerdict {
  ok: boolean;
  findings: ValidationFinding[];
}

export interface NcMarker {
  line: number; // 1-indexed
  text: string;
}

/** Every `[NEEDS CLARIFICATION…]` marker with its 1-indexed line. */
export function collectNcMarkers(content: string): NcMarker[] {
  const markers: NcMarker[] = [];
  content.split('\n').forEach((line, i) => {
    if (line.includes('[NEEDS CLARIFICATION')) {
      markers.push({ line: i + 1, text: line.trim() });
    }
  });
  return markers;
}

// --- validate slug ---

export function validateSlug(name: string): ValidationVerdict {
  if (isSafeResourceName(name)) return { ok: true, findings: [] };
  return {
    ok: false,
    findings: [
      {
        level: 'FAIL',
        message: `'${name}' is not a safe resource name (no path separators, '..', or empty segments)`,
      },
    ],
  };
}

// --- validate backfill-draft (structural subset) ---

export interface BackfillDraftFacts {
  featureHeaderCount: number;
  storyHeaderCount: number;
  ncMarkers: NcMarker[];
}

export interface BackfillDraftReport extends ValidationVerdict {
  facts: BackfillDraftFacts;
}

/**
 * Route-compatibility structure: at least one `**Feature:**` and one
 * `**Story:**` header, so the draft can later promote through the forward
 * path unchanged. NC markers are reported as raw facts (count + locations) —
 * the ratio judgment stays in the skill.
 */
export function validateBackfillDraft(content: string): BackfillDraftReport {
  const featureHeaderCount = (content.match(/\*\*Feature:\*\*/g) ?? []).length;
  const storyHeaderCount = (content.match(/\*\*Story:\*\*/g) ?? []).length;
  const ncMarkers = collectNcMarkers(content);
  const findings: ValidationFinding[] = [];
  if (featureHeaderCount === 0) {
    findings.push({ level: 'FAIL', message: 'no `**Feature:**` header — draft is not route-compatible' });
  }
  if (storyHeaderCount === 0) {
    findings.push({ level: 'FAIL', message: 'no `**Story:**` header — draft is not route-compatible' });
  }
  findings.push({
    level: 'INFO',
    message: `${ncMarkers.length} [NEEDS CLARIFICATION] marker(s) — ratio judgment (story-level denominator, heuristic-WHY exemption) is the skill's`,
  });
  return {
    ok: featureHeaderCount > 0 && storyHeaderCount > 0,
    findings,
    facts: { featureHeaderCount, storyHeaderCount, ncMarkers },
  };
}

// --- validate promote-scaffold (complete verdict) ---

/**
 * Trust-zone cleanliness probe result. `unavailable` carries the reason the
 * probe could not run (git failure, unreadable config) — an unknown state,
 * never conflated with "clean".
 */
export type TrustZoneProbe = { dirty: string[] } | { unavailable: string };

export interface PromoteScaffoldInputs {
  slug: string;
  hasBackfillDraft: boolean;
  hasProposal: boolean;
  /** Promotion's own product — required, so a caller cannot forget to probe it. */
  hasDeltaSpec: boolean;
  hasPlan: boolean;
  hasTasks: boolean;
  /** Parsed metadata fields (undefined when metadata.yaml is missing/unreadable). */
  metadata?: { scale?: string; status?: string; relatedModules?: string[] };
  /** Uncommitted paths under the trust zone (`specs/features/` …) — must be empty. */
  trustZoneProbe: TrustZoneProbe;
}

export function validatePromoteScaffold(inputs: PromoteScaffoldInputs): ValidationVerdict {
  const findings: ValidationFinding[] = [];
  const slugVerdict = validateSlug(inputs.slug);
  findings.push(...slugVerdict.findings);
  if (!inputs.hasBackfillDraft) {
    findings.push({ level: 'FAIL', message: 'backfill-draft.md is missing — promotion requires the reviewed draft' });
  }
  if (!inputs.hasProposal) {
    findings.push({ level: 'FAIL', message: 'proposal.md is missing' });
  }
  if (!inputs.hasDeltaSpec) {
    findings.push({
      level: 'FAIL',
      message: 'delta-spec.md is missing — it is what promotion produces, not an optional extra',
    });
  }
  // The forbidden set comes from the SAME registry the plan/tasks stations refuse
  // from — not a second hand-written copy a registry edit would leave stale.
  const artifactPresence: Record<string, boolean | undefined> = {
    'plan.md': inputs.hasPlan,
    'tasks.md': inputs.hasTasks,
  };
  for (const artifact of forbiddenArtifacts('backfill')) {
    if (artifactPresence[artifact] === undefined) {
      findings.push({
        level: 'FAIL',
        message: `${artifact} is forbidden under \`scale: backfill\` but this verdict cannot probe it — the registry gained an artifact the validator does not check`,
      });
    } else if (artifactPresence[artifact]) {
      findings.push({
        level: 'FAIL',
        message: `${artifact} must not exist — backfill is a light scale that records existing code`,
      });
    }
  }
  if (inputs.metadata === undefined) {
    findings.push({ level: 'FAIL', message: 'metadata.yaml is missing or unreadable' });
  } else {
    if (inputs.metadata.scale !== 'backfill') {
      findings.push({ level: 'FAIL', message: `metadata.scale must be 'backfill' (found '${inputs.metadata.scale ?? 'absent'}')` });
    }
    if (inputs.metadata.status !== 'implemented') {
      findings.push({ level: 'FAIL', message: `metadata.status must be 'implemented' (found '${inputs.metadata.status ?? 'absent'}')` });
    }
    if ((inputs.metadata.relatedModules ?? []).length === 0) {
      findings.push({
        level: 'FAIL',
        message: 'metadata.related_modules is empty — the traced modules from the draft must be recorded (`prospec change story --related-module <m>`)',
      });
    }
  }
  if ('unavailable' in inputs.trustZoneProbe) {
    // An unrunnable probe must never read as "clean" — disclose it in the
    // verdict so this can never be a PASS with no findings.
    findings.push({
      level: 'INFO',
      message: `trust-zone cleanliness could not be verified (${inputs.trustZoneProbe.unavailable}) — treat the gate as not run, not as clean`,
    });
  } else {
    for (const path of inputs.trustZoneProbe.dirty) {
      findings.push({ level: 'FAIL', message: `trust-zone path has uncommitted changes: ${path} — promotion never writes the trust zone` });
    }
  }
  return { ok: findings.every((f) => f.level !== 'FAIL'), findings };
}

// --- validate design-spec (structural subset) ---

export const DESIGN_SPEC_REQUIRED_SECTIONS = [
  'Visual Identity',
  'Components',
  'Responsive Strategy',
] as const;

export interface DesignSpecFacts {
  missingSections: string[];
  ncMarkers: NcMarker[];
}

export interface DesignSpecReport extends ValidationVerdict {
  facts: DesignSpecFacts;
}

/**
 * Structure check: the required sections exist as headings and no
 * `[NEEDS CLARIFICATION]` markers remain. Component-coverage (proposal UI
 * scope ↔ spec entries) needs the component list extracted from proposal
 * prose — judgment, applied by the skill over this report.
 */
export function validateDesignSpec(content: string): DesignSpecReport {
  const missingSections = DESIGN_SPEC_REQUIRED_SECTIONS.filter(
    (section) => !new RegExp(`^#{1,4}\\s+.*${section}`, 'im').test(content),
  );
  const ncMarkers = collectNcMarkers(content);
  const findings: ValidationFinding[] = [
    ...missingSections.map((s) => ({
      level: 'FAIL' as const,
      message: `required section missing: ${s}`,
    })),
    ...(ncMarkers.length > 0
      ? [
          {
            level: 'FAIL' as const,
            message: `${ncMarkers.length} unresolved [NEEDS CLARIFICATION] marker(s) remain`,
          },
        ]
      : []),
  ];
  return {
    ok: findings.length === 0,
    findings,
    facts: { missingSections, ncMarkers },
  };
}

// --- feature-map coverage set difference (backfill Phase 4 scoping) ---

/** `allFeatures − coveredFeatures`, order-stable by the allFeatures order. */
export function coverageGap(allFeatures: string[], coveredFeatures: string[]): string[] {
  const covered = new Set(coveredFeatures);
  return allFeatures.filter((f) => !covered.has(f));
}

// --- validate candidates (complete verdict + metrics facts) ---

/** One candidate or decision file as the service read it; `content: null` = unreadable. */
export interface CandidateFileInput {
  file: string;
  content: string | null;
}

export interface CandidatesInputs {
  candidates: CandidateFileInput[];
  /** null when `candidates/decision.json` is absent. */
  decision: CandidateFileInput | null;
  rules: DependencyRules;
  /** Repo-relative path → module, from the shared `moduleAttributor`. */
  attribute: (relPath: string) => string | null;
}

export interface CandidateMetricsRow {
  id: string;
  title: string;
  direction_violations: number;
  violating_edges: Array<{ from: string; to: string }>;
  touched_modules_count: number;
  touched_modules: string[];
  estimated_lines: number | null;
  unknown_references: string[];
}

export interface CandidateMetricsFacts {
  rule_source: DependencyRules['source'];
  /** Exactly one valid candidate — a disclosed degraded selection, not a failure. */
  degraded: boolean;
  metrics: CandidateMetricsRow[];
  decision:
    | { state: 'absent' | 'invalid' }
    | { state: 'valid'; recommended_option: PlanDecisionOption; graded_by: DecisionGradedBy };
}

export interface CandidatesReport extends ValidationVerdict {
  facts: CandidateMetricsFacts;
}

const HOP_SEPARATOR = /→|->/;

/** A path token as prose writes it: markdown quoting, a leading `./` and trailing
 *  punctuation are not the path, and `..` is resolved so a literal prefix cannot
 *  misattribute it. Null when the path escapes the repository root. */
function normalizePathToken(token: string): string | null {
  const stripped = token.replace(/\\/g, '/').replace(/^[`'"(]+/, '').replace(/[`'"),.;:]+$/, '');
  const normalized = posix.normalize(stripped);
  return normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/') ? null : normalized;
}

/** Resolve one hop: the first whitespace token containing `/` or `\` — other than a
 *  route that begins with `/` — is a repo-relative path for the attributor; a hop
 *  without one resolves only by an exact module name. A hop that is neither is an entry
 *  label (`prospec status`, `POST /api/users`) and returns `label`. */
function resolveHop(
  hop: string,
  attribute: CandidatesInputs['attribute'],
  known: ReadonlySet<string>,
): { module: string } | { unknown: string } | 'label' {
  const tokens = hop.trim().split(/\s+/).filter((t) => t !== '');
  const pathToken = tokens.find((t) => /[\\/]/.test(t) && !/^[`'"(]*\//.test(t));
  if (pathToken !== undefined) {
    const normalized = normalizePathToken(pathToken);
    const module = normalized === null ? null : attribute(normalized);
    return module === null ? { unknown: pathToken } : { module };
  }
  const first = tokens[0];
  return first !== undefined && known.has(first) ? { module: first } : 'label';
}

export function computeCandidateMetrics(
  candidate: CandidatePayload,
  rules: DependencyRules,
  attribute: CandidatesInputs['attribute'],
): CandidateMetricsRow {
  const known = new Set(rules.allowed.keys());
  const touched = new Set<string>();
  const unknown = new Set<string>();
  const violations = new Map<string, { from: string; to: string }>();

  for (const declared of candidate.touched_modules ?? []) {
    if (known.has(declared)) touched.add(declared);
    else unknown.add(declared);
  }
  for (const chain of candidate.call_chain ?? []) {
    let previous: string | null = null;
    for (const hop of chain.split(HOP_SEPARATOR)) {
      const resolved = resolveHop(hop, attribute, known);
      if (resolved === 'label' || 'unknown' in resolved) {
        if (resolved !== 'label') unknown.add(resolved.unknown);
        previous = null;
        continue;
      }
      touched.add(resolved.module);
      if (previous !== null && previous !== resolved.module && !rules.allowed.get(previous)?.has(resolved.module)) {
        violations.set(`${previous}→${resolved.module}`, { from: previous, to: resolved.module });
      }
      previous = resolved.module;
    }
  }

  return {
    id: candidate.id,
    title: candidate.title,
    direction_violations: violations.size,
    violating_edges: [...violations.values()],
    touched_modules_count: touched.size,
    touched_modules: [...touched].sort(),
    estimated_lines: candidate.estimated_lines ?? null,
    unknown_references: [...unknown].sort(),
  };
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

export type DecisionState =
  | { state: 'absent' }
  | { state: 'invalid'; where: string }
  | { state: 'valid'; payload: DecisionPayload };

/** The one reading of `candidates/decision.json` every consumer shares. */
export function parseDecision(input: CandidateFileInput | null): DecisionState {
  if (input === null) return { state: 'absent' };
  if (input.content === null) return { state: 'invalid', where: 'unreadable' };
  const parsed = DecisionPayloadSchema.safeParse(parseJson(input.content));
  if (!parsed.success) {
    return { state: 'invalid', where: parsed.error.issues.map((i) => i.path.join('.') || '(root)').join(', ') };
  }
  return { state: 'valid', payload: parsed.data };
}

export interface CandidateSetVerdict extends ValidationVerdict {
  valid: CandidatePayload[];
  decision: DecisionState;
}

/**
 * The candidate-set verdict without metrics — shared by `validate candidates` and the
 * plan sign-off, so a set the validator FAILs can never be signed. Every candidate file
 * must be readable, schema-valid and named after its own id, at least one must be
 * valid, and a present decision must be schema-valid and name only valid candidates
 * (a `hybrid` recommendation needs its text and at least two valid candidates).
 */
export function checkCandidateSet(
  candidates: readonly CandidateFileInput[],
  decisionFile: CandidateFileInput | null,
): CandidateSetVerdict {
  const findings: ValidationFinding[] = [];
  const valid: CandidatePayload[] = [];

  for (const input of candidates) {
    if (input.content === null) {
      findings.push({ level: 'FAIL', message: `${input.file}: unreadable` });
      continue;
    }
    const parsed = CandidatePayloadSchema.safeParse(parseJson(input.content));
    if (!parsed.success) {
      const where = parsed.error.issues.map((i) => i.path.join('.') || '(root)').join(', ');
      findings.push({ level: 'FAIL', message: `${input.file}: not a valid candidate payload (${where})` });
      continue;
    }
    if (input.file !== `${parsed.data.id}.json`) {
      findings.push({ level: 'FAIL', message: `${input.file}: file name does not match its id '${parsed.data.id}'` });
      continue;
    }
    valid.push(parsed.data);
  }
  if (valid.length === 0) {
    findings.push({ level: 'FAIL', message: 'no valid candidate payload under candidates/' });
  }

  const decision = parseDecision(decisionFile);
  if (decision.state === 'invalid') {
    findings.push({ level: 'FAIL', message: `decision.json: not a valid decision payload (${decision.where}; a legacy file may lack graded_by)` });
  } else if (decision.state === 'valid') {
    const ids = new Set<string>(valid.map((c) => c.id));
    const { recommended_option: recommended, hybrid_recommendation: hybrid, evaluation_matrix: matrix } = decision.payload;
    if (recommended === 'hybrid') {
      if (hybrid === undefined || hybrid.trim() === '') {
        findings.push({ level: 'FAIL', message: 'decision.json: recommended_option hybrid needs a hybrid_recommendation' });
      }
      if (valid.length < 2) {
        findings.push({ level: 'FAIL', message: 'decision.json: recommended_option hybrid needs at least two valid candidates' });
      }
    } else if (!ids.has(recommended)) {
      findings.push({ level: 'FAIL', message: `decision.json: recommended_option '${recommended}' is not a valid candidate` });
    }
    for (const row of matrix) {
      if (row.winner !== 'tie' && !ids.has(row.winner)) {
        findings.push({ level: 'FAIL', message: `decision.json: ${row.dimension} winner '${row.winner}' is not a valid candidate` });
      }
    }
  }

  return { ok: !findings.some((f) => f.level === 'FAIL'), findings, valid, decision };
}

/**
 * The `candidates` verdict (`checkCandidateSet`) plus per-candidate metrics. Metrics are
 * comparison data for the selection, never a gate — violations, unknown references and
 * a single candidate are INFO.
 */
export function validateCandidates(inputs: CandidatesInputs): CandidatesReport {
  const set = checkCandidateSet(inputs.candidates, inputs.decision);
  const findings = [...set.findings];
  const metrics = set.valid.map((candidate) => computeCandidateMetrics(candidate, inputs.rules, inputs.attribute));
  for (const row of metrics) {
    if (row.direction_violations > 0) {
      const edges = row.violating_edges.map((e) => `${e.from} → ${e.to}`).join(', ');
      findings.push({ level: 'INFO', message: `${row.id}: ${row.direction_violations} dependency-direction violation(s): ${edges}` });
    }
    if (row.unknown_references.length > 0) {
      findings.push({ level: 'INFO', message: `${row.id}: unattributed references: ${row.unknown_references.join(', ')}` });
    }
  }
  const degraded = metrics.length === 1;
  if (degraded) {
    findings.push({ level: 'INFO', message: 'only one valid candidate — degraded selection, disclose it' });
  }
  const decision: CandidateMetricsFacts['decision'] =
    set.decision.state === 'valid'
      ? {
          state: 'valid',
          recommended_option: set.decision.payload.recommended_option,
          graded_by: set.decision.payload.graded_by,
        }
      : { state: set.decision.state };

  return {
    ok: set.ok,
    findings,
    facts: { rule_source: inputs.rules.source, degraded, metrics, decision },
  };
}

