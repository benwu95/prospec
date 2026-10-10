# Feedback Promotion Format Reference

## Promotion Rule (explicit, reproducible)

Defaults: `.prospec.yaml` → `learn.thresholds`:

```
suggest_promote = (frequency ≥ 3) AND (|impact_modules| ≥ 2)
tier:
  kind == "constitution" → CONSTITUTION.md (ConstitutionRule; verify-graded)
  otherwise → _playbook.md (team; L2 on-demand; TTL)
```

- `frequency`: Distinct source changes.
- `|impact_modules|`: Modules from `module-map.yaml`.
- Below thresholds: Stays `personal`.
- Score detail: `frequency=N · impact_modules=M · kind=… · rule=freq≥3 ∧ modules≥2 ⇒ suggest`.
- **Duplicate check**: Strengthen a matching Constitution rule.

## Lessons Ledger (`prospec/ai-knowledge/_lessons-ledger.md`)

```markdown
| key | description | frequency | impact_modules | kind | source_changes | status |
|---|---|---|---|---|---|---|
| test/scope | section-scope assertions | 3 | 2 (templates,tests) | convention | change-a, change-b, change-c | suggest-promote |
```

- **key**: Normalized English rule/REQ/file signature.
- **description**: written in the language of the original correction (Language Policy names this column as a trust-zone exception); every other column is an identifier or enum and stays English.
- **kind**: `convention` | `playbook` | `constitution`.
- **status**: `personal` | `suggest-promote` | `promoted` | `declined` | `retired` — a **bare token**. Approval/scoring/retirement provenance, dates and narrative belong in description, never appended to this column.

## Harvest (archive-time auto-extraction)

At archive, harvest the CLI-returned `archivePath`; cite the source project’s committed summary at `prospec/specs/_archived-history/{archiveIdentity}.md` using the returned exact `archiveIdentity`, specifically its `## Review & Verify` section, as the durable evidence. For a source change predating the summary convention, consult the ledger's own `git log -p`; a missing summary is not evidence that nothing happened.

Auto-harvest is idempotent: include `[M]` tasks and `kind: playbook` / `_conventions.md` corrections. Auto-harvest ≠ auto-promote: no shared-tier auto-write. A `retired` row is never raised by harvest (`prospec learn upsert`); it stays untouched.

## Generalizability Heuristic

For conversational corrections only; Harvest's structured sources are NOT re-filtered:
- **Capture**: Cross-file architecture/layering, type-contract, testing or security rules.
- **Exclude**: One-off mock, business-string or copy tweaks, temporary hacks, pure business changes.
- Use this project's modules from `module-map.yaml` and terms from `_glossary.md`.

## Review-Queue Prioritization (knowledge_health)

Prioritize review: match `impact_modules` to stale `structural.knowledge_health.modules[]` in `prospec-report.json`; never auto-write promotions.

## Team Playbook Entry (`_playbook.md`)

```markdown
### PB-{NNN}: {one-line rule}
- **Source**: {change(s)} · **Criteria**: freq=N, modules=M ({module}, …) · **Kind**: {convention|playbook} · **Approved-by**: {name} · **Date**: {YYYY-MM-DD}
- **Stations**: {s1}, {s2} or all
- **TTL**: {date or "review by …"}
- **Guidance**: {what to do / avoid, and why}
```

Required Source field: `modules=M (…)`; follow with `- **Stations**: <s1>, <s2>` or `all` (SDD stations/skill aliases). `learn playbook --station` catalogs all active entries and selects bodies; `--modules` only sorts. All-undeclared uses legacy module selection. `--modules` alone stays legacy; `--id` reads an entry.

Advisory cap: 300 `estimateTokens` over the full entry (heading, metadata, Landing, body). Warn on stderr only above cap; never truncate stdout. No override.

Mechanized compact form: permanent PB id/one-line rule, Source/Criteria/Kind/approval, Stations, `Landing:`, TTL. Remove covered Guidance and Re-evidence/Strengthened/Broadened narrative; retain clauses the mechanism and executor do not cover. History: see Sweep.

## Constitution Promotion

Emit a `ConstitutionRule` (RFC-2119 format): `{ severity: MUST|SHOULD|MAY, name, description, rationale, check }`.

## Regression Pin Promotion to Contract Tests

- **Promote to Contract Test**: For a structural, architectural or security family invariant, enumerate the family, assert structure and mutation-verify.
- **Keep in Unit/Integration Test**: For service-local behavior or formatting.

## Approval Record

Shared writes record **source changes**, **criteria fired**, **approver**, **date**.

## Staleness Sweep (pre-Collect)

| test | question | evidence that settles it |
|---|---|---|
| mechanized | enforced? | mechanism (`file:line`/check/test) + runner + no post-fix occurrence |
| no longer applicable | artifact/command gone? | removal commit/path + no recurrence |
| contradicted | conflicts? | quote both rules for arbitration |
| desynchronized | inlined but absent from gate? | `Landing:` and missing gate clause |
| mechanized compaction | compact form possible? | complete before/after, mechanism AND executor, clause coverage, history |
| over-limit cleanup | over cap, splittable? | `estimateTokens`, before/after, retained clause coverage |
| zero-yield lens | `prospec learn yield` says retire/review? | declared invocations ≥ min_invocations |

- **Ledger retirement**: A row is **never deleted, never re-keyed**. Set `status: retired`; `frequency`, `impact_modules` and `source_changes` stay untouched; it is never re-opened.
- **Playbook retirement**: PB numbers are permanent and never reused. Replace TTL + Guidance with `- **RETIRED {date}**: {reason}` under `## Retired Entries`; a retired entry never returns to the needs-review list. Mechanized ≠ retired: keep rationale and `- **Inlined into gate {date}**` with `Landing: \`path\` (marker)`. A `personal` row is the opposite case and never compressed.
- **Lens retirement**: Retire zero-yield entries after declared invocations ≥ min_invocations.
- **Cleanup approval**: Both cleanup tests require per-entry human approval before writes. Keep unapproved entries, uncovered clauses, ids and ledger counters. Resync strengthened clauses missing from Landing; never delete them for the cap.
- **Stale cross-references**: Sweep ledger, playbook, skills and shipped Feature Specs for stale references; only a MODIFIED REQ graduated at archive may correct Feature Specs.
- **Prose ownership**: Only one tier owns prose: promoted narratives live in the playbook; personal descriptions are promotion evidence, never compressed.
- **History**: Recover compressed per-occurrence narratives from ledger `git log -p`; `_archived-history/` resolves only for changes archived after that convention existed.

## Governance — TTL & Conflict

Send expired, conflicting or sweep-matched rules to human arbitration.
