import { withoutFencedBlocks } from './markdown-fences.js';
import { normalizeStationName } from '../types/status.js';
import {
  CONSTITUTION_SEVERITIES,
  type ConstitutionRuleEntry,
  type ConstitutionSeverity,
} from '../types/drift-report.js';

/**
 * Constitution rule inventory parser — the machine half of verify's Constitution
 * audit (REQ-LIB-032).
 *
 * `lib/constitution-rules.ts` writes the starter rules `prospec init` seeds; this
 * reads back whatever the project's CONSTITUTION.md now declares. Only the already
 * structured part is parsed — the rule's name, its RFC-2119 severity, and whether
 * it carries a `**Verify**:` hint. Whether the code violates a rule is not
 * mechanizable and stays with the agent.
 *
 * Pure: takes markdown text, returns data. All I/O lives in drift-sources.
 */

const PRINCIPLES_HEADING = /^##\s+Principles\s*$/;
/** Any heading at the section's own depth OR shallower closes it — `## Constraints`,
 *  `## Quality Standards`, and also a level-1 `# Appendix`, which would otherwise
 *  leave later `###` headings inventoried as principles. */
const SECTION_CLOSING_HEADING = /^#{1,2}\s+/;
const RULE_HEADING = /^###\s+(.+?)\s*$/;
const SEVERITY_TAGGED = /^\[([A-Z]+)\]\s*(.*)$/;
/**
 * The `**Name**:` label that opens a Constitution rule field — the ONE shape both
 * this inventory parser and the Language Policy Description comparison match, so
 * a change to the field syntax cannot reach one reader and not the other.
 */
export function ruleFieldLabel(name: string): RegExp {
  return new RegExp(`^\\*\\*${name}\\*\\*\\s*:`);
}
const VERIFY_HINT = ruleFieldLabel('Verify');

const SEVERITIES = new Set<string>(CONSTITUTION_SEVERITIES);

const CHECK_DECLARATION = /\bcheck:\s*([a-zA-Z0-9_-]+)(?:[;,]?\s*covers:\s*(.+?))?(?:\.\s+|;\s*|$|\.\s*$)/;
/** `stations:` is a reserved word on a `**Verify**:` line (any case); the clause
 *  runs to the next `;`, sentence end, end of line, or the next `check:` /
 *  `covers:` keyword — a comma before that keyword is the clause's, not a token. */
const STATIONS_LABEL = /\bstations:/i;
const STATIONS_CLAUSE_END = /;|\.(?:\s|$)|,?\s*(?=\b(?:check|covers):)/;
/** A whole-line thematic break closes a rule block (judged on fence-blanked lines,
 *  so a table row `|---|` or a fenced `---` never does). */
const RULE_BLOCK_BREAK = /^-{3,}\s*$/;

export interface VerifyDeclarations {
  check_id?: string;
  coverage?: string;
  /** `'all'`, the lower-cased tokens as written, or null when no clause is present. */
  stations: 'all' | string[] | null;
}

/** Shared declaration vocabulary for Constitution hints and playbook metadata. */
export function parseStationTokens(value: string): 'all' | string[] {
  const tokens = value
    .split(/[,\s]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0)
    .map((token) => normalizeStationName(token) ?? token);
  if (tokens.length === 1 && tokens[0] === 'all') return 'all';
  return tokens;
}

/**
 * Parse the machine declarations on one `**Verify**:` line. The `stations:` clause
 * is cut out first, so the lazy `covers:` capture can neither swallow it nor be
 * cut short by it, whatever the clause order. Splitting on commas AND whitespace
 * keeps a comma-less or capitalised list whole, so every token reaches the
 * evaluator instead of the first one silently standing for the list. Each token
 * is resolved as the CLI resolves `--station` (`new-story` → `story`); a token
 * outside the vocabulary stays as written so the evaluator can name it.
 */
export function parseVerifyDeclarations(hint: string): VerifyDeclarations {
  const label = STATIONS_LABEL.exec(hint);
  let rest = hint;
  let stations: VerifyDeclarations['stations'] = null;
  if (label !== null) {
    const after = hint.slice(label.index + label[0].length);
    const stop = STATIONS_CLAUSE_END.exec(after);
    const body = stop === null ? after : after.slice(0, stop.index);
    const tail = stop === null ? '' : after.slice(stop.index + stop[0].length);
    stations = parseStationTokens(body);
    rest = `${hint.slice(0, label.index)}${tail}`;
  }
  return { ...parseCheckDeclaration(rest), stations };
}

function parseCheckDeclaration(line: string): { check_id?: string; coverage?: string } {
  const match = CHECK_DECLARATION.exec(line);
  if (match === null || match[1] === undefined) {
    return {};
  }
  const check_id = match[1].trim();
  const rawCoverage = match[2]?.trim().replace(/\.+$/, '').trim();
  return {
    check_id,
    ...(rawCoverage !== undefined && rawCoverage.length > 0 ? { coverage: rawCoverage } : {}),
  };
}

/** One rule's inventory entry plus its block extent — 0-based line indices,
 *  `end` exclusive: the heading through the next `###`, a whole-line `---`, or
 *  the section end. `####` headings belong to the block above them. */
export interface ConstitutionRuleBlock {
  entry: ConstitutionRuleEntry;
  start: number;
  end: number;
}

export interface ConstitutionLayout {
  /** The `## Principles` section as 0-based `[start, end)` from its heading; null when absent. */
  principles: { start: number; end: number } | null;
  rules: ConstitutionRuleBlock[];
}

/**
 * Parse the `## Principles` section into one entry per `###` rule heading.
 *
 * Line numbers are 1-based and point at the rule heading, so a finding anchors
 * where the reader must edit. Fenced blocks are blanked first — a reference doc
 * or the Constitution's own example block may contain a `### [MUST] …` line that
 * declares nothing.
 */
export function parseConstitutionRules(markdown: string): ConstitutionRuleEntry[] {
  return locateConstitutionRules(markdown).rules.map((r) => r.entry);
}

/**
 * The one walk over the Constitution's section and rule boundaries — the
 * inventory reads its entries, the station slicer its line extents, so the two
 * cannot disagree about where a rule starts or what belongs to Principles.
 */
export function locateConstitutionRules(markdown: string): ConstitutionLayout {
  const lines = withoutFencedBlocks(markdown.split('\n'));
  const start = lines.findIndex((l) => PRINCIPLES_HEADING.test(l));
  if (start === -1) return { principles: null, rules: [] };

  const rules: ConstitutionRuleBlock[] = [];
  let current: ConstitutionRuleBlock | null = null;
  let open = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (SECTION_CLOSING_HEADING.test(line)) {
      end = i;
      break;
    }

    const heading = RULE_HEADING.exec(line);
    if (heading !== null && heading[1] !== undefined) {
      if (current !== null && open) current.end = i;
      current = {
        entry: { ...parseRuleHeading(heading[1]), has_verify_hint: false, line: i + 1, stations: null },
        start: i,
        end: i + 1,
      };
      open = true;
      rules.push(current);
      continue;
    }
    if (current !== null && open && RULE_BLOCK_BREAK.test(line)) {
      current.end = i;
      open = false;
    }
    // A hint before the first rule heading belongs to no rule, and one after the
    // `---` that closed a block is outside every block — the slicer's extent and
    // the inventory's attribution must agree, so neither is attributed.
    if (current !== null && open && VERIFY_HINT.test(line.trimStart())) {
      const entry = current.entry;
      entry.has_verify_hint = true;
      const decl = parseVerifyDeclarations(line);
      if (decl.check_id !== undefined) {
        entry.check_id = decl.check_id;
        if (decl.coverage !== undefined) {
          entry.coverage = decl.coverage;
        }
      }
      if (decl.stations !== null) entry.stations = decl.stations;
    }
  }
  if (current !== null && open) current.end = end;
  return { principles: { start, end }, rules };
}

/** Split `[MUST] Name` into severity + name; an untagged or unknown-tag heading
 *  keeps its full text as the name and reports `severity: null` — never guessed,
 *  so verify can see the rule falls back to judgment grading. */
function parseRuleHeading(text: string): { name: string; severity: ConstitutionSeverity | null } {
  const tagged = SEVERITY_TAGGED.exec(text);
  if (tagged === null || tagged[1] === undefined || !SEVERITIES.has(tagged[1])) {
    return { name: text, severity: null };
  }
  const name = (tagged[2] ?? '').trim();
  return {
    name: name.length > 0 ? name : text,
    severity: tagged[1] as ConstitutionSeverity,
  };
}
