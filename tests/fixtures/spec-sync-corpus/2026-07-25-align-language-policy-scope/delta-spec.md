# align-language-policy-scope — 需求增量

## ADDED

### REQ-TYPES-063: LanguageScope 契約

**Feature:** project-setup
**Story:** US-1

**Description:**
`types/constitution.ts` 新增 `LanguageScope`：`language`（解析後的 artifact language）、`nativePaths[]`、`englishPaths[]`、`namedExceptions[]`。純型別附加，`ConstitutionRule` 不變，既有 `.prospec.yaml` 不受影響。

**Acceptance Criteria:**
1. `LanguageScope` 由 `types` 匯出，`lib`／`services` 皆可 import（相依方向不變）
2. 型別不含任何硬寫路徑字串 —— 路徑值由 lib 的解析器填入
3. `pnpm typecheck`（含 tests/）通過

**Priority:** High

---

### REQ-LIB-030: 語言範圍單一來源與舊措辭偵測

**Feature:** project-setup
**Story:** US-1, US-3

**Description:**
`lib/language-policy.ts` 提供 `resolveLanguageScope(config, cwd)`（經 `resolveBasePaths` + `resolveArtifactLanguage` 推導母語集／英文集／具名例外集，路徑以 `path.posix.join` 組出以免 base 為 `.` 時塌成根路徑）、`formatPathList(paths)`（共用渲染格式）、`entryLanguageContext(scope)`（entry config 的三個 context key，兩個 render site 共用）與 `isSeededLanguagePolicyStale(content)`（純判定，只認未經修改的舊 seed 措辭）。此檔是語言範圍的唯一真相，`CONSTITUTION.md` 與 entry config 皆由它取值。

**Acceptance Criteria:**
1. `paths.base_dir`／`knowledge.base_path` 搬離預設值時，輸出為解析後實際路徑（無硬寫 `prospec/ai-knowledge`）
2. 母語集含 `.prospec/changes/**`、`.prospec/archive/**`、`<base_dir>/specs/_archived-history/**`；英文集含 `<base_dir>/CONSTITUTION.md`、`<base_dir>/README.md`、`<base_dir>/index.md`、`<base_dir>/specs/features/**`、`<knowledge>/**`
3. 具名例外集含 alias/keyword 資料、`_lessons-ledger.md` description 欄、`_playbook.md` 逐字引用證據、`_glossary.md`（user-managed）
4. `isSeededLanguagePolicyStale`：舊 seed → true；使用者已改寫 → false；已是新措辭 → false

**Priority:** High

---

### REQ-TEMPLATES-151: entry.md.hbs 由 context 渲染語言範圍

**Feature:** agent-integration
**Story:** US-1

**Description:**
`agent-configs/entry.md.hbs` 的 Language Policy 段改由注入的 scope 變數渲染，不再硬寫路徑或「always remain in English」。具名例外不進 L0，只留一句指向 Constitution 條文，維持 entry config <100 行。該範本有**兩個** render site —— `prospec init`（經 `lib/init-docs`）與 `prospec agent sync` —— 兩者皆 spread `entryLanguageContext(scope)`，因為 Handlebars 非嚴格，缺 key 只會渲染出空路徑列表而不報錯。

**Acceptance Criteria:**
1. 渲染後的母語集／英文集與 `CONSTITUTION.md` 的條文字面相等（非英文專案）
2. `base_dir`／`knowledge.base_path` 搬移後渲染出實際路徑
3. entry config 不列舉具名例外，且仍 <100 行
4. `prospec init` 單獨執行（未接 `agent sync`）所寫的 entry config 已含完整路徑集，且英文專案取單一區塊分支

**Priority:** High

---

### REQ-TEMPLATES-152: prospec-upgrade 舊措辭遷移步驟

**Feature:** agent-integration
**Story:** US-3

**Description:**
`skills/prospec-upgrade.hbs` 新增 Step 2.5：當報告出現 `stale Language Policy wording` 時，改寫措辭取自報告的 `Current Language Policy rule:` 區塊（CLI 以本專案解析後路徑渲染），出示該區段 diff、徵詢同意後只改寫 Language Policy 區段本體，拒絕則記為 declined。這是 Step 2「只遷移 format、不動 authored wording」之外的具名例外，因為條文措辭本身是 seed 產物。**明文禁止**依賴 `print-template init/constitution.md.hbs` 取條文 —— 該範本只迴圈輸出注入的規則、本身不含條文，取回必為空。

**Acceptance Criteria:**
1. skill 含該步驟，且 Success Criteria／NEVER 均有對應條目（未經同意不得寫入）
2. 報告未出現訊號、或未附 `Current Language Policy rule:` 區塊時，該步驟自我終止並記錄跳過原因
3. contract test 以 section-scoped 斷言涵蓋

**Priority:** Medium

---

### REQ-TESTS-054: 語言範圍跨檔一致性測試

**Feature:** project-setup
**Story:** US-1, US-2

**Description:**
新增 scope 斷言與跨檔一致性 contract test：以同一 config 產生 `CONSTITUTION.md` 與 entry config，比對兩者宣告的母語集／英文集；並釘死條文含具名例外。移除任一側的範圍即轉紅（mutation-verified），補上現行 `constitution-rules.test.ts` 完全沒有 scope 斷言的缺口。

**Acceptance Criteria:**
1. 非英文語言：兩份產出的路徑集字面相等
2. English：兩份產出皆宣告 English，條文為精簡單句
3. 斷言 section-scoped（PB-001），並經 mutation 驗證會紅

**Priority:** High

---

## MODIFIED

### REQ-LIB-013: Language Policy Constitution 規則

**Feature:** project-setup
**Story:** US-1, US-2

**Before:**
`languagePolicyRule(language)` 回傳 `[MUST]` 規則 —— 所有 AI 產出文件（change artifacts + AI Knowledge）使用主要語言，程式碼與技術術語永遠英文。

**After:**
`languagePolicyRule(scope: LanguageScope)` 由解析後範圍渲染路徑式條文：母語適用 change artifacts 與 `_archived-history`；trust zone（Constitution／README／index／`specs/features`／knowledge base）與程式碼、識別字、術語、commit message 為英文；條文明列具名例外。`artifact_language` 為 English 時輸出精簡單句。init 仍將其置於 `example_rules` 之首。

**Reason:**
原措辭與同一次 init 產生的 entry config 直接對撞（前者要求 Knowledge 用母語、後者宣告 Knowledge 永遠英文），而 verify 只稽核 Constitution 且 MUST→FAIL，使新專案第一次驗證就必然違反其中一份。改由單一來源渲染可從根本消除漂移。

**Priority:** High

---

### REQ-AGNT-020: Entry Config 語言宣告

**Feature:** agent-integration
**Story:** US-1

**Before:**
entry config 內含主要語言宣告（L0 常駐；`artifact_language` 缺席或空白視為 English）。

**After:**
語言宣告改為渲染共用 `LanguageScope` 的母語集與英文集（來源與 Constitution 條文相同），不再自行列舉路徑或硬寫英文豁免；具名例外指向 Constitution。缺席或空白仍解析為 English。

**Reason:**
兩份手抄措辭是 #67 三方對齊只落一半的成因；改為同源渲染後不可能再各說各話。

**Priority:** High

---

### REQ-TEMPLATES-141: Language Policy 豁免 AI Knowledge base

**Feature:** ai-knowledge
**Story:** US-1, US-2, US-4

**Before:**
Constitution Language Policy 恢復 AI Knowledge base 豁免；`entry.md.hbs` 收斂範圍並明列豁免；`_lessons-ledger` header 補描述語言宣告（三方對齊）。

**After:**
同一份豁免改由產生器輸出，因此每個 `prospec init` 的專案都得到一致範圍（原先只落在 prospec 自身 repo）。範圍另行釐清：`specs/_archived-history/**` 歸母語（變更敘事封存副本）、`specs/features/**` 維持英文，並將 alias/keyword 資料、ledger description 欄、`_playbook.md` 逐字引用證據、`_glossary.md`（user-managed）列為具名例外。

**Reason:**
US-360 的驗收情境要求「verify 不會讓專案自我對立」，但只修本 repo 的手寫檔無法涵蓋下游；且原條文同句內「archived summaries 用母語」與「specs 用英文」互相對撞，需一併裁定。

**Priority:** High

---

### REQ-SETUP-019: prospec upgrade 指令

**Feature:** project-setup
**Story:** US-3

**Before:**
報告輸出版本差異、docs inventory 與本次 created 清單、缺 triggers 的 skills、config-field nudges。

**After:**
報告額外輸出 `staleLanguagePolicy` 訊號（seeded Language Policy 仍為舊措辭），並在觸發時附上 `Current Language Policy rule:` 區塊 —— 由本版本以該專案解析後路徑渲染的條文本體，因為沒有任何範本帶有條文文字（本體在 `lib/constitution-rules` 產生）。英文專案不觸發（舊 seed 與其 entry config 皆為英文，無矛盾可遷移）。指令本身仍**不修改 `CONSTITUTION.md`**、不遷移既有文件格式 —— 改寫由 `/prospec-upgrade` skill 徵詢後執行。

**Reason:**
修好產生器只影響未來 init 的專案；既有專案的 `CONSTITUTION.md` 歸使用者所有且 upgrade 只補建缺檔，需要一條偵測訊號才能把遷移交給有同意權的 skill。

**Priority:** Medium

---

### REQ-SERVICES-035: Upgrade Orchestrator Service

**Feature:** project-setup
**Story:** US-3

**Before:**
`buildReport` 輸出版本差異、缺 triggers 的 skills、config-field nudges、post-creation docs inventory 與 `createdDocs`。

**After:**
`buildReport` 另含 `staleLanguagePolicy` 與觸發時的 `currentLanguagePolicy`（`languagePolicyRule(resolveLanguageScope(...))` 的渲染結果）：讀取現有 `CONSTITUTION.md`（讀檔在 service）後交 `isSeededLanguagePolicyStale`（判定在 lib）決定，英文專案短路為 false。該讀取為 best-effort —— 報告階段位在版本 bump／agent sync／doc 補建之後，不可讀的 Constitution（EISDIR／EACCES）不得中止 upgrade 並吞掉報告。既有「只建立缺檔、絕不覆寫 curated doc」的界線不變。

**Reason:**
偵測需要 I/O 與純判定分層，符合 `cli → services → lib → types` 的相依方向。

**Priority:** Medium

---

### REQ-TEMPLATES-121: prospec-upgrade Skill 範本

**Feature:** agent-integration
**Story:** US-3

**Before:**
skill 為 Step 1（跑 `prospec upgrade` 並解析 report：版本差異、缺 triggers 的 skills、config-field nudges、docs inventory）→ Step 2（依 inventory 做 format 遷移／補建，一律徵詢同意）→ Step 3（設定 artifact language）→ Step 4（在地化 triggers 並 re-sync）；`NEVER` 明定不得改寫任何 authored content。

**After:**
Step 1 多解析一條 `stale Language Policy wording:` 報告行與其後的 `Current Language Policy rule:` 區塊；新增 Step 2.5 為 authored-wording 的**唯一具名例外**（僅 seed 條文本體、僅在徵詢同意後）；`NEVER` 相應加上該例外與「未被報告標記不得執行 Step 2.5」；Language Policy 段改為引用共用 partial（原為逐字手抄副本）。

**Reason:**
本 change 實際改動了此 skill 的步驟集與 NEVER 不變式，依本專案慣例（同一 REQ 在 fix-upgrade-doc-coverage、emit-trigger-scaffold 皆標 MODIFIED）必須宣告，否則畢業後的 trust-zone 規格會描述一個已不存在的 skill。

**Priority:** Medium

---

### REQ-SKILL-012: 產文件 skills 遵守 Constitution Language Policy

**Feature:** agent-integration
**Story:** US-2

**Before:**
共用 partial `_language-policy.hbs` 指示「產出文件使用 Constitution Language Policy 規則所定義的語言」，不硬編碼語言。

**After:**
同一 partial 改為指示「按**該文件路徑**在規則中對應的語言撰寫 —— change artifacts 用專案語言、trust zone 用英文；同一次 skill 執行可能同時寫入兩者」，仍不硬編碼語言。`prospec-upgrade` 由逐字手抄改為引用該 partial，使 11 個內嵌 skill 皆為單一來源。

**Reason:**
條文改為路徑式後，「所有產出文件同一語言」的指示與規則不一致，而 `/prospec-archive` 一次執行即同時寫入母語的 `_archived-history/` 與英文的 `specs/features/**` —— 這正是 feature spec 曾漂移成繁中、需另一整個 change 翻回英文的成因。

**Priority:** High

---

### REQ-TEMPLATES-072: Promotion Format Reference

**Feature:** feedback-promotion
**Story:** US-2

**Before:**
`references/promotion-format.md` 定義晉升規則、版控 ledger／playbook 條目／核准紀錄／TTL 結構，並為 Harvest 與 Review-Queue 規則的單一定義。

**After:**
另含 ledger `description` 欄的語言宣告 —— 該欄使用原始糾正的語言，是 trust zone 內的具名例外。

**Reason:**
此宣告目前只存在於 prospec 自身手寫的 `_lessons-ledger.md`；ledger 是 placeholder、由 skill 產生，下游專案因此拿不到這個例外，其母語 description 會落在英文區內無依據。

**Priority:** Medium
