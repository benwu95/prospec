# Delta Spec: add-drift-checker

> REQ ID format: `REQ-{MODULE}-{NUMBER}`；新 REQ 路由至新 feature `drift-detection`，verify 行為修改路由至既有 `sdd-workflow`

## ADDED

### REQ-TYPES-027: Drift Report Schema

**Feature:** drift-detection
**Story:** US-4

**Description:**
Zod schema 定義 `prospec-report.json`：structural / semantic 分層；檢項狀態列舉 `pass`/`warn`/`fail`/`skipped`（附原因）；semantic 層恆 `not-checked`；knowledge health 區段欄位凍結（`modules[]{name, last_src_commit, last_readme_commit, stale}` + `coverage{documented, total}`），供 #4 Knowledge Flywheel 與 #5 MCP server 直接消費。

**Acceptance Criteria:**
1. schema 拒絕 semantic 層出現 `pass`（恆 `not-checked`）
2. `skipped` 狀態必附 `reason` 欄位
3. health 欄位名為凍結契約，變更視為 breaking change

**Priority:** High

---

### REQ-LIB-014: Deterministic Structural Drift Engine

**Feature:** drift-detection
**Story:** US-1

**Description:**
零 LLM 純函式評估器：REQ-ID 懸空引用（定義源 = `prospec/specs/features/*.md` 標題，排除 `_archived-*`）、markdown 相對連結路徑存在性（佔位／glob 樣式跳過）、import 依賴方向——以該專案 `module-map.yaml` 的 `depends_on` 宣告為準（模組 A import 未宣告依賴的模組 B 即違規；module-map 缺失時退回 Constitution 宣告的分層），模組對應外的路徑（如本 repo 的 `scripts/`）不納入。通用於任何 prospec 專案，非本 repo 專屬。findings 依（檢項、路徑、行號）排序，同一輸入產出完全一致。

**Acceptance Criteria:**
1. 三類違規各自輸出含 `source_path` + `line` 的 finding
2. 同一輸入連續執行結果逐位元一致
3. 評估器不執行任何 I/O（料源由蒐集器注入）
4. 依賴方向規則來自 `module-map.yaml` `depends_on`（非寫死的層名）；本 repo dogfood 行為等價於 `cli → services → lib → types`

**Priority:** High

---

### REQ-LIB-015: Knowledge Health Check (git-timestamp based)

**Feature:** drift-detection
**Story:** US-2

**Description:**
以 git commit 時間戳（非檔案 mtime）比對 per-module 原始碼與 README：src 較新 → 該模組 `stale: true`、嚴重度恆 WARN（永不 FAIL）；`module-map.yaml` 模組缺 README → 覆蓋率缺口。git 時間戳不可得（非 git／shallow）→ 檢項 `skipped` + 原因。

**Acceptance Criteria:**
1. staleness 任何情況下不產生 `fail` 狀態
2. 比對來源為 git log 時間戳，檔案 mtime 不參與判定
3. 覆蓋率輸出 `documented`/`total` 兩數

**Priority:** Medium

---

### REQ-LIB-016: Kind-Aware Task Completion Check

**Feature:** drift-detection
**Story:** US-3

**Description:**
解析 `.prospec/changes/*/tasks.md`，依凍結 kind schema（`[M]` manual／`[V]` verification／無標記 = code）只以 code task 計算完成率；未完成 code task → FAIL 並列清單。`.prospec/changes/` 缺席（如 CI checkout）→ `skipped (source unavailable)`。

**Acceptance Criteria:**
1. 未勾選的 `[M]`/`[V]` task 不產生 FAIL
2. 目錄缺席時狀態為 `skipped` 且不影響整體 exit code
3. kind 判讀引用 tasks-format 凍結定義，不重述 schema

**Priority:** Medium

---

### REQ-SERVICES-027: Check Service Thin Orchestration

**Feature:** drift-detection
**Story:** US-4

**Description:**
`check.service.ts` 依 execute pattern 編排：蒐集（`drift-sources`）→ 評估（`drift-checker`）→ schema 驗證 → `--json` 時以 `atomicWrite` 寫 `prospec-report.json`；`--init-ci` 渲染 workflow 模板至 `.github/workflows/prospec-check.yml`（已存在則跳過）。Result 含 `hasFail`，exit code 判斷留在 cli 層。

**Acceptance Criteria:**
1. service 匯出 `execute(options): Promise<Result>`
2. 報告寫檔僅經 `atomicWrite`
3. `--init-ci` rerun-safe（已存在不覆寫）

**Priority:** High

---

### REQ-CLI-011: `prospec check` Command

**Feature:** drift-detection
**Story:** US-4

**Description:**
新指令 `prospec check`，旗標 `--json`／`--strict`／`--init-ci`；人讀輸出經 `check-output.ts` formatter（成功 stdout、錯誤 stderr）；`--strict` 在任一 FAIL 時 exit 1，WARN/`skipped` 不影響 exit code；skipped 檢項顯式呈現原因，不計入 PASS。

**Acceptance Criteria:**
1. 一致狀態下 `--strict` exit 0；注入 FAIL 後 exit 1
2. formatter 不含業務邏輯，僅格式化 service Result
3. 人讀輸出列出五檢項各自狀態（含 skipped 原因）

**Priority:** High

---

### REQ-TEMPLATES-091: CI Workflow Template

**Feature:** drift-detection
**Story:** US-4

**Description:**
`init/prospec-check.yml.hbs` 模板，兩個 job：check job（checkout `fetch-depth: 0` → `prospec check --strict --json` → 上傳 `prospec-report.json` artifact）與 comment job（**不 checkout**，僅下載 report artifact，以現成 action `marocchino/sticky-pull-request-comment` 貼摘要）。supply-chain hardening 為模板預設：第三方 action 一律 pin 完整 commit SHA（tag 重指攻擊免疫）、workflow 宣告最小權限 `permissions:`（`contents: read` + `pull-requests: write`，其餘全關）。不自寫 comment bot；流程零 LLM、零 token。

**Acceptance Criteria:**
1. 模板含 `--strict` 執行與 artifact 上傳兩步
2. 第三方 action 以完整 commit SHA 引用（附版本註解），不以 tag 引用
3. comment job 與 check job 分離且不 checkout 原始碼；workflow 含最小權限 `permissions:` 區塊
4. 本 repo `.github/workflows/` 實際啟用（dogfood）

**Priority:** Medium

---

### REQ-TEMPLATES-092: Verify Consumes Check Report

**Feature:** sdd-workflow
**Story:** US-5

**Description:**
verify skill 結構性維度改為執行 `prospec check --json` 並消費報告：V1 完成率與 V4 staleness 引用報告數據與位置資訊；指令不可用 → 明示「engine unavailable」並退回既有 LLM 行為（不默默跳過）；報告中 `skipped` 檢項在 verify 呈現為 skipped，不視為 PASS。

**Acceptance Criteria:**
1. skill 模板含執行 `prospec check --json` 的 Startup/維度指引
2. 不可用退回路徑明文存在（false-block 防護）
3. `skipped` ≠ PASS 規則明文存在（false-pass 防護）

**Priority:** High

---

## MODIFIED

### REQ-TEMPLATES-045: Verify Knowledge Staleness Detection

**Feature:** sdd-workflow
**Story:** US-5

**Before:**
WHEN delta-spec MODIFIED but module README not updated, THEN informational note + pointer to the `/prospec-archive` Entry Gate（不計入等級）。staleness 判斷由 LLM 比對。

**After:**
維持 informational 語意與等級規則不變；staleness 事實來源改為 `prospec check --json` 報告的 knowledge health 區段（git 時間戳，確定性）——報告可用時 verify 引用其數據，不可用時退回原 LLM 判斷並明示。

**Reason:**
開發期與 CI 共用同一確定性引擎，消除 LLM 自報 staleness 的不一致；等級語意不變，僅換資料源。

**Priority:** Medium

---

### REQ-TEMPLATES-088: Verify Kind-Aware Completion and Quick Dimension Reduction

**Feature:** sdd-workflow
**Story:** US-5

**Before:**
verify V1 完成率分母僅含 code task（`[M]`/`[V]` 分列為提醒）；計算由 LLM 讀 tasks.md 執行。quick 縮維規則如既有。

**After:**
分母規則與 quick 縮維規則完全不變；V1 完成率數據來源改為 `prospec check --json` 報告（REQ-LIB-016 同一引擎），報告不可用時退回 LLM 計算並明示。

**Reason:**
完成率是機器可算的事實，LLM 重算既費 token 又可能與 CI 不一致；只換資料源、不動判定語意。

**Priority:** Medium

---

## REMOVED

（無）
