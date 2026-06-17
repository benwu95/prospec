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

// Isolate archive's wiring from the raw-scan internals (scanDir/template) — the
// archive safety net's contract is "call generateRawScan, non-fatally".
vi.mock('../../../src/services/raw-scan.service.js', () => ({
  generateRawScan: vi.fn().mockResolvedValue({
    totalFiles: 0,
    scanDepth: 10,
    techStack: { language: 'typescript' },
    entryPoints: [],
    dependencies: [],
    configFiles: [],
    outputFile: 'prospec/ai-knowledge/raw-scan.md',
    dryRun: false,
    files: [],
  }),
}));

// Isolate archive's auto knowledge-update wiring. The real service needs a full
// knowledge tree; archive's contract is "call it non-fatally and forward its
// warnings". Default to rejecting so the un-asserting execute tests keep the
// same observable result (knowledgeUpdated stays false, as with the real
// service which fails without a knowledge tree).
vi.mock('../../../src/services/knowledge-update.service.js', () => ({
  execute: vi.fn().mockRejectedValue(new Error('no knowledge tree')),
}));

import { generateRawScan } from '../../../src/services/raw-scan.service.js';
import { execute as executeKnowledgeUpdate } from '../../../src/services/knowledge-update.service.js';

beforeEach(() => {
  vol.reset();
  vi.mocked(generateRawScan).mockClear();
  vi.mocked(executeKnowledgeUpdate).mockReset();
  vi.mocked(executeKnowledgeUpdate).mockRejectedValue(new Error('no knowledge tree'));
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

  it('refreshes raw-scan.md after archiving (deterministic safety net)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/feat-a/proposal.md': '# Proposal\n\n## User Story\n\nAs a dev, I want X.\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.archived).toHaveLength(1);
    expect(result.rawScanRefreshed).toBe(true);
    expect(vi.mocked(generateRawScan)).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/project' }),
    );
  });

  it('does not run raw-scan refresh when nothing was archived', async () => {
    vol.fromJSON({
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: tasks\ncreated: "2026-01-01"\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.archived).toHaveLength(0);
    expect(result.rawScanRefreshed).toBe(false);
    expect(vi.mocked(generateRawScan)).not.toHaveBeenCalled();
  });

  it('treats a raw-scan refresh failure as non-fatal (archive still succeeds)', async () => {
    vi.mocked(generateRawScan).mockRejectedValueOnce(new Error('scan boom'));
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
      '/project/.prospec/changes/feat-a/metadata.yaml': 'name: feat-a\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/feat-a/proposal.md': '# Proposal\n\n## User Story\n\nAs a dev, I want X.\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.archived).toHaveLength(1);
    expect(result.rawScanRefreshed).toBe(false);
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
    expect(result).toBe('/specs/product.md');
    const content = fs.readFileSync('/specs/product.md', 'utf-8');
    expect(content).toContain('_(No active features yet)_');
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

    const files = await syncToFeatureSpecs('/archive', '/specs/features');
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

    await syncToFeatureSpecs('/archive', '/specs/features');
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

    await syncToFeatureSpecs('/archive', '/specs/features');
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

    await syncToFeatureSpecs('/archive', '/specs/features');
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

    await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd.md', 'utf-8');
    // the archive-sync row is appended (no table to insert into)
    expect(content).toContain('| archive-sync |');
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

    const files = await syncToFeatureSpecs('/archive', '/specs/features');
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

  it('forwards knowledge-update warnings and sets knowledgeUpdated (L478-479)', async () => {
    vi.mocked(executeKnowledgeUpdate).mockResolvedValueOnce({
      created: [],
      updated: ['types'],
      deprecated: [],
      generatedFiles: [],
      warnings: ['malformed REQ id: REQ-bad'],
    });
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: p\n',
      '/project/.prospec/changes/feat/metadata.yaml': 'name: feat\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/feat/delta-spec.md': '# Delta\n\n## ADDED\n\n### REQ-TYPES-001: x\n\nbody\n',
    });

    const result = await execute({ cwd: '/project' });
    expect(result.knowledgeUpdated).toBe(true);
    expect(result.knowledgeWarnings).toContain('malformed REQ id: REQ-bad');
  });

  it('leaves knowledgeUpdated false when no archived change has a delta-spec (L470/L473)', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: p\n',
      '/project/.prospec/changes/feat/metadata.yaml': 'name: feat\nstatus: verified\ncreated: "2026-01-01"\n',
    });

    const result = await execute({ cwd: '/project' });
    expect(result.archived).toHaveLength(1);
    expect(result.knowledgeUpdated).toBe(false);
    expect(result.knowledgeWarnings).toEqual([]);
    expect(vi.mocked(executeKnowledgeUpdate)).not.toHaveBeenCalled();
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
    // nothing archived → raw-scan refresh not triggered
    expect(result.rawScanRefreshed).toBe(false);
  });

  it('config-less run with a delta-spec: no spec sync (L425), but knowledge-update still fires off the delta-spec (L473)', async () => {
    // No .prospec.yaml → featuresPath stays null → the Feature Spec sync block
    // (L425) is skipped entirely, so specFiles is empty. The knowledge-update
    // safety net, however, keys off the archived change carrying a delta-spec
    // (L473), independent of config — so it IS invoked here, in contrast to the
    // no-delta-spec sibling test where executeKnowledgeUpdate is never called.
    // The mock rejects, so knowledgeUpdated stays false (non-fatal).
    vol.fromJSON({
      '/project/.prospec/changes/feat/metadata.yaml': 'name: feat\nstatus: verified\ncreated: "2026-01-01"\n',
      '/project/.prospec/changes/feat/delta-spec.md': '# Delta\n\n## ADDED\n\n### REQ-TYPES-001: x\n\n**Feature:** f\n\nbody\n',
    });

    const result = await execute({ cwd: '/project' });

    expect(result.archived).toHaveLength(1);
    // no config → featuresPath null → no spec sync attempted
    expect(result.specFiles).toEqual([]);
    // delta-spec present → knowledge-update attempted despite missing config
    const archiveDir = result.archived[0]!.archivePath;
    expect(vi.mocked(executeKnowledgeUpdate)).toHaveBeenCalledWith(
      expect.objectContaining({ deltaSpecPath: `${archiveDir}/delta-spec.md`, cwd: '/project' }),
    );
    // mock rejected → non-fatal → knowledgeUpdated stays false, archive succeeds
    expect(result.knowledgeUpdated).toBe(false);
    // the archived metadata was still rewritten to 'archived' (L436 then-side)
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
