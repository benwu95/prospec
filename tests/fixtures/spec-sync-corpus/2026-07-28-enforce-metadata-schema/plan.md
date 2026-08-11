# 實作計畫：enforce-metadata-schema

## Overview

`metadata.yaml` 是 SDD 各站唯一的共享狀態，卻只有 type contract 沒有執行期契約——讀取點以 `as ChangeMetadata` 無檢查 cast（`change-plan`／`change-tasks` 兩處），寫入點則完全不驗證（`change-story` 寫未定型物件字面、`check --record-review` 直接改 Document）。失效因此被延後到下游站點靜默誤讀。

策略是**收斂到單一 helper**（PB-006）：在 `lib/` 新增 `change-metadata.ts` 作為 metadata.yaml 的唯一讀寫入口，讀取時以 `ChangeMetadataSchema` 驗證、失敗即拋出指名欄位的錯誤，寫入時落盤前再驗一次。lossless 語義完全沿用既有機制（Document 路徑保留註解與未知欄位），驗證只讀不寫。同時收緊 `related_modules` 為 bare module name 並修正其 producer——這兩者與強制驗證**強制耦合**：一旦在寫入點強制 schema，未修的 `matchRelatedModules` 會立刻讓 `prospec change story` 拋錯。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| types | Zod schemas + error hierarchy | `ChangeMetadataSchema`, `ProspecError` | zod only（leaf） |
| lib | 無狀態共用工具 | `yaml-utils`, `fs-utils.atomicWrite` | types |
| services | 每指令一個 `execute()` | `change-story/plan/tasks`, `archive`, `check` | types, lib |
| tests | 4 層 Vitest 套件 | — | 全部來源模組 |

### Existing Patterns

- **單一來源 helper（PB-006）**：同一份邏輯需在多處使用時抽成 leaf helper 匯入，禁止各處手抄
- **lossless 寫回**：`parseYamlDocument` → 改值 → `stringifyYamlDocument`，保留註解與欄位順序
- **原子寫入**：一律 `atomicWrite()`，禁止裸 `writeFileSync`
- **錯誤階層**：新錯誤繼承 `ProspecError`，帶 UPPER_SNAKE `code` 與 `suggestion`

### Architecture Constraints (from Constitution)

- 依賴方向 `cli → services → lib → types` 單向——helper 置於 `lib`（可 import `types`），由 `services` 匯入，無反向或循環
- TDD：測試先行，覆蓋率 ≥ 80%
- Atomic Commits：producer 修正與強制驗證同屬一個功能單元

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Medium | 新增 `MetadataValidationError`；`related_modules` 收緊為 bare module name |
| lib | High | 新增 `change-metadata.ts`——metadata.yaml 的唯一讀寫入口 |
| services | High | 四處做過無檢查 cast 的讀寫點遷移到 helper（archive 實作期退出範圍）；修正 `matchRelatedModules` |
| tests | Medium | 驗證失敗、lossless 回歸、真實 archived 形狀的契約回歸、整合流程、渲染層 contract |

## Implementation Steps

1. **型別層（types）**
   - `errors.ts` 新增 `MetadataValidationError extends ProspecError`，code `METADATA_VALIDATION_FAILED`，訊息含 change 名稱 + zod issue 路徑，`suggestion` 指向 metadata-format reference
   - `change.ts` 的 `related_modules` 元素收緊：拒絕含 `*`／反引號、前後空白、空字串。**採 refinement 而非白名單 regex**，只擋實際缺陷，不限制他人專案的模組命名

2. **共用 helper（lib/change-metadata.ts）**
   - `assertValidChangeMetadata(value, changeName)` — 單一驗證入口，失敗拋 `MetadataValidationError`
   - `readChangeMetadata(metadataPath, changeName)` → `{ doc, metadata }`；`parseYamlDocument` 後驗證 `doc.toJS()`，回傳兩者（Document 供 lossless 寫回）
   - `writeChangeMetadataDoc(metadataPath, doc, changeName)` — 驗證後 `atomicWrite(stringifyYamlDocument(doc))`
   - `writeChangeMetadataObject(metadataPath, metadata)` — 驗證後 `atomicWrite(stringifyYaml(metadata))`，供 change-story 新建路徑

3. **呼叫點遷移（services）**
   - `change-plan`／`change-tasks`：`parseYamlDocument + as ChangeMetadata` → `readChangeMetadata`；寫回改 `writeChangeMetadataDoc`
   - `change-story`：`stringifyYaml(metadata)` → `writeChangeMetadataObject`
   - `archive.service`：**實作期退出範圍**——只加註解說明刻意不驗證（理由見下方 Design Decisions），不匯入 helper
   - `check.service --record-review`：讀寫改用 helper
   - `matchRelatedModules`：Module 欄取值後剝除 markdown 強調再作為模組名

4. **測試（tests）**
   - 單元：損壞 `status`／`quality_log`／`review_provenance` 各一例，斷言錯誤訊息含 change 名稱與欄位路徑
   - 單元：`related_modules` 含 `**` 或空白 → 驗證失敗
   - 回歸：帶未知欄位 + 註解的 fixture 讀→寫一輪，逐字元比對
   - 契約形狀回歸：以轉錄自真實 archived metadata 的形狀為 fixture（`grade`／`not-applicable` 維度／`archived_at` 未知欄位／review 計數），斷言契約不拒絕 skill 合法產出；memfs 即可，不綁本機 archive 內容（實作期修正，見 Design Decisions）
   - 整合：`change story → plan → tasks` 流程，斷言產出的 `related_modules` 全為 bare name

## Design Decisions

- **drift-sources 不遷移**（回應 proposal 的 Open Question）：drift 引擎的職責是**回報**不合規、產出 finding；若在此拋錯會讓 `prospec check` 對損壞 metadata 直接崩潰，反而摧毀 `metadata-completeness` 這個專為攔截壞 metadata 而存在的檢查。drift 端維持寬鬆讀取，兩者是互補的兩層。
- **archive.service 亦不納入強制驗證**（實作期修正，2026-07-28）：原列入「只加驗證」，實作時發現 archive **明文容忍 pre-schema metadata**（缺 `created_at` 仍歸檔、summary 渲染 `unknown`，有具名測試覆蓋），且它全程以 `Record<string, unknown>` 讀取、從未宣稱型別契約。加驗證等於把受支援的 legacy 狀態變成靜默 skip。完整性下限已由 archive skill Entry Gate 的 `metadata-completeness` 在服務執行前把關。**強制邊界＝原本宣稱型別卻不檢查之處**，共四站。
- **既有舊值遷移**：本 repo 只有本 change 一筆進行中且已修正。`.prospec/archive/` 內既有檔以**一次性診斷掃描**確認（非常駐測試，理由見 delta-spec REQ-TESTS-055 偏離記錄）；原則「修資料、不放寬 schema」在實跑後細分為二——**契約自身缺陷**修 schema（`dimensions[].result: not-applicable` 是 skill 產出的合法值，schema 錯不是資料錯），**歷史資料缺陷**不修（gitignored、不在驗證路徑、producer 已正確）。
- **index.md 不更動**：Module 欄的加粗是既有呈現慣例，且 `proposal.md.hbs:19` 自行加粗，證明 `name` 契約上即為 bare——錯在 consumer。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 收緊 schema 打到既有 archived metadata | High | 先跑一次性診斷掃描；區分契約缺陷（修 schema）與歷史資料缺陷（不修，另立 issue） |
| 驗證誤剝未知欄位，破壞 lossless 契約 | High | 驗證只讀不寫；逐字元比對測試把關 |
| 呼叫點漏改（PB-007 平行站點） | Medium | 以 grep `as ChangeMetadata` 全倉清零作為驗收條件，並逐一列舉 metadata.yaml 的讀寫點確認去向 |
| `related_modules` refinement 過嚴誤擋他人模組名 | Medium | 只擋 `*`／反引號／空白，不用白名單 regex |
