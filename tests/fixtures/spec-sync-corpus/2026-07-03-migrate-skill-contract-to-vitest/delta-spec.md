# Delta Spec: migrate-skill-contract-to-vitest

## ADDED

### REQ-TESTS-038: 生成契約於 vitest real-temp-dir 執行並進 CI

**Feature:** agent-integration
**Story:** US-1

**Description:**
`verify-skills.sh` 的 28 項(A–G 段)skill / agent-config 生成契約檢查以 vitest 整合測試承接,於真實臨時目錄跑真實 `init` + `agent sync`(真實模板、read-back 產出),並由既有 `test:coverage` 執行(因而納入 `ci.yml`)。

**Acceptance Criteria:**
1. 原 28 項檢查在 vitest 皆有對應斷言,可 bash-section→assertion 逐項對照
2. 測試以 service 層 `execute()` 於 real temp dir 產出、不 mock `template.js`、不依賴 `dist/` 或 spawned CLI
3. `pnpm test:coverage` 執行時該測試被納入;故意破壞任一契約 → 對應斷言 RED

**Priority:** High

---

### REQ-TESTS-039: 計數斷言從單一來源 derive、狀態引用改 named-set 契約

**Feature:** agent-integration
**Story:** US-2

**Description:**
契約測試的計數期望值從單一事實來源 derive,不得寫死字面數字;`status-lifecycle` 引用檢查由 magic integer 改為明列 skill 名的 named-set 契約,對真實 render 比對集合相等;至少一項斷言對真實 filesystem 產出交叉驗證,避免 derived-vs-derived 盲區。

**Acceptance Criteria:**
1. skill 數 derive 自 `SKILL_DEFINITIONS`;per-skill 與總 reference 數 derive 自 reference map(不含 `4`/`1`/`2`/`26` 等寫死字面)
2. `status-lifecycle` 檢查為明列的 skill named-set,對真實 render 比對;集合不符(誤增/減引用)→ RED
3. ≥ 1 項計數斷言經 mutation(改來源)驗證期望值隨動;≥ 1 項對真實產出交叉驗證

**Priority:** High

---

### REQ-AGNT-030: skill→reference map 暴露為可匯入的單一來源

**Feature:** agent-integration
**Story:** US-2

**Description:**
`agent-sync.service.ts` 內的 skill→reference 對應(現為 module-private 的 `getSkillReferences` / `SkillReference` / `referenceMapCache`)暴露為匯出的單一來源,供測試 derive reference 計數,消除計數重複宣告。純新增 export,不改 production 生成行為。

**Acceptance Criteria:**
1. `getSkillReferences`(及必要型別)自 services 匯出,測試可匯入
2. 匯出後生成產出(SKILL.md / references / entry configs)byte 層級不變
3. `skill-generation.test.ts` 殘留的 hardcoded `26` 改由此來源 derive

**Priority:** Medium

---

### REQ-TESTS-040: 移除 bash 契約來源與其文件引用

**Feature:** agent-integration
**Story:** US-3

**Description:**
契約搬入 vitest 後,移除冗餘的 `scripts/verify-skills.sh` 與 `package.json` 的 `verify:skills` script,並同步移除 `README.md` / `README.zh-TW.md` 對它的段落,達成單一 test runner、無 split-brain 契約來源。

**Acceptance Criteria:**
1. `scripts/verify-skills.sh` 與 `package.json` `verify:skills` 皆移除
2. `grep -r "verify:skills"` 與 `"verify-skills.sh"` 全 repo 0 命中(`_lessons-ledger.md` 歷史記錄除外)
3. README ×2 移除該段;受影響的測試計數逐層 `vitest run` 重導並跨 README ×2 + `_index` + tests README 校正一致

**Priority:** Medium

---
