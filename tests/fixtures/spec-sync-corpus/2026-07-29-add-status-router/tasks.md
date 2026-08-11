# Tasks: add-status-router

## Types

- [x] T1 定義站序常數與路由契約型別（`StatusReport`/`ChangeRouteEntry`：current/next/blockingGates/reasons + per-change error entry），沿用 `CHANGE_STATUSES`/`CHANGE_SCALES` 不新增 status 值 ~60 lines

## Lib

- [x] T2 實作 `lib/status-router.ts` `routeChange(facts)` 純函式骨架：六狀態順序、每條邊的 next node + gate 宣告與理由（站表逐字取自 `_status-lifecycle.md`，PB-002） ~90 lines
- [x] T3 編碼特殊路徑：quick 的 story→tasks、backfill 的 implemented 合法入口（缺 plan/tasks 屬常態）、design 站插入（ui_scope≠none 且無 design-spec.md）、review 站以 `review_provenance` 判已做、verify 曾 B/C/D 的停留理由、archive 的 Knowledge-sync gate 宣告 ~70 lines

## Services

- [x] T4 實作 `services/status.service.ts` `execute()`：掃描 `.prospec/changes/`（缺目錄或無非 archived change → 乾淨狀態）、逐 change `readChangeMetadata` try/catch → 指名 error entry 不中斷、唯讀零寫入 ~70 lines
- [x] T5 facts 收集：plan/tasks/design-spec 存在性、`parseTaskLine` code-task 完成度、proposal.md `ui_scope` 解析、`review_provenance`/`quality_log`（最近 verify grade）萃取 ~60 lines

## CLI

- [x] T6 新增 `cli/commands/status.ts`（`registerStatusCommand`）並在 `index.ts` 註冊（14→15） ~40 lines
- [x] T7 新增 `cli/formatters/status-output.ts`（`formatStatusOutput`：成功 stdout、錯誤 stderr、自由字串過 `sanitizeTerminal`） ~60 lines

## Templates

- [x] T8 改寫 `agent-configs/entry.md.hbs` Session Start：指示執行 `prospec status`，附一行 CLI 不可用時退回 `_status-lifecycle.md` 的 fallback，移除掃描推導散文 ~10 lines
- [x] T9 兩份 lifecycle 文件（`init/status-lifecycle.md.hbs` + `prospec/ai-knowledge/_status-lifecycle.md`）各補一行「executable router = `prospec status`」同語句指向 ~6 lines
- [x] T10 [M] `pnpm bundle` → `npx tsx src/cli/index.ts agent sync` 重新生成 CLAUDE.md/AGENTS.md 與 skills 部署 ~5 lines
- [x] T11 [V] 比對 Session Start 段落前後 token 數，確認淨減（SC-003 證據） ~5 lines

## Tests

- [x] T12 [P] unit：router 全狀態 × 全 scale 矩陣（六狀態順序、quick 跳站、backfill 入口不判跳站、B/C/D 停留、design/review 依工作流排位） ~120 lines
- [x] T13 [P] unit：status.service memfs（多 change 逐一輸出、invalid metadata → 指名 error entry 且其餘照常、空/缺目錄 → 乾淨狀態、零寫入） ~90 lines
- [x] T14 [P] unit：formatter 輸出（含 sanitizeTerminal 路徑） ~50 lines
- [x] T15 contract：entry config 正向釘 `prospec status` 指向、負向釘散文推導已移除；同步更新既有 session-detection 斷言（REQ-TESTS-026 連動） ~40 lines
- [x] T16 e2e：真實 CLI 執行 `prospec status`（有 in-flight change 與乾淨狀態兩情境） ~50 lines
- [x] T17 [V] mutation-verify 新增契約斷言（刪除目標 token 須轉紅，PB-001） ~10 lines
- [x] T18 [V] 本機對 `.prospec/archive/` 46 個 change 回溯執行 router，驗證站序與 `_status-lifecycle.md` 一致（SC-001 證據記入 verify） ~10 lines

## Docs

- [x] T19 root `README.md`/`README.zh-TW.md` 命令清單補 `prospec status`（雙語同步，Constitution SHOULD） ~20 lines
- [x] T20 [M] `pnpm counts` 重導計數（新增測試檔後） ~5 lines

## Summary

- **Total Tasks:** 20
- **Parallelizable Tasks:** 3
- **Total Estimated Lines:** ~871 lines
