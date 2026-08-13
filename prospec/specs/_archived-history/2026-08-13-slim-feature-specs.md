# slim-feature-specs — Archive Summary

- **Archived**: 2026-08-13
- **Original Created**: 2026-08-13
- **Quality Grade**: A
- **Scale**: quick

## User Story

US-1：把七份超出 `spec_per_file`（5,000 tok）預算的 feature spec 依 story 邊界切成 `specs/features/{feature}/{slice}.md`，母檔保留 frontmatter、`## Slices` 索引與非 story 段落，使每個檔案落在預算內、`knowledge-size` 的 feature-spec 面收斂，而 REQ 定義、引用與計數全數不變。

## What shipped

- 七份 spec 切成 **42 個 slice**（budget-grouping ~4,000 tok/slice）＋7 個改寫的母檔；每個 US story 原文照搬，`story_count`/`req_count` 不變（main＋slices 加總）。
- 切分暴露 Stage 1 漏改的讀取面：3 個 test guard 用 main-only 掃 real specs（`spec-req-body-ledger`、`spec-sync-corpus`、`archive-finalize` 的 recount 測試）。已改成 slice-aware（遞迴掃／`parseSpecSlices` 組合），與 production reader 同型；body-less REQ ledger 的 12 筆 re-key 到 slice 路徑。**無任何 `src/` production code 變更。**

## Spec Impact（quick Entry Gate 判定）

- **無 spec-covered behavior 變更** → graduation 略過。切分只重整檔案版面、搬移 REQ 原文，未新增/修改/移除任何 REQ；test guard 改動屬測試基礎設施。故 delta-spec 不存在、Phase 3.5 不執行。

## Affected Modules

- 無 code module（純 docs 重整＋test-guard 適配）。

## Residuals（已確認接受，維持 quick）

- `drift-detection/us-8.md` 4,979 tok（pressure；單一 9-REQ dense story）
- `sdd-workflow.md` 母檔 5,899 tok（over；`## Change History` ~4,761 須留母檔以免破壞 archive `appendToChangeHistory`）
- `sdd-workflow/us-6.md` 6,809 tok（over；單一 17-REQ story）
- `sdd-workflow/us-30.md` 4,893 tok（pressure）
- 皆為 story-邊界切片無法縮小者；feature-spec 面從 7 個最高 13.3× 超標收斂到 4 個近預算殘留。

## Review & Verify

- **Review**: 2 round(s), 0 critical / 1 major — round 1 揪出 1 個 advisory major（3 個 slice 的 REQ heading/example 含 pre-existing CJK，逐字自 main 搬來、非本次引入，屬信任區既有 Language Policy debt，out of scope）；round 2（test-guard diff）review-clean，獨立確認 guard 強度未弱化。
- **Verify**: Grade **A**（machine: task-completion=PASS · knowledge=WARN · tests=PASS；judgment: delta-spec-compliance=not-applicable · constitution=PASS · design=not-applicable）；test suite 150 files / 3788 passed / 0 failed。
- **Quality Log**: new-story WARN（docs-only，related_modules 空的 knowledge gate）、review×2 WARN（advisory CJK major 帶入）、verify knowledge WARN（既有 cli/lib timestamp ＋ knowledge-size 殘留，與本變更無關）。無 FAIL。

## Follow-ups（另開變更）

- 重塑 `sdd-workflow` US-6（17 REQs）為多個小 story（standard + delta-spec）以清 over-budget。
- 讓 `services/archive.service.ts` 的 `appendToChangeHistory` slice-aware（同 Stage 1 的 writer 模式），使 Change History 可移出母檔。

## Completion

- **Tasks**: code 10/10；[V] 4/4；[M] 2/2。
