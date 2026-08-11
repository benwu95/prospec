# Proposal: add-drift-checker

> 來源：`planning/feature-bundles-2026-06-09.md` Bundle 3（Deterministic Drift Checker）
> 綁進的 backlog：BL-030（RESHAPE→決定性引擎）、OPT-A2（RESHAPE→檔案系統可得）、OPT-B3（消費波次 1 凍結的 kind schema）
> 探索收斂：2026-06-12 `/prospec-explore` 波次 2（#3 先行、OPT-A2 欄位於本 change 凍結）

## Background

G2「spec 是 source of truth」目前只有開發期的 LLM 手動驗證（`/prospec-verify`），CI 層沒有任何守門——指涉性 drift（REQ-ID 失引、檔案路徑失效、import 依賴方向反轉、Knowledge 過期）會無聲累積。本 change 新增完全確定性、零 LLM、可進 CI 主流程不燒 token 的 `prospec check` 指令，檢出 spec/code/knowledge 三方的**指涉與結構**不一致；語意一致性仍交給 `/prospec-review`，報告中明確標示 `not-checked`、不偽裝 PASS。

## User Stories

### US-1: 結構一致性檢查指令 [P1]

身為一名維護 spec 與 code 同步的開發者，
我想要一個確定性的 `prospec check` 指令，檢出懸空的 REQ-ID 引用、失效的檔案路徑引用、違反方向的模組依賴，
以便結構性 drift 在累積成真實混亂之前被機器抓到，而不依賴人工或 LLM 審查。

**Acceptance Scenarios:**

- WHEN 某文件引用的 REQ-ID 在 `prospec/specs/features/` 中不存在，THEN `prospec check` 回報該檢項 FAIL，並列出引用位置（檔案 + 行號）與失引的 REQ-ID
- WHEN 文件（specs/knowledge）中引用的 repo 內檔案路徑實際不存在，THEN 回報 FAIL 並列出來源位置與失效路徑
- WHEN 原始碼 import 違反專案宣告的模組依賴方向（以 `module-map.yaml` 的 `depends_on` 為準；缺失時退回 Constitution 宣告的分層），THEN 回報 FAIL 並列出違規的 import 邊
- WHEN 本 repo 處於一致狀態，THEN `prospec check` 以 exit code 0 結束，三個結構檢項皆 PASS
- WHEN 連續兩次對相同的 repo 狀態執行，THEN 兩次檢查結果完全相同（確定性，無任何 LLM 或網路呼叫）

**Independent Test:**
在乾淨 repo 跑 `prospec check` 確認全 PASS；手動注入一個懸空 REQ-ID 引用、一個失效路徑、一個反向 import，確認三者各自被檢出且輸出位置正確；還原後再跑回到全 PASS。

### US-2: Knowledge 健康度檢查 [P2]

身為一名依賴 AI Knowledge 判斷上下文可信度的開發者，
我想要 `prospec check` 回報每個模組 README 的新鮮度（以 git commit 時間戳比對模組原始碼）與模組覆蓋率，
以便我（與下游消費者）能判斷 Knowledge 是否過期，而不是盲信。

**Acceptance Scenarios:**

- WHEN 某模組原始碼的最後 git commit 時間晚於該模組 README 的最後 git commit 時間且超過容許範圍，THEN 回報該模組 staleness WARN，並列出兩個時間戳
- WHEN `module-map.yaml` 中的模組缺少對應的 README，THEN 覆蓋率檢項回報缺口（N/M 模組有 Knowledge）
- WHEN 健康度資訊產出，THEN 報告中包含結構化的健康度區段（欄位凍結，供 #4 Knowledge Flywheel 與 #5 MCP server 直接消費，不得各做一份）
- WHEN 執行環境無法取得 git 時間戳（如非 git 環境），THEN staleness 檢項標示 `skipped (source unavailable)`，不偽裝 PASS

**Independent Test:**
對某模組原始碼提交一個新 commit 而不更新其 README，跑 `prospec check` 確認該模組被標 stale；更新 README 並提交後確認回到 PASS。

### US-3: Code-task 完成率檢查 [P2]

身為一名在歸檔前確認工作完成度的開發者，
我想要 `prospec check` 讀取 active change 的 `tasks.md`，只以 code task 計算完成率（`[M]`/`[V]` kind 標記依波次 1 凍結的 schema 判讀），
以便完成率反映真實的程式工作，不被 manual/verification task 失真。

**Acceptance Scenarios:**

- WHEN active change 的 `tasks.md` 存在且有未勾選的 code task，THEN 完成率檢項回報未完成的 code task 清單與比率
- WHEN 未勾選的 task 全部為 `[M]`/`[V]` kind，THEN 完成率檢項不判 FAIL（manual/verification 不計入 code 完成率）
- WHEN 執行環境沒有 `.prospec/changes/`（如 CI checkout，該目錄不入版控），THEN 此檢項標示 `skipped (source unavailable)`，不偽裝 PASS 也不誤判 FAIL

**Independent Test:**
在含未完成 code task 的 change 上跑 `prospec check` 確認檢出；把該 task 改標 `[M]` 後確認不再計入；移除 `.prospec/changes/` 後確認檢項變 skipped。

### US-4: 機器可讀報告與 CI 閘門 [P1]

身為一名為團隊把守 main 分支的 maintainer，
我想要 `prospec check` 輸出機器可讀的 `prospec-report.json`、提供 `--strict`（任何 FAIL → exit 1），並附 GitHub Actions workflow 模板，
以便 drift 檢查進 CI 主流程強制執行，且不在 CI 燒任何 token。

**Acceptance Scenarios:**

- WHEN 以 `--json` 執行，THEN 產出 `prospec-report.json`，schema 明確分層 structural / semantic，semantic 層恆標 `not-checked`（語意一致性屬 `/prospec-review`，不偽裝 PASS）
- WHEN 以 `--strict` 執行且存在任一 FAIL，THEN exit code 為 1；無 FAIL（含 WARN/skipped）時 exit code 為 0
- WHEN 套用隨附的 `.github/workflows` 模板，THEN CI job 執行 `prospec check --strict`、上傳 `prospec-report.json` 為 artifact，並以現成第三方 action 將報告摘要貼為 PR comment（不自寫 comment bot）
- WHEN 報告中存在 skipped 檢項，THEN 報告與 PR comment 摘要均明示 skipped 原因，不計入 PASS

**Independent Test:**
本 repo 跑 `prospec check --json --strict` 確認 exit 0 且報告 schema 合規；注入一個懸空 REQ-ID 後確認 exit 1 且報告含該 FAIL 細節。

### US-5: /prospec-verify 開發期整合 [P1]

身為一名在開發期執行 `/prospec-verify` 的開發者，
我想要 verify 的結構性維度直接執行 `prospec check --json` 並解讀其結果，
以便開發期與 CI 用的是同一個檢查引擎，結果一致、不重複用 LLM 做機器能做的事。

**Acceptance Scenarios:**

- WHEN `/prospec-verify` 執行且 `prospec check` 指令可用，THEN 結構性檢查結果來自 `prospec check --json` 的報告，verify 不以 LLM 重做這些檢項
- WHEN `prospec check` 指令不可用（如未 build），THEN verify 明示工具缺席並退回既有行為，不默默跳過結構檢查
- WHEN check 報告含 FAIL，THEN verify 對應維度引用報告中的位置資訊呈現，與 CI 看到的同一份事實

**Independent Test:**
在本 repo 跑 `/prospec-verify`，確認其結構性維度的輸出引用了 `prospec check` 的報告內容；暫時移除 build 產物後再跑，確認 verify 明示退回。

## Edge Cases

- `prospec/specs/features/` 不存在或為空：US-1 的 REQ-ID 檢項標 `skipped (source unavailable)`，非 FAIL
- `_archived-capabilities/`、`_archived-history/` 內的 REQ-ID：不納入存在性檢查範圍（歷史文件允許指向已退役的 REQ）
- shallow clone（git 歷史不完整導致時間戳缺失）：staleness 檢項對受影響模組標 skipped 並註明原因
- `module-map.yaml` 缺失：依賴方向檢查退回 Constitution 既定方向（`cli → services → lib → types`）；覆蓋率檢項標 skipped
- 同一檔案多筆違規：全部列出，不因第一筆中斷（報告完整性優先）
- 報告中任何「無法檢查」狀態（semantic、source unavailable）一律顯式標示，嚴禁以 PASS 呈現

## Functional Requirements

- **FR-001**: 提供 `prospec check` 指令，零 LLM、零網路呼叫（git 本地操作除外），同一 repo 狀態下輸出確定性結果
- **FR-002**: 檢出文件對 `prospec/specs/features/` REQ-ID 的懸空引用，含來源位置
- **FR-003**: 檢出文件中失效的 repo 內檔案路徑引用，含來源位置
- **FR-004**: 檢出違反專案模組依賴宣告的 import 邊（`module-map.yaml` `depends_on` 驅動；缺失時退回 Constitution 宣告方向）——通用於任何 prospec 專案，非本 repo 專屬
- **FR-005**: 以 git commit 時間戳比對模組原始碼與 README，回報 staleness 與模組覆蓋率；健康度區段欄位於本 change 凍結，供下游（#4/#5）消費
- **FR-006**: 讀取 active change `tasks.md`，依凍結的 kind schema（`[M]`/`[V]`）只以 code task 計算完成率
- **FR-007**: 每個檢項宣告料源可用性；料源不可用時標 `skipped (source unavailable)`，不偽裝 PASS、不誤判 FAIL
- **FR-008**: `--json` 輸出 `prospec-report.json`，schema 分層 structural / semantic，semantic 恆為 `not-checked`
- **FR-009**: `--strict` 在任一 FAIL 時 exit 1；WARN 與 skipped 不影響 exit code
- **FR-010**: 隨附 `.github/workflows` 模板：執行 `--strict`、上傳報告 artifact、以現成 action 貼 PR comment 摘要
- **FR-011**: `/prospec-verify` 的結構性維度改為執行 `prospec check --json` 並解讀結果；指令不可用時明示退回

## Success Criteria

- **SC-001**: 本 repo 處於一致狀態時 `prospec check --strict` exit 0，報告含五個檢項各自的明確狀態
- **SC-002**: 注入人工 drift（懸空 REQ-ID / 失效路徑 / 反向 import 各一）後 `--strict` exit 1，三筆 FAIL 均含可定位的來源資訊
- **SC-003**: 對相同 repo 狀態連續執行兩次，報告內容（時間戳欄位除外）完全一致
- **SC-004**: 報告 semantic 層在任何執行下均為 `not-checked`，grep 不到 semantic 的 PASS
- **SC-005**: 既有 757 tests 全綠不退；五個檢項的純函式均有單元測試（TDD：測試先於或伴隨實作提交）
- **SC-006**: 在無 `.prospec/changes/` 的目錄執行時，完成率檢項呈現 skipped 且整體 exit code 不受其影響

## Related Modules

- **types**: 新增 drift report 的 Zod schema（structural/semantic 分層、檢項狀態列舉）——keywords `schema`/`zod` 命中
- **lib**: 檢查引擎落點（零 LLM 純函式；複用既有 `constitution-rules` 的依賴方向編碼、`module-map` 讀取）——keywords `scanner`/`module-map`/`strategy` 命中
- **services**: 薄 service（execute() pattern）轉發 CLI 與引擎，維持「CLI 零業務邏輯」慣例——keywords `execute pattern` 命中
- **cli**: 新增 `check` 指令與 formatter（人讀輸出 + `--json`/`--strict`）——keywords `commands`/`formatters` 命中
- **templates**: `/prospec-verify` skill 模板改為 shell out 復用；新增 CI workflow 模板——keywords `skills` 命中
- **tests**: 五檢項單元測試 + report schema contract tests——keywords `unit`/`contract` 命中

## Open Questions

- [x] ~~**NEEDS CLARIFICATION**~~ **已決（plan 2026-06-12）**: staleness 預設 = src 的 git commit 晚於 README 即 WARN、v1 無寬限窗；嚴重度恆 WARN 永不 FAIL，故不破 CI——見 plan.md Overview 決策 (2) 與 delta-spec REQ-LIB-015
- [x] ~~**NEEDS CLARIFICATION**~~ **已決（plan 2026-06-12）**: PR comment 採 `marocchino/sticky-pull-request-comment`（sticky 不洗版、不自寫 bot）——見 plan.md Risk Assessment 註記與 delta-spec REQ-TEMPLATES-091
- [x] **已決（plan 2026-06-12）**: OPT-A2 的 `_index.md` Knowledge Health 表格回寫維持 scope-out——本 change 僅於 delta-spec REQ-TYPES-027 凍結報告 health 欄位契約，回寫與否由 #4 Knowledge Flywheel 評估
- [x] **已決（plan 2026-06-12）**: 既有 REQ 重疊照預判落地為 MODIFIED——REQ-TEMPLATES-045/088 進 delta-spec MODIFIED（只換資料源、判定語意不變）；REQ-TEMPLATES-034 語意判斷確認不動、留在 LLM 層

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified：
  - **TDD**：五檢項為零 LLM 純函式，測試先行可完整落實（SC-005 綁定）
  - **依賴方向 `cli → services → lib → types`**：新增 code 全數遵循（services 薄層即為此而設）；本 change 同時把該 constraint 變成機器檢查項（FR-004），自我強化
  - **INVEST**：五個 Story 各自可獨立交付與驗證（US-2/US-3/US-5 可在 US-1+US-4 之後分批進）
  - **Atomic Commits / 繁中文件**：適用既有流程，無特殊風險

## UI Scope

**Scope:** none
