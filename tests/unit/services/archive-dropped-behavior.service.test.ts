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
 * Not blanking a body is not the same as not losing behavior. When a `**Spec:**`
 * block DOES replace a MODIFIED REQ's body, whatever the block omits vanishes
 * from the trust zone with no signal — the failure `add-harness-capability-flags`
 * hit, where three authored WHEN/THEN bullets were replaced by three unrelated
 * ones. These tests pin the set-difference report (REQ-SERVICES-073).
 */

const spec = (reqBody: string): string => `---
feature: sdd-workflow
status: active
last_updated: 2026-01-01
---

# sdd-workflow

## User Stories

### US-1: existing story

#### REQ-TEMPLATES-066: Adversarial Review→Fix Loop Skill
${reqBody}

## Edge Cases

- existing edge
`;

// The REAL bodies from the change that motivated this requirement, copied
// verbatim: `git show 40299df^:prospec/specs/features/sdd-workflow.md`
// REQ-TEMPLATES-066, and the `**Spec:**` block that replaced it. Three authored
// bullets in, three unrelated ones out — equal count, disjoint sets.
const EXISTING_BODY = `\`prospec-review\` uses a fresh-context reviewer to review the change diff between implement→verify; reviewer mode B by default / A opt-in; the **spec-architecture lens** (delta-spec REQ / dependency direction / conventions / ripple) is always layered on; a critical is drop-in auto-fixed after an independent verifier confirms it, escalating to a human after the hard cap.
- WHEN rendered, THEN it includes Entry Gate / Reviewer Modes / spec-architecture lens / verifier-confirmed critical / hard cap / escalation / Output Contract + Exit Gate
- WHEN a critical is reported, THEN auto-fix only when existence-verified; architectural/ambiguous → escalate to a human
- WHEN findings persist, THEN land them in \`review.md\` (dedup by Location, take the highest severity, carry forward across rounds)`;

const deltaSpec = (specBlock: string): string => `# Delta Spec

## MODIFIED

### REQ-TEMPLATES-066: Adversarial Review→Fix Loop Skill

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
old narrative

**After:**
new narrative

**Reason:**
because the harness question moved out of prose

**Spec:**
${specBlock}

---
`;

const REPLACEMENT_DROPS_ALL = `\`prospec-review\`'s harness-degradation section is rendered from the shared \`harness-capabilities\` partial against the agent's sync-resolved capability flags; the skill's own prose supplies only review's degraded action, never a judgment about what the harness can do.
- WHEN the skill is rendered, THEN its harness section states the resolved capabilities rather than asking the agent to determine them
- WHEN \`can_spawn_subagent\` is false, THEN the rendered skill names the degraded path directly and does not instruct an attempt to spawn
- WHEN review degrades for any reason, THEN the choice is disclosed to the developer — never a silent skip`;

const REPLACEMENT_IS_SUPERSET = `${EXISTING_BODY}
- WHEN the skill is rendered, THEN its harness section states the resolved capabilities`;

const whenLines = (body: string): string[] =>
  body.split('\n').filter((l) => /^-\s+WHEN\b/i.test(l.trim()));

const sync = async (existingBody: string, specBlock: string, dryRun = false) => {
  vol.fromJSON({
    '/specs/features/sdd-workflow.md': spec(existingBody),
    '/archive/delta-spec.md': deltaSpec(specBlock),
  });
  return syncToFeatureSpecs('/archive', '/specs/features', dryRun);
};

describe('syncToFeatureSpecs — a landing block reports the behavior it discards', () => {
  it('reports every existing WHEN/THEN bullet the replacement does not carry', async () => {
    const result = await sync(EXISTING_BODY, REPLACEMENT_DROPS_ALL);

    expect(result.droppedBehavior).toHaveLength(1);
    const dropped = result.droppedBehavior[0]!;
    expect(dropped.feature).toBe('sdd-workflow');
    expect(dropped.reqId).toBe('REQ-TEMPLATES-066');
    // every original bullet, verbatim — a count would not tell a reader what to restore
    expect(dropped.bullets).toEqual([
      '- WHEN rendered, THEN it includes Entry Gate / Reviewer Modes / spec-architecture lens / verifier-confirmed critical / hard cap / escalation / Output Contract + Exit Gate',
      '- WHEN a critical is reported, THEN auto-fix only when existence-verified; architectural/ambiguous → escalate to a human',
      '- WHEN findings persist, THEN land them in `review.md` (dedup by Location, take the highest severity, carry forward across rounds)',
    ]);
    // This IS the equal-count case — assert it, so adding a bullet to the
    // replacement cannot silently demote the namesake regression fixture into a
    // superset-with-drop case while the suite stays green.
    expect(whenLines(REPLACEMENT_DROPS_ALL)).toHaveLength(whenLines(EXISTING_BODY).length);
    // and the replacement still landed — this report never blocks the merge
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');
    expect(content).toContain('- WHEN review degrades for any reason, THEN the choice is disclosed to the developer — never a silent skip');
  });

  it('reports a drop even when the replacement has MORE bullets than the original', async () => {
    // Distinct from the case above on purpose: here the bullet count GROWS, so a
    // "did the count shrink?" check reports nothing while one authored bullet is
    // still gone. Only a set difference sees it.
    const grew = `A restatement that keeps two of three.
- WHEN rendered, THEN it includes Entry Gate / Reviewer Modes / spec-architecture lens / verifier-confirmed critical / hard cap / escalation / Output Contract + Exit Gate
- WHEN a critical is reported, THEN auto-fix only when existence-verified; architectural/ambiguous → escalate to a human
- WHEN the harness declares no sub-agents, THEN the degraded path is named
- WHEN a spawn fails at runtime, THEN the same fallback applies`;
    const result = await sync(EXISTING_BODY, grew);

    expect(whenLines(grew).length).toBeGreaterThan(whenLines(EXISTING_BODY).length);
    expect(result.droppedBehavior[0]!.bullets).toEqual([
      '- WHEN findings persist, THEN land them in `review.md` (dedup by Location, take the highest severity, carry forward across rounds)',
    ]);
  });

  it('scopes detection to WHEN bullets — a prose list item is not tracked behavior', async () => {
    // The delta-spec states paragraph/prose content is out of scope. Without this
    // fixture a relaxed `/^-\s+/` regex passes every other test in the file.
    const withProse = `Statement.
- Note: this is prose, not a behavioral clause
- WHEN a happens, THEN b follows`;
    const replacement = `Statement.
- WHEN a happens, THEN b follows`;
    const result = await sync(withProse, replacement);
    expect(result.droppedBehavior).toEqual([]);
  });

  it('ignores whitespace-only differences — re-indented or reflowed is not a drop', async () => {
    // Both normalisations are load-bearing: without the trim an indented bullet
    // reports a false drop, without the collapse a reflowed one does. A false
    // report kills trust in the worklist faster than a missed one.
    //
    // Asserting an EMPTY result alone would be a false green — any mutation that
    // stops extracting bullets at all also yields empty. So the fixture drops a
    // second, genuinely-removed bullet: the report must be non-empty and contain
    // ONLY that one, which proves extraction ran AND normalisation held.
    // BOTH existing bullets are indented, so dropping the normalisation makes
    // them invisible on the left-hand side and the report goes empty — which is
    // what distinguishes "normalised correctly" from "extracted nothing".
    const spaced = `Statement.
  - WHEN a happens,   THEN b follows
  - WHEN c happens, THEN d follows`;
    const replacement = `Statement.
- WHEN a happens, THEN b follows`;
    const result = await sync(spaced, replacement);
    // `a` survives despite the indent + double space; only `c` is genuinely gone.
    // It is reported with its SOURCE indentation intact — comparison normalises,
    // the report does not, so what the author restores is what their file said.
    expect(result.droppedBehavior[0]!.bullets).toEqual([
      '  - WHEN c happens, THEN d follows',
    ]);
  });

  it('compares a wrapped bullet whole — a rewritten continuation line is a drop', async () => {
    // First lines identical, THEN clause swapped: comparing physical lines alone
    // reports nothing while the behavior is completely replaced.
    const wrapped = `Statement.
- WHEN the condition is long enough to wrap,
  THEN the original consequence follows`;
    const rewritten = `Statement.
- WHEN the condition is long enough to wrap,
  THEN something COMPLETELY different follows`;
    const result = await sync(wrapped, rewritten);
    expect(result.droppedBehavior).toHaveLength(1);
    expect(result.droppedBehavior[0]!.bullets[0]).toContain('the original consequence follows');
  });

  it.each([
    ['a fenced code block', '```ts\nconst x = 1;\n```'],
    ['a trailing prose sentence', 'Note: this only applies to X.'],
    ['a table row', '| col | col |'],
  ])('does not absorb %s that follows a bullet at column 0', async (_label, trailing) => {
    // A continuation must be INDENTED. Without that rule each of these gets
    // glued onto the bullet, which then stops matching its byte-identical twin
    // in the replacement — a FALSE drop, demanding the author "restore" a bullet
    // nothing removed. False reports kill the worklist faster than missed ones.
    // A second, genuinely-dropped bullet keeps this from being an empty-result
    // false green: an "extracts nothing" mutation yields [] and fails here too.
    const body = `Statement.
- WHEN a happens, THEN b follows
${trailing}
- WHEN c happens, THEN d follows`;
    const replacement = `Statement.
- WHEN a happens, THEN b follows`;
    const result = await sync(body, replacement);
    // ONLY `c`: absorbing the trailing text into `a` would make it stop matching
    // its identical twin and show up here as a phantom second entry.
    expect(result.droppedBehavior[0]!.bullets).toEqual([
      '- WHEN c happens, THEN d follows',
    ]);
  });

  it('reports nothing for an ADDED entry reusing an existing REQ id — the documented blind spot', async () => {
    // The delta-spec-format reference now graduates this as a behavioral claim
    // about the code ("reported by neither worklist"), so it needs a test or it
    // rots silently in the trust zone. ADDED appends rather than replacing, so
    // the old body survives beside a second heading with no signal at all.
    vol.fromJSON({
      '/specs/features/sdd-workflow.md': spec(EXISTING_BODY),
      '/archive/delta-spec.md': `# Delta Spec

## ADDED

### REQ-TEMPLATES-066: Adversarial Review→Fix Loop Skill

**Feature:** sdd-workflow
**Story:** US-1

**Spec:**
${REPLACEMENT_DROPS_ALL}

---
`,
    });
    const result = await syncToFeatureSpecs('/archive', '/specs/features');
    const content = fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8');

    expect(result.droppedBehavior).toEqual([]);
    expect(result.pendingConvergence).toEqual([]);
    // both headings present, old body intact — the blind spot, pinned
    expect(content.match(/#### REQ-TEMPLATES-066:/g)).toHaveLength(2);
    expect(content).toContain('- WHEN findings persist, THEN land them in `review.md`');
  });

  it('stops the superseded body at the next section — never swallows later headings', async () => {
    // The section boundary is now droppedFor's only left-hand input. Without this
    // fixture, narrowing it to h4 leaves the whole suite green while a REQ that is
    // the last h4 before an h2 reports every following section's bullets as
    // "dropped by your block" — a false report on top of real deletion.
    const trailing = `${EXISTING_BODY}

## Edge Cases

- WHEN an unrelated edge case fires, THEN it is documented here`;
    const result = await sync(trailing, REPLACEMENT_DROPS_ALL);

    expect(result.droppedBehavior[0]!.bullets).not.toContain(
      '- WHEN an unrelated edge case fires, THEN it is documented here',
    );
    expect(result.droppedBehavior[0]!.bullets).toHaveLength(3);
    // …and the merge left that section in the file
    expect(fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8')).toContain(
      '- WHEN an unrelated edge case fires, THEN it is documented here',
    );
  });

  it('reports nothing when the replacement is a superset of the existing bullets', async () => {
    const result = await sync(EXISTING_BODY, REPLACEMENT_IS_SUPERSET);
    expect(result.droppedBehavior).toEqual([]);
  });

  it('reports nothing when the existing body carries no bullets', async () => {
    // Paragraph-level prose is deliberately out of scope — claiming otherwise
    // would overstate what the detection observes (PB-003).
    const result = await sync('A body with prose only and no WHEN/THEN bullets.', REPLACEMENT_DROPS_ALL);
    expect(result.droppedBehavior).toEqual([]);
  });

  it('reports the same set under dry-run, and writes nothing', async () => {
    const before = spec(EXISTING_BODY);
    const result = await sync(EXISTING_BODY, REPLACEMENT_DROPS_ALL, true);

    expect(result.droppedBehavior).toHaveLength(1);
    expect(result.droppedBehavior[0]!.bullets).toHaveLength(3);
    expect(fs.readFileSync('/specs/features/sdd-workflow.md', 'utf-8')).toBe(before);
  });

  it('leaves pendingConvergence untouched — the two worklists mean opposite things', async () => {
    // pendingConvergence = body PRESERVED, converge by hand.
    // droppedBehavior    = body REPLACED, confirm what the replacement omitted.
    const replaced = await sync(EXISTING_BODY, REPLACEMENT_DROPS_ALL);
    expect(replaced.pendingConvergence).toEqual([]);
    expect(replaced.droppedBehavior).toHaveLength(1);
  });
});
