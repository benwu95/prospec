# name-change-history-rows

## Background

`archive.service` 的 `appendToChangeHistory` 把 Change History 的 Change 欄寫死成字串 `archive-sync`
（`src/services/archive.service.ts:1206`——該函式的簽章根本沒帶變更名，而唯一的呼叫端 `:398` 手上就有）。
歷史上每一列都是真實變更名，那是 graduation 時人工收斂的結果；自動化接手後這一欄退化成一串相同的
`archive-sync`，追溯價值歸零。目前 7 份 feature spec 共 15 列受影響。`sdd-workflow.md` 的 SC-002 明說
「Change History accumulates an audit trail」——一個無法指認變更的 audit trail 不成立。

## User Stories

### US-1: Change History 記下真實變更名 [P1]

As a 讀 feature spec 想知道某條 REQ 何時、由哪個變更改動的人，
I want Change History 的 Change 欄記下該次 archive 的變更名，
So that 那一欄真的能追溯，而不是十五列一模一樣的 `archive-sync`。

**Acceptance Scenarios:**

- WHEN `prospec archive <name>` 執行 spec sync，THEN 新增的 Change History 列的 Change 欄為該變更名
- WHEN 同一天有多個變更 archive，THEN 各列以自己的變更名區分（日期不再是唯一線索）
- WHEN 檢視整個 repo，THEN 不存在任何以 `archive-sync` 為 Change 欄的列
- WHEN `--dry-run`，THEN 不寫入任何檔案（既有行為不變）

**Independent Test:**
以暫存 fixture 跑 `syncToFeatureSpecs`，斷言產生的列含變更名、且不含 `archive-sync`。

### US-2: 回填 15 列既有的 archive-sync [P2]

As a 想追溯 2026-06 至 2026-07 之間規格變動的人，
I want 那 15 列既有的 `archive-sync` 被回填為真實變更名，
So that 追溯價值不是只從今天之後才開始。

**Acceptance Scenarios:**

- WHEN 回填任一列，THEN 其變更名來自「該列日期 ＋ 該列每個 REQ 都出現在該 archive 摘要的 Requirements 表」這條唯一解（15/15 零歧義，已實測）
- WHEN 回填完成，THEN `prospec/specs/features/` 內 `| archive-sync |` 出現次數為 0
- WHEN 回填完成，THEN 每列的變更名都存在對應的 `prospec/specs/_archived-history/{該列日期}-{名稱}.md`

**Independent Test:**
腳本對每列重新推導一次歸屬並與檔案內容比對，斷言 15/15 相符且 `archive-sync` 零命中。

## Edge Cases

- 同日多變更：日期不足以判別，必須以 REQ 集合收斂（2026-07-30 有 6 個 archive，正是這個情況）
- 某 REQ 被多個變更先後改動：僅「日期相符且該摘要涵蓋該列全部 REQ」者為解——`project-setup.md:664` 起初誤配到 2026-07-25 的變更，即因只按重疊數排序
- 無法唯一歸屬的列：保留 `archive-sync` 並在變更工件說明理由，絕不猜（本輪無此情況）
- 既有列的其他欄位（日期、Impact、REQ Refs）與列序逐位元不動

## Functional Requirements

- **FR-001**: `appendToChangeHistory` 收變更名並寫入 Change 欄；呼叫端傳入既有的變更名，不新增資料來源
- **FR-002**: 契約測試釘住列含變更名，並以負向斷言擋住 `archive-sync` 回歸
- **FR-003**: 回填 15 列，歸屬依「日期 ＋ REQ 集合涵蓋」唯一解，並保留可重跑的驗證方式
- **FR-004**: 不改動 Change History 以外的任何欄位或列序

## Success Criteria

- **SC-001**: `grep -c "| archive-sync |" prospec/specs/features/*.md` 全為 0
- **SC-002**: 新增測試在移除變更名傳遞後轉紅（mutation-verified）
- **SC-003**: `pnpm test` / `typecheck` / `lint` 全綠；`prospec check` 14/14 0 warn
- **SC-004**: 每列回填後的名稱皆對應存在的 `_archived-history` 檔案（腳本重驗 15/15）

## Related Modules

- **services**: `archive.service.ts` 的 `appendToChangeHistory` 與其呼叫端
- **tests**: archive.service 契約測試（正向 ＋ 負向）
- **docs（信任區，非模組）**: 7 份 feature spec 的 15 列回填

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — 變更工件繁中、信任區與 commit message 英文；測試先行；services 不下引；root README 未記載此列格式，README-current 不觸發

## UI Scope

**Scope:** none
