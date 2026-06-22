import { describe, it, expect } from 'vitest';
import {
  parseSections,
  extractUserSections,
  mergeContent,
  mergeManagedDoc,
} from '../../../src/lib/content-merger.js';

describe('parseSections', () => {
  it('should parse a document with auto and user sections', () => {
    const content = `Header
<!-- prospec:auto-start -->
Generated content
<!-- prospec:auto-end -->
Middle
<!-- prospec:user-start -->
User notes
<!-- prospec:user-end -->
Footer`;

    const sections = parseSections(content);
    expect(sections).toHaveLength(5);
    expect(sections[0]?.type).toBe('static');
    expect(sections[1]?.type).toBe('auto');
    expect(sections[2]?.type).toBe('static');
    expect(sections[3]?.type).toBe('user');
    expect(sections[4]?.type).toBe('static');
  });

  it('should handle content without markers', () => {
    const content = 'Just plain text\nwith multiple lines';
    const sections = parseSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.type).toBe('static');
  });

  it('should handle empty content', () => {
    const sections = parseSections('');
    expect(sections).toHaveLength(1);
    expect(sections[0]?.type).toBe('static');
    expect(sections[0]?.content).toBe('');
  });

  it('should include marker lines in their sections', () => {
    const content = `<!-- prospec:auto-start -->
Generated
<!-- prospec:auto-end -->`;
    const sections = parseSections(content);
    const autoSection = sections.find((s) => s.type === 'auto');
    expect(autoSection?.content).toContain('<!-- prospec:auto-start -->');
    expect(autoSection?.content).toContain('<!-- prospec:auto-end -->');
  });

  it('should handle multiple auto sections', () => {
    const content = `<!-- prospec:auto-start -->
First auto
<!-- prospec:auto-end -->
gap
<!-- prospec:auto-start -->
Second auto
<!-- prospec:auto-end -->`;
    const sections = parseSections(content);
    const autoSections = sections.filter((s) => s.type === 'auto');
    expect(autoSections).toHaveLength(2);
  });
});

describe('extractUserSections', () => {
  it('should extract user sections', () => {
    const content = `Header
<!-- prospec:user-start -->
My custom notes
<!-- prospec:user-end -->
Footer`;
    const userSections = extractUserSections(content);
    expect(userSections).toHaveLength(1);
    expect(userSections[0]).toContain('My custom notes');
  });

  it('should return empty array when no user sections exist', () => {
    const content = `Just static content`;
    const userSections = extractUserSections(content);
    expect(userSections).toHaveLength(0);
  });

  it('should extract multiple user sections', () => {
    const content = `<!-- prospec:user-start -->
First user block
<!-- prospec:user-end -->
gap
<!-- prospec:user-start -->
Second user block
<!-- prospec:user-end -->`;
    const userSections = extractUserSections(content);
    expect(userSections).toHaveLength(2);
    expect(userSections[0]).toContain('First user block');
    expect(userSections[1]).toContain('Second user block');
  });
});

describe('mergeContent', () => {
  it('should preserve user sections from existing content', () => {
    const existing = `Header
<!-- prospec:auto-start -->
Old generated
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
My important notes
<!-- prospec:user-end -->`;

    const newContent = `Header
<!-- prospec:auto-start -->
New generated
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
Default user content
<!-- prospec:user-end -->`;

    const merged = mergeContent(newContent, existing);
    expect(merged).toContain('New generated');
    expect(merged).toContain('My important notes');
    expect(merged).not.toContain('Old generated');
    expect(merged).not.toContain('Default user content');
  });

  it('should return new content when existing is empty', () => {
    const newContent = 'Fresh content';
    const merged = mergeContent(newContent, '');
    expect(merged).toBe('Fresh content');
  });

  it('should return new content when existing has no user sections', () => {
    const existing = `Old static content`;
    const newContent = `New static content`;
    const merged = mergeContent(newContent, existing);
    expect(merged).toBe('New static content');
  });

  it('should handle multiple user sections in order', () => {
    const existing = `<!-- prospec:user-start -->
First notes
<!-- prospec:user-end -->
gap
<!-- prospec:user-start -->
Second notes
<!-- prospec:user-end -->`;

    const newContent = `<!-- prospec:user-start -->
Default 1
<!-- prospec:user-end -->
gap
<!-- prospec:user-start -->
Default 2
<!-- prospec:user-end -->`;

    const merged = mergeContent(newContent, existing);
    expect(merged).toContain('First notes');
    expect(merged).toContain('Second notes');
    // pin ORDER (the test's stated contract) — a reversed fill would keep both substrings
    expect(merged.indexOf('First notes')).toBeLessThan(merged.indexOf('Second notes'));
    expect(merged).not.toContain('Default 1');
    expect(merged).not.toContain('Default 2');
  });

  it('should use new content auto sections', () => {
    const existing = `<!-- prospec:auto-start -->
Old auto
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
Keep me
<!-- prospec:user-end -->`;

    const newContent = `<!-- prospec:auto-start -->
Updated auto
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
Replace me
<!-- prospec:user-end -->`;

    const merged = mergeContent(newContent, existing);
    expect(merged).toContain('Updated auto');
    expect(merged).toContain('Keep me');
    // prove old auto was REPLACED (not appended) and the new default user block dropped
    expect(merged).not.toContain('Old auto');
    expect(merged).not.toContain('Replace me');
  });

  it('merges to an EXACT document — section order and structure are pinned (happy path)', () => {
    const existing = `Header
<!-- prospec:auto-start -->
Old generated
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
My important notes
<!-- prospec:user-end -->`;

    const newContent = `Header
<!-- prospec:auto-start -->
New generated
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
Default user content
<!-- prospec:user-end -->`;

    // The full output is asserted (not just substrings): a mutation that
    // reordered sections, changed the join separator, or dropped the static
    // header would keep every toContain green but fail this toBe.
    const expected = `Header
<!-- prospec:auto-start -->
New generated
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
My important notes
<!-- prospec:user-end -->`;

    expect(mergeContent(newContent, existing)).toBe(expected);
  });

  it('appends surplus user sections at the END, newline-joined (exact output)', () => {
    const existing = `<!-- prospec:user-start -->
First notes
<!-- prospec:user-end -->
gap
<!-- prospec:user-start -->
Second hand-added notes
<!-- prospec:user-end -->`;

    const newContent = `<!-- prospec:user-start -->
Default 1
<!-- prospec:user-end -->`;

    // Slot 0 takes the first existing user block; the surplus second block is
    // appended after it (no surrounding static 'gap'), joined by a single '\n'.
    const expected = `<!-- prospec:user-start -->
First notes
<!-- prospec:user-end -->
<!-- prospec:user-start -->
Second hand-added notes
<!-- prospec:user-end -->`;

    expect(mergeContent(newContent, existing)).toBe(expected);
  });

  it('preserves surplus user sections when the existing file has more than the new content', () => {
    // User added a SECOND user block to a generated file; the regenerated
    // template still emits only one. The surplus must not be dropped.
    const existing = `<!-- prospec:user-start -->
First notes
<!-- prospec:user-end -->
gap
<!-- prospec:user-start -->
Second hand-added notes
<!-- prospec:user-end -->`;

    const newContent = `<!-- prospec:user-start -->
Default 1
<!-- prospec:user-end -->`;

    const merged = mergeContent(newContent, existing);
    expect(merged).toContain('First notes');
    expect(merged).toContain('Second hand-added notes');
    expect(merged).not.toContain('Default 1');
  });
});

describe('mergeManagedDoc', () => {
  // A freshly rendered template: prospec content in the auto block, an empty
  // user block after it, trailing newline (mirrors entry.md.hbs output).
  const GENERATED = `<!-- prospec:auto-start -->
# my-project
generated body
<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- placeholder -->
<!-- prospec:user-end -->
`;

  it('returns generated unchanged when existing is empty', () => {
    expect(mergeManagedDoc(GENERATED, '')).toBe(GENERATED);
  });

  it('returns generated unchanged when existing is whitespace-only', () => {
    expect(mergeManagedDoc(GENERATED, '   \n\t\n')).toBe(GENERATED);
  });

  it('managed existing: replaces ONLY the auto block, preserves the user block (exact)', () => {
    const existing = `<!-- prospec:auto-start -->
OLD generated body
<!-- prospec:auto-end -->

<!-- prospec:user-start -->
my important notes
<!-- prospec:user-end -->
`;
    const expected = `<!-- prospec:auto-start -->
# my-project
generated body
<!-- prospec:auto-end -->

<!-- prospec:user-start -->
my important notes
<!-- prospec:user-end -->
`;
    expect(mergeManagedDoc(GENERATED, existing)).toBe(expected);
  });

  it('unmanaged existing: migrates the hand-written content into the user block (exact)', () => {
    const existing = `# CURATED hand-written
some notes
`;
    const expected = `<!-- prospec:auto-start -->
# my-project
generated body
<!-- prospec:auto-end -->

<!-- prospec:user-start -->
# CURATED hand-written
some notes
<!-- prospec:user-end -->
`;
    expect(mergeManagedDoc(GENERATED, existing)).toBe(expected);
  });

  it('unmanaged existing: nothing from the hand-written file is dropped', () => {
    const existing = '# Title\nrule one\nrule two\n';
    const merged = mergeManagedDoc(GENERATED, existing);
    expect(merged).toContain('rule one');
    expect(merged).toContain('rule two');
    expect(merged).toContain('# my-project'); // auto block still present
  });

  it('does not mistake marker-like strings inside the user block for the auto block', () => {
    // The user block literally mentions the auto markers; the non-greedy auto
    // match must stop at the real auto-end, leaving the user block intact.
    const existing = `<!-- prospec:auto-start -->
OLD body
<!-- prospec:auto-end -->

<!-- prospec:user-start -->
docs mention <!-- prospec:auto-end --> and <!-- prospec:auto-start --> verbatim
<!-- prospec:user-end -->
`;
    const merged = mergeManagedDoc(GENERATED, existing);
    expect(merged).toContain('docs mention <!-- prospec:auto-end --> and <!-- prospec:auto-start --> verbatim');
    expect(merged).toContain('generated body'); // new auto applied
    expect(merged).not.toContain('OLD body');   // old auto replaced
  });

  it('inserts `$`-sequences from the generated auto body verbatim (no pattern expansion)', () => {
    const genDollar = `<!-- prospec:auto-start -->
price is $5, regex $& and $\` and $$ stay literal
<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- placeholder -->
<!-- prospec:user-end -->
`;
    const existing = `<!-- prospec:auto-start -->
OLD
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
keep
<!-- prospec:user-end -->
`;
    const merged = mergeManagedDoc(genDollar, existing);
    expect(merged).toContain('price is $5, regex $& and $` and $$ stay literal');
    expect(merged).toContain('keep');
  });

  it('inserts `$`-sequences from migrated unmanaged content verbatim', () => {
    const existing = 'cost $5, sigil $& and $$ here\n';
    const merged = mergeManagedDoc(GENERATED, existing);
    expect(merged).toContain('cost $5, sigil $& and $$ here');
  });

  it('is idempotent — re-merging its own output is byte-identical (managed round-trip)', () => {
    const run1 = mergeManagedDoc(GENERATED, 'brownfield content\n');
    const run2 = mergeManagedDoc(GENERATED, run1);
    expect(run2).toBe(run1);
  });

  it('is idempotent on a freshly generated doc', () => {
    expect(mergeManagedDoc(GENERATED, GENERATED)).toBe(GENERATED);
  });

  it('defensive: generated without a user block still preserves migrated content', () => {
    const noUserBlock = `<!-- prospec:auto-start -->
auto only
<!-- prospec:auto-end -->
`;
    const merged = mergeManagedDoc(noUserBlock, '# hand-written\n');
    expect(merged).toContain('auto only');
    expect(merged).toContain('<!-- prospec:user-start -->');
    expect(merged).toContain('# hand-written');
    expect(merged).toContain('<!-- prospec:user-end -->');
  });
});
