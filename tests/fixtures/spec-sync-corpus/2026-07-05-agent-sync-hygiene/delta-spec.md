# Delta Spec：agent-config sync 衛生

## ADDED

### REQ-AGNT-031: Skill Description Single Source

**Feature:** agent-integration
**Story:** US-1

**Description:**
`skill.ts` SKILL_DEFINITIONS `description` 是每個 skill 描述的單一來源。`agent-sync` 每-skill render context 傳入 `skill_description`（escaped），skill `.hbs` frontmatter 渲染 `{{skill_description}}`（不硬編）。CLAUDE.md/AGENTS.md registry 與各 SKILL.md frontmatter 由同一來源生成。

**Acceptance Criteria:**
1. 生成的 SKILL.md frontmatter description 逐字等於 skill.ts 的 `description`
2. registry 與 frontmatter 對同一 skill 的 description 相同（equivalence contract test，mutation-verified）
3. verify description 反映現行 5+1 維

**Priority:** High

---

### REQ-AGNT-032: Agent-Sync Orphan Sweep

**Feature:** agent-integration
**Story:** US-2

**Description:**
`agent-sync` 生成後掃 `.claude/skills`/`.agents/skills` 下 `prospec-*` 目錄，移除不在 `SKILL_DEFINITIONS` 者（更名/移除的舊 skill）；非 `prospec-` 前綴目錄一律保留；移除項於結果報告。

**Acceptance Criteria:**
1. `prospec-<gone>` 目錄不在當前清單 → 被移除
2. user 自建非 prospec 目錄 → 保留
3. 移除項出現在 sync 結果/輸出

**Priority:** High

---

### REQ-AGNT-033: Collision-Free Trigger Baselines

**Feature:** agent-integration
**Story:** US-3

**Description:**
baseline 觸發詞（skill.ts）無跨 skill substring 或 exact-dup 碰撞，且移除與 CLI 指令同名的泛用詞（check/change）。本專案 `.prospec.yaml` 中文觸發詞一併套用同款解法。

**Acceptance Criteria:**
1. 防碰撞 contract test 對 baseline 觸發詞回報 0 violation（跨 skill substring + exact-dup）
2. 每 skill 保留主觸發詞且 ≥3 詞
3. skill.ts + .prospec.yaml + 生成物一致

**Priority:** High

---

### REQ-TESTS-046: Agent-Sync Hygiene Contract

**Feature:** agent-integration
**Story:** US-1

**Description:**
契約/單元測試釘住三項：description 等價性（registry↔frontmatter，per skill）、orphan sweep（移除 orphan + 保留 user skill）、trigger 防碰撞（0 violation）。全部 mutation-verified。

**Acceptance Criteria:**
1. 改壞任一（description 漂移／sweep 誤刪或漏刪／新增碰撞）→ 對應斷言轉紅
2. sweep 測試含 user-skill 保留 case

**Priority:** High

---

## Spec Impact（graduation 備註）

- types/services/templates module README 於 verify S/A commit 同步（single-source render context、sweep、trigger baseline 調整）；agent-integration REQ 於 archive Phase 3.5 graduate。
