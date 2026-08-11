# Proposal: configurable-generated-artifacts

## Background

`GENERATED_SOURCE_ARTIFACTS` 是 prospec 自己的建置常數（`src/lib/generated-artifacts.ts`），寫死了 `src/lib/bundled-templates.ts` 這條路徑。這條路徑被排除在模組 staleness 的 `last_src_commit` git pathspec 之外（issue #121、REQ-LIB-039），用意正確：生成檔重生不該逼出一次沒有誠實內容可寫的知識更新。

問題是它是**寫死的字面路徑**，而 `prospec check` 跑在任何安裝了 prospec 的專案上。這是 prospec 的自身建置知識洩漏進通用引擎，與 PR #75 follow-up 學到的規則同型：prospec 是給下游安裝的工具，任何 emit 到消費者專案、或對消費者專案生效的東西，都不得引用 prospec 的內部視角。

同一個發布窗口需一併修正 issue #132：`hasVerifyGrade` 以 `.some()` 掃全部 `quality_log`，問的是「有沒有拿過 S/A」而非「最新一次是不是 S/A」——時間軸判準錯誤。兩者都是 `prospec check` 的契約面改變，屬 minor bump 該一次做完的事。

## User Stories

### US-1: 生成物排除由專案設定宣告 [P1]

As a 下游專案開發者,
I want 生成物的 staleness 豁免路徑由我自己在 `.prospec.yaml` 宣告，而非被 prospec 的內建常數靜默套用,
So that 只有我知道的生成檔才被排除，人寫的同名檔案不會被意外豁免。

**Acceptance Scenarios:**

- WHEN `.prospec.yaml` 未宣告任何 `knowledge.generated_artifacts`，THEN 沒有路徑被豁免——`src/lib/bundled-templates.ts` 不再被排除
- WHEN `.prospec.yaml` 宣告了一條路徑（如 `src/lib/bundled-templates.ts`），THEN 該路徑被排除在 `last_src_commit` 之外，模組 staleness 行為與目前一致
- WHEN 設定宣告了 glob（如 `src/generated/**`），THEN 符合的檔案全部被排除
- WHEN `computeChangeDigest` 計算該檔的 digest，THEN 該檔仍被涵蓋——排除只作用於 staleness，不影響 provenance（REQ-LIB-024 不變）

**Independent Test:**
在空設定的 temp-git fixture 中提交 `src/lib/bundled-templates.ts` 到 lib 模組路徑下，驗證 `last_src_commit` 包含該提交（不再被豁免）。再加入設定、重新計算，驗證排除生效。

### US-2: hasVerifyGrade 只看最新一筆 [P1]

As a 專案維護者,
I want `hasVerifyGrade` 判斷的是最新一次 verify 是否為 S/A，而非歷史上是否曾經拿過 S/A,
So that re-verify 後得到 B/C/D 的變更不會因為歷史紀錄而假陽性通過 metadata-completeness。

**Acceptance Scenarios:**

- WHEN `quality_log` 的最新 `prospec-verify` 條目 grade 為 S/A，THEN `hasVerifyGrade` 回傳 true
- WHEN 最新條目 grade 為 B/C/D 但歷史有 S/A，THEN `hasVerifyGrade` 回傳 false
- WHEN 變更 status 非 `verified`/`archived`（即非 `GRADED_STATUSES`），THEN 不套用此規則（行為不變）
- WHEN `quality_log` 為空或無 `prospec-verify` 條目，THEN `hasVerifyGrade` 回傳 false（行為不變）

**Independent Test:**
建構含有多筆 `quality_log` 條目的 metadata（最新為 B、歷史有 S），驗證 `hasVerifyGrade` 回傳 false。

### US-3: 新規則的作用域限制 [P2]

As a 擁有 archived 變更的專案維護者,
I want `hasVerifyGrade` 的新規則只對非 `archived` 的變更套用,
So that 已封存的歷史變更不會因為新規則而翻紅。

**Acceptance Scenarios:**

- WHEN 變更 status 為 `archived` 且歷史 `quality_log` 含 S/A 條目，THEN `hasVerifyGrade` 回傳 true（相容舊行為）
- WHEN 變更 status 為 `verified` 且最新條目為 B/C/D，THEN `hasVerifyGrade` 回傳 false（新規則生效）

**Independent Test:**
同一份 `quality_log`（最新 B、歷史 S），分別以 `archived` 和 `verified` status 測試，驗證行為分流。

### US-4: 封存插入點不得剖開既有需求 [P1]

As a 專案維護者,
I want ADDED REQ 的封存插入點錨定在真正的 `## Edge Cases` 標題（行首），而非該字串的第一次出現,
So that 在標題之前就引用過這串文字的既有 REQ 內文不會被從中剖開。

**Acceptance Scenarios:**

- WHEN feature spec 在真正的標題之前，於散文或行內程式碼中出現 `## Edge Cases` 字樣，THEN 新 REQ 仍插在真正的標題之前，該引用段落保持完整
- WHEN feature spec 沒有 Edge Cases 標題，THEN 新 REQ 附加在檔尾（行為不變）
- WHEN 插入點退回子字串比對，THEN mutation 驗證使對應測試轉紅

**Independent Test:**
建構一份 feature spec，讓 `## Edge Cases` 先出現在某條 REQ 的 bullet 行內程式碼中、真正的標題在其後，執行 `syncToFeatureSpecs` 後驗證該 bullet 未被剖開，且新 REQ 落在引用處之後、標題之前。

## Edge Cases

- **下游專案有同名人寫檔案**：空設定下不再被豁免（正確行為——修正 fail-open）
- **prospec 自己的 `.prospec.yaml`**：需自行宣告 `src/lib/bundled-templates.ts`——這同時是 dogfood 證據
- **設定值為 glob 但 git pathspec 不支援**：降級為無排除的查詢（較吵但真實），不靜默跳過
- **`scripts/bundle-templates.ts` 的輸出解析**：仍從 `BUNDLED_TEMPLATES_SOURCE` 常數讀取，不受設定驅動影響——「建置常數」與「check 設定」是兩件事
- **混合新舊 metadata 的倉庫**：archived 變更保持舊行為，verified 變更用新規則，不觸發連鎖 re-verify

## Functional Requirements

- **FR-001**: `.prospec.yaml` 新增 `knowledge.generated_artifacts` 設定鍵（glob 陣列，預設空）
- **FR-002**: 模組 staleness 的 `last_src_commit` 查詢從設定讀取排除路徑，取代寫死常數
- **FR-003**: `computeChangeDigest` 不受生成物排除影響（REQ-LIB-024 不變）
- **FR-004**: `scripts/bundle-templates.ts` 繼續從 `BUNDLED_TEMPLATES_SOURCE` 解析輸出位置
- **FR-005**: `hasVerifyGrade` 改為只看最新一筆 `prospec-verify` 條目
- **FR-006**: `hasVerifyGrade` 的新規則只對非 `archived` 的 `GRADED_STATUSES` 生效
- **FR-007**: REQ-LIB-039 改寫：從「寫死一條路徑」改為「由專案設定宣告」，移除限制免責句
- **FR-008**: prospec 自身 `.prospec.yaml` 宣告 `knowledge.generated_artifacts: ['src/lib/bundled-templates.ts']`
- **FR-009**: ADDED REQ 的封存插入點錨定在行首的 `## Edge Cases` 標題，而非該字串的第一次出現

## Success Criteria

- **SC-001**: 預設無任何路徑被豁免（負向斷言：空設定下 `src/lib/bundled-templates.ts` 不再被排除）
- **SC-002**: prospec 自身 `.prospec.yaml` 宣告後，lib 模組 staleness 行為與現況一致（回歸測試）
- **SC-003**: 排除只作用於 `last_src_commit`；`computeChangeDigest` 仍涵蓋該檔（並排測試，比照 #121）
- **SC-004**: `scripts/bundle-templates.ts` 的輸出解析不受影響
- **SC-005**: `hasVerifyGrade` 的最新條目判斷通過單元測試（最新 B + 歷史 S → false）
- **SC-006**: archived 變更的 `hasVerifyGrade` 行為不變（相容測試）
- **SC-007**: REQ-LIB-039 改寫完成且無限制免責句
- **SC-008**: 在標題前先引用 `## Edge Cases` 的 feature spec 上執行封存，既有 bullet 不被剖開（迴歸測試，且退回子字串比對時轉紅）

## Related Modules

- **lib**: 核心影響模組——`generated-artifacts.ts`（registry 來源）、staleness collector（`last_src_commit` 查詢）、`computeChangeDigest`（digest 邊界）、`hasVerifyGrade`（metadata-completeness 判斷）
- **types**: config schema 需擴充 `knowledge.generated_artifacts` 欄位的 Zod 定義
- **services**: drift-check service 需傳遞設定值給 collector
- **tests**: 需要新增/修改 staleness exclusion 測試和 `hasVerifyGrade` 測試
- **templates**: 可能需更新涉及 `generated-artifacts` 說明的 skill 模板

## Open Questions

- [ ] **NEEDS CLARIFICATION**: `hasVerifyGrade` 在 `archived` 變更上保持 `.some()` 行為（方案 a）的邊界——若未來有 re-archive 場景，是否需要重新審視？暫以方案 (a) 落地，plan 階段拍板。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] INVEST 自檢：
  - Independent: 兩個 US 可獨立交付（生成物設定化 / hasVerifyGrade 修正），但選擇同一變更出貨以減少下游連續契約變動
  - Negotiable: 設定格式（glob 陣列）和作用域（archived 豁免）仍可討論
  - Valuable: 修正兩個 prospec check 的判準錯誤
  - Estimable: 影響範圍明確，issue 已給出方案
  - Small: 兩個 US 各自範圍有限
  - Testable: 每個 US 都有明確的 WHEN/THEN 和獨立測試方案

## UI Scope

**Scope:** none
