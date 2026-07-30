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
 * Feature-Spec REQ bodies must survive the mechanical archive sync. The merge
 * used to rewrite a MODIFIED REQ from its delta-spec TITLE alone, deleting the
 * authored WHEN/THEN body — 12 body-less REQs in the trust zone are the residue.
 * These tests pin the non-destructive contract (REQ-SERVICES-072).
 */

const EXISTING_SPEC = `---
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
- WHEN it does not, THEN nothing happens

#### REQ-TYPES-002: second req
Second body stays put.

---

## Edge Cases

- existing edge

## Change History

| Date | Change | Impact | Refs |
|------|--------|--------|------|
`;

function deltaSpec(body: string): string {
  return `# Delta Spec\n\n${body}`;
}

const MODIFIED_WITHOUT_SPEC = deltaSpec(`## MODIFIED

### REQ-TYPES-001: updated title

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
old narrative

**After:**
new narrative

**Reason:**
because the host moved

---
`);

const MODIFIED_WITH_SPEC = deltaSpec(`## MODIFIED

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
- WHEN converged, THEN the whole block lands verbatim
- WHEN re-synced, THEN it stays byte-identical

---
`);

describe('syncToFeatureSpecs — MODIFIED never blanks an authored body', () => {
  it('preserves the existing body when the delta-spec carries no **Spec:** block', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': MODIFIED_WITHOUT_SPEC,
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    // title refreshed…
    expect(content).toContain('#### REQ-TYPES-001: updated title');
    // …body intact, every line of it
    expect(content).toContain('The original behavioural statement.');
    expect(content).toContain('- WHEN a thing happens, THEN the other thing follows');
    expect(content).toContain('- WHEN it does not, THEN nothing happens');
    // the delta-spec narrative is NOT dumped into the trust zone
    expect(content).not.toContain('**Before:**');
    expect(content).not.toContain('old narrative');
    // and the gap is reported, not silent
    expect(result.pendingConvergence).toEqual([
      expect.objectContaining({ feature: 'sdd-workflow', reqId: 'REQ-TYPES-001' }),
    ]);
    expect(result.pendingConvergence[0]!.reason).toContain('**Spec:**');
  });

  it('lands the **Spec:** block verbatim when the delta-spec carries one', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': MODIFIED_WITH_SPEC,
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('#### REQ-TYPES-001: updated title');
    expect(content).toContain('The converged behavioural statement.');
    expect(content).toContain('- WHEN converged, THEN the whole block lands verbatim');
    expect(content).toContain('- WHEN re-synced, THEN it stays byte-identical');
    // superseded body is gone (that is what a Spec block MEANS)
    expect(content).not.toContain('The original behavioural statement.');
    // untouched sibling REQ keeps its body
    expect(content).toContain('Second body stays put.');
    expect(result.pendingConvergence).toEqual([]);
  });

  // The Description/Acceptance-Criteria fallback is ADDED-only: for MODIFIED it is
  // change narrative, and landing it would overwrite the authored behavior
  // statement with planning prose — silently, since a non-empty body suppresses
  // the report. This shape occurs in real archived delta-specs.
  it('preserves the body when a MODIFIED entry carries Description/AC but no **Spec:** block', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': deltaSpec(`## MODIFIED

### REQ-TYPES-001: updated title

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
old narrative

**After:**
new narrative

**Reason:**
because the host moved

**Description:**
Planning prose that is NOT a behavior spec.

**Acceptance Criteria:**
1. some verifiable condition
2. another one

**Priority:** High

---
`),
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('The original behavioural statement.');
    expect(content).toContain('- WHEN a thing happens, THEN the other thing follows');
    expect(content).not.toContain('Planning prose that is NOT a behavior spec.');
    expect(content).not.toContain('- some verifiable condition');
    expect(result.pendingConvergence).toEqual([
      expect.objectContaining({ reqId: 'REQ-TYPES-001' }),
    ]);
    expect(result.pendingConvergence[0]!.reason).toContain('**Spec:**');
  });

  it('never leaves a MODIFIED REQ body-less (regression: title-only rewrite)', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': MODIFIED_WITHOUT_SPEC,
    });

    await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    const lines = content.split('\n');
    const header = lines.findIndex((l) => l.startsWith('#### REQ-TYPES-001:'));
    expect(header).toBeGreaterThan(-1);
    let next = header + 1;
    while (next < lines.length && lines[next]!.trim() === '') next++;
    // the line after the header must be body text, not the next heading/rule
    expect(lines[next]).not.toMatch(/^#{2,4}\s/);
    expect(lines[next]!.trim()).not.toBe('---');
  });
});

describe('syncToFeatureSpecs — ADDED lands a body', () => {
  it('lands Description + Acceptance Criteria when no **Spec:** block is given', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': deltaSpec(`## ADDED

### REQ-TYPES-050: freshly added

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
Landing description sentence.

**Acceptance Criteria:**
1. first criterion
2. second criterion

**Priority:** High

---
`),
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('#### REQ-TYPES-050: freshly added');
    expect(content).toContain('Landing description sentence.');
    expect(content).toContain('- first criterion');
    expect(content).toContain('- second criterion');
    // Priority is delta-spec bookkeeping, not spec body
    expect(content).not.toContain('**Priority:**');
    expect(result.pendingConvergence).toEqual([]);
  });

  it('reports an ADDED REQ that carries no body at all instead of silently landing a title', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': deltaSpec(`## ADDED

### REQ-TYPES-051: bodyless

**Feature:** sdd-workflow
**Story:** US-1

---
`),
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('#### REQ-TYPES-051: bodyless');
    expect(result.pendingConvergence).toEqual([
      expect.objectContaining({ feature: 'sdd-workflow', reqId: 'REQ-TYPES-051' }),
    ]);
  });

  it('lands a **Spec:** block on a brand-new feature spec too', async () => {
    vol.mkdirSync('/specs/features', { recursive: true });
    vol.fromJSON({
      '/archive/delta-spec.md': deltaSpec(`## ADDED

### REQ-NEW-001: created with a body

**Feature:** brand-new
**Story:** US-1

**Spec:**
Brand-new behaviour statement.
- WHEN the spec file does not exist yet, THEN the body still lands

---
`),
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/brand-new.md', 'utf-8');

    expect(content).toContain('#### REQ-NEW-001: created with a body');
    expect(content).toContain('Brand-new behaviour statement.');
    expect(content).toContain('- WHEN the spec file does not exist yet, THEN the body still lands');
    expect(result.pendingConvergence).toEqual([]);
  });
});

describe('syncToFeatureSpecs — body boundaries', () => {
  it('preserves a body when the REQ is the last h4 before an h2', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# sdd-workflow

#### REQ-TYPES-001: original title
Body before the h2.
- WHEN the next heading is an h2, THEN the body is still bounded

## Edge Cases

- existing edge
`,
      '/archive/delta-spec.md': MODIFIED_WITHOUT_SPEC,
    });

    await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('Body before the h2.');
    expect(content).toContain('- WHEN the next heading is an h2, THEN the body is still bounded');
    expect(content).toContain('## Edge Cases');
    expect(content).toContain('- existing edge');
  });

  it('preserves a body when the REQ is followed by a --- rule', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# sdd-workflow

#### REQ-TYPES-001: original title
Body before the rule.

---

## Edge Cases

- existing edge
`,
      '/archive/delta-spec.md': MODIFIED_WITHOUT_SPEC,
    });

    await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('Body before the rule.');
    expect(content).toContain('## Edge Cases');
  });

  it('preserves a body when the REQ is the last thing in the file', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# sdd-workflow

#### REQ-TYPES-001: original title
Body at EOF.
- WHEN nothing follows, THEN the body is not swallowed
`,
      '/archive/delta-spec.md': MODIFIED_WITHOUT_SPEC,
    });

    await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('Body at EOF.');
    expect(content).toContain('- WHEN nothing follows, THEN the body is not swallowed');
  });

  // The ADDED path inserts through `content.replace(insertBefore, …)`, so THIS is
  // where a `$&` in the landed body would expand into the matched heading. The
  // MODIFIED path splices lines and never touches a replacement API.
  it('lands $-sequences in an ADDED **Spec:** body literally (function replacer, not a pattern)', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': deltaSpec(`## ADDED

### REQ-TYPES-060: price handling

**Feature:** sdd-workflow
**Story:** US-1

**Spec:**
Prices render $& and $\` and $$ and $1 literally.
- WHEN the body carries a replacement pattern, THEN it lands verbatim

---
`),
    });

    await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('Prices render $& and $` and $$ and $1 literally.');
    expect(content).not.toContain('Prices render ## Edge Cases');
    expect(content).toContain('## Edge Cases');
  });

  it('lands $-sequences in a MODIFIED **Spec:** body verbatim', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': deltaSpec(`## MODIFIED

### REQ-TYPES-001: price handling

**Feature:** sdd-workflow
**Story:** US-1

**Spec:**
Prices render $& and $\` and $$ and $1 literally.
- WHEN the body carries a replacement pattern, THEN it lands verbatim

---
`),
    });

    await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('Prices render $& and $` and $$ and $1 literally.');
  });

  // A `**Spec:**` block that is the entry's LAST block must not swallow whatever
  // markdown follows it. Landed foreign headings are permanent: the injected h2
  // becomes the in-place replacement's own stop boundary, so no later sync can
  // remove it.
  it('stops a **Spec:** block at the next heading, so foreign sections never land', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': deltaSpec(`## MODIFIED

### REQ-TYPES-001: updated title

**Feature:** sdd-workflow
**Story:** US-1

**Spec:**
The converged behavioural statement.
- WHEN converged, THEN only this block lands

## Requirement Traceability

| REQ | Task |
|-----|------|
| REQ-TYPES-001 | T1 |

FOREIGN-TAIL-MARKER
`),
    });

    await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('The converged behavioural statement.');
    expect(content).toContain('- WHEN converged, THEN only this block lands');
    expect(content).not.toContain('## Requirement Traceability');
    expect(content).not.toContain('FOREIGN-TAIL-MARKER');
    expect(content).not.toContain('| REQ-TYPES-001 | T1 |');
  });

  it('stops a **Spec:** block at an unfilled `### REQ-[MODULE]-NNN` template heading', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': deltaSpec(`## MODIFIED

### REQ-TYPES-001: updated title

**Feature:** sdd-workflow
**Story:** US-1

**Spec:**
The converged behavioural statement.

### REQ-[MODULE]-001: [Requirement title]

[Fill in the requirement body here]
`),
    });

    await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('The converged behavioural statement.');
    expect(content).not.toContain('REQ-[MODULE]-001');
    expect(content).not.toContain('{feature-slug}');
  });
});

describe('syncToFeatureSpecs — REMOVED leaves the active section for a human', () => {
  it('reports a deprecated REQ whose active section still carries its old body', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': deltaSpec(`## REMOVED

### REQ-TYPES-002: second req

**Feature:** sdd-workflow
**Story:** US-1

**Reason:**
The host command no longer exists.

---
`),
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    // deprecation is append-only, so the stale active section survives …
    expect(content).toContain('#### REQ-TYPES-002: second req');
    expect(content).toContain('Second body stays put.');
    // … which is exactly why it must appear on the worklist
    expect(result.pendingConvergence).toEqual([
      expect.objectContaining({ feature: 'sdd-workflow', reqId: 'REQ-TYPES-002' }),
    ]);
    expect(result.pendingConvergence[0]!.reason).toContain('deprecated');
  });

  it('reports nothing for a REMOVED REQ that has no active section', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': deltaSpec(`## REMOVED

### REQ-TYPES-999: never existed here

**Feature:** sdd-workflow
**Story:** US-1

**Reason:**
Already gone.

---
`),
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features');
    expect(result.pendingConvergence).toEqual([]);
  });
});

describe('syncToFeatureSpecs — dry-run honesty', () => {
  it('reports pendingConvergence under dry-run and writes nothing', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': MODIFIED_WITHOUT_SPEC,
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features', true);

    expect(result.pendingConvergence).toEqual([
      expect.objectContaining({ reqId: 'REQ-TYPES-001' }),
    ]);
    expect(result.files).toEqual(['/specs/features/sdd-workflow.md']);
    // byte-identical: dry-run touches nothing
    expect(fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8')).toBe(EXISTING_SPEC);
  });
});
