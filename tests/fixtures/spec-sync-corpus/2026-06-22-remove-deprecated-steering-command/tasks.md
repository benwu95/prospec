# Tasks: remove-deprecated-steering-command

> 順序：先解註冊→刪源碼/移模板→改字串→修測試→退役規格→同步知識/計數→驗證。
> `[P]` 可並行、`[M]` 人工指令、`[V]` 驗證；未標記＝code。
> 計數同步遵 PB-004（任何檔類別增減 → 重新衍生並同步每份副本）＋ PB-005（每個被動到源碼的模組 README 都要在本 commit 觸及）。

## CLI

- [x] T1 `src/cli/index.ts` 移除 steering import(L14) 與 `registerSteeringCommand(program)`(L87) ~2 lines
- [x] T2 刪除 `src/cli/commands/steering.ts` 與 `src/cli/formatters/steering-output.ts` 整檔 ~0 lines
- [x] T3 `src/cli/parse-options.ts:4` JSDoc 去 `steering` 字樣（parseDepth 不動）~1 line

## Services

- [x] T4 刪除 `src/services/steering.service.ts` 整檔 ~0 lines
- [x] T5 提示字串 `prospec steering` → `prospec knowledge init`：`knowledge.service.ts:123`、`mcp.service.ts:126,295` ~3 lines
- [x] T6 模板路徑字串 `steering/module-readme.hbs` → `knowledge/module-readme.hbs`：`knowledge.service.ts:202`、`knowledge-update.service.ts:166`（配合 T7）~2 lines

## Templates

- [x] T7 `git mv src/templates/steering/module-readme.hbs src/templates/knowledge/module-readme.hbs`；刪 `architecture.md.hbs`；移除空的 `src/templates/steering/` 目錄 ~0 lines
- [x] T8 `src/templates/change/proposal.md.hbs:24` 提示字串 → `prospec knowledge init` ~1 line
- [x] T9 `src/templates/skills/references/feature-spec-format.hbs:21` 移除 `Steering, ` ~1 line

## Lib

- [x] T10 `src/lib/module-detector.ts:211` JSDoc 去 `steering` 字樣（函式不動）~1 line

## Tests

- [x] T11 [P] 刪除 `tests/unit/cli/steering-output.test.ts`、`tests/unit/services/steering.service.test.ts`、`tests/integration/steering-flow.test.ts`，及 `.tasks/main/cov-targets/` 三筆 steering 筆記 ~0 lines
- [x] T12 `tests/unit/cli/index.test.ts`：移除 steering mock(L37-40) **與** 指令名陣列項(L140) ~5 lines
- [x] T13 `tests/contract/cli-output.test.ts`：移除 toContain(L75) 與 `describe('prospec steering --help')`(L109-121) ~14 lines
- [x] T14 `tests/e2e/cli.test.ts`：移除 help 斷言(L71) 與 `describe('prospec steering')`(L207-238) ~33 lines
- [x] T15 mcp 提示字串測試 regex → `prospec knowledge init`：`mcp.service.test.ts:181,338`、`mcp-server.test.ts:236,239`（與 T5 lockstep）~4 lines
- [x] T16 更新 22 處模板路徑字串 → `knowledge/module-readme.hbs`：`knowledge.service.test.ts`(×6)、`knowledge-update.service.test.ts`(×4)、`knowledge-format.test.ts`(×12)（配合 T7）~22 lines

## Specs（trust zone）

- [x] T17 `prospec/specs/features/project-setup.md` 退役：移除 US-004 + REQ-SETUP-008/009/010；frontmatter `req_count` 30→27、`story_count` 12→11；reword L15；改 US-006/REQ-SETUP-013 場景(L203/209-210) 指向 knowledge init；移除 edge-case(L402)、SC-3(L415，其餘 SC 連號)；Deprecated Requirements 留 `_(None)_`（交 archive 自動填）~25 lines
- [x] T18 `prospec/specs/features/mcp-server.md:55,146` REQ-MCP-006 提示字串 in-place → `prospec knowledge init` ~2 lines
- [x] T19 `prospec/specs/features/ai-knowledge.md:62` REQ-SERVICES-025 移除「與 steering 共用 buildModuleMap／補 deprecated 缺口」敘述 ~2 lines

## 計數重新衍生（PB-004，於 T22 跑完 pnpm test 後取實數）

- [x] T20 [M] 跑 `pnpm test`，記錄實際測試總數與分層數（unit/contract/integration/e2e）與檔案數，供以下計數同步 ~0 lines
- [x] T21 `README.md`：`.hbs` 57→56(L645)、services 計數 -1(L642)、測試計數(L664/681-685) 套用 T20 實數；`README.zh-TW.md` 測試計數(L637/654-658) 與（若有）結構樹計數同步 ~10 lines
- [x] T22 `prospec/ai-knowledge/_index.md`：services 列（去 `steering` keyword + base_dir 子句、services 15→14、files 17→16）、cli 列（commands 13→12、formatters 15→14、files 32→30）、templates 列（`.hbs` 57→56、`init/steering/knowledge`→`init/knowledge`）、tests 列（files 76→73、測試計數套 T20） ~6 lines
- [x] T23 [P] `_glossary.md:18` 移除 Steering 列；`module-map.yaml:75`(去 services `- steering` keyword)、`:121`(`init/steering/knowledge`→`init/knowledge`) ~3 lines

## Module READMEs（trust zone；PB-005 — 每個被動到源碼的模組都要觸及）

- [x] T24 `modules/services/README.md`：header files 17→16；刪 steering.service 列(L14)/Public-API(L34)/Modification-Guide item(L55，renumber)；L54/62 路徑 `steering/`→`knowledge/`；L57/63 去 steering ~10 lines
- [x] T25 `modules/cli/README.md`：header files 32→30；commands 13→12、formatters 15→14；L14 parseDepth 去 steering；`modules/templates/README.md`：header `.hbs` 57→56、directories 7→6、L12 路徑 `steering/`→`knowledge/module-readme.hbs`；`modules/tests/README.md`：header files 76→73、測試計數套 T20、刪 steering 測試列(若有) ~12 lines
- [x] T26 `modules/lib/README.md`(L42/70 去 steering)、`modules/types/README.md`(L65 去 steering) ~4 lines

## Verification

- [x] T27 [M] `pnpm typecheck && pnpm build` 全綠；`prospec agent sync` 重生 feature-spec-format mirror；coverage ≥ 80% ~0 lines
- [x] T28 [V] 殘留驗證：`grep -rn "prospec steering\|steering/module-readme\|templates/steering" src tests` 歸零（specs/knowledge 僅命中 Deprecated/歷史）；`prospec check --json` drift 全綠；所有計數副本一致 ~0 lines

## Summary

- **Total Tasks:** 28（code 24、[M] 3、[V] 1，含 [P] 2）
- **Parallelizable Tasks:** 2
- **Total Estimated Lines:** ~170 lines（多為刪除/路徑與計數同步）
