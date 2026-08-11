# Proposal: dedupe-init-doc-registry

## Background

fix-upgrade-doc-coverage 的對抗式審查留下兩個 maintainability majors（見其 archive 的 review.md F2/F3）：`INIT_DOC_REGISTRY` 以字面重述 `USER_MANAGED_CONVENTION_DOCS` 的三個文件名（諷刺地重演了該變更所修的平行清單漂移，PB-006）；index 範本的 context 選擇以 `'knowledge/index.md.hbs'` 魔法字串在 `init.service` 與 contract 測試雙處特判，Handlebars 非 strict，漂移時靜默空渲染且測試仍綠。另有一筆已核准的人工策展：`feature-map.yaml` 的 `project-setup.modules` 缺 `cli`。

## User Stories

### US-1: registry 消除平行重複、行為逐位元不變 [P1]

身為 prospec 維護者，
我希望 user-managed 文件清單升級為含範本的結構並由 registry 推導、index context 改由 registry 欄位宣告，
以便未來新增文件或改名範本時只改一處，漂移直接由型別與測試攔截。

**Acceptance Scenarios:**

- WHEN 讀 `USER_MANAGED_CONVENTION_DOCS`, THEN 為 `{template, output}` 對，且 `INIT_DOC_REGISTRY` 與 `ALL_INITIAL_CONVENTION_DOCS` 皆由其推導（三個文件名不再字面重述）
- WHEN `init.service` 或 contract 測試選擇 index 渲染 context, THEN key off `InitDoc` 的 context 判別欄位，全 codebase 不再比對 `'knowledge/index.md.hbs'` 字串
- WHEN 跑全套測試, THEN registry 內容、init 產出、upgrade inventory 逐位元不變（等式／形狀／渲染契約全綠）

**Independent Test:**
重構後不改任何 fixture 直接跑既有等式契約（init⇄registry）、渲染性契約與 upgrade inventory 測試——全綠即證行為不變；grep `=== 'knowledge/index.md.hbs'`（比對式使用）於 src/ 與 tests/ 為零——registry 消費端一律以 `doc.context` 欄位判別（knowledge 系列服務直接渲染該範本屬本職參數、mock 條件屬測試佈景，均非 F3 範疇）。

## Edge Cases

- `ALL_INITIAL_CONVENTION_DOCS` 的消費端（`filterConventions` → index 範本 conventions 清單）期待字串陣列：推導時以 `.map(d => d.output)` 保持輸出形狀不變
- `PLACEHOLDER_CONVENTION_DOCS`（無範本、init 不建立）不升級為對——維持字串清單，不納入 registry
- feature-map 為 no-clobber 人工策展檔：僅插入 `cli` 一行，不動其他欄位與排序慣例

## Related Modules

- **types**: `conventions.ts` — `UserManagedDoc` 結構、registry 推導、`InitDoc.context`
- **services**: `init.service.ts` — context 選擇改 key off 欄位
- **tests**: 形狀／等式／渲染契約隨結構調整＋新增綁定與負向斷言

## Spec Impact

> `scale: quick` 無 delta-spec——本節為 archive Phase 3.5 的 graduation 來源。

- **REQ-TYPES-038（MODIFIED，Feature: project-setup）**：描述性修訂——「canonical convention docs 自 `CANONICAL_CONVENTION_DOCS` 推導不重複」擴充為「canonical 與 user-managed convention docs 皆自其常數（`{template, output}` 對）推導不重複」；`InitDoc` 增 context 判別欄位（index 範本的渲染 context 由 registry 宣告，非消費端字串比對）。AC 與行為不變。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified（TDD：綁定/負向斷言先行；Surgical：行為逐位元不變由既有測試證明）

## UI Scope

**Scope:** none
