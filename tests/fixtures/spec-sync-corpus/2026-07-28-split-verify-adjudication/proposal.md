# Proposal: split-verify-adjudication

## Background

`/prospec-verify` 的 5+1 維度由同一個 agent 一次跑完：它同時是 generator 與 validator，且評的常是自己在同一 session 剛完成的工作，而它的輸出（grade S/A）是 `implemented → verified` 這條邊唯一的 gate。那六個維度其實是兩種東西混在一起——有機械 oracle 的（V1 checkbox、V4 drift engine、V5 exit code）與只能判斷的（V2 REQ 意圖、V6 設計一致性）——目前共用一個 grade，前者的確定性被後者的雜訊污染，後者又借了前者的可信度。連帶的界線問題：review 是開放式找缺陷（無界搜尋，必須機率），verify 是封閉式核對合約（有界比對，能機械就機械），不重新分工兩站會滑向做同一件事。

## User Stories

### US-1: 機械維度改由 check engine 裁決 [P1]

作為 **維護 prospec 的開發者**，
我想要 **V1／V4／V5 的判定由 `prospec check` 產生、agent 只負責解讀與敘述**，
以便 **這三個維度的結論不隨模型、session 或心情改變**。

**Acceptance Scenarios:**

- WHEN 對同一個 change 連續執行兩次 verify，THEN V1／V4／V5 三個維度的裁決結果逐字相同
- WHEN check engine 對某個機械維度給出 fail，THEN 報告中該維度只能是 FAIL——agent 不得以敘述理由改判 PASS 或 WARN
- WHEN check engine 不可用（未 build／未安裝），THEN 報告明示「drift engine unavailable」且機械維度標為未裁決，不得由 agent 代為裁決後標 PASS
- WHEN 某機械維度按 scale 契約不適用（`backfill` 無 tasks.md、無 Knowledge base），THEN 維持 `not-applicable`，機械化不得把它變成 fail

**Independent Test:**
對一個既有 archived change 只跑 CLI（無任何 LLM 參與），取得三個維度的裁決；重跑一次比對兩份輸出的檢查狀態完全相同。

### US-2: 測試結果成為可重現的機械事實 [P1]

作為 **維護 prospec 的開發者**，
我想要 **測試結果以「跑過什麼指令、退出碼、當時的程式碼 digest」被記錄下來，並由機械判定是否仍有效**，
以便 **V5 不再靠 agent 自陳「測試通過」**。

**Acceptance Scenarios:**

- WHEN 執行記錄測試結果的指令，THEN 專案測試指令、退出碼、程式碼 digest 與日期被寫入該 change 的 `metadata.yaml`
- WHEN 測試紀錄存在但程式碼在其後被修改，THEN V5 判為 FAIL 並指出紀錄已過期、需重跑測試
- WHEN 從未記錄過測試，THEN V5 判為 FAIL 並要求先跑測試——絕不視為 PASS
- WHEN 專案沒有可執行的測試指令（或非 git repo），THEN 誠實 skip 並說明原因，不寫入假紀錄

**Independent Test:**
在一個測試全綠的 change 上記錄一次，check 得到 pass；隨後改動任一原始檔再跑 check，同一檢查轉為 fail 且理由為 stale。

### US-3: 判斷維度強制 fresh context 且與機械維度分開計分 [P1]

作為 **維護 prospec 的開發者**，
我想要 **V2／V6 由不與 implement 共享 context 的獨立審查者評定，並在 grade 中與機械維度分帳**，
以便 **判斷維度的雜訊不再污染機械維度的確定性，反之亦然**。

**Acceptance Scenarios:**

- WHEN verify 執行 V2 或 V6，THEN 由與實作不共享 context 的獨立審查者評定，且報告標明該維度是判斷裁決
- WHEN harness 無法開獨立 subagent，THEN 報告明示降級路徑並記一筆 WARN，不得靜默在同一 session 內評定
- WHEN 機械維度有 FAIL，THEN 無論判斷維度多好，grade 都不得達 S/A（`verified` 不成立）
- WHEN 閱讀 review 與 verify 的 skill 文件，THEN review（開放式找缺陷）與 verify（封閉式核對合約）的職責各有單一敘述且無重疊

**Independent Test:**
以 harness 支援與不支援 subagent 兩種情境各跑一次 verify，比對報告：前者標示 fresh-context 已達成，後者含降級 WARN；兩者都能指出每個維度的裁決者身分。

### US-4: Constitution 規則清冊與嚴重度機械化 [P2]

作為 **維護 prospec 的開發者**，
我想要 **check 產出 Constitution 每條 principle 的名稱與 RFC-2119 嚴重度清冊**，
以便 **V3 不可能漏掉規則、也不可能自行改判嚴重度**。

**Acceptance Scenarios:**

- WHEN 執行 check，THEN 報告列出 Constitution 每條 principle 的名稱、RFC-2119 嚴重度與有無 Verify hint
- WHEN 某條 principle 未標 RFC-2119 嚴重度，THEN check 產出 finding 指出它無法按權重評級
- WHEN V3 執行，THEN 逐條對清冊表態，表態數量不得少於清冊條目數
- WHEN Constitution 為自由散文（完全無標籤），THEN 清冊仍列出條目、嚴重度標為未標記，不得偽造成 MUST

**Independent Test:**
在本專案 Constitution 上跑 check，清冊條目數等於檔案內 principle 標題數；手動移除任一標籤後重跑，出現對應 finding。

### US-5: escaped-defect 漏失率可回溯產出 [P2]

作為 **維護 prospec 的開發者**，
我想要 **依 `introduced_by` 反查各 gate 的 escaped-defect 率**，
以便 **拿到目前唯一的 gate 準確度 ground-truth 訊號**。

**Acceptance Scenarios:**

- WHEN 對既有 archived change 產生 escaped-defect 報表，THEN 不需補任何資料即可產出
- WHEN 沒有任何 change 登記 `introduced_by`，THEN 報表誠實輸出「無登記樣本」，不得輸出 0% 漏失率
- WHEN `introduced_by` 指向不存在的 change，THEN 報表列為未解析參照，不靜默丟棄

**Independent Test:**
在現有 repo 上執行報表指令，輸出可對照 `.prospec/archive/` 的實際 change 清單逐筆驗證；把樣本清空後輸出「無登記樣本」而非零漏失。

## Edge Cases

- **多個 change 同時在途**：digest 是全樹的，編輯其一會讓其他 change 的測試紀錄轉 stale——沿用 `review-provenance` 既有的 fail-closed 語意（過度阻擋而非放行）
- **check engine 不可用**：機械維度不得回退成 agent 裁決；標為未裁決並要求先修工具鏈
- **`scale: quick`／`backfill`**：既有 `not-applicable` 契約優先於機械化——不適用的維度不得被新 check 判 fail
- **既有 archived change 回溯**：新增的機械事實欄位不得使既有 archived change 的 `metadata-completeness` 轉 fail
- **測試指令超時或掛住**：需有明確上限與失敗訊息，不得留下半寫入的紀錄

## Functional Requirements

- **FR-001**: V1／V4／V5 的裁決來源是 `prospec check` 報告，verify 只轉述不改判
- **FR-002**: 新增測試結果的機械記錄（指令、退出碼、程式碼 digest、日期）與其新鮮度判定
- **FR-003**: 機械維度不可用時標為未裁決，並在報告中明示，永不靜默降級
- **FR-004**: V2／V6 由 fresh context 審查者評定；harness 不支援時記 WARN 揭露降級
- **FR-005**: grade 分帳——機械維度 FAIL 一律封頂在無法 `verified`，判斷維度不得靠機械 PASS 洗白
- **FR-006**: check 產出 Constitution 規則清冊（名稱／嚴重度／Verify hint 有無），未標嚴重度者產 finding
- **FR-007**: V3 必須對清冊逐條表態，表態數 ≥ 清冊條目數
- **FR-008**: 依 `introduced_by` 產出各 gate escaped-defect 報表，樣本不足時誠實揭露
- **FR-009**: review（開放式找缺陷）與 verify（封閉式核對合約）的職責邊界在 skill 文件中各有單一敘述、無重疊
- **FR-010**: 每個維度在報告與 `quality_log` 中都標明裁決者身分（機械／判斷）

## Success Criteria

- **SC-001**: 同一 change 連續兩次 verify，機械維度的檢查狀態逐字相同（無 LLM 參與亦可重現）
- **SC-002**: V1／V4／V5 各有對應的 check id，且在報告 `structural.checks[]` 中可查
- **SC-003**: escaped-defect 報表可對既有 archived change 回溯產出，且不需補資料
- **SC-004**: Constitution 清冊條目數等於 CONSTITUTION.md 內 principle 標題數
- **SC-005**: grep review／verify 兩份 skill 文件，職責敘述無重疊（同一句話不出現兩處）
- **SC-006**: 既有 archived change 全數通過 `prospec check`（新增欄位不造成回溯 fail）
- **SC-007**: 新增／修改的公開函式皆有測試，`pnpm test` 全綠、coverage ≥ 80%

## Related Modules

- **types**: 新增 check id、報告區段與 metadata 欄位的 Zod 契約
- **lib**: drift 收集器與純 evaluator、Constitution 解析、digest 重用
- **services**: `check` service 的模式擴充（記錄測試、escaped-defect 聚合）
- **cli**: `check` 命令新旗標與輸出格式
- **templates**: `prospec-verify` / `prospec-review` skill 模板與相關 reference 的職責重寫
- **tests**: 四層測試——evaluator 單元、報告格式契約、CLI 整合、回溯既有 archive

## Open Questions

- [ ] **NEEDS CLARIFICATION**: 機械維度 FAIL 的 grade 封頂具體落在哪一級（C 或直接不評級）——plan 階段定案
- [ ] **NEEDS CLARIFICATION**: 測試紀錄是否納入 `metadata-completeness` 必填 floor（預設不納入，避免既有 archived change 回溯 fail）——plan 階段定案

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified：五則 Story 皆為 INVEST（各自可獨立出貨、有可測 AC）；語言政策遵循（change artifact 繁中、程式碼與 trust zone 英文）；TDD 與測試覆蓋列入 SC-007；本案改動 CLI 旗標與 skill 行為，屬 user-facing surface，README 需在實作階段同步（[SHOULD] 規則）

## UI Scope

**Scope:** none
