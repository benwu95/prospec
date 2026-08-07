import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import {
  scanChanges,
  filterByStatus,
  moveToArchive,
  generateSummary,
  syncToFeatureSpecs,
  generateProductSpec,
  execute,
} from '../../../src/services/archive.service.js';
import { ScanError, WriteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

// Spy on the raw-scan + knowledge-update services solely to assert archive's
// execute() NEVER invokes them (REQ-SERVICES-064): the auto knowledge-update and
// raw-scan safety nets were removed, so manual phase-by-phase is the only path.
vi.mock('../../../src/services/raw-scan.service.js', () => ({
  generateRawScan: vi.fn(),
}));
vi.mock('../../../src/services/knowledge-update.service.js', () => ({
  execute: vi.fn(),
}));

import { generateRawScan } from '../../../src/services/raw-scan.service.js';
import { execute as executeKnowledgeUpdate } from '../../../src/services/knowledge-update.service.js';

beforeEach(() => {
  vol.reset();
  vi.mocked(generateRawScan).mockClear();
  vi.mocked(executeKnowledgeUpdate).mockClear();
});

// --- scanChanges ---

describe('scanChanges', () => {
  it('should return empty array for empty changes directory', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/project/.prospec/changes', { recursive: true });

    const result = await scanChanges('/project');
    expect(result).toEqual([]);
  });

  it('should return empty array when changes directory does not exist', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/project', { recursive: true });

    const result = await scanChanges('/project');
    expect(result).toEqual([]);
  });

  it('should scan multiple changes with metadata', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/feat-b/metadata.yaml': 'name: feat-b\nstatus: tasks\ncreated: "2026-01-02"\n',
    });

    const result = await scanChanges('/project');
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name).sort()).toEqual(['feat-a', 'feat-b']);
  });

  it('should skip directories without metadata.yaml', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\n',
      '/project/.prospec/changes/feat-b/proposal.md': '# no metadata here\n',
    });

    const result = await scanChanges('/project');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('feat-a');
  });
});

// --- filterByStatus ---

describe('filterByStatus', () => {
  const changes = [
    { name: 'a', dir: '/a', metadata: { status: 'verified' }, status: 'verified' },
    { name: 'b', dir: '/b', metadata: { status: 'tasks' }, status: 'tasks' },
    { name: 'c', dir: '/c', metadata: { status: 'verified' }, status: 'verified' },
    { name: 'd', dir: '/d', metadata: { status: 'story' }, status: 'story' },
  ];

  it('should filter by verified status (default)', () => {
    const result = filterByStatus(changes);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name)).toEqual(['a', 'c']);
  });

  it('should filter by specified status', () => {
    const result = filterByStatus(changes, 'tasks');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('b');
  });

  it('should return empty when no matches', () => {
    const result = filterByStatus(changes, 'archived');
    expect(result).toHaveLength(0);
  });
});

// --- moveToArchive ---

describe('moveToArchive', () => {
  it('should create archive directory with date prefix', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\n',
      '/project/.prospec/changes/feat-a/proposal.md': '# Proposal\n',
    });

    const change = {
      name: 'feat-a',
      dir: '/project/.prospec/changes/feat-a',
      metadata: { status: 'verified' },
      status: 'verified',
    };

    const archiveDir = await moveToArchive(change, '/project');

    // Archive dir should have date prefix pattern
    expect(archiveDir).toMatch(/\.prospec\/archive\/\d{4}-\d{2}-\d{2}-feat-a/);
    expect(fs.existsSync(archiveDir)).toBe(true);
  });

  it('should move all files to archive directory', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\n',
      '/project/.prospec/changes/feat-a/proposal.md': '# Proposal\n',
      '/project/.prospec/changes/feat-a/plan.md': '# Plan\n',
    });

    const change = {
      name: 'feat-a',
      dir: '/project/.prospec/changes/feat-a',
      metadata: { status: 'verified' },
      status: 'verified',
    };

    const archiveDir = await moveToArchive(change, '/project');

    expect(fs.existsSync(`${archiveDir}/metadata.yaml`)).toBe(true);
    expect(fs.existsSync(`${archiveDir}/proposal.md`)).toBe(true);
    expect(fs.existsSync(`${archiveDir}/plan.md`)).toBe(true);

    // Source directory should be removed
    expect(fs.existsSync('/project/.prospec/changes/feat-a')).toBe(false);
  });

  it('should use YYYY-MM-DD date format', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat-a/metadata.yaml': 'status: verified\n',
    });

    const change = {
      name: 'feat-a',
      dir: '/project/.prospec/changes/feat-a',
      metadata: { status: 'verified' },
      status: 'verified',
    };

    const archiveDir = await moveToArchive(change, '/project');
    const dirName = archiveDir.split('/').pop()!;
    expect(dirName).toMatch(/^\d{4}-\d{2}-\d{2}-feat-a$/);
  });

  it('rolls back already-moved files when a mid-move rename fails', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat/a.md': 'A',
      '/project/.prospec/changes/feat/b.md': 'B',
      '/project/.prospec/changes/feat/metadata.yaml': 'name: feat\nstatus: verified\n',
    });
    const change = {
      name: 'feat',
      dir: '/project/.prospec/changes/feat',
      metadata: { status: 'verified' },
      status: 'verified',
    };
    const realRename = fs.promises.rename.bind(fs.promises);
    const spy = vi
      .spyOn(fs.promises, 'rename')
      .mockImplementation(async (src: fs.PathLike, dest: fs.PathLike) => {
        // fail the forward move of b.md INTO the archive, mid-loop
        if (String(dest).endsWith('b.md')) throw new Error('disk full');
        return realRename(src, dest);
      });

    await expect(moveToArchive(change, '/project')).rejects.toThrow(/rolled back/);
    spy.mockRestore();

    // every file is back in the source dir — nothing left split across two dirs
    const remaining = fs.readdirSync('/project/.prospec/changes/feat').sort();
    expect(remaining).toEqual(['a.md', 'b.md', 'metadata.yaml']);
  });
});

// --- generateSummary ---

describe('generateSummary', () => {
  it('should extract User Story from proposal.md', async () => {
    vol.fromJSON({
      '/archive/proposal.md': `# Proposal

## User Story

As a developer,
I want automated archiving,
So that my changes directory stays clean.

## Acceptance Criteria

1. Archive works
`,
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content } = await generateSummary('/archive', 'feat-a', '2026-01-01');
    expect(content).toContain('As a developer');
    expect(content).toContain('automated archiving');
  });

  it('should extract REQ IDs from delta-spec.md', async () => {
    vol.fromJSON({
      '/archive/delta-spec.md': `# Delta Spec

## ADDED

### REQ-TYPES-010: Add archived status

Description here.

### REQ-SERVICES-010: Archive service

Description here.

## MODIFIED

None
`,
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content, affectedModules } = await generateSummary('/archive', 'feat-a', '2026-01-01');
    expect(content).toContain('REQ-TYPES-010');
    expect(content).toContain('REQ-SERVICES-010');
    expect(affectedModules).toContain('types');
    expect(affectedModules).toContain('services');
  });

  it('extracts hyphenated (multi-segment) module ids, matching extractRequirements', async () => {
    vol.fromJSON({
      '/archive/delta-spec.md': `# Delta Spec

## ADDED

### REQ-API-MIDDLEWARE-001: Add auth middleware

Description.

### REQ-TYPES-010: Single-segment still works

Description.
`,
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content, affectedModules } = await generateSummary('/archive', 'feat-a', '2026-01-01');
    // multi-segment module is no longer silently dropped
    expect(affectedModules).toContain('api-middleware');
    expect(affectedModules).toContain('types');
    expect(content).toContain('REQ-API-MIDDLEWARE-001');
  });

  it('should calculate task completion stats', async () => {
    vol.fromJSON({
      '/archive/tasks.md': `# Tasks

- [x] Task 1
- [x] Task 2
- [ ] Task 3
`,
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content } = await generateSummary('/archive', 'feat-a', '2026-01-01');
    expect(content).toContain('2/3');
    expect(content).toContain('67%');
  });

  it('counts only code tasks in the completion stats; [M]/[V] kinds are listed apart (REQ-SERVICES-010)', async () => {
    vol.fromJSON({
      '/archive/tasks.md': `# Tasks

- [x] T1 Implement schema field ~15 lines
- [x] T2 [P] Write contract tests ~40 lines
- [ ] T3 Update formatter ~20 lines
- [ ] T4 [M] Run \`prospec agent sync\` ~5 lines
- [x] T5 [V] Mutation-verify assertions ~10 lines
- [ ] T6 [P] [M] Configure external tool ~5 lines
`,
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content } = await generateSummary('/archive', 'feat-a', '2026-01-01');
    // code denominator: T1, T2, T3 → 2/3; [M]/[V] (T4, T5, T6) never counted in it
    expect(content).toContain('2/3');
    expect(content).toContain('67%');
    expect(content).not.toContain('3/6');
    expect(content).toContain('1/3 [M]/[V] (not counted)');
  });

  it('keeps the plain completion format when no kind-marked tasks exist', async () => {
    vol.fromJSON({
      '/archive/tasks.md': '- [x] Task 1\n- [ ] Task 2\n',
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content } = await generateSummary('/archive', 'feat-a', '2026-01-01');
    expect(content).toContain('1/2 (50%)');
    expect(content).not.toContain('[M]/[V]');
  });

  it('should handle missing proposal.md gracefully', async () => {
    vol.fromJSON({
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content } = await generateSummary('/archive', 'feat-a', '2026-01-01');
    expect(content).toContain('feat-a');
    // pin N/A to the User Story slot specifically: the template renders
    // `## User Story\n\n${userStory}\n`, so this fails if only taskStats is N/A
    // and the missing-proposal -> userStory fallback regressed.
    expect(content).toContain('## User Story\n\nN/A');
  });
});

// --- execute ---

describe('execute', () => {
  it('should archive verified changes and update metadata to archived', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/feat-a/proposal.md': `# Proposal

## User Story

As a dev, I want X, so that Y.
`,
      '/project/.prospec/changes/feat-a/delta-spec.md': `# Delta Spec

## ADDED

### REQ-TYPES-001: Some type change

Details.
`,
      '/project/.prospec/changes/feat-a/tasks.md': '- [x] Task 1\n- [x] Task 2\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.archived).toHaveLength(1);
    expect(result.archived[0]!.name).toBe('feat-a');
    expect(result.archived[0]!.summaryGenerated).toBe(true);
    expect(result.affectedModules).toContain('types');

    // Verify metadata was updated to archived
    const archiveDir = result.archived[0]!.archivePath;
    const metaContent = fs.readFileSync(`${archiveDir}/metadata.yaml`, 'utf-8');
    expect(metaContent).toContain('archived');

    // Verify summary.md was generated
    expect(fs.existsSync(`${archiveDir}/summary.md`)).toBe(true);

    // Verify source directory was removed
    expect(fs.existsSync('/project/.prospec/changes/feat-a')).toBe(false);
  });

  it('should skip non-verified changes by default', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: tasks\ncreated: "2026-01-01"\n',
    });

    const result = await execute({ cwd: '/project' });
    expect(result.archived).toHaveLength(0);
  });

  it('should archive changes with specified status', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: tasks\ncreated: "2026-01-01"\n',
    });

    const result = await execute({ cwd: '/project', status: 'tasks' });
    expect(result.archived).toHaveLength(1);
  });

  it('should sync to Feature Specs when config and delta-spec exist', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\npaths:\n  base_dir: prospec\n',
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/feat-a/proposal.md': '# Proposal\n\n## User Story\n\nAs a dev, I want X.\n',
      '/project/.prospec/changes/feat-a/delta-spec.md': '# Delta Spec\n\n## ADDED\n\n### REQ-TYPES-001: Some type\n\n**Feature:** sdd-workflow\n**Story:** US-1\n\n**Description:**\nDetails.\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.specFiles).toHaveLength(1);
    expect(result.specFiles[0]).toContain('/prospec/specs/features/sdd-workflow.md');
    expect(fs.existsSync(result.specFiles[0]!)).toBe(true);

    const specContent = fs.readFileSync(result.specFiles[0]!, 'utf-8');
    expect(specContent).toContain('sdd-workflow');
    expect(specContent).toContain('REQ-TYPES-001');
  });

  it('names the archived change in the Change History row it appends to an EXISTING table', async () => {
    // The production path: every real feature spec already has a Change History
    // table, so the in-table insertion branch — not the EOF fallback — is what
    // ships. Pinning only the fallback left this branch free to re-hardcode.
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\npaths:\n  base_dir: prospec\n',
      '/project/prospec/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# SDD Workflow

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-01-01 | earlier-change | ADDED REQ-TYPES-000 | REQ-TYPES-000 |
`,
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/feat-a/delta-spec.md':
        '# Delta Spec\n\n## ADDED\n\n### REQ-TYPES-001: Some type\n\n**Feature:** sdd-workflow\n**Story:** US-1\n\n**Description:**\nDetails.\n',
    });

    await execute({ cwd: '/project' });
    const spec = fs.readFileSync('/project/prospec/specs/features/sdd-workflow.md', 'utf-8');

    // section-scope to the Change History table, then read the row this run added
    const table = spec.slice(spec.indexOf('## Change History'));
    expect(table).toContain('| Date | Change |');
    const added = table.split('\n').find((l) => l.includes('REQ-TYPES-001'));
    expect(added, 'the run appended no Change History row').toBeDefined();
    expect(added).toContain('| feat-a |');
    expect(table, 'no row may carry a fixed placeholder').not.toContain('archive-sync');
    // the pre-existing row survives untouched
    expect(table).toContain('| 2026-01-01 | earlier-change | ADDED REQ-TYPES-000 | REQ-TYPES-000 |');
  });

  it('names the change in a NEWLY created feature spec too', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\npaths:\n  base_dir: prospec\n',
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/feat-a/delta-spec.md':
        '# Delta Spec\n\n## ADDED\n\n### REQ-TYPES-001: Some type\n\n**Feature:** brand-new-feature\n**Story:** US-1\n\n**Description:**\nDetails.\n',
    });

    await execute({ cwd: '/project' });
    const spec = fs.readFileSync(
      '/project/prospec/specs/features/brand-new-feature.md',
      'utf-8',
    );
    expect(spec).toContain('| feat-a | Created from archive |');
    expect(spec, 'the new-spec branch had its own hardcoded placeholder').not.toContain(
      'initial-sync',
    );
  });

  it('escapes a change name that would otherwise shift the table columns — in BOTH write paths', async () => {
    // `change.name` is a directory entry, so it is the one cell we do not generate.
    // One REQ routes to an EXISTING spec (in-table insertion) and one to a new
    // slug (spec creation): a single-branch fixture let the other keep a raw pipe.
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\npaths:\n  base_dir: prospec\n',
      '/project/prospec/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# SDD Workflow

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-01-01 | earlier-change | ADDED REQ-TYPES-000 | REQ-TYPES-000 |
`,
      '/project/.prospec/changes/odd|name/metadata.yaml': 'name: "odd|name"\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/odd|name/delta-spec.md':
        '# Delta Spec\n\n## ADDED\n\n### REQ-TYPES-001: Some type\n\n**Feature:** sdd-workflow\n**Story:** US-1\n\n**Description:**\nDetails.\n\n---\n\n### REQ-TYPES-002: Another\n\n**Feature:** fresh-slug\n**Story:** US-1\n\n**Description:**\nDetails.\n',
    });

    await execute({ cwd: '/project' });

    for (const [file, reqId] of [
      ['sdd-workflow', 'REQ-TYPES-001'],
      ['fresh-slug', 'REQ-TYPES-002'],
    ] as const) {
      const spec = fs.readFileSync(`/project/prospec/specs/features/${file}.md`, 'utf-8');
      const row = spec.split('\n').find((l) => l.startsWith('|') && l.includes(reqId));
      expect(row, `${file} has no Change History row for ${reqId}`).toBeDefined();
      expect(row, `${file} left the pipe unescaped`).toContain('odd\\|name');
      // four columns — an unescaped pipe would split into five
      expect(row!.split(/(?<!\\)\|/).length, `${file} row gained a column`).toBe(6);
    }
  });

  it('should not fail archive when config is missing (no spec files)', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\ncreated: "2026-01-01"\n',
      // A fully routable delta-spec (REQ + **Feature:**): with config present this
      // WOULD sync a Feature Spec. Here config is missing, so featuresPath stays
      // null and the sync block (L425) is skipped — specFiles is empty ONLY
      // because of the config-missing guard, not because the delta-spec was
      // unroutable. This makes the length-0 assertion branch-distinguishing.
      '/project/.prospec/changes/feat-a/delta-spec.md':
        '# Delta Spec\n\n## ADDED\n\n### REQ-TYPES-001: x\n\n**Feature:** f\n\n**Description:**\nDetails.\n\n---\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.archived).toHaveLength(1);
    expect(result.specFiles).toHaveLength(0);
    // and nothing was written under the default (config-less) features path
    expect(fs.existsSync('/project/prospec/specs/features/f.md')).toBe(false);
    expect(fs.existsSync('/project/prospec/specs/features')).toBe(false);
  });

  it('never auto-triggers knowledge-update or raw-scan (REQ-SERVICES-064)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/feat-a/proposal.md': '# Proposal\n\n## User Story\n\nAs a dev, I want X.\n',
      // A delta-spec present is the exact condition the removed safety net fired on —
      // asserting non-invocation here proves the trigger is gone, not just absent.
      '/project/.prospec/changes/feat-a/delta-spec.md':
        '## ADDED\n\n### REQ-SERVICES-001: X\n\n**Feature:** f\n**Story:** US-1\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.archived).toHaveLength(1);
    // The auto knowledge-update + raw-scan safety nets were removed — manual
    // phase-by-phase is the only knowledge-sync path.
    expect(vi.mocked(executeKnowledgeUpdate)).not.toHaveBeenCalled();
    expect(vi.mocked(generateRawScan)).not.toHaveBeenCalled();
    // ArchiveResult no longer carries the removed safety-net fields.
    expect(result).not.toHaveProperty('knowledgeUpdated');
    expect(result).not.toHaveProperty('knowledgeWarnings');
    expect(result).not.toHaveProperty('rawScanRefreshed');
  });
});

// --- syncToFeatureSpecs ---

describe('syncToFeatureSpecs', () => {
  it('should create new Feature Spec from delta-spec with routing fields', async () => {
    vol.fromJSON({
      '/archive/delta-spec.md': `# Delta Spec

## ADDED

### REQ-TYPES-010: Feature Spec type definitions

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
Define types for Feature Spec frontmatter.

**Priority:** High

---
`,
    });
    vol.mkdirSync('/specs/features', { recursive: true });

    const { files } = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');

    expect(files).toHaveLength(1);
    expect(files[0]).toBe('/specs/features/sdd-workflow.md');
    expect(fs.existsSync('/specs/features/sdd-workflow.md')).toBe(true);

    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');
    expect(content).toContain('feature: sdd-workflow');
    expect(content).toContain('status: active');
    expect(content).toContain('REQ-TYPES-010');
    expect(content).toContain('## Change History');
  });

  it('preserves $-sequences in an ADDED REQ description verbatim (no replacement-pattern expansion)', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# sdd-workflow

## User Stories

#### REQ-TYPES-001: existing

---

## Edge Cases

- existing edge
`,
      '/archive/delta-spec.md': `# Delta Spec

## ADDED

### REQ-TYPES-020: price is $& and $\` and $$ literal

**Feature:** sdd-workflow

**Description:**
Adds a literal token.

---
`,
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');
    // the description survives byte-for-byte; a string replacement would expand
    // $& to the matched '## Edge Cases' heading and corrupt the spec
    expect(content).toContain('REQ-TYPES-020: price is $& and $` and $$ literal');
    expect(content).not.toContain('price is ## Edge Cases');
  });

  it('preserves $-sequences in a REMOVED REQ description verbatim', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# sdd-workflow

## Deprecated Requirements

_(None)_
`,
      '/archive/delta-spec.md': `# Delta Spec

## REMOVED

### REQ-TYPES-030: dropped $& token

**Feature:** sdd-workflow

**Description:**
Gone.

---
`,
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');
    expect(content).toContain('REQ-TYPES-030**: dropped $& token');
    expect(content).not.toContain('dropped ## Deprecated Requirements');
  });

  it('refuses a path-traversal **Feature:** slug and never writes outside featuresPath', async () => {
    vol.fromJSON({
      '/archive/delta-spec.md': `# Delta Spec

## ADDED

### REQ-EVIL-001: escape attempt

**Feature:** ../../evil

**Description:**
Tries to escape.

---

### REQ-SAFE-001: legitimate

**Feature:** safe-feature

**Description:**
Stays put.

---
`,
    });
    vol.mkdirSync('/specs/features', { recursive: true });

    const { files } = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');

    // the traversal slug is skipped entirely — nothing escapes the features dir
    expect(fs.existsSync('/evil.md')).toBe(false);
    expect(files.some((f) => f.includes('evil'))).toBe(false);
    // the legitimate sibling route is still synced
    expect(fs.existsSync('/specs/features/safe-feature.md')).toBe(true);
  });

  it('should return empty array when no delta-spec exists', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/archive', { recursive: true });

    const { files } = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    expect(files).toHaveLength(0);
  });

  it('replaces only the target REQ block, not the trailing h2 sections (MODIFIED)', async () => {
    // The MODIFIED REQ is the LAST h4 before the first h2 section. The skip
    // loop must stop at the h2 boundary, or everything to EOF is destroyed.
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
story_count: 1
req_count: 1
---

# sdd-workflow

## User Stories

#### REQ-TYPES-010: old description

Old requirement body.

## Edge Cases

- an important edge case

## Success Criteria

- a success criterion

## Deprecated Requirements

_(None)_

## Change History

| Date | Change |
|------|--------|
| 2026-01-01 | init |
`,
      '/archive/delta-spec.md': `# Delta Spec

## MODIFIED

### REQ-TYPES-010: new description

**Feature:** sdd-workflow

**Description:**
Updated body.

---
`,
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('REQ-TYPES-010: new description');
    expect(content).not.toContain('old description');
    // the trailing h2 sections must survive
    expect(content).toContain('## Edge Cases');
    expect(content).toContain('an important edge case');
    expect(content).toContain('## Success Criteria');
    expect(content).toContain('## Deprecated Requirements');
    expect(content).toContain('## Change History');
  });

  it('stops MODIFIED replacement at a --- rule terminating the REQ block', async () => {
    // Exercises the `--- ` boundary branch: the modified REQ block is delimited
    // by a horizontal rule (the canonical REQ-block separator), after which a
    // sibling REQ must remain intact.
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
story_count: 2
req_count: 2
---

# sdd-workflow

## User Stories

#### REQ-TYPES-010: old description

Old body line.

---

#### REQ-TYPES-011: sibling requirement

Sibling body.

## Change History

| Date | Change |
|------|--------|
| 2026-01-01 | init |
`,
      '/archive/delta-spec.md': `# Delta Spec

## MODIFIED

### REQ-TYPES-010: new description

**Feature:** sdd-workflow

**Description:**
Updated body.

---
`,
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('REQ-TYPES-010: new description');
    expect(content).not.toContain('old description');
    // the sibling REQ after the --- must survive
    expect(content).toContain('REQ-TYPES-011: sibling requirement');
    expect(content).toContain('Sibling body.');
  });

  it('should route multiple REQs to different Feature Specs', async () => {
    vol.fromJSON({
      '/archive/delta-spec.md': `# Delta Spec

## ADDED

### REQ-TYPES-001: Type A

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
Details.

---

### REQ-CLI-001: CLI command

**Feature:** project-setup
**Story:** US-2

**Description:**
Details.

---
`,
    });

    const { files } = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');

    expect(files).toHaveLength(2);
    expect(fs.existsSync('/specs/features/sdd-workflow.md')).toBe(true);
    expect(fs.existsSync('/specs/features/project-setup.md')).toBe(true);
  });
});

// --- generateProductSpec ---

describe('generateProductSpec', () => {
  it('should generate product.md from Feature Spec frontmatter', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
story_count: 3
req_count: 5
---

# sdd-workflow
`,
      '/specs/features/ai-knowledge.md': `---
feature: ai-knowledge
status: active
last_updated: 2026-01-02
story_count: 2
req_count: 4
---

# ai-knowledge
`,
    });

    const result = await generateProductSpec('/specs/features', '/specs/product.md', 'test-project');

    expect(result.path).toBe('/specs/product.md');
    expect(fs.existsSync('/specs/product.md')).toBe(true);

    const content = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(content).toContain('product: test-project');
    expect(content).toContain('sdd-workflow');
    expect(content).toContain('ai-knowledge');
    expect(content).toContain('features/sdd-workflow.md');
  });

  it('should skip deprecated features in feature map', async () => {
    vol.fromJSON({
      '/specs/features/active-feature.md': `---
feature: active-feature
status: active
last_updated: 2026-01-01
story_count: 1
req_count: 1
---

# active-feature
`,
      '/specs/features/old-feature.md': `---
feature: old-feature
status: deprecated
last_updated: 2025-06-01
story_count: 0
req_count: 0
---

# old-feature
`,
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'test-project');

    const content = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(content).toContain('active-feature');
    expect(content).not.toContain('old-feature');
  });

  it('emits the no-active-features placeholder when nothing is active', async () => {
    vol.fromJSON({
      '/specs/features/old.md': `---
feature: old
status: deprecated
last_updated: 2025-01-01
---

# old
`,
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');
    const content = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(content).toContain('_(No active features yet)_');
  });

  it('skips non-.md files and files lacking frontmatter (L326/L330)', async () => {
    vol.fromJSON({
      '/specs/features/notes.txt': 'feature: should-be-ignored\nstatus: active\n',
      '/specs/features/no-fm.md': '# A markdown file with no YAML frontmatter\n',
      '/specs/features/real.md': `---
feature: real-feature
status: active
last_updated: 2026-01-01
---

# real-feature
`,
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');
    const content = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(content).toContain('real-feature');
    // .txt file is never read as a feature; no-frontmatter .md yields null
    expect(content).not.toContain('should-be-ignored');
    expect(content).not.toContain('no-fm');
  });

  it('produces the placeholder when the features directory does not exist', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/specs', { recursive: true });

    const result = await generateProductSpec('/specs/features', '/specs/product.md', 'p');
    expect(result.path).toBe('/specs/product.md');
    const content = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(content).toContain('_(No active features yet)_');
  });
});

// --- generateProductSpec: splice vs bootstrap (REQ-SERVICES-079) ---

const featureSpec = (slug: string, title = slug, status = 'active'): string =>
  `---\nfeature: ${title}\nstatus: ${status}\nlast_updated: 2026-01-01\nstory_count: 1\nreq_count: 1\n---\n\n# ${title}\n`;

/** The `## Feature Map` region, so the rest of the file can be diffed as one unit. */
function outsideFeatureMap(content: string): string[] {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => /^##\s+Feature Map\s*$/.test(l));
  if (start === -1) return lines;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  return [...lines.slice(0, start), ...lines.slice(end)];
}

const AUTHORED_PRODUCT_SPEC = `---
product: downstream
version: 1.65.0
feature_count: 34
last_updated: 2020-01-01
---

# Downstream — the tagline someone wrote

## Vision

A paragraph a human wrote and expects to keep.

## Target Users

| Role | Description | Core Need |
|------|-------------|-----------|
| Dev | Writes code | Fast feedback |

## Feature Map

### alpha

The alpha feature, described by hand.
→ [features/alpha.md](features/alpha.md)

## Product Principles

1. **Boring** — surprises are bugs.

## A Section Nobody Generated

Custom prose that belongs to the author.
`;

describe('generateProductSpec splices an existing product.md (REQ-SERVICES-079)', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('leaves every byte outside the Feature Map section untouched except last_updated', async () => {
    vol.fromJSON({
      '/specs/product.md': AUTHORED_PRODUCT_SPEC,
      '/specs/features/alpha.md': featureSpec('alpha'),
      '/specs/features/beta.md': featureSpec('beta'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'downstream');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    const expected = outsideFeatureMap(AUTHORED_PRODUCT_SPEC).map((l) =>
      l.startsWith('last_updated:') ? `last_updated: ${today}` : l,
    );
    expect(outsideFeatureMap(after)).toEqual(expected);
    // the named victims of the old whole-file rewrite, asserted individually
    expect(after).toContain('version: 1.65.0');
    expect(after).toContain('feature_count: 34');
    expect(after).toContain('# Downstream — the tagline someone wrote');
  });

  it('keeps an authored entry description and refreshes only its title and link', async () => {
    vol.fromJSON({
      '/specs/product.md': AUTHORED_PRODUCT_SPEC,
      '/specs/features/alpha.md': featureSpec('alpha', 'Alpha Renamed'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'downstream');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).toContain('The alpha feature, described by hand.');
    expect(after).toContain('### Alpha Renamed');
    expect(after).not.toContain('### alpha\n');
    expect(after).toContain('→ [features/alpha.md](features/alpha.md)');
  });

  it('drops an entry whose spec is gone and appends new features with a TBD description', async () => {
    vol.fromJSON({
      '/specs/product.md': AUTHORED_PRODUCT_SPEC,
      '/specs/features/beta.md': featureSpec('beta'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'downstream');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).not.toContain('features/alpha.md');
    expect(after).not.toContain('The alpha feature, described by hand.');
    expect(after).toContain('### beta');
    expect(after).toMatch(/### beta\n\nTBD[^\n]*\n→ \[features\/beta\.md\]/);
  });

  it('appends the section at end of file when there is no Feature Map heading', async () => {
    const authored = '---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n# p\n\n## Vision\n\nMine.\n';
    vol.fromJSON({
      '/specs/product.md': authored,
      '/specs/features/beta.md': featureSpec('beta'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).toContain('## Vision\n\nMine.\n');
    expect(after).toContain('## Feature Map');
    expect(after.indexOf('## Feature Map')).toBeGreaterThan(after.indexOf('## Vision'));
    expect(after).toContain('→ [features/beta.md](features/beta.md)');
  });

  it('does not let a `## ` line inside a fenced code block end the section', async () => {
    const authored = `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n# p\n\n## Feature Map\n\n### alpha\n\nDescribed.\n→ [features/alpha.md](features/alpha.md)\n\n\`\`\`markdown\n## Not A Real Heading\n\`\`\`\n\n## Roadmap Overview\n\nKeep me.\n`;
    vol.fromJSON({
      '/specs/product.md': authored,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    // Had the fenced `## ` ended the section, the splice would have cut the fence
    // OPENER (it precedes that line) and left an orphan closer behind.
    expect(after).toContain('```markdown\n## Not A Real Heading\n```');
    expect(after).toContain('## Roadmap Overview\n\nKeep me.\n');
  });

  it('is byte-identical across two consecutive runs', async () => {
    vol.fromJSON({
      '/specs/product.md': AUTHORED_PRODUCT_SPEC,
      '/specs/features/alpha.md': featureSpec('alpha'),
      '/specs/features/beta.md': featureSpec('beta'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'downstream');
    const first = fs.readFileSync('/specs/product.md', 'utf-8');
    await generateProductSpec('/specs/features', '/specs/product.md', 'downstream');
    expect(fs.readFileSync('/specs/product.md', 'utf-8')).toBe(first);
  });

  it('leaves a file without frontmatter alone outside the section (no last_updated is invented)', async () => {
    vol.fromJSON({
      '/specs/product.md': '# p\n\n## Feature Map\n\n_(No active features yet)_\n',
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after.startsWith('# p\n')).toBe(true);
    expect(after).not.toContain('last_updated');
  });
});

describe('a near-miss Feature Map heading is refused, not appended past (REQ-SERVICES-079)', () => {
  /** An authored product.md whose only Feature-Map-ish heading is `heading`. */
  const authoredUnder = (heading: string): string =>
    `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n# p\n\n${heading}\n\n### alpha\n\nMine, grouped by hand.\n→ [features/alpha.md](features/alpha.md)\n\n## Roadmap\n\nMine too.\n`;

  // The rule drops a leading ordinal, a trailing colon, and ONE trailing
  // parenthesized or bracketed suffix, then case-folds. Anything else is a
  // DIFFERENT heading: over-matching would splice away curated content, and
  // under-matching brings back the duplicate section this refusal exists to stop.
  // The colon cases run on both sides of the suffix — an author's ordering of the
  // two carries no meaning — while the suffix strip is capped at one, which is the
  // boundary `(draft) (2024)` below pins.
  const NEAR_MISSES = [
    '## Feature Map (34 active)',
    '## Feature Map [34]',
    '## feature map',
    '## FEATURE MAP',
    '## Feature Map:',
    '## 4. Feature Map',
    '## Feature Map (34 active):',
    '## Feature Map: (34 active)',
  ];
  const UNRELATED = [
    '## Feature Map Rationale',
    '## Feature Maps',
    '## Map of Features',
    '## Roadmap Overview',
    // one suffix is the documented cap — a second one names the author's own
    // organizing scheme, so this heading appends rather than refusing forever
    '## Feature Map (draft) (2024)',
  ];

  it.each(NEAR_MISSES)('refuses and writes nothing under %s', async (heading) => {
    const authored = authoredUnder(heading);
    vol.fromJSON({
      '/specs/product.md': authored,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    const result = await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    // byte-identical: `last_updated` is not refreshed either — a refusal writes NOTHING
    expect(fs.readFileSync('/specs/product.md', 'utf-8')).toBe(authored);
    expect(result.declined?.reason).toBe('near-miss-heading');
    expect(result.declined?.detail).toContain(heading.replace(/^##\s+/, ''));
  });

  it.each(UNRELATED)('leaves %s alone and appends the section as before', async (heading) => {
    vol.fromJSON({
      '/specs/product.md': authoredUnder(heading),
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    const result = await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(result.declined).toBeNull();
    expect(after).toContain(heading);
    expect(after).toContain('## Feature Map\n');
  });

  it('splices the exact heading and leaves a near-miss sibling untouched', async () => {
    const authored = `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n# p\n\n## Feature Map (34 active)\n\nMy curated grouping.\n\n## Feature Map\n\n### alpha\n\nMachine-owned entry.\n→ [features/alpha.md](features/alpha.md)\n`;
    vol.fromJSON({
      '/specs/product.md': authored,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    const result = await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(result.declined).toBeNull();
    expect(after).toContain('## Feature Map (34 active)\n\nMy curated grouping.');
    expect(after).toContain('Machine-owned entry.');
  });

  it('does not read a near-miss heading out of a fenced block or the frontmatter', async () => {
    // Both are masked for the exact heading already; the near-miss scan must read
    // the SAME masked view, or a documented example refuses a real sync forever.
    const authored = `---\nproduct: p\n## Feature Map (34 active)\nlast_updated: 2020-01-01\n---\n\n# p\n\n\`\`\`markdown\n## Feature Map (34 active)\n\`\`\`\n`;
    vol.fromJSON({
      '/specs/product.md': authored,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    const result = await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    expect(result.declined).toBeNull();
    expect(fs.readFileSync('/specs/product.md', 'utf-8')).toContain('## Feature Map\n');
  });

  it('detects a setext-written near-miss heading', async () => {
    const authored = `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n# p\n\nFeature Map (34 active)\n------------------------\n\nMine.\n`;
    vol.fromJSON({
      '/specs/product.md': authored,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    const result = await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    expect(result.declined?.reason).toBe('near-miss-heading');
    expect(fs.readFileSync('/specs/product.md', 'utf-8')).toBe(authored);
  });

  it('names the first near-miss heading and how many were found', async () => {
    const authored = `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n# p\n\n## Feature Map (34 active)\n\nOne.\n\n## Feature Map:\n\nTwo.\n`;
    vol.fromJSON({
      '/specs/product.md': authored,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    const result = await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    expect(result.declined?.detail).toContain('Feature Map (34 active)');
    expect(result.declined?.detail).toContain('2');
  });
});

describe('generateProductSpec reports every branch in which it declines to write (REQ-SERVICES-080)', () => {
  it('reports an unclosed fence rather than declining silently', async () => {
    const malformed = `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n\`\`\`markdown\nnever closed\n\n## Feature Map\n`;
    vol.fromJSON({
      '/specs/product.md': malformed,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    const result = await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    expect(result.declined?.reason).toBe('unclosed-fence');
    expect(fs.readFileSync('/specs/product.md', 'utf-8')).toBe(malformed);
  });

  it('reports an absent specs/features/ rather than declining silently', async () => {
    const authored = `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n### alpha\n\nMine.\n→ [features/alpha.md](features/alpha.md)\n`;
    vol.fromJSON({ '/specs/product.md': authored });

    const result = await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    expect(result.declined?.reason).toBe('missing-features-dir');
    expect(fs.readFileSync('/specs/product.md', 'utf-8')).toBe(authored);
    // A reason without a remedy sends the reader to the ONE repair that destroys
    // data: an empty directory reads as zero features, and the next sync replaces
    // every authored entry with the no-features placeholder.
    expect(result.declined?.detail).toMatch(/restore it/i);
    expect(result.declined?.detail).toMatch(/empty/i);
  });

  it('tells a project whose Feature Map holds nothing to create the directory instead', async () => {
    // Same reason, opposite advice. `prospec init` never creates `specs/features/`,
    // so a project whose first archive bootstrapped product.md sits here on EVERY
    // later archive — and there, creating the directory is the whole fix, not the
    // destructive move the populated-map wording forbids.
    const authored = `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n_(No active features yet)_\n`;
    vol.fromJSON({ '/specs/product.md': authored });

    const result = await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    expect(result.declined?.reason).toBe('missing-features-dir');
    expect(result.declined?.detail).toMatch(/nothing a sync would erase/i);
    // the advice the populated-map state needs must NOT reach this one
    expect(result.declined?.detail).not.toMatch(/is not a fix/i);
    expect(fs.readFileSync('/specs/product.md', 'utf-8')).toBe(authored);
  });

  it.each([
    ['bullet list', '- [Auth](features/auth.md) — user login\n- [Billing](features/billing.md) — invoices'],
    ['table', '| Feature | Spec |\n|---|---|\n| Auth | features/auth.md |'],
    ['prose', 'Every capability we ship, grouped by the teaching flow.'],
  ])(
    'treats a Feature Map written as a %s as content, not as an empty region',
    async (_shape, body) => {
      // `spliceProductSpec` replaces the WHOLE region, so a map a human wrote in any
      // shape is erasable. Counting `### ` entries called these files empty and sent
      // their authors to the remedy that wipes them — the very loss this refusal exists
      // to prevent.
      const authored = `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n${body}\n\n## Vision\n\nMine.\n`;
      vol.fromJSON({ '/specs/product.md': authored });

      const result = await generateProductSpec('/specs/features', '/specs/product.md', 'p');

      expect(result.declined?.reason).toBe('missing-features-dir');
      expect(result.declined?.detail).toMatch(/is not a fix/i);
      expect(result.declined?.detail).not.toMatch(/nothing a sync would erase/i);
      expect(fs.readFileSync('/specs/product.md', 'utf-8')).toBe(authored);
    },
  );

  it('reports no decline when the sync writes, and none when it bootstraps', async () => {
    vol.fromJSON({
      '/specs/product.md': `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n_(none)_\n`,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });
    expect((await generateProductSpec('/specs/features', '/specs/product.md', 'p')).declined).toBeNull();

    vol.reset();
    vol.fromJSON({ '/specs/features/alpha.md': featureSpec('alpha') });
    expect((await generateProductSpec('/specs/features', '/specs/product.md', 'p')).declined).toBeNull();
  });
});

describe('generateProductSpec survives malformed and hostile product.md input (REQ-SERVICES-079)', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('keeps authored prose and the file’s own line endings when product.md is CRLF', async () => {
    // What git hands a Windows checkout. A trailing \r defeats every anchored
    // match here, so the entry parser used to fall back to TBD and wipe the prose.
    vol.fromJSON({
      '/specs/product.md': AUTHORED_PRODUCT_SPEC.replace(/\n/g, '\r\n'),
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'downstream');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).toContain('The alpha feature, described by hand.');
    expect(after).toContain(`last_updated: ${today}`);
    // no mixed endings: every LF in the output belongs to a CRLF pair
    expect(after.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('parses a CRLF feature spec rather than counting it as "not a feature"', async () => {
    vol.fromJSON({
      '/specs/product.md': AUTHORED_PRODUCT_SPEC,
      '/specs/features/alpha.md': featureSpec('alpha').replace(/\n/g, '\r\n'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'downstream');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).toContain('→ [features/alpha.md](features/alpha.md)');
    expect(after).not.toContain('_(No active features yet)_');
  });

  it('does not touch an authored file when the features directory is absent', async () => {
    // syncFeatureMap refuses to write in this state; emptying the Feature Map
    // would report a missing directory as the fact "this product has no features".
    vol.fromJSON({ '/specs/product.md': AUTHORED_PRODUCT_SPEC });

    await generateProductSpec('/specs/features', '/specs/product.md', 'downstream');

    expect(fs.readFileSync('/specs/product.md', 'utf-8')).toBe(AUTHORED_PRODUCT_SPEC);
  });

  it('leaves a cross-reference line that merely starts with a link inside the description', async () => {
    vol.fromJSON({
      '/specs/product.md': `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n### alpha\n\n→ [features/beta.md](features/beta.md) is the sibling feature.\n→ [features/alpha.md](features/alpha.md)\n`,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).toContain('→ [features/beta.md](features/beta.md) is the sibling feature.');
    expect([...after.matchAll(/→ \[features\/alpha\.md\]/g)]).toHaveLength(1);
  });

  it('recognizes the link forms a human writes instead of appending a second link', async () => {
    for (const link of [
      '→ [features/alpha.md](./features/alpha.md)',
      '→ [Alpha](features/alpha.md "the spec")',
      "→ [Alpha](features/alpha.md 'the spec')",
      '→ [Alpha](features/alpha.md (the spec))',
      '-> [features/alpha.md](features/alpha.md)',
    ]) {
      vol.reset();
      vol.fromJSON({
        '/specs/product.md': `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n### alpha\n\nAlpha desc.\n${link}\n`,
        '/specs/features/alpha.md': featureSpec('alpha'),
      });

      await generateProductSpec('/specs/features', '/specs/product.md', 'p');

      const after = fs.readFileSync('/specs/product.md', 'utf-8');
      expect(after, link).toContain('Alpha desc.');
      expect([...after.matchAll(/\(\.?\/?features\/alpha\.md/g)], link).toHaveLength(1);
    }
  });

  it('refuses to write at all when an unclosed fence makes the document unparseable', async () => {
    // Neither reading matters: trusting the mask hides the tail, ignoring it lets a
    // fenced `## ` cut the section short. Both guesses damage an authored file.
    const malformed = `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Vision\n\n\`\`\`markdown\nnever closed\n\n## Feature Map\n\n### alpha\n\nAuthored description.\n→ [features/alpha.md](features/alpha.md)\n`;
    vol.fromJSON({
      '/specs/product.md': malformed,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    expect(fs.readFileSync('/specs/product.md', 'utf-8')).toBe(malformed);
  });

  it('refuses on an unclosed fence in a CRLF document too, not just an LF one', async () => {
    // The fence scanner matched with `.`, which never matches `\r`, so a CRLF file's
    // fences all read as absent — the refusal fired for LF and the CRLF twin grew a
    // duplicate section on every run.
    const lf = `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Vision\n\n\`\`\`md\nforgot to close\n\n## Feature Map\n\n### alpha\n\nAuthored.\n→ [features/alpha.md](features/alpha.md)\n`;
    for (const doc of [lf, lf.replace(/\n/g, '\r\n')]) {
      vol.reset();
      vol.fromJSON({ '/specs/product.md': doc, '/specs/features/alpha.md': featureSpec('alpha') });

      await generateProductSpec('/specs/features', '/specs/product.md', 'p');
      await generateProductSpec('/specs/features', '/specs/product.md', 'p');

      expect(fs.readFileSync('/specs/product.md', 'utf-8')).toBe(doc);
    }
  });

  it('never splices into YAML frontmatter that happens to contain the heading text', async () => {
    // The section scan ran from line 0, so a `## Feature Map` line inside the
    // frontmatter became the splice target: keys deleted, YAML corrupted, and the
    // real section never synced.
    vol.fromJSON({
      '/specs/product.md': `---\n## Feature Map\nproduct: p\nversion: 2.0.0\nlast_updated: 2020-01-01\n---\n\n# Demo\n\n## Feature Map\n\n### alpha\n\nMine.\n→ [features/alpha.md](features/alpha.md)\n\n## Notes\n\nend\n`,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).toContain('product: p');
    expect(after).toContain('version: 2.0.0');
    expect(after).toContain(`last_updated: ${today}`);
    expect(after).toContain('Mine.'); // the REAL section was the one synced
    expect(after).toContain('## Notes\n\nend\n');
  });

  it('keeps last_updated aligned with the line it names, however long the frontmatter', async () => {
    // The refresh indexed the pre-splice array but wrote into the spliced one, so a
    // long frontmatter put the new value into the document body.
    vol.fromJSON({
      '/specs/product.md': `---\nproduct: p\na: 1\nb: 2\nc: 3\nd: 4\ne: 5\nf: 6\ng: 7\nh: 8\ni: 9\nj: 10\nlast_updated: 2020-01-01\n---\n\n# Demo\n\nbody\n`,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');
    const first = fs.readFileSync('/specs/product.md', 'utf-8');
    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    expect(first).toContain('a: 1');
    expect(first).toContain('j: 10');
    expect(first).toContain('# Demo\n\nbody');
    expect(first.match(/last_updated:/g)).toHaveLength(1);
    expect(fs.readFileSync('/specs/product.md', 'utf-8')).toBe(first);
  });

  it('does not read a bare hash run as an h1/h2 boundary', async () => {
    // `###` is an empty h3, not an h2. Counting it split the section at a divider,
    // orphaning the entry below it and losing its authored description.
    vol.fromJSON({
      '/specs/product.md': `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n### alpha\n\nAlpha prose.\n→ [features/alpha.md](features/alpha.md)\n\n###\n\n### beta\n\nAuthored beta prose.\n→ [features/beta.md](features/beta.md)\n`,
      '/specs/features/alpha.md': featureSpec('alpha'),
      '/specs/features/beta.md': featureSpec('beta'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).toContain('Authored beta prose.');
    expect(after.match(/### beta/g)).toHaveLength(1);
  });

  it('falls back to the slug rather than emitting an empty entry heading', async () => {
    // A blank `feature:` rendered `### `, which the next run read as a heading —
    // the section then appended instead of replacing, growing without bound.
    vol.fromJSON({
      '/specs/product.md': `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n_(No active features yet)_\n\n## Vision\n\nV.\n`,
      '/specs/features/alpha.md': `---\nfeature:   \nstatus: active\nlast_updated: 2026-01-01\n---\n`,
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');
    const first = fs.readFileSync('/specs/product.md', 'utf-8');
    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    expect(first).toContain('### alpha');
    expect(first).not.toMatch(/^### $/m);
    expect(fs.readFileSync('/specs/product.md', 'utf-8')).toBe(first);
  });

  it('finds the frontmatter close even when it carries trailing whitespace', async () => {
    // Matching `---` exactly locked onto a LATER thematic break, masking the real
    // heading and appending a second Feature Map section.
    vol.fromJSON({
      '/specs/product.md': `---\nproduct: p\nlast_updated: 2020-01-01\n--- \n\n## Feature Map\n\n### alpha\n\nAuthored alpha prose.\n→ [features/alpha.md](features/alpha.md)\n\n---\n\n## Appendix\n\nA.\n`,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after.match(/## Feature Map/g)).toHaveLength(1);
    expect(after).toContain('Authored alpha prose.');
    expect(after).toContain(`last_updated: ${today}`);
    expect(after).toContain('## Appendix\n\nA.\n');
  });

  it('does not mistake a leading thematic break for frontmatter', async () => {
    // A document that merely OPENS with `---` had its first sections masked, and a
    // body sentence beginning `last_updated:` rewritten as metadata.
    vol.fromJSON({
      '/specs/product.md': `---\n\n# Demo\n\nThe field is documented below.\n\nlast_updated: is a reserved key in our house format.\n\n---\n\n## Feature Map\n\n### alpha\n\nProse.\n→ [features/alpha.md](features/alpha.md)\n`,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).toContain('last_updated: is a reserved key in our house format.');
    expect(after.match(/## Feature Map/g)).toHaveLength(1);
  });

  it('treats an empty ATX heading as the boundary it is', async () => {
    // `##` alone is a valid empty heading; reading it as prose swallowed — and then
    // deleted — every section after it.
    for (const marker of ['##', '#']) {
      vol.reset();
      vol.fromJSON({
        '/specs/product.md': `# Demo\n\n## Feature Map\n\nold\n\n${marker}\n\nafter this heading\n`,
        '/specs/features/alpha.md': featureSpec('alpha'),
      });

      await generateProductSpec('/specs/features', '/specs/product.md', 'p');

      const after = fs.readFileSync('/specs/product.md', 'utf-8');
      expect(after, marker).toContain(`\n${marker}\n`);
      expect(after, marker).toContain('after this heading');
    }
  });

  it('keeps a mixed-ending file mixed — only the section and last_updated may change', async () => {
    // The first CRLF fix normalized the WHOLE file, rewriting every line ending in
    // a document the splice is supposed to leave alone.
    const mixed = `---\nproduct: p\nlast_updated: 2020-01-01\n---\r\n\n# Title\n\n## Vision\n\nMine.\n\n## Feature Map\n\n### alpha\n\nAlpha desc.\n→ [features/alpha.md](features/alpha.md)\n`;
    vol.fromJSON({ '/specs/product.md': mixed, '/specs/features/alpha.md': featureSpec('alpha') });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after.match(/\r\n/g)).toHaveLength(1);
    expect(after).toContain('\n## Vision\n\nMine.\n');
    expect(after).toContain('Alpha desc.');
  });

  it('treats a setext underline as the h2 that ends the section', async () => {
    // A setext heading IS an h2; missing it ran the machine-owned region to EOF and
    // deleted every section after it once the last feature went deprecated.
    vol.fromJSON({
      '/specs/product.md': `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n### alpha\n\nAlpha desc.\n→ [features/alpha.md](features/alpha.md)\n\nTarget Users\n------------\n\n| Role | Need |\n|------|------|\n| Dev  | Fast |\n\nRoadmap\n-------\n\nQ3 stuff.\n`,
      '/specs/features/alpha.md': featureSpec('alpha', 'alpha', 'deprecated'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).toContain('| Dev  | Fast |');
    expect(after).toContain('Q3 stuff.');
    expect(after).toContain('Target Users\n------------');
    expect(after).toContain('_(No active features yet)_');
  });

  it('finds the section under every ATX heading form CommonMark allows', async () => {
    for (const heading of ['##  Feature Map', '## Feature Map ##', '  ## Feature Map']) {
      vol.reset();
      vol.fromJSON({
        '/specs/product.md': `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n${heading}\n\n### alpha\n\nAlpha desc.\n→ [features/alpha.md](features/alpha.md)\n`,
        '/specs/features/alpha.md': featureSpec('alpha'),
      });

      await generateProductSpec('/specs/features', '/specs/product.md', 'p');

      const after = fs.readFileSync('/specs/product.md', 'utf-8');
      // a heading read as absent grows a SECOND section on every run
      expect([...after.matchAll(/Feature Map/g)], heading).toHaveLength(1);
      expect(after, heading).toContain('Alpha desc.');
    }
  });

  it('does not split entries on a `###` or bind a slug from inside a fenced example', async () => {
    vol.fromJSON({
      '/specs/product.md': `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n### alpha\n\nReal description.\n\n\`\`\`markdown\n### beta\n→ [features/beta.md](features/beta.md)\n\`\`\`\n\n→ [features/alpha.md](features/alpha.md)\n`,
      '/specs/features/alpha.md': featureSpec('alpha'),
      '/specs/features/beta.md': featureSpec('beta'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    // the fenced sample stayed part of alpha's description, and beta did NOT
    // inherit it by having its slug bound from inside the fence
    expect(after).toContain('Real description.');
    expect(after).toMatch(/### beta\n\nTBD/);
  });

  it('refreshes last_updated in the frontmatter only, never a body line that looks like it', async () => {
    vol.fromJSON({
      '/specs/product.md': `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Vision\n\nlast_updated: see CHANGELOG for the real date\n\n## Feature Map\n\n_(No active features yet)_\n`,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).toContain('last_updated: see CHANGELOG for the real date');
    expect(after).toContain(`last_updated: ${today}\n---`);
  });

  it('does not add a last_updated key back into frontmatter the author trimmed', async () => {
    vol.fromJSON({
      '/specs/product.md': `---\nproduct: p\nversion: 2.0.0\n---\n\n## Feature Map\n\n_(No active features yet)_\n`,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).not.toContain('last_updated');
    expect(after).toContain('version: 2.0.0');
  });

  it('matches an entry by title when its link is missing entirely', async () => {
    vol.fromJSON({
      '/specs/product.md': `---\nproduct: p\nlast_updated: 2020-01-01\n---\n\n## Feature Map\n\n### alpha\n\nDescription with no link line at all.\n`,
      '/specs/features/alpha.md': featureSpec('alpha'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(after).toContain('Description with no link line at all.');
    expect(after).toContain('→ [features/alpha.md](features/alpha.md)');
  });
});

describe('generateProductSpec scans features deterministically (REQ-SERVICES-079)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sorts a shuffled readdir result rather than inheriting filesystem order', async () => {
    // memfs already returns lexicographic order, so only a shuffled source proves
    // the .sort() is load-bearing — without it this assertion cannot go red.
    vol.fromJSON({
      '/specs/features/alpha.md': featureSpec('alpha'),
      '/specs/features/mid.md': featureSpec('mid'),
      '/specs/features/zeta.md': featureSpec('zeta'),
    });
    // `as never` picks a lane through readdir's overload set (string[] vs Dirent[])
    vi.spyOn(fs.promises, 'readdir').mockResolvedValue(['zeta.md', 'alpha.md', 'mid.md'] as never);

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    expect([...after.matchAll(/→ \[features\/([^\]]+)\.md\]/g)].map((m) => m[1])).toEqual([
      'alpha',
      'mid',
      'zeta',
    ]);
  });

  it('sorts entries and applies the isArchivedSpec / isSafeResourceName filters', async () => {
    vol.fromJSON({
      '/specs/features/zeta.md': featureSpec('zeta'),
      '/specs/features/alpha.md': featureSpec('alpha'),
      '/specs/features/mid.md': featureSpec('mid'),
      // an archived spec left at status: active — feature-map.yaml excludes it,
      // so product.md must too, or the two indexes disagree
      '/specs/features/_archived-old.md': featureSpec('_archived-old'),
      // an unsafe slug the feature-map reader would drop on read-back
      '/specs/features/user profile.md': featureSpec('user profile'),
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');

    const after = fs.readFileSync('/specs/product.md', 'utf-8');
    const order = [...after.matchAll(/→ \[features\/([^\]]+)\.md\]/g)].map((m) => m[1]);
    expect(order).toEqual(['alpha', 'mid', 'zeta']);
    expect(after).not.toContain('_archived-old');
    expect(after).not.toContain('user profile');
  });
});

describe('generateProductSpec bootstraps a missing product.md (REQ-SPEC-013)', () => {
  it('emits every section the product-spec-format reference requires', async () => {
    vol.fromJSON({ '/specs/features/alpha.md': featureSpec('alpha') });

    await generateProductSpec('/specs/features', '/specs/product.md', 'test-project');

    const content = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(content.split('\n').filter((l) => l.startsWith('## '))).toEqual([
      '## Vision',
      '## Target Users',
      '## Feature Map',
      '## Core User Stories Summary',
      '## Product Principles',
      '## Roadmap Overview',
    ]);
    expect(content).toMatch(/^---\nproduct: test-project\nversion: TBD\nlast_updated: \d{4}-\d{2}-\d{2}\n---\n/);
    expect(content).toContain('# test-project — TBD');
  });
});

// --- scanChanges (error & edge branches) ---

describe('scanChanges error and edge branches', () => {
  afterEach(() => vi.restoreAllMocks());

  it('wraps a readdir failure in a ScanError (L75)', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat/metadata.yaml': 'status: verified\n',
    });
    vi.spyOn(fs.promises, 'readdir').mockRejectedValue(new Error('EACCES denied'));

    const err = await scanChanges('/project').catch((e) => e);
    expect(err).toBeInstanceOf(ScanError);
    expect(err.code).toBe('SCAN_ERROR');
    expect(err.message).toContain('EACCES denied');
  });

  it('stringifies a non-Error readdir rejection into the ScanError message (L75 else-side)', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat/metadata.yaml': 'status: verified\n',
    });
    vi.spyOn(fs.promises, 'readdir').mockRejectedValueOnce('boom-string');

    await expect(scanChanges('/project')).rejects.toThrow(/boom-string/);
  });

  it('skips plain files sitting directly under changes/ (L85-86 non-directory branch)', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/loose-file.txt': 'not a change dir',
      '/project/.prospec/changes/feat/metadata.yaml': 'name: feat\nstatus: verified\n',
    });

    const result = await scanChanges('/project');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('feat');
  });

  it('defaults status to "unknown" when metadata omits status (L98 ?? branch)', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat/metadata.yaml': 'name: feat\ncreated: "2026-01-01"\n',
    });

    const result = await scanChanges('/project');
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('unknown');
  });

  it('skips a change whose metadata.yaml is unparseable (L102 catch)', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/broken/metadata.yaml': ':\n  - this: [is not\n    valid yaml::',
      '/project/.prospec/changes/good/metadata.yaml': 'name: good\nstatus: verified\n',
    });

    const result = await scanChanges('/project');
    expect(result.map((c) => c.name)).toEqual(['good']);
  });
});

// --- moveToArchive (existing-target & non-Error rollback) ---

describe('moveToArchive error branches', () => {
  afterEach(() => vi.restoreAllMocks());

  it('throws WriteError when the archive directory already exists (L130-131)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    vol.fromJSON({
      '/project/.prospec/changes/feat/metadata.yaml': 'status: verified\n',
      [`/project/.prospec/archive/${today}-feat/old.md`]: 'pre-existing',
    });
    const change = {
      name: 'feat',
      dir: '/project/.prospec/changes/feat',
      metadata: { status: 'verified' },
      status: 'verified',
    };

    await expect(moveToArchive(change, '/project')).rejects.toThrow(WriteError);
    await expect(moveToArchive(change, '/project')).rejects.toThrow(/already exists/);
  });

  it('stringifies a non-Error rename rejection in the rollback message (L155 else-side)', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat/a.md': 'A',
      '/project/.prospec/changes/feat/metadata.yaml': 'status: verified\n',
    });
    const change = {
      name: 'feat',
      dir: '/project/.prospec/changes/feat',
      metadata: { status: 'verified' },
      status: 'verified',
    };
    // Reject with a non-Error value so the `String(err)` branch is taken
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce('raw-rejection');

    await expect(moveToArchive(change, '/project')).rejects.toThrow(/raw-rejection/);
  });
});

// --- generateSummary (delta-spec without REQs, quality grade) ---

describe('generateSummary additional branches', () => {
  it('keeps the no-REQ / no-module placeholders when delta-spec has no REQ headers (L194/L199)', async () => {
    vol.fromJSON({
      '/archive/delta-spec.md': '# Delta Spec\n\n## ADDED\n\nProse only, no REQ headers here.\n',
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content, affectedModules } = await generateSummary('/archive', 'feat', '2026-01-01');
    // both tables fall back to the placeholder string, not a built table
    const placeholderCount = content.split('No delta-spec.md found.').length - 1;
    expect(placeholderCount).toBe(2);
    expect(affectedModules).toHaveLength(0);
  });

  it('uses quality_grade from metadata when present (L216/L219-220)', async () => {
    vol.fromJSON({
      '/archive/metadata.yaml': 'status: verified\nquality_grade: A\n',
    });

    const { content } = await generateSummary('/archive', 'feat', '2026-01-01');
    expect(content).toContain('**Quality Grade**: A');
  });

  it('falls back to Unverified when metadata.yaml is absent (L216 else)', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/archive', { recursive: true });

    const { content } = await generateSummary('/archive', 'feat', '2026-01-01');
    expect(content).toContain('**Quality Grade**: Unverified');
  });

  it('reports "No tasks found" for an empty tasks.md (L605 total===0 && kindTotal===0)', async () => {
    vol.fromJSON({
      '/archive/tasks.md': '# Tasks\n\nNo checkbox lines at all.\n',
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content } = await generateSummary('/archive', 'feat', '2026-01-01');
    expect(content).toContain('No tasks found');
  });

  it('reports 0/0 code with kind tally when only [M]/[V] tasks exist (L606)', async () => {
    vol.fromJSON({
      '/archive/tasks.md': '- [x] T1 [M] manual step\n- [ ] T2 [V] verify step\n',
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content } = await generateSummary('/archive', 'feat', '2026-01-01');
    expect(content).toContain('0/0 code, 1/2 [M]/[V] (not counted)');
  });
});

// --- syncToFeatureSpecs (route/append/deprecate branches) ---

describe('syncToFeatureSpecs additional branches', () => {
  it('returns [] when a delta-spec exists but yields no routes (L265)', async () => {
    vol.fromJSON({
      // REQ header present but no **Feature:** field → pushCurrent never pushes
      '/archive/delta-spec.md': '# Delta\n\n## ADDED\n\n### REQ-TYPES-001: no feature field\n\nbody\n',
    });
    vol.mkdirSync('/specs/features', { recursive: true });

    const { files } = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    expect(files).toEqual([]);
    // nothing written
    expect(fs.readdirSync('/specs/features')).toEqual([]);
  });

  it('appends an ADDED REQ at end of file when no "## Edge Cases" anchor exists (L717 fallback)', async () => {
    vol.fromJSON({
      '/specs/features/sdd.md': `---
feature: sdd
status: active
last_updated: 2026-01-01
---

# sdd

## User Stories

#### REQ-TYPES-001: existing
`,
      '/archive/delta-spec.md': `# Delta

## ADDED

### REQ-TYPES-050: appended at end

**Feature:** sdd

**Description:**
body

---
`,
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd.md', 'utf-8');
    expect(content).toContain('REQ-TYPES-050: appended at end');
    // existing REQ preserved
    expect(content).toContain('REQ-TYPES-001: existing');
  });

  it('appends to an EXISTING populated Deprecated section (L745 has-section, not placeholder)', async () => {
    vol.fromJSON({
      '/specs/features/sdd.md': `---
feature: sdd
status: active
last_updated: 2026-01-01
---

# sdd

## Deprecated Requirements

- **REQ-OLD-001**: previously removed _(removed 2025-01-01)_
`,
      '/archive/delta-spec.md': `# Delta

## REMOVED

### REQ-TYPES-099: now gone

**Feature:** sdd

**Description:**
removed body

---
`,
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd.md', 'utf-8');
    // both the prior entry and the freshly appended one are present
    expect(content).toContain('REQ-OLD-001');
    expect(content).toContain('REQ-TYPES-099**: now gone');
  });

  it('appends a new Deprecated section when none exists (L753 no-section fallback)', async () => {
    vol.fromJSON({
      '/specs/features/sdd.md': `---
feature: sdd
status: active
last_updated: 2026-01-01
---

# sdd

## User Stories

#### REQ-TYPES-001: existing
`,
      '/archive/delta-spec.md': `# Delta

## REMOVED

### REQ-TYPES-077: dropped

**Feature:** sdd

**Description:**
dropped body

---
`,
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd.md', 'utf-8');
    expect(content).toContain('## Deprecated Requirements');
    expect(content).toContain('REQ-TYPES-077**: dropped');
  });

  it('falls back to append when Change History has no header separator row (L799/L801)', async () => {
    // "## Change History" heading present but no `| Date` + `|------|` rows, so
    // the in-table insertion never fires and the row is appended at EOF.
    vol.fromJSON({
      '/specs/features/sdd.md': `---
feature: sdd
status: active
last_updated: 2026-01-01
---

# sdd

#### REQ-TYPES-001: existing

## Change History

(history kept in prose)
`,
      '/archive/delta-spec.md': `# Delta

## MODIFIED

### REQ-TYPES-001: updated

**Feature:** sdd

**Description:**
new body

---
`,
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd.md', 'utf-8');
    // the row is appended (no table to insert into) and NAMES the change — the
    // negative half is what matters: a fixed placeholder passed every positive
    // assertion for as long as it existed, while identifying nothing
    expect(content).toContain('| demo-change |');
    expect(content).not.toContain('archive-sync');
    expect(content).toContain('MODIFIED REQ-TYPES-001');
  });

  it('creates a new spec carrying a REMOVED req in the Deprecated section (L826)', async () => {
    vol.fromJSON({
      '/archive/delta-spec.md': `# Delta

## REMOVED

### REQ-GONE-001: removed at creation

**Feature:** brand-new

**Description:**
gone body

---

## ADDED

### REQ-NEW-001: kept

**Feature:** brand-new

**Description:**
new body

---
`,
    });
    vol.mkdirSync('/specs/features', { recursive: true });

    const { files } = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    expect(files).toEqual(['/specs/features/brand-new.md']);
    const content = fs.readFileSync('/specs/features/brand-new.md', 'utf-8');
    // REMOVED route lands in Deprecated, not the active req list
    expect(content).toContain('## Deprecated Requirements');
    expect(content).toContain('REQ-GONE-001**: removed at creation');
    expect(content).toContain('REQ-NEW-001: kept');
    // _(None)_ placeholder is replaced since a deprecated entry exists
    expect(content).not.toContain('_(None)_');
  });
});

// --- execute (name filter, created fallbacks, knowledge warnings, skipped) ---

describe('execute additional branches', () => {
  afterEach(() => vi.restoreAllMocks());

  it('filters candidates to the requested names (L377 names branch)', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/keep/metadata.yaml': 'name: keep\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/drop/metadata.yaml': 'name: drop\nstatus: verified\ncreated: "2026-01-01"\n',
    });

    const result = await execute({ cwd: '/project', names: ['keep'] });
    expect(result.archived.map((a) => a.name)).toEqual(['keep']);
    // the unnamed verified change is left untouched in the changes dir
    expect(fs.existsSync('/project/.prospec/changes/drop')).toBe(true);
  });

  it('falls back to created_at then "unknown" for the original-created date (L403 ?? chain)', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/withCreatedAt/metadata.yaml': 'name: withCreatedAt\nstatus: verified\ncreated_at: "2026-02-02"\n',
      '/project/.prospec/changes/noDate/metadata.yaml': 'name: noDate\nstatus: verified\n',
    });

    const result = await execute({ cwd: '/project' });
    const byName = new Map(result.archived.map((a) => [a.name, a.archivePath]));

    const withCreatedAt = fs.readFileSync(`${byName.get('withCreatedAt')}/summary.md`, 'utf-8');
    expect(withCreatedAt).toContain('Original Created**: 2026-02-02');

    const noDate = fs.readFileSync(`${byName.get('noDate')}/summary.md`, 'utf-8');
    expect(noDate).toContain('Original Created**: unknown');
  });

  it('collects a change in skipped[] when moveToArchive fails (L450-451)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    vol.fromJSON({
      '/project/.prospec/changes/feat/metadata.yaml': 'name: feat\nstatus: verified\ncreated: "2026-01-01"\n',
      // archive target already present → moveToArchive throws → caught → skipped
      [`/project/.prospec/archive/${today}-feat/x.md`]: 'pre-existing',
    });

    const result = await execute({ cwd: '/project' });
    expect(result.archived).toHaveLength(0);
    expect(result.skipped).toEqual(['feat']);
  });

  it('config-less run with a delta-spec: no spec sync (L425), archive still succeeds', async () => {
    // No .prospec.yaml → featuresPath stays null → the Feature Spec sync block
    // (L425) is skipped entirely, so specFiles is empty. Archiving still succeeds
    // and rewrites the change's metadata to 'archived'.
    vol.fromJSON({
      '/project/.prospec/changes/feat/metadata.yaml': 'name: feat\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/feat/delta-spec.md': '# Delta\n\n## ADDED\n\n### REQ-TYPES-001: x\n\n**Feature:** f\n\nbody\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.archived).toHaveLength(1);
    // no config → featuresPath null → no spec sync attempted
    expect(result.specFiles).toEqual([]);
    // the archived metadata was still rewritten to 'archived' (L436 then-side)
    const archiveDir = result.archived[0]!.archivePath;
    const metaContent = fs.readFileSync(`${archiveDir}/metadata.yaml`, 'utf-8');
    expect(metaContent).toContain('status: archived');
  });
});

// --- internal helpers exercised via generateSummary / syncToFeatureSpecs ---

describe('internal helper edge branches', () => {
  it('returns N/A when the User Story section is empty (L533 else)', async () => {
    vol.fromJSON({
      '/archive/proposal.md': '# Proposal\n\n## User Story\n\n## Acceptance Criteria\n\n1. x\n',
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content } = await generateSummary('/archive', 'feat', '2026-01-01');
    // User Story block is empty → 'N/A'
    expect(content).toContain('## User Story\n\nN/A');
  });

  it('labels a REQ as UNKNOWN status when it appears before any section header (L550 else)', async () => {
    vol.fromJSON({
      '/archive/delta-spec.md': '# Delta\n\n### REQ-TYPES-001: orphan req\n\nbody\n',
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content } = await generateSummary('/archive', 'feat', '2026-01-01');
    expect(content).toContain('| REQ-TYPES-001 | UNKNOWN | orphan req |');
  });

  it('keeps only the first description for a repeated module in the module table (L573 dedupe)', async () => {
    vol.fromJSON({
      '/archive/delta-spec.md': `# Delta

## ADDED

### REQ-TYPES-001: first types req

body

### REQ-TYPES-002: second types req

body
`,
      '/archive/metadata.yaml': 'status: verified\n',
    });

    const { content, affectedModules } = await generateSummary('/archive', 'feat', '2026-01-01');
    // module 'types' collapses to a single row with the FIRST description
    expect(affectedModules).toEqual(['types']);
    const moduleTable = content.slice(
      content.indexOf('## Affected Modules'),
      content.indexOf('## Requirements'),
    );
    const typesRows = moduleTable.split('\n').filter((l) => l.startsWith('| types |'));
    expect(typesRows).toEqual(['| types | Modified | first types req |']);
  });

  it('parseFeatureSpecFrontmatter: defaults status to active when only feature is present (L895 else)', async () => {
    // Drive parseFeatureSpecFrontmatter via generateProductSpec: a spec with a
    // feature but no status line → frontmatter.status defaults to 'active',
    // so it appears in the active feature map.
    vol.fromJSON({
      '/specs/features/no-status.md': `---
feature: no-status-feature
last_updated: 2026-01-01
---

# no-status-feature
`,
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');
    const content = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(content).toContain('no-status-feature');
  });

  it('parseFeatureSpecFrontmatter: ignores a spec whose frontmatter omits feature (L891 else)', async () => {
    vol.fromJSON({
      '/specs/features/no-feature.md': `---
status: active
last_updated: 2026-01-01
---

# heading only
`,
      '/specs/features/real.md': `---
feature: real-one
status: active
last_updated: 2026-01-01
---

# real-one
`,
    });

    await generateProductSpec('/specs/features', '/specs/product.md', 'p');
    const content = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(content).toContain('real-one');
    // the feature-less spec contributes nothing to the map
    expect(content).not.toContain('no-feature');
  });
});
