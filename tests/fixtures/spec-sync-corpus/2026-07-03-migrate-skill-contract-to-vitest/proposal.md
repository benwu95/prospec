# Proposal: migrate-skill-contract-to-vitest

## Background

`scripts/verify-skills.sh` 以真實的 `prospec init` + `agent sync` 產出,做 24 項(A–G 段)skill / agent-config 生成契約的端到端檢查,但它**不在 CI**(`ci.yml` / `prospec-check.yml` 皆未執行),只能人工 `pnpm verify:skills`。它又內含多個 hardcoded magic count(archive/ff 各 4 refs、verify 1 ref、review 2 refs、`status-lifecycle` 被 9 個 skill 引用等)。`_lessons-ledger.md` 的 PB-004 已記載這類計數**反覆漂移**(fix-init-clobber 時 8→10)。發 0.4.3 時,PR #51 刻意移除 upgrade skill 的 `status-lifecycle` 列舉後該值應為 9,但 script 仍寫死 10 — 沒有 vitest 覆蓋、又不在 CI,於是每個變更的 `/prospec-verify` 都 grade S、`prospec check` 8/8,red 狀態卻溜到 release commit,直到發版前手動跑才被攔下。

## User Stories

### US-1: 生成契約檢查在 CI 內把關 [P1]

As a prospec 維護者,
I want skill / agent-config 生成契約檢查在 vitest(因而在 CI)內執行,
So that 契約一旦漂移就在 PR 變紅,而不是溜到 release commit。

**Acceptance Scenarios:**

- WHEN 在 PR 上跑 `ci.yml` 的 `test:coverage`,THEN 原 24 項生成契約檢查全部以 vitest 斷言執行並納入結果
- WHEN 任一生成契約被破壞(例:某 skill 少了一個 `references/` 連結、或 `.claude`/`.agents` 鏡像不一致),THEN 對應 vitest 測試失敗、CI 變紅
- WHEN 全數通過,THEN 不再需要人工手動跑 `pnpm verify:skills`

**Independent Test:**
乾淨 checkout 跑 `pnpm test:coverage`,逐項對照原 24 檢查皆有對應斷言;故意刪某 skill 的一個 reference → 對應測試 RED。

### US-2: 計數斷言從單一來源 derive [P1]

As a prospec 維護者,
I want 計數類期望值從單一事實來源 derive 而非寫死,
So that 合法的 skill 集變更不會留下 stale magic number(PB-004 反覆重演的漂移)。

**Acceptance Scenarios:**

- WHEN skill 集合或 references 數量因合法變更而改變,THEN 測試期望值自動反映新值,無需手改字面數字
- WHEN 期望計數與實際生成產出不一致,THEN 測試失敗並指出差異
- WHEN 單一來源本身與模板產出不符,THEN 至少一項斷言能揪出(不淪為 derived-vs-derived 自洽)

**Independent Test:**
在測試中變動來源(如新增一個 skill definition),期望值隨之更新;mutation 竄改實際產出 → 測試 RED。

### US-3: 移除 bash script 與其引用 [P2]

As a prospec 維護者,
I want 搬移完成後移除 `verify-skills.sh` 與 `verify:skills` script 及其文件引用,
So that 只有單一 test runner、無 split-brain 的契約來源。

**Acceptance Scenarios:**

- WHEN 搬移完成,THEN `scripts/verify-skills.sh` 與 `package.json` 的 `verify:skills` 皆移除
- WHEN 檢索全 repo(README ×2、docs、CI)對它的引用,THEN 無殘留 dangling 引用(lessons ledger 的歷史記錄除外)

**Independent Test:**
`grep -r "verify:skills"` 與 `"verify-skills.sh"` 全 repo(排除 `_lessons-ledger.md`)→ 0 命中。

## Edge Cases

- **否定存在性檢查**(no `GEMINI.md` / no `.github/instructions` / no `.codex/skills` / no `.prospec/skills/`):vitest 需在真實 temp dir 對 `init` + `agent sync` 產出斷言(既有 `skill-generation.test.ts` 已在 temp dir 跑,可沿用)。
- **建置依賴**:bash 版在 `dist/` 缺失時自建;vitest 版應直接呼叫 service/lib 層產生待驗證產出,避免綁 build 順序與 CLI dist。
- **derived-vs-derived 盲區**:若期望計數與實際模板產出都源自同一 derive,兩者會互相自洽而失去檢查力 → 至少一項斷言須對「實際 filesystem 產出」交叉驗證。
- **雙鏡像**:部分檢查同時針對 `.claude/` 與 `.agents/` 兩套產出,測試需一併涵蓋。

## Functional Requirements

- **FR-001**: 將 `verify-skills.sh` A–G 段 24 項檢查以等價 vitest 斷言表達(CLAUDE/AGENTS 路徑契約、self-contained knowledge skills、references 生成與解析、convention 檔生成與引用、`base_dir` spec 路徑、`.agents` 收斂與否定存在性)。
- **FR-002**: 計數期望值(4/1/2 refs、`status-lifecycle` 引用 skill 數等)從既有單一來源 derive,不得寫死字面數字。
- **FR-003**: 至少一項斷言對真實生成產出交叉驗證,避免 derived-vs-derived 盲區。
- **FR-004**: 移除 `scripts/verify-skills.sh` 與 `package.json` 的 `verify:skills`;同步移除 `README.md` 與 `README.zh-TW.md` 對它的段落/引用。
- **FR-005**: 契約檢查納入 `ci.yml` 既有 `test:coverage`,不新增獨立 CI step。

## Success Criteria

- **SC-001**: `pnpm test:coverage` 下,原 24 項檢查皆有對應且通過的 vitest 斷言(可逐項對照)。
- **SC-002**: 故意破壞任一契約(刪 reference、竄改 skill 集)→ 對應 vitest 測試 RED。
- **SC-003**: `grep verify:skills` / `verify-skills.sh` 全 repo(排除 lessons ledger)0 殘留。
- **SC-004**: ≥ 1 項計數斷言以來源 derive,經 mutation(改來源)驗證期望值隨動。
- **SC-005**: 覆蓋率仍 ≥ 80%,整體 suite 綠;typecheck + lint clean。

## Related Modules

- **tests**: 契約/整合斷言落點(擴充 `skill-format.test.ts` / `skill-generation.test.ts` 或新檔)。
- **types**: `SKILL_DEFINITIONS` / `INIT_DOC_REGISTRY` / convention registries 作為 derive 計數的候選單一來源。
- **lib**: `filterConventions`、key-exports 等生成 helper,可能提供 derive 用匯出。
- **services**: `init` + `agent-sync` 的實際產出 — 整合測試對象。
- **templates**: 被驗證的 skill / agent-config 模板產出 — 契約標的。

## Open Questions

- [ ] **NEEDS CLARIFICATION**: 計數 derive 的確切單一來源與匯出位置(`types` 的 `SKILL_DEFINITIONS`?`lib` 的 key-exports?)— 於 `/prospec-plan` 定案。
- [ ] **NEEDS CLARIFICATION**: 測試落點 — 擴充既有 `skill-format.test.ts` / `skill-generation.test.ts`,還是新增 contract 檔?— 於 `/prospec-plan` 定案。
- [ ] **NEEDS CLARIFICATION**: 產生待驗證產出的路徑 — 呼叫 service 層還是 CLI dist(影響 build 依賴)?— 於 `/prospec-plan` 定案。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- **[MUST] Test-Driven Development** → **PASS**:本變更即強化測試契約,新增 vitest 先 RED 再 GREEN;需確保每項檢查有對應斷言、覆蓋率 ≥ 80%。
- **[MUST] Atomic Commits by Feature** → **PASS**:可拆為 `test:`(新增 vitest 契約 + derive 來源)→ `chore:`(移除 bash script 與 README 引用)原子提交。
- **[SHOULD] One-way Dependency Direction** → **PASS**:測試位於 `tests`(頂層),derive 來源匯入 `types`/`lib`(下層),方向正確。
- **[SHOULD] User-Facing Documentation Stays Current** → **WARN(需處理)**:`verify:skills` 出現在 `README.md` 與 `README.zh-TW.md`,FR-004 已納入同步移除;實作時未同步則 verify Constitution 稽核會 WARN。

## UI Scope

**Scope:** none
