# add-req-id-uniqueness-check — Archive Summary

- **Archived**: 2026-08-28
- **Original Created**: 2026-08-28
- **Quality Grade**: S
- **Issue**: #220

## User Story

作為 prospec maintainer，承接 PR #218「衍生 issue」：(US-1) 新增 FAIL-class `req-id-uniqueness` drift check，使跨 feature 的 REQ id 撞號無法悄悄進入信任區；(US-2) 一次修正信任區既有的 13 組跨 feature REQ id 撞號，使每個 id 穩定識別單一需求。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `drift-report`：`DRIFT_CHECK_IDS` append `req-id-uniqueness`（凍結、僅 append）＋ `DriftCheckInputs` 欄 |
| lib | High | `drift-sources` location-aware collector `collectReqIdUniqueness`；`drift-checker` evaluator `evaluateReqIdUniqueness`（≥2 定義位置即 FAIL、列 path:line (feature)） |
| services | Medium | `check` 接 collector 進 runChecks；`auto-draft` SCALE_BY_CHECK 加新 id |
| cli | Low | `formatters/measure-output` 註解 REQ ref 隨 renumber 更新 |
| templates | Low | `drift-report-format.hbs` id 清單＋描述段（bundle＋deployed 同步） |
| tests | Medium | drift-sources／drift-checker／drift-report 覆蓋新 check（FAIL/PASS/skip、mutation-verify） |
| 信任區（直接編修） | High | 8 feature spec 重編號 13 組撞號（heading＋Change History，含 `~` range／compound 改寫） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-068 | ADDED | REQ id uniqueness drift check（≥2 定義位置 FAIL，列全部定義 source_path:line；features 缺席 skip） |

（13 組撞號重編號為純 id rename 維運，直接信任區編修、不經 delta-spec。）

## Completion

- **Tasks**: 11/11 code tasks（100%）；[M] 1、[V] 2 皆完成
- **Acceptance Criteria**: US-1/US-2 各 AC 均達成（verify 2/5 PASS）

## Review & Verify

- **Review**: 2 round(s)、**2 critical + 1 major（皆修復）**——B-1/B-2（renumber sweep 漏掉 `~` range 內的 REQ-MEASURE-001~007、REQ-TEMPLATES-040~045）、B-3（evaluator site-vs-feature 措辭＋unused `feature` 欄）；獨立 fresh-context reviewer，修復後全 repo range sweep 歸零、mutation-verified
- **Verify**: Grade **S** — 1/5 PASS · 2/5 PASS(fresh) · 3/5 PASS(8/8 rules) · 4/5 PASS · 5/5 PASS · 6 n/a；`pnpm test` exit 0（4,335 tests、4,331 passed／4 skipped）；`req-id-uniqueness`／`req-references`／`spec-counters` 皆 PASS（源碼 CLI 驗證，安裝版無此 check）
- **Quality Log**: new-story PASS；plan WARN（架構驗證 Dim3 WARN：`req-references` 扁平盲點→引用掃描擴全 repo、含 3 處 code/test ref，已修）；tasks WARN（degraded 單一上下文，已揭露）；review R1 WARN(2 crit+1 major)→R2 PASS；verify S

## Knowledge Update

已同步：`types`／`lib`／`services`／`cli`／`templates`／`tests` 模組 README 反映最終狀態（drift-engine.md／frozen-registries.md 的 check 計數 19→20），freshness 已 stamp、`knowledge:check` 綠。
