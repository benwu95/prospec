# unify-req-heading-matcher

## Background

「feature spec 裡什麼算一個 REQ heading」在 repo 裡有三份彼此獨立的定義：`ACTIVE_REQ_HEADING`（`src/lib/drift-sources.ts:687`，任何標題層級）、`collectReqDefinitions` 的區域 `headingReq`（`:286`，任何層級且容忍 `~~`），以及 archive 的 `/^####\s+REQ-/` 與 `content.includes('#### ' + reqId + ':')`（`src/services/archive.service.ts:1519`／`:1105`／`:395`，只認 h4 且探針要對冒號）。前兩者唯讀，第三者是唯一會寫檔的 —— 最窄的判準握著唯一的筆。

下游專案在 1.0.0 回報（issue #138）：一份 REQ 寫成 `### REQ-…{#anchor}` 的 feature spec，`finalize` 要把它的 `req_count` 從 10 改寫成 0。本地以 source 1.0.0 重演確認，`req_count → 0` 只是最無害的症狀：同一個 h4 假設讓 MODIFIED REQ 不被認出而**重複插入**，同 ID、兩份互相矛盾的行為規格同時活在信任區，而兩個回報通道（pending convergence／dropped behavior）都不提它。14 道 check 也沒有任何一道會事後抓到。

## User Stories

### US-1: 唯寫路徑不再比唯讀路徑窄 [P1]

As a prospec 使用者（其 feature spec 的 REQ heading 層級偏離 h4），
I want archive 的 spec sync 與 counter reconciliation 用與 drift 引擎相同的 REQ heading 判準，
So that 歸檔不會在我的信任區裡製造重複 REQ、錯誤計數與無聲的死規格文字。

**Acceptance Scenarios:**

- WHEN 一份 spec 的 REQ 寫成 `### REQ-X-001: … {#anchor}`，且 delta-spec 帶一條 MODIFIED 的同 ID REQ，THEN 該 REQ 被就地取代（保留原檔的標題層級），檔案裡不出現第二段同 ID REQ
- WHEN 對同一份 spec 跑 counter reconciliation，THEN `req_count` 等於 body 裡 Deprecated 區段之外的 REQ heading 數，不再是 0
- WHEN 一條 REMOVED REQ 被移進 Deprecated 而其 active 區段（h3）仍留在檔案裡，THEN 回報 stale-deprecated 的 pending convergence
- WHEN 共用 matcher 被改回只認 `^####`（mutation），THEN 上述測試至少一條轉紅

**Independent Test:**
以一份 h3 REQ 的 fixture spec ＋ 一份帶 MODIFIED／REMOVED 的 delta-spec 跑 `syncToFeatureSpecs` 與 `recountFeatureSpecCounters`，斷言 heading 集合、計數與回報陣列。

### US-2: 計數器歸零不再靜默落地 [P1]

As a 專案維護者，
I want counter reconciliation 在算出「body 有 0 條 REQ 但 frontmatter 宣稱有 N 條」時拒絕寫入並回報，
So that 任何未來的解析盲點都以訊號現身，而不是把一個錯誤數字寫進信任區。

**Acceptance Scenarios:**

- WHEN body 數出 0 條 REQ 而 frontmatter 的 `req_count` 大於 0，THEN 該檔案不被改寫，且該情形出現在 finalize 的回報中（dry-run 與實跑一致）
- WHEN body 確實沒有 REQ 且 frontmatter 也是 0（或缺欄位），THEN 視為正常，不回報異常
- WHEN body 數出的值與 frontmatter 不同但非上述歸零情形，THEN 照常修正（既有行為不變）

**Independent Test:**
兩份 fixture（歸零可疑 vs 正常校正）跑 `executeFinalize` 的 dry-run，斷言 `planned` 與回報欄位。

### US-3: frontmatter counter 有機器對帳 [P2]

As a 專案維護者，
I want 一道 WARN 級 check 比對每份 active feature spec 的 `story_count`／`req_count` 與其 body，
So that 錯誤的計數值不能無聲留在信任區 —— 這是 Constitution「Factual Count Integrity」第三層第一次有機器守門。

**Acceptance Scenarios:**

- WHEN 一份 spec 的 frontmatter counter 與 body 不符，THEN `prospec check` 回報 WARN 並指名檔案、欄位、宣稱值與實際值
- WHEN 全部 spec 相符，THEN 該 check PASS（本 repo 現況 10/10 相符，天生綠燈）
- WHEN `specs/features/` 不存在或其中沒有 spec，THEN 該 check skip 並說明來源不可用（不製造假紅）
- WHEN 讀 `DRIFT_CHECK_IDS`，THEN 新 id 附加在最後、既有 14 個順序不變

**Independent Test:**
對相符／不符／缺目錄三組 fixture 跑 check，斷言 outcome 與 findings 內容。

## Edge Cases

- 一份 spec 混用 h3 與 h4 REQ heading：兩者都計入；ADDED 的新 REQ 仍以格式規範的 h4 插入，混層由寬容的 matcher 正確計數
- Deprecated 區段內的 REQ heading：不計入 `req_count`（既有語意不變 —— Deprecated 感知留在 recount，不進 matcher）
- `~~REQ-X-001~~` 刪除線 heading：收斂時不得讓它變成 active 計數項
- 既有已重複的同 ID REQ（下游現況）：本變更不做資料修復，只保證不再新增重複；重複本身由對帳 check 的計數落差浮現
- `story_count`／`req_count` 欄位缺失：維持既有的補寫行為
- REQ heading 用 h1/h2：matcher 收得到，但這不是本變更要背書的格式；對帳 check 讓它可見

## Functional Requirements

- **FR-001**: 抽出單一的 feature-spec REQ heading matcher，以 `ACTIVE_REQ_HEADING` 為單一來源（PB-006）
- **FR-002**: `recountFeatureSpecCounters` 的 REQ 判準改用共用 matcher，保留 Deprecated 區段感知
- **FR-003**: `mergeRequirementInPlace` 的「既有 REQ」判定與取代改用共用 matcher，取代時保留原檔的標題層級
- **FR-004**: REMOVED 的 stale-deprecated 探針改用共用 matcher
- **FR-005**: `recountFeatureSpecCounters` 新增歸零 refuse guard，並由 finalize 回報該情形
- **FR-006**: 新增 WARN 級 counter 對帳 check，`DRIFT_CHECK_IDS` 附加第 15 個 id
- **FR-007**: 手工維護計數（README 的 check 列舉、index／module README、測試數）於同一 feature commit 同步

## Success Criteria

- **SC-001**: `src/services/archive.service.ts` 內不再有作為 REQ 判準的硬編碼 h4 字串或 regex
- **SC-002**: issue #138 的三條重演各有一條迴歸測試且轉綠
- **SC-003**: mutation：把共用 matcher 改回 `^####` 使上述測試轉紅（且確認非假紅）
- **SC-004**: `prospec check` 的 check 總數為 15，新 id 為 WARN 級，本 repo 全綠
- **SC-005**: `pnpm typecheck && pnpm test && pnpm counts:check` 全綠，coverage ≥ 80%

## Related Modules

- **services**: `archive.service.ts` 是三個缺陷所在（spec sync、REMOVED 探針、counter reconciliation）—— 關鍵字 archive／spec-sync
- **lib**: 共用 matcher 的所在（`drift-sources.ts`）與新 check 的 collector／evaluator —— 關鍵字 drift-checker／drift-sources／knowledge-reader
- **types**: `DRIFT_CHECK_IDS` 與 drift-report 契約 —— 關鍵字 drift-report／schema
- **tests**: 三條迴歸測試、mutation 驗證、新 check 的 fixture —— 關鍵字 unit／contract／drift

## Open Questions

- [ ] 無 —— 名稱、scale（standard）與新 check 的嚴重度（WARN）已拍板

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified：TDD（三條迴歸測試先行）、Factual Count Integrity（第三層計數同 commit 同步，且本變更為它建立第一道機器守門）、One-way Dependency Direction（matcher 住 lib，services 單向引用）、Language Policy（工件繁中，信任區與 commit 英文）

## UI Scope

**Scope:** none
