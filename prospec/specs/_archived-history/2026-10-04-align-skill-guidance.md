# align-skill-guidance — Archive Summary

- **Archived**: 2026-10-04
- **Original Created**: 2026-10-04T01:50:00.785Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/326
- **Plan Decision**: option-a (graded_by: in-session)

## User Story

身為依 shipped skills 執行 SDD 的開發者，我希望取得可執行的站點指引、依證據取得 backfill 豁免、理解 review 的部分寫入結果，並從 README 找到完整模組知識，以避免錯誤操作與紀錄誤判。
- US-1：有效 check 操作與 review 輪數設定。
- US-2：proven-backfill 證據、review 拒收與模組追溯。
- US-3：累積 findings、CLI artifact 生成及 WARN 後的部分寫入。
- US-4：README 入口、linked sub-module／supplementary docs 與逐檔預算。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | review merge help 揭露 WARN 與已完成 artifact 寫入留存。 |
| lib | Low | status gate 訊息、station-engines 知識與 regenerated bundle。 |
| services | Low | 核對既有 gate／寫入邊界並同步 Knowledge；演算法不變。 |
| cli | Low | 核對 help 掛載與輸出入口，完成 diff-attributed Knowledge review／freshness。 |
| templates | Medium | 修正 shipped skills／references／init 指引與生成副本。 |
| tests | Medium | scoped guards、反例、失敗注入、15 個 killing mutations 與實測 baseline。 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-086 | MODIFIED | review rounds 接受 1–5、預設 3。 |
| REQ-KNOW-004 | MODIFIED | README 作為連結模組知識的入口。 |
| REQ-KNOW-013 | MODIFIED | 逐檔 loading 範圍與有效 check 操作。 |
| REQ-KNOW-016 | MODIFIED | supplementary docs 納入 L2 量測。 |
| REQ-AGNT-035 | MODIFIED | 指向可於下游執行的預算量測操作。 |
| REQ-TEMPLATES-115 | MODIFIED | backfill fidelity 指引綁定 proven provenance。 |
| REQ-TEMPLATES-116 | MODIFIED | 品質／test 豁免綁定 scale 與 draft。 |
| REQ-TEMPLATES-118 | MODIFIED | promote 保留追溯模組並依 CLI scope 同步。 |
| REQ-TEMPLATES-130 | MODIFIED | 保留 counts／close／baseline 義務並引用 CLI owner。 |
| REQ-TEMPLATES-131 | MODIFIED | verify Entry Gate 指向當前 CLI 拒收與補救。 |
| REQ-SERVICES-100 | MODIFIED | 非 proven backfill 的非 PASS review 拒收。 |
| REQ-TEMPLATES-163 | MODIFIED | station engines 與 artifact generation 由 CLI 擁有。 |
| REQ-SERVICES-098 | MODIFIED | WARN 後失敗保留已完成寫入，無成功輪次紀錄。 |
| REQ-CLI-028 | MODIFIED | clean sentence 的條件是累積表為零列。 |
| REQ-LIB-049 | MODIFIED | 保留 closing marker 後內容；author notes 為 optional。 |
| REQ-LIB-035 | MODIFIED | router 的 verify gate 文案引用當前 owner。 |
| REQ-TYPES-098 | MODIFIED | help 揭露 initial metrics 與後段部分寫入。 |
| REQ-TESTS-034 | MODIFIED | backfill 指引採 scoped、mutation-verified contracts。 |
| REQ-TESTS-043 | MODIFIED | gate contracts 守必要操作及結構。 |
| REQ-TESTS-121 | MODIFIED | 空輸入配 carried rows 的四層 counts 契約。 |
| REQ-SERVICES-086 | MODIFIED | 區分 artifact 寫入前／後的 refusal 邊界。 |

## Completion

- **Tasks**: 20/20 code tasks（100%）；3/3 [V] 完成；T20 [M] 的 handoff 已完成：Knowledge stamp、archive dry-run、US-24／US-6 prose 收斂及 finalize 均有收據；封存 tasks.md 保留 handoff 前的歷史狀態。
- **Acceptance Criteria**: 13/13 frozen scenarios；21/21 MODIFIED REQ。ADDED／REMOVED 均為 0。
- **Spec Graduation**: dry-run 的 15 個 acknowledgedDrops 均為已宣告改寫；沒有 undeclared drops、refused requirements 或 stale declarations。US-24／US-6 prose 於 Phase 3.5 收斂。

## Review & Verify

- **Review**: 3 rounds，0 critical／2 個唯一 major，兩者均 fixed；最後一輪新增 0 critical／0 major。F-326-1 刪除 clean round 手動補句義務；F-326-2 收斂 WARN 後 completed writes 宣稱並補 metadata 並行修改／counts I/O 失敗注入。
- **Verify**: 兩次 fresh-context grade S；最終 task-completion／knowledge／tests／delta-spec-compliance／constitution 全 PASS，design 為 not-applicable；21/21 REQ、13/13 scenarios、8 條 Constitution 規則完成稽核。
- **Tests**: 268 files，6,992 PASS／4 skipped；lines 97.62%。lint、typecheck、counts:check、agents:check 通過；提交後 knowledge:check 實際範圍檢查 PASS（4 個 source-touched modules）。
- **Quality Log**: plan 的 clean-sentence FLAWS 已修正；tasks 的 bundle-before-contract 與 handoff 註記已補；20→21 摘要計數 WARN 已修正；小型文案 task sizing 為已說明的 advisory。review 的兩個 major 已 fixed，最終 verify 無 WARN／FAIL。
- **Limits**: strict 22/22 checks，0 FAIL／1 knowledge-size WARN／0 skipped；42 個既有預算壓力 findings 保留，budgets／ceilings 未提高。遠端 CI 結果由 PR 檢查回報。

## Knowledge Update

- types、cli、lib、services、templates、tests 的 README／linked docs 完成語義檢查，CLI freshness stamp 為 2026-10-04T04:09:46.656Z；沒有未畢 Knowledge sync。
- Knowledge re-check：types 2、lib 2、services 3、cli 1、templates 10、tests 3 個相關 REQ 已反映；同一 REQ 可跨模組反映，數量不作互斥加總。raw-scan 已由 CLI 重掃，product map 的 16 個 active features 與現有索引一致；既有 drift-checks／measure 的 TBD 描述留待作者補充。
- #325 保留 sync／commit 時序議題；#341 移除的 canonical claims registry 不重建；#342 的廣泛負向斷言清理不納入本次。

## Lessons Harvest

- 已由 `learn upsert` 累計 3 項既有教訓，新增 manual-handoff 站點 ownership 教訓；retired 的 duplicated-count key 拒收並保持原計數。沒有 recurring critical 或系統性跳過 [M] 的模式。
- docs/shipped-prose-asserts-engine-behavior 達晉升建議門檻（frequency=3、5 modules），未自動寫入 playbook／Constitution；後續可由 prospec-learn 裁決。
- 新增 template guards 已在既有 permanent contract owners 守完整 shipped renderer 結構；15 個 applied／killed／restored mutation 收據保存在 committed evidence。metadata 並行修改／counts I/O 的 failure pins 留在 service unit owner，沒有另需晉升的 family invariant。
- Review、verify、quality_log、audit-sites 與 mutation receipts 已原樣保存至 `prospec/specs/_archived-history/2026-10-04-align-skill-guidance/`。
