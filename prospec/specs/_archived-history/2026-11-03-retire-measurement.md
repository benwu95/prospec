# retire-measurement — Archive Summary

- **Archived**: 2026-11-03
- **Original Created**: 2026-11-03
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/442
- **Plan Decision**: option-a (graded_by: human)

## User Story

作為 Prospec 維護者與 CLI 整合開發者，完整移除 Measure 產品面，保留仍被呼叫的 token/cost 能力，使 CLI、文件與現行規格一致。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | High | 退休 measurement schemas/error，保留 numeric accounting interfaces。 |
| lib | High | 保留四個 token/cost exports；刪除退休 helpers。 |
| services | High | 刪除 Measure service；既有 finalize 支援 deprecated 零計數與後置 product refresh。 |
| cli | High | 移除 Measure command/formatter；保留 unknown-command 拒收。 |
| templates | Medium | 同步 archive Skill/reference、bundle 與部署副本。 |
| tests | High | 退休專屬 suites/corpus，補存續與 finalize regression。 |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-CLI-064 | ADDED | Retired measurement surface |
| REQ-LIB-108 | ADDED | Shared token estimation and cost accounting |
| REQ-TESTS-146 | ADDED | Measurement retirement regression closure |
| REQ-DOCS-001 | MODIFIED | Standalone Binary Installation Documentation |
| REQ-SPEC-013 | MODIFIED | Product Spec Feature Map Sync |
| REQ-CLI-024 | MODIFIED | `prospec archive` command with dry-run preview and post-judgment `finalize` |
| REQ-SERVICES-071 | MODIFIED | archive.service dry-run mode and refusal reporting |
| REQ-TEMPLATES-159 | MODIFIED | archive skill delegates deterministic mutations to the CLI |
| REQ-TEMPLATES-175 | MODIFIED | Archive skill Phase 3.6 states the preservation contract |
| REQ-SERVICES-080 | MODIFIED | The product.md sync reports why it declined |
| REQ-CLI-033 | MODIFIED | archive prints a declined product.md sync to stderr |
| REQ-MEASURE-001 | REMOVED | Version-controlled task-description corpus (live-reference assembly) |
| REQ-MEASURE-002 | REMOVED | Token Usage Reporting |
| REQ-MEASURE-003 | REMOVED | Deterministic cost-calculation pure functions |
| REQ-MEASURE-004 | REMOVED | Measurement-report schema and snapshot identity |
| REQ-MEASURE-005 | REMOVED | `prospec measure` read-only report display |
| REQ-MEASURE-006 | REMOVED | Local Session Log Parsing |
| REQ-MEASURE-007 | REMOVED | Theoretical Baseline Estimation |
| REQ-MEASURE-008 | REMOVED | before/after comparison procedure |
| REQ-MEASURE-009 | REMOVED | glossary assembly variant and cost comparison |
| REQ-MEASURE-010 | REMOVED | Offline size-report schema |
| REQ-MEASURE-011 | REMOVED | harness offline size production (no API key) |
| REQ-MEASURE-012 | REMOVED | `prospec measure --offline` read-only size display |
| REQ-MEASURE-013 | REMOVED | Per-Change Context Projection Mode |
| REQ-MEASURE-014 | REMOVED | Three-assembly benchmark runner |
| REQ-MEASURE-015 | REMOVED | Honesty-boundary constraints |
| REQ-MEASURE-016 | REMOVED | Multi-provider coverage |

## Completion

- **Tasks**: 19/19 code tasks（100%）；T21 為 post-archive 驗證提醒。
- **Acceptance Criteria**: 5/5；包含規格退休、歷史保留與 post-commit Knowledge gate。
- **Delivery**: feature commit `89995cc4`；#446 維持獨立，無 compatibility wrapper；未發版。

## Review & Verify

- **Review**: 1 round，0 critical / 0 major，fresh context，review-clean；ticket receive 通過。
- **Verify**: Grade A；machine 三維 PASS，REQ 27/27 已裁定，Constitution 8/8 已覆蓋，design not-applicable。
- **Tests**: Node v24.20.0／darwin；335/335 files，9143 passed、4 skipped、0 failed（9147 inventory）。Lines 13839/14103（98.12%）；其餘 coverage 均 ≥80%。
- **Quality Log**: plan r1 WARN 的 slice 完整性與 symlink referent 風險已由 r2 PASS、負向 fixtures 與獨立 review 收斂；verify 的兩 WARN 均因 committed-range Knowledge gate 尚待 commit，現已由 feature commit 後 `knowledge:check` PASS 補齊；保留原始 A verdict 與完整 quality_log。
- **Standing Gates**: lint、typecheck、build、完整 coverage、counts:check、agents:check、committed-range knowledge:check、source strict check 全部 exit0；strict 的既有 knowledge-size WARN 保留。

## Knowledge Update

六個 module README、相關 supplements、index/module-map 已同步並由 CLI stamp；digest-match 6/6。CLI 分類的反映 REQ 數：types 18、lib 19、services 20、cli 21、templates 20、tests 19（REMOVED 以移除描述反映）。machine counts 為335files／9147tests。

## Archive Outcome

初次 product sync 成功；語意畢業後，finalize 將 measure／token-measurement 設為 body-derived 0/0，standalone-binary 為3/11、workflow-evaluation 為1/6，並刷新14項active product entries；沒有 refusal／decline，人工內容保留。

27/27 REQ 可解析；11/11 active Spec bodies 與frozen delta一致，16/16 retired原始body保留。既有archive／history／replay corpus共6066files的digest不變。raw-scan-only刷新1904files；T21 post-archive驗證完成，tasks checkbox保留封存時快照。Harvest記錄兩項plan風險與既有Knowledge教訓的一次新出現，僅累積、未promotion。
