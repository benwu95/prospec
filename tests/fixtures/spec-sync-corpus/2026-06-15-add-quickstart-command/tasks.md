# Tasks：add-quickstart-command

> 依賴方向 `cli → services → lib → types`：低層先實作。TDD 測試先行（Tests 段 task 與對應 impl 同批 RED→GREEN）。

## Types

- [x] T1 `SkillConfig` 新增 `excludeFromEntryConfig?: boolean` + JSDoc（限自我終結一次性流程）(REQ-TYPES-030) ~10 lines
- [x] T2 `SKILL_DEFINITIONS` 新增 `prospec-quickstart`（type Lifecycle、`excludeFromEntryConfig:true`、`hasReferences:false`）(REQ-TYPES-030) ~12 lines

## Services

- [x] T3 `agent-sync.service` entry-config skill 清單（`templateContext.skills` build 處）加 `filter(s => !s.excludeFromEntryConfig)`；`syncSkillsDirSkills` 維持 iterate 完整 `SKILL_DEFINITIONS` (REQ-AGNT-023) ~10 lines
- [x] T4 新 `quickstart.service.ts` `execute()`：init（catch `AlreadyExistsError`→skipped）+ agent-sync 編排、聚合 per-step 狀態、透傳 hints；不呼叫 knowledge-init (REQ-SERVICES-028) ~70 lines

## CLI

- [x] T5 新 `commands/quickstart.ts` `registerQuickstartCommand`（`--name/--agents/--language` 透傳 init）(REQ-SETUP-017) ~40 lines
- [x] T6 新 `formatters/quickstart-output.ts`：per-step created/skipped + 透傳 hints + 末行「下一步：/prospec-quickstart」(REQ-SETUP-017) ~40 lines
- [x] T7 `index.ts` 註冊 quickstart + 加入 `INIT_COMMANDS`（繞過 preAction config gate）(REQ-SETUP-017) ~8 lines

## Templates

- [x] T8 新 `skills/prospec-quickstart.hbs`：探測 `prospec --version` → 讀 `artifact_language` → 非英文且 `skill_triggers` 空則翻譯/show-confirm/讀回驗證/`agent sync` → `knowledge init` → chain `/prospec-knowledge-generate`；CLI 不可用 graceful fallback；含 `## Output Contract` + `## NEVER`、English-only (REQ-TEMPLATES-108) ~90 lines
- [x] T9 更新 `tests/fixtures/startup-loading-baseline.json` 加 `prospec-quickstart` 載入項 (REQ-TEMPLATES-108) ~15 lines

## Tests

- [x] T10 [P] `skill-format.test.ts` 計數 13→14 + 斷言 `prospec-quickstart` 帶 `excludeFromEntryConfig`/`hasReferences:false` (REQ-TYPES-030) ~20 lines
- [x] T11 `agent-sync` 契約測試（section-scoped、結構感知）：excludeFromEntryConfig skill 不在 entry-config skills context/entry config，但其 `SKILL.md` 仍產出 (REQ-AGNT-023, REQ-TESTS-029) ~40 lines
- [x] T12 [V] mutation-verify：刪除/反向排除 filter 須使 T11 轉紅（PB-001）(REQ-TESTS-029) ~10 lines
- [x] T13 [P] `quickstart.service` 單元測試：fresh-init / re-run-skip(`AlreadyExistsError`) / missing-agents(`PrerequisiteError`) / hints 透傳 (REQ-SERVICES-028) ~80 lines
- [x] T14 quickstart e2e：暫存 dir 跑 `prospec quickstart --agents claude --language en` 斷言檔案 + 下一步字串；重跑斷言 skip (REQ-SETUP-017) ~50 lines

## Docs

- [x] T15 [P] `README.md` + `README.zh-TW.md` 補 `prospec quickstart` 指令 + 由 source 重算計數（skills 13→14、`.hbs` 51→52）(P5 [SHOULD], PB-004) ~40 lines
- [x] T16 [P] 觸碰每個 source 變動模組 README（types/services/cli/templates/tests）+ `_index.md` 計數/描述真實註記（避免 drift knowledge-health stale）(PB-005) ~40 lines
- [x] T17 [P] `_conventions.md` 補 `excludeFromEntryConfig` 一行慣例（entry 排除、仍部署 SKILL.md）(REQ-TYPES-030) ~6 lines

## Manual / Verification

- [x] T18 [M] `pnpm build` && `prospec agent sync` 自我 host：部署本 repo `prospec-quickstart` SKILL.md，確認不入 CLAUDE.md/AGENTS.md ~5 lines
- [x] T19 [V] 全測試綠 + 覆蓋率 ≥ 80%（`pnpm vitest run`）~5 lines

## Summary

- **Total Tasks:** 19（code 16、manual 1、verification 2）
- **Parallelizable Tasks:** 5（T10, T13, T15, T16, T17）
- **Total Estimated Lines:** ~591 lines
