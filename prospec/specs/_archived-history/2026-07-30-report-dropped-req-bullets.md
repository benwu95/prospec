# report-dropped-req-bullets — Archive Summary

- **Archived**: 2026-07-30
- **Original Created**: 2026-07-30
- **Quality Grade**: S

## User Story

作為執行 `/prospec-archive` 的開發者，
我要 spec-sync 在 `**Spec:**` 取代既有 body 時列出新 body 未重述的 `WHEN/THEN` bullet，
以便信任區的行為遺失在畢業當下就被看見，而不是靠人記得去 diff `git show HEAD:`。

第二個 Story：Phase 3.5 的 gate 逐條要求確認丟棄的刻意性——沒有 gate 的回報等於沒人讀。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | `DroppedBehavior` 型別、`whenThenBullets`／`normalizeBullet`／`droppedFor`、`mergeRequirementInPlace` 累積被取代的 body、`SpecSyncResult`／`ArchiveResult` 新欄位 |
| cli | Medium | `archive-output.ts` 於 `pendingConvergence` 之後輸出第二份 WARNING-class worklist，逐條列出 bullet |
| templates | Medium | `prospec-archive.hbs` Phase 3.5 step 0 改為兩份 worklist ＋ gate 項目；`delta-spec-format.hbs` 增「寫變更後的完整需求」與 ADDED 重複 id 的排除說明 |
| tests | Medium | 13 個 detection fixture（含真實 before/after 原文）、formatter 輸出與順序、`execute()` 層 dry-run parity、契約測試釘住 phase 正文與 gate |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-073 | ADDED | 集合差集偵測並以獨立欄位回報被丟棄的行為 |
| REQ-CLI-032 | ADDED | archive 輸出逐條列出丟棄清單，非折疊計數 |
| REQ-TEMPLATES-168 | ADDED | Phase 3.5 gate 逐條確認丟棄的刻意性 |
| REQ-TESTS-064 | ADDED | 以集合差集 fixture（含真實原文）釘住偵測 |
| REQ-TEMPLATES-166 | MODIFIED | reference 增「寫完整需求」指示；畢業階段認得兩份 worklist |
| REQ-SERVICES-072 | MODIFIED | 合併契約增補：取代路徑也產生訊號 |

## Completion

- **Tasks**: 14/14 code tasks（100%）；`[M]` 2、`[V]` 2 皆已完成
- **Acceptance Criteria**: US-1 4/4、US-2 2/2 場景皆有落地證據

## Review & Verify

- **Review**: 2 輪、12 筆 findings、0 未解。Round 1 為 1 critical（REQ-CLI-032 的 `**Spec:**` bullet 把主詞從資料換成 rendered text 後真值翻轉，且新測試正好釘住該分歧——經獨立 verifier 以房規既有寫法 REQ-CLI-024 對照確認）＋ 7 majors，全數修復而非提案。Round 2 揪出 **3 個修正自身引入的回歸**：續行吸收 fence／散文／表格列造成假回報（改為要求縮排）、正規化讓四處「verbatim」變成不實宣稱（改為比對用正規化、回報用原文）、dry-run 測試只斷言 header 動詞而跳過 bullet 迴圈仍全綠。
- **Verify**: Grade **S**。Machine ledger 1/5 PASS · 4/5 PASS · 5/5 PASS（`pnpm test` exit 0）。Judgment ledger 2/5 PASS（fresh context，經兩輪修正後 UNRESOLVED 歸零）· 3/5 PASS（6/6 條 Constitution 規則，coverage 94.31%）· 維度 6 not-applicable。2/5 首輪 WARN 的六項全修，其中三項會永久烙進信任區：REQ-TEMPLATES-166 未列 MODIFIED、REQ-TESTS-064 宣稱 fixture 為真實原文但實為簡寫、`verbatim` 對 `sanitizeTerminal` 過度宣稱。
- **Quality Log**: review PASS（1 critical/11 majors 全解）、verify grade S 無 WARN。

## Knowledge Update

已同步：`prospec/ai-knowledge/modules/{services,cli,templates}/README.md`。`lib` 的 `knowledge-health` stale 為生成檔（`bundled-templates.ts`）造成的時間戳假象，未造假內容搬動時間。

## Notes

- **自我 dogfood**：本變更的兩個 MODIFIED REQ 都把 `**Spec:**` 寫成既有 body 的嚴格超集（166 四條 bullet 全留、072 七條全留），archive 執行時新機制回報的 dropped-behavior 清單因此為空——機制對它自己保持沉默，正是預期行為。
- 偵測刻意排除段落層級散文（只認 `- WHEN` bullet），以及 ADDED 重複 REQ id 的情況（append 而非取代，兩份清單皆不回報）。後者已補測試釘住，避免這條會畢業的程式行為宣稱日後腐爛。
- 知識預算於本分支放寬（`l1_per_file` 2500／`l2_per_module` 1800，出貨預設未動），依 REQ-TYPES-069 申報於獨立 commit `b4ba77b`；為遷就舊上限而壓縮的 13 處措辭同時還原。
