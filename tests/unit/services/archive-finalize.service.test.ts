import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  executeFinalize,
  recountFeatureSpecCounters,
} from '../../../src/services/archive.service.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

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

describe('recountFeatureSpecCounters', () => {
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
      const content = realFs.readFileSync(realPath.join(featuresDir, file), 'utf-8');
      const recount = recountFeatureSpecCounters(content);
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
