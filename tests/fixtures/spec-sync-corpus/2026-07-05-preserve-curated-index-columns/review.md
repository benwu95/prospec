# Review: preserve-curated-index-columns

**Rounds:** 1 / cap 3   **Status:** review-clean (0 critical; majors addressed)

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| prospec-knowledge-update.hbs:143 | major | docs-claims | fixed — scoped "nothing lost" to Keywords/Aliases/Rationale/Description; Depends On derives from relationships.depends_on |
| knowledge-update.service.test.ts (execute wiring) | major | test-quality | fixed — added execute()-level backfill→persist→regen test (no-clobber, idempotent, backfill-before-collect ordering pinned) |
| knowledge-update.service.ts:512 (bootstrap persist) | major | correctness | accepted — bounded: bootstrap-once + no-clobber; item-level module-map comments (rare) may drop only on a downstream's one-time migration; not silent runtime corruption |

## Summary

Independent fresh-context reviewer (mode B, multi-lens) audited the whole #58 diff vs the #57 branch base.
**0 critical, 3 major** (all advisory). 2 majors fixed, 1 accepted as a bounded limitation.

**Definitive verdict on the downstream `depends_on` question (reviewer):** NOT data loss / not a defect — the
non-backfill of `relationships.depends_on` is the correct, safe design: in any Prospec-generated project it is
populated by knowledge-generate and enforced by the import-direction drift check; index "Depends On" can hold
non-module shorthands ("all") that cannot be written into `relationships.depends_on` without corrupting a
drift-enforced contract; the value is regenerable and the reset is a visible git diff, not silent corruption.
The only real gap was the doc overclaim (fixed).

Verified correct (reviewer, not findings): `backfillCuratedFromIndex` is genuinely no-clobber (isEmptyList/isEmptyScalar
guards) + idempotent (2nd run changed=false, pinned); case-insensitive name match; module-in-index-only ignored,
module-in-map-only untouched; `—` neutralized on parse-back; `buildIndexRow`/`buildIndexTable` position cells by
INDEX_COLUMN + derive header/separator from the constant (reorder-safe, default→— arm); updateIndex ordering
(backfill writes module-map → collectAllModules re-reads → regen) correct; dependency direction clean (helpers in
lib, service imports lib→types only); mutation-verified rendering + no-clobber tests. index.md regen diff matches
single-source intent (separator normalization + cli/tests Depends On now the real relationships.depends_on).

## Post-review gates
`pnpm typecheck` / `test` (1995) / `lint` green; `pnpm counts:check` in sync; `prospec check` 10/10 (0 fail, 0 warn).
New files `src/lib/index-table.ts` + `tests/unit/lib/index-table.test.ts` staged at commit (untracked pre-commit).
