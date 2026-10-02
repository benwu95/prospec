# gate-module-map-writers — Archive Summary

- **Archived**: 2026-10-02
- **Original Created**: 2026-10-02T15:50:58.357Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/328

## User Story

As a 在專案中執行 `prospec knowledge update --module <m>` 與 `prospec knowledge verify <m>` 的 agent,
I want 所有讀寫 `module-map.yaml` 的 knowledge writer 在第一次寫入之前，都以 delta 模式相同的 `readKnownModules` 判定 map,
So that 同一次執行不會一邊把 root 外的 map 當成不存在、一邊讀寫它的內容，戳記也只會寫進 knowledge root 內、通過驗證的 map。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | Medium | `knowledge-update.service.ts`：`readKnownModules` 判定從 delta 分支移到 `execute()` 入口，所有模式在寫入前拒收不可信的 map（delta 後綴不變、其餘為 `— nothing was written`）；curated backfill、`collectAllModules`、`updateModuleMap` 改走 contained reader，fallback 抽成 `appendResultRows`。`knowledge-verify.service.ts`：蓋章前判定，讀取改用 `readModuleMapRaw` |
| tests | Medium | 兩個 service 單元測試新增 21 個測試：root 外 symlink、不可解析、schema 失敗、目錄、不存在、dangling symlink、root 內 symlink、無選項呼叫、匯出 helper |
| knowledge | Low | services README 一句；`pnpm counts` 同步測試計數（6,888 → 6,909）；`services`、`tests` 蓋章 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-023 | MODIFIED | 每一種 knowledge-update 模式在第一次寫入前經 `readKnownModules` 判定 map，unreadable 即以其 cause／remedy 拒絕；判定後只經 contained reader 讀 map |
| REQ-SERVICES-090 | MODIFIED | `knowledge verify` 寫入任何 `last_verified` 前經 `readKnownModules` 判定，unreadable 即拒絕；不存在沿用 `not found`；讀取走 contained reader |

## Completion

- **Tasks**: 9/9 code tasks（100%）；[V] 5/5（T14 於 feature commit `83fcaaf3` 後重跑 `knowledge:check` 通過）
- **Acceptance Criteria**: 9/9 凍結情境（verify 2/5 無 scenario_findings）

## Review & Verify

- **Review**: 3 輪（fresh-subagent），0 critical／2 major／4 minor。R1-1（major）：curated backfill 與 `updateIndex` 以未 contain 的 `readFileIfExists` 讀寫 `index.md`；R2-1（major）：`modules/` 為 root 外 symlink 時 `updateModuleReadme` 把 skeleton 寫到 root 外——兩者皆為 main 既有缺陷，依使用者決定移交 #335。R1-2 補非 delta 後綴斷言、R1-3 補 root 內 symlink characterization、R2-2 刪除 R1-3 修正時寫錯的測試註解、R3-1 把 delta-spec 兩條 bullet 改為以 module-map schema 為前提。fix-induced ratio：round 2 40%、round 3 50%（未超過 breaker 門檻）。
- **Verify**: Grade S；1/5、4/5、5/5 machine PASS，2/5（2/2 REQ executable PASS）、3/5（8/8 原則）fresh-subagent PASS，6 not-applicable；`pnpm test` 6905 passed／4 skipped，coverage 96.49% statements／90.85% branches。
- **Quality Log**: plan verifier WARN（7 條：dangling symlink 與目錄情境、bullet 改 `cannot be read, parsed or validated`、US-3.2／US-3.3 bullet、改 023 而非 032 的理由、types／templates 不修改、module-detector 呼叫端、090 錨定寫入前）；tasks verifier 第 1 輪 FLAWS（T11 只蓋 `services`，漏 `tests`；commit 前 `knowledge:check` 為 skipped 假綠）→ 第 2 輪 WARN；review 三輪皆 WARN（major 移交 #335）。
- **Mutation**: 入口判定移回 delta 分支 → 6 個新測試轉紅；刪除 verify 判定 → 4 個轉紅；非 delta 後綴寫死為 delta 字串 → 2 個轉紅；皆以 sha256 確認還原。

## Knowledge Update

- `prospec/ai-knowledge/modules/services/README.md`、`modules/tests/README.md`、`module-map.yaml`、`prospec/index.md` 已在 feature commit 同步；`knowledge update --change` 確認 services 已更新、tests 為 stamp-only，重跑後輸入不變。
- 後續：#335（`index.md` 與模組 README 的 contained 讀寫、`modules/` 目錄 symlink、root 內 symlink 的寫入語意）。`reference/cli-reference.md:123` 的「With `--change`, refuses …」仍為真但不完整（`--module` 與 `knowledge verify` 也會拒收），留待 #335 一併補述。
