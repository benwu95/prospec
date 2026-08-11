# Delta Spec: quick-scale-and-ceremony-cleanup

## MODIFIED

### REQ-TEMPLATES-134: verify 對 quick 真 scale-aware 減量

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
`/prospec-verify` 對 `scale: quick` 僅把 2/5（delta-spec compliance）轉 not-applicable，Startup Loading 與報告格式與 standard 相同；`NEVER skip any verification dimension` 不分 scale。

**After:**
quick 走 scale-aware 分支：Startup Loading 略去 quick 無的 plan/delta-spec/feature-spec 對照項、報告收斂；`NEVER skip` 措辭明列 quick/backfill 的 not-applicable 轉義為合法例外。被略維度仍以 `not-applicable` 呈現、絕不呈 PASS。

**Reason:** quick 現況只在規劃端減量，verify 機器與 standard 等重——ceremony 未除只是延後。對齊 backfill 的 scale-aware 範本。

**Priority:** High

---

### REQ-TEMPLATES-135: archive 對 quick 不比 standard 淨加重

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
`/prospec-archive` 對 quick 於全部 phase 外，額外執行 Entry Gate 的 spec-impact LLM 判定與 diff-path 模組推導兩個 quick 專屬步驟——quick 的 archive 嚴格比 standard 重。

**After:**
quick 的 spec 影響定位為「scale 於 tasks 時已知」的一次性判定、不在 archive 才重算 diff；quick 於 archive 的必經淨步驟數不超過 standard。

**Reason:** ceremony 被搬到 archive 時點而非移除；驗收要求 quick 步驟數實質少於 standard。

**Priority:** High

---

### REQ-TEMPLATES-136: `[P]`／`~lines` 由必填 gate 欄位降為選填

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
`/prospec-tasks` 強制每 task 標 `~{lines}` 並在 Phase 4 強制標 `[P]`，二者出現在 Phase Gate／Failure Condition／NEVER 的必填語境，但無任何 skill/service 機制性消費。

**After:**
`[P]` 與 `~lines` 降為選填（移出 Gate／Failure／NEVER 必填語境）；有機制性消費者的 `[M]`/`[V]` kind 標記保留不動。

**Reason:** 21 案例零消費證據；儀式無下游消費者。

**Priority:** Medium

---

### REQ-TEMPLATES-137: 逐條 INVEST 稽核降 advisory，Constitution 保留原則

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
`/prospec-new-story` Phase 6 逐條 INVEST 稽核為硬 Phase Gate（NEVER「未經 INVEST 檢查不得完成 Story」）；Constitution INVEST `[MUST]` 的 **Verify** 條款要求「new-story 與 verify 逐條檢查六準則，不合規者於進 Plan 前改寫或拆分」。21/21 PASS 零攔截。

**After:**
new-story Phase 6 的逐條稽核降為 advisory（surface、不 hard-block），對應鬆綁其 Phase Gate 與 NEVER；Constitution INVEST **維持 `[MUST]` 與六準則表不變**，僅改寫 **Verify** 條款使 new-story 的逐條檢查為 advisory（verify 的整體全審仍可對真正違反 INVEST 的 Story 判 FAIL——原則權威不減）。

**Reason:** 零攔截的逐條 gate 為純儀式；保留原則（[MUST] 不動）的品質導引與 verify 全審權威，僅去除 new-story 端無效的硬 gate。

**Priority:** Medium

---

### REQ-TEMPLATES-139: Knowledge Quality Gate 表五處去重

**Feature:** sdd-workflow
**Story:** US-3

**Before:**
new-story/plan/tasks/implement/verify 各載近乎相同的 Knowledge Quality Gate 表；前四站 WARN「不 block」，僅 verify 影響評級。

**After:**
前四站收斂為一行 pass/warn 註記（記入 quality_log）；完整表僅留 verify。資訊量不減。

**Reason:** 五份重複、僅一份有 gate 力；固定儀式塊冗餘。

**Priority:** Medium

---

### REQ-TEMPLATES-140: implement／verify commit 語意統一

**Feature:** sdd-workflow
**Story:** US-3

**Before:**
implement「NEVER commit during implement」與 verify 的 checkpoint-commit 讓步括號（"If the change was large enough to checkpoint-commit during implement …"）矛盾——同時禁止又預期。

**After:**
移除 verify 的 checkpoint-commit 讓步括號，對齊 implement 單一規則：commit boundary = verify S/A。

**Reason:** 兩站對「implement 期間可否 commit」給出互斥指示，agent 只能臆測。

**Priority:** Medium

---

### REQ-TYPES-054: `readme-counts` 改名為 `mcp-readme-counts`（名實相符）

**Feature:** drift-detection
**Story:** US-3

**Before:**
drift check id `readme-counts`（`DRIFT_CHECK_IDS`）實際僅檢查單一 MCP 句型（`registers N resources + M tools`），名稱誤導 agent 以為所有 README counts 皆機檢。

**After:**
id 改名 `mcp-readme-counts`＋更新註解點明 MCP-specific 範圍；collector/evaluator/type 名同步；全引用點（templates review-lens、知識庫 index/README、drift-detection feature spec、測試）一併改齊。id 集維持數量、archived history 保留舊名不追溯。

**Reason:** 名不符實遮蔽 counts 執法真空；「名實相符」為驗收目標。

**Priority:** Medium

---

### REQ-TEMPLATES-141: Constitution Language Policy 還原豁免 AI Knowledge

**Feature:** ai-knowledge
**Story:** US-3

**Before:**
commit `0d35f85` 後 Language Policy `[MUST]` 把 AI Knowledge 納入 zh-TW 要求，但知識庫（index/module READMEs/_conventions）全英文——verify Constitution 稽核會拿專案打自己臉；三方（Constitution／知識庫／CLAUDE.md）矛盾。

**After:**
Constitution Language Policy Description/Verify 還原豁免 AI Knowledge（回 0d35f85 前語意）；`.prospec/changes/` 文件仍 zh-TW。checklist/quality-standards、CLAUDE.md、`token-measurement/lessons.md` L-001、ledger header 三方對齊。

**Reason:** scope 翻轉為 regression；還原對齊現狀英文知識庫與 review 慣例。

**Priority:** High

---

## ADDED

### REQ-TEMPLATES-138: `_status-lifecycle.md` 明文化 design 的 lifecycle 定位

**Feature:** design-phase
**Story:** US-2

**Description:**
在 `prospec/ai-knowledge/_status-lifecycle.md` 加入 design 的定位說明，使 resume/verify V6 有明確依據。

**Acceptance Criteria:**
1. `_status-lifecycle.md` 含一行：design 無 status、僅在 `ui_scope != none` 時介入、位於 plan 與 tasks 之間。
2. 說明與 verify V6 skip 條件（`ui_scope: none` 或無 design-spec）一致，不矛盾。

**Priority:** Low

---

### REQ-LIB-025: `metadata-completeness` drift check ＋ archive Entry Gate 消費

**Feature:** drift-detection
**Story:** US-4

**Description:**
新增 FAIL-class drift check `metadata-completeness`，比照 `review-provenance` 佈線（types id → lib collector 掃 `.prospec/changes/*/metadata.yaml` → lib pure evaluator → services check.service），archive Entry Gate 以 `prospec check` 機檢消費（CLI 不在時退回直讀該 change metadata）。

**Acceptance Criteria:**
1. change 缺 `name`/`created_at`/`status`/`scale` → 該 check FAIL 並列出缺項；欄位完整 → PASS。
2. `status: verified` 但 `quality_log` 無 verify grade（S/A）→ FAIL；in-progress（story/plan/tasks/implemented）不套 grade 規則（不 false-block）。
3. archive Entry Gate 於該 check FAIL 時拒絕入庫並指出缺項。
4. 單元測試覆蓋通過/失敗兩路徑（mutation-verified）；drift-report id 契約測試更新（9→10 id）。

**Priority:** High

---
