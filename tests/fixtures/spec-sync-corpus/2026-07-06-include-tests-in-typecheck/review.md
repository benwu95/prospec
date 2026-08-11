# Review: include-tests-in-typecheck

**Rounds:** 1 / cap 3   **Status:** review-clean

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| — | — | — | review-clean (0 critical / 0 major) |

## Round 1

Independent fresh-context reviewer audited all 16 changed paths (read each changed test function in full) and dynamically re-verified all four proposal Success Criteria. **0 criticals, 0 majors.**

Key confirmations:
- **test-quality (PB-001)** — the 54 delegated fixes are honest type reconciliations, not weakenings: every `!` sits on a genuinely-guaranteed index (guarded by a `length >= N` / `toHaveBeenCalledTimes(1)` assert or a `for` bound); mock "completions" are neutral (`generateRawScan` return is discarded; `collectAllModules` never branches on `warnings`); union narrowing (`firstText`, `'text' in first`) **throws** on the unexpected variant rather than swallowing it — strictly ≥ prior behavior. No assertion deleted or loosened.
- **config correctness** — `tsconfig.typecheck.json` clears TS6059 via `rootDir:"."`+`noEmit`; `extends` inherits base strict options; child replaces only `include`/`exclude` (tests in, not re-excluded). Mutation probe: injected TS2322 in a test file → `pnpm typecheck` exit 2; revert → 0.
- **build no regression** — `pnpm build` (base `tsc`) emits only `dist/{cli,lib,services,types}`; no `dist/tests`, no `*.test.*`; `files` ships `dist/`+`src/templates/` only.
- **guard test (PB-001)** — section-scoped + negative `exclude` assertion + script-wiring check; goes red if tests are re-excluded/dropped or the script repointed; 4/4, type-clean.
- **spec-architecture** — dev-tooling only (no `src/` product code); delta-spec comparison not-applicable (scale=quick); no `specs/features/` REQ behavior touched.

## Observation (not a finding)

`tests/unit/cli/check-output.test.ts` contains a NUL byte at offset 708 (git renders it "Binary") — **pre-existing on `main`** at the identical offset, not introduced by this change; the `(call: unknown[])` edit is confirmed via `git diff --text`.
