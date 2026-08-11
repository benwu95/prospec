# add-status-router — Archive Summary

- **Archived**: 2026-07-29
- **Original Created**: 2026-07-29
- **Quality Grade**: S

## User Story

As a **prospec 使用者的 AI agent**（session start 需要恢復工作位置），
I want **一個 `prospec status` 命令，從 `.prospec/changes/` 各 change 的 metadata 算出 (current node, next node, blocking gates, 理由)**，
So that **站序推導是可測試的決定論程式碼，而不是每次 session 由 LLM 重新解讀散文**。

（US-2：entry config 的 Session Start 散文改為一行 `prospec status` 指向，L0 淨減 545→330 chars。來源：GitHub issue #97 / BL-048。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | 新 `status.ts`：SDD_STATIONS 站序（含無狀態轉換站排位）、STATION_SKILLS、ChangeRouteFacts/ChangeRoute/StatusReport 契約 |
| lib | High | 新 `status-router.ts`：I/O-free 純路由器，`_status-lifecycle.md` 的可執行版本 |
| services | High | 新 `status.service.ts`：唯讀掃描＋facts 收集＋逐 change 容錯 |
| cli | Medium | 新 `commands/status.ts` + `formatters/status-output.ts`（14→15 命令） |
| templates | Medium | `entry.md.hbs` Session Start 改指向；兩份 status-lifecycle 補 executable-copy 指向與 quick×design 裁決 |
| tests | High | router 矩陣／service memfs／formatter unit＋contract 正負斷言＋e2e ×3（2470 tests） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-070 | ADDED | 路由報告契約與站序常數 |
| REQ-LIB-035 | ADDED | 純路由評估器（quick 跳站、backfill 入口、design/review 排位、B/C/D 停留） |
| REQ-SERVICES-070 | ADDED | status 服務（掃描＋facts＋壞記錄指名回報不中斷） |
| REQ-CLI-023 | ADDED | `prospec status` 命令與 formatter（sanitizeTerminal） |
| REQ-TEMPLATES-158 | ADDED | entry config Session Start 指向命令（淨減＋fallback＋雙份 lifecycle 指向行） |
| REQ-TESTS-058 | ADDED | 路由測試矩陣與契約更新（46 個 archived changes 回溯驗證 0 失敗） |
| REQ-TEMPLATES-099 | MODIFIED | New-Session 偵測由散文推導改為執行 `prospec status` |

## Completion

- **Tasks**: 20/20（100%；code 15/15、[M] 2/2、[V] 3/3）
- **Acceptance Criteria**: SC-001~004 全數達成（回溯 46/46 PASS、backfill 入口 fixture 釘住、Session Start 淨減、skill 數維持 17）

## Review & Verify

- **Review**: 2 round(s), 0 critical / 4 major — round 1 全數解決（ui_scope 佔位行誤判修復、死欄位 hasPlan sweep、dual-copy 斷言補釘、quick×design 裁決文件化）；round 2 為 knowledge-size 壓縮的 narrow pass（0/0）
- **Verify**: Grade S — 1/5、4/5、5/5 [machine] PASS（prospec check 13/13、0 warn）、2/5 [judgment fresh-context] PASS（7 REQ 全過）、3/5 [mixed] PASS（6/6 rules 1:1）、6 not-applicable（ui_scope: none）；`pnpm test` exit 0（2470 tests）
- **Quality Log**: 1 WARN（new-story INVEST advisory：US-2 對 US-1 順序依賴——已由變更內交付順序化解），其餘 PASS

## Knowledge Update

已於 verify S/A commit 摺入 feature commit（362d73b）：六個模組 README、module-map/index 關鍵字、`pnpm counts` 計數、root README 雙語命令列。
