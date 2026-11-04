# preserve-artifact-roundtrips — Archive Summary

- **Archived**: 2026-11-04
- **Original Created**: 2026-11-03T09:35:02.169Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/444
- **Plan Decision**: option-a (graded_by: human)

## User Story

作為維護 SDD change 的開發者，需要 metadata 與 review repro 跨 station／round 保留未被操作取代的資料與原始命令，避免 nested extras 消失或 shell 語意改變。

## Affected Modules

| Module | Impact | Description |
| --- | --- | --- |
| types | High | 可擴充 read views、modeled reserved-key 拒收、獨立 build views與 narrow premise schema |
| lib | High | 局部 metadata 更新保留 unknown nodes；alias target preflight；Repro JSON codec |
| services | Medium | 保留既有 publication 順序並揭露 alias 拒收時的 partial outcome |
| cli | Low | 雙語公開文件說明 encoded artifact 與原始 command digest |
| templates | Medium | metadata／review／delegated evidence 契約與生成部署同步 |
| tests | High | projection／writer／service／CLI／legacy／refusal 各自驗收 |

## Requirements

| REQ ID | Status | Description |
| --- | --- | --- |
| REQ-TYPES-064 | MODIFIED | Metadata 逐層 preserve／refuse／closed 契約 |
| REQ-LIB-031 | MODIFIED | Validated readers、partial updates與 snapshot replacement 邊界 |
| REQ-TESTS-055 | MODIFIED | Metadata projection／writer 與拒收 bytes 的獨立回歸 |
| REQ-LIB-081 | MODIFIED | Same-round counts 保留未知 YAML nodes，移除省略 modeled fields |
| REQ-LIB-050 | MODIFIED | Repro (JSON) 精確往返、legacy reader與 cumulative evidence |
| REQ-CLI-028 | MODIFIED | 原始命令 digest、canonical 欄位與 malformed artifact 拒收 |
| REQ-TEMPLATES-067 | MODIFIED | Review 格式與 storage／payload 分工 |
| REQ-TEMPLATES-150 | MODIFIED | Metadata 保留、拒收、替換與 additive defaults 說明 |
| REQ-TESTS-082 | MODIFIED | 合法命令、stdout、legacy、carry-forward與拒收驗收 |

## Completion

- **Tasks**: code 19/19（100%）；verification reminders 3/3。
- **Acceptance Criteria**: 6/6 frozen scenarios，baseline revision 1；9/9 REQ 通過。

## Review & Verify

- **Review**: 2 rounds、1 critical／0 major，無未解 finding。R1-ALIAS-BINDING：刪除 modeled anchor 可使 retained alias 改綁到較早的同名 anchor，造成 B→A；獨立 verifier confirmed，更新前 preflight 拒收，R2 八個 lenses 零新 finding。
- **Regression Pins**: scalar／nested／key anchors、同名 fallback、later alias及安全移除 controls；helper＋service 222/222。隔離 mutation 移除 preflight 使五個 pins RED；還原後 helper 78/78 GREEN。
- **Verify**: Grade S；machine tasks／Knowledge／tests PASS；fresh judgment delta-spec／Constitution PASS，8/8 principles；design not-applicable（UI Scope none）。
- **Tests**: Vitest 4.0.18、Node 24.20.0、macOS，全套 342 files；9392 passed＋4 skipped／9396，0 failed。coverage statements 16240/16762（96.88%）、branches 11472/12458（92.08%）、functions 2892/2915（99.21%）、lines 13973/14235（98.15%）。
- **Quality Log**: plan 曾 WARN（不存在的 call-chain symbol）與 FLAWS（ZodPipe 的 object-only API caller 漏列），tasks 曾 FLAWS（[V] 任務承擔 code fixes）；均已修訂並取得後續 PASS。Review R1 WARN 的 alias critical 已獨立確認、修正及釘住。
- **Gates**: lint／typecheck／build／counts／agents／strict exit 0；strict 23/23、0 fail、1 既有 knowledge-size WARN。Feature commit 後 knowledge:check 以實際 commit range確認 5/5 source-touched modules。

## Knowledge Update

types／lib／services／cli／templates／tests 共 6/6 documented、digest-match；五個 README 與 lib/station-engines 說明已更新，services 僅需 freshness stamp。metadata reference 3958/4000 tokens，reference 總和 52247/52315、mandatory context 90999/91150，未提高 ceilings。

## Limitations

- Modeled metadata own __proto__ 拒收；opaque unknown values／raw test_policy 不遞迴檢查，closed retry／policy adjudication 保持原契約。
- 新 Repro (JSON) artifacts 需支援該欄名的 CLI builds；legacy reader 保留，歷史已遺失資料無法復原。
- Retained alias 指向被取代 nodes 時拒收 metadata update；若 review artifact 已依原順序發布，錯誤揭露其 partial state，不自動回復。
- 原始 baseline 與 regression 證據保留於完整 bundle；未提升既有 token／coverage ceilings，未將既有 Knowledge 尺寸問題併入本 change。

## Archive Convergence

九項 REQ 已由 CLI 落地並窄讀核對；六項 declared rewrites 已確認，無 pending convergence／undeclared drops／refused requirements／stale declarations。Story context 與 service 的 table-placement 引用對齊格式 owner；product Feature Map 與 counters 已 finalize。raw-scan 由 CLI 更新。Archive harvest 累積四項 ledger occurrences（新增一項、既有三項），未自動晉升；alias structural pins 留作後續 contract promotion 候選。
