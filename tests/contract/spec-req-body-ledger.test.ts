import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A body-less REQ — a `#### REQ-…` heading followed immediately by the next
 * heading, a `---` rule, or EOF — is a requirement whose behavior statement is
 * GONE from the trust zone. They exist because the mechanical archive spec-sync
 * used to rewrite a MODIFIED REQ from its delta-spec title alone
 * (REQ-SERVICES-072 fixed the mechanism; this ledger freezes the residue).
 *
 * The assertion is SET EQUALITY against the list below, so it fails in both
 * directions: a newly introduced hole fails, and repairing a listed one fails
 * until it is removed from the list. The list can therefore only shrink, and
 * never silently — each removal is a reviewed diff.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FEATURES_DIR = path.join(REPO_ROOT, 'prospec/specs/features');

/**
 * Pre-existing body-less REQs (11), as `{spec-path}:{REQ-ID}` relative to
 * FEATURES_DIR. The path is the file that actually holds the heading — after the
 * per-story slice split these REQs live in `{feature}/{slice}.md`, not the main
 * spec. Repair → delete the entry.
 */
const LEGACY_BODYLESS = [
  'ai-knowledge/us-351.md:REQ-SERVICES-029',
  'ai-knowledge/us-351.md:REQ-TEMPLATES-113',
  'ai-knowledge/us-351.md:REQ-TEMPLATES-114',
  'ai-knowledge/us-351.md:REQ-TESTS-032',
  'ai-knowledge/us-351.md:REQ-TYPES-031',
  'drift-detection/us-1.md:REQ-LIB-018',
  'drift-detection/us-1.md:REQ-LIB-019',
  'drift-detection/us-1.md:REQ-TESTS-031',
  'sdd-workflow/us-21.md:REQ-TESTS-033',
  'sdd-workflow/us-6.md:REQ-SERVICES-010',
  'sdd-workflow/us-6.md:REQ-TEMPLATES-010',
];

/** Every `.md` under FEATURES_DIR — main files AND `{feature}/` slices — repo-relative. */
function specFiles(): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(path.join(FEATURES_DIR, rel), { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(childRel);
      else if (entry.name.endsWith('.md')) out.push(childRel);
    }
  };
  walk('');
  return out;
}

/** Every `#### REQ-…` heading with no body, as `{spec-path}:{REQ-ID}`. */
function findBodylessReqs(): string[] {
  const found: string[] = [];
  for (const file of specFiles()) {
    const lines = readFileSync(path.join(FEATURES_DIR, file), 'utf-8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const header = lines[i]!.match(/^#### ~{0,2}(REQ-[\w-]+):/);
      if (!header) continue;
      let next = i + 1;
      while (next < lines.length && lines[next]!.trim() === '') next++;
      const following = lines[next] ?? '';
      const bodyless = next >= lines.length || /^#{2,4}\s/.test(following) || following.trim() === '---';
      if (bodyless) found.push(`${file}:${header[1]}`);
    }
  }
  return found.sort();
}

describe('Feature Spec REQ bodies', () => {
  it('has no body-less REQ beyond the frozen legacy ledger', () => {
    const actual = findBodylessReqs();
    const expectedSet = new Set(LEGACY_BODYLESS);
    const actualSet = new Set(actual);

    const introduced = actual.filter((r) => !expectedSet.has(r));
    const repaired = LEGACY_BODYLESS.filter((r) => !actualSet.has(r));

    expect(
      introduced,
      'a REQ lost its behavior statement — the spec-sync must land a `**Spec:**` block or preserve the existing body (REQ-SERVICES-072)',
    ).toEqual([]);
    expect(
      repaired,
      'these legacy REQs now have bodies — delete them from LEGACY_BODYLESS so the ledger keeps shrinking',
    ).toEqual([]);
  });

  it('the ledger itself is well-formed (sorted, deduped, existing files)', () => {
    expect([...LEGACY_BODYLESS].sort()).toEqual(LEGACY_BODYLESS);
    expect(new Set(LEGACY_BODYLESS).size).toBe(LEGACY_BODYLESS.length);
    for (const entry of LEGACY_BODYLESS) {
      expect(
        existsSync(path.join(FEATURES_DIR, entry.split(':')[0]!)),
        `${entry} names an existing feature spec file`,
      ).toBe(true);
    }
  });

  // The detector must actually detect — a scan that finds nothing would make the
  // ledger vacuously green forever.
  it('the detector recognises the documented holes', () => {
    expect(findBodylessReqs().length).toBe(LEGACY_BODYLESS.length);
  });
});
