/**
 * ONE definition of "what a skill's Startup Loading marks MANDATORY", shared by the
 * per-skill contract ledger and the per-scenario closure. Both ask the same parsing
 * question of the same text, and when each kept its own copy the two drifted within a
 * single change (round-2 M2-1): different per-run patterns, different reference
 * resolution, and one silently degrading an absent section to empty.
 */

/** A Startup Loading item authored per run has no fixed content to measure. */
export const PER_RUN_MANDATORY: readonly RegExp[] = [
  /^\.prospec\/changes\//,
  /^prospec\/specs\/features\/$/,
  /\/$/,
];

/**
 * Mandatory loads that are NOT shipped instructions: they are the host project's own
 * files, so their size is a property of the project rather than of prospec's
 * instruction budget. Each one is declared here with the reason it is excluded, so a
 * NEW mandatory load cannot be scored as zero — the per-skill ledger fails until it is
 * either a shipped reference or listed here.
 */
export const DECLARED_NON_SHIPPED: ReadonlyMap<string, string> = new Map([
  ['prospec/ai-knowledge/_conventions.md', "the host project's own conventions; size varies per project"],
  ['prospec/ai-knowledge/_module-readme-conventions.md', "the host project's own module-README conventions"],
  ['prospec/CONSTITUTION.md', "the host project's own constitution"],
  ['prospec/index.md', "the host project's own knowledge index"],
  ['.prospec.yaml', 'cited in a negative clause (never hand-edit), not as a load'],
]);

/** A citation is a path only if it looks like one; `prospec status` is a command. */
const looksLikePath = (cited: string) =>
  !/\s/.test(cited) && (cited.includes('/') || /\.(md|ya?ml|json)$/.test(cited));

/**
 * The Startup Loading body. An absent or empty section is a contract failure, never an
 * empty string to measure as zero (PB-001), so the caller passes its own assertion.
 */
export function startupLoadingSection(raw: string, fail: (message: string) => never): string {
  const match = /^## Startup Loading\n([\s\S]*?)(?=^## )/m.exec(raw);
  if (!match?.[1]?.trim()) fail('Startup Loading section must exist and be non-empty');
  return match![1]!;
}

/**
 * Every path cited on a `**MANDATORY**` line, in first-seen order. A `references/x.md`
 * citation is returned relative to the skill when `skillDirectory` is given, so both
 * callers can compare against deployed paths.
 *
 * **Known bound of this guard** — detection keys on the literal `**MANDATORY**` marker
 * appearing on the SAME line as the citation. A mandatory load declared any other way
 * is NOT counted, and the shipped instructions contain one such case today:
 * `prospec-verify`'s `> **SCALE: BACKFILL MANDATORY ROUTING**` block requires
 * `references/verify-backfill.md` (~982 tokens) before Phase 1 when
 * `metadata.scale` is `backfill`, and neither the per-skill ledger nor the
 * `proven-backfill` closure includes it. So "quietly adding a mandatory load turns this
 * red" holds for the marker form only; a differently-phrased declaration passes
 * unmeasured until the phrasing is added here (round-3 T3-1, left as a stated limit
 * rather than an unbounded chase of every possible wording).
 */
export function mandatoryCitations(section: string, skillDirectory?: string): string[] {
  const cited: string[] = [];
  for (const line of section.split('\n')) {
    if (!line.includes('**MANDATORY**')) continue;
    for (const match of line.matchAll(/`([^`]+)`|\]\(([^)]+)\)/g)) {
      const raw = (match[1] ?? match[2]!).replace(/^\.\//, '');
      if (!looksLikePath(raw) || PER_RUN_MANDATORY.some((shape) => shape.test(raw))) continue;
      const resolved = skillDirectory && raw.startsWith('references/') ? `${skillDirectory}/${raw}` : raw;
      if (!cited.includes(resolved)) cited.push(resolved);
    }
  }
  return cited;
}

/** The shipped-reference name a citation names, or null when it is a project file. */
export const referenceOf = (cited: string): string | null =>
  /(?:^|\/)references\/([a-z0-9-]+)\.md$/.exec(cited)?.[1] ?? null;
