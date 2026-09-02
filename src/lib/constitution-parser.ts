import { withoutFencedBlocks } from './markdown-fences.js';
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

/**
 * Parse the `## Principles` section into one entry per `###` rule heading.
 *
 * Line numbers are 1-based and point at the rule heading, so a finding anchors
 * where the reader must edit. Fenced blocks are blanked first — a reference doc
 * or the Constitution's own example block may contain a `### [MUST] …` line that
 * declares nothing.
 */
export function parseConstitutionRules(markdown: string): ConstitutionRuleEntry[] {
  const lines = withoutFencedBlocks(markdown.split('\n'));
  const start = lines.findIndex((l) => PRINCIPLES_HEADING.test(l));
  if (start === -1) return [];

  const rules: ConstitutionRuleEntry[] = [];
  let current: ConstitutionRuleEntry | null = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (SECTION_CLOSING_HEADING.test(line)) break;

    const heading = RULE_HEADING.exec(line);
    if (heading !== null && heading[1] !== undefined) {
      current = { ...parseRuleHeading(heading[1]), has_verify_hint: false, line: i + 1 };
      rules.push(current);
      continue;
    }
    // A hint before the first rule heading belongs to no rule — ignore it rather
    // than attributing it to the section.
    if (current !== null && VERIFY_HINT.test(line.trimStart())) {
      current.has_verify_hint = true;
    }
  }
  return rules;
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
