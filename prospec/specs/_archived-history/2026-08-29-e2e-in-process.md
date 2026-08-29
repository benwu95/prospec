# e2e-in-process — Archive Summary

- **Archived**: 2026-08-29
- **Original Created**: 2026-08-29
- **Quality Grade**: S
- **Issue**: 225

## User Story

作為 prospec 開發者／CI，我想要 cli e2e 測試在同一行程內以 `createProgram().parseAsync` 執行並依指令群切檔，以便移除每測試一次 node 冷啟動、縮短測試 wall-clock 並利平行與定位。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| cli | Low | 抽 `createProgram`＋`runProgram` 到 `src/cli/program.ts`；`index.ts` 退成薄 shebang entry（純重構、CLI 行為不變） |
| tests | High | `cli.test.ts` in-process 化＋切 6 檔＋共用 `helpers/run-cli.ts`＋新增 5 真子行程 smoke |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| — | — | 無需求增刪改：純重構＋測試基礎設施，零產品可觀察行為變更；delta-spec 刻意為空（理由見 quality_log 的 plan WARN），架構事實由 knowledge-update 更新模組 README |

## Completion

- **Tasks**: 9/9 code (100%)；`[M]`×2、`[V]`×3 皆完成
- **Acceptance Criteria**: 5/5 — AC-1 `tests/e2e/**` 17.8s ≤30s／AC-2 128 tests＋5 smoke（≥109）／AC-3 亂序全綠＋console 還原已 pin／AC-4 計數五面同步／AC-5 全 gate 綠

## Review & Verify

- **Review**: 1 round, 0 critical / 1 major（fresh-subagent）— F-1（test-quality）：隔離測試未斷言 `console.*` 還原，已修並 mutation-verified（fail-then-pass）
- **Verify**: Grade S — 1/5·4/5·5/5 machine PASS、2/5·3/5 judgment PASS（fresh-subagent）、6 design not-applicable；`pnpm test` exit 0（4365 passed）
- **Quality Log**: plan WARN（刻意空 delta-spec 之理由）；review PASS；verify PASS grade S — 無 FAIL

## Knowledge Update

已於 verify S/A commit 同步（feature commit `702b447`）：
- `prospec/ai-knowledge/modules/cli/README.md`（`program.ts` 抽出、index.ts 薄 entry）
- `prospec/ai-knowledge/modules/tests/README.md`（e2e in-process 切檔＋子行程 smoke）
