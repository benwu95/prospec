# Delta Spec: split-verify-adjudication

## ADDED

### REQ-TYPES-065: Drift Report 新增兩個 check id 與 constitution 區段

**Feature:** drift-detection
**Story:** US-1

**Description:**
`DRIFT_CHECK_IDS` 追加 `test-provenance`（fail-class）與 `constitution-severity`（warn-class），frozen 清單 11 → 13（僅追加、不重排、不移除）。`structural` 新增 optional `constitution` 區段（`rules[]{name, severity: MUST|SHOULD|MAY|null, has_verify_hint, line}`），鏡像 `knowledge_health` 的 optional-section 前例，不觸碰 `knowledge_health` frozen 契約。

**Acceptance Criteria:**
1. `DRIFT_CHECK_IDS` 長度為 13，且包含兩個新 id；既有 11 個 id 的相對順序不變
2. `runChecks` 未派送任一新 evaluator 時編譯失敗（`Record<DriftCheckId, CheckOutcome>` 窮盡性守衛）
3. 報告含 `structural.constitution.rules[]` 時通過 `DriftReportSchema`；不含時（Constitution 不可用）亦通過
4. `severity` 為 `null` 代表該 principle 未標 RFC-2119，schema 接受且不得自動補值

**Priority:** High

---

### REQ-TYPES-066: metadata test_provenance 與 dimension 裁決者詞彙

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
`ChangeMetadataSchema` 新增 optional `test_provenance`（`command`／`exit_code`／`digest`／`date`），canonical 欄位順序落在 `review_provenance` 之後、`introduced_by` 之前。`DIMENSION_RESULTS` 追加 `not-adjudicated`（機械維度因 engine 不可用而未裁決，與「按契約不適用」的 `not-applicable` 明確區分）；`QualityDimensionSchema` 追加 optional `adjudicator: 'machine' | 'judgment'`。gate `result` 三態不變。

**Acceptance Criteria:**
1. 含 `test_provenance` 的 metadata 通過驗證；省略亦通過（既有 archived change 全數仍合法）
2. `dimensions[].result` 接受 `not-adjudicated`；entry 層 `result` 仍拒絕該值（維持 gate 三態）
3. `dimensions[].adjudicator` 可省略；給值時僅接受 `machine`／`judgment`
4. `test_provenance` **不**進入 `REQUIRED_METADATA_FIELDS`，`metadata-completeness` 對既有 change 的判定不變

**Priority:** High

---

### REQ-TYPES-067: EscapedDefectReport schema

**Feature:** drift-detection
**Story:** US-5

**Description:**
新增 `types/escaped-defect.ts`：`EscapedDefectReportSchema`（`generated_at`／`sample_count`／`gates[]{gate, passed, escaped, escaped_rate}`／`samples[]{fix_change, introduced_by, gates_passed[]}`／`unresolved_references[]`／`archive_available`）與 `ESCAPED_DEFECT_REPORT_FILENAME`。與 `DriftReport` 分開的獨立形狀——escaped-defect 是歷史聚合，不是 drift check。

**Acceptance Criteria:**
1. `sample_count === 0` 時 `gates[]` 為空陣列（不得輸出 rate 為 0 的假統計）
2. `escaped_rate` 僅在 `passed > 0` 時出現，否則該 gate 不列出；`escaped` 計算**相異**被指認 change（與 `passed` 同單位），故 rate 恆在 0..1
3. `archive_available: false` 表示 `.prospec/archive/` 不存在，報表據此揭露樣本不完整
4. `ledger_available: false` 表示兩個 ledger 目錄皆不存在、**完全沒讀到紀錄** —— 與「讀到了但無人登記」（`sample_count: 0`）是兩件不同的事，不得混為一談

**Priority:** Medium

---

### REQ-TYPES-068: config tech_stack.test_command

**Feature:** project-setup
**Story:** US-2

**Description:**
`ProspecConfigSchema` 的 `tech_stack` 追加 optional `test_command`（字串），讓非 JS 生態專案指定自己的測試指令；未設定時由 `resolveTestCommand` 回退推導。

**Acceptance Criteria:**
1. 設定 `test_command` 的 `.prospec.yaml` 通過驗證；未設定亦通過（向後相容）
2. 空字串視為未設定（不得產生空 argv）

**Priority:** Medium

---

### REQ-LIB-032: Constitution 規則解析器與 constitution-severity check

**Feature:** drift-detection
**Story:** US-4

**Description:**
新增 `lib/constitution-parser.ts` 的 `parseConstitutionRules(markdown)`：只掃 `## Principles` 區段內的 `###` 標題，抽出規則名稱、`[MUST]`／`[SHOULD]`／`[MAY]` 嚴重度（無標籤 → `null`）與有無 `**Verify**:` 提示；fenced code block 內容不掃（重用既有 fence 跳過邏輯，不手抄）。`collectConstitutionRules` 置於 `drift-sources.ts`（I/O），`evaluateConstitutionSeverity` 置於 `drift-checker.ts`（純函式，warn-class）。

**Acceptance Criteria:**
1. 每條 principle 標題產生一個清冊條目，數量等於 `## Principles` 區段內 `###` 標題數
2. 未標 RFC-2119 的 principle → 一個 warn finding（含 `source_path` + `line`），且清冊仍列出該條、`severity: null`
3. 圍籬程式碼區塊內的 `### [MUST] ...` 不計入
4. Constitution 檔案不存在 → `{available:false, reason}` → check `skipped` + reason（永不假 PASS）
5. evaluator 保持 I/O-free；findings codepoint 排序

**Priority:** High

---

### REQ-LIB-033: 測試指令解析、執行與 test-provenance check

**Feature:** drift-detection
**Story:** US-2

**Description:**
`lib/config.ts` 新增 `resolveTestCommand(config, cwd)`（canonical resolver，與 `resolveBasePaths`／`resolveKnowledgeTokenBudget` 同類）：優先 `tech_stack.test_command`，否則在 package.json 有 `scripts.test` 時回退 `<package_manager> test`，皆無 → `null`。新增 `lib/test-runner.ts` 的 `runTestCommand(cwd, argv, timeoutMs)`：`spawnSync` 且 `shell: false`（**刻意不支援 shell 語法**，pipes／`&&` 不在範圍），逾時回報 `timed_out`。`collectTestProvenance(cwd)` 置於 `drift-sources.ts`（重用 `computeChangeDigest`），`evaluateTestProvenance` 置於 `drift-checker.ts`（fail-class）。

**Acceptance Criteria:**
1. `status: implemented` 且無 `test_provenance` → fail「no test run recorded」
2. 記錄的 digest ≠ 現值 → fail「stale」；`exit_code !== 0` → fail 並揭露指令與退出碼
3. digest 相符 ∧ `exit_code === 0` → pass（無 finding）
4. **backfill 寬待逐分支適用，且以 `backfill-draft.md` 存在為前提**（`scale` 可手改，不足以證明程式碼是既有的）：已證實的 backfill 對「無紀錄」與「stale」豁免（結果未知，同等於缺測試），但**對已記錄的失敗絕不豁免** —— verify 契約明訂「不得抑制已記錄的非零退出碼」，而該維度現在逐字採用本 check 的狀態。未證實的 backfill 一律按標準契約評定
5. status 非 `implemented` → 不標記（exempt）
6. 專案無可解析的測試指令 → `skipped` + reason（點明要設 `tech_stack.test_command`）；非 git repo／無 `.prospec/changes/`／digest 無法計算亦同
7. `runTestCommand` 逾時或被信號終止 → 呼叫端不寫入任何紀錄（不得留半筆），且逾時與其他信號（SIGSEGV／OOM／Ctrl-C）分別誠實回報
8. digest 於測試**執行後**取樣並記錄（否則寫出 artifact 的套件會永久自我 stale）；執行前後不一致時揭露 tree 在跑測試期間被改動

**Priority:** High

---

### REQ-LIB-034: escaped-defect ledger collector 與純聚合器

**Feature:** drift-detection
**Story:** US-5

**Description:**
`collectQualityLedger(cwd)` 置於 `drift-sources.ts`（I/O）：同時列舉 `.prospec/changes/*` 與 `.prospec/archive/*` 的 `name`／`status`／`scale`／`introduced_by`／`quality_log`，並標明 archive 目錄是否存在。新增 `lib/escaped-defects.ts` 的 `aggregateEscapedDefects(source)`（純函式）：對每個帶 `introduced_by` 的 change，反查被指認 change 的 `quality_log`，凡在其上記過 PASS 的 gate 各記一次 escaped；`passed` 為該 gate 的 PASS 總數。

**Acceptance Criteria:**
1. 既有 archived change 不需補任何資料即可產出報表
2. 無任何 `introduced_by` → `sample_count: 0` ∧ `gates: []`（不得輸出 0% 漏失率）
3. `introduced_by` 指向不存在的 change → 列入 `unresolved_references`，不靜默丟棄；指向**多於一個** change（別名衝突，如 archive 的日期前綴目錄與在途同名 change）亦列為未解析，不得任選一個當贏家
4. `.prospec/archive/` 不存在 → `archive_available: false`，樣本不完整被明示
5. 聚合器保持 I/O-free，相同輸入產生相同輸出

**Priority:** Medium

---

### REQ-SERVICES-068: check.service 注入新 collector 與 --record-tests 寫入路徑

**Feature:** drift-detection
**Story:** US-2

**Description:**
`check.service.execute` 純路徑注入 `collectTestProvenance` 與 `collectConstitutionRules`（Constitution 路徑取自既有 `resolveBasePaths`，不自行組路徑）。新增 `--record-tests` 旗標分支：`resolveChange` → `resolveTestCommand` → `runTestCommand` → `computeChangeDigest` → 以 comment-preserving Document 寫入 `test_provenance`，沿用 `--record-review` 的既有寫入模式。

**Acceptance Criteria:**
1. 純檢查路徑仍為 read-only 且決定性（同狀態重跑報告除 `generated_at` 外逐位元相同）
2. 無測試指令／非 git repo／metadata 不存在／逾時 → `{ recorded: false, reason }` 誠實 skip，不寫假紀錄
3. 測試失敗（`exit_code !== 0`）仍**寫入**紀錄（事實就是失敗），由 evaluator 判 fail
4. 多個 change 在途時 `--change` 可指定目標

**Priority:** High

---

### REQ-SERVICES-069: check.service --escaped-defects 聚合模式

**Feature:** drift-detection
**Story:** US-5

**Description:**
`check.service.execute` 新增 `--escaped-defects` 分支：`collectQualityLedger` → `aggregateEscapedDefects` → schema 驗證 →（`--json` 時）`atomicWrite` 至 `escaped-defect-report.json`，回傳新的 Result kind。沿用 `--init-ci`／`--record-review` 的「非 check 模式」前例，`--strict` 語意不受影響。

**Acceptance Criteria:**
1. 未帶 `--json` 時不寫檔，只回傳報表供 CLI 呈現
2. 報表通過 `EscapedDefectReportSchema`；違反契約時丟出具名錯誤
3. 該模式不執行任何 drift check，也不影響 `--strict` 的退出碼

**Priority:** Medium

---

### REQ-CLI-022: prospec check --record-tests / --escaped-defects 旗標

**Feature:** drift-detection
**Story:** US-2

**Description:**
`prospec check` 追加 `--record-tests`（記錄測試基線後結束）與 `--escaped-defects`（產出漏失率報表後結束），沿用既有 `--change <name>` 作為 `--record-tests` 的消歧路徑；新增 escaped-defect 的 formatter。所有 repo 來源字串經 `sanitizeTerminal()`；旗標不帶時行為與現況完全一致。

**Acceptance Criteria:**
1. `--record-tests` 輸出記錄結果或誠實 skip 理由；`--escaped-defects` 輸出各 gate 統計或「no registered samples」
2. 兩個新 check 在人類可讀輸出中各有自己的狀態行，`skipped` 顯示 reason
3. `--strict` ∧ 有 FAIL → exit 1（warn／skipped 不影響），語意不變
4. 未帶新旗標時，輸出與現行版本一致

**Priority:** High

---

### REQ-TEMPLATES-153: verify 維度裁決分流與 grade 兩本帳

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`prospec-verify` 每個維度標明裁決者：V1／V4／V5 為 `[machine]`（逐字採用 `prospec check` 裁決，agent 只解讀與敘述、**不得改判**），V2／V6 為 `[judgment]`，V3 為混合（清冊與嚴重度機械、違反判定判斷）。grade 由兩本帳合併：任一機械維度 FAIL 即不可 `verified`；判斷維度不得因機械維度 PASS 而被洗白。`quality_log` `dimensions[]` 寫入 `adjudicator`。

**Acceptance Criteria:**
1. 模板每個維度區段都標示 `[machine]`／`[judgment]`／混合與其事實來源
2. NEVER 段落含「不得改判機械維度裁決」與「不得把 `not-adjudicated` 當 PASS」兩條
3. engine 不可用 → 機械維度記 `not-adjudicated` ＋ WARN，且明文「grade S 不可達」；該 WARN **不計入 grade A 的 ≤2 WARN 額度**（否則三個機械維度就把未裝 CLI 的專案永久卡在 `verified` 之下）
4. Status Update 段落要求 `dimensions[]` 每筆帶 `adjudicator`

**Priority:** High

---

### REQ-TEMPLATES-154: verify V5／V3 消費新引擎事實

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
verify 在取事實前先跑 `prospec check --record-tests`，V5 的裁決改讀報告的 `test-provenance` check（不再由 agent 自陳測試通過）。V3 逐條對 `structural.constitution.rules[]` 表態，表態數不得少於清冊條目數；嚴重度一律取自清冊，agent 不得自行改派。

**Acceptance Criteria:**
1. Startup／Core Workflow 明列 `--record-tests` 步驟且位於讀報告之前
2. V5 區段以 `test-provenance` 為裁決來源，並保留 `scale: backfill` 既有寬待（缺測試為 informational、真失敗仍 FAIL）
3. V3 區段要求逐條對清冊表態，並明示未標籤 principle 退回判斷評級（向後相容）

**Priority:** High

---

### REQ-TEMPLATES-155: verify V2／V6 強制 fresh context 與降級揭露

**Feature:** sdd-workflow
**Story:** US-3

**Description:**
V2（delta-spec 合規）與 V6（設計一致性）必須由與實作不共享 context 的獨立審查者評定。harness 無法開獨立 subagent 時，提供降級路徑並記一筆 WARN 揭露，不得靜默在同 session 內評定。

**Acceptance Criteria:**
1. V2／V6 區段明文要求 fresh context 並說明為何（generator≠validator）
2. 降級路徑明文含「記 WARN 揭露」，NEVER 段落禁止靜默同 session 評定
3. `scale: quick` 的 V2 仍為 `not-applicable`，機械化與 fresh-context 要求都不得把它變成 FAIL

**Priority:** High

---

### REQ-TEMPLATES-156: review／verify 職責邊界單一敘述

**Feature:** sdd-workflow
**Story:** US-3

**Description:**
「review ＝ 開放式找缺陷（無界搜尋，必須機率）／verify ＝ 封閉式核對合約（有界比對，能機械就機械）」這組邊界敘述只在 `prospec-verify` 出現一次；`prospec-review` 只留單行指向，移除重疊敘述。

**Acceptance Criteria:**
1. 邊界敘述句在 review ＋ verify 兩份模板中的出現次數合計為 1
2. `prospec-review` 不再重述 verify 的維度或 grade 語意，只保留 major→WARN 的自身契約
3. 契約測試以 mutation 驗證（把該句複製到 review 應轉紅）

**Priority:** High

---

### REQ-TEMPLATES-157: reference 與 shipped 模板契約同步

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`references/drift-report-format` 記錄兩個新 check、`structural.constitution` 區段與 escaped-defect 報表形狀；`references/metadata-format` 將 `test_provenance` 併入 canonical 欄位順序並記錄 dimension 的 `not-adjudicated`／`adjudicator`；shipped `init/status-lifecycle.md.hbs`（與專案自身 `_status-lifecycle.md`）的 `implemented → verified` 閘門敘述改為「機械維度由 check engine 裁決」。

**Acceptance Criteria:**
1. drift-report-format 記錄的 check id 集合與 `DRIFT_CHECK_IDS` 一致（13 個）
2. metadata-format 的 canonical 欄位順序含 `test_provenance` 且位置正確
3. shipped status-lifecycle 模板與專案文件的閘門敘述一致，無一方遺留舊敘述
4. `getSkillReferences` 的 reference map 涵蓋所有新／改動 reference（無 dangling）

**Priority:** High

---

### REQ-TYPES-069: 本專案的知識分層預算上調（明文登記）

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
本變更的文件成長把三個知識檔推過既有預算：`_status-lifecycle.md`（L1，閘門語意改變必須寫進正典狀態文件）、`modules/lib/README.md` 與 `modules/types/README.md`（L2，新增四個 lib 檔與一個 types 檔的事實，以及 11→13 的計數更正）。經專案擁有者決定，在 `.prospec.yaml` 逐欄覆寫為 `l1_per_file: 2000`、`l2_per_module: 1500`，而非刪減既有知識來擠空間。**shipped 預設值不變**（`DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 仍是 1800／1000／100），故此為本專案的 override，不影響下游。

誠實揭露：`knowledge-size` 由 WARN 轉 PASS 是因為預算放寬，不是因為知識變小。取捨理由——該 check 的用意是防止**無聲**回彈，而這次成長既非無聲（明文登記於此）也非冗餘（閘門語意與新檔案清單都是必要事實）；`_status-lifecycle.md` 在本變更前就已是 1791／1800、僅剩 39 字元餘裕，繼續壓縮等於拿其他變更的知識換本變更的空間。

**Acceptance Criteria:**
1. `.prospec.yaml` 的 `knowledge.token_budget` 逐欄覆寫 `l1_per_file: 2000`、`l2_per_module: 1500`；未列欄位仍回退預設
2. `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 與 init seed 的預設值**不變**（下游專案不受影響），index.md 宣告的仍是預設值並由單一來源測試釘住
3. `knowledge-size` 在調整後為 PASS，且此份 delta-spec 明載「PASS 來自預算放寬而非知識縮減」

**Priority:** Medium

---

### REQ-TESTS-056: 新引擎的 collector／evaluator 測試

**Feature:** drift-detection
**Story:** US-1

**Description:**
`evaluateTestProvenance`（無紀錄／stale／失敗退出碼／通過／backfill exempt／非 implemented exempt／unavailable skipped）、`evaluateConstitutionSeverity`（全標籤 pass／缺標籤 warn／無 principles／unavailable skipped）、`parseConstitutionRules`（fence-aware／未標籤／Verify hint 有無）、`aggregateEscapedDefects`（無樣本／未解析參照／per-gate rate）、`resolveTestCommand`（config 優先／package.json 回退／皆無 → null）、`runTestCommand`（exit code／逾時）、三個 collector 的 fixture 測試。

**Acceptance Criteria:**
1. 每個 evaluator 的每條 AC 都有能在舊實作下轉紅的測試（mutation-verified）
2. collector 以暫存 fixture 驗證 available／unavailable 兩態
3. `runTestCommand` 測試不依賴專案自身測試套件（用最小外部指令）

**Priority:** High

---

### REQ-TESTS-057: 報告契約、skill 契約與 CLI 整合測試

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`drift-report.test.ts` frozen 計數 11 → 13 ＋ 清單同步；skipped-never-PASS 覆蓋 13 個 check；verify 模板 section-scoped 斷言（裁決者標記／不得改判 NEVER／fresh context 要求／`not-adjudicated`）；邊界句跨模板出現次數 === 1；metadata-format 記錄 `test_provenance`；`check.service` 注入與兩個新旗標的整合／e2e 測試。

**Acceptance Criteria:**
1. frozen 計數與 id 清單斷言同步為 13
2. skill 契約斷言為 section-scoped，刪除任一新段落即轉紅（mutation-verified）
3. `--record-tests` 整合測試確認 metadata 寫入且註解與未知欄位保留
4. `--escaped-defects` e2e 測試確認報表產出與無樣本時的誠實輸出

**Priority:** High

---

## MODIFIED

### REQ-TYPES-052: Drift Report frozen check id 計數

**Feature:** drift-detection
**Story:** US-1

**Before:**
`DRIFT_CHECK_IDS` 共 **11** 個 frozen check id（第 11 個為 `knowledge-size`）。

**After:**
`DRIFT_CHECK_IDS` 共 **13** 個 frozen check id——追加 `test-provenance`（第 12，fail-class）與 `constitution-severity`（第 13，warn-class）。

**Reason:**
V5 與 V3 的機械化各需一個 check id；frozen 清單僅追加，窮盡性守衛確保漏接即編譯失敗。

**Priority:** High

---

### REQ-TYPES-022: quality_log dimension 詞彙擴充

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
`dimensions` 為 `{name, result: PASS|WARN|FAIL|not-applicable}[]`；`result` 保持 gate 三態。

**After:**
`dimensions` 追加 optional `adjudicator: machine|judgment`，且 `result` 詞彙追加 `not-adjudicated`（機械維度因 engine 不可用而未裁決）。entry 層 `result` 仍限 gate 三態。

**Reason:**
維度裁決者身分需可機械聚合；「未裁決」與「不適用」是兩種不同事實，混為一談會讓可重現性宣稱失真。

**Priority:** High

---

### REQ-TEMPLATES-034: verify 4/5 Knowledge 維度改為機械裁決

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
verify 4/5 由 agent 判定 pre-existing Knowledge drift，drift engine 的 `knowledge_health` 作為參考事實。

**After:**
4/5 的裁決逐字採用 `knowledge-health` check 的結果（`[machine]`），語意判讀（README 是否描述了程式碼沒有的行為）仍為 agent 工作但不得推翻機械裁決；engine 不可用 → `not-adjudicated`。

**Reason:**
把「參考事實」升級為「裁決來源」，是本案 V1／V4／V5 分流的核心。

**Priority:** High

---

### REQ-TEMPLATES-045: verify Knowledge 新鮮度來源升級為裁決

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
報告可用時以 `knowledge_health` 為 staleness 的真相來源，不可用時退回 LLM 判斷並明示。

**After:**
報告可用時 staleness 的**裁決**即為 `knowledge-health` 的狀態；不可用時記 `not-adjudicated` ＋ WARN（不再以 LLM 判斷代為裁決），grade 上 S 不可達。

**Reason:**
「退回 LLM 判斷」會讓機械維度的確定性宣稱在最需要時失效——誠實揭露未裁決優於偽造裁決。

**Priority:** High

---

### REQ-TEMPLATES-063: verify Constitution 嚴重度取自機械清冊

**Feature:** sdd-workflow
**Story:** US-4

**Before:**
verify 3/5 自行讀 Constitution，按 RFC-2119 嚴重度評級（MUST→FAIL／SHOULD→WARN／MAY→informational）。

**After:**
嚴重度與規則清冊取自報告的 `structural.constitution.rules[]`，agent 不得自行改派嚴重度、表態數不得少於清冊條目數；未標籤 principle 退回判斷評級（向後相容）。

**Reason:**
嚴重度已結構化，先機械化這一層可同時消除「漏規則」與「亂配嚴重度」兩類雜訊。

**Priority:** High

---

### REQ-TEMPLATES-145: verify dimensions 寫入裁決者

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
verify 寫入結構化 `grade` 與 `dimensions`（5+1 維度的 PASS/WARN/FAIL）。

**After:**
`dimensions[]` 每筆額外寫入 `adjudicator`（`machine`／`judgment`），且允許 `not-adjudicated` 結果；`result` 仍為 gate 三態。

**Reason:**
沒有裁決者欄位，事後無法區分「機器判的」與「模型判的」，escaped-defect 分析也就無法歸因到正確的 gate。

**Priority:** Medium

---

### REQ-TESTS-045: skipped-never-PASS 覆蓋 13 個 check

**Feature:** drift-detection
**Story:** US-1

**Before:**
`check.service` 注入測試與 skipped-never-PASS 斷言覆蓋全部 11 個 check。

**After:**
覆蓋 13 個 check（含 `test-provenance`／`constitution-severity`）。

**Reason:**
新 check 必須同受「skipped 絕不呈現為 PASS」的既有不變式保護。

**Priority:** High

---

### REQ-TESTS-022: gate ＋ quality_log 測試涵蓋新詞彙

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
單元測試驗證 `quality_log` schema（接受／省略／`result` 三態／六個 lifecycle 狀態／結構化 grade、dimensions、criticals 計數）。

**After:**
追加驗證 `dimensions[].result` 接受 `not-adjudicated`、entry 層 `result` 拒絕該值、`adjudicator` 可省略且僅接受兩個值。

**Reason:**
新詞彙若無測試釘住，entry 層與 dimension 層的界線會在下一次改動中被抹平。

**Priority:** High

---

## REMOVED

_（無）_
