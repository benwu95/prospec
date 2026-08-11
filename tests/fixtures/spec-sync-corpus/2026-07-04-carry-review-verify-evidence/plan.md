# Implementation Plan: carry-review-verify-evidence

## Overview

封存的 committed audit trail（`_archived-history/{date}-{name}.md`）目前只有 4/54 筆帶 review/verify 證據——其餘的 review.md、verify 報告、quality_log 只存在 gitignored bundle，worktree 模式下已大量蒸發、不可復原。

策略：在 archive summary 的**格式規格**與**產生流程**兩端各加一節 `## Review & Verify`，使新封存自動攜帶證據並隨既有 Phase 3 複製落地；以 section-scoped 契約測試釘住寫入步驟；並在 lessons-ledger 的格式單一來源（`promotion-format.hbs`）明示 committed 證據指標為 `_archived-history/{date}-{name}.md`。最後 best-effort 回填 bundle 已失的舊筆。所有 skill/reference 改動走 `src/templates/` 來源，經 `agent sync` 生成，禁止直接改 `.claude/skills/` 產物。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| templates | Handlebars 範本庫；`.hbs` 為生成 `.claude/skills/**` 的來源真相 | `renderTemplate()` 消費；`agent sync` 部署 | None（純資源） |
| tests | 4 層測試；契約層以真 `renderTemplate()` 驗範本格式 | `vitest run`；`sectionOf()` section-scoped 斷言 | all |

### Existing Patterns (from _conventions.md / module README)
- `promotion-format.hbs` 是 lessons-ledger 格式＋Harvest 的**單一來源**，render 進 prospec-learn 與 prospec-archive 兩份 `promotion-format.md`（REQ-AGNT-015）——改一處、兩處同步。
- 契約斷言必須 section-scoped ＋結構/負向（PB-001）：bare `toContain` 全文會假綠，須 `sectionOf()` ＋ mutation-verify。
- `_lessons-ledger.md`/`_playbook.md` 為 version-controlled 活文件、非範本產物——直接編輯（無雙維護）。

### Architecture Constraints (from Constitution)
- Language Policy：文件繁中、範本一律英文（REQ-TEMPLATES-073）、commit 英文。
- TDD：契約測試先紅後綠、mutation-verify。
- One-way dependency：本變更僅動 templates/tests 資源與 docs，無跨層匯入風險。

## Call Chain

```
/prospec-archive Phase 2 (Generate Summary)
  → 讀 metadata.yaml.quality_log + review.md + verify 報告
  → 依 archive-format.md §Review & Verify 產出 summary.md 的該節
  → Phase 3 複製 summary.md → specs/_archived-history/{date}-{name}.md   [既有步驟，證據隨之落地]

生成管線（範本→產物）:
  src/templates/skills/*.hbs → renderTemplate() → `agent sync` → .claude/skills/**/*.md
```

## Implementation Steps

1. **契約測試先行（RED）** — `tests/contract/skill-format.test.ts`
   - 新增 section-scoped 斷言：archive-format 的 `## Review & Verify` 節＋三類內容關鍵字
   - prospec-archive Phase 2 寫入步驟＋Phase 2 Gate 項；promotion-format 的 `_archived-history` 證據指標
   - 先確認未改範本時轉紅（mutation baseline）

2. **archive-format.hbs 加格式節（GREEN 之一）** — REQ-TEMPLATES-126
   - Completion 與 Knowledge Update 之間插入 `### N. Review & Verify` 規格
   - 列 grade／criticals-majors 計數＋findings 節選／quality_log digest；含「無證據據實標示、不捏造」守則
   - 後續 section 編號順移

3. **prospec-archive.hbs Phase 2 寫入步驟（GREEN 之二）** — REQ-TEMPLATES-127
   - Phase 2 新增一步：彙整 quality_log/review.md/verify 報告寫入該節
   - Phase 2 Gate 補一項；NEVER 區補「不得產出缺該節 summary」

4. **promotion-format.hbs 證據指標（GREEN 之三）** — REQ-TEMPLATES-128
   - Harvest／Ledger 節明示 committed 證據在 `_archived-history/{date}-{name}.md`

5. **agent sync ＋ 全測綠** — 重生 `.claude/skills/**`，`pnpm build`＋`vitest run` 全綠、mutation-verify 契約斷言

6. **best-effort 回填舊筆（docs）** — FR-005 / US-3
   - 由 `_lessons-ledger.md`／git commit／summary 既有資訊回收 grade/criticals/quality_log 者補 `## Review & Verify` 節
   - 無可回收者列入「不可回收清單」、不捏造

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 直接改 `.claude/skills/` 產物被 agent-sync 覆蓋 | High | 只改 `src/templates/` 來源，改後 `agent sync` 重生並驗 diff |
| 契約斷言 bare `toContain` 假綠（PB-001） | Medium | section-scoped `sectionOf()` ＋負向斷言＋逐條 mutation-verify |
| promotion-format 單一來源改動漏 render 一處 | Medium | 斷言涵蓋 learn／archive 兩份 render；`agent sync` 後 grep 兩處 |
| US-3 回填捏造證據（reverse-extraction 失效模式） | High | 嚴格 best-effort：僅回收可證者，無據明列不可回收、不生成 grade/計數 |
