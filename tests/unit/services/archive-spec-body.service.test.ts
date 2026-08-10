import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import {
  syncToFeatureSpecs,
  recountFeatureSpecCounters,
} from '../../../src/services/archive.service.js';
import { readSpecCounters } from '../../../src/lib/spec-headings.js';

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

**Dropped:**
- WHEN a thing happens, THEN the other thing follows
- WHEN it does not, THEN nothing happens
- WHEN replaced, THEN this bullet is superseded

---
`);
// ^ This one fixture is reused against two different existing bodies, so the
// declaration names the superseded bullets of BOTH. Whichever body it meets, the
// bullets belonging to the other are simply stale declarations — reported, never
// blocking, which is exactly the behaviour that lets one fixture serve both.

describe('syncToFeatureSpecs — MODIFIED never blanks an authored body', () => {
  it('preserves the existing body when the delta-spec carries no **Spec:** block', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': MODIFIED_WITHOUT_SPEC,
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('#### REQ-TYPES-051: bodyless');
    expect(result.pendingConvergence).toEqual([
      expect.objectContaining({ feature: 'sdd-workflow', reqId: 'REQ-TYPES-051' }),
    ]);
  });

  // A created spec used to declare `story_count` from the route list while its
  // body carried no story heading at all — so the very first `archive finalize`
  // had to refuse (it will not zero a declared counter) and `spec-counters`
  // warned forever. The counters are now derived from the rendered body.
  it('creates a spec whose declared counters its own body can confirm', async () => {
    vol.mkdirSync('/specs/features', { recursive: true });
    vol.fromJSON({
      '/archive/delta-spec.md': deltaSpec(`## ADDED

### REQ-NEW-001: first

**Feature:** brand-new
**Story:** US-1

**Spec:**
Statement one.
- WHEN x, THEN y

---

### REQ-NEW-002: second

**Feature:** brand-new
**Story:** US-2

**Spec:**
Statement two.
- WHEN p, THEN q

---
`),
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/brand-new.md', 'utf-8');

    // the stories the REQs are routed to are real headings, and group their REQs
    expect(content).toContain('### US-1');
    expect(content).toContain('### US-2');
    expect(content.indexOf('### US-2')).toBeGreaterThan(content.indexOf('#### REQ-NEW-001'));
    // declared == what the body holds, by construction
    const counters = readSpecCounters(content)!;
    expect(counters.declared).toEqual(counters.actual);
    expect(counters.actual).toEqual({ story_count: 2, req_count: 2 });
    // …so the first finalize reconciles instead of refusing
    const recount = recountFeatureSpecCounters(content)!;
    expect(recount.refusal).toBeUndefined();
    expect(recount.changed).toBe(false);
  });

  // Derivation vs the route list only diverge when a story label is not a `US-`
  // heading — with every label conforming, `stories.length` and the body agree and
  // the regression is invisible.
  it('derives a created spec\'s counters from the body, not from the route list', async () => {
    vol.mkdirSync('/specs/features', { recursive: true });
    vol.fromJSON({
      '/archive/delta-spec.md': deltaSpec(`## ADDED

### REQ-NEW-003: free-text story label

**Feature:** loose-labels
**Story:** Tagging flow

**Spec:**
Statement.
- WHEN x, THEN y

---
`),
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/loose-labels.md', 'utf-8');

    // the label lands as a heading, but it is not a `US-` story…
    expect(content).toContain('### Tagging flow');
    // …so the declared counter says 0, matching what the body actually holds
    expect(content).toContain('story_count: 0');
    const counters = readSpecCounters(content)!;
    expect(counters.declared).toEqual(counters.actual);
    expect(recountFeatureSpecCounters(content)!.refusal).toBeUndefined();
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

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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

**Dropped:**
- WHEN a thing happens, THEN the other thing follows
- WHEN it does not, THEN nothing happens

---
`),
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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

**Dropped:**
- WHEN a thing happens, THEN the other thing follows
- WHEN it does not, THEN nothing happens

---
`),
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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


**Dropped:**
- WHEN a thing happens, THEN the other thing follows
- WHEN it does not, THEN nothing happens

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

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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


**Dropped:**
- WHEN a thing happens, THEN the other thing follows
- WHEN it does not, THEN nothing happens

**Spec:**
The converged behavioural statement.

### REQ-[MODULE]-001: [Requirement title]

[Fill in the requirement body here]
`),
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
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

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    expect(result.pendingConvergence).toEqual([]);
  });
});

/**
 * The merge used to identify an existing REQ by the literal string
 * `#### {id}:`, so a spec whose REQs sit at h3 fell through to the ADDED
 * branch: a second section with the same id was appended while the original
 * kept its superseded body — two contradicting specs for one REQ, reported by
 * neither worklist (issue #138). Heading level is now data, not an assumption.
 */
const H3_SPEC = `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# sdd-workflow

## User Stories

### REQ-TYPES-001: original title {#req-types-001}
The original behavioural statement.
- WHEN a thing happens, THEN the other thing follows
- WHEN it does not, THEN nothing happens

### REQ-TYPES-002: second req
Second body stays put.

---

## Edge Cases

- existing edge

## Change History

| Date | Change | Impact | Refs |
|------|--------|--------|------|
`;

function headingsFor(content: string, reqId: string): string[] {
  return content.split('\n').filter((l) => /^#{1,6}\s/.test(l) && l.includes(reqId));
}

describe('syncToFeatureSpecs — REQ heading level is data, not an assumption', () => {
  it('merges a MODIFIED REQ in place at its own h3 level instead of duplicating it', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': H3_SPEC,
      '/archive/delta-spec.md': MODIFIED_WITH_SPEC,
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    // exactly one heading carries the id, and it kept the file's own level
    expect(headingsFor(content, 'REQ-TYPES-001')).toEqual(['### REQ-TYPES-001: updated title']);
    expect(content).toContain('The converged behavioural statement.');
    expect(content).not.toContain('The original behavioural statement.');
    // the sibling h3 REQ is untouched
    expect(content).toContain('### REQ-TYPES-002: second req');
    expect(content).toContain('Second body stays put.');
    // and the behavior the block dropped is still reported — as an acknowledged
    // drop, because this fixture declares it deliberate (REQ-SERVICES-083)
    expect(result.acknowledgedDrops).toEqual([
      expect.objectContaining({ reqId: 'REQ-TYPES-001' }),
    ]);
    expect(result.droppedBehavior).toEqual([]);
  });

  it('preserves an h3 REQ body when the delta-spec carries no **Spec:** block', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': H3_SPEC,
      '/archive/delta-spec.md': MODIFIED_WITHOUT_SPEC,
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(headingsFor(content, 'REQ-TYPES-001')).toEqual(['### REQ-TYPES-001: updated title']);
    expect(content).toContain('The original behavioural statement.');
    expect(content).toContain('- WHEN it does not, THEN nothing happens');
    expect(result.pendingConvergence).toEqual([
      expect.objectContaining({ reqId: 'REQ-TYPES-001' }),
    ]);
  });

  it('reports a deprecated h3 REQ whose active section still stands', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': H3_SPEC,
      '/archive/delta-spec.md': deltaSpec(`## REMOVED

### REQ-TYPES-002: second req

**Feature:** sdd-workflow
**Story:** US-1

**Reason:**
The host command no longer exists.

---
`),
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(content).toContain('### REQ-TYPES-002: second req');
    expect(result.pendingConvergence).toEqual([
      expect.objectContaining({ reqId: 'REQ-TYPES-002' }),
    ]);
    expect(result.pendingConvergence[0]!.reason).toContain('deprecated');
  });

  it('inserts an ADDED REQ at the format-mandated h4 even in an h3 spec', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': H3_SPEC,
      '/archive/delta-spec.md': deltaSpec(`## ADDED

### REQ-TYPES-050: freshly added

**Feature:** sdd-workflow
**Story:** US-1

**Spec:**
Landed statement.
- WHEN added, THEN the body lands

---
`),
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(headingsFor(content, 'REQ-TYPES-050')).toEqual(['#### REQ-TYPES-050: freshly added']);
  });
});

/**
 * These pin the SKIP boundary, so the landing body must be non-empty — with an
 * empty body `skipping` never turns on and the boundary code is not executed at
 * all. The six boundary cases used to run with a bodyless MODIFIED route and
 * stayed green while `|| line.trim() === '---'` was deleted outright.
 */
describe('syncToFeatureSpecs — the replaced body stops at its boundary', () => {
  const spec = (level: '###' | '####', tail: string): string => `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# sdd-workflow

${level} REQ-TYPES-001: original title
Body that IS superseded.
- WHEN replaced, THEN this bullet is superseded
${tail}`;

  const expectBounded = (content: string): void => {
    // the block landed…
    expect(content).toContain('The converged behavioural statement.');
    // …the REQ's own body was consumed…
    expect(content).not.toContain('Body that IS superseded.');
    // …and nothing past the boundary was eaten
    expect(content).toContain('## Edge Cases');
    expect(content).toContain('- existing edge');
  };

  for (const level of ['###', '####'] as const) {
    it(`stops at an h2 when the REQ is the last ${level} before it`, async () => {
      vol.fromJSON({
        '/specs/features/sdd-workflow.md': spec(level, '\n## Edge Cases\n\n- existing edge\n'),
        '/archive/delta-spec.md': MODIFIED_WITH_SPEC,
      });
      await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
      expectBounded(fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8'));
    });

    it(`stops at a --- rule following an ${level} REQ`, async () => {
      vol.fromJSON({
        '/specs/features/sdd-workflow.md': spec(level, '\n---\n\n## Edge Cases\n\n- existing edge\n'),
        '/archive/delta-spec.md': MODIFIED_WITH_SPEC,
      });
      await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
      const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');
      expectBounded(content);
      // Count the rules: the two frontmatter fences plus THIS one. `toMatch(/^---$/m)`
      // was satisfied by the fences alone and stayed green when the boundary was
      // deleted outright.
      expect(content.split('\n').filter((l) => l.trim() === '---')).toHaveLength(3);
    });

    it(`stops at EOF when the ${level} REQ is the last thing in the file`, async () => {
      vol.fromJSON({
        '/specs/features/sdd-workflow.md': spec(level, ''),
        '/archive/delta-spec.md': MODIFIED_WITH_SPEC,
      });
      await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
      const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');
      expect(content).toContain('The converged behavioural statement.');
      expect(content).not.toContain('Body that IS superseded.');
    });

    it(`stops at a SIBLING REQ heading, whatever its level, after an ${level} REQ`, async () => {
      // The sync's own ADDED path inserts at h4, so an h3 REQ followed by an h4
      // REQ is a shape it creates itself. A level-only boundary swallowed that
      // sibling — heading, body and all — and deleted a REQ from the trust zone.
      vol.fromJSON({
        '/specs/features/sdd-workflow.md': spec(
          level,
          '\n#### REQ-TYPES-050: a deeper sibling REQ\nSibling body that must survive.\n- WHEN sibling, THEN kept\n\n## Edge Cases\n\n- existing edge\n',
        ),
        '/archive/delta-spec.md': MODIFIED_WITH_SPEC,
      });
      await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
      const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');
      expectBounded(content);
      expect(content).toContain('#### REQ-TYPES-050: a deeper sibling REQ');
      expect(content).toContain('Sibling body that must survive.');
      expect(content).toContain('- WHEN sibling, THEN kept');
    });
  }

  it('keeps a nested non-REQ subsection inside the body it replaces', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': spec(
        '###',
        '\n#### A nested subsection\nnested prose\n\n## Edge Cases\n\n- existing edge\n',
      ),
      '/archive/delta-spec.md': MODIFIED_WITH_SPEC,
    });
    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');
    // a non-REQ subsection IS part of the REQ's body, so the replacement takes it
    expect(content).not.toContain('nested prose');
    expectBounded(content);
  });

  it('bounds an h1-level REQ at the document sections it must never eat', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# REQ-TYPES-001: original title
Body that IS superseded.

## Edge Cases

- existing edge

## Change History

| Date | Change | Impact | Refs |
|------|--------|--------|------|
`,
      '/archive/delta-spec.md': MODIFIED_WITH_SPEC,
    });
    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');
    expectBounded(content);
    expect(content).toContain('## Change History');
    expect(content).toContain('| Date | Change | Impact | Refs |');
  });
});

/**
 * A spec the h4-only merge already corrupted carries the same REQ id twice. The
 * fix must not compound it: one section is merged, the other is left exactly as
 * written and reported, because deleting authored text is not this sync's call.
 */
describe('syncToFeatureSpecs — a pre-existing duplicate id is reported, not compounded', () => {
  // Declares the bullet THIS fixture supersedes, so the write is released and both
  // reports — the duplication and the drop — can be observed on the same run.
  const MODIFIED_DECLARING_WHEN_A = MODIFIED_WITH_SPEC.replace(
    '**Dropped:**',
    '**Dropped:**\n- WHEN a, THEN b',
  );

  it('merges the first section only and reports the rest', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# sdd-workflow

### REQ-TYPES-001: original h3
Original body.
- WHEN a, THEN b

## Edge Cases

- existing edge

#### REQ-TYPES-001: duplicate appended by the old defect
Duplicate body.
- WHEN a, THEN b
`,
      '/archive/delta-spec.md': MODIFIED_DECLARING_WHEN_A,
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    // the landing body lands ONCE
    expect(content.split('The converged behavioural statement.')).toHaveLength(2);
    // the duplicate keeps its own heading level and its own text
    expect(content).toContain('#### REQ-TYPES-001: duplicate appended by the old defect');
    expect(content).toContain('Duplicate body.');
    // and the duplication is on the worklist rather than silently merged away
    expect(result.pendingConvergence).toEqual([
      expect.objectContaining({ reqId: 'REQ-TYPES-001' }),
    ]);
    expect(result.pendingConvergence[0]!.reason).toMatch(/duplicat/i);
    // BOTH reports are due: the duplication AND whatever the landing block
    // dropped from the section it did replace. Returning only the first swallowed
    // the authored bullets that just left the trust zone.
    expect(result.acknowledgedDrops).toEqual([
      expect.objectContaining({
        reqId: 'REQ-TYPES-001',
        bullets: ['- WHEN a, THEN b'],
      }),
    ]);
  });

  it('reports BOTH the duplication and the preserved body when there is no **Spec:** block', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# sdd-workflow

### REQ-TYPES-001: original h3
Original body.
- WHEN a, THEN b

## Edge Cases

- existing edge

#### REQ-TYPES-001: duplicate appended by the old defect
Duplicate body.
`,
      '/archive/delta-spec.md': MODIFIED_WITHOUT_SPEC,
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');

    // one entry, but it must carry both facts: `??` reported only the duplication
    // and dropped the reason the body was preserved in the first place
    expect(result.pendingConvergence).toHaveLength(1);
    expect(result.pendingConvergence[0]!.reason).toContain('**Spec:**');
    expect(result.pendingConvergence[0]!.reason).toMatch(/duplicat/i);
  });
});

describe('syncToFeatureSpecs — a new spec attributes every REQ honestly', () => {
  it('places a storyless REQ above the story groups, never under the last one', async () => {
    vol.mkdirSync('/specs/features', { recursive: true });
    vol.fromJSON({
      '/archive/delta-spec.md': deltaSpec(`## ADDED

### REQ-NEW-010: routed to a story

**Feature:** attribution
**Story:** US-1

**Spec:**
One.
- WHEN x, THEN y

---

### REQ-NEW-011: no Story field at all

**Feature:** attribution

**Spec:**
Two.
- WHEN p, THEN q

---
`),
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/attribution.md', 'utf-8');

    // the storyless REQ sits before any story heading — appended after the groups
    // it would read as belonging to the last story, a false attribution written
    // into the trust zone that no counter could reveal
    expect(content.indexOf('#### REQ-NEW-011')).toBeLessThan(content.indexOf('### US-1'));
    expect(content.indexOf('#### REQ-NEW-010')).toBeGreaterThan(content.indexOf('### US-1'));
  });

  it('neutralises a Story label that would parse as a REQ definition', async () => {
    vol.mkdirSync('/specs/features', { recursive: true });
    vol.fromJSON({
      '/archive/delta-spec.md': deltaSpec(`## ADDED

### REQ-NEW-012: real req

**Feature:** injected
**Story:** REQ-NEW-999: smuggled through the Story field

**Spec:**
One.
- WHEN x, THEN y

---
`),
    });

    await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change');
    const content = fs.readFileSync('/specs/features/injected.md', 'utf-8');

    // the label is still readable, but it no longer DEFINES a REQ — otherwise
    // `collectReqDefinitions` would resolve references to an id nobody specified
    expect(content).toContain('REQ-NEW-999');
    expect(content).not.toMatch(/^###\s+REQ-NEW-999/m);
    expect(readSpecCounters(content)!.actual.req_count).toBe(1);
  });
});

describe('syncToFeatureSpecs — dry-run honesty', () => {
  it('reports pendingConvergence under dry-run and writes nothing', async () => {
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': EXISTING_SPEC,
      '/archive/delta-spec.md': MODIFIED_WITHOUT_SPEC,
    });

    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change', true);

    expect(result.pendingConvergence).toEqual([
      expect.objectContaining({ reqId: 'REQ-TYPES-001' }),
    ]);
    expect(result.files).toEqual(['/specs/features/sdd-workflow.md']);
    // byte-identical: dry-run touches nothing
    expect(fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8')).toBe(EXISTING_SPEC);
  });
});

describe('syncToFeatureSpecs — sub-module slices', () => {
  beforeEach(() => {
    vol.fromJSON({
      '/archive/delta-spec.md': deltaSpec(`## MODIFIED

### REQ-QUIZ-001: updated text
**Feature:** quiz
**Story:** US-1

**Spec:**
New body for the slice.

## ADDED

### REQ-QUIZ-003: brand new
**Feature:** quiz
**Story:** US-2

**Spec:**
This belongs in slice B.
`),
      '/specs/features/quiz.md': [
        '---',
        'feature: Quiz',
        'story_count: 2',
        'req_count: 2',
        '---',
        '## Slices',
        '- [A](./quiz/a.md)',
        '- [B](./quiz/b.md)',
        '',
        '## Change History',
        '| Date | Change |',
        '|---|---|',
        '| 2023-01-01 | Initial |',
      ].join('\n'),
      '/specs/features/quiz/a.md': [
        '## US-1: Update feature',
        '',
        '#### REQ-QUIZ-001: old',
        'Old body.',
        '',
      ].join('\n'),
      '/specs/features/quiz/b.md': [
        '## US-2: New feature',
        '',
        '#### REQ-QUIZ-002: existing',
        'Existing body.',
        '',
      ].join('\n'),
    });
  });

  it('routes MODIFIED reqs to their existing slice and ADDED reqs to their story\'s slice', async () => {
    const result = await syncToFeatureSpecs('/archive', '/specs/features', 'demo-change', false);
    console.log(JSON.stringify(result, null, 2));
    
    // It should have touched the main file (Change history) and both slices
    expect(result.files.sort()).toEqual([
      '/specs/features/quiz.md',
      '/specs/features/quiz/a.md',
      '/specs/features/quiz/b.md'
    ].sort());

    const main = fs.readFileSync('/specs/features/quiz.md', 'utf-8');
    expect(main).toContain('demo-change'); // Change History updated

    const sliceA = fs.readFileSync('/specs/features/quiz/a.md', 'utf-8');
    expect(sliceA).toContain('REQ-QUIZ-001: updated');
    expect(sliceA).toContain('New body for the slice.');
    expect(sliceA).not.toContain('Old body.');

    const sliceB = fs.readFileSync('/specs/features/quiz/b.md', 'utf-8');
    expect(sliceB).toContain('REQ-QUIZ-002: existing'); // kept
    expect(sliceB).toContain('REQ-QUIZ-003: brand new'); // added
    expect(sliceB).toContain('This belongs in slice B.');
  });
});
