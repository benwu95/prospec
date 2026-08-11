# include-tests-in-typecheck — Archive Summary

- **Archived**: 2026-07-06
- **Original Created**: 2026-07-06
- **Quality Grade**: S
- **Scale**: quick

## User Story

As a developer relying on `pnpm typecheck` / CI to catch type errors,
I want type-checking to cover `tests/` (and `scripts/`),
So that test-file type breaks are caught by machine, not only at adversarial review.

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| tests | Medium | 54 surfaced test-file type errors fixed; guard test added; suite now type-checked |
| _(root config)_ | — | `tsconfig.typecheck.json` + `package.json` `typecheck` script (not a knowledge module) |
| _(scripts)_ | — | `scripts/counts/rewrite.ts` type-safety fix, logic unchanged (not a knowledge module) |

## Spec Impact (quick — diff-diagnosed)

**No product-spec-covered behavior touched** → graduation skipped (archive Entry Gate quick spec-impact check). The diff is prospec's own dev tooling (typecheck config + npm script), test-file type reconciliations, and a counts-script type fix (behavior identical). No `prospec/specs/features/` REQ governs `pnpm typecheck` scope.

## Completion

- **Tasks**: 7/7 code (100%); 4 `[V]` done
- **Acceptance Criteria**: SC-001..004 met

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major (review-clean). Independent fresh-context reviewer confirmed the 54 delegated fixes are honest type reconciliations (every `!` on a guaranteed index, mocks neutral, union narrowing throws-not-swallows), no weakened assertions; config/build/guard verified; mutation-verified both ways.
- **Verify**: Grade **S** — 1/5 PASS, 2/5 not-applicable (quick), 3/5 PASS, 4/5 PASS, 5/5 PASS (6 n/a). typecheck 0, tests 2083, lint clean, `prospec check` 11/11.
- **Quality Log**: no WARN/FAIL results (informational only: re-scaled standard→quick after plan-time discovery of 54 latent test type errors).

## Knowledge Update

`tests` module README synced (typecheck-coverage note + test counts) in the feature commit `2ae84d5`; no feature-spec graduation (no product-spec impact).
