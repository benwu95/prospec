import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { collectMarkdownLinks } from '../../src/lib/drift-sources.js';
import { withoutFencedBlocks } from '../../src/lib/markdown-fences.js';

// REQ-TEMPLATES-230: the root READMEs are a concise entry; detailed docs live
// under docs/ as English / Traditional Chinese pairs, listed by each
// language's index, and every repo-internal link reads the same on GitHub and
// in a local checkout.
const root = path.resolve(import.meta.dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const ROOT_READMES = ['README.md', 'README.zh-TW.md'];
const README_LINE_CEILING = 200;
const ZH = '.zh-TW.md';

function docsPages(): string[] {
  return (fs.readdirSync(path.join(root, 'docs'), { recursive: true }) as string[])
    .map((p) => `docs/${p.replace(/\\/g, '/')}`)
    .filter((p) => p.endsWith('.md'))
    .sort();
}
const englishPages = () => docsPages().filter((p) => !p.endsWith(ZH));
const twinOf = (page: string) => page.replace(/\.md$/, ZH);

const visibleLines = (text: string) => withoutFencedBlocks(text.split('\n'));
const headingLevels = (text: string) =>
  visibleLines(text).flatMap((l) => /^(#{1,6})\s/.exec(l)?.[1]?.length ?? []);

/** GitHub's heading anchor: lowercase, drop everything but letters, marks, numbers, spaces, `-` and `_`, spaces → `-`. */
function slug(heading: string): string {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}
function anchorsOf(rel: string): Set<string> {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const line of visibleLines(read(rel))) {
    const text = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)?.[1];
    if (text === undefined) continue;
    const base = slug(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

/** True when every segment of `rel` exists with exactly this spelling — a case-insensitive filesystem must not hide a wrong-case link. */
function existsExactCase(rel: string): boolean {
  let dir = root;
  for (const segment of rel.split('/')) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory() || !fs.readdirSync(dir).includes(segment)) return false;
    dir = path.join(dir, segment);
  }
  return true;
}

interface Link { source: string; line: number; target: string }
/** Every `](target)` outside code — including the outer link of a badge image, which the drift engine's pattern does not capture. */
function linksIn(rel: string): Link[] {
  const links: Link[] = [];
  visibleLines(read(rel)).forEach((text, i) => {
    const code = text.replace(/`[^`]*`/g, '');
    for (const m of code.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      links.push({ source: rel, line: i + 1, target: m[1]! });
    }
  });
  return links;
}
const linkedFiles = () => [...ROOT_READMES, 'CONTRIBUTING.md', ...docsPages()];
const REPO_BLOB = /^https?:\/\/github\.com\/benwu95\/prospec\/(?:blob|tree)\//;

describe('public docs structure', () => {
  it.each(ROOT_READMES)('%s stays a concise entry page', (readme) => {
    const lines = (read(readme).match(/\n/g) ?? []).length;
    expect(lines, `${readme} has ${lines} lines`).toBeLessThanOrEqual(README_LINE_CEILING);
  });

  it('docs/ holds at least one English page', () => {
    expect(englishPages().length).toBeGreaterThan(0);
  });

  it('every English docs page has a Traditional Chinese twin with the same heading structure', () => {
    for (const page of englishPages()) {
      const twin = twinOf(page);
      expect(fs.existsSync(path.join(root, twin)), `${page} lacks ${twin}`).toBe(true);
      expect(headingLevels(read(twin)), `${twin} heading levels`).toEqual(headingLevels(read(page)));
    }
  });

  it('every Traditional Chinese docs page has an English original', () => {
    const pages = new Set(docsPages());
    const orphans = docsPages()
      .filter((p) => p.endsWith(ZH))
      .map((p) => [p, p.slice(0, -ZH.length) + '.md'] as const)
      .filter(([, original]) => !pages.has(original))
      .map(([p, original]) => `${p} lacks ${original}`);
    expect(orphans).toEqual([]);
  });

  it.each([
    ['docs/README.md', (p: string) => !p.endsWith(ZH)],
    [`docs/README${ZH}`, (p: string) => p.endsWith(ZH)],
  ])('%s lists every other page in its language', (index, inLanguage) => {
    const listed = new Set(
      linksIn(index)
        .map((l) => l.target.split('#')[0]!)
        .filter((t) => t !== '')
        .map((t) => path.posix.normalize(path.posix.join('docs', t))),
    );
    const expected = docsPages().filter((p) => inLanguage(p) && p !== index);
    expect(expected.filter((p) => !listed.has(p)), `${index} misses`).toEqual([]);
  });
});

describe('public docs links', () => {
  it('every relative link target exists', () => {
    const scanned = new Set(linkedFiles());
    const missing = collectMarkdownLinks(['.'], root).links
      .filter((l) => scanned.has(l.source_path) && !l.exists)
      .map((l) => `${l.source_path}:${l.line} → ${l.raw_target}`);
    expect(missing).toEqual([]);
  });

  it('every repo-internal link is file-relative, exact-case, and its anchor resolves', () => {
    const problems: string[] = [];
    for (const file of linkedFiles()) {
      for (const { source, line, target } of linksIn(file)) {
        const at = `${source}:${line} → ${target}`;
        if (REPO_BLOB.test(target)) { problems.push(`${at} (repo URL; use a relative path)`); continue; }
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        if (target.startsWith('/')) { problems.push(`${at} (root-absolute path)`); continue; }
        const [pathPart, anchor] = target.split('#') as [string, string | undefined];
        const rel = pathPart === '' ? source : path.posix.normalize(path.posix.join(path.posix.dirname(source), decodeURI(pathPart)));
        if (rel.startsWith('..')) continue;
        if (!existsExactCase(rel)) { problems.push(`${at} (no file with this exact path)`); continue; }
        if (anchor !== undefined && rel.endsWith('.md') && !anchorsOf(rel).has(decodeURIComponent(anchor))) {
          problems.push(`${at} (no heading anchor)`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('every landing-page link into the repository targets an existing file', () => {
    const urls = [...read('docs/index.html').matchAll(/https:\/\/github\.com\/benwu95\/prospec\/blob\/main\/([^"'#?\s<]+)/g)];
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.map((m) => m[1]!).filter((rel) => !existsExactCase(rel))).toEqual([]);
  });
});
