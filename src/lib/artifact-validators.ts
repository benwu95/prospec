import { forbiddenArtifacts } from '../types/change.js';
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
