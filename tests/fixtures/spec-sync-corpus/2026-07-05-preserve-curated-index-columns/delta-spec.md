# Delta Spec：curated index 欄位收斂為 module-map 單一真相

## ADDED

### REQ-TYPES-056: ModuleEntry curated 欄位（aliases/rationale）

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
`ModuleEntrySchema` 新增 `aliases`（`string[]`, optional）與 `rationale`（`string`, optional），使 module-map.yaml 涵蓋 index 表全部 curated 欄位（keywords/description/depends_on 已有）。module-map 成為 curated index 欄位的單一真相。

**Acceptance Criteria:**
1. `ModuleEntrySchema` 含 `aliases?`、`rationale?`；既有 module-map.yaml（無此欄）仍通過驗證
2. `module-map.yaml.hbs` scaffold 反映新欄位（新專案可策展）

**Priority:** High

---

### REQ-LIB-026: index 表 curated 保真工具（row-builder + no-clobber 回填）

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
lib 提供：(a) 共用 `buildIndexRow(module)` 依 `INDEX_COLUMN` 由 module 資料（name/status/description/keywords/aliases/rationale/depends_on）產列，缺值才 `—`；(b) 既有 index.md curated 欄位解析涵蓋 rationale/depends_on（擴充 `parseIndexModules` 或 sibling）；(c) `backfillCuratedFromIndex(indexContent, moduleMap)` 將 index curated 值填入 module-map **缺值處**（no-clobber、bootstrap-once），回傳是否變更。

**Acceptance Criteria:**
1. `buildIndexRow` 由 module 資料產出全 7 欄，欄位順序/表頭衍生自 `types` 單一常數（REQ-KNOW-020）
2. 回填 no-clobber：module-map 既有值絕不被覆寫；只補空/缺欄
3. 回填 idempotent：對同輸入跑兩次無二次寫入

**Priority:** High

---

### REQ-KNOW-036: updateIndex 自 module-map 生成並 no-clobber 遷移

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
`knowledge-update.service` 的 `updateIndex`（incremental）生成 auto-block 表格前，先以 `backfillCuratedFromIndex` 將既有 index.md 的 curated 欄位回填進 module-map（缺值處，persist），再由 module-map 各欄位（經 `buildIndexRow`）生成表格——curated 欄位不再被清成 `—`。既有下游專案跑一次 `/prospec-knowledge-update` 即零遺失遷移。

**Acceptance Criteria:**
1. 對含 curated 內容的 index.md 跑 `updateIndex`，輸出 auto-block 的 Keywords/Aliases/Rationale/Depends On 完整保留
2. module-map 缺某 curated 欄但 index 有值 → 回填進 module-map 後生成；再跑 idempotent
3. mutation-verify：清空 module-map 某模組 curated 欄 → 該欄於輸出轉 `—`（斷言可轉紅）

**Priority:** High

---

## MODIFIED

### REQ-KNOW-008: Index Idempotent Update

**Feature:** ai-knowledge
**Story:** US-1

**Before:**
- WHEN `index.md` 已存在, THEN update auto section, preserve user section
- WHEN module 目錄已存在, THEN update README rather than rebuild

**After:**
- WHEN `index.md` 已存在, THEN update auto section **preserving curated columns**（Keywords/Aliases/Rationale/Depends On 自 module-map 單一真相生成，非固定填 `—`）, preserve user section
- WHEN 既有 index.md 的 curated 欄尚未在 module-map, THEN 先 no-clobber 回填進 module-map（bootstrap-once）再生成
- WHEN module 目錄已存在, THEN update README rather than rebuild

**Reason:** 根治 updateIndex 清空 curated 欄的保真度缺陷（issue #58），auto-section 重建改為自 module-map 單一真相生成、curated 完整保留。

**Priority:** High

---

## Spec Impact（graduation 備註）

- curated 策展面自 index.md 轉為 module-map.yaml：knowledge-generate/update skill 指引同步更新（curated 欄於 module-map 策展、index.md auto block 由其生成）。
- 本 repo `module-map.yaml` 一次性校準為 curated index 值（單一真相持有 curated 真值），以 index.md 重生 byte-identical 佐證——屬實作資料遷移，非 REQ。
- types/lib module README 於 verify S/A commit 同步（新 helper/schema 欄位描述），ai-knowledge REQ 於 archive Phase 3.5 graduate。
