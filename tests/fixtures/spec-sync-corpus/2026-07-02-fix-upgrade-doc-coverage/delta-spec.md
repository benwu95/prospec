# Delta Spec: fix-upgrade-doc-coverage

## ADDED

### REQ-TYPES-038: Init-Doc Registry Single Source

**Feature:** project-setup
**Story:** US-1

**Description:**
`types/conventions.ts` 新增 `INIT_DOC_REGISTRY`——init 建立的 7 份 curated 文件的單一事實來源（root 判別 `base`/`knowledge` + root 相對路徑 + 對應範本名）：base 下 `CONSTITUTION.md`、`index.md`；knowledge 下 `_conventions.md`、`_diagram-conventions.md`、`_glossary.md`、`_status-lifecycle.md`、`_module-readme-conventions.md`。knowledge root 由消費端經 `resolveBasePaths` 解析（尊重 `knowledge.base_path` 覆寫）。排除 `AGENTS.md`（zone-1，agent-sync 擁有）與 `specs/.gitkeep`。`init.service` 與 `upgrade.service` 皆由此推導，不再各自維護清單。

**Acceptance Criteria:**
1. registry 恰含上述 7 份文件，每項有 root 判別、root 相對路徑與範本名
2. `init.service` 的 curated 文件清單由 registry 推導（行為不變：per-file skip-if-exists、寫入順序）
3. 位於 leaf `types` 層，僅含純資料（無 I/O）

**Priority:** High

---

### REQ-SETUP-022: Upgrade Report Docs Inventory

**Feature:** project-setup
**Story:** US-1

**Description:**
`prospec upgrade` report 新增 docs inventory 區段：依 `INIT_DOC_REGISTRY` 逐檔標記 present/missing，`upgrade-output.ts` formatter 以固定、可解析的行格式輸出；missing > 0 時提示由 `/prospec-upgrade` 處理。CLI 僅報告——不寫任何 curated doc。

**Acceptance Criteria:**
1. 對缺 `_glossary.md` 的專案，report 將其標記 missing、其餘 present
2. 輸出行格式固定（e2e 斷言鎖定），字串經既有 sanitize 慣例
3. 執行後所有 curated doc 與 CONSTITUTION byte 不變（既有不變式測試維持綠）

**Priority:** High

---

### REQ-TESTS-036: Inventory Equality Contract Test

**Feature:** project-setup
**Story:** US-2

**Description:**
新增 contract test：在 memfs 執行 `init.execute` 後，實際建立的 curated 文件路徑集合 == `INIT_DOC_REGISTRY` 推導的路徑集合。init 新增文件而未進 registry（或反之）時測試轉紅，根治清單漂移。

**Acceptance Criteria:**
1. 等式為集合比較（雙向），非子集
2. mutation-verify：自 registry 移除任一項會使測試轉紅
3. registry 每項範本名可被 `renderTemplate()` 實際渲染（範本檔名對齊）

**Priority:** High

---

## MODIFIED

### REQ-SERVICES-035: Upgrade Orchestrator Service

**Feature:** project-setup
**Story:** US-1

**Before:**
`execute()` 依序：readConfig → 更新 version → 互動 nudge → writeConfig → agentSync → best-effort raw-scan → buildReport（version delta、缺觸發詞 skill、nudges）。

**After:**
buildReport 前新增 `buildDocsInventory()`：依 `INIT_DOC_REGISTRY` × `resolveBasePaths` 逐檔檢查存在性——base 文件對 `baseDir`、knowledge 文件對 `knowledgePath`（尊重 `knowledge.base_path` 覆寫，與 knowledge-init／agent-sync／knowledge-reader 一致），report 增 `docs` 欄位（path 為實際位置 + template + present/missing）。其餘步驟與「不寫 curated doc、唯一 `ai-knowledge/` 寫入為 raw-scan.md」不變式維持。

**Reason:**
缺檔偵測是決定性工作，屬 zero-LLM CLI 職責；skill 只做需判斷的 diff 與補建。

**Priority:** High

---

### REQ-SETUP-019: prospec upgrade Command

**Feature:** project-setup
**Story:** US-1

**Before:**
report 內容為 version delta、缺觸發詞 skill、config-field nudges。

**After:**
report 另含 docs inventory 區段（init 文件逐檔 present/missing）。其餘職責（comment-preserving 合併、agent sync、raw-scan 刷新、`--no-interactive`、不寫 curated doc）不變。

**Reason:**
使升級時的文件覆蓋缺口在 CLI 層即可見，並為 skill 提供權威掃描清單。

**Priority:** High

---

### REQ-TEMPLATES-121: prospec-upgrade Skill Template

**Feature:** agent-integration
**Story:** US-2

**Before:**
Step 2 掃描範本內寫死的檔案清單（`CONSTITUTION.md`、`_conventions.md`、根層級 `index.md`、`_status-lifecycle.md`、`_module-readme-conventions.md`、`_diagram-conventions.md`），對照最新範本逐檔 diff＋同意後更新；偵測 legacy `_index.md` 時提議遷移。

**After:**
Step 2 消費 report 的 docs inventory（無寫死清單）：present → diff 最新範本＋逐檔同意後更新；missing → 詢問同意後自最新範本建立（涵蓋 `_glossary.md`）。保留 legacy `_index.md` 遷移分支與「套件範本不可得 → graceful skip」。report 無 docs 區段（版本錯位）→ 停止 doc-refresh 並提示重跑 `prospec upgrade`。

**Reason:**
寫死清單與 init 權威清單漂移是 issue #48 根因；skill 不再維護平行清單（PB-006）。

**Priority:** High

---
