# Delta Spec: add-knowledge-refresh-command

> REQ ID format: `REQ-{MODULE}-{NUMBER}`. Feature: `ai-knowledge`（raw-scan 歸屬）。

## ADDED

### REQ-KNOW-022: `knowledge refresh` deterministic 重新產生 raw-scan.md

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
新增 `prospec knowledge refresh` 子指令，依當前原始碼以 deterministic（不呼叫任何 LLM / provider）方式重新掃描並覆寫 `raw-scan.md`。只動 `raw-scan.md`，不得建立或覆寫 curated 檔案（`module-map.yaml` / `_index.md` / `_conventions.md`）。

**Acceptance Criteria:**
1. WHEN 執行 `prospec knowledge refresh`，THEN 依當前檔案重新產生 `raw-scan.md`（Tech Stack / Entry Points / Directory Tree / Dependencies / Config Files / File Stats）。
2. WHEN refresh 完成，THEN `module-map.yaml` / `_index.md` / `_conventions.md` 維持 byte-identical（不建立、不覆寫）。
3. WHEN `--dry-run`，THEN 不寫入任何檔案，僅預覽。
4. WHEN `--depth <n>`，THEN 以指定深度掃描，行為與 `knowledge init` 對齊。
5. WHEN `raw-scan.md` 不存在，THEN 直接產生（非錯誤）。
6. 全程不呼叫 LLM / provider API。

**Priority:** High

---

### REQ-KNOW-023: raw-scan 產生邏輯單一共用來源

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
`raw-scan.md` 的掃描與產生邏輯抽成單一共用函式 `generateRawScan()`，由 `knowledge init`、`knowledge refresh` 與 archive 安全網共用。`knowledge init` 對外行為（產出檔案、dry-run 語意、結果計數）維持不變。

**Acceptance Criteria:**
1. `generateRawScan()` 為 `knowledge init` 與 `knowledge refresh` 產生 raw-scan 的唯一實作路徑（無重複掃描/render 邏輯）。
2. 既有 `knowledge-init` 測試在重構後全數通過。
3. 依賴方向維持 `cli → services → lib → types`，無逆向 import。

**Priority:** High

---

### REQ-KNOW-024: archive 流程尾端自動刷新 raw-scan.md

**Feature:** ai-knowledge
**Story:** US-2

**Description:**
`/prospec-archive` 在流程結束時刷新 `raw-scan.md`。`archive.service` 於既有 knowledge-update 之後非致命觸發 `generateRawScan()`（鏡像現有 auto-knowledge-update 安全網），並於 `ArchiveResult` 標示刷新結果；`/prospec-archive` skill 模板說明此步驟，作為 LLM 驅動實際流程的操作指示。

**Acceptance Criteria:**
1. WHEN archive 成功且 knowledge-update 完成後，THEN `archive.service` 觸發 raw-scan refresh 並於結果標示（`rawScanRefreshed`）。
2. WHEN refresh 在 archive 中拋錯，THEN 非致命：不阻斷歸檔（沿用 knowledge-update 安全網模式）。
3. `/prospec-archive` skill 模板含「執行 `prospec knowledge refresh`」的刷新步驟。

**Priority:** Medium

---

### REQ-KNOW-025: knowledge-generate 起始刷新 raw-scan 並重構前置條件

**Feature:** ai-knowledge
**Story:** US-3

**Description:**
`/prospec-knowledge-generate` 在讀取 `raw-scan.md` 前先以 deterministic 方式刷新它，使模組 README 永遠依當前真實結構生成。前置條件由「raw-scan must exist，否則停下叫使用者跑 `knowledge init`」重構為「先執行 `prospec knowledge refresh`（不存在則建立）；CLI/設定不可用時 fallback 既有檔或提示 init；`module-map.yaml` 仍由 `init` 首次建立」。屬 templates 模組變更（skill 模板）。

**Acceptance Criteria:**
1. 渲染後的 `prospec-knowledge-generate.hbs` Startup Loading 含 `prospec knowledge refresh` 指示，且 raw-scan.md 仍為被讀取的輸入。
2. 前置條件文字改為先 refresh、不存在則建立；保留 `prospec` CLI 不可用時的 fallback（不靜默前進）。
3. skill-format contract（Startup Loading 的 marker / item-set / MANDATORY 數 / contiguity）維持綠燈——`raw-scan.md` 路徑續為該 item 第一個 backtick token，故 `startup-loading-baseline.json` 無需重生。

**Priority:** Medium

---

### REQ-KNOW-026: raw-scan refresh 的 CLI-availability fallback（persona-aware）

**Feature:** ai-knowledge
**Story:** US-3

**Description:**
skill 觸發 raw-scan refresh 時，依使用者 persona 採不同 CLI-availability 策略，且措辭需相容非-Node 專案（prospec 亦管理 Python/Go 等專案，「列 devDependency」僅對 Node.js 專案有意義）。

**Acceptance Criteria:**
1. 一般開發者 persona（`/prospec-knowledge-generate`、`/prospec-archive`）：fallback ladder＝`prospec`（PATH）→ `pnpm exec` / `npx -y prospec`（專案 devDep 或 npx 取得）→ 無 Node 工具鏈則降級（沿用既有 `raw-scan.md` + 標示可能 stale；最後手段由 agent 近似掃描並標 non-deterministic）。
2. 採用者 persona（`/prospec-quickstart`）：CLI 不可用時**停止並提醒安裝 prospec**（不採 npx 暫解），never proceed silently。
3. devDependency 建議**條件化**於 Node.js 專案；非-Node 專案改建議全域安裝（`npm i -g prospec`）——措辭不得讓非-Node 使用者誤解。
4. README（`README.md` / `README.zh-TW.md`）devDependency 段落說明下游開發者免全域安裝即可執行 refresh，並標註僅適用 Node.js 專案。

**Priority:** Medium

---

## MODIFIED

_No modifications in this change._（`knowledge init` 對外行為刻意維持不變——屬內部重構，見 REQ-KNOW-023。）

## REMOVED

_No removals in this change._
