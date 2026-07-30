import * as fs from 'node:fs';
import type { Document } from 'yaml';
import {
  ChangeMetadataSchema,
  NewQualityLogEntrySchema,
  type ChangeMetadata,
  type NewQualityLogEntry,
} from '../types/change.js';
import { MetadataValidationError } from '../types/errors.js';
import { atomicWrite } from './fs-utils.js';
import { parseYamlDocument, stringifyYaml, stringifyYamlDocument } from './yaml-utils.js';

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

  if (doc.has('quality_log')) {
    doc.addIn(['quality_log'], doc.createNode(ordered));
  } else {
    doc.set('quality_log', doc.createNode([ordered]));
  }
}
