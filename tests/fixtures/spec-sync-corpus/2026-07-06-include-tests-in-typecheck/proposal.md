# Proposal: include-tests-in-typecheck

## Background

`tsconfig.json` 的 `include` 僅 `src/**/*.ts`、`exclude` 含 `tests`,而 `pnpm typecheck`(`tsc --noEmit`)用的就是它——所以**測試檔從不被型別檢查**。測試檔的型別破損(例如遷移型別後仍從舊模組 `import type` → TS2459)會逃過 `typecheck`、`test`(esbuild 於 runtime strip 掉 type-only import)、`lint` 三閘,只能靠對抗式 review 抓到(PB-008,見 PR #80 的實例)。

## User Stories

### US-1: 型別檢查涵蓋測試檔 [P1]

As a 依賴 `pnpm typecheck` / CI 攔截型別錯誤的開發者,
I want 型別檢查涵蓋 `tests/`(與第一方 `scripts/`),
So that 測試檔的型別破損在本機與 CI 被機器攔下,而非漏到對抗式 review。

**Acceptance Scenarios:**

- WHEN `pnpm typecheck` 執行,THEN 測試檔(`tests/**`)一併被型別檢查,測試檔的型別錯誤使指令非零退出
- WHEN 測試檔含破損的 type-only import(如 TS2459),THEN `pnpm typecheck` FAIL(不再靜默通過)
- WHEN `pnpm build`(`tsc`)執行,THEN 仍只 emit `src` 到 `dist`、不含 tests(build 產物不變)
- WHEN CI 跑 `pnpm run typecheck`(`ci.yml`),THEN 自動涵蓋測試檔(無需另加 CI 步驟)

**Independent Test:**
在某測試檔故意引入型別錯誤,跑 `pnpm typecheck` 應 FAIL;還原後 PASS;`pnpm build` 後 `dist/` 不含 `tests/**`。

## Edge Cases

- **`rootDir` 衝突(已探測)**:base `tsconfig.json` 設 `rootDir: src`;若只把 tests 加進 include,tsc 報 TS6059「not under rootDir」。typecheck config 須 override `rootDir: "."`(搭配 `noEmit`),否則 87 個 TS6059 假錯。
- **既有型別錯誤(已探測,54 個)**:啟用後 `pnpm typecheck` 揭露 54 個真實型別錯誤,分佈 13 檔——熱點 `tests/unit/services/mcp.service.test.ts`(28)、其餘散落(knowledge-update 4、quickstart 3、init 3、knowledge-reader 3、cli/index 2、mcp-server 2…)、`scripts/counts/rewrite.ts`(4)。碼別以 TS2532/TS18048「possibly undefined」(`noUncheckedIndexedAccess`)為主(28),次為 TS2345 不完整 mock、TS2339 union 收窄。全屬機械式修正(加 `!`/guard、補齊 mock 欄位、收窄型別),**一併修到 `pnpm typecheck` 綠**。
- typecheck config 以 `extends ./tsconfig.json` 繼承 base,避免兩份 `compilerOptions` 漂移;build(`tsc`)維持用 base、只 emit `src`。
- `scripts/`(如 `sync-counts.ts`、`counts/rewrite.ts`)為第一方 TS,**納入**檢查範圍。

## Functional Requirements

- **FR-001**: 新增型別檢查專用 config(如 `tsconfig.typecheck.json`)`extends ./tsconfig.json`、`noEmit: true`、`include` 涵蓋 `src` + `tests`(+ `scripts`),不排除 tests。
- **FR-002**: `pnpm typecheck` 指向該 config;`pnpm build`(`tsc`)維持用 `tsconfig.json`(排除 tests、只 emit `src`)。
- **FR-003**: 修掉啟用後 `pnpm typecheck` 揭露的既有測試/scripts 型別錯誤(或明確 scope 並記錄未解者)。
- **FR-004**: 加一個 guard(契約/單元測試)斷言型別檢查 config 涵蓋 `tests`,防止未來改回排除。

## Success Criteria

- **SC-001**: 於某測試檔注入型別錯誤 → `pnpm typecheck` 非零退出(mutation-verified);還原後綠。
- **SC-002**: `pnpm build` 後 `dist/` 不含任何 `tests/**` 產物。
- **SC-003**: `pnpm typecheck` / `pnpm test` / `pnpm lint` 全綠(既有測試型別錯誤已清)。
- **SC-004**: guard test 斷言 typecheck config 的涵蓋範圍含 `tests`(改回排除即紅)。

## Related Modules

- **tests**: guard test(FR-004)+ 修既有測試型別錯誤(FR-003)。root config(`tsconfig.typecheck.json`、`package.json`)非知識模組。

## Open Questions

- [x] **RESOLVED**: `scripts/` 納入型別檢查範圍(第一方 TS;探測顯示 `scripts/counts/rewrite.ts` 有 4 個待修錯誤)。
- 註:scale 降為 `quick`(內部 dev-tooling、單一 module `tests`、無 product-spec 行為);跳過 plan/delta-spec,本 proposal 為 implement 的 spec 來源。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] Language Policy:proposal 繁中;config / 識別字 / commit 英文。
- [x] Test-Driven Development:FR-004 guard + SC-001 mutation-verified。
- [x] No violations identified。

## UI Scope

**Scope:** none
