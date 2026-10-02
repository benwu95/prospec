# contain-knowledge-sync-map-reads — Archive Summary

- **Archived**: 2026-10-02
- **Original Created**: 2026-10-02T13:40:23.290Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/324

## User Story

As a 使用 prospec 閘門的開發者,
I want 指向 knowledge root 外的 `module-map.yaml`，不論 change 有沒有 delta-spec，閘門都判為 `moduleMapUnreadable`；root 外的 `feature-map.yaml` 在分類 context 中 raise,
So that 閘門結果不會因為 change 是否帶 delta-spec 而翻轉，也不會把 root 外的 map 讀成「沒有 map」或「沒有 feature prefix」而放行。

另外移除 `module-map.yaml` 的 cli→lib 依賴邊（cli 實際零 lib 匯入，ESLint 禁止），讓 `prospec/index.md` 的 Depends On 與層級規則一致。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `knowledge-sync.ts`：`buildModulePathMap(knowledgePath)` 改走 `readContained`；`resolvesOutsideRoot` 以 contained read 的 `escaped` 判定；`findUnsyncedModules` 在 ctx 路徑與 `loadModuleMap` null 路徑標記 `moduleMapOutsideRoot`；`knowledgeSyncReasons` 用 outside-root cause／remedy；`loadDeltaModuleContext` 對 root 外 feature map 丟 `PrerequisiteError` |
| services | Low | `knowledge-update.service.ts` manual 模式改傳 `knowledgePath` |
| tests | Medium | knowledge-sync、archive-gate、knowledge-update 單元測試新增 F2／F4／F5／F6、提早 return、dangling symlink、manual 路徑 fixture |
| knowledge | Low | module-map 移除 cli→lib 邊與 lib rationale 的 CLI；index.md 重生；services README 一句 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-097 | MODIFIED | 去除 contained 限定；root 外 module map 判 unreadable（`moduleMapOutsideRoot`）、root 外 feature map 由 `loadDeltaModuleContext` raise |
| REQ-LIB-071 | MODIFIED | `moduleMapOutsideRoot` 時 remediation 改為把 `module-map.yaml` 放回 knowledge root |
| REQ-SERVICES-032 | MODIFIED | delta 模式遇 `loadDeltaModuleContext` 對 feature map raise 時，在分類與寫入前失敗 |

## Completion

- **Tasks**: 15/15 code tasks（100%）；[V] 2/2、[M] 1/1（T18 已開 #328）
- **Acceptance Criteria**: 13/13 凍結情境（verify 2/5 無 scenario_findings）

## Review & Verify

- **Review**: 3 輪（fresh-subagent），0 critical／4 major，全數修正。R1-1 ctx 路徑缺 `moduleMapOutsideRoot` 負向斷言（補測試，殺死兩個存活 mutation）；R1-2 lib README 宣稱漏前提（第 2 輪仍有殘留，第 3 輪改為刪除該宣稱）；R1-3 lib rationale 仍寫 shared with CLI；R1-4 REQ-LIB-071 bullet 把取代寫成附註。fix-induced ratio 0%。
- **Verify**: Grade S；1/5、4/5、5/5 machine PASS，2/5（3/3 REQ executable PASS）、3/5（8/8 原則）fresh-subagent PASS，6 not-applicable；`pnpm test` 6884 passed／4 skipped，coverage 96.49% statements。
- **Quality Log**: plan verifier 第 1 輪 FLAWS（feature map 優先前提、提早 return 漏標、REQ-SERVICES-032 未列 MODIFIED、US-4 無 REQ）→ 第 2 輪 WARN（REQ-LIB-071 未列 MODIFIED、status／archive 只保留 message、knowledge verify 漏列）；tasks verifier 第 1 輪 FLAWS（index 重生排在 contract 測試之後、缺 `pnpm counts`）→ 第 2 輪 WARN；review 第 1、2 輪 WARN（major），第 3 輪 PASS。
- **Mutation**: 6 個 mutation 全部 killed（見 `mutation-log.md`）。

## Knowledge Update

- `prospec/ai-knowledge/modules/services/README.md`、`prospec/ai-knowledge/module-map.yaml`、`prospec/index.md` 已在 feature commit 同步；lib README 經 review 後維持原樣（行為由 REQ-LIB-097 陳述）。
- 後續：#328 讓 `knowledge update` 非 delta 模式與 `knowledge verify` 也先經 `readKnownModules` 判定 module map。
