# Tasks: include-tests-in-typecheck

## Config

- [x] T1 Add `tsconfig.typecheck.json`: `extends ./tsconfig.json`, `compilerOptions.noEmit: true` + `rootDir: "."` (avoids TS6059), `include` `src`/`tests`/`scripts`, `exclude` `node_modules`/`dist` ~12 lines
- [x] T2 Repoint `package.json` `typecheck` script → `tsc -p tsconfig.typecheck.json` (build `tsc` stays on base tsconfig, emits src only) ~1 line

## Tests (fix surfaced type errors — reach `pnpm typecheck` green)

- [x] T3 Fix `tests/unit/services/mcp.service.test.ts` (28: resource-content `possibly undefined` guards, union `.text` narrowing) ~45 lines
- [x] T4 Fix service tests: `knowledge-update` (4), `quickstart` (3), `init` (3), `upgrade` (1 — complete `RawScanResult` mock) ~30 lines
- [x] T5 Fix lib/cli/contract/e2e tests: `knowledge-reader` (3), `cli/index` (2), `mcp-server` (2), `mcp-output`/`knowledge-init-output`/`check-output`/`e2e/cli` (1 each) ~25 lines
- [x] T6 Fix `scripts/counts/rewrite.ts` (4) ~10 lines

## Tests (guard)

- [x] T7 Add guard test (`tests/contract` or `tests/unit`) asserting the typecheck config's effective coverage includes `tests` (parse `tsconfig.typecheck.json`: include covers tests, exclude does not re-drop tests); mutation-verified ~30 lines

## Verification

- [x] T8 [V] `pnpm typecheck` exits 0 (all 54 surfaced errors fixed) ~2 lines
- [x] T9 [V] `pnpm build` then confirm `dist/` contains no `tests/**` output (build unchanged) ~3 lines
- [x] T10 [V] `pnpm test` + `pnpm lint` green ~2 lines
- [x] T11 [V] Mutation-verify: inject a type error into a test file → `pnpm typecheck` fails; revert → green ~5 lines

## Summary

- **Total Tasks:** 11 (7 code, 4 `[V]`)
