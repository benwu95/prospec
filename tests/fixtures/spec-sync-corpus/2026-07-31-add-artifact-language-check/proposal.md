# add-artifact-language-check

## Background

Constitution 的 Language Policy 是 `[MUST]`，但它的執行完全靠人：`prospec check` 的 13 個 drift check 沒有一個看語言。實際後果是 ledger 的 `docs/cli-generated-artifact-skips-language-policy` 已累積 freq=3——最近一次（`add-harness-capability-flags`）我把 `review.md` 的 12 列 Summary 與整份 `delta-spec.md` 的敘述欄位都寫成英文，兩者都到 verify 的 3/5 人工稽核才被抓到，那是流程的最後一道關。

`prospec review merge` 這類 CLI 產出更放大問題：findings JSON 帶什麼語言就落什麼語言，寫入當下沒有任何訊號。

## User Stories

### US-1: 變更工件的語言由機器檢查 [P1]

As a 在非英文 artifact_language 專案中工作的開發者,
I want `prospec check` 在變更工件缺少該語言字跡時提出訊號,
So that 語言違反在每次 check 就浮現，而不是等到 verify 的人工稽核——甚至畢業後才發現。

**Acceptance Scenarios:**

- WHEN `artifact_language` 為繁體中文且掃描範圍內某 `.md` 通篇無中文字跡，THEN `artifact-language` check 產生 **warn**，指出該檔
- WHEN 該檔位於 `{base}/specs/_archived-history/**`，THEN 同樣是 **warn**（本版一律 warn，見下方「嚴重度分層的取消」）
- WHEN 檔案帶有該語言字跡，THEN 不產生任何 finding
- WHEN `artifact_language` 是英文，或其書寫系統無法以字元判定（如西班牙文），THEN 該 check 回報 `skipped` 並說明原因，絕不空過

**Independent Test:**
以繁中專案建構三個 fixture（純英文的 changes 檔、純英文的 _archived-history 檔、含中文的 changes 檔），斷言前兩者皆為 warn、第三者無 finding；再以 `artifact_language: Spanish` 斷言 `skipped`。

### US-2: 誤報不得侵蝕清單可信度 [P1]

As a 每天看 `prospec check` 輸出的開發者,
I want 這個 check 對「還沒寫內容」與「不該檢查」的檔案保持沉默,
So that 它不會變成又一個被習慣性忽略的紅字。

**Acceptance Scenarios:**

- WHEN `.prospec/archive/**`（gitignored 的副本）存在純英文檔案，THEN 不產生任何 finding——該區完全不在掃描範圍
- WHEN 檔案不是 `.md`（如 CLI 序列化的 `metadata.yaml`），THEN 不檢查
- WHEN 專案沒有任何變更工件，THEN check PASS 而非 skipped（掃描有跑、只是沒有對象）

**Independent Test:**
在 fixture 中放置 `.prospec/archive/` 英文檔與 `metadata.yaml`，斷言 findings 為空。

## Edge Cases

- **剛 scaffold 的 `proposal.md`**：CLI 樣板是英文佔位符，AI 尚未填寫 → 記 warn 而非 fail，刻意容忍 work-in-flight
- **`**Spec:**` 區塊刻意為英文**：檔案層級的「是否含該語言字跡」不受影響（delta-spec 的其餘敘述欄位帶中文），故不誤報
- **英文散文中引用一段該語言字串於 code fence**：判定前先剝除 fenced block，故不會被誤判為合規
- **書寫系統雙軌的語言（如塞爾維亞文）**：語言名無法決定書寫系統 → 不猜測，回報 `skipped`
- **混合語言檔案**：只要求「存在字跡」，不要求比例——比例門檻會對技術術語密集的檔案誤報
- **非 git 專案／路徑不存在**：來源不可得 → `skipped` 並說明
- **英文 artifact_language**：無事可查 → `skipped`（而非 PASS，因為沒有實際比對發生）

## Functional Requirements

- **FR-001**: `DRIFT_CHECK_IDS` 新增 `artifact-language`（第 14 個，附加式不重排）
- **FR-002**: collector 依 `lib/language-policy` 已解析的 `nativePaths` 取得掃描範圍，不自行重寫路徑集合
- **FR-003**: 腳本偵測以 Unicode 範圍表判定；表中沒有的語言回報 `skipped` 並說明
- **FR-004**: 一律 WARN-class；`.prospec/archive/**` 完全不掃（以 `ARCHIVE_NATIVE_GLOB` 常數扣除，非手抄字面值）
- **FR-005**: 只檢查 `.md`
- **FR-006**: root README 的 check 列舉同步（PB-009）

## Success Criteria

- **SC-001**: 以 `add-harness-capability-flags` 當時的英文 `review.md` 為 fixture，check 產生 warn
- **SC-002**: 拉丁語系 `artifact_language` 產生 `skipped` 而非誤判 PASS 或 FAIL
- **SC-003**: `.prospec/archive/**` 與非 `.md` 檔零 finding
- **SC-004**: `pnpm test` 全綠；新斷言逐類 mutation 驗證

## Related Modules

- **types**: `DRIFT_CHECK_IDS` 新增 id
- **lib**: `drift-sources` collector ＋ `drift-checker` evaluator ＋ 腳本偵測表
- **services**: `check.service` 串接新 collector
- **templates**: 無（drift-report-format reference 需補該 id 說明）
- **tests**: evaluator 單元測試 ＋ collector 測試 ＋ drift-report 契約

## Open Questions

- [ ] 腳本表目前涵蓋 7 種書寫系統；未涵蓋的語言一律 skip。若日後有拉丁語系專案需要，需另尋語言偵測方案（超出本變更範圍，已明示排除）

## 嚴重度分層的取消（實作後的範圍變更）

原設計為分層：`.prospec/changes/**` warn、`_archived-history/**` fail。實作完成後首次實跑，新 check 在本專案回報 **9 個 fail**——92 份封存摘要中 9 份通篇英文，是真違反而非誤判（其餘 83 份合規）。

**改為一律 warn**。一個在自己的 repo 上第一天就全紅的 check 會被關掉而不是被修；而且這不只是本專案的問題，任何中途導入 prospec 的專案都帶著遺留工件。warn 已達成核心價值：兩次實際失守都會在每次 `prospec check` 浮現，而非等到 verify 3/5 的人工稽核。

被否決的替代方案：翻譯那 9 份摘要（改寫歷史記錄，且對其他專案無助）；加 `.prospec.yaml` 豁免清單（正確方向、是本 repo `LEGACY_BODYLESS` 的既有模式，但範圍約為本變更兩倍，且沒有豁免機制就先出 fail 是本末倒置）；保留 tier 但兩層都填 warn（留下生產環境走不到的死碼分支）。

**後續**：加 shrink-only 的 legacy 豁免後，再把 `_archived-history/**` 升為 fail。已於 delta-spec 以 deliberate-exclusion 措辭明示。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — 變更工件繁中、trust zone 英文；TDD 先寫測試；依賴方向 `services → lib → types` 不變；README check 列舉同步（PB-009）

## UI Scope

**Scope:** none
