# serialize-test-runs — Archive Summary

- **Archived**: 2026-11-24
- **Original Created**: 2026-11-23
- **Quality Grade**: S
- **Issue**: #461
- **Plan Decision**: hybrid (graded_by: human)

## User Story

As a 同時讓多個 agent 在不同 worktree 開發的開發者，
I want 同一個 repo 的完整測試依取號順序一次只執行一個，
So that 測試結果不受其他 agent 的測試影響。

共五個 story：US-1 依取號順序一次只執行一個、US-2 等待有上限且不留下失敗紀錄、US-3 被中斷的測試不留下仍在執行的程序、US-4 工作流程外的完整測試共用同一個佇列（`prospec exclusive`）、US-5 Skill 與文件引導 agent 經由佇列執行完整測試。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | 佇列的持久化與 busy 契約、兩個設定鍵、三個 typed error |
| lib | High | 佇列規則（純函式）、佇列儲存與 mutex、process-tree runner、no-clobber 建立 helper |
| services | High | `check --record-tests` 在執行權下記錄；新的 `exclusive.service` |
| cli | Medium | 新的 top-level 指令 `prospec exclusive`、busy 與等待輸出、exit code |
| templates | Medium | project-test-runner 的佇列指引、verify 的 busy 子句、設定範例 |
| tests | High | 佇列、程序樹、兩個入口與多程序競爭的測試 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-119 | ADDED | 佇列狀態 schema、busy 契約、預設限制與兩個設定鍵 |
| REQ-LIB-112 | ADDED | 取號、授予、失效與回收的規則（純函式） |
| REQ-LIB-113 | ADDED | 每個 repository 一個佇列、mutex、`withTestQueue` 的取得→執行→歸還 |
| REQ-LIB-114 | ADDED | process-tree runner、三態程序狀態、終止範圍 |
| REQ-SERVICES-132 | ADDED | `exclusive.service`：在執行權下執行一個指令 |
| REQ-CLI-065 | ADDED | `prospec exclusive`、兩個入口共用的 busy 與等待輸出、exit code |
| REQ-TEMPLATES-276 | ADDED | Skill 參考文件與設定範例的佇列指引 |
| REQ-TESTS-149 | ADDED | 佇列與程序樹的測試要求（含多程序競爭與隨機 SIGKILL） |
| REQ-LIB-033 | MODIFIED | 測試指令 runner 改為非同步並委派 process-tree runner |
| REQ-SERVICES-068 | MODIFIED | record-tests 先取得執行權再寫入 `running` |
| REQ-TYPES-116 | MODIFIED | `test_timeout_ms` 上限的理由改為 runner 的計時器 |
| REQ-TEMPLATES-154 | MODIFIED | project-test-runner 參考文件加入排隊執行的規則 |

## Completion

- **Tasks**: 28/28 (100%)；`[V]` T30（push 後確認 CI 的 ubuntu 與 `windows-smoke`）於封存時尚未勾選
- **Acceptance Criteria**: 21/21（verify 2/5 未回報任何凍結情境的偏離）

## Review & Verify

- **Review**: 5 round(s)（四輪加上 verify 後重入一輪），1 critical / 5 major，另有 10 個 minor，全部修正 — critical 為 release 先移除號碼並放開 mutex 才終止仍登記的程序樹（獨立 verifier 確認後修正並加上回歸測試）；major 包含 mutex 安全條件與訊號 exit code 接線缺少會轉紅的測試、Windows shim 的補救文字對 `exclusive` 不成立
- **Verify**: Grade S，task-completion／knowledge／tests 皆 PASS，delta-spec-compliance 與 constitution 皆 PASS（fresh-subagent），design 為 not-applicable；`pnpm test` exit 0（363 檔、9,841 通過、4 skipped），coverage 96.95%。第一次評定曾回報 REQ-LIB-113 的 zombie mutex owner、release 警告條文與 CLI reference 的 service 數量，修正並重評後才記錄
- **Quality Log**: prospec-plan FAIL ×2（verifier r1、r2：逾期終止未驗證程序身分、程序樹存活判定只看 leader），後續輪次收斂為 WARN；prospec-new-story WARN ×1（五個 story 跨六個模組）、prospec-tasks WARN ×2（任務數在上限、估計行數偏低）、prospec-review WARN ×8（各輪發現與修正紀錄；round 4 的兩項 minor 修正未再經獨立複審）

## Known Limits

- Windows 上的行為（無啟動時間讀數、無 process group）未在 Windows 主機執行，封存時 CI 尚未跑過
- 程序在持有 mutex guard 目錄時被 SIGKILL，之後的呼叫會被拒絕並指名需人工移除的路徑
- 主機身分只看 hostname；自行建立 session 或 process group 的衍生程序不在追蹤範圍內

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/test-queue.md`（新增）
- `prospec/ai-knowledge/modules/{types,lib,services,cli,templates,tests}/README.md`
