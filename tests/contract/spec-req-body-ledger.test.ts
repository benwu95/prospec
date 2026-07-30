import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
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

/** Pre-existing body-less REQs (12), as `{spec-file}:{REQ-ID}`. Repair → delete the entry. */
const LEGACY_BODYLESS = [
  'ai-knowledge.md:REQ-SERVICES-029',
  'ai-knowledge.md:REQ-TEMPLATES-113',
  'ai-knowledge.md:REQ-TEMPLATES-114',
  'ai-knowledge.md:REQ-TESTS-032',
  'ai-knowledge.md:REQ-TYPES-031',
  'drift-detection.md:REQ-LIB-018',
  'drift-detection.md:REQ-LIB-019',
  'drift-detection.md:REQ-TESTS-031',
  'drift-detection.md:REQ-TYPES-027',
  'sdd-workflow.md:REQ-SERVICES-010',
  'sdd-workflow.md:REQ-TEMPLATES-010',
  'sdd-workflow.md:REQ-TESTS-033',
];

/** Every `#### REQ-…` heading with no body, as `{file}:{REQ-ID}`. */
function findBodylessReqs(): string[] {
  const found: string[] = [];
  for (const file of readdirSync(FEATURES_DIR).filter((f) => f.endsWith('.md'))) {
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
    const specs = new Set(readdirSync(FEATURES_DIR));
    for (const entry of LEGACY_BODYLESS) {
      expect(specs.has(entry.split(':')[0]!), `${entry} names an existing feature spec`).toBe(true);
    }
  });

  // The detector must actually detect — a scan that finds nothing would make the
  // ledger vacuously green forever.
  it('the detector recognises the documented holes', () => {
    expect(findBodylessReqs().length).toBe(LEGACY_BODYLESS.length);
  });
});
