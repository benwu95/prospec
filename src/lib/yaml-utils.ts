import { Document, parseDocument, stringify, isMap, isScalar } from 'yaml';
import type { DocumentOptions, ParseOptions, SchemaOptions, ToStringOptions, YAMLMap } from 'yaml';
import { YamlParseError } from '../types/errors.js';

/**
 * Parse a YAML string into a JavaScript value.
 * Wraps errors with YamlParseError for consistent handling.
 */
export function parseYaml<T = unknown>(
  content: string,
  sourcePath?: string,
): T {
  try {
    const doc = parseDocument(content);
    if (doc.errors.length > 0) {
      const firstError = doc.errors[0];
      throw new YamlParseError(
        sourcePath ?? '<string>',
        firstError?.message,
      );
    }
    return doc.toJS() as T;
  } catch (err) {
    if (err instanceof YamlParseError) throw err;
    throw new YamlParseError(
      sourcePath ?? '<string>',
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Stringify a JavaScript value to a YAML string.
 */
export function stringifyYaml(
  value: unknown,
  options?: DocumentOptions & SchemaOptions & ParseOptions & ToStringOptions,
): string {
  return stringify(value, options);
}

/**
 * Parse YAML string into a Document for comment-preserving round-trips.
 * The Document API allows modifying values while preserving comments.
 */
export function parseYamlDocument(
  content: string,
  sourcePath?: string,
): Document {
  try {
    const doc = parseDocument(content);
    if (doc.errors.length > 0) {
      const firstError = doc.errors[0];
      throw new YamlParseError(
        sourcePath ?? '<string>',
        firstError?.message,
      );
    }
    return doc;
  } catch (err) {
    if (err instanceof YamlParseError) throw err;
    throw new YamlParseError(
      sourcePath ?? '<string>',
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Stringify a YAML Document back to string, preserving comments.
 */
export function stringifyYamlDocument(doc: Document): string {
  return doc.toString();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural equality for JSON-safe values (config values are JSON-safe). */
function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Reconcile a YAMLMap in place against a plain object, preserving comments and
 * formatting wherever the structure is unchanged:
 * - a scalar whose value changed is updated by value, keeping its node (and the
 *   pair's comments) intact
 * - a nested object recurses, so only the changed leaves are touched
 * - an array, a type change, or an otherwise structurally-different value is
 *   rebuilt (item-level comments inside a changed collection are not preserved)
 * - a key absent from `obj` (or explicitly `undefined`) is deleted
 */
function reconcileMap(map: YAMLMap, obj: Record<string, unknown>, doc: Document): void {
  const existingKeys = map.items.map((pair) =>
    isScalar(pair.key) ? String(pair.key.value) : String(pair.key),
  );
  for (const key of existingKeys) {
    if (!(key in obj) || obj[key] === undefined) {
      map.delete(key);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const existing = map.get(key, true);
    if (isPlainObject(value) && isMap(existing)) {
      reconcileMap(existing, value, doc);
    } else if (isScalar(existing) && !isPlainObject(value) && !Array.isArray(value)) {
      if (existing.value !== value) existing.value = value;
    } else if (existing !== undefined && valuesEqual(existing.toJSON(), value)) {
      // Value unchanged (e.g. an identical array) — leave the node and its comments.
    } else {
      map.set(key, doc.createNode(value));
    }
  }
}

/**
 * Apply a plain object to a Document in place, preserving comments and formatting
 * where the structure is unchanged. Falls back to replacing the whole contents
 * when the document has no top-level map to merge into (e.g. an empty file).
 */
export function mergeIntoDocument(
  doc: Document,
  value: Record<string, unknown>,
): void {
  if (isMap(doc.contents)) {
    reconcileMap(doc.contents, value, doc);
  } else {
    doc.contents = doc.createNode(value) as typeof doc.contents;
  }
}

/**
 * Escape user-provided text for interpolation into a double-quoted YAML
 * scalar inside a Handlebars template (rendered with noEscape) — a raw `"`,
 * `\`, or newline would make the generated YAML unparseable. Collapses all
 * whitespace to single spaces (the target scalars are single-line).
 */
export function escapeYamlScalar(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\s+/g, ' ')
    .trim();
}
