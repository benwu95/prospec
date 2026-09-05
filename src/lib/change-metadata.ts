import * as fs from 'node:fs';
import { isMap, isScalar, visit, type Document } from 'yaml';
import {
  ChangeMetadataSchema,
  NewChangeMetadataSchema,
  NewQualityLogEntrySchema,
  type ChangeMetadata,
  type NewQualityLogEntry,
} from '../types/change.js';
import { MetadataValidationError } from '../types/errors.js';
import { atomicWrite } from './fs-utils.js';
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
 * Append one quality_log entry to a read Document, in the canonical key order
 * the metadata-format reference fixes (skill → date → result → warnings →
 * station-specific optional keys). The entry is validated against the strict
 * build schema first — user text is serialized as DATA by the yaml library, so
 * escaping is by construction, and optional keys are emitted only when present.
 * The caller still writes the document via `writeChangeMetadataDoc`.
 */
export function appendQualityLogEntry(doc: Document, entry: NewQualityLogEntry): void {
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
  if (parsed.verifier_verdict !== undefined) ordered.verifier_verdict = parsed.verifier_verdict;

  if (doc.has('quality_log')) {
    doc.addIn(['quality_log'], doc.createNode(ordered));
  } else {
    doc.set('quality_log', doc.createNode([ordered]));
  }
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
