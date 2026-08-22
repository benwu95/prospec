/**
 * Landing-block fidelity — the one implementation of the delta-spec `**Spec:**`
 * ↔ trust-zone REQ-body comparison, shared by BOTH the archive write path
 * (`archive.service`'s `droppedFor`) and the `delta-spec-landing-fidelity` drift
 * check. Keeping it in ONE place is the point: two implementations that each
 * evolve on their own are exactly the drift the check exists to catch, so the
 * check must not re-derive the comparison archive lands on.
 *
 * Everything here is pure text — no I/O — so identical inputs produce an
 * identical verdict.
 */

/**
 * One `- WHEN … THEN …` bullet: `key` is whitespace-normalised for comparison,
 * `text` is the source lines exactly as written. Comparing on the key means a
 * re-indented or reflowed bullet is not a false drop; reporting the text means
 * what the author is asked to restore is what their file actually said.
 */
export interface Bullet {
  key: string;
  text: string;
}

/**
 * The comparison key, never the report: trim, drop the list marker, drop emphasis
 * around the keywords, then collapse whitespace runs.
 *
 * The marker MUST come out. `delta-spec-format` mandates `- WHEN …, THEN …` in a
 * landing block, so a project whose feature spec is written with `*` or `1.`
 * markers compares its own unchanged behaviour against the mandated shape and sees
 * a difference — a FALSE drop, which now holds the write and tells the author to
 * "restore" a bullet that is already there.
 */
function normalizeBullet(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*]|\d+\.)\s+/, '')
    .replace(/\*\*(WHEN|THEN)\*\*/gi, '$1')
    .replace(/\s+/g, ' ');
}

/** Any Markdown list marker: `-`, `*`, or an ordered `N.`. */
const LIST_MARKER = /^(?:[-*]|\d+\.)\s/;

/**
 * A `WHEN … THEN …` bullet's opening line, in any list style a project might use.
 * The emphasis run is optional and unanchored on the right so `**WHEN**` and
 * `WHEN` both match; `\b` still keeps `WHENEVER` out.
 */
const WHEN_BULLET = /^(?:[-*]|\d+\.)\s+\*{0,2}WHEN\b/i;

/**
 * `WHEN … THEN …` bullets of a REQ body, each joined with its indented
 * continuation lines: a wrapped bullet whose first line is unchanged but whose
 * `THEN` clause was rewritten is a total behavior swap, and comparing first
 * lines alone would report nothing.
 */
export function whenThenBullets(body: string): Bullet[] {
  return collectBullets(body, WHEN_BULLET);
}

/**
 * List items of `body` whose opening line matches `opens`, each joined with its
 * indented continuation lines.
 *
 * Shared by the drop diff and the deliberate-loss declaration so the two produce
 * IDENTICAL keys for identical text. If the declaration parsed differently, a
 * declaration copied straight out of the CLI's own dry-run report could fail to
 * match the drop it names, and the author would have no way to clear the gate.
 */
function collectBullets(body: string, opens: RegExp): Bullet[] {
  const bullets: Bullet[] = [];
  let open = false;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (opens.test(line)) {
      bullets.push({ key: normalizeBullet(line), text: raw });
      open = true;
      continue;
    }
    // A continuation must be INDENTED relative to the bullet. Without that, a
    // fenced code block, a table row or a trailing prose sentence sitting at
    // column 0 gets absorbed and the bullet no longer matches its unchanged
    // twin — a FALSE drop report. The "not another bullet" guard tracks the
    // widened marker set: leaving it at `-` would let a `*` sibling be swallowed.
    if (
      open &&
      line !== '' &&
      /^\s/.test(raw) &&
      !LIST_MARKER.test(line) &&
      !line.startsWith('#')
    ) {
      const last = bullets[bullets.length - 1]!;
      last.key = normalizeBullet(`${last.key} ${line}`);
      last.text += `\n${raw}`;
      continue;
    }
    open = false;
  }
  return bullets;
}

/**
 * The bullets an entry's `**Dropped:**` block declares it does not carry into the
 * new body (REQ-SERVICES-083).
 *
 * Every list item is captured, not just the `WHEN`-shaped ones: a declaration that
 * matches no computed drop must be reported as stale, and it can only be reported
 * if it was parsed in the first place. Keys come from the same collector the drop
 * diff uses, so a bullet copied out of `--dry-run` output matches the drop it names.
 */
export function declaredDrops(bodyLines: string[]): Bullet[] {
  return collectBullets(extractDeltaBlock(bodyLines, 'Dropped').content, LIST_MARKER);
}

/** The set difference of one REQ's landing block against the body it replaces,
 *  split three ways by its `**Dropped:**` declaration. Route-agnostic on purpose:
 *  archive shapes these into `DroppedBehavior`/`StaleDeclaration`, the drift check
 *  into findings, but both derive the SAME sets from this one function. */
export interface DropSets {
  /** Dropped and NOT declared — the loss that holds the archive write / fails the check. */
  undeclared: Bullet[];
  /** Dropped and declared deliberate — acknowledged, never blocking. */
  acknowledged: Bullet[];
  /** Declared but not actually dropped — a stale declaration (the delta-spec may
   *  describe an older body); reported, never blocking. */
  stale: Bullet[];
}

/**
 * Behavior the replacement body leaves behind — a SET difference, never a count.
 * The failure this exists to catch replaced three authored bullets with three
 * unrelated ones, so any count-based check would have passed it.
 */
export function assessDrops(existingBody: string, landing: string, declared: Bullet[]): DropSets {
  const kept = new Set(whenThenBullets(landing).map((b) => b.key));
  const dropped = whenThenBullets(existingBody).filter((b) => !kept.has(b.key));
  const declaredKeys = new Set(declared.map((b) => b.key));
  const droppedKeys = new Set(dropped.map((b) => b.key));
  return {
    undeclared: dropped.filter((b) => !declaredKeys.has(b.key)),
    acknowledged: dropped.filter((b) => declaredKeys.has(b.key)),
    stale: declared.filter((b) => !droppedKeys.has(b.key)),
  };
}

/** A `**Label:**` line — the boundary between delta-spec blocks. */
const DELTA_BLOCK_LABEL = /^\*\*([A-Za-z][\w \-/]*):\*\*/;

/** Any ATX heading — a block never swallows one (see extractDeltaBlock). */
const ATX_HEADING = /^#{1,6}\s/;

/**
 * The delta-spec template's OWN field labels — the registry that tells a normal
 * block boundary apart from a truncation (REQ-SERVICES-081).
 *
 * `Dropped` is in here for a second reason: it is where an author declares a
 * deliberate removal (REQ-SERVICES-083). Leaving it out would make every
 * declaration truncate the very block it accompanies.
 */
export const DELTA_TEMPLATE_FIELDS = [
  'Feature',
  'Story',
  'Before',
  'After',
  'Reason',
  'Description',
  'Acceptance Criteria',
  'Spec',
  'Dropped',
  'Priority',
] as const;

const TEMPLATE_FIELD_LOOKUP = new Set<string>(DELTA_TEMPLATE_FIELDS.map((f) => f.toLowerCase()));

/** What (if anything) ends a delta-spec block at this line. */
export type BlockTerminator =
  | { kind: 'none' }
  | { kind: 'template-field'; label: string }
  | { kind: 'foreign-label'; label: string }
  | { kind: 'heading' }
  | { kind: 'rule' };

/**
 * Classify one line as a block boundary (REQ-SERVICES-081).
 *
 * `alreadySeen` carries the template fields that appeared EARLIER in the same
 * entry, and a repeat of one of those is body text rather than a boundary — a
 * first-occurrence rule, NOT a fixed field order (the real corpus writes
 * `**Acceptance Criteria:**` before the landing block in one shape and after it in
 * another). Case-insensitive against the registry.
 */
export function classifyBlockTerminator(
  line: string,
  alreadySeen: ReadonlySet<string> = new Set(),
): BlockTerminator {
  if (ATX_HEADING.test(line)) return { kind: 'heading' };
  const trimmed = line.trim();
  if (trimmed === '---') return { kind: 'rule' };
  const label = DELTA_BLOCK_LABEL.exec(trimmed)?.[1];
  if (label === undefined) return { kind: 'none' };
  const key = label.toLowerCase();
  return TEMPLATE_FIELD_LOOKUP.has(key) && !alreadySeen.has(key)
    ? { kind: 'template-field', label }
    : { kind: 'foreign-label', label };
}

/** Does this line carry content of its own after the closing `**`? */
function labelLineHasInlineContent(line: string): boolean {
  const m = /^\*\*[A-Za-z][\w \-/]*:\*\*(.*)$/.exec(line.trim());
  return m !== null && m[1]!.trim() !== '';
}

/** Where a block was cut short by a label the template does not own. */
export interface DeltaBlockTruncation {
  /** Which block was cut short — `Spec`, `Description` or `Acceptance Criteria`. */
  block: string;
  /** The interrupting label, so the report can name it. */
  label: string;
  /** The label line as written — what the author looks for to find the spot. */
  firstSwallowedLine: string;
  /** Lines of CONTENT lost. A bare label line contributes nothing; a label
   *  carrying text after its closing `**` contributes itself. */
  swallowedCount: number;
}

export interface DeltaBlock {
  content: string;
  truncation: DeltaBlockTruncation | null;
}

/**
 * Content of one `**Label:**` block: the remainder of the label line plus every
 * following line up to the block's end. `content` is `''` when the block is
 * absent — the caller decides what that means.
 *
 * A block ends at one of the delta-spec template's OWN field labels, at any
 * heading, at an entry-separating `---`, or at the end of the entry. Meeting
 * anything else that merely LOOKS like a label — `**Scenarios:**` above all — is
 * not a boundary but a truncation reported in `truncation` so the caller can
 * refuse the REQ rather than write the remainder (REQ-SERVICES-081).
 */
export function extractDeltaBlock(bodyLines: string[], label: string): DeltaBlock {
  const labelRe = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.*)$`);
  const start = bodyLines.findIndex((l) => labelRe.test(l.trim()));
  if (start === -1) return { content: '', truncation: null };

  const first = bodyLines[start]!.trim().match(labelRe)![1]!.trim();
  const collected = first === '' ? [] : [first];
  let truncation: DeltaBlockTruncation | null = null;

  // Template fields consumed BEFORE this block — a repeat of one of them further
  // down is the author's body text, not the template's next field.
  const seen = new Set<string>([label.toLowerCase()]);
  for (let i = 0; i < start; i++) {
    const m = DELTA_BLOCK_LABEL.exec(bodyLines[i]!.trim());
    if (m) seen.add(m[1]!.toLowerCase());
  }

  for (let i = start + 1; i < bodyLines.length; i++) {
    const line = bodyLines[i]!;
    const boundary = classifyBlockTerminator(line, seen);
    if (boundary.kind === 'foreign-label') {
      // Everything from here to the REAL boundary is body the author wrote and
      // this block would drop. Count the CONTENT, not the lines.
      let swallowedCount = labelLineHasInlineContent(line) ? 1 : 0;
      for (let j = i + 1; j < bodyLines.length; j++) {
        const kind = classifyBlockTerminator(bodyLines[j]!, seen).kind;
        if (kind === 'template-field' || kind === 'heading' || kind === 'rule') break;
        if (bodyLines[j]!.trim() !== '') swallowedCount++;
      }
      if (swallowedCount > 0) {
        truncation = { block: label, label: boundary.label, firstSwallowedLine: line, swallowedCount };
        break;
      }
      // A bare label with nothing under it loses no behaviour — it ends the block.
      break;
    }
    if (boundary.kind !== 'none') break;
    collected.push(line);
  }
  return { content: collected.join('\n').trim(), truncation };
}

/** One delta-spec entry as its `### REQ-…` block places it, before any
 *  block-level parsing. The single walk of a delta-spec's structure, shared by
 *  `archive.service`'s route extraction and the drift check's collector so the
 *  two agree on which entries exist and what each one's body is. */
export interface DeltaEntry {
  /** `ADDED` | `MODIFIED` | `REMOVED` (uppercased), or `''` before the first section. */
  section: string;
  reqId: string;
  description: string;
  /** `**Feature:**` value, or `''` when absent. */
  feature: string;
  /** `**Story:**` value, or `''` when absent. */
  story: string;
  /** Every other line of the entry, in order — the input to `extractDeltaBlock`. */
  body: string[];
}

/** Walk a delta-spec into its REQ entries (one per `### REQ-…` heading). */
export function iterateDeltaEntries(deltaContent: string): DeltaEntry[] {
  const entries: DeltaEntry[] = [];
  let section = '';
  let reqId = '';
  let description = '';
  let feature = '';
  let story = '';
  let body: string[] = [];

  const push = () => {
    if (reqId) entries.push({ section, reqId, description, feature, story, body });
  };

  for (const line of deltaContent.split('\n')) {
    const sectionMatch = line.match(/^##\s+(ADDED|MODIFIED|REMOVED)/i);
    if (sectionMatch) {
      push();
      section = sectionMatch[1]!.toUpperCase();
      reqId = '';
      description = '';
      feature = '';
      story = '';
      body = [];
      continue;
    }
    const reqMatch = line.match(/^###\s+(REQ-[\w-]+):\s*(.*)/);
    if (reqMatch) {
      push();
      reqId = reqMatch[1]!;
      description = reqMatch[2]!.trim();
      feature = '';
      story = '';
      body = [];
      continue;
    }
    const featureMatch = line.match(/^\*\*Feature:\*\*\s*(.+)/);
    if (featureMatch) {
      feature = featureMatch[1]!.trim();
      continue;
    }
    const storyMatch = line.match(/^\*\*Story:\*\*\s*(.+)/);
    if (storyMatch) {
      story = storyMatch[1]!.trim();
      continue;
    }
    body.push(line);
  }
  push();
  return entries;
}
