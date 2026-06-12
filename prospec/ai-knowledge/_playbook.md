# Team Playbook — Promoted Lessons

> Shared, version-controlled lessons promoted from the lessons ledger (`_lessons-ledger.md`)
> by **`/prospec-learn`**, each only after **explicit human approval**. This is the team tier
> between the lessons ledger and Constitution rules. Load on demand (progressive disclosure):
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
- **Source**: add-output-contract, add-review-fix-loop, add-token-measurement-harness, reorder-stable-prefix-loading, add-drift-checker, add-mcp-server · **Criteria**: freq=6, modules=4 (tests, templates, cli, lib) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-06-13 (provenance appended; strengthened 2026-06-11; originally 2026-06-08)
- **Re-evidence (add-mcp-server)**: 兩個 review criticals 都源於「REQ 指定的語意無凍結測試」——invalid-map 列表吞錯（loud-vs-graceful 雙態無測試釘住）與 search 排序的 distinct-vs-summed term 計數（AC3 確定性通過、排序鍵本身卻無 fixture 區分）。REQ 寫明的每一條語意都要有能在舊實作下變紅的釘住測試。
- **TTL**: review by 2026-12-11
- **Guidance**: three requirements — missing any one is a false-green risk:
  1. **Section-scoped** — slice from the section heading to the next heading, assert distinctive in-section content, guard the slice is non-empty. A bare `toContain('X')` over the whole document passes against incidental text in unrelated sections (bit `add-output-contract` C1, `add-review-fix-loop` C1+C2).
  2. **Structure-aware** — content presence is not enough; assert structural invariants: item-set vs a version-controlled baseline, ordering, list contiguity (a CommonMark paragraph interrupting a numbered list silently demoted 5 loading items while every assertion stayed green — `reorder-stable-prefix-loading` C1), and **negative assertions** for "must NOT appear" rules (a rule living only in a comment blocks nothing — `add-token-measurement-harness` REQ-005 AC4). Extraction keys must cover the whole target (a first-backtick-only key missed deletions in combined items).
  3. **Mutation-verify** — after writing each new assertion class, delete/corrupt the asserted feature and confirm the test goes red; only then does the assertion count.

### PB-002: Lifecycle station lists must be mechanically copied from `_status-lifecycle.md`, then audited per station for false-block and false-pass
- **Source**: add-scale-adapter · **Criteria**: freq=1, modules=2 (templates, tests) — below the freq≥3 ∧ modules≥2 rule; **early promotion by human judgment** (within-change ×3 incl. 2 criticals; precedent: PB-001 at freq=2) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-06-12
- **TTL**: review by 2026-12-12
- **Guidance**: when a design changes an artifact's EXISTENCE or a status transition (e.g. a quick path that skips plan/delta-spec), do NOT rebuild the lifecycle from memory or from the proposal's own touchpoint list — copy the station list verbatim from `_status-lifecycle.md` (story → plan → tasks → implement → review → verify → archive) and ask two questions at EVERY station:
  1. **False-block**: does this station's Entry Gate or input contract depend on the artifact that no longer exists? (bit `add-scale-adapter`: tasks↔plan mutual refusal deadlocked quick; review's gate would have hard-failed)
  2. **False-pass**: is this station's check KEYED on the absent artifact, so an empty extraction silently passes? (bit `add-scale-adapter`: archive's knowledge gate keyed on delta-spec REQ prefixes — empty set under quick)
  Plan-stage Call Chains for such designs must show one chain per station, not only the stations the source document names (the bundle doc predated review/implement interactions and was incomplete three times over).

### PB-003: Documented claims must match actually-observable implementation behavior — mark gaps with deliberate-exclusion wording
- **Source**: add-token-measurement-harness, reorder-stable-prefix-loading, add-drift-checker, add-mcp-server · **Criteria**: freq=4, modules=4 (cli, templates, lib, services) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-06-13 (provenance appended; originally 2026-06-12)
- **Re-evidence (add-mcp-server)**: ×3——proposal/plan 的「首個 runtime dependency」不實宣稱（實有 8 個既存 deps）、tasks.md T10 宣稱未做的 error-output dispatch、delta-spec AC 文字與實作漂移（PrerequisiteError→ConfigNotFound、列表過濾未回寫 AC1）。規格文件即將於 archive 畢業成永久 capability spec，文字漂移會被烙進真相層——review 期即時修正 spec 文字與修 code 同等重要。
- **TTL**: review by 2026-12-12
- **Guidance**: any behavior a doc, code comment, README, or template asserts must be something the implementation actually does or the measurement actually observes. Three same-root incidents: synthetic warm cache hits presented without an asterisk (harness); template-layer savings attributed beyond what the harness can measure (BL-020 — fixed with deliberate-exclusion wording); a workflow template comment claiming "a shallow clone would honestly degrade to skipped" while no shallow detection existed in code (drift checker — escalated to a review **critical**, C3). Two rules:
  1. **Claim ⊆ implementation**: before writing "X handles/measures/degrades Y", grep for the code path that does it; if it does not exist, either implement it or do not claim it.
  2. **Deliberate exclusion over silence**: what is not done / not measurable gets explicit exclusion wording ("not measured here", "left to …"), so review/verify can diff documented claims against implemented behavior instead of discovering the gap as a critical.
