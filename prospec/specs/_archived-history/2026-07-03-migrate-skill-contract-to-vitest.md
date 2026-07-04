# migrate-skill-contract-to-vitest — Archive Summary

- **Archived**: 2026-07-03
- **Original Created**: 2026-07-03
- **Quality Grade**: S

## User Story

身為 prospec 維護者,
我想要 skill / agent-config 生成契約檢查在 vitest(因而在 CI)內執行、計數從單一來源 derive,
以便契約漂移在 PR 就變紅,而非溜到 release commit(如 0.4.3 的 verify-skills.sh `10→9` stale count)。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| tests | High | 新增 `tests/integration/skill-contract.test.ts`(real-temp-dir、真實模板,移植 verify-skills.sh 全部 28 項 A–G 檢查);`skill-generation.test.ts` 殘留 magic number(26/1/2)改 derive |
| services | Low | `agent-sync.service.ts` 匯出 `getSkillReferences` + `SkillReference`(reference 計數單一來源;生成產出 byte-identical) |
| (repo) | Medium | 刪除 `scripts/verify-skills.sh` + `package.json` `verify:skills`;README ×2 移除 verify:skills 段並重導計數 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TESTS-038 | ADDED | 28 項 A–G 生成契約於 vitest real-temp-dir 執行,納入 CI `test:coverage` |
| REQ-TESTS-039 | ADDED | 計數自單一來源 derive;status-lifecycle 改 named-set 契約 vs 真實 render;≥1 real-fs 交叉驗證 |
| REQ-TESTS-040 | ADDED | 移除 bash 契約來源 + `verify:skills` + 文件引用;計數跨 4 份文件重導 |
| REQ-AGNT-030 | ADDED | skill→reference map 匯出為單一來源(byte-identical) |

## Completion

- **Tasks**: 10/10 code tasks (100%) + 2 `[V]` done
- **Acceptance Criteria**: 全部達成(SC-001~005);mutation-verify(M1/M2 證 E4 named-set + F1、M3 證 C/D/G 計數皆有 teeth,非 derived-vs-derived 自洽)

## Review & Verify

- **Review**: review-clean（0 critical / 0 major；3 nit：2 修、1 有理由駁回）——含 `skill-generation.test.ts` 殘留 ref 計數（26/1/2 magic number）未 derive（nit 已修，ledger docs/duplicated-count-drift 第 18 度）
- **Verify**: Grade S；78 檔 / 1,860 test 全綠（新契約測試 20 cases）、coverage 96.6% lines、`prospec check` 8/8（0 fail / 0 warn）、typecheck + lint clean
- **Quality Log**: follow-up 1（e2e `prospec --help` 滿載下偶發 5s timeout，入 quality_log，建議調高 testTimeout）
- **Source**: summary 內文（`## Quality`）+ _lessons-ledger

## Quality

- 78 檔 / 1,860 test 全綠(新契約測試 20 cases);coverage **96.6% lines**
- `prospec check` 8/8,0 fail / 0 warn(`readme-counts` 驗證計數同步、`import-direction` 依賴方向合規)
- review-clean(0 critical / 0 major;3 nit:2 修、1 有理由駁回);typecheck + lint clean

## Knowledge Update

已於 archive Entry Gate 同步:
- `prospec/ai-knowledge/modules/tests/README.md` — 新增 skill-contract.test.ts 條目 + 計數(78 檔 / 1,860)
- `prospec/ai-knowledge/modules/services/README.md` — getSkillReferences 匯出為單一來源(REQ-AGNT-030)
- `prospec/index.md` — tests 模組計數與契約描述

## Notes

- Follow-up(非本變更):`tests/e2e/cli.test.ts` 的 `prospec --help` 在滿載下偶發 5s timeout(單獨跑 263ms 通過),建議調高 `testTimeout` — 已入 quality_log,適合走 `/prospec-learn`。
- `agent-integration.md` 已達 515 行(超過 300 行 guideline),本變更再加 US-437 — 未來可考慮拆分。
