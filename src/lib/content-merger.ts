/**
 * Content merger for Prospec content markers.
 *
 * Handles merging of system-generated (auto) and user-written sections
 * using HTML comment markers:
 *
 *   <!-- prospec:auto-start -->
 *   (system content — overwritten on regeneration)
 *   <!-- prospec:auto-end -->
 *
 *   <!-- prospec:user-start -->
 *   (user content — preserved on regeneration)
 *   <!-- prospec:user-end -->
 */

/** Marker patterns */
const AUTO_START = '<!-- prospec:auto-start -->';
const AUTO_END = '<!-- prospec:auto-end -->';
const USER_START = '<!-- prospec:user-start -->';
const USER_END = '<!-- prospec:user-end -->';

interface ContentSection {
  type: 'auto' | 'user' | 'static';
  content: string;
}

/**
 * Parse a document into sections based on prospec content markers.
 *
 * Sections are classified as:
 * - 'auto': between auto-start and auto-end (system-generated)
 * - 'user': between user-start and user-end (user-written)
 * - 'static': everything else
 */
export function parseSections(content: string): ContentSection[] {
  const lines = content.split('\n');
  const sections: ContentSection[] = [];
  let currentLines: string[] = [];
  let currentType: ContentSection['type'] = 'static';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === AUTO_START) {
      // Flush current static section
      if (currentLines.length > 0) {
        sections.push({ type: currentType, content: currentLines.join('\n') });
        currentLines = [];
      }
      // Include the marker line in the auto section
      currentLines.push(line);
      currentType = 'auto';
      continue;
    }

    if (trimmed === AUTO_END && currentType === 'auto') {
      currentLines.push(line);
      sections.push({ type: 'auto', content: currentLines.join('\n') });
      currentLines = [];
      currentType = 'static';
      continue;
    }

    if (trimmed === USER_START) {
      // Flush current static section
      if (currentLines.length > 0) {
        sections.push({ type: currentType, content: currentLines.join('\n') });
        currentLines = [];
      }
      currentLines.push(line);
      currentType = 'user';
      continue;
    }

    if (trimmed === USER_END && currentType === 'user') {
      currentLines.push(line);
      sections.push({ type: 'user', content: currentLines.join('\n') });
      currentLines = [];
      currentType = 'static';
      continue;
    }

    currentLines.push(line);
  }

  // Flush remaining lines
  if (currentLines.length > 0) {
    sections.push({ type: currentType, content: currentLines.join('\n') });
  }

  return sections;
}

/**
 * Extract user sections from existing content.
 *
 * Returns an array of user section contents (including markers),
 * in the order they appear in the document.
 */
export function extractUserSections(content: string): string[] {
  return parseSections(content)
    .filter((s) => s.type === 'user')
    .map((s) => s.content);
}

/**
 * Merge new content with existing content, preserving user sections.
 *
 * Strategy:
 * - Auto sections in the new content replace auto sections in the existing content
 * - User sections from the existing content are preserved (not overwritten)
 * - Static sections use the new content version
 *
 * If the existing content is empty or has no user sections, the new content
 * is returned as-is.
 *
 * @param newContent - Freshly generated content (from templates)
 * @param existingContent - Previously existing file content (may contain user edits)
 * @returns Merged content with user sections preserved
 */
export function mergeContent(
  newContent: string,
  existingContent: string,
): string {
  if (!existingContent.trim()) {
    return newContent;
  }

  const existingUserSections = extractUserSections(existingContent);

  // If there are no user sections in the existing content, return new content as-is
  if (existingUserSections.length === 0) {
    return newContent;
  }

  // Parse new content into sections
  const newSections = parseSections(newContent);

  // Replace user sections in the new content with existing user sections
  let userIndex = 0;
  const mergedSections = newSections.map((section) => {
    if (section.type === 'user' && userIndex < existingUserSections.length) {
      const preserved = existingUserSections[userIndex]!;
      userIndex++;
      return { ...section, content: preserved };
    }
    return section;
  });

  const merged = mergedSections.map((s) => s.content);

  // If the existing file had more user sections than the regenerated content
  // has user slots, append the surplus so user edits are never silently lost.
  const leftover = existingUserSections.slice(userIndex);
  if (leftover.length > 0) {
    merged.push(...leftover);
  }

  return merged.join('\n');
}

// Block matchers derived from the marker constants (single source — a marker
// typo can't drift the regex out of sync). The markers contain no regex
// metacharacters, so they need no escaping. Non-greedy body so each matches a
// single block.
const AUTO_BLOCK_RE = new RegExp(`${AUTO_START}[\\s\\S]*?${AUTO_END}`);
const USER_BLOCK_RE = new RegExp(`${USER_START}[\\s\\S]*?${USER_END}`);

/**
 * Merge freshly generated content into a "managed document" — an agent entry
 * config (CLAUDE.md / AGENTS.md) that uses the auto/user block contract.
 *
 * Unlike {@link mergeContent}, pre-existing content WITHOUT markers is migrated
 * into the user block rather than discarded, so a hand-written CLAUDE.md is
 * preserved the first time `prospec init` / `agent sync` adopts the contract.
 *
 * - existing already managed (has an auto block): replace ONLY the auto block in
 *   place with `generated`'s auto block; the user block and everything around it
 *   are preserved verbatim ("只更新 auto 區塊").
 * - existing unmanaged (no markers) but non-empty: keep `generated` and move the
 *   existing content into `generated`'s user block (nothing is dropped).
 * - existing empty/absent: return `generated` unchanged.
 *
 * Idempotent: re-running over its own output replaces the auto block with an
 * identical one and leaves the user block untouched → byte-identical result.
 *
 * @param generated - Freshly rendered template; carries both blocks.
 * @param existing - Current file content (empty, unmanaged, or managed).
 */
export function mergeManagedDoc(generated: string, existing: string): string {
  if (!existing.trim()) {
    return generated;
  }

  // Managed file: surgically swap the auto block, preserve the rest. Function
  // replacer so `$`-sequences in the generated body are inserted verbatim, not
  // read as replacement patterns (cf. knowledge-update.service auto-block swap).
  if (AUTO_BLOCK_RE.test(existing)) {
    const generatedAuto = generated.match(AUTO_BLOCK_RE);
    if (!generatedAuto) return generated;
    return existing.replace(AUTO_BLOCK_RE, () => generatedAuto[0]);
  }

  // Unmanaged file: migrate the existing content into generated's user block.
  return injectUserBlock(generated, existing.replace(/\n+$/, ''));
}

/**
 * Replace the body of `generated`'s user block with `body` (the migrated
 * content). Function replacer keeps `$`-sequences in `body` verbatim.
 */
function injectUserBlock(generated: string, body: string): string {
  const block = `${USER_START}\n${body}\n${USER_END}`;
  if (USER_BLOCK_RE.test(generated)) {
    return generated.replace(USER_BLOCK_RE, () => block);
  }
  // Defensive: a generated doc without a user block (e.g. a degenerate template)
  // still must not drop the migrated content — append a fresh user block.
  return `${generated.replace(/\n+$/, '')}\n\n${block}\n`;
}
