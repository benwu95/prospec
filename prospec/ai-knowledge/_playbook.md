# Team Playbook — Promoted Lessons

> Shared, version-controlled lessons promoted from the personal ledger (`.prospec/lessons.md`)
> by **`/prospec-learn`**, each only after **explicit human approval**. This is the team tier
> between personal lessons and Constitution rules. Load on demand (progressive disclosure):
> Skills read **only the entries relevant to the change at hand**, not the whole file.

Format (one entry per promoted lesson) — see `.claude/skills/prospec-learn/references/promotion-format.md`:

```markdown
### PB-{NNN}: {one-line rule}
- **Source**: {change(s)} · **Criteria**: freq=N, modules=M · **Approved-by**: {name} · **Date**: {YYYY-MM-DD}
- **TTL**: {date or "review by …"}
- **Guidance**: {what to do / avoid, and why}
```

## Maintenance Rules

- **Append only via `/prospec-learn` with human approval** — never hand-edit a promoted entry's provenance.
- **TTL + conflict**: expired or conflicting entries go on `/prospec-learn`'s needs-review list for human retirement/arbitration; retirement records reason + date here.
- **Promotion to Constitution**: a lesson strong enough for a hard rule graduates to `CONSTITUTION.md` as a `ConstitutionRule` (severity-tagged); this playbook holds team conventions below that bar.

## Entries

### PB-001: Contract assertions must be section-scoped, structure-aware, and mutation-verified
- **Source**: add-output-contract, add-review-fix-loop, add-token-measurement-harness, reorder-stable-prefix-loading · **Criteria**: freq=4, modules=3 (tests, templates, cli) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-06-11 (strengthened; originally 2026-06-08)
- **TTL**: review by 2026-12-11
- **Guidance**: three requirements — missing any one is a false-green risk:
  1. **Section-scoped** — slice from the section heading to the next heading, assert distinctive in-section content, guard the slice is non-empty. A bare `toContain('X')` over the whole document passes against incidental text in unrelated sections (bit `add-output-contract` C1, `add-review-fix-loop` C1+C2).
  2. **Structure-aware** — content presence is not enough; assert structural invariants: item-set vs a version-controlled baseline, ordering, list contiguity (a CommonMark paragraph interrupting a numbered list silently demoted 5 loading items while every assertion stayed green — `reorder-stable-prefix-loading` C1), and **negative assertions** for "must NOT appear" rules (a rule living only in a comment blocks nothing — `add-token-measurement-harness` REQ-005 AC4). Extraction keys must cover the whole target (a first-backtick-only key missed deletions in combined items).
  3. **Mutation-verify** — after writing each new assertion class, delete/corrupt the asserted feature and confirm the test goes red; only then does the assertion count.
