/**
 * Reads the reference map a DEPLOYED skill actually carries.
 *
 * Deliberately independent of `STATION_REFERENCES` and of the renderer that
 * writes from it: the drift check compares what the registry says with what the
 * shipped instructions say, and a parser built on the registry could only ever
 * agree with itself. It answers two questions about one SKILL.md — which
 * references are cited under which heading, and whether a given map text is
 * present at a given heading — and nothing else.
 *
 * Grammar is the narrow one this map uses: a `references/<name>.md` path written
 * as a markdown link, an inline code span, or bare prose, at any heading depth.
 * Fenced blocks and HTML comments are masked, and an unclosed
 * fence makes the whole read untrustworthy rather than quietly truncated.
 */
import { withoutFencedBlocks, hasUnclosedFence } from './markdown-fences.js';
import { stripTrailingCr } from './text-lines.js';

/** One citation of a reference, at the heading path that carries it. */
export interface ProseCitation {
  /** Heading path, `## A > ### B`, joined with ` > ` and without the hashes. */
  site: string;
  /** Deployed file name, e.g. `plan-format.md`. */
  reference: string;
  /** 1-based line in the SKILL.md. */
  line: number;
}

export interface SkillReferenceProse {
  citations: ProseCitation[];
  /** Body text per heading path, fenced blocks masked. */
  sections: Map<string, string>;
  /** Heading paths that occur more than once — a citation there is unlocatable. */
  duplicateSites: string[];
  /** The document is malformed; every answer below is untrustworthy. */
  unclosedFence: boolean;
}

const HEADING = /^(#{2,6})\s+(.*)$/;
// Capture the complete path token, including unknown names and extensions.
// Matching only a .md prefix would certify x.md.bak as a citation of x.md.
const CITATION = /references\/([^\s`<>"()[\]#?]+)/g;

/** Parse one deployed SKILL.md into its per-site reference map. */
export function parseSkillReferenceProse(raw: string): SkillReferenceProse {
  const rawLines = raw.split('\n');
  const masked = withoutFencedBlocks(rawLines).join('\n')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => comment.replace(/[^\r\n]/g, ' '))
    .split('\n');
  const citations: ProseCitation[] = [];
  const sections = new Map<string, string[]>();
  const seen = new Set<string>();
  const duplicateSites: string[] = [];
  const stack: string[] = [];
  let site = '';

  masked.forEach((maskedLine, index) => {
    const line = stripTrailingCr(maskedLine);
    const heading = HEADING.exec(line);
    if (heading !== null) {
      const depth = heading[1]!.length - 2;
      stack.length = depth;
      stack[depth] = heading[2]!.trim();
      site = stack.filter((part) => part !== undefined && part !== '').join(' > ');
      if (seen.has(site)) {
        if (!duplicateSites.includes(site)) duplicateSites.push(site);
      } else {
        seen.add(site);
        sections.set(site, []);
      }
      return;
    }
    sections.get(site)?.push(line);
    const found = new Set<string>();
    for (const match of line.matchAll(CITATION)) {
      // Bare prose may end its path with sentence punctuation.
      const reference = match[1]!.replace(/[.,;:!]+$/, '');
      // Glob/template examples describe an inventory, not a concrete load point.
      if (reference !== '' && !/[*{}]/.test(reference)) found.add(reference);
    }
    for (const reference of found) citations.push({ site, reference, line: index + 1 });
  });

  return {
    citations,
    sections: new Map([...sections].map(([key, lines]) => [key, lines.join('\n')])),
    duplicateSites,
    unclosedFence: hasUnclosedFence(rawLines),
  };
}

/** Whether the deployed prose cites this reference AT this site specifically. */
export function citesReferenceAt(prose: SkillReferenceProse, site: string, reference: string): boolean {
  return prose.citations.some((citation) => citation.site === site && citation.reference === reference);
}

/** Whether a rendered map text is present, verbatim, under this heading. */
export function carriesTextAt(prose: SkillReferenceProse, site: string, text: string): boolean {
  return prose.sections.get(site)?.includes(text) ?? false;
}

/** Every reference the deployed prose names anywhere, in first-seen order. */
export function citedReferences(prose: SkillReferenceProse): string[] {
  const names: string[] = [];
  for (const citation of prose.citations) {
    if (!names.includes(citation.reference)) names.push(citation.reference);
  }
  return names;
}
