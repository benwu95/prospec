# Tasks：完成 capability → feature 術語遷移收尾

> TDD 順序：T1 先紅 → Templates/Services/Docs 轉綠 → T10 最終驗證。
> 完成率只計 code 任務；`[V]`/`[M]` 任務另計、不入分母。

## Tests

- [x] T1 新增 guard 斷言：render 全部 skill 模板斷言不含 `specs/capabilities/`；`references/` 不含 `capability-spec-format.hbs`（**已驗 RED → GREEN**，PB-001 mutation-verified） ~20 lines
- [x] T2 `skill-format.test.ts`：自 `REFERENCE_TEMPLATES` 移除 `'capability-spec-format.hbs'`、移除整個 `describe('Capability spec format structure')` 區塊（3 個 it）；保留 `Feature Spec Sync, not Capability Spec Sync` 等 migration-enforcing 斷言 ~34 lines
- [x] T3 `startup-loading-baseline.json`：`prospec-new-story.items` 內 `{{base_dir}}/specs/capabilities/` → `{{base_dir}}/specs/features/`（字母排序位置不變、contiguity 維持） ~2 lines

## Templates

- [x] T4 `git rm src/templates/skills/references/capability-spec-format.hbs`（孤兒檔，REQ-TEMPLATES-031 REMOVED-completion；references 19→18） ~delete
- [x] T5 `prospec-new-story.hbs`：`:22` `[DYNAMIC]` 路徑 `specs/capabilities/` → `specs/features/` 並「existing capability specs」→「existing feature specs」；`:144` 表格「Capability specs reviewed / No capability specs found」→ Feature specs ~4 lines
- [x] T6 [P] `prospec-archive.hbs:3` description「sync requirements to capability specs」→「feature specs」 ~1 line
- [x] T7 [P] `prospec-implement.hbs:152`「capability spec inconsistency」→「Feature Spec inconsistency」 ~1 line

## Services

- [x] T8 [P] `mcp.service.ts:192` resource `description`「Capability spec (REQ source of truth)…」→「Feature spec (REQ source of truth)…」 ~1 line

## Docs

- [x] T9 [P] `README.md` + `README.zh-TW.md`：(a) MCP 表格 `spec://feature/{name}` 描述「Capability specs」→「Feature specs」；(b) **PB-004 count sync（實作期新增）**——目錄樹 `.hbs` 52→51、reference 模板 19→18；測試計數 badge/「Run all tests」/「Test Coverage」1041→1039、Contract 471→469（per-layer 經 `pnpm vitest run tests/contract` = 469 重新導出） ~16 lines

## Verification

- [x] T10 [V] `pnpm test` 全綠（52 files / 1039 tests）；`pnpm run typecheck` + `pnpm run lint` 乾淨；SC-001（無 `specs/capabilities/`|`capability-spec-format` 現行引用）、SC-003（檔不存在）、SC-004（無 `Capability spec` 用語）grep 皆 clean

## Deploy（follow-up，非 git-tracked）

- [ ] T11 [M] `prospec agent sync` 重新部署 skill 模板至本機 `.claude/skills/` + `.agents/skills/`（目前 untracked、仍帶舊用語；不入 commit diff，屬環境刷新）

## Summary

- **Total Tasks:** 11（code 9 + verification 1 + manual 1）
- **Parallelizable Tasks:** 4（T6/T7/T8/T9）
- **Total Estimated Lines:** ~80 lines（不含刪檔）
- **Scope 偏移記錄：** 實作期依 PB-004 補上 root README 計數同步（`.hbs`/reference/test counts）——折入 T9，未擴大檔案集合；`_index.md`/module README 計數依 PB-004/PB-005 走 `/prospec-archive` knowledge sync，不在本批。
