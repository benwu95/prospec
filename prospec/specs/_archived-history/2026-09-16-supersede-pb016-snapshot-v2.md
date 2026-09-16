# supersede-pb016-snapshot-v2 — Archive Summary

- **Archived**: 2026-09-16
- **Original Created**: 2026-09-16
- **Quality Grade**: S
- **Issue**: #285

## User Story

As a 使用 prospec SDD 流程的開發者（含載入 playbook 的 AI agent），
I want PB-016、其 ledger 同源列與 drift-checker 註解都陳述現行的內容快照規則，並保留舊敘述的歷史註記，
So that 我在 verify 之後 commit 時不會被過時指令帶去多跑一輪 review／tests 重錄，且 playbook 的稽核脈絡（id、來源、批准、機械化出處）不因修正而斷裂。

## Affected Modules

`scale: quick`——模組由實際 diff 路徑經 `module-map.yaml` 對映得出（非 delta-spec）。

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Low | `src/lib/drift-checker.ts` `evaluateReviewProvenance` JSDoc 改為 snapshot-v2 語意（stale red＝record 後 input 變動）；零邏輯變動。`src/lib/bundled-templates.ts` 由 `pnpm bundle` 重生 |
| templates | Low | `src/templates/skills/references/implementation-guide.hbs` §5 順序改為 content finalized → record → commit → archive（review round 1 揪出的第四份副本；淨 −4 tokens） |
| tests | Low | `tests/fixtures/startup-loading-baseline.json` 兩列實測值下修（1079→1075、4502→4498），ceiling 不動 |
| （知識層） | Medium | `_playbook.md` PB-016 標題＋Guidance 改寫、新增 `Superseded 2026-09-16` 註記；`_lessons-ledger.md` 第 65 列僅 description 欄改寫＋`Superseded` 尾註；`module-map.yaml` lib／templates／tests `last_verified` 戳記 |

## Requirements

無 delta-spec（quick）。**Quick spec-impact check**：diff 觸及 playbook 條目內容、ledger 列 description、JSDoc 與出貨 reference 一句話；`prospec/specs/features/**` 中 REQ-TEMPLATES-212／REQ-TEMPLATES-081／REQ-TESTS-116 釘的是 implementation-guide 其他章節、載入項集合與 ceiling 存在性，無 REQ 釘住被改的句子或 PB-016 內容（review round 2 spec-architecture lens 逐一確認）→ **無 spec impact，略過 graduation**。

## Completion

- **Tasks**: 4/4 code tasks（100%）；`[M]` T5–T6 於 commit 邊界執行完成；`[V]` T7–T10 全數通過（T7 grep 零命中、T8 僅第 2 欄不同、T9 222 files／5,115 tests 綠、T10 playbook 12555→12852 tokens 遠低於 17000 門檻）
- **Acceptance Criteria**: 4/4（AS-1～AS-4）

## Review & Verify

- **Review**: 2 round(s), 0 critical / 1 major — round 1：F-1 major（docs-claims）出貨模板 `implementation-guide.hbs` §5 仍寫舊的 commit → record 順序、F-2 minor JSDoc「A red here」過度概括；round 2（fresh subagent 全 lens 複審）兩者皆 fixed、無新 finding。review baseline `graded_by: fresh-subagent`
- **Verify**: Grade S，machine 1/5 task-completion PASS · 4/5 knowledge PASS（0 stale module）· 5/5 tests PASS（`pnpm test` exit 0，222 files／5,115 passed／4 skipped）；judgment 3/5 constitution PASS（fresh subagent，8/8 條，MUST 6／SHOULD 2）· 2/5 delta-spec-compliance not-applicable（quick）· 6 design not-applicable（`ui_scope: none`）
- **Quality Log**: prospec-tasks WARN（Task Verifier：T9 追溯標籤「AC-4」不存在、T1 行號 436–438 與實際 435–437 差一行、T6 Co-Authored-By 慣例未載於 proposal——前兩項已於 tasks.md／proposal.md 修文字）；prospec-review round 1 WARN（F-1 major／F-2 minor，皆已修）；prospec-review round 2 PASS；prospec-verify PASS grade S

## Notes

- **偏離 issue 字面**：AC-3 要求 ledger 變更「透過 `prospec learn upsert` 落地」，但 `upsertLesson` 契約為 stored description wins（列本就允許手寫 provenance 尾註），故改為手寫 description、獨立 `docs(learn)` commit、六欄 byte-identical、不呼叫 upsert。AC-1 點名兩份文件，實際修四份（含 JSDoc 與出貨模板）。
- **Dogfood**：兩個 commit 落地後 review／test provenance digest 不變（`f9d106c0…`），`prospec check` 0 fail——「等價 commit 不需 re-record」由本變更自身驗證。
- `_lessons-ledger.md` 19918→19944 tokens（budget 20000，pre-existing 逼近上限 WARN 不變）。
- Phase 4.5 Harvest：本輪無新的可泛化教訓——F-1 屬 PB-007（修類別而非實例）既有規則的再證、Task Verifier 三項為一次性追溯標註瑕疵；ledger 預算已在上限，不新增列。
