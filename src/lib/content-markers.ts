/**
 * prospec content-block markers — the single source (PB-006) for the HTML-comment
 * delimiters that split a generated (`auto`) block from a preserved (`user`) block.
 * Every reader and writer of these blocks imports from here, so a marker string can
 * never silently drift between modules (TypeScript would not catch a literal typo).
 */
export const AUTO_START = '<!-- prospec:auto-start -->';
export const AUTO_END = '<!-- prospec:auto-end -->';
export const USER_START = '<!-- prospec:user-start -->';
export const USER_END = '<!-- prospec:user-end -->';
