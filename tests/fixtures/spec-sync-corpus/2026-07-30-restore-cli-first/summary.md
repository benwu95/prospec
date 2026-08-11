# restore-cli-first — Archive Summary

- **Archived**: 2026-07-30
- **Original Created**: 2026-07-29
- **Quality Grade**: A

## User Story

作為 prospec 的維護者與使用 skill 的 AI agent，
我要把 skill 中所有**確定性操作**統一交由 `prospec` CLI 執行、CLI 成為 skill 的必須檔案，
以消除 LLM 手工模擬既有語義帶來的漂移與 token 浪費，讓判斷留給 skill、變換與落盤全為決定論。

涵蓋 5 個 User Story：US-1 工作流 scaffold/狀態交 CLI、US-2 補齊缺席的指令面、US-3 CLI 由
optional 翻轉為 required、US-4 重型站點引擎 CLI 化、US-5 定位文件同步反轉。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| cli | High | 11 個新指令面（change log/status/scale/progress、knowledge update、review merge、verify record、learn upsert、validate、archive finalize、agent triggers --write）＋對應 formatter；移除 `knowledge generate` |
| services | High | 8 個新 service；knowledge-update 縮限佈線（create-only README、保註解 module-map）、archive finalize、agent-triggers 寫回、check 蓋 change_digest |
| lib | High | 5 個純引擎（verify-grade／review-merge／lessons-ledger／artifact-validators／markdown-table）＋date-utils；appendQualityLogEntry |
| types | Medium | station.ts 站點 I/O 契約、MINIMUM_CLI_VERSION、NewQualityLogEntrySchema、InvalidTransitionError、drift-report change_digest |
| templates | High | `_cli-probe.hbs` 必裝探針單一來源；17 個 skill 全面委派改寫；metadata-format／review-format 改讀者視角；archive Phase 3.7 |
| tests | High | 106→132 檔、2526→2774 測試；CLI-first contract describe（負向斷言 mutation-verified）、每個新指令 e2e |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-CLI-025 | ADDED | change 生命週期寫入指令（log／status／progress） |
| REQ-CLI-026 | ADDED | `knowledge update` 縮限佈線孤兒 service |
| REQ-CLI-027 | ADDED | `agent triggers --write` 寫回模式 |
| REQ-CLI-028 | ADDED | `review merge` 審查發現合併（identity 鍵） |
| REQ-CLI-029 | ADDED | `verify record` 評分與落盤（machine 維度自證） |
| REQ-CLI-030 | ADDED | `learn upsert` ledger 引擎 |
| REQ-CLI-031 | ADDED | `validate <kind>` artifact 結構驗證 |
| REQ-TEMPLATES-160 | ADDED | 必裝探針共用 partial（CLI required 姿態） |
| REQ-TEMPLATES-161 | ADDED | 工作流 skill 委派 scaffold／status／log |
| REQ-TEMPLATES-162 | ADDED | knowledge-update skill 委派機械部分 |
| REQ-TEMPLATES-163 | ADDED | review／verify／learn skill 委派站點引擎 |
| REQ-TEMPLATES-164 | ADDED | design skill 委派結構檢查 |
| REQ-TEMPLATES-165 | ADDED | backfill／promote skill 委派驗證與 scaffold |
| REQ-TESTS-059 | ADDED | cli-first 委派的四層測試覆蓋 |
| REQ-AGNT-012 | MODIFIED | skill 自主建檔 → 一律經 `prospec change` 指令 |
| REQ-CLI-024 | MODIFIED | archive 新增後置 `finalize` 子指令 |
| REQ-SERVICES-071 | MODIFIED | dryRun 語義延伸至 finalize |
| REQ-SERVICES-021 | MODIFIED | updateModuleReadme 改 create-only（不再 gut 授權知識） |
| REQ-SERVICES-023 | MODIFIED | coordinator 對 MODIFIED 跳過 README，回報 readmePending |
| REQ-TEMPLATES-153 | MODIFIED | 刪除 engine-unavailability WARN 豁免類 |
| REQ-TEMPLATES-145 | MODIFIED | 結構化 quality_log 改由 CLI 寫入 |
| REQ-TEMPLATES-158 | MODIFIED | entry config Session Start 移除 fallback |
| REQ-TEMPLATES-159 | MODIFIED | archive skill 委派收斂（無手動 fallback） |
| REQ-TEMPLATES-108 | MODIFIED | quickstart 探針改共用 partial＋triggers 寫回 |
| REQ-TEMPLATES-121 | MODIFIED | upgrade 同上；stale `knowledge update` 引用修復 |
| REQ-KNOW-026 | REMOVED | persona-aware CLI fallback 階梯（required 姿態下無服務對象） |

## Completion

- **Tasks**: 27/27 code tasks (100%)；`[M]`×2、`[V]`×1 皆已執行
- **Acceptance Criteria**: 26 REQ 的 AC 全數經獨立 fresh-context 審計者逐條核對（2/5 = PASS）

## Review & Verify

- **Review**: 4 round(s)，8 critical / 22 major — criticals 全數 verifier 確認後修復（review-merge 跳脫不對稱、finalize 誤數 h3-only story、ledger 表中空行截斷、init 缺探針地板注入、change status 可跳 gate-owned、backfill 1/5 未標 not-applicable、review-format 參考未更新、knowledge-update REMOVED 宣稱不符）；majors 依使用者指示全數處置（18 修復、M12 → backlog BUG-002 deferred、M10 未複現不盲修）
- **Verify**: Grade A；machine 帳本 1/5 PASS · 4/5 WARN（commit 後轉 PASS）· 5/5 PASS，judgment 帳本 2/5 PASS · 3/5 PASS（6/6 rules）· 6 not-applicable；`pnpm test` 132 檔 2774 綠、coverage lines 94.66%
- **Quality Log**: ff WARN（US-4 Small 邊緣、26 REQ/29 tasks 超指引，使用者裁決「一次全做」）；review WARN×3（majors 提案）；verify WARN×1（首輪 B：spec-text drift 已修）＋最終 A 保留 2 WARN（探針地板 1.0.0 刻意先行於 package.json、knowledge-health git 時間戳）

## Knowledge Update

已於 verify S/A commit prompt 同步（與 feature commit 同筆落地，knowledge-health 由 WARN 轉 0 stale）：
- `prospec/ai-knowledge/modules/{cli,services,lib,types,templates,tests}/README.md`
- `prospec/ai-knowledge/module-map.yaml`（修為準確單一來源）與 `prospec/index.md`（自其重生）
