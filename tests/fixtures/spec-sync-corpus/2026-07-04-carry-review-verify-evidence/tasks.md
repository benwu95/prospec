# Tasks: carry-review-verify-evidence

**Input**: Design documents from `.prospec/changes/carry-review-verify-evidence/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Tests (RED first)

- [x] T1 契約測試：`archive-format.hbs` 的 `## Review & Verify` 節＋三類內容（grade／criticals-majors 計數＋findings 節選／quality_log digest），section-scoped（REQ-TESTS-041）~25 lines
- [x] T2 契約測試：`prospec-archive.hbs` Phase 2 寫入步驟＋Phase 2 Gate 項＋NEVER 守則（REQ-TESTS-041）~20 lines
- [x] T3 契約測試：`promotion-format.hbs` 的 `_archived-history` 證據指標敘述、不指向 `.prospec/archive/`（REQ-TESTS-041）~15 lines
- [x] T4 [V] 確認 T1–T3 在範本未改前轉紅（RED baseline）~5 lines

## Templates

- [x] T5 `archive-format.hbs`：Completion 與 Knowledge Update 之間插入 `### 6. Review & Verify` 格式節、Knowledge Update 順移 §7（REQ-TEMPLATES-126）~30 lines
- [x] T6 `prospec-archive.hbs`：Phase 2 加寫入步驟、Phase 2 Gate 補一項、NEVER 補一條（REQ-TEMPLATES-127）~20 lines
- [x] T7 `promotion-format.hbs`：Harvest 節明示 committed 證據指標 `_archived-history/{date}-{name}.md`（REQ-TEMPLATES-128）~12 lines

## Docs / Knowledge

- [x] T8 `prospec/ai-knowledge/_lessons-ledger.md` header：加一句證據指標慣例（指向 `_archived-history/{date}-{name}.md`）~5 lines
- [x] T9 best-effort 回填 50 筆 bundle 已失舊筆的 `## Review & Verify` 節（4→54 筆；rich 35／grade-only 14／not-recoverable 1；純新增 +350/-0；回填條目附 `Source` provenance bullet；清單見 `backfill-manifest.md`）（US-3 / FR-005）~350 lines

## Sync & Verify

- [x] T10 [M] `prospec agent sync` 重生 `.claude/skills/**`（dist 已建置，範本 runtime 讀取，無需重編）~5 lines
- [x] T11 [V] `pnpm vitest run` 全綠（1865/1865；1 e2e --version 冷啟動 flaky，單跑通過）；T1/T3 逐條 mutation-verify（移除 `never fabricate`/`_archived-history` token 轉紅、還原）~10 lines
- [x] T12 [V] grep 全庫確認 ledger/playbook 無 `.prospec/archive/` 證據引用（唯一命中為 ledger header 的反面指引「勿用 bundle 當證據」，非證據引用）；learn／archive 兩份 `promotion-format.md` 皆帶 `_archived-history` 指標 ~5 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 12 |
| Code tasks | 8 (T1–T3, T5–T9) |
| Manual [M] | 1 (T10) |
| Verification [V] | 3 (T4, T11, T12) |
| Parallelizable | 3 (T1–T3, different assertion blocks) |
| Estimated lines | ~247 lines |

---

## Notes

- 執行順序：T1–T4（RED）→ T5–T7（範本 GREEN）→ T8（ledger header）→ T10（sync）→ T11（全綠＋mutation）→ T9（回填，docs）→ T12（最終 grep 驗證）
- `.claude/skills/**` 為生成物：只改 `src/templates/` 來源，經 T10 `agent sync` 部署
- T9 回填為 best-effort：僅回收可證者，無據明列不可回收、嚴禁捏造 grade/計數
- 完成率只計 code task（8 項）；`[M]`/`[V]` 不計入分母
