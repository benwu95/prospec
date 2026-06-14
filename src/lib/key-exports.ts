import * as path from 'node:path';

export interface KeyFileRef {
  path: string;
  description: string;
}

export interface KeyExport {
  name: string;
  description: string;
}

/**
 * Derive a Recipe-First "key exports" list from a module's key files.
 *
 * Shared by knowledge generate and knowledge-update so both flows produce the
 * SAME export-name shape — otherwise alternating the two rewrites the README's
 * auto section in a different style (and possibly different membership).
 *
 * Looks at the first 10 files, drops tests, simplifies the export name
 * (`.service` → `.execute()`, kebab → camelCase), and caps the list at 8.
 */
export function deriveKeyExports(keyFiles: KeyFileRef[]): KeyExport[] {
  const exports: KeyExport[] = [];

  for (const file of keyFiles.slice(0, 10)) {
    const basename = path.basename(file.path, path.extname(file.path));
    if (basename.endsWith('.test') || basename.endsWith('.spec')) continue;

    const name = basename
      .replace(/\.service$/, '.execute()')
      .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

    exports.push({ name, description: file.description });
  }

  return exports.slice(0, 8);
}
