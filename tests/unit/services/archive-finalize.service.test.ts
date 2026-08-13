import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  executeFinalize,
  recountFeatureSpecCounters,
} from '../../../src/services/archive.service.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import { parseSpecSlices } from '../../../src/lib/spec-headings.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('../../../src/lib/config.js', () => ({
  readConfig: vi.fn().mockResolvedValue({ project: { name: 'demo' } }),
  resolveBasePaths: vi.fn().mockReturnValue({
    baseDir: '/repo/prospec',
    knowledgePath: '/repo/prospec/ai-knowledge',
    constitutionPath: '/repo/prospec/CONSTITUTION.md',
    specsPath: '/repo/prospec/specs',
  }),
}));

beforeEach(() => {
  vol.reset();
});

const CWD = '/repo';
const ARCHIVE_DIR = '/repo/.prospec/archive/2026-07-30-add-widget';
const HISTORY = '/repo/prospec/specs/_archived-history/2026-07-30-add-widget.md';
const SPEC = '/repo/prospec/specs/features/widget.md';

const FINAL_SUMMARY = `# add-widget

變更摘要（繁中 prose）。

## Review & Verify

- grade: S · criticals 0/0 · majors 0
`;

const SPEC_CONTENT = `---
feature: widget
status: active
last_updated: 2026-07-30
story_count: 1
req_count: 2
---

# Widget

## User Stories & Behavior Specifications

## US-1: an h2 story (sdd-workflow style)

#### REQ-WIDGET-001: one

#### REQ-WIDGET-002: two

### US-2: an h3 story (mcp-server style)

#### REQ-WIDGET-003: three

### US-3: graduated story

#### REQ-WIDGET-005: five

## Deprecated Requirements

#### REQ-WIDGET-004: retired

## Change History
`;

function seed(summary: string = FINAL_SUMMARY): void {
  vol.fromJSON({
    [`${ARCHIVE_DIR}/summary.md`]: summary,
    [SPEC]: SPEC_CONTENT,
  });
}

describe('archive finalize', () => {
  it('copies the finalized summary to spec history and reconciles counters from the FINAL body', async () => {
    seed();
    const result = await executeFinalize({ name: 'add-widget', cwd: CWD });
    expect(vol.readFileSync(HISTORY, 'utf-8')).toBe(FINAL_SUMMARY);
    expect(result.reconciled).toEqual([
      {
        file: 'prospec/specs/features/widget.md',
        from: { story_count: 1, req_count: 2 },
        to: { story_count: 3, req_count: 4 },
      },
    ]);
    const spec = vol.readFileSync(SPEC, 'utf-8') as string;
    expect(spec).toContain('story_count: 3');
    expect(spec).toContain('req_count: 4');
  });

  it('refuses while summary.md still lacks the Review & Verify section (scaffold not overwritten)', async () => {
    seed('# add-widget\n\nscaffold only\n');
    await expect(executeFinalize({ name: 'add-widget', cwd: CWD })).rejects.toThrow(
      /still looks like the scaffold/,
    );
    expect(vol.existsSync(HISTORY)).toBe(false);
    expect(vol.readFileSync(SPEC, 'utf-8')).toBe(SPEC_CONTENT);
  });

  it('refuses when no archived bundle exists, pointing at prospec archive', async () => {
    vol.fromJSON({ [SPEC]: SPEC_CONTENT });
    await expect(executeFinalize({ name: 'add-widget', cwd: CWD })).rejects.toThrow(
      PrerequisiteError,
    );
  });

  it('dry-run reports the planned mutations without writing', async () => {
    seed();
    const result = await executeFinalize({ name: 'add-widget', cwd: CWD, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.planned).toHaveLength(2);
    expect(result.planned[0]!.action).toBe('write');
    expect(vol.existsSync(HISTORY)).toBe(false);
    expect(vol.readFileSync(SPEC, 'utf-8')).toBe(SPEC_CONTENT);
  });

  it('picks the latest bundle when the change was archived more than once', async () => {
    seed();
    vol.fromJSON({
      '/repo/.prospec/archive/2026-06-01-add-widget/summary.md': '# old\n\n## Review & Verify\nold\n',
    });
    const result = await executeFinalize({ name: 'add-widget', cwd: CWD });
    expect(result.archiveDir).toBe('.prospec/archive/2026-07-30-add-widget');
  });

  it('is idempotent — rerunning changes nothing further', async () => {
    seed();
    await executeFinalize({ name: 'add-widget', cwd: CWD });
    const afterFirstSpec = vol.readFileSync(SPEC, 'utf-8');
    const second = await executeFinalize({ name: 'add-widget', cwd: CWD });
    expect(second.reconciled).toEqual([]);
    expect(vol.readFileSync(SPEC, 'utf-8')).toBe(afterFirstSpec);
    expect(vol.readFileSync(HISTORY, 'utf-8')).toBe(FINAL_SUMMARY);
  });
});

/**
 * A downstream 1.0.0 project's spec used `### REQ-…{#anchor}` (h3), which the
 * h4-only counter read as zero REQs — `req_count: 10 → 0` into the trust zone,
 * in a file the change never touched (issue #138).
 */
const H3_SPEC = `---
feature: quiz
status: active
last_updated: 2026-08-01
story_count: 1
req_count: 2
---

# Quiz

## User Stories & Behavior Specifications

### US-1: tagging

### REQ-QUIZ-001: Tag a question {#req-quiz-001}

- WHEN a question is submitted, THEN it is tagged

### REQ-QUIZ-002: Review a tag {#req-quiz-002}

- WHEN a reviewer opens a tag, THEN the standard is shown

## Deprecated Requirements

_(None)_
`;

/** REQ ids live only in a table — the body genuinely has no REQ heading. */
const HEADINGLESS_SPEC = `---
feature: widget
status: active
last_updated: 2026-08-01
story_count: 1
req_count: 3
---

# Widget

### US-1: story

| REQ | Note |
|-----|------|
| REQ-WIDGET-001 | tabular only |
`;

const H3_SPEC_PATH = '/repo/prospec/specs/features/quiz.md';

describe('archive finalize — heading levels and the zeroing refusal', () => {
  it('counts REQ headings at any level, so an h3 spec is reconciled instead of zeroed', async () => {
    vol.fromJSON({ [`${ARCHIVE_DIR}/summary.md`]: FINAL_SUMMARY, [H3_SPEC_PATH]: H3_SPEC });

    const result = await executeFinalize({ name: 'add-widget', cwd: CWD });

    expect(result.reconciled).toEqual([]);
    expect(result.refusedReconciliations).toEqual([]);
    expect(vol.readFileSync(H3_SPEC_PATH, 'utf-8')).toBe(H3_SPEC);
  });

  it('refuses to zero a declared counter, leaving the file byte-identical', async () => {
    vol.fromJSON({
      [`${ARCHIVE_DIR}/summary.md`]: FINAL_SUMMARY,
      [H3_SPEC_PATH]: HEADINGLESS_SPEC,
    });

    const result = await executeFinalize({ name: 'add-widget', cwd: CWD });

    expect(result.reconciled).toEqual([]);
    expect(result.refusedReconciliations).toEqual([
      {
        file: 'prospec/specs/features/quiz.md',
        from: { story_count: 1, req_count: 3 },
        to: { story_count: 1, req_count: 0 },
        reason: expect.stringMatching(/zero/i),
      },
    ]);
    expect(vol.readFileSync(H3_SPEC_PATH, 'utf-8')).toBe(HEADINGLESS_SPEC);
  });

  // The story_count half needs a fixture where ONLY story_count zeroes: with both
  // counters at zero, dropping story_count from the rule entirely still leaves
  // req_count triggering the same refusal, and the test cannot tell the
  // difference (it stayed green under exactly that mutation).
  it('refuses on a zeroed story_count alone, naming that field', async () => {
    const reqsButNoStory = `---
feature: quiz
status: active
last_updated: 2026-08-01
story_count: 2
req_count: 2
---

# Quiz

- US-1 listed as a bullet, not a heading
- US-2 likewise

#### REQ-QUIZ-001: one

#### REQ-QUIZ-002: two
`;
    vol.fromJSON({ [`${ARCHIVE_DIR}/summary.md`]: FINAL_SUMMARY, [H3_SPEC_PATH]: reqsButNoStory });

    const result = await executeFinalize({ name: 'add-widget', cwd: CWD });

    expect(result.refusedReconciliations).toHaveLength(1);
    const refusal = result.refusedReconciliations[0]!;
    expect(refusal.to).toEqual({ story_count: 0, req_count: 2 });
    expect(refusal.reason).toContain('story_count');
    expect(refusal.reason).not.toContain('req_count');
    expect(vol.readFileSync(H3_SPEC_PATH, 'utf-8')).toBe(reqsButNoStory);
  });

  it('names both fields when both would be zeroed', async () => {
    vol.fromJSON({
      [`${ARCHIVE_DIR}/summary.md`]: FINAL_SUMMARY,
      [H3_SPEC_PATH]: HEADINGLESS_SPEC.replace('### US-1: story', '- US-1 listed as a bullet'),
    });

    const result = await executeFinalize({ name: 'add-widget', cwd: CWD });

    expect(result.refusedReconciliations).toHaveLength(1);
    expect(result.refusedReconciliations[0]!.to).toEqual({ story_count: 0, req_count: 0 });
    expect(result.refusedReconciliations[0]!.reason).toContain('story_count');
    expect(result.refusedReconciliations[0]!.reason).toContain('req_count');
  });

  it('treats a genuinely empty spec as normal — zero declared, zero counted', async () => {
    const emptySpec = HEADINGLESS_SPEC.replace('story_count: 1', 'story_count: 0')
      .replace('req_count: 3', 'req_count: 0')
      .replace('### US-1: story', '');
    vol.fromJSON({ [`${ARCHIVE_DIR}/summary.md`]: FINAL_SUMMARY, [H3_SPEC_PATH]: emptySpec });

    const result = await executeFinalize({ name: 'add-widget', cwd: CWD });

    expect(result.refusedReconciliations).toEqual([]);
    expect(result.reconciled).toEqual([]);
  });

  it('still corrects a non-zeroing mismatch (the pre-existing behavior)', async () => {
    vol.fromJSON({
      [`${ARCHIVE_DIR}/summary.md`]: FINAL_SUMMARY,
      [H3_SPEC_PATH]: H3_SPEC.replace('req_count: 2', 'req_count: 7'),
    });

    const result = await executeFinalize({ name: 'add-widget', cwd: CWD });

    expect(result.refusedReconciliations).toEqual([]);
    expect(result.reconciled).toHaveLength(1);
    expect(vol.readFileSync(H3_SPEC_PATH, 'utf-8')).toContain('req_count: 2');
  });

  it('dry-run reports a refusal and plans no mutation for that file', async () => {
    vol.fromJSON({
      [`${ARCHIVE_DIR}/summary.md`]: FINAL_SUMMARY,
      [H3_SPEC_PATH]: HEADINGLESS_SPEC,
    });

    const result = await executeFinalize({ name: 'add-widget', cwd: CWD, dryRun: true });

    expect(result.refusedReconciliations).toHaveLength(1);
    expect(result.planned.map((p) => p.target)).not.toContain('prospec/specs/features/quiz.md');
    expect(vol.readFileSync(H3_SPEC_PATH, 'utf-8')).toBe(HEADINGLESS_SPEC);
  });
});

describe('recountFeatureSpecCounters', () => {
  it('counts REQ headings at h3 as well as h4 (issue #138 regression)', () => {
    const recount = recountFeatureSpecCounters(H3_SPEC)!;
    expect(recount.to).toEqual({ story_count: 1, req_count: 2 });
    expect(recount.changed).toBe(false);
    expect(recount.refusal).toBeUndefined();
  });

  it('flags a refusal instead of rewriting when a declared counter would go to zero', () => {
    const recount = recountFeatureSpecCounters(HEADINGLESS_SPEC)!;
    expect(recount.to.req_count).toBe(0);
    expect(recount.refusal).toMatch(/zero/i);
    expect(recount.content).toBe(HEADINGLESS_SPEC);
  });

  // Tolerating CRLF made such a file REACHABLE by the rewrite for the first time
  // (it used to fail frontmatter parsing and be skipped whole), so the rewrite
  // has to preserve the endings it found instead of hardcoding `\n`.
  it('rewrites a CRLF spec without mixing line endings', () => {
    const crlf = [
      '---',
      'feature: quiz',
      'status: active',
      'story_count: 9',
      'req_count: 9',
      '---',
      '',
      '# Quiz',
      '',
      '### US-1: s',
      '',
      '#### REQ-QUIZ-001: a',
      '',
    ].join('\r\n');

    const recount = recountFeatureSpecCounters(crlf)!;

    expect(recount.to).toEqual({ story_count: 1, req_count: 1 });
    expect(recount.content).toContain('story_count: 1\r\n');
    expect(recount.content).toContain('req_count: 1\r\n');
    // no lone LF anywhere: every newline is still part of a CRLF pair
    expect(/(?<!\r)\n/.test(recount.content)).toBe(false);
    expect((recount.content.match(/\r\n/g) ?? []).length).toBe((crlf.match(/\r\n/g) ?? []).length);
  });

  it('adds a MISSING counter line with the file\'s own line ending', () => {
    const crlf = ['---', 'feature: quiz', '---', '', '#### REQ-QUIZ-001: a', ''].join('\r\n');
    const recount = recountFeatureSpecCounters(crlf)!;
    expect(recount.content).toContain('req_count: 1');
    expect(/(?<!\r)\n/.test(recount.content)).toBe(false);
  });

  it('does not count a struck-through REQ heading as active', () => {
    const recount = recountFeatureSpecCounters(
      '---\nfeature: x\nstory_count: 0\nreq_count: 0\n---\n\n#### ~~REQ-X-001~~: retired\n',
    )!;
    expect(recount.to.req_count).toBe(0);
  });


  it('excludes Deprecated Requirements from req_count and counts stories at BOTH h2 and h3 (review C2)', () => {
    // Real specs mix heading levels: sdd-workflow is all `## US-`, mcp-server
    // all `### US-`, drift-detection mixed — the counter is the union.
    const recount = recountFeatureSpecCounters(SPEC_CONTENT)!;
    expect(recount.to).toEqual({ story_count: 3, req_count: 4 });
    expect(recount.changed).toBe(true);
  });

  it('matches the REAL repo specs — recount equals current frontmatter (no false reconciliation)', async () => {
    const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const realPath = await vi.importActual<typeof import('node:path')>('node:path');
    const featuresDir = realPath.resolve(__dirname, '../../../prospec/specs/features');
    for (const file of realFs.readdirSync(featuresDir).filter((f) => f.endsWith('.md'))) {
      // Recount the COMPOSED spec (main + its `features/{feature}/` slices), the
      // same content the production archive path recounts — a spec sliced under
      // `features/{feature}/` declares its counters as the main+slices sum, so a
      // main-only recount would falsely under-count a split spec.
      const main = realFs.readFileSync(realPath.join(featuresDir, file), 'utf-8');
      const feature = file.slice(0, -'.md'.length);
      const slices: Record<string, string> = {};
      for (const name of parseSpecSlices(main)) {
        const slicePath = realPath.join(featuresDir, feature, `${name}.md`);
        if (realFs.existsSync(slicePath)) slices[name] = realFs.readFileSync(slicePath, 'utf-8');
      }
      const recount = recountFeatureSpecCounters(
        Object.keys(slices).length > 0 ? { main, slices } : main,
      );
      if (!recount) continue;
      expect({ file, ...recount.to }).toEqual({
        file,
        story_count: recount.from.story_count,
        req_count: recount.from.req_count,
      });
    }
  });

  it('returns null for a file without frontmatter', () => {
    expect(recountFeatureSpecCounters('# no frontmatter\n')).toBeNull();
  });

  it('adds missing counter lines instead of failing', () => {
    const recount = recountFeatureSpecCounters(
      '---\nfeature: x\n---\n\n### US-1: s\n\n#### REQ-X-001: r\n',
    )!;
    expect(recount.content).toContain('story_count: 1');
    expect(recount.content).toContain('req_count: 1');
    expect(recount.changed).toBe(true);
  });
});
