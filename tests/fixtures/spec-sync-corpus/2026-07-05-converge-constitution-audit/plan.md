# Plan: converge-constitution-audit

## Overview

把 Constitution 的完整分級稽核從散佈 ≥7 站收斂到 `/prospec-verify` V3/5 單站。手法純為 skill template（`.hbs`）措辭編輯 + 契約測試更新——無 src code 變更。每個規劃/執行站的 Constitution 觸點改為只檢查**站點特定規則**（該站真正擁有的原則），非 verify 的 Exit Gate 把「比對整部 Constitution」收窄為站點特定規則（保留 `quality_log` 記錄、不動 US-12 跨階段追溯），並移除 orphaned `[STABLE]` Constitution 載入與 ff 的「NEVER skip Constitution check at any phase」。

關鍵不變式（**本輪停在 tasks，implement 前確認**）：verify V3/5 是**唯一**的 every-principle 全審——收斂是把「重複全審」降為「站點特定引用」，不是移除任何工程紀律；Entry Gate 的 constitution-exists 存在性檢查與 Exit Gate 的 quality_log 記錄都保留。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| templates | skill 模板（.hbs）——各站 Constitution 段落 | `prospec-{new-story,plan,tasks,ff,implement,archive,verify,review,learn,design,backfill-spec,promote-backfill,knowledge-update}.hbs` | — |
| tests | skill-format 契約（section-scoped + mutation-verified） | `tests/contract/skill-format.test.ts` | all |

### Existing Patterns (from _conventions.md)

- skill 變更改 `.hbs`（`.claude/skills/` 為生成物），由 `prospec agent sync` 重新部署
- 契約測試 section-scoped、對穩定 token 斷言、mutation-verified（PB-001，本 repo 已內聯）
- Exit Gate (Constitution) 折入各 skill Output Contract 尾（US-12 / REQ-TEMPLATES-065），記 `quality_log`
- 全審唯一定位：verify「Key Difference from Other Skills」明載「Other Skills only perform spot checks / Verify performs full audit」——本變更把「spot check」進一步收窄為「site-specific rule」

### Architecture Constraints (from Constitution)

- 本變更收斂的正是 Constitution 檢查佈局；不減任何工程紀律（verify 全審維持）
- 文件 zh-TW、code/commit 英文；契約測試 TDD

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| templates | High | 各站 Constitution 觸點降站點特定；verify 維持全審；orphaned `[STABLE]` 載入清理；ff NEVER-skip 移除 |
| tests | Medium | `skill-format.test.ts` 收斂後 gate 措辭斷言 + negative assertion（非 verify 站不全審） |

## Constitution-Touch Convergence Map（收斂前 → 收斂後）

```
new-story  Phase 6「3+ relevant principles」 → 站點特定：INVEST；Exit Gate → INVEST 範圍（記 quality_log）
plan       Phase 6「3+ principles + layering」 → 站點特定：dependency-direction/layering；Exit Gate → 同
tasks      Phase 6「test coverage」（已窄） → 維持（TDD/coverage 為其站點規則）；Exit Gate → TDD 範圍
ff         Phase 2/3 Constitution check → per-phase 站點特定；移除 L139「NEVER skip Constitution check at any phase」；Exit Gate → 站點特定
implement  Phase 4「Constitution compliance」bullet → 站點特定：TDD/commit（無 Exit Gate，維持）
archive    移除「prepare Constitution spot check」orphaned [STABLE] 載入（無 phase 消費）；Entry Gate 知識同步不動
review     Exit Gate → 站點特定：dependency/layering（spec-architecture lens 已為站點特定）；[STABLE] 載入保留（供 dependency 規則）
learn      Exit Gate → 站點特定：promotion-approval（learn 的 Constitution 是晉升目標非稽核）；[STABLE] 載入保留（晉升目標）
verify     維持唯一全審（V3/5 every principle）；明載「sole full audit，其餘站點特定」
design / backfill-spec / promote-backfill / knowledge-update  移除未消費的 Constitution [STABLE] 載入
```

## Implementation Steps

1. **verify 錨定唯一全審**
   - `prospec-verify.hbs`：於「Key Difference / Verification 3/5」明載 verify 為**唯一** Constitution 全分級稽核、其餘站只做站點特定檢查（收斂的權威來源句）；全審機制本身不動

2. **規劃站降站點特定（new-story / plan / tasks / ff）**
   - `prospec-new-story.hbs` Phase 6 + Exit Gate → INVEST（該站站點規則）；Phase 6 標題/gate 措辭去除「3+ relevant principles」
   - `prospec-plan.hbs` Phase 6 + Exit Gate → dependency-direction/layering（保留 Call Chain layering 檢查，那本就是站點特定）
   - `prospec-tasks.hbs` Phase 6（已為 test-coverage）確認為站點特定、Exit Gate 同範圍
   - `prospec-ff.hbs` Phase 2/3 Constitution check → per-phase 站點特定；**移除 L139「NEVER skip Constitution check at any phase」**；Exit Gate 收窄

3. **執行站降站點特定（implement）**
   - `prospec-implement.hbs` Phase 4「Constitution compliance」→ 站點特定 TDD/commit 檢查（不通用全掃）

4. **非 verify Exit Gate 收窄範圍（review / learn）**
   - `prospec-review.hbs` / `prospec-learn.hbs` Exit Gate：把「比對整部 Constitution / 消費 BL-031 severity 全評」收窄為站點特定規則（review→dependency/layering、learn→promotion-approval），**保留 quality_log 記錄**（US-12 不動）

5. **清理 orphaned [STABLE] Constitution 載入**
   - `prospec-archive.hbs`：移除「prepare Constitution spot check」載入（無對應 phase）
   - `prospec-design.hbs` / `prospec-backfill-spec.hbs` / `prospec-promote-backfill.hbs` / `prospec-knowledge-update.hbs`：移除載入後從未消費的 Constitution `[STABLE]` 項（保留 Entry Gate 的 constitution-exists 存在性檢查，若有）

6. **契約測試更新**
   - `tests/contract/skill-format.test.ts`：更新既有 gate 斷言反映收斂；新增 **negative assertion**——非 verify 站不含「every principle / full audit / 3+ … principles」全審措辭、ff 不含「NEVER skip Constitution check at any phase」、verify 仍含 full audit；orphaned 載入清零；section-scoped + mutation-verified

7. **build + agent sync**
   - `pnpm build` 後 `prospec agent sync` 重新部署 `.claude/skills/` 與 `.agents/skills/`（生成物）

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 「站點特定」措辭與既有 REQ-TEMPLATES-063/065 契約衝突 | High | delta-spec MODIFY REQ-CHNG-008/REQ-TEMPLATES-065、ADD REQ-TEMPLATES-133 明載收斂；contract 同步更新；本輪停 tasks 供確認 |
| 誤刪仍被消費的 Constitution 載入（如 review/learn 實際用到） | Medium | 逐 skill 判定：review（dependency 規則）、learn（晉升目標）**保留**載入；只刪 design/backfill-spec/promote-backfill/knowledge-update/archive 的未消費載入；contract negative assertion 釘住 |
| 收斂被誤解為「移除工程紀律」 | Medium | verify V3/5 全審維持為唯一權威；plan/delta-spec 明載「降重複、非降紀律」；SC-002 斷言 verify 仍全審 |
| 與 Change A 的模板重疊（review/verify/implement） | Medium | B 建於 A branch 之上；B 編輯 Constitution 段落（Phase 6 / Exit Gate 範圍 / orphaned 載入），與 A 的 Entry Gate/NEVER/lens 區段錯開 |
| Exit Gate 措辭收窄卻仍需記 quality_log | Low | 明載「範圍收窄、記錄保留」；US-12（REQ-TEMPLATES-065）跨階段追溯不移除 |
| verify 瘦身可能誤刪與 review 重疊的正確性判斷 | Low | scope 3 只收斂 Constitution 佈局；verify 的 2/5/4/5 維度不動（那是 delta-spec/knowledge，非 Constitution） |

## Constitution Check (Phase 6 — site-specific, 示範收斂)

- **[SHOULD] One-way Dependency Direction**（本站點特定規則）— N/A：template + 契約測試，無 src 依賴
- 本 plan 的 Constitution check 即示範站點特定（plan 站查 dependency-direction），非全審——與本變更目標自洽
- verify 屆時仍會對本變更做全審（收斂後的唯一全審站）
