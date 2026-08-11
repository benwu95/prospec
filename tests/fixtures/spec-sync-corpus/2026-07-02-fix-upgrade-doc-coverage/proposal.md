# Proposal: fix-upgrade-doc-coverage

## Background

GitHub issue #48 回報 `prospec upgrade` 與 `/prospec-upgrade` 跑完後，部分 init 建立的 md 檔仍是舊格式、或新版本引入的 md 檔從未被建立。根因是 skill 範本內寫死一份與 init 平行的掃描清單（`prospec-upgrade.hbs` Step 2），與 init 的權威清單（`src/types/conventions.ts` + `src/services/init.service.ts`）必然漂移——`_glossary.md` 在 skill 誕生後才引入，即因此被遺漏；且 skill 完全沒有「補建缺少檔案」的步驟。

## User Stories

### US-1: 升級 report 揭示文件覆蓋狀態 [P1]

身為升級 prospec 版本的專案維護者，
我希望 `prospec upgrade` 的 report 列出 init 會建立的每份文件及其 present/missing 狀態（清單與 init 實作同源推導），
以便升級時一眼看出哪些檔案缺漏，而不是事後才發現舊格式殘留或檔案未建立。

**Acceptance Scenarios:**

- WHEN 在缺少 `_glossary.md` 的既有專案執行 `prospec upgrade`, THEN report 的 docs inventory 區段將 `_glossary.md` 標記為 missing
- WHEN 所有 init 文件皆存在, THEN inventory 逐檔標記 present，且不出現清單外的檔案
- WHEN `prospec upgrade` 執行, THEN 任何 curated doc 與 CONSTITUTION 內容 byte 不變（既有不變式維持——CLI 只報告、不寫入）

**Independent Test:**
在 memfs 專案 fixture 刪除 `_glossary.md` 後執行 upgrade service，斷言 report 的 inventory 將該檔標記 missing、其餘 present，且所有 curated docs byte 不變。

### US-2: skill 依 inventory 完整刷新與補建 [P1]

身為執行 `/prospec-upgrade` 的專案維護者，
我希望 skill 消費 report 的 inventory 清單——存在的檔案逐檔 diff 最新範本並經我同意後更新、缺少的檔案詢問我後補建——取代範本內寫死的檔案清單，
以便升級後不再殘留舊格式文件、也不再漏建新版本引入的文件。

**Acceptance Scenarios:**

- WHEN report 將某檔標記 missing 且使用者同意補建, THEN skill 以最新範本建立該檔；未同意則不動
- WHEN report 將某檔標記 present 且格式與最新範本有落差, THEN 逐檔顯示 diff、經同意後只遷移格式（不動使用者撰寫的內容）
- WHEN `index.md` 缺少但 legacy `ai-knowledge/_index.md` 存在, THEN 沿用既有遷移路徑（保留 `prospec:user` 區塊與 curated Modules 表列），不重複建檔
- WHEN skill 範本渲染後檢視 Step 2, THEN 不存在寫死的 init 文件清單（掃描範圍完全來自 report inventory）

**Independent Test:**
在缺 `_glossary.md` 的專案跑 `/prospec-upgrade`，確認 skill 依 report 提議補建該檔；同意後檔案以最新範本產生，且 `index.md` 的格式漂移同樣被偵測。

## Edge Cases

- report 解析不到 docs inventory 區段（CLI 與 skill 版本錯位）：skill 停止 doc-refresh 步驟並提示先重跑 `prospec upgrade`，不退回寫死清單
- 已安裝 prospec 套件的範本不可得：沿用既有 graceful skip 並回報，不中斷其餘步驟
- 使用者對存在的檔案全部拒絕更新：所有檔案保持原樣，skill 正常完成後續步驟
- 專案同時缺多份文件：逐檔獨立詢問補建，單檔拒絕不影響其他檔案
- `AGENTS.md` 與 `specs/.gitkeep` 不屬 inventory 範圍（前者由 agent-sync 擁有、後者非文件）

## Functional Requirements

- **FR-001**: init 建立的 curated 文件清單（相對路徑 + 對應範本）抽為單一事實來源結構，由 init 與 upgrade 共同消費（PB-006）
- **FR-002**: `upgrade.service` 依該清單逐檔檢查存在性，report 新增 docs inventory；CLI formatter 以可解析的行格式輸出該區段
- **FR-003**: CLI `prospec upgrade` 維持不寫任何 curated doc 或 CONSTITUTION（僅報告；FR-007 不變式不動）
- **FR-004**: `prospec-upgrade.hbs` Step 2 改為消費 report inventory：present → diff＋逐檔同意後更新；missing → 詢問同意後自最新範本建立；legacy `_index.md` 遷移分支保留
- **FR-005**: 新增 contract test 斷言「init 實際建立的 curated doc 集合 == inventory 集合」，清單漂移時測試轉紅
- **FR-006**: 根層級 `README.md` 中 upgrade report 與 skill 行為的描述（CLI 指令表與 skill 段落）同變更更新

## Success Criteria

- **SC-001**: 對缺 `_glossary.md` 的專案 fixture，upgrade report 將其標記 missing（單元測試驗證）
- **SC-002**: contract 等式測試存在且通過；自 inventory 移除任一 init 文件會使測試轉紅（mutation-verify）
- **SC-003**: 既有「CURATED doc byte 不變」單元與整合測試全數維持綠燈
- **SC-004**: 渲染後的 `prospec-upgrade` SKILL.md Step 2 grep 不到寫死的 init 文件清單
- **SC-005**: `pnpm test` 全綠，coverage ≥ 80%

## Related Modules

- **types**: `conventions.ts` 既有 doc 常數擴充為含範本對應的單一來源 inventory 結構；`UpgradeReport` schema 新增 docs 欄位
- **services**: `init.service` 改為消費單一來源清單；`upgrade.service` 建 inventory（存在性檢查）並納入 report
- **cli**: `upgrade-output` formatter 新增 docs inventory 區段輸出
- **templates**: `prospec-upgrade.hbs` Step 2 改寫為消費 report inventory
- **tests**: 單元測試 + contract 等式測試 + 整合測試更新

## Open Questions

- [ ] **NEEDS CLARIFICATION**: `scale: standard` 係依準則與前例（upgrade-config-nudges）自動採用，未經即時確認——實作前可覆寫為 `full`

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified（TDD：contract 等式測試先行；INVEST：兩個獨立可測的 P1 story；README 同步列為 FR-006）

## UI Scope

**Scope:** none
