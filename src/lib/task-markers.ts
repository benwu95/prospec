/**
 * Single executable copy of the frozen task kind grammar
 * (skills/references/tasks-format: `[ID?] [P?] [M|V]` after the checkbox;
 * unmarked = code). Both the drift engine and the archive task stats parse
 * tasks.md through this — two hand-mirrored regexes would let verify V1 and
 * archive disagree on the same file.
 */

export type TaskKind = 'code' | 'manual' | 'verification';

export interface ParsedTaskLine {
  checked: boolean;
  kind: TaskKind;
  text: string;
}

const CHECKBOX = /^\s*[-*]\s+\[([ x])\]\s+(.*)$/i;
const KIND_MARKER = /^(?:[A-Za-z]{0,3}\d+[a-z]?\s+)?(?:\[P\]\s+)?\[([MV])\]\s/i;

/** Parse one tasks.md line; null when it is not a checkbox task line. */
export function parseTaskLine(line: string): ParsedTaskLine | null {
  const m = CHECKBOX.exec(line);
  const mark = m?.[1];
  const rest = m?.[2];
  if (mark === undefined || rest === undefined) return null;
  const kindLetter = KIND_MARKER.exec(rest)?.[1]?.toUpperCase();
  return {
    checked: mark.toLowerCase() === 'x',
    kind: kindLetter === 'M' ? 'manual' : kindLetter === 'V' ? 'verification' : 'code',
    text: rest.trim(),
  };
}
