# Proposal: translate-feature-specs-to-english

## Background

`prospec/specs/features/` 下 10 份 feature spec 全部以繁體中文撰寫,牴觸 Constitution `[MUST] Language Policy` —— 該規則明定 AI Knowledge base(module READMEs、conventions、`index.md`、**specs**)一律英文,只有 `.prospec/changes/` 變更文件用繁中。這是系統性既存偏差(非單一變更引入),在 document-drift-report-contract 變更中被發現並記為附記。`product.md` 與 `feature-map.yaml` 已是英文,無需處理。

## User Stories

### US-1: 將 feature specs 翻為英文以符合 Language Policy [P1]

As a 引用 trust-zone Feature Spec 的開發者/reviewer(以及讀知識庫的 AI agent),
I want `prospec/specs/features/` 全部以英文撰寫、且需求內容一字不改,
So that 知識庫符合 Constitution 的英文規範、與 code/conventions/index 一致,可用英文引用審閱,不再有語言違規。

**Acceptance Scenarios:**

- WHEN 對 `prospec/specs/features/*.md` 執行 `grep -rP '[\x{4e00}-\x{9fff}]'`,THEN 零命中(全英文)。
- WHEN 比對翻譯前後每份 spec 的 REQ IDs 與 `**Feature**`/`**Story**` routing 欄位集合,THEN 完全相同(數量與編號不增不減);`prospec check` `req-references`/`feature-modules` 維持 PASS。
- WHEN 檢視各 spec frontmatter(`story_count`/`req_count`/`feature`/`status`),THEN 與翻譯前一致(僅新增一筆 Change History「translated to English」)。

**Independent Test:**
`grep -rPl '[\x{4e00}-\x{9fff}]' prospec/specs/features/` 空;對每檔 `grep -oE 'REQ-[A-Z-]+-[0-9]+'` 排序後 diff 翻譯前後為空;`prospec check` 全綠。

## Edge Cases

- **既有英文技術術語 / 程式識別碼 / 路徑 / REQ ID**:維持原樣,不「翻譯」。
- **Change History 表**:既有列的中文敘述一併翻英;新增一列記錄本次「translated to English」(日期 + 本變更名)。
- **`feedback-promotion.md`**:document-drift-report-contract(PR #89)剛修過其 `knowledge_health` 欄位 —— 實作分支須切自含 #89 的基底,避免翻自舊的 phantom-field 版本(見 Open Questions)。
- **語意保真**:若某段中文語意含糊,以「忠實直譯 + 不臆造」為準;不確定處標註而非猜測改寫。

## Related Modules

- 本變更觸及的是 **AI Knowledge trust zone**(`prospec/specs/features/`),非任一程式模組。與 knowledge/specs 相關的維運面(archive 的 Feature Spec Sync、drift `req-references`/`feature-modules`)由 **services / lib** 的既有檢查覆蓋,但本變更不改其程式碼 —— 純內容(語言)遷移。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] 本變更正是為**滿足** `[MUST] Language Policy`(消除知識庫繁中違規)。產物(feature specs)用英文;本變更的 `.prospec/changes/` 規劃文件仍用繁中。無其他原則牴觸。

## Open Questions

- [ ] **NEEDS SEQUENCING**:實作應接在 drift-report-contract PR #89 之後(或其 merge 後)—— 實作分支自含 #89 的基底切出,`feedback-promotion.md` 方翻自已修正版本。
- [ ] **NEEDS DECISION**:一次翻 10 檔於單一 change,或先試翻 1–2 檔對齊風格/術語再續?(quick scale 傾向一次完成,但 sdd-workflow.md 1035 行較重,可先立術語對照。)

## UI Scope

**Scope:** none
