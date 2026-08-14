import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { syncToFeatureSpecs } from '../../../src/services/archive.service.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

/**
 * The graduation Change History row follows whichever file carries the section —
 * the mother file, or a slice it was moved into to keep an over-budget mother file
 * within budget. No host anywhere is a loud, non-blocking finding, never a silent
 * drop (REQ-SERVICES-018).
 */

const US_1_SLICE = `### US-1: existing story

#### REQ-TYPES-001: original title
The original behavioural statement.
- WHEN a thing happens, THEN the other thing follows
`;

const CHANGE_HISTORY_TABLE = `## Change History

| Date | Change | Impact | Refs |
|------|--------|--------|------|
`;

const MODIFIED_DELTA = `# Delta Spec

## MODIFIED

### REQ-TYPES-001: updated title

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
old narrative

**After:**
new narrative

**Reason:**
because the host moved

**Spec:**
The converged behavioural statement.
- WHEN converged, THEN it lands in its host

**Dropped:**
- WHEN a thing happens, THEN the other thing follows

---
`;

describe('syncToFeatureSpecs — Change History host routing', () => {
  it('appends the row to the slice that carries the section, leaving the mother body untouched', async () => {
    const mother = `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
story_count: 1
req_count: 1
---

# sdd-workflow

## Slices

- [US-1](./sdd-workflow/us-1.md)
- [Change History](./sdd-workflow/change-history.md)

## Edge Cases

- existing edge
`;
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': mother,
      '/specs/features/sdd-workflow/us-1.md': US_1_SLICE,
      '/specs/features/sdd-workflow/change-history.md': CHANGE_HISTORY_TABLE,
      '/archive/delta-spec.md': MODIFIED_DELTA,
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');

    const historySlice = fs.readFileSync('/specs/features/sdd-workflow/change-history.md', 'utf-8');
    expect(historySlice).toContain('demo-change');
    expect(historySlice).toContain('REQ-TYPES-001');
    expect(result.files).toContain('/specs/features/sdd-workflow/change-history.md');
    expect(result.missingChangeHistory).toEqual([]);

    // The row went to the slice, not the mother file — the mother's body is only
    // frontmatter-bumped, so it still carries no Change History and no new row.
    const motherAfter = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');
    expect(motherAfter).not.toContain('## Change History');
    expect(motherAfter).not.toContain('demo-change');
    expect(motherAfter).toContain('## Slices');
    expect(motherAfter).toContain('- existing edge');

    // The REQ update still landed in its own slice.
    const reqSlice = fs.readFileSync('/specs/features/sdd-workflow/us-1.md', 'utf-8');
    expect(reqSlice).toContain('WHEN converged, THEN it lands in its host');
  });

  it('surfaces a loud finding when no file carries a Change History section', async () => {
    const spec = `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# sdd-workflow

## User Stories

### US-1: existing story

#### REQ-TYPES-001: original title
The original behavioural statement.
- WHEN a thing happens, THEN the other thing follows

---

## Edge Cases

- existing edge
`;
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': spec,
      '/archive/delta-spec.md': MODIFIED_DELTA,
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');

    expect(result.missingChangeHistory).toHaveLength(1);
    expect(result.missingChangeHistory[0]!.feature).toBe('sdd-workflow');
    expect(result.missingChangeHistory[0]!.changeName).toBe('demo-change');
    expect(result.missingChangeHistory[0]!.reqIds).toContain('REQ-TYPES-001');

    // Non-blocking: the REQ body still landed; only the provenance row could not.
    const after = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');
    expect(after).toContain('WHEN converged, THEN it lands in its host');
    expect(after).not.toContain('## Change History');
    expect(after).not.toContain('demo-change');
  });

  it('still appends to the mother file when the section stays there (regression)', async () => {
    const mother = `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
story_count: 1
req_count: 1
---

# sdd-workflow

## Slices

- [US-1](./sdd-workflow/us-1.md)

## Edge Cases

- existing edge

${CHANGE_HISTORY_TABLE}`;
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': mother,
      '/specs/features/sdd-workflow/us-1.md': US_1_SLICE,
      '/archive/delta-spec.md': MODIFIED_DELTA,
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');

    const motherAfter = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');
    expect(motherAfter).toContain('## Change History');
    expect(motherAfter).toContain('demo-change');
    expect(result.missingChangeHistory).toEqual([]);
    expect(result.files).toContain('/specs/features/sdd-workflow.md');
    expect(result.files).toContain('/specs/features/sdd-workflow/us-1.md');

    const reqSlice = fs.readFileSync('/specs/features/sdd-workflow/us-1.md', 'utf-8');
    expect(reqSlice).toContain('WHEN converged, THEN it lands in its host');
  });
});
