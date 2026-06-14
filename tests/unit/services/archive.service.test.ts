import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
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
    expect(content).toContain('N/A');
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

  it('should not fail archive when config is missing (no spec files)', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\ncreated: "2026-01-01"\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.archived).toHaveLength(1);
    expect(result.specFiles).toHaveLength(0);
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

    const files = await syncToFeatureSpecs('/archive', '/specs/features');

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

    await syncToFeatureSpecs('/archive', '/specs/features');
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

    await syncToFeatureSpecs('/archive', '/specs/features');
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

    const files = await syncToFeatureSpecs('/archive', '/specs/features');

    // the traversal slug is skipped entirely — nothing escapes the features dir
    expect(fs.existsSync('/evil.md')).toBe(false);
    expect(files.some((f) => f.includes('evil'))).toBe(false);
    // the legitimate sibling route is still synced
    expect(fs.existsSync('/specs/features/safe-feature.md')).toBe(true);
  });

  it('should return empty array when no delta-spec exists', async () => {
    vol.fromJSON({});
    vol.mkdirSync('/archive', { recursive: true });

    const files = await syncToFeatureSpecs('/archive', '/specs/features');
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

    await syncToFeatureSpecs('/archive', '/specs/features');
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

    await syncToFeatureSpecs('/archive', '/specs/features');
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

    const files = await syncToFeatureSpecs('/archive', '/specs/features');

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

    expect(result).toBe('/specs/product.md');
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
});
