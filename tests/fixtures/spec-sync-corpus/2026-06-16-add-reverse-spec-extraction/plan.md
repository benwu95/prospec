# Plan: add-reverse-spec-extraction（BL-032 反向規格萃取）

## Overview

本 Story 為 brownfield 既有 code 補上 WHAT-layer：以反向萃取產出 route-compatible 的 Feature Spec **草稿**，補齊「沒走過 forward change 的 code 永遠沒 Feature Spec」的缺口。核心張力是「反向萃取記錄 behavior、非 intent」，故草稿絕不直寫信任區、intent 推不出處標 `[NEEDS CLARIFICATION]`、由人工 verify-and-promote。

實作策略採 **Architecture C（純 Skill，無 runtime CLI/engine）**：擴充既有 `prospec-design` Extract Mode，新增一個 input=code 的反向變體（沿用「mode-detect → 讀 → map → 標 `[NEEDS CLARIFICATION]` → user-review gate」概念骨架），多源 triangulation 讀取、產草稿到 `.prospec/changes/[name]/reverse-draft.md`。**本輪只到 plan/delta-spec，不落任何 code**；實作待真實 brownfield 拉動（需求 gate，閘 OPT-A4 後）。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| templates | Handlebars 模板（skills/*.hbs 經 renderTemplate 渲染、agent sync 部署） | `renderTemplate(name, ctx)` | 無（leaf 資源） |
| tests | 4 層測試;contract 層以真 renderTemplate 驗證 skill 格式 | `vitest run` | all src modules |

### Existing Patterns (from _conventions.md / READMEs)
- 反向萃取作為 `prospec-design.hbs` Extract Mode 的 code-input **inline** 變體（不新增 reference 檔，以免動 `agent-sync.service.ts` referenceMap → 守純 templates+tests）
- 改 skill template 後須 `prospec agent sync` 重新部署到 `.claude/skills/`
- Contract 斷言守 **PB-001**：section-scoped + structure-aware + mutation-verified（含負向斷言）
- 草稿須 route-compatible（`**Feature:**`/`**Story:**`），否則 forward `syncToFeatureSpecs` 整條丟棄；slug 須過 `isSafeResourceName`

### Architecture Constraints (from Constitution)
- 依賴方向 `cli → services → lib → types` 不反向——本變更純 templates（leaf）+ tests，零新 import、零違反
- TDD（P4）：contract 測試先於 `.hbs`（實作時）
- 信任區不變式：`archive.service.ts` `syncToFeatureSpecs()` 為 `specs/features/` 唯一寫入者，反向萃取永不直寫

## Affected Modules
| Module | Impact | Changes |
|--------|--------|---------|
| templates | Medium | `prospec-design.hbs` 新增 code-input 反向 Extract 變體（inline 指令 + reverse-draft 格式 + 覆蓋偵測） |
| tests | Medium | `skill-format.test.ts` 新增 section-scoped/mutation-verified contract 斷言 |

## Call Chain

> 純 Skill 變更無 runtime cli→services→lib→types 鏈;此處呈現 skill 執行流與渲染/部署鏈。

```
渲染/部署：renderTemplate('skills/prospec-design.hbs') → prospec agent sync → .claude/skills/prospec-design/SKILL.md

執行流（reverse-spec 變體）：
  /prospec-design  (Extract Mode, input=code)
    → mode-detect：偵測 input=code（反向萃取意圖）            [非 Startup Loading]
    → scope：agent 讀 specs/features + module 清單 → 列未覆蓋 module（informational）
    → triangulation 讀取：code+tests(behavior/AC) · git history(WHY 提示) · ai-knowledge(僅 routing)
    → map → .prospec/changes/[name]/reverse-draft.md（route-compatible 草稿 + 提議 slug）
    → mark [NEEDS CLARIFICATION]（intent 不明）→ >50% 即中止/建議 forward
    → user-review gate（解 [NEEDS CLARIFICATION] + 確認 slug）
    → （人工）轉 delta-spec → /prospec-verify → /prospec-archive  ← 既有 forward 晉升路徑（唯一寫信任區者）
```

## Implementation Steps

> 本輪不執行;以下為實作時的步驟設計（gate 解除後）。

1. **prospec-design.hbs 新增 code-input 反向 Extract 變體**
   - Phase 1 mode-detect 增加 input=code 分支;Extract 流程加 triangulation 讀取 + reverse-draft 產出段
   - inline 描述 reverse-draft.md route-compatible 格式（`**Feature:**`/`**Story:**` + US/AC 候選）
2. **沿用護欄字樣**
   - `[NEEDS CLARIFICATION]`（intent 欄位 So that/role/value 推不出即標）+ >50% 中止/降級走 forward
   - 永不寫 `specs/features/`;slug 提議但以 `[NEEDS CLARIFICATION]` 請人確認 + `isSafeResourceName` 驗證
3. **WHAT-layer 未覆蓋偵測（agent 語意判斷）**
   - skill 內讀 specs/features + module 清單列未覆蓋者;informational、不阻擋、不自動觸發
4. **skill-format.test.ts contract 斷言**
   - section-scoped 釘住 REQ-TEMPLATES-104~107 字樣 + 負向斷言（不寫信任區、不入 Startup Loading）;mutation-verify
5. **MODIFIED REQ-DSGN-003 同步 + Knowledge/README sync（PB-004/005）**
   - design-phase.md 雙模式描述加 code-input 變體交叉引用;同 commit bump templates/tests README + 重算 `.hbs`/test 計數

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| design-phase 語意污染（UI feature 混入行為層） | Medium | REQ 主體掛 sdd-workflow US-22;design-phase 僅留 REQ-DSGN-003 交叉引用、不複製行為實質 |
| 規格宣稱未實作行為（本輪無 code，PB-003） | High | delta-spec/plan 明示「本輪不落 code」;AC 寫成實作後可驗;畢業前不得 archive |
| Contract 斷言 false-green（PB-001） | High | section-scoped + 負向斷言 + mutation-verify 三者齊備 |
| reverse-draft 破壞 forward 晉升（缺 routing 欄位被丟棄） | Medium | 草稿強制帶 `**Feature:**`/`**Story:**` + slug 過 `isSafeResourceName`;晉升仍走人工→既有 archive |
| 改 source 未 bump README → drift stale（PB-005） | Low | 實作時同 commit bump templates/tests README + 重算計數（PB-004） |

> **Layering check（Phase 6）**：執行流非 cli→services→lib→types 程式鏈,而是 skill 指令流;templates 為 leaf 資源（被 lib/template.ts 消費）、零新 import、零反向依賴 → 無 layering 違規。

> **Knowledge Quality Gate（Phase 7）**：Context mode=Brownfield ✓;related module README（templates/tests）已讀 ✓;Technical Summary 已綜合 ✓;Feature Specs（design-phase/sdd-workflow）已比對、無 REQ 重疊 ✓ → 全 PASS。
