import * as fs from 'node:fs';
import * as path from 'node:path';
import { isMap, isScalar, isSeq, visit, type Document } from 'yaml';
import {
  ChangeMetadataSchema,
  QualityLogEntrySchema,
  NewChangeMetadataSchema,
  NewQualityLogEntrySchema,
  type ChangeMetadata,
  type NewQualityLogEntry,
} from '../types/change.js';
import { MetadataValidationError } from '../types/errors.js';
import {
  TEST_GATE_NOT_ADJUDICATED,
  TEST_GATE_PRODUCER,
  type TestGateEntrance,
} from '../types/station.js';
import { atomicWrite, captureFileInputs } from './fs-utils.js';
import { planVersionDigest } from './escalation.js';
import { parseYamlDocument, stringifyYaml, stringifyYamlDocument } from './yaml-utils.js';
import { collapseWhitespace } from './text-lines.js';

/**
 * The single read/write entry point for a change's `metadata.yaml`.
 *
 * `metadata.yaml` is the only state shared across the SDD stations, and each
 * station used to cast it (`doc.toJS() as ChangeMetadata`) without checking —
 * so a malformed field surfaced not at the write that broke it but at some
 * later station that misread it. Every access goes through here instead, and
 * the schema is enforced on both sides of the boundary.
 *
 * Validation is a gate, never a rewrite: reads return the `Document` alongside
 * the parsed value so callers keep the comment- and unknown-field-preserving
 * write-back path, and a rejected write leaves the target file untouched.
 */

/**
 * Validate an already-parsed value against the change-metadata contract.
 *
 * Throws `MetadataValidationError` naming the change and every offending field
 * path — the caller needs to locate the value, not merely learn it was wrong.
 */
export function assertValidChangeMetadata(
  value: unknown,
  changeName: string,
): ChangeMetadata {
  const parsed = ChangeMetadataSchema.safeParse(value);
  if (!parsed.success) {
    throw new MetadataValidationError(
      changeName,
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return parsed.data;
}

/**
 * Read and validate `metadata.yaml`, returning the parsed metadata together
 * with its `Document`.
 *
 * The `Document` is what makes a later write lossless — mutate it in place and
 * hand it to `writeChangeMetadataDoc`, and comments plus fields this schema
 * does not model survive the round trip. A YAML syntax error still surfaces as
 * `YamlParseError` from `parseYamlDocument`: unparseable and schema-invalid are
 * distinct failures and must not be collapsed into one.
 */
export function readChangeMetadata(
  metadataPath: string,
  changeName: string,
): { doc: Document; metadata: ChangeMetadata } {
  const doc = parseYamlDocument(fs.readFileSync(metadataPath, 'utf-8'), metadataPath);
  return { doc, metadata: assertValidChangeMetadata(doc.toJS(), changeName) };
}

/**
 * The change's `scale` for SUGGESTION-shaped callers only: an absent, unreadable
 * or invalid record degrades to `undefined` (scale unknown) instead of throwing.
 * A gate must never use this — a gate reads through `readChangeMetadata` so a
 * malformed record is loud. Single-sourced because two stations need the same
 * degradation and a hand-copied try/catch is how they drift (PB-006).
 */
export function readScaleQuietly(
  metadataPath: string,
  changeName: string,
): string | undefined {
  if (!fs.existsSync(metadataPath)) return undefined;
  try {
    return readChangeMetadata(metadataPath, changeName).metadata.scale;
  } catch {
    return undefined;
  }
}

/**
 * A proven backfill: `scale: backfill` with its `backfill-draft.md` beside the
 * metadata. `scale` alone is hand-editable, so every gate that relaxes for a
 * backfill keys on the draft the promotion path alone produces (PB-024).
 */
export function isProvenBackfill(changeDir: string, scale: string | undefined): boolean {
  return scale === 'backfill' && fs.existsSync(path.join(changeDir, 'backfill-draft.md'));
}

/** Read only the typed ledger when archiving a pre-schema metadata envelope. */
export function readArchivedQualityLog(metadataPath: string, changeName: string): NewQualityLogEntry[] {
  if (!fs.existsSync(metadataPath)) return [];
  const doc = parseYamlDocument(fs.readFileSync(metadataPath, 'utf8'), metadataPath);
  const value = doc.toJS() as { quality_log?: unknown } | null;
  const parsed = QualityLogEntrySchema.array().safeParse(value?.quality_log ?? []);
  if (!parsed.success) throw new MetadataValidationError(changeName, parsed.error.message);
  return parsed.data;
}

/**
 * Validate a mutated `Document` and write it back, preserving comments and any
 * fields outside the schema. Validation runs before the write, so a rejected
 * document never reaches disk.
 */
export async function writeChangeMetadataDoc(
  metadataPath: string,
  doc: Document,
  changeName: string,
): Promise<void> {
  assertValidChangeMetadata(doc.toJS(), changeName);
  let hasAliases = false;
  visit(doc, { Alias() { hasAliases = true; return visit.BREAK; } });
  // Alias bindings depend on preceding anchors (including reused anchor names).
  // Keep authored order for these documents rather than changing their meaning.
  if (isMap(doc.contents) && !hasAliases) {
    const order = Object.keys(NewChangeMetadataSchema.shape);
    const rank = (key: unknown): number => {
      const index = order.indexOf(isScalar(key) ? String(key.value) : String(key));
      return index < 0 ? order.length : index;
    };
    doc.contents.items.sort((a, b) => rank(a.key) - rank(b.key));
  }
  await atomicWrite(metadataPath, stringifyYamlDocument(doc));
}

/**
 * Validate and write a freshly-built metadata object — the create path, where
 * there is no prior document to preserve. Field order comes from the object's
 * own key order, which the metadata-format reference fixes as canonical.
 */
export async function writeChangeMetadataObject(
  metadataPath: string,
  metadata: ChangeMetadata,
): Promise<void> {
  assertValidChangeMetadata(metadata, metadata.name);
  await atomicWrite(metadataPath, stringifyYaml(metadata));
}

/**
 * Build an entry object in canonical key order (skill → date → result → warnings →
 * grade → dimensions → criticals_found → criticals_fixed → majors → round → verifier_verdict →
 * audited_option → audited_plan_digest → signoff_option → signoff_plan_digest → context_id → baseline_revision → coverage_summary).
 * Validated against NewQualityLogEntrySchema first.
 */
export function buildOrderedQualityLogEntry(entry: NewQualityLogEntry): Record<string, unknown> {
  const parsed = NewQualityLogEntrySchema.parse(entry);
  const ordered: Record<string, unknown> = {
    skill: parsed.skill,
    date: parsed.date,
    result: parsed.result,
    warnings: parsed.warnings,
  };
  if (parsed.grade !== undefined) ordered.grade = parsed.grade;
  if (parsed.dimensions !== undefined) ordered.dimensions = parsed.dimensions;
  if (parsed.criticals_found !== undefined) ordered.criticals_found = parsed.criticals_found;
  if (parsed.criticals_fixed !== undefined) ordered.criticals_fixed = parsed.criticals_fixed;
  if (parsed.majors !== undefined) ordered.majors = parsed.majors;
  if (parsed.round !== undefined) ordered.round = parsed.round;
  if (parsed.verifier_verdict !== undefined) ordered.verifier_verdict = parsed.verifier_verdict;
  if (parsed.audited_option !== undefined) ordered.audited_option = parsed.audited_option;
  if (parsed.audited_plan_digest !== undefined) ordered.audited_plan_digest = parsed.audited_plan_digest;
  if (parsed.signoff_option !== undefined) ordered.signoff_option = parsed.signoff_option;
  if (parsed.signoff_plan_digest !== undefined) ordered.signoff_plan_digest = parsed.signoff_plan_digest;
  if (parsed.context_id !== undefined) ordered.context_id = parsed.context_id;
  if (parsed.baseline_revision !== undefined) ordered.baseline_revision = parsed.baseline_revision;
  if (parsed.coverage_summary !== undefined) ordered.coverage_summary = parsed.coverage_summary;
  if (parsed.attempt_id !== undefined) ordered.attempt_id = parsed.attempt_id;
  if (parsed.accepted !== undefined) ordered.accepted = parsed.accepted;
  if (parsed.escalation !== undefined) ordered.escalation = parsed.escalation;
  return ordered;
}

/**
 * Append one quality_log entry to a read Document, in the canonical key order
 * the metadata-format reference fixes (skill → date → result → warnings →
 * station-specific optional keys). The entry is validated against the strict
 * build schema first — user text is serialized as DATA by the yaml library, so
 * escaping is by construction, and optional keys are emitted only when present.
 * The caller still writes the document via `writeChangeMetadataDoc`.
 */
export function appendQualityLogEntry(doc: Document, entry: NewQualityLogEntry): void {
  const ordered = buildOrderedQualityLogEntry(entry);

  if (doc.has('quality_log')) {
    doc.addIn(['quality_log'], doc.createNode(ordered));
  } else {
    doc.set('quality_log', doc.createNode([ordered]));
  }
}

/**
 * Upsert one review round entry in a read Document: if a `skill: prospec-review`
 * entry with the same `round` exists, replace it in place; otherwise append it.
 * Round-less entries (legacy or round-close entries) are never matched or overwritten.
 * Reuses `NewQualityLogEntrySchema` validation and canonical key ordering.
 */
export function upsertReviewRoundEntry(doc: Document, entry: NewQualityLogEntry): void {
  const ordered = buildOrderedQualityLogEntry(entry);
  const node = doc.createNode(ordered);

  if (!doc.has('quality_log')) {
    doc.set('quality_log', doc.createNode([ordered]));
    return;
  }

  const seq = doc.get('quality_log');
  if (isSeq(seq) && entry.round !== undefined) {
    const targetRound = entry.round;
    const existingIndex = seq.items.findIndex((item) => {
      if (isMap(item)) {
        const skill = item.get('skill');
        const round = item.get('round');
        return skill === 'prospec-review' && round === targetRound &&
          item.get('escalation') === undefined && item.get('accepted') === undefined;
      }
      return false;
    });

    if (existingIndex >= 0) {
      seq.items[existingIndex] = node;
      return;
    }
  }

  doc.addIn(['quality_log'], node);
}

/** The files that make up the plan version a verifier audits and a human signs. */
export function planVersionInputs(changeDir: string): { plan: string; delta: string } {
  return { plan: path.join(changeDir, 'plan.md'), delta: path.join(changeDir, 'delta-spec.md') };
}

/** The current plan version and a recheck that it is still the one read. */
export function capturePlanVersion(changeDir: string): { digest: string; recheck: () => boolean } {
  const capture = captureFileInputs(planVersionInputs(changeDir));
  return { digest: planVersionDigest(capture.values.plan ?? null, capture.values.delta ?? null), recheck: capture.recheck };
}

/** A plan sign-off written by `change log --signoff` — provenance, not a gate result. */
export function isPlanSignoffEntry(entry: { skill?: string; signoff_option?: string; escalation?: unknown }): boolean {
  return entry.skill === 'prospec-plan' && entry.signoff_option !== undefined && entry.escalation === undefined;
}

// Compatibility exports: the pure escalation core owns shared provenance.
export {
  isReviewCloseEntry, isReviewRoundCountsEntry,
  verifierGateResultOf, latestVerifierEntry, latestStampedVerifierEntry,
  latestVerifierResult, latestFreshPlanSignoff, hasPlanSignoffAfterVerifier,
  planChangedSinceVerifier, planVersionDigest,
} from './escalation.js';

/** The one WARN line a test-gate exemption records: prefix, entrance, reason. */
export function testGateWarning(entrance: TestGateEntrance, reason: string): string {
  return `${TEST_GATE_NOT_ADJUDICATED} (${entrance}): ${collapseWhitespace(reason)}`;
}

/**
 * Append the test-gate exemption WARN for one entrance and reason — under the
 * producer label `prospec-test-gate`, never `prospec-review` (which the review
 * round count would read as a completed round). Deduplicated: the same entrance
 * and reason already recorded appends nothing, so a retry never stacks
 * warnings. Returns whether the document changed. The caller still writes it
 * through `writeChangeMetadataDoc`.
 */
export function appendTestGateWarning(
  doc: Document,
  metadata: ChangeMetadata,
  entrance: TestGateEntrance,
  reason: string,
): boolean {
  const warning = testGateWarning(entrance, reason);
  const recorded = (metadata.quality_log ?? []).some(
    (entry) => entry.skill === TEST_GATE_PRODUCER && (entry.warnings ?? []).includes(warning),
  );
  if (recorded) return false;
  appendQualityLogEntry(doc, {
    skill: TEST_GATE_PRODUCER,
    date: new Date().toISOString().slice(0, 10),
    result: 'WARN',
    warnings: [warning],
  });
  return true;
}

/**
 * The single-line tracker reference a change registers, or `undefined` when it
 * registered none.
 *
 * THE one place the `issue` field's absent/blank/multi-line semantics are
 * decided, shared by every writer and reader (`change story` writes through it,
 * `status` and the archive summary read through it) — three hand-copied variants
 * disagreed on blank alone (PB-006: one helper, not a convention).
 *
 * Two rules, both load-bearing:
 *
 * - **Blank is not a registration.** A whitespace-only value — what `--issue
 *   "$REF"` expands to with `REF` unset — reads as absent, so the key stays out
 *   of the YAML and out of both display surfaces. `absent ≠ blank` is what
 *   `metadata-format` promises its readers.
 * - **Whitespace runs collapse to one space**, line breaks included. The value
 *   reaches `prospec status`'s per-change block and the archive summary that is
 *   copied verbatim into the committed `specs/_archived-history/` trail; a second
 *   line there renders a forged `##` heading or a forged `- **Quality Grade**:`
 *   row for real. This collapse is the ONLY guard — nothing refuses such a value
 *   on the way in, by design (the field's shape is never validated), and metadata
 *   is hand-editable besides. So a new sink for this value must call this helper;
 *   skipping it reopens the gap. Same defence as `toInlineCodeSpan`'s line-break
 *   collapse (`lib/markdown-fences.ts`) and `escapeTableCell`'s
 *   (`lib/markdown-table.ts`).
 *
 * Takes `unknown` deliberately: `archive.service` reads metadata leniently (the
 * terminal station absorbs pre-schema records), so a non-string value must read
 * as "nothing registered" rather than be stringified into the audit trail.
 */
export function normalizeIssueRef(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const collapsed = collapseWhitespace(value);
  return collapsed === '' ? undefined : collapsed;
}

/**
 * Sanitize a string into a clean kebab-case slug for change directory naming.
 */
export function sanitizeChangeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\\/.]+/g, '-')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Derive a standard auto-draft fix change name: `fix-<target>-<check-id>`.
 */
export function deriveFixChangeName(target: string, checkId: string): string {
  const cleanTarget = sanitizeChangeSlug(target) || 'general';
  const cleanCheck = sanitizeChangeSlug(checkId) || 'drift';
  return `fix-${cleanTarget}-${cleanCheck}`;
}
