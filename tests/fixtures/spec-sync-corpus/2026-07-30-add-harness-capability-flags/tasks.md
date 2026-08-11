# Tasks: add-harness-capability-flags

**Input**: Design documents from `.prospec/changes/add-harness-capability-flags/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

> TDD 順序：先做 Tests 區的 T12–T17（RED），再回頭做 Types/Lib/Templates/Services。分層標題是架構分組，不是執行順序。

---

## Types

- [x] T1 定義 `HarnessCapabilities`（`canSpawnSubagent`/`canWorktree`/`canBackground`）與 `AgentConfig.capabilities` 必填欄位（REQ-TYPES-071 AC1）~25 lines
- [x] T2 填入四個 agent 的能力值，逐項附來源＋查證日期註記（survey 2026-07-30；claude 獨有 `canWorktree: true`）（AC2/AC4）~30 lines
- [x] T3 實作 `intersectCapabilities(configs)` — 逐旗標 AND，空輸入行為明確（AC3）~20 lines

## Lib

- [x] T4 `lib/template.ts` `ensureBuiltinPartials()` 註冊 `harness-capabilities` partial（REQ-TEMPLATES-167 AC1）~5 lines

## Templates

- [x] T5 新增 `src/templates/skills/_harness-capabilities.hbs`：machine-greppable 能力宣告行 ＋ `can_spawn_subagent` 分支 ＋ `degraded_action` 參數 ＋「絕不靜默跳過、必須揭露」底線；`true` 分支帶 runtime 失敗回退（AC2/AC3/AC4）~20 lines
- [x] T6 改寫 `prospec-review.hbs` `### Harness Degradation` 為 partial include，散文只留 review 自己的降級動作；同步檢視 NEVER 與 Error Handling 兩處措辭（REQ-TEMPLATES-066）~15 lines
- [x] T7 改寫 `prospec-verify.hbs` 2/5 harness 段落為同一 partial（第二消費者）；維度 6 保留指向 2/5 的交叉引用，不新增第三份（REQ-TEMPLATES-155）~15 lines
- [x] T8 掃描其餘 15 個 skill 模板，確認無殘留的 harness 能力自判散文（PB-007 平行站點掃描）~5 lines

## Services

- [x] T9 `agent-sync.service.ts` 分組結構改存群組全部 `AgentConfig`，以 `intersectCapabilities` 求值（REQ-AGNT-038 AC2）~25 lines
- [x] T10 將能力展開為 `can_spawn_subagent`/`can_worktree`/`can_background` render keys 注入 `syncAgent` → `syncSkillsDirSkills` 的 skill render context（AC1；未知 agent 的既有 `continue` 守衛不變，AC4）~30 lines

## Tests

- [x] T11 更新 `tests/contract/skill-format.test.ts` 的 `TEMPLATE_CONTEXT` 加入三個旗標，避免既有斷言落到 false 分支 ~10 lines
- [x] T12 [RED] contract：`prospec-review` 兩分支各自 section-scoped 斷言（false 分支直述降級、true 分支含 runtime 回退）（REQ-TESTS-063 AC2）~40 lines
- [x] T13 [RED] contract：能力值不同的兩個 agent 渲染同一 skill，內容必須相異（REQ-AGNT-038 AC3）~25 lines
- [x] T14 [RED] contract：repo-wide 負向斷言——`src/templates/skills/**` 不得出現能力自判句式（AC3）~20 lines
- [x] T15 [RED] contract：partial 單一來源＋部署 SKILL.md 展開位元同步（沿用既有 partial 測試模式）~25 lines
- [x] T16 [RED] unit：`intersectCapabilities` 對逐旗標不一致輸入回傳 AND（AC1）~30 lines
- [x] T17 [RED] unit：`agent-sync` 對共用輸出群組注入交集值，而非任一成員值 ~35 lines
- [x] T18 改寫既有 `degrades on harnesses without sub-agents`（review）與 `requires fresh context for 2/5 and 6`（verify）兩案，改為旗標語意斷言 ~25 lines
- [x] T19 [V] mutation-verify T12–T17 每個新斷言類別：刪除/破壞被斷言特徵須變紅（PB-001）~0 lines

## Deploy & Sync

- [x] T20 [M] `pnpm bundle` 後 `npx tsx src/cli/index.ts agent sync` 重新部署（templates pitfall：`pnpm exec prospec` 會部署已發行模板）~0 lines
- [x] T21 [M] `pnpm counts` 重導 `.hbs`／partial 計數（65→66、6→7）~0 lines
- [x] T22 同步 types/lib/services/templates/tests 五個 module README 的 API 與計數描述 ~25 lines
- [x] T23 [V] `pnpm test` 與 `pnpm typecheck` 全綠（tests/ 亦納入 typecheck）~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 23 |
| Code tasks | 18 |
| `[M]` / `[V]` tasks | 2 / 3 |
| Estimated lines | ~455 lines |

---

## Notes

- 分層標題為架構分組；實際執行以 TDD 為序（Tests RED → Types → Lib → Templates → Services → 部署同步）
- [M]/[V] 不計入 verify 的完成率分母（kind schema 見 tasks-format reference）
- T20 的兩步序列不可簡化——單跑 `agent sync` 會用到未更新的 bundled template
