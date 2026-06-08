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

### PB-001: Contract-test assertions must be section-scoped + mutation-verified
- **Source**: add-output-contract, add-review-fix-loop · **Criteria**: freq=2, modules=2 (tests, templates) — human judgment, 1 shy of the freq≥3 auto-bar · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-06-08
- **TTL**: review by 2026-12-08
- **Guidance**: a contract assertion over a rendered template (`toContain` / regex) must be **scoped to the section it claims to test** — slice from the section heading to the next heading, assert **distinctive in-section content**, and guard the slice is non-empty (`length > 0`). Then **mutation-verify**: delete the asserted feature/section and confirm the test goes red. A bare `toContain('X')` over the whole document passes against incidental text in unrelated sections (NEVER/Output-Contract/MANDATORY-read lines) → false-green / false confidence. This bit `add-output-contract` (C1) and `add-review-fix-loop` (C1+C2); applying it proactively prevented recurrence in `add-feedback-promotion-pipeline`.
