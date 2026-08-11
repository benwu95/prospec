import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  classifyBlockTerminator,
  extractDeltaBlock,
  whenThenBullets,
} from '../../src/services/archive.service.js';

/**
 * Real-corpus regression for the spec-sync guards.
 *
 * The truncation refusal and the widened bullet matcher were both measured to be
 * ZERO-incidence in this repository before they were written: every archived
 * delta-spec terminates its `**Spec:**` block at one of the template's own fields,
 * and every feature-spec bullet is `- WHEN`-shaped. That is exactly why the guards
 * could not be validated by running a real archive — this project's own authoring
 * conventions never trip them, which is why the defect surfaced downstream instead.
 *
 * So these tests assert the other half of the contract: the new rules must not
 * change the verdict on any text this repository actually contains. A finding here
 * is not "the corpus is wrong", it is "the rule is over-eager and will refuse or
 * report something legitimate".
 */

const REPO = path.resolve(import.meta.dirname, '../..');

/** Split a delta-spec into per-REQ entry bodies, the way the route reader does. */
function entriesOf(content: string): string[][] {
  const entries: string[][] = [];
  let current: string[] | null = null;
  for (const line of content.split('\n')) {
    if (/^###\s+REQ-[\w-]+:/.test(line)) {
      if (current) entries.push(current);
      current = [];
      continue;
    }
    if (current) current.push(line);
  }
  if (current) entries.push(current);
  return entries;
}

function archivedDeltaSpecs(): Array<{ name: string; content: string }> {
  const archiveDir = path.join(REPO, 'tests/fixtures/spec-sync-corpus');
  if (!existsSync(archiveDir)) return [];
  const out: Array<{ name: string; content: string }> = [];
  for (const dir of readdirSync(archiveDir)) {
    const file = path.join(archiveDir, dir, 'delta-spec.md');
    if (existsSync(file)) out.push({ name: dir, content: readFileSync(file, 'utf-8') });
  }
  return out;
}

function featureSpecs(): Array<{ name: string; content: string }> {
  const dir = path.join(REPO, 'prospec/specs/features');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ name: f, content: readFileSync(path.join(dir, f), 'utf-8') }));
}

describe('archived delta-spec corpus — the refusal must not fire on real history', () => {
  const corpus = archivedDeltaSpecs();

  // `.prospec/archive/` is gitignored, so reading the corpus from there left CI
  // with zero files and a vacuous pass. The corpus is committed under
  // `tests/fixtures/` instead, and its absence is now a failure, not a skip.
  it('has a corpus to check, and does not skip', () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  it(
    'refuses NO `**Spec:**` block in any archived delta-spec',
    () => {
      const refused: string[] = [];
      for (const { name, content } of corpus) {
        for (const body of entriesOf(content)) {
          const t = extractDeltaBlock(body, 'Spec').truncation;
          if (t !== null) refused.push(`${name}: **${t.label}:** swallowing ${t.swallowedCount} line(s)`);
        }
      }
      expect(refused).toEqual([]);
    },
  );

  it(
    'sees only template fields terminating a `**Spec:**` block',
    () => {
      const foreign = new Set<string>();
      for (const { content } of corpus) {
        for (const body of entriesOf(content)) {
          const start = body.findIndex((l) => /^\*\*Spec:\*\*/.test(l.trim()));
          if (start === -1) continue;
          for (let i = start + 1; i < body.length; i++) {
            const k = classifyBlockTerminator(body[i]!);
            if (k.kind === 'none') continue;
            if (k.kind === 'foreign-label') foreign.add(k.label);
            break;
          }
        }
      }
      expect([...foreign]).toEqual([]);
    },
  );

  it('covers a corpus large enough to mean something', () => {
    const blocks = corpus.reduce(
      (n, { content }) => n + (content.match(/^\*\*Spec:\*\*/gm) ?? []).length,
      0,
    );
    expect(corpus.length).toBeGreaterThanOrEqual(50);
    expect(blocks).toBeGreaterThanOrEqual(100);
  });
});

describe('feature-spec corpus — the widened bullet matcher must not invent findings', () => {
  const specs = featureSpecs();

  /** The matcher exactly as it was before the widening — the regression baseline. */
  const HYPHEN_WHEN_ONLY = /^-\s+WHEN\b/i;
  const oldMatcherBullets = (body: string): string[] =>
    body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => HYPHEN_WHEN_ONLY.test(l));

  it('has feature specs to check', () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it('finds exactly the bullets the previous matcher found, file by file', () => {
    const diffs: string[] = [];
    for (const { name, content } of specs) {
      const widened = whenThenBullets(content).map((b) => b.text.trim());
      const original = oldMatcherBullets(content);
      const extra = widened.filter((b) => !original.includes(b));
      const missing = original.filter((b) => !widened.includes(b));
      if (extra.length > 0) diffs.push(`${name}: +${extra.length} (${extra[0]})`);
      if (missing.length > 0) diffs.push(`${name}: -${missing.length} (${missing[0]})`);
    }
    expect(diffs).toEqual([]);
  });

  // Guards the guard: if the corpus ever stops containing bullets, the assertion
  // above becomes vacuous and would stay green through any regression.
  it('covers a corpus large enough to mean something', () => {
    const total = specs.reduce((n, { content }) => n + whenThenBullets(content).length, 0);
    expect(total).toBeGreaterThanOrEqual(1000);
  });
});

/**
 * The two format references must agree about the landing-block boundary
 * (REQ-TEMPLATES-166 / REQ-SPEC-010).
 *
 * They did not, and the disagreement is the whole incident: `feature-spec-format`
 * scaffolds a REQ body as a sentence plus `**Scenarios:**` and its bullets, while
 * `delta-spec-format` says the landing block ends at a label — so an author
 * following one reference produced a block the other silently truncated. Neither
 * document was wrong on its own, which is why nobody caught it by reading either.
 *
 * These assertions are section-scoped and paired with negative ones: a test that
 * merely greps for a keyword would stay green if the rule were reworded into
 * meaninglessness.
 */
describe('format references agree on the `**Spec:**` block boundary', () => {
  const hbs = (name: string): string =>
    readFileSync(path.join(REPO, 'src/templates/skills/references', name), 'utf-8');

  /** Slice from a heading to the next heading of the same-or-higher level. */
  const section = (content: string, heading: string): string => {
    const lines = content.split('\n');
    const start = lines.findIndex((l) => l.trim() === heading);
    expect(start, `heading not found: ${heading}`).toBeGreaterThan(-1);
    const level = heading.match(/^#+/)![0].length;
    let end = lines.length;
    // Fence-aware: these references embed fenced MARKDOWN examples, so a `## ` line
    // inside a code block is sample content, not the next section. Slicing on it
    // silently truncated the scope and would have hidden the very rule under test.
    let fenced = false;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s*```/.test(lines[i]!)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      const m = /^(#{1,6})\s/.exec(lines[i]!);
      if (m && m[1]!.length <= level) {
        end = i;
        break;
      }
    }
    const slice = lines.slice(start, end).join('\n');
    expect(slice.trim().length, `empty section: ${heading}`).toBeGreaterThan(heading.length);
    return slice;
  };

  const deltaBoundary = (): string =>
    section(hbs('delta-spec-format.hbs'), '## The `**Spec:**` Block — What Lands in the Feature Spec');

  it('delta-spec-format enumerates the template fields that DO terminate the block', () => {
    const s = deltaBoundary();
    for (const field of ['Feature', 'Story', 'Before', 'After', 'Reason', 'Spec', 'Dropped', 'Priority']) {
      expect(s, field).toContain(`\`**${field}:**\``);
    }
  });

  it('delta-spec-format states that any OTHER label is refused, not silently dropped', () => {
    const s = deltaBoundary();
    expect(s).toMatch(/refuses that REQ|refuses the REQ/i);
    expect(s).toMatch(/byte-identical|left unchanged/i);
    // The superseded framing must be gone: "silently" was the old contract, and a
    // reference still promising it would send authors back into the defect.
    expect(s).not.toMatch(/NOT landed, silently/);
  });

  it('delta-spec-format documents the `**Dropped:**` declaration and its set semantics', () => {
    const s = deltaBoundary();
    expect(s).toContain('**Dropped:**');
    expect(s).toMatch(/stale declaration/i);
    expect(s).toMatch(/does NOT release a refusal/i);
  });

  // Section-scoped like the delta-spec half — the describe's docstring claims both
  // are, and a whole-file grep would stay green the moment the same wording turns
  // up in a summary or changelog block (PB-001 criterion 1).
  const featureScaffold = (): string =>
    section(hbs('feature-spec-format.hbs'), '### 3. User Stories & Behavior Specifications');

  it('feature-spec-format forbids the scenarios label inside a landing block', () => {
    const s = featureScaffold();
    expect(s).toMatch(/Never put this label inside a delta-spec/i);
    expect(s).toMatch(/refuses the REQ/i);
  });

  it('feature-spec-format points at the reference that states the same rule', () => {
    expect(featureScaffold()).toContain('references/delta-spec-format.md');
  });

  // The agreement itself, asserted as a property rather than as two independent
  // greps: both documents must say the block is REFUSED, and neither may still
  // describe the boundary as a silent cut.
  it('neither reference describes the boundary as a silent truncation', () => {
    for (const [name, slice] of [
      ['delta-spec-format.hbs', deltaBoundary()],
      ['feature-spec-format.hbs', featureScaffold()],
    ] as const) {
      expect(slice, name).toMatch(/refuses the REQ|refuses that REQ/i);
    }
    // The superseded promise, asserted only where it actually lived — a negative
    // over a file that never carried the phrase is vacuous.
    expect(featureScaffold()).not.toMatch(/the label cannot be carried\s+through\)/);
    expect(deltaBoundary()).not.toContain('is NOT landed, silently');
  });
});
