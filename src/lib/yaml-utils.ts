import { isDeepStrictEqual } from 'node:util';
import { Document, parseDocument, stringify, isAlias, isMap, isNode, isPair, isScalar, isSeq, visit } from 'yaml';
import type { DocumentOptions, Node, Pair, ParseOptions, SchemaOptions, ToStringOptions, YAMLMap, YAMLSeq } from 'yaml';
import { YamlParseError } from '../types/errors.js';
import { ModuleMapSchema } from '../types/module-map.js';
import { collapseWhitespace } from './text-lines.js';

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

function withoutUndefinedValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => item === undefined ? null : withoutUndefinedValues(item));
  }
  if (value !== null && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, withoutUndefinedValues(item)]));
  }
  return value;
}

function materializeAliases(doc: Document): void {
  const targets = new Map<Node, Node>();
  visit(doc, { Alias(_key, alias) {
    const target = alias.resolve(doc);
    if (target) targets.set(alias, target);
  } });
  if (targets.size === 0) return;

  const comments = (source: string | null | undefined, occurrence: string | null | undefined) =>
    [source, occurrence].filter(value => value != null).join('\n') || undefined;
  const expand = (node: unknown): unknown => {
    if (isAlias(node)) {
      const target = targets.get(node);
      if (!target) throw new YamlParseError('<document>', `Unresolved alias: ${node.source}`);
      const copy = expand(target) as Node;
      copy.commentBefore = comments(copy.commentBefore, node.commentBefore);
      copy.comment = comments(copy.comment, node.comment);
      copy.spaceBefore = copy.spaceBefore || node.spaceBefore;
      return copy;
    }
    if (isPair(node)) {
      const copy = node.clone();
      copy.key = expand(node.key);
      copy.value = expand(node.value);
      return copy;
    }
    if (!isNode(node)) return node;
    const copy = node.clone();
    if ('anchor' in copy) delete copy.anchor;
    if (isMap(node) && isMap(copy)) {
      copy.items = node.items.map(pair => expand(pair) as Pair);
    } else if (isSeq(node) && isSeq(copy)) {
      copy.items = node.items.map(item => expand(item));
    }
    return copy;
  };
  doc.contents = expand(doc.contents) as typeof doc.contents;
}

function reconcileSequence(seq: YAMLSeq, values: unknown[], doc: Document, path: string[]): void {
  const modules = path.length === 1 && path[0] === 'modules';
  const keyOf = (value: unknown) => modules && isPlainObject(value) && typeof value.name === 'string'
    ? `name:${value.name}` : JSON.stringify(value);
  const available = new Map<string | undefined, unknown[]>();
  for (const item of seq.items) {
    const key = keyOf(isNode(item) ? item.toJSON() : item);
    const occurrences = available.get(key) ?? [];
    occurrences.push(item);
    available.set(key, occurrences);
  }
  seq.items = values.map(value => {
    const existing = available.get(keyOf(value))?.shift();
    if (isMap(existing) && isPlainObject(value)) {
      reconcileMap(existing, value, doc, true, path);
      return existing;
    }
    return existing ?? doc.createNode(value);
  });
}

/**
 * Reconcile a YAMLMap in place against a plain object, preserving comments and
 * formatting wherever the structure is unchanged:
 * - a scalar whose value changed is updated by value, keeping its node (and the
 *   pair's comments) intact
 * - a nested object recurses, so only the changed leaves are touched
 * - collections are rebuilt by default; the Module Map policy retains module
 *   and scalar-item occurrences and their metadata
 * - type changes use new nodes
 * - a key absent from `obj` (or explicitly `undefined`) is deleted
 */
function reconcileMap(
  map: YAMLMap,
  obj: Record<string, unknown>,
  doc: Document,
  preserveModuleMap = false,
  path: string[] = [],
): void {
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
    if (preserveModuleMap && isNode(existing) && isDeepStrictEqual(existing.toJS(doc), value)) {
      continue;
    }
    if (isPlainObject(value) && isMap(existing)) {
      reconcileMap(existing, value, doc, preserveModuleMap, [...path, key]);
    } else if (preserveModuleMap && isSeq(existing) && Array.isArray(value)) {
      reconcileSequence(existing, value, doc, [...path, key]);
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
  options: { preserveModuleMap?: boolean } = {},
): void {
  if (options.preserveModuleMap) {
    const original = doc.toJS();
    if (isDeepStrictEqual(original, value)) return;
    for (const input of [original, value]) {
      const parsed = ModuleMapSchema.safeParse(input);
      if (!parsed.success || !isDeepStrictEqual(parsed.data, input)) {
        throw new YamlParseError('<document>',
          'Unsupported Module Map data: writes require only fields and value types declared by ModuleMapSchema; check the Prospec version and module-map.yaml before writing');
      }
    }
    materializeAliases(doc);
  }
  if (isMap(doc.contents)) {
    reconcileMap(doc.contents, value, doc, options.preserveModuleMap);
  } else {
    doc.contents = doc.createNode(value) as typeof doc.contents;
  }
  if (options.preserveModuleMap
    && !isDeepStrictEqual(parseYaml(doc.toString()), withoutUndefinedValues(value))) {
    throw new YamlParseError('<document>', 'Module Map reconciliation does not match the requested values');
  }
}

/**
 * Escape user-provided text for interpolation into a double-quoted YAML
 * scalar inside a Handlebars template (rendered with noEscape) — a raw `"`,
 * `\`, or newline would make the generated YAML unparseable. Collapses all
 * whitespace to single spaces (the target scalars are single-line).
 */
export function escapeYamlScalar(text: string): string {
  return collapseWhitespace(text.replace(/\\/g, '\\\\').replace(/"/g, '\\"'));
}
