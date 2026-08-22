# add-landing-fidelity-check — Archive Summary

- **Archived**: 2026-08-22
- **Original Created**: 2026-08-22
- **Quality Grade**: S
- **Issue**: #202

## User Story

As a 執行 SDD 工作流的 prospec 開發者,
I want 未宣告的落地區塊 bullet drop 在每次 `prospec check` 就被回報,
So that 我在 feature commit 之前就攔到保真度遺失，而非等到 archive 這道 commit 後的最後閘門。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | 新 `landing-fidelity.ts`（`assessDrops` ＋ delta-spec 解析器單一來源）；`drift-sources` collector；`drift-checker` evaluator ＋ dispatch |
| types | Medium | `DRIFT_CHECK_IDS` 追加 `delta-spec-landing-fidelity`（18→19，frozen-additive） |
| services | Medium | `archive.service` 的 `droppedFor` 改呼叫共用 `assessDrops`（行為 byte-identical）；`check.service` 接入 collector |
| tests | Medium | evaluator／collector／共用實作 parity 迴歸測試 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-061 | ADDED | Delta-Spec Landing Fidelity Check——第 19 個 drift check，與 archive 寫入路徑共用同一份比對 |

## Completion

- **Tasks**: 13/13 code（100%）；另 1 [M]、2 [V] 皆完成
- **Acceptance Criteria**: proposal US-1／US-2／US-3 全數覆蓋

## Review & Verify

- **Review**: 2 round(s)、0 critical／2 major——皆為 18→19 計數掃描漏的「N verdicts」off-by-one 散文（`drift-engine.md:40`、collector 新註解），已於同輪修正並標記 resolved；迴圈第一輪即收斂（0 未解 critical）
- **Verify**: Grade **S**——machine：1/5 task-completion · 4/5 knowledge · 5/5 tests 全 PASS；judgment：2/5 delta-spec-compliance · 3/5 constitution（8 rules）PASS，6 design not-applicable；`pnpm test` exit 0（4101 passed）
- **Quality Log**: no WARN/FAIL（review PASS、verify PASS grade S）

## Knowledge Update

- 已同步：`modules/lib/README.md`（46→47 files ＋ landing-fidelity single-source Pitfall）、`modules/lib/drift-engine.md`、`modules/types/frozen-registries.md`（18→19）、雙語 README 列舉、`drift-report-format.hbs` ＋ 4 份 deployed
