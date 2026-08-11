# Delta Spec: converge-constitution-audit

> 全部路由到 `sdd-workflow`（Constitution 檢查佈局屬 SDD 流程）。REQ-TEMPLATES-133/TESTS-044 為新增（graduate 為新 US）；REQ-CHNG-008/REQ-TEMPLATES-065 為既有 REQ 的 Replace-in-Place。

## ADDED

### REQ-TEMPLATES-133: Constitution 全審收斂到 verify 單站

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
Constitution 的完整分級稽核（every principle）只在 `/prospec-verify` V3/5 一處執行；規劃/執行各站（new-story/plan/tasks/ff/implement）的 Constitution 觸點只檢查該站**站點特定規則**（new-story→INVEST、plan→dependency-direction/layering、tasks→TDD 測試覆蓋、implement→TDD/commit、ff per-phase→該 phase 站點規則），不再做通用「3+ relevant principles」全掃。移除 `prospec-ff` 的「NEVER skip Constitution check at any phase」（與單站收斂矛盾），並移除 archive/design/backfill-spec/promote-backfill/knowledge-update 中載入後未被任何 phase 消費的 Constitution `[STABLE]` 項。Entry Gate 的 constitution-exists 存在性檢查與 verify 全審維持。

**Acceptance Criteria:**
1. 非 verify 的 skill template grep 不到「every principle / full audit / 3+ … principles」全審措辭；verify.hbs 維持全審措辭
2. `prospec-ff.hbs` 不含「NEVER skip Constitution check at any phase」
3. archive/design/backfill-spec/promote-backfill/knowledge-update 無載入後未消費的 Constitution `[STABLE]` 項；new-story/plan/ff 的 constitution-exists Entry Gate 檢查保留
4. 單一 standard/full 變更的 Constitution 全審恰 1 次（verify）

**Priority:** High

---

### REQ-TESTS-044: Constitution 收斂 contract 斷言

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`skill-format.test.ts` section-scoped + mutation-verified 釘住收斂：verify 維持 full-audit 措辭；非 verify 站 negative assertion（無 every-principle/full-audit/3+principles 全審）；`prospec-ff` 無「NEVER skip Constitution check at any phase」；指定 skill 無 orphaned Constitution `[STABLE]` 載入。

**Acceptance Criteria:**
1. 正向：verify 含 full audit；new-story→INVEST、plan→dependency-direction 站點特定措辭存在
2. 負向：非 verify 站無全審措辭、ff 無 NEVER-skip、orphaned 載入清零
3. mutation-verified：移除/還原任一目標措辭 → 對應斷言轉紅

**Priority:** High

---

## MODIFIED

### REQ-CHNG-008: Constitution Injection

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
- WHEN Constitution exists, THEN Planning Skills auto-execute quick check (>= 3 principles)
- WHEN absent, THEN skip

**After:**
- WHEN Constitution exists, THEN each planning skill checks only its **site-specific** rule (new-story→INVEST, plan→dependency-direction/layering, tasks→TDD coverage), NOT a generic ">= 3 principles" scan — the full every-principle audit is `/prospec-verify` V3/5 only (REQ-TEMPLATES-133)
- WHEN absent, THEN skip

**Reason:**
收斂 Constitution 全審到 verify 單站；規劃站的通用 3+ principles spot-check 從未攔下 verify 會漏的問題（01-I2），卻是每站固定成本。

**Priority:** High

---

### REQ-TEMPLATES-065: Exit Gate Folded into Skill-End

**Feature:** sdd-workflow
**Story:** US-12

**Before:**
在 5 skill 既有 Output Contract 的 skill-end 摘要折入 Exit Gate：比對產出 vs Constitution，消費 BL-031 severity（MUST→FAIL/SHOULD→WARN/MAY→資訊性），WARN/FAIL 記入 metadata `quality_log`。

**After:**
非 verify 的 Exit Gate 把「比對整部 Constitution」收窄為該站**站點特定規則**（review→dependency/layering、learn→promotion-approval、new-story→INVEST、plan→dependency-direction、tasks→TDD），仍消費 BL-031 severity 並把 WARN/FAIL 記入 `quality_log`（US-12 跨階段追溯不變）；verify 的 Exit Gate 維持整部 Constitution 全審（唯一全審站，REQ-TEMPLATES-133）。

**Reason:**
Exit Gate 的全 Constitution 重評是重複稽核的一部分（每站一次）；收斂為站點特定範圍即可，quality_log 記錄與 US-12 追溯保留。

**Priority:** Medium

---
