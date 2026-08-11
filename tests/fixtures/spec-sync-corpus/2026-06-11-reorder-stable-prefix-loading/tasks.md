# Tasks: reorder-stable-prefix-loading

**Input**: Design documents from `.prospec/changes/reorder-stable-prefix-loading/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] Description (~lines)`

- **[P]**: 可並行（不同檔案、無相互依賴）
- **~N lines**: 預估變更行數

---

## Docs（排序準則先行——後續重排與斷言的單一依據）

- [x] T1 README（英/中）增「cache-stable prefix ordering」小節：`[STABLE]/[DYNAMIC]` 判準（動＝每次觸發變、靜＝僅 sync 時變）、boundary 原理、Available Skills 判定 STABLE 的理由〔REQ-080〕 ~50 lines

## Tests（contract 先行，TDD 紅燈）

- [x] T2 `skill-format.test.ts`：order 斷言——逐模板切 Startup Loading 區段（guard 非空），驗每個編號項帶標注、最後一個 STABLE 位於第一個 DYNAMIC 之前；完成後 mutation 驗證（換序/刪標注必轉紅）〔REQ-080, PB-001〕 ~80 lines
- [x] T3 `skill-format.test.ts`：集合不變斷言——以重排前渲染產物抽取載入項 link/path 集合為基準，重排後比對一致；MANDATORY 標記計數不變〔REQ-081, PB-001〕 ~60 lines
- [x] T4 [P] 既有兩條 Startup Loading 引用斷言（feature-spec-format、design-spec）改為 section-scoped〔REQ-080, PB-001〕 ~30 lines

## Templates（重排至綠燈；三批不同檔案可並行）

- [x] T5 [P] Planning 群 5 模板重排+標注+交叉引用修正：new-story / plan / design / tasks / ff〔REQ-080, REQ-081〕 ~75 lines
- [x] T6 [P] Execution 群 3 模板：implement / review / verify〔REQ-080, REQ-081〕 ~45 lines
- [x] T7 [P] Lifecycle 群 5 模板：explore / knowledge-generate / archive / knowledge-update / learn〔REQ-080, REQ-081〕 ~75 lines
- [x] T8 `entry.md.hbs` 檢查無 per-trigger 動態值（預期零改動），檢查結果記入 change notes〔REQ-082〕 ~15 lines

## Deployment

- [x] T9 執行 `prospec agent sync` 重部署；驗證 `.claude/skills/` 與 `.agents/skills/` 的 13 個 SKILL.md 與模板渲染產物 diff 乾淨；全套測試重跑維持綠〔REQ-082〕 ~200 lines（自動再生）

## Scripts（harness glossary 變體，opt-in 不影響既有行為）

- [x] T10 `scripts/measure/assemble.ts`：prospec 組裝加 glossary 選項——啟用時於 STABLE 段尾附加 `_glossary.md`〔REQ-009〕 ~30 lines
- [x] T11 runner `--prospec-glossary` 旗標 + 啟用時報告另存（避免覆蓋主報告）〔REQ-009〕 ~30 lines
- [x] T12 [P] 變體單元測試：含/不含 glossary 的組裝差異斷言、預設關閉行為不變〔REQ-009〕 ~40 lines

## Measurement（操作程序）

- [x] T13 重排 commit 前記錄 before 快照 hash 至 change notes（確認晚於 harness 合併點 `ddc9dc4`）+ 量測程序文件化〔REQ-008〕 ~15 lines
- [ ] T14 （有 API key 時）before/after 量測（同 provider/model/corpus）+ 同快照 glossary 兩組對照；對照記錄只引用報告數字、不設門檻；無 key 標 pending 不阻塞交付〔REQ-008, REQ-009〕 ~40 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 14 |
| Parallelizable | 5 |
| Estimated lines | ~775 lines |

---

## Notes

- TDD：T2/T3 先紅（對現行模板斷言順序必失敗），T5-T7 重排後轉綠；T3 的基準集合須在重排**前**抽取
- T5/T6/T7 不同檔案可並行，但都依賴 T1 的判準與 T2/T3 的紅燈先行
- T9 的部署再生行數大但全自動——驗證重點是 render-vs-deployed diff 乾淨
- T13 必須在第一個模板重排 commit 之前執行（before 快照的硬約束）
- T14 為 manual/verification 性質：無 key 時 US-2/US-3 標 pending，US-1（T1-T9）可獨立交付
