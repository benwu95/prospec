# Implementation Plan: add-dependency-knowledge（BL-034）

## Overview

本變更為 `prospec-plan` 與 `prospec-implement` 加入一個 **optional、on-demand** 的依賴層知識步驟：當變更／task 觸及第三方 library 時，向 Context7 MCP（若可用）查 usage snippet，注入 plan 的 Technical Summary（或 implement 寫 code 前作參考）；查不到即靜默跳過並留一行 informational 註記。

實作策略為純 Skill（Architecture C）：只改 `src/templates/skills/` 下 3 個 `.hbs`（plan skill、implement skill、plan-format reference），以 `prospec agent sync` 重新生成部署版，並以 `tests/contract/skill-format.test.ts` 釘住新指令與 graceful／untrusted／non-gating 字樣（section-scoped + mutation-verified，PB-001）。步驟刻意設計為 in-Phase 動作而非 Startup Loading 項目——不碰 `[STABLE]/[DYNAMIC]` 清單、不動 `startup-loading-baseline.json`，從而保證「永不進 stable prefix（保 G4）」。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| templates | Handlebars 模板庫（13 skills + references），純資源 | `renderTemplate(name, ctx)`（經 lib/template.ts） | — (leaf) |
| tests | 4 層測試金字塔（含 contract/skill-format） | vitest | all |

### Existing Patterns（from _conventions.md / templates README）
- 模板 English-only（REQ-TEMPLATES-073）；文件語言由 Constitution Language Policy 決定，不硬編入模板。
- Startup Loading：`[STABLE]` 全部先於 `[DYNAMIC]`；改清單須同步 `startup-loading-baseline.json`（本變更刻意不碰清單以規避）。
- 條件式 on-demand 子步驟既有慣例：implement「For UI tasks — MCP-first」(REQ-TEMPLATES-058) — 本步驟比照其形狀，但補上 UI block 沒有的 graceful degradation。
- MCP 工具以能力／短名引用（adapter 慣例 import-html／batch_design），不硬編 `mcp__…` 完整 id。

### Architecture Constraints（from Constitution / backlog）
- Dependency direction `cli → services → lib → types`；templates 為 leaf，純 `.hbs` 無反向 import（PASS）。
- 變更文件繁中、模板英文（Principle 1）。
- TDD（Principle 4）：模板變更需伴隨契約斷言。
- G4／KV-cache（backlog BL-020/BL-034）：on-demand 步驟永不進 `[STABLE]` 前綴。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| templates | High | `prospec-plan.hbs` Phase 4 + `prospec-implement.hbs` Phase 2/3 加 optional Context7 步驟；`references/plan-format.hbs` Technical Summary 加 optional「External Library Usage」子節 |
| tests | Medium | `tests/contract/skill-format.test.ts` 新增 section-scoped + mutation-verified 契約斷言 |

## Call Chain

**1. Plan 端執行流（US-1）— in-Phase，非 startup**
```
/prospec-plan Phase 4 (Design plan.md)
  → [if 本變更觸及第三方 lib]                       [scope guard]
  → [if a Context7 MCP is available] resolve-library-id(lib) → query-docs(id)   [graceful: 不可用即靜默跳過]
  → 注入 Technical Summary §External Library Usage（標 informational/untrusted）  [不執行、不作 gate]
  → [miss/unavailable] 留一行 informational 註記（非 WARN/FAIL）
```

**2. Implement 端執行流（US-2，補 quick 缺口）**
```
/prospec-implement Phase 2/3 (Load Knowledge / Execute)
  → [if 該 task 觸及第三方 lib] [if Context7 available] resolve-library-id → query-docs  [per-task lazy]
  → 作寫 code 前參考（untrusted）；quick-scale（無 plan）為主要受益路徑
  → [miss/unavailable] 靜默跳過
```

**3. 部署鏈（生效路徑）**
```
edit src/templates/skills/*.hbs
  → prospec agent sync → renderTemplate() → atomicWrite() → .claude/skills/*/SKILL.md + .agents/skills/*
  → pnpm verify:skills（契約守門）
```

## Implementation Steps

1. **plan-format.hbs：Technical Summary 加 optional 子節**
   - 於 Section 2 Brownfield 與 Greenfield 格式各加 optional「### External Library Usage (on-demand, informational)」子節，明示 untrusted、miss 時留 informational 註記。
2. **prospec-plan.hbs：Phase 4 加 optional Context7 步驟**
   - 條件式（觸及第三方 lib）+ if-available + resolve-library-id/query-docs（prose 短名）+ 注入 §External Library Usage；明示 non-gating、silent-skip+informational；不加 Startup Loading 項。
3. **prospec-implement.hbs：Phase 2/3 加 optional Context7 區塊**
   - 比照「For UI tasks」形狀加「For tasks touching third-party libraries」block，per-task lazy、graceful、明示 quick-scale 適用。
4. **契約斷言（TDD）**
   - `skill-format.test.ts` 新增 section-scoped 斷言：plan/implement 含步驟、含 graceful／untrusted／non-gating／silent-skip+informational 字樣；mutation-verify（移除即轉紅）；並 negative-assert 未新增 `[STABLE]` 標記。
5. **重新生成 + 守門**
   - `prospec agent sync`；`pnpm verify:skills`；`pnpm test` 全綠；確認 `startup-loading-baseline.json` 未變動。
6. **文件同步（PB-004/005）**
   - 更新 templates／tests 模組 README（source-touched，避免 knowledge-health stale）+ README 測試計數重新導出；確認 root README 是否需補 plan/implement 行為面（Principle 5 [SHOULD]，缺則 verify WARN）。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 步驟誤入 `[STABLE]` 前綴破壞 KV-cache（G4） | High | 設計為 in-Phase 動作，不碰 Startup Loading 清單；契約 negative-assert 無新增 `[STABLE]`；確認 baseline fixture 不變 |
| 「靜默跳過」與專案「絕不靜默 fallback」慣例衝突 | Medium | 調和為靜默跳過 + 一行 informational 註記（非 WARN/gate）；於 skill 文字明示，契約釘住字樣 |
| 文件宣稱漂移（把 Context7 講成依賴）（PB-003） | Medium | 一律「if available / optional / untrusted」措辭；claim ⊆ implementation；不宣稱硬依賴 |
| 加測試改動計數 → README/_index/模組 README 漂移（PB-004/005） | Medium | 同 commit 重新導出測試計數並更新 templates/tests README |
| 無 plan station 的 false-block/false-pass（PB-002） | Low | 本變更不改 artifact 存在性或 status transition，僅加 optional in-Phase 步驟；逐 station 確認既有 gate 不依賴新步驟 |
| verify:skills 結構期望（ref 計數）被破壞 | Low | 不新增/刪除 reference 檔（只改既有 plan-format.hbs）；sync 後跑 verify:skills 確認 |

## Knowledge Quality Gate

| Check | 結果 |
|-------|------|
| Context mode detected | PASS（Brownfield，6 模組） |
| Module Knowledge loaded | PASS（templates + tests README + _conventions + _playbook） |
| Technical Summary synthesized | PASS |
| Feature Specs checked | PASS（sdd-workflow.md：REQ-TEMPLATES-042/044/058 為相鄰既有需求） |
| 前序 WARN | Principle 5 README [SHOULD]（new-story 記錄）→ implement Step 6 處理 |
