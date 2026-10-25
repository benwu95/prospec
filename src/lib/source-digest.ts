import { createHash } from 'node:crypto';

/** Version tag of the module source digest; a recorded digest of any other version reads as absent. */
export const SOURCE_DIGEST_VERSION = 'source-v1';

const CURRENT_DIGEST = new RegExp(`^${SOURCE_DIGEST_VERSION}:[0-9a-f]{64}$`);

/** One file of a module's source: its project-relative POSIX path and git's object id for its content. */
export interface SourceDigestEntry {
  path: string;
  id: string;
}

export type ObjectFormat = 'sha1' | 'sha256';

function frame(hash: ReturnType<typeof createHash>, data: string): void {
  const bytes = Buffer.from(data);
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  hash.update(length).update(bytes);
}

/**
 * The digest of a module's source (REQ-LIB-015): each entry's path and object id,
 * length-prefixed and in byte order of path, so the value depends on content and
 * paths only — never on enumeration order, history or platform.
 */
export function moduleSourceDigest(entries: readonly SourceDigestEntry[]): string {
  const hash = createHash('sha256');
  frame(hash, SOURCE_DIGEST_VERSION);
  const sorted = [...entries].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  for (const entry of sorted) {
    frame(hash, entry.path);
    frame(hash, entry.id);
  }
  return `${SOURCE_DIGEST_VERSION}:${hash.digest('hex')}`;
}

export function isCurrentDigestFormat(value: unknown): value is string {
  return typeof value === 'string' && CURRENT_DIGEST.test(value);
}

/** The id git assigns a blob holding `bytes` — used for a symlink's link text, which `git hash-object` cannot hash without following the link. */
export function gitBlobId(bytes: Buffer, format: ObjectFormat): string {
  return createHash(format)
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest('hex');
}

export function objectFormatOf(id: string): ObjectFormat | null {
  if (/^[0-9a-f]{40}$/.test(id)) return 'sha1';
  if (/^[0-9a-f]{64}$/.test(id)) return 'sha256';
  return null;
}
