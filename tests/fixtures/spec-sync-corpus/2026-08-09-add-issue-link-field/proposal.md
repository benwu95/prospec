# add-issue-link-field

## Background

「一個 issue 對應一個變更、一個 PR，PR body 結尾 `Closes #NN`」是本專案近二十個變更實際在跑的慣例，但它沒有任何工件承載：`ChangeMetadataSchema` 沒有 issue 欄位，`prospec change story` 沒有對應旗標。慣例只存在於人與 agent 的記憶裡——Claude Code 會問「這個變更對應哪個 issue」是因為它的 session memory 記了這條 house convention，換 harness（Antigravity）就不會問，換 session 也可能消失。

後果是 `prospec status`、archive summary、`prospec/specs/_archived-history/{date}-{name}.md` 都無法回答「這個變更在關哪個 issue」，只能靠 commit／PR 文字反推；反向查詢（拿 issue 編號找變更）更是沒有入口。形態上最接近的 `introduced_by` 語意不同——它記的是「這個缺陷由哪個**變更**造成」，不是「這個變更對應哪個**外部追蹤項**」。

## User Stories

### US-1: 變更 metadata 有 issue 登記欄位 [P1]

As a 專案維護者，
I want 在建立變更時把它對應的 issue 參照寫進 `metadata.yaml`，
So that 慣例有機械載體，不再依賴特定 harness 的記憶。

**Acceptance Scenarios:**

- WHEN 執行 `prospec change story <name> --issue "#131"`，THEN `metadata.yaml` 出現 `issue: "#131"`（YAML 自動加引號，因為 `#` 會被讀成註解）
- WHEN 執行 `prospec change story <name>` 不給 `--issue`，THEN `metadata.yaml` **完全沒有** `issue` 鍵（不是空字串、不是 `null`）
- WHEN `--issue` 給的是完整 URL 或其他追蹤系統的 id（`ABC-123`），THEN 原樣寫入——不校驗格式、不呼叫任何 forge API
- WHEN 讀取一份不含 `issue` 的既有 `metadata.yaml`，THEN schema 通過、`metadata-completeness` 檢查結果不變（欄位不進 `REQUIRED_METADATA_FIELDS`）

**Independent Test:**
`ChangeMetadataSchema` 的 optional 單元測試 + `change story --issue` 的 service／E2E 測試（給／不給兩條路徑各驗一次）。

### US-2: 顯示面帶出 issue 連結 [P1]

As a 接手變更的人（或另一個 agent），
I want `prospec status` 與 archive summary 直接顯示該變更對應的 issue，
So that 不必去翻 commit／PR 文字反推。

**Acceptance Scenarios:**

- WHEN `metadata.yaml` 有 `issue` 且 `prospec status` 列出該變更，THEN 輸出含一行 `issue:` 帶出該參照
- WHEN 該變更沒有 `issue`，THEN `prospec status` **不印**該行（不印空值、不印 `—`）
- WHEN `prospec archive <name>` 生成 summary.md 且變更有 `issue`，THEN Change Overview 區塊含 `- **Issue**: <ref>` 一列，並隨 summary 一起複製進 `_archived-history/`
- WHEN 變更沒有 `issue`，THEN summary.md 的 Change Overview 不含該列

**Independent Test:**
status formatter 與 `generateSummary` 的單元測試，各以「有欄位／無欄位」兩組 fixture 斷言。

### US-3: 慣例本身有文件載體 [P1]

As a 第一次送 PR 的貢獻者（人或 agent），
I want 從 `CONTRIBUTING.md` 與一個可直接叫用的 skill 得知本專案的 PR 慣例，
So that 慣例不靠記憶傳遞，且與機械欄位互相指向。

**Acceptance Scenarios:**

- WHEN 閱讀 `CONTRIBUTING.md` 的 Submit a Pull Request 段落，THEN 它完整記載：每 issue 一變更一 PR、PR body 繁體中文、結尾 `Closes #NN`、不加 AI footer、兩 commit 模式，並指向 `metadata.yaml` 的 `issue` 欄位
- WHEN 閱讀 `metadata-format` reference 的 `issue` 條目，THEN 它把慣例的「為什麼」交還給專案自身的 contributor docs（generic 措辭、不點名檔案——出貨模板會逐字渲染進下游專案）——欄位負責機械登記，文件負責說明
- WHEN 叫用 `/submit-pr`，THEN 得到一份依現行格式開 PR 的步驟（比照 `release` skill，同時存在於 `.claude/skills/submit-pr/` 與 `.agents/skills/submit-pr/`，各有 `.gitignore` 的 `!` 例外）

**Independent Test:**
grep `CONTRIBUTING.md` 的關鍵句；確認兩份 `SKILL.md` 皆進版控（`git check-ignore` 對兩條路徑皆回報未被忽略）。

## Edge Cases

- `--issue ""`（空字串或純空白）：視同未給，不寫入該鍵——AC 明示欄位缺席而非空字串
- 以 `#` 開頭的值：`stringifyYaml` 必須引號化，否則回讀成註解而丟失整個值
- 既有／已封存的變更沒有這個欄位：屬正常狀態，任何檢查都不得因此轉紅
- 這個變更**自己**無法用它新增的旗標登記 issue #131：旗標在 `change story` 時尚不存在，而 `metadata.yaml` 是 CLI-written／skill-read，不得手改（本輪刻意不加 setter 指令——超出 issue 範圍）
- 不做的事：不從 issue 內容生成 proposal、不自動 close issue、不驗證 issue 存在

## Functional Requirements

- **FR-001**: `ChangeMetadata` 新增 optional `issue: string`，形態自由、不校驗；canonical key order 追加於 `introduced_by` 之後
- **FR-002**: `REQUIRED_METADATA_FIELDS` 與 `metadata-completeness` 行為不動
- **FR-003**: `prospec change story --issue <ref>` 寫入；未給或空白則該鍵不出現
- **FR-004**: `prospec status` 有值才印 issue 行
- **FR-005**: archive summary 的 Change Overview 有值才印 `- **Issue**:` 一列
- **FR-006**: `metadata-format` reference 記載序列化格式（含引號化）與「不校驗」立場，並把慣例交還給專案自身的 contributor docs（不點名檔案）
- **FR-007**: `archive-format` reference 的 Change Overview 格式同步
- **FR-008**: `CONTRIBUTING.md` 的 Submit a Pull Request 補完 house convention，並指向 `issue` 欄位
- **FR-009**: 新增 `submit-pr` maintainer skill，`.claude` 與 `.agents` 雙份 + `.gitignore` 例外

## Success Criteria

- **SC-001**: `pnpm test` 全綠，且新增測試覆蓋四條路徑：schema optional、旗標缺省不寫鍵、status 顯示、archive summary 顯示
- **SC-002**: `prospec check` 的 `metadata-completeness` 對所有既有變更判定與變更前一致
- **SC-003**: `pnpm typecheck`、`pnpm lint`、`pnpm counts:check` 全綠
- **SC-004**: `git check-ignore` 確認兩份 `submit-pr/SKILL.md` 皆已納入版控

## Related Modules

- **types**: `ChangeMetadataShape` 新增欄位；`ChangeRoute`／`ChangeRouteFacts` 帶出顯示值
- **lib**: `status-router` 的純函式把 `issue` 原樣傳遞
- **services**: `change-story.service` 寫入；`status.service` 蒐集；`archive.service` 的 `generateSummary` 輸出
- **cli**: `change story --issue` 旗標；`status-output` formatter 印出
- **templates**: `metadata-format.hbs`、`archive-format.hbs` 兩份 reference
- **tests**: 單元 + E2E 覆蓋上述路徑

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — TDD（測試先行）、Atomic Commits、Language Policy（本檔繁中／trust zone 英文）、dependency direction（`cli → services → lib → types` 單向）、Factual Count Integrity（新增測試後跑 `pnpm counts`）皆適用且已納入計畫

## UI Scope

**Scope:** none
