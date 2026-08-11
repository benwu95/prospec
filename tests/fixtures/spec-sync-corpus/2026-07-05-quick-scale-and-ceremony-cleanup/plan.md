# Plan: quick-scale-and-ceremony-cleanup

## Overview

本變更讓 prospec SDD skill 的流程重量誠實化：`quick` scale 在 verify/archive 照 `backfill` 的 scale-aware 範本真減量、移除無下游消費者的儀式欄位（`[P]`／`~lines`／逐條 INVEST 稽核）、消除 skill 間互相矛盾或誤導的規則（5 份重複 Quality Gate 表、commit 語意、`readme-counts` 名實、Language Policy 三方衝突），並為 archive Entry Gate 補上 metadata 完整性防呆。

實作分兩類：(1) **純 prompt 編修**——絕大多數改動在 `src/templates/skills/*.hbs`（行為來源，非生成的 `.claude/skills/*/SKILL.md`），改完以 `prospec agent-sync` 重生成、二者同 commit；(2) **程式碼**——drift 引擎兩處：把既有 `readme-counts` check id 依「名實相符」改名為 `mcp-readme-counts`，並新增 `metadata-completeness` FAIL-class check（完全比照既有 `review-provenance` 的 collector→evaluator→check.service 佈線），archive skill Entry Gate 以 `prospec check` 機檢消費之。Constitution 兩條 `[MUST]`（Language Policy 還原豁免 AI Knowledge、INVEST 逐條稽核降 advisory 但保留原則）依使用者授權修訂。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API / Surface | Dependencies |
|--------|-------------------|---------|--------------|
| templates | Handlebars skill/knowledge 模板（行為來源） | `src/templates/skills/*.hbs`（verify/archive/tasks/new-story/plan/implement/design） | — |
| types | Zod schema + 凍結契約 | `DRIFT_CHECK_IDS`、`ChangeMetadataSchema` | — |
| lib | drift 引擎（collectors + pure evaluators） | `drift-sources.ts`（collectReviewProvenance 範本）、`drift-checker.ts`（runChecks/evaluate*） | types |
| services | 業務邏輯 execute() | `check.service.ts`（組裝 DriftCheckInputs） | types, lib |
| tests | 4 層測試金字塔 | drift 契約測試、skill-format 契約、新增 metadata/rename 測試 | all |

### Existing Patterns（from _conventions.md / _playbook.md）
- **drift check 擴充範本**：`review-provenance` = types 加 id → `drift-sources` 加 collector（掃 `.prospec/changes/*/metadata.yaml`）→ `drift-checker` 加 pure evaluator + 併入 `DriftCheckInputs`/`runChecks` → `check.service` 佈線 → skill 以 `prospec check --json` 消費（CLI 不在時退回直接讀 metadata）。`metadata-completeness` 完全比照。
- **PB-001**：契約測試須 section-scoped + structure-aware + **mutation-verified**（刪/改被斷言特徵確認變紅）。
- **PB-002**：改 quick 流程重量須把 `_status-lifecycle.md` 站點清單逐站問 false-block／false-pass，勿憑記憶重建。
- **PB-003**：文件宣稱 ⊆ 實作行為——rename 後不得殘留舊名宣稱。
- **PB-006/007**：`readme-counts` rename 與 Quality Gate 去重屬 parallel-site sweep——grep 每個引用點全數改。
- **counts 機器同步**（PB-004/005 已 RETIRED）：改動被計數的檔案類別後跑 `pnpm counts` 由單一來源重生。

### Architecture Constraints（from Constitution）
- Dependency direction `cli → services → lib → types`：新增 collector/evaluator 落在 lib，check.service 佈線落在 services，id/schema 落在 types——不反向、不循環。
- TDD：drift 兩處程式碼改動 test-first；metadata-completeness 覆蓋通過/失敗兩路徑。
- Atomic Commits：全變更一顆 atomic-by-feature commit（commit boundary = verify S/A）。
- Language Policy（本變更修訂中）：`.prospec/changes/` 文件仍 zh-TW；知識庫還原為英文豁免。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| templates | High | verify/archive/tasks/new-story/plan/implement/design `.hbs` prompt 編修（scope 1/2/3/4 skill 端）；重生成 `.claude/skills/` |
| types | Medium | `DRIFT_CHECK_IDS`：`readme-counts`→`mcp-readme-counts` 改名；新增 `metadata-completeness`（9→10 id） |
| lib | Medium | drift-sources 加 `collectMetadataCompleteness`＋rename readme-counts collector；drift-checker 加 `evaluateMetadataCompleteness`＋rename evaluator |
| services | Low | `check.service` 佈線新 collector 至 `DriftCheckInputs` |
| tests | Medium | drift 契約 id 集更新；readme-counts→mcp 測試改名；新增 metadata-completeness 通過/失敗測試；skill-format 契約隨模板調整 |
| （治理檔）| Medium | `prospec/CONSTITUTION.md`（Language Policy + INVEST）、`CLAUDE.md`（Language Policy 對齊）、`_status-lifecycle.md`（design 定位）、`token-measurement/lessons.md` L-001、ledger header |

## Call Chain

程式碼進入點只有 drift 引擎（skill `.hbs` 編修無 code call chain）：

```
prospec check --json
  → cli/check → CheckService.execute(opts)                         [transport]
  → collect* sources (lib/drift-sources):                          [orchestration]
      collectReadmeCounts → mcp-readme-counts source (rename only)
      collectMetadataCompleteness(cwd, changesDir) → per-change fields/grade   [NEW，比照 collectReviewProvenance]
  → runChecks(inputs) (lib/drift-checker)                          [pure evaluators]
      evaluateMcpReadmeCounts(src)         [rename of evaluateReadmeCounts]
      evaluateMetadataCompleteness(src)    [NEW，FAIL-class]
  → DriftReport（10 checks）→ prospec-report.json                  [data]
消費端：
  /prospec-archive Entry Gate → 讀 report.metadata-completeness → FAIL 則拒絕入庫
    （CLI 不在時退回直接讀該 change 的 metadata.yaml，比照 verify review-provenance fallback）
```

`metadata-completeness` 判定（純函式）：change 缺 `name`/`created_at`/`status`/`scale` → FAIL（列出缺項）；`status: verified` 但 `quality_log` 無 verify grade（S/A）→ FAIL。in-progress（story/plan/tasks/implemented）只套欄位存在規則，不套 grade 規則（避免 false-block）。

## Implementation Steps

1. **Scope 1 — quick 在 verify/archive 真減量（`prospec-verify.hbs`、`prospec-archive.hbs`）**
   - verify：為 `scale: quick` 提供 scale-aware 分支——縮減 Startup Loading（quick 無 plan/delta-spec/feature-spec 對照）、報告收斂；`NEVER skip any verification dimension` 的措辭加入 quick/backfill 轉義例外（維持 not-applicable 呈現、不呈現 PASS）。
   - archive：把 quick 的 spec-impact 判定定位為「scale 於 tasks 時已知」的一次性判定、不在 archive 才重算 diff；確認 quick 不比 standard 多淨儀式步驟。
   - 依 PB-002 逐站核對 false-block/false-pass。

2. **Scope 2 — 儀式降級＋design 定位（`prospec-tasks.hbs`、`prospec-new-story.hbs`、`prospec-verify.hbs`、`_status-lifecycle.md`）**
   - tasks：`[P]` Phase 4 與 `~lines` 由 Phase Gate／Failure Condition／NEVER 的必填語境降為選填（保留 `[M]`/`[V]` kind 標記，因 verify/archive 有機制性消費）。
   - new-story／verify：逐條 INVEST 稽核降 advisory（不 hard-block）；INVEST 原則保留於 Constitution。
   - `_status-lifecycle.md` 加一行：design 無 status、僅 `ui_scope != none` 時介入、位於 plan 與 tasks 之間。

3. **Scope 3a — Quality Gate 去重＋commit 語意（5 個 skill `.hbs`）**
   - new-story/plan/tasks/implement 的 Knowledge Quality Gate 表收斂為一行 pass/warn 註記（記入 quality_log）；完整表僅留 verify。
   - 統一 commit 語意：刪除 verify checkpoint-commit 讓步括號，對齊 implement「commit boundary = verify S/A」單一規則。

4. **Scope 3b — readme-counts 改名（types/lib/tests + 引用點）**
   - `DRIFT_CHECK_IDS` `readme-counts`→`mcp-readme-counts`＋更新註解點明 MCP-specific 範圍；rename collector/evaluator/type 名；PB-006/007 grep 全數引用點（templates review-lens、知識庫 index/README、feature spec drift-detection、測試）一併改。

5. **Scope 3c — Language Policy 三方對齊（`CONSTITUTION.md`、`CLAUDE.md`、ledger/lessons）**
   - Constitution Language Policy Description/Verify 還原豁免 AI Knowledge（回 0d35f85 前語意、對齊英文知識庫）；同步 checklist/quality-standards 行。
   - CLAUDE.md Language Policy 段對齊；更新 `token-measurement/lessons.md` 過時 L-001；ledger header 加「description language」宣告。

6. **Scope 4 — metadata-completeness drift check（types/lib/services + `prospec-archive.hbs` + tests）**
   - types 加 `metadata-completeness` id；lib 加 collector（掃 `.prospec/changes/*/metadata.yaml`）＋pure evaluator；services `check.service` 佈線；archive Entry Gate 加消費項（FAIL 拒絕入庫，CLI 不在退回直讀）。
   - TDD：evaluator 通過/失敗兩路徑單元測試 + collector 測試 + drift-report id 契約更新（mutation-verified）。

7. **收尾同步（跨 scope）**
   - `prospec agent-sync` 重生成 `.claude/skills/`；`pnpm counts` 重生被計數欄位；受影響模組 README 同步（PB-005，templates/types/lib/services/tests）；全測試綠。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 改名 `readme-counts`→`mcp-readme-counts` 動到凍結的 `DRIFT_CHECK_IDS`／`prospec-report.json` 輸出鍵 | Medium | 內部工具契約；PB-006/007 全站 grep 改齊，drift-report 契約測試釘住新 id 集；archived history 保留舊名（歷史不可變，不追溯） |
| quick 減量誤觸 false-block/false-pass（PB-002 家族，add-scale-adapter 前科） | High | 逐站對照 `_status-lifecycle.md`；quick 樣本 + standard 樣本各跑 verify/archive 計數；not-applicable 維持可見不呈 PASS |
| 儀式降級後 story/task 品質失控 | Medium | 降的是 gate 強制力非資訊本身；INVEST 原則保留於 Constitution；`[M]`/`[V]` kind 標記（有消費者）不動 |
| Constitution `[MUST]` 修訂為治理變更 | Medium | 已獲使用者明確授權（單一 change、兩規則都修）；proposal Constitution Check 記錄；Language Policy 為還原 regression、INVEST 保留原則僅降稽核強制力 |
| metadata-completeness 對 in-progress 變更誤報缺 grade | Medium | grade 規則僅套 verified/archived；欄位存在規則套全體；通過/失敗兩路徑測試釘死邊界 |
| 大 diff 混純文件與程式碼+測試 | Medium | 一顆 atomic-by-feature commit（scope 一致：SDD skill 流程誠實化）；review/verify 全審把關 |

## Constitution Check（site-specific: dependency/layering）

Call Chain 佈線遵守 `cli → services → lib → types`：id/schema→types、collector/evaluator→lib、佈線→services、消費→skill(prompt)。無層級跨越、無 lib→lib 循環、無 commit 前副作用。PASS。
