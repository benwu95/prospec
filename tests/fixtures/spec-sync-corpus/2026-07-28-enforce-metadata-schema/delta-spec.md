# Delta Spec: enforce-metadata-schema

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-TYPES-064: Metadata 驗證錯誤型別與 bare module name 約束

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
新增 `MetadataValidationError`（繼承 `ProspecError`，code `METADATA_VALIDATION_FAILED`）作為 metadata.yaml schema 違規的專屬錯誤型別，訊息同時攜帶 change 名稱與 zod issue 的欄位路徑。同時收緊 `ChangeMetadataSchema` 的 `related_modules` 元素為 bare module name——採 refinement（拒絕 markdown 強調字元、反引號、前後空白、空字串）而非白名單 regex，避免限制其他專案的模組命名慣例。

此 REQ 另修正一處**契約自身的缺陷**（由一次性回溯掃描發現）：`QualityDimensionSchema.result` 原為 `GATE_RESULTS` 三態，但真實已歸檔紀錄 `2026-07-06-include-tests-in-typecheck` 的 `dimensions` 內含 `result: not-applicable`——即 schema 會拒絕 verify 實際產出的合法紀錄。維度結果與 gate 三態本就是不同詞彙（`/prospec-verify` 對 quick／backfill 不適用的維度要求標為 `not-applicable` 而非 PASS，以免未檢查的維度讀起來像通過），故新增 `DIMENSION_RESULTS = [...GATE_RESULTS, 'not-applicable']`；gate 的 `result` 維持嚴格三態不變。

同時修正兩處與此相矛盾的產出端文件：`prospec-verify.hbs` 原指示「omit a `not-applicable` dimension」（與實際紀錄及本 schema 皆相斥），改為明列四值並要求「never omitted and never PASS」；`metadata-format` reference 原對 dimension 詞彙隻字未提，補上其詞彙寬於 gate 三態、且 `not-applicable` 僅在此處合法。

**Acceptance Criteria:**
1. `MetadataValidationError` 繼承 `ProspecError`，`code` 為 `METADATA_VALIDATION_FAILED`，並提供指向 metadata-format reference 的 `suggestion`
2. 錯誤訊息同時含 change 名稱與至少一個 zod issue 的欄位路徑（如 `quality_log.0.result`）
3. `related_modules` 含 `**types**`、`` `lib` ``、前後空白或空字串時 schema 驗證失敗
4. `related_modules` 為 `types`／`api-middleware`／`user_profile` 等 bare name 時通過驗證
5. `dimensions[].result` 接受 `not-applicable`，但 gate 的 `result` 仍拒絕它；grade 值（`S`/`A`）在兩處皆被拒
6. schema **每一層皆 loose**（頂層與巢狀的 `QualityLogEntrySchema`／`QualityDimensionSchema`／`ReviewProvenanceSchema`）——未建模的鍵通過驗證且出現在解析結果中，解析視圖不與磁碟分歧。唯一的刻意例外是 `warnings` 的 `.default([])`，它**只增不減**（format reference 要求該鍵恆存在）
7. 另備**嚴格建構視圖** `NewChangeMetadataSchema`／`NewChangeMetadata`——`.loose()` 會為推導型別加上索引簽章而關掉 tsc 的 excess-property 檢查，故建構端（`change-story`）改用嚴格型別，讓打錯的鍵在編譯期即被攔下；以 `@ts-expect-error` 守衛釘住
8. `prospec-verify.hbs`（含 Self-Check 檢查表）與 `metadata-format` reference 皆載明 dimension 的四值詞彙，與 schema 一致，全檔無殘留三態宣告（模板改動經 `pnpm bundle` + agent sync 重生）

**Priority:** High

---

### REQ-LIB-031: metadata.yaml 讀寫的單一驗證入口

**Feature:** sdd-workflow
**Story:** US-1, US-3

**Description:**
新增 `lib/change-metadata.ts` 作為 metadata.yaml 的唯一讀寫入口（PB-006 單一來源），取代各 service 自行 `parseYamlDocument(...).toJS() as ChangeMetadata` 的無檢查 cast。讀取時以 `ChangeMetadataSchema` 驗證並同時回傳 Document 供 lossless 寫回；寫入時落盤前再驗一次。驗證為純把關——只讀不寫，不得改寫或剝除任何資料。

**Acceptance Criteria:**
1. `readChangeMetadata(path, changeName)` 回傳 `{ doc, metadata }`；schema 違規時拋 `MetadataValidationError`，不回傳降級預設值
2. `writeChangeMetadataDoc()` 與 `writeChangeMetadataObject()` 在寫入前驗證，失敗即拒寫且目標檔案不被修改
3. metadata 含 schema 未定義的額外欄位時驗證通過，該欄位同時保留於 `doc` 與 `metadata` 兩個視圖，且讀→修改→寫一輪後仍在檔案中（read-modify-write 不得靜默丟鍵）
4. metadata 含 YAML 註解時，經 Document 路徑寫回後註解保留
5. 落盤一律經 `atomicWrite()`，無裸 `writeFileSync`
6. helper 僅 import `types` 與 `lib` 內部模組，無 `services`／`cli` 反向匯入

**Priority:** High

---

### REQ-SERVICES-067: 全部 metadata 讀寫點遷移至共用 helper

**Feature:** sdd-workflow
**Story:** US-1, US-2

**Description:**
`change-story`／`change-plan`／`change-tasks`／`check --record-review` 四處**做過無檢查 cast** 的讀寫點改用 `lib/change-metadata.ts`。強制驗證的邊界＝原本宣稱型別卻不檢查的地方。

兩處**刻意不納入**強制驗證，理由不同但同源——兩者都是**寬鬆掃描**而非型別邊界：

- `lib/drift-sources.ts`：職責是回報不合規並產出 finding。在此拋錯會使 `prospec check` 對損壞 metadata 直接崩潰，反而摧毀 `metadata-completeness` 這個專為攔截壞 metadata 而存在的檢查。
- `archive.service.ts`：全程以 `Record<string, unknown>` 讀取，從未宣稱型別契約，且它是**終端站**——必須能吸收前面各站現在會拒絕的紀錄，否則缺 `created_at` 的 pre-schema change 會變成永遠無法歸檔（既有測試「falls back to created_at then "unknown"」即此 fallback 的覆蓋）。其完整性下限由 archive skill 的 Entry Gate 經 `metadata-completeness` drift check 在服務執行前把關；在此再驗一次只會把一個**可回報的缺口**變成**靜默 skip**。

> **實作期偏離記錄（2026-07-28）**：原 plan 與本 REQ 初稿將 `archive.service` 列入遷移範圍（「只加驗證」）。實作時加上驗證即打破上述既有契約測試，經檢視判定該容忍是刻意設計而非疏漏，故縮小範圍並在此記錄，未放寬任何 schema。

**Acceptance Criteria:**
1. 全倉 grep `as ChangeMetadata` 於 `src/services/` 結果為零
2. 四個遷移站點的既有流程行為（status 單向前進、`fs.existsSync` 缺檔分支）不變；但它們現在**會拒絕**違反必填欄位下限的 metadata，包含缺 `created_at` 的 pre-schema 紀錄——這是 US-1 要求的行為改變，不是回歸。只有 `archive.service` 與 `lib/drift-sources.ts` 保留寬鬆讀取
3. `lib/drift-sources.ts` 與 `archive.service.ts` 維持寬鬆讀取，損壞的 metadata 使 `prospec check` 產出 finding、使 archive 沿用既有 skip／fallback，皆非拋出未捕捉例外
4. 任一遷移站點讀到損壞 metadata 時，錯誤訊息指名該 change 與欄位

**Priority:** High

---

### REQ-TESTS-055: Metadata 契約的驗證、lossless 與回溯測試

**Feature:** sdd-workflow
**Story:** US-1, US-2, US-3

**Description:**
為 metadata 執行期契約補齊四類測試：驗證失敗的指名回報、bare module name 拒絕、lossless 讀寫回歸、以及**取自真實 archived metadata 之形狀**的契約回歸。測試全程使用 memfs，fixture 為從真實紀錄轉錄的 YAML 形狀，不讀取本機 `.prospec/archive/`。

> **實作期偏離記錄（2026-07-28）**：本 REQ 初稿要求「回溯測試掃描真實 `.prospec/archive/` 目錄，因此使用真實 temp dir 而非 memfs」。該掃描**以一次性診斷執行**，結果反而證明它不能當常駐測試。43 筆首掃 28 通過／15 失敗；其中 1 筆敗於**契約自身缺陷**（`dimensions[].result: not-applicable` 被 schema 拒絕），修進 REQ-TYPES-064 後該筆轉綠，最終為 29 通過／14 失敗，**剩下的 14 筆全屬歷史資料缺陷**——producer 皆已修正，資料本身不在驗證路徑上（`.prospec/archive/` 為 gitignored 本機狀態）。一個綁定本機 archive 內容的測試會因他人機器的歷史資料而紅，且對契約無鑑別力。故改以轉錄自真實紀錄的形狀為 fixture，鑑別力保留、去除本機耦合。AC4 已據此改寫；診斷結果記於 proposal SC-002。

**Acceptance Criteria:**
1. 損壞的 `status`／`quality_log`／`review_provenance` 各有一個測試，斷言錯誤訊息含 change 名稱與欄位路徑
2. `related_modules` 含 markdown 強調或空白時驗證失敗，有對應測試
3. 帶未知欄位與註解的 fixture 讀→寫一輪後逐字元相等
4. 取自真實 archived metadata 的形狀（`grade`／`not-applicable` 維度／`archived_at` 未知欄位／review 計數）驗證通過；已知的兩種歷史畸形（grade 寫進 `result`、`warnings` 為字串）驗證失敗
5. 整合測試涵蓋 `change story → plan → tasks`，斷言三站寫出的 metadata 皆通過 schema、且 `related_modules` 為 bare name
6. contract 測試以真實 `renderTemplate()` 斷言 proposal 的模組名只加粗一層（`****` 不得出現）
7. 斷言 section-scoped 且經 mutation 驗證（PB-001），非全文 `toContain`

**Priority:** High

---

## MODIFIED

### REQ-CHNG-003: Auto-Identify Related Modules

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
以關鍵字比對 `{base_dir}/index.md` 推導相關模組，Module 欄的儲存格內容**直接**作為模組名寫入 `related_modules` 與 `proposal.md`。

**After:**
Module 欄取值後先經 `lib/knowledge-reader.ts` 的 `stripCellEmphasis()` 剝除 markdown 強調，再作為模組名使用。該 helper 是 index.md Module 欄的**單一剝除來源**（PB-006），與 `parseIndexModules` 共用——兩份字元集不同的實作會對同一模組給出不同身分——`related_modules` 寫入 bare name（`types`），`proposal.md` 的 Related Modules 由模板自行加粗（`proposal.md.hbs` 已渲染 `- **{{this.name}}**:`），不再產生雙層強調。

**Reason:**
現況直接取 `**types**` 寫入 metadata，違反 metadata-format 明文要求的 bare module name，並經模板二次加粗成 `****types****`。更嚴重的是下游以 `related_modules` 推導受影響模組的路徑（archive Entry Gate、feature-prefixed REQ 的模組推導）會對應到不存在的模組名，屬 BL-043 已硬化過的 phantom module 風險類別。REQ-TYPES-064 收緊 schema 後，此 producer 若不修正會直接使 `prospec change story` 拋錯——兩者強制耦合。

**Priority:** High

---

## REMOVED

_No removals in this change._
