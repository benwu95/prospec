# Plan: migrate-skill-contract-to-vitest

## Overview

`scripts/verify-skills.sh` 以真實 `init` + `agent sync` 產出做 24 項生成契約檢查,但不在 CI、又含 hardcoded magic count(PB-004 反覆記載其漂移;0.4.3 的 10→9 red 溜到 release commit)。本計畫把這些檢查搬進 vitest 的 real-temp-dir 整合測試(納入既有 `test:coverage`,自動進 CI),計數從單一來源 derive,並移除 bash script 與兩份 README 引用。

策略上沿用專案既有的 **real-temp-dir 模式**(`archive-feature-map` / `check.service` / `knowledge-reader` 測試:不 mock `node:fs`、直接 render 真實模板、對真實檔案系統 read-back)。這是唯一能忠實承接 verify-skills.sh「grep 真實產出」語意的層級 — memfs-mock 版(`skill-generation.test.ts`)因 mock 掉 `template.js` 無法斷言真實內容。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| tests | 4-layer 測試套件(vitest + memfs / real-temp-dir) | `vitest run`;real-temp-dir 模式 | all |
| services | agent-sync 生成 SKILL.md + references + entry configs | `agent-sync.execute()`、`getSkillReferences`(現為 module-private) | types, lib |
| types | skill 定義單一來源 | `SKILL_DEFINITIONS`(`src/types/skill.ts`) | — |
| templates | 被驗證的 skill/agent-config 模板產出 | 9 個 skill `.hbs` 直接內嵌 `_status-lifecycle.md` | — |

### Existing Patterns (from _conventions.md / tests README)
- Contract 測試用**真實 `renderTemplate()`**(不 mock);整合測試多用 memfs,但需真實模板產出者改用 real temp dir(fast-glob/git 不見 memfs)。
- 計數斷言應 derive:`skill-generation.test.ts` 已用 `SKILL_DEFINITIONS.length`,但仍殘留 hardcoded `26`(line 75)—— 同一 anti-pattern,一併根治。
- 新斷言必 mutation-verify(PB-001:section-scoped + structure-aware,避免 false-green)。

### Architecture Constraints (from Constitution)
- 依賴方向 `cli → services → lib → types`;`tests` 位於頂層,可匯入任一層(匯入 services 的 `getSkillReferences` 不違規)。
- TDD:每項檢查有對應斷言,覆蓋率 ≥ 80%。
- User-Facing Documentation [SHOULD]:`verify:skills` 寫在 README ×2,移除須同步。

## Affected Modules
| Module | Impact | Changes |
|--------|--------|---------|
| tests | High | 新增 `tests/integration/skill-contract.test.ts`(real temp dir);修 `skill-generation.test.ts` 的 `26` |
| services | Medium | 匯出 reference map 單一來源(`getSkillReferences` / `SkillReference`) |
| (repo root) | Medium | 刪 `scripts/verify-skills.sh`、`package.json` `verify:skills`;README ×2 同步 |

## Call Chain

```
tests/integration/skill-contract.test.ts  (real temp dir, real templates)
  → initService.execute({ cwd: tmp, agents: [claude, antigravity, codex, copilot] })
  → agentSyncService.execute({ cwd: tmp })          [renders SKILL.md + references + entry configs → tmp fs]
  → fs.readFileSync/readdirSync(tmp/...)            [A–G 段內容/存在性斷言]
  ├─ SKILL_DEFINITIONS.length                       [derived skill count — types/skill]
  ├─ getSkillReferences(name).length / Σ            [derived reference counts — services/agent-sync]
  └─ EXPECTED_STATUS_LIFECYCLE_SKILLS (named set)   [status-lifecycle 契約 vs 真實 render,非 magic int]
```

- 單一 entry point(測試驅動的 init + agent sync 產出),層級 `tests → services → templates(render)`,方向合規。
- 至少一項斷言對真實 filesystem 產出交叉驗證(FR-003),避免 derived-vs-derived 盲區。

## Implementation Steps

1. **暴露 reference map 為單一來源**(services)
   - 將 `getSkillReferences`(與 `SkillReference`)自 `agent-sync.service.ts` 匯出,供測試 derive per-skill 與總計數;production 行為不變(純新增 export)。
2. **新增 `tests/integration/skill-contract.test.ts`**(tests,real temp dir、真實模板)
   - 以 `mkdtemp` 建臨時 project,跑真實 `init` + `agent-sync` `execute()`,對產出檔樹逐段(A–G)斷言。
   - 計數 derive:skill 數 ← `SKILL_DEFINITIONS`;reference 數(archive/ff 4、verify 1、review 2、總計)← `getSkillReferences`。
   - `status-lifecycle` 改為 **named-set 契約**(明列 9 個 skill 名),對真實 render 比對集合相等 —— drift 變紅、集合自我說明,無 magic int。
   - 每項 mutation-verify(PB-001)。
3. **根治殘留 magic number**:`skill-generation.test.ts:75` 的 `26` 改為由 reference map derive。
4. **移除 bash 契約來源**:刪 `scripts/verify-skills.sh` 與 `package.json` `verify:skills`。
5. **同步 user-facing docs**:移除/改寫 `README.md` + `README.zh-TW.md` 的 `verify:skills` 段落(FR-004、Constitution SHOULD);清除任何 dangling 引用。
6. **重導計數 + 綠燈驗證**:逐層 `vitest run` 重導 tests README/badge 計數(+新增檔、+新斷言);跑 `test:coverage` + `prospec check` + typecheck + lint 全綠(SC-005)。

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| status-lifecycle 淪為 derived-vs-derived 自洽、失去檢查力 | High | 用**明列 named-set** 對**真實 render** 比對(非自 render 反推的整數);skill 誤增/減 ref → 集合不等 → RED |
| 24 項在翻譯中漏搬 | High | 建 bash-section→vitest-assertion 1:1 對照(SC-001 逐項);mutation-verify 防 false-green |
| README 計數再漂移(PB-004 重演) | Medium | 逐層 `vitest run` 重導,勿照抄 sibling doc;README ×2 + `_index` + tests README 全數校正 |
| real-temp-dir 測試慢/未清理 | Low | 沿用 `archive-feature-map`/`check.service` 模式(`mkdtemp` + `afterEach` rm);單次 init+sync 產出跨斷言複用 |
| reference map 由 services 匯出、測試跨層匯入 | Low | `tests` 為頂層、depends_on all,方向合規;僅新增 export 無 production 行為變更 |

## Knowledge Quality Gate
- Context mode:**Brownfield**(6 模組 README)— PASS
- Module Knowledge loaded:tests / types README + `_conventions.md` + agent-sync/skill.ts 原始碼 — PASS
- Technical Summary synthesized:PASS
- Feature Specs checked:agent-integration(生成契約歸屬)— PASS
