export interface DeltaReqEntry {
  /** REQ ID (e.g., REQ-SERVICES-020) */
  id: string;
  /** Module name extracted from REQ ID (e.g., services) */
  module: string;
  /** Requirement title/description */
  description: string;
}

export interface DeltaSpecResult {
  added: DeltaReqEntry[];
  modified: DeltaReqEntry[];
  removed: DeltaReqEntry[];
  /**
   * REQ-shaped headings that fail the canonical `REQ-MODULE-NNN` form (a 3-digit
   * sequence, per delta-spec-format.md). Surfaced rather than silently dropped,
   * so a non-conforming id reported elsewhere is not invisibly skipped here.
   */
  malformed: string[];
}

/**
 * Parse delta-spec.md content into structured ADDED/MODIFIED/REMOVED entries.
 *
 * Extracts REQ IDs (REQ-{MODULE}-{NNN}) and maps them to module names.
 * Returns empty arrays for malformed or empty input (never throws).
 */
export function parseDeltaSpec(content: string): DeltaSpecResult {
  const result: DeltaSpecResult = { added: [], modified: [], removed: [], malformed: [] };

  if (!content || !content.trim()) {
    return result;
  }

  const lines = content.split('\n');
  let currentSection: 'added' | 'modified' | 'removed' | null = null;

  for (const line of lines) {
    // Detect section headers
    const sectionMatch = line.match(/^##\s+(ADDED|MODIFIED|REMOVED)/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1]!.toLowerCase() as 'added' | 'modified' | 'removed';
      continue;
    }

    // Canonical REQ heading: ### REQ-{MODULE}-{NNN} with a 3-digit sequence.
    const reqMatch = line.match(/^###\s+(REQ-([\w-]+)-\d{3}):\s*(.*)/);
    if (reqMatch && currentSection) {
      result[currentSection].push({
        id: reqMatch[1]!,
        module: reqMatch[2]!.toLowerCase(),
        description: reqMatch[3]!.trim(),
      });
      continue;
    }

    // A REQ-shaped heading that is NOT canonical (wrong digit count, missing
    // module segment, …) is surfaced, not silently dropped — the looser parsers
    // in archive.service may route it, so this keeps the two sides honest.
    const malformedMatch = line.match(/^###\s+(REQ-[\w-]+):/);
    if (malformedMatch && currentSection) {
      result.malformed.push(malformedMatch[1]!);
    }
  }

  return result;
}
