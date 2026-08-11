# enforce-metadata-schema

## Background

`metadata.yaml` 是 SDD 各站之間唯一的共享狀態，由七個以上的站點寫入（new-story／plan／tasks／implement／review／verify／archive），但它的 schema **不在讀寫時強制**。`ChangeMetadataSchema`（`src/types/change.ts:58`）定義了欄位，實際讀取卻是 `parseYamlDocument(...).toJS() as ChangeMetadata` 的無檢查 cast——程式碼註解自承「a type contract + test fixture, not strip protection」。

後果是失效被延後：寫壞的欄位不會在寫入點報錯，而是在下游某一站被靜默誤讀。本變更立項時即實證此風險——`prospec change story` 產出的 `related_modules` 是 `["**types**"]`（`change-story.service.ts:149` 直接取 index.md Module 欄原文、未剝除 markdown 強調），違反 `metadata-format` 明文規定的 bare module name，而任何 schema 或消費端都沒有攔下它。同一個錯值再經 `proposal.md.hbs:19`（模板自己加粗）渲染成 `****types****`，證明 `name` 契約上就該是 bare。

## User Stories

### US-1: 讀取點即攔截損壞的 metadata [P1]

As a 使用 prospec SDD 流程的開發者，
I want metadata.yaml 的結構錯誤在讀取當下就被指名回報，
So that 我不必到下游某一站才發現狀態被靜默誤讀，且錯誤訊息直接指向出錯的 change 與欄位。

**Acceptance Scenarios:**

- WHEN 某 change 的 `status` 是非法值（不在 `CHANGE_STATUSES` 內），THEN 讀取點拋出錯誤並指名 change 名稱與 `status` 欄位，不做靜默修復或降級預設
- WHEN `quality_log` 的某筆項目缺少必填鍵（`skill`／`date`／`result`）或 `result` 不是 PASS/WARN/FAIL，THEN 讀取點拋出錯誤並指名該欄位路徑
- WHEN `review_provenance` 缺少 `digest` 或 `date`，THEN 讀取點拋出錯誤並指名該欄位
- WHEN metadata 完全合法，THEN 讀取行為與現況完全一致（回傳同樣的物件、不改變任何既有流程）

**Independent Test:**
以刻意損壞的 metadata fixture 呼叫讀取 helper，斷言拋出的錯誤訊息同時含 change 名稱與欄位路徑。

### US-2: 寫入點保證產出的 metadata 合法 [P1]

As a 維護 prospec 的開發者，
I want 每個寫 metadata.yaml 的站點在落盤前都通過同一份 schema，
So that 契約不會被 producer 自己破壞——目前 `prospec change story` 就正在寫出違反 metadata-format 的 `related_modules`。

**Acceptance Scenarios:**

- WHEN `prospec change story` 從 index.md 推導 `related_modules`，THEN 寫入的是 bare module name（`types`），不含 markdown 強調
- WHEN 任一寫入點試圖落盤不符 schema 的 metadata，THEN 寫入被拒絕並回報欄位，檔案不被修改
- WHEN `related_modules` 含 markdown 強調或空白字串，THEN schema 判定為不合法（bare-name refinement）

**Independent Test:**
對本專案跑 `prospec change story <name>`，斷言產出的 `related_modules` 每一項都能對應到 `module-map.yaml` 的模組名，且 `proposal.md` 的 Related Modules 只有一層加粗。

### US-3: 強制驗證不破壞 lossless 寫回 [P1]

As a 使用 prospec 的開發者，
I want 驗證只做把關、不改寫我的檔案，
So that metadata 裡 schema 未涵蓋的欄位與註解在讀寫一輪後原樣保留。

**Acceptance Scenarios:**

- WHEN metadata 含 schema 未定義的額外欄位，THEN 驗證通過，且讀寫一輪後該欄位與其值原樣保留
- WHEN metadata 含 YAML 註解，THEN 經 `stringifyYamlDocument` 路徑寫回後註解保留（現況行為不變）
- WHEN 以真實 archived metadata 轉錄的形狀（`grade`／`not-applicable` 維度／`archived_at` 未知欄位／review 計數）驗證，THEN 全數通過——契約不得拒絕 skill 合法產出的紀錄

**Independent Test:**
帶未知欄位與註解的 metadata fixture 讀→寫一輪，逐字元比對輸出與輸入。

## Edge Cases

- **metadata.yaml 不存在**：維持現況——各站既有的 `fs.existsSync` 分支不變，不因本變更改判為錯誤
- **YAML 語法本身損壞**：仍由既有 `YamlParseError` 處理，不被新的 schema 錯誤取代（兩者是不同失效層）
- **`archive.service.ts:498` 目前以 `stringifyYaml(meta)` 寫回**（非 Document 路徑，會壓掉註解）：archive 經實作期判斷退出強制驗證範圍（見 delta-spec REQ-SERVICES-067），本變更只加註解說明，其 lossy 特性與 lossless 化皆屬另一議題
- **歸檔後的 metadata**：`status: archived` 為合法值，archive 目錄下的檔案同樣適用驗證
- **既有 change 的 `related_modules` 已含 markdown 強調**：收緊 schema 後這類舊檔會驗證失敗。**已定案**（plan Design Decisions）——只對進行中的 change 強制（本 repo 僅本變更一筆，已修正）；`.prospec/archive/` 內的歷史紀錄不在驗證路徑上，不回頭改寫

## Functional Requirements

- **FR-001**：提供單一共用 helper 負責 metadata.yaml 的讀取與驗證，所有站點改用它，不各自 cast（PB-006 單一來源）
- **FR-002**：讀取驗證失敗時拋出可辨識的錯誤型別，訊息含 change 名稱與 zod 欄位路徑
- **FR-003**：寫入前對序列化目標做同一份 schema 驗證，失敗即拒寫、不留半寫檔案
- **FR-004**：`ChangeMetadataSchema` 的 `related_modules` 收緊為 bare module name（拒絕 markdown 強調與空白）
- **FR-005**：修正 `change-story.service.ts` 的 `matchRelatedModules`——剝除 index.md Module 欄的 markdown 強調後才作為模組名（index.md 的加粗是既有呈現慣例，不更動；`proposal.md.hbs` 自行加粗，證明 `name` 契約上即為 bare）
- **FR-006**：驗證為純把關，不得改寫資料——lossless 讀寫語義（未知欄位、註解）維持現況

## Success Criteria

- **SC-001**：損壞的 `status`／`quality_log`／`review_provenance` 在讀取點即報錯，錯誤訊息含 change 名稱與欄位路徑（測試覆蓋三者各一例）
- **SC-002**：契約不得拒絕 skill 合法產出的形狀——以真實 archived metadata 的形狀（含 `grade`、`not-applicable` 維度、`archived_at` 等未知欄位、review 計數欄位）為 fixture 驗證通過
  - **實作期修正（2026-07-28）**：原訂「既有 archived metadata 全數通過、零 FAIL」。實跑 43 筆回溯掃描：29 筆通過、14 筆失敗。逐一檢視後拆成兩類——(a) **契約自身缺陷 1 類已修**：`dimensions[].result: not-applicable` 是 verify skill 明文強制的值（quick／backfill 降級「NEVER as PASS」），但 schema 只收三態，屬 schema 錯，已收進 REQ-TYPES-064；(b) **歷史資料缺陷 14 筆不在本變更修**：grade 寫進 `result`（9）、`warnings` 為字串（2）、缺 `name`/`created_at`（1）、`related_modules` 帶強調（4，即本變更所修的 producer 舊產物）。這些 producer 現皆已正確（`metadata-format` 明文「`result: A` is malformed」、bolding 由 FR-005 修掉），`.prospec/archive/` 為 gitignored 本機資料且不在驗證路徑上（見 REQ-SERVICES-067），零執行期影響。回溯掃描結果作為診斷回報，另立 issue 處理
- **SC-003**：帶未知欄位與註解的 metadata 讀寫一輪後內容逐字元不變
- **SC-004**：`prospec change story` 產出的 `related_modules` 全為 bare name，且每一項存在於 `module-map.yaml`
- **SC-005**：`pnpm test` 與 `pnpm typecheck` 全綠；新增邏輯的測試覆蓋率 ≥ 80%

## Related Modules

- **types**：`ChangeMetadataSchema` 收緊、新增驗證錯誤型別
- **lib**：新增共用讀寫 helper（與 `yaml-utils` 相鄰），為各站點的單一入口
- **services**：`change-story`／`change-plan`／`change-tasks`／`check` 四處讀寫點遷移到 helper（`archive` 經實作期判斷退出範圍，見 delta-spec REQ-SERVICES-067）
- **tests**：讀取驗證、寫入拒絕、lossless 回歸、真實 archived 形狀的契約回歸、整合流程、渲染層 contract

## Open Questions

- [x] **已解決（plan 階段）**：`lib/drift-sources.ts` 的兩處 metadata 讀取是否一併遷移？→ **不遷移**。drift 引擎的職責是回報不合規並產出 finding；在此拋錯會讓 `prospec check` 對損壞 metadata 直接崩潰，反而摧毀 `metadata-completeness` 這個專為攔截壞 metadata 而存在的檢查。詳見 plan Design Decisions 與 delta-spec REQ-SERVICES-067。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified
  - Language Policy：本變更產物為 `.prospec/changes/**`（繁中）；程式碼、識別字、commit message 維持英文
  - TDD：SC-005 要求測試先行且覆蓋率 ≥ 80%
  - One-way Dependency Direction：helper 置於 `lib`，由 `services` 匯入；`lib → types` 方向不變，無反向匯入
  - Atomic Commits：FR-004/FR-005 的 producer 修正與本變更**強制耦合**（在寫入點強制 schema 後，未修的 producer 會立刻讓 `prospec change story` 拋錯），屬同一功能單元，非混合提交

## UI Scope

**Scope:** none
