# route-playbook-by-station — Archive Summary

- **Archived**: 2026-09-27
- **Original Created**: 2026-09-27
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/301

- **Plan Decision**: option-a (graded_by: in-session)

## User Story

開發者可依作業站讀取共享教訓正文，同時保留完整 active 目錄與按 id 查閱；維護者可看到超長條目的警告，並在逐條核可後精簡已機械化教訓。plan／implement 自動採用站別讀取，既有模組／id 與全未宣告書冊保持相容。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | Medium | CLI help 與合法站名契約 |
| lib | High | 共用站名切詞、站別解析／選取、完整 entry token 量測 |
| services | High | selector 驗證、active diagnostics 與 fallback |
| cli | High | --station、完整目錄、獨立正文選取與 stderr 警告 |
| templates | High | 兩站 Startup Loading、Sweep 與 compact form |
| tests | High | unit／contract／e2e、literal oracle 與 mutation 驗證 |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-LIB-094 | MODIFIED | station 宣告、正文選取與 300-token advisory cap |
| REQ-SERVICES-123 | MODIFIED | station selector、diagnostics 與 legacy fallback |
| REQ-CLI-059 | MODIFIED | --station 及 stdout／stderr 相容性 |
| REQ-TEMPLATES-071 | MODIFIED | plan／implement 第六項依站載入 |
| REQ-TEMPLATES-072 | MODIFIED | 宣告、cap、機械化精簡及逐條核可 |
| REQ-TEMPLATES-174 | MODIFIED | Sweep cleanup 與未覆蓋條款保全 |
| REQ-TESTS-024 | MODIFIED | 站別、大小邊界、相容、成本與治理契約 |

## Completion

- **Code Tasks**: 21/21（100%）；Manual 1/1；Verification 2/2。
- **Acceptance Criteria**: 11/11 frozen scenarios；7/7 REQs。
- 21/21 active 條目具站別宣告，8 條 mechanized 條目完成核可精簡；verify 追加的六條 before/after 已於 2026-09-28（Asia/Taipei）獲使用者核可。
- 同版完整 Playbook 為 8965 tokens；10 站實測輸出 1107–6368 tokens，目錄均有 21 條；相較同版全文減少約 28–88%，不裁切正文。

## Review & Verify

- **Review**: 2 rounds，0 critical／2 advisory major（仍為 proposed）。R1-M1：all wildcard 缺少能抓到分支刪除的行為測試；R1-M2：公開文件契約使用固定 1800 字元視窗，未依 heading 邊界隔離。最終 fresh full-lens review 無新增 finding。
- **Verify**: 最終 Grade S、fresh-subagent；machine task-completion／knowledge／tests 全 PASS，judgment delta-spec-compliance（7/7）與 Constitution（8/8）PASS，design not-applicable。
- **Tests**: 260 files，6609 passed／4 skipped；lines 97.52%、statements 96.42%、functions 98.48%、branches 90.76%。build、lint、typecheck、counts:check、agents:check 均 exit 0。
- **Quality Log**: plan 首輪 FAIL：原契約與 station 模式衝突、遺漏既有解析保證，修正後 PASS。兩輪 review WARN 均為上述兩項 advisory major。首輪 verify C：Sweep 治理條款漏載、compact body 留有已覆蓋 Guidance、fallback 缺獨立 literal stdout oracle；修正、mutation 驗證及重新獨立審查後為 S。
- **Limitations**: prospec check --strict 無 FAIL，knowledge-size 保留 advisory WARN；review 的兩項測試品質建議不影響 verify grade，亦未宣稱已修正。
- **Post-commit gate**: 功能提交後（最終為 3f6f9c2，補上條列式 commit body）已執行 knowledge:check，六個來源模組全部通過；先前空 commit range 的 skip 已由此實際檢查取代。

## Knowledge Update

六模組 README 與相關子頁已同步並由 CLI stamp；types（help 契約）、lib（1 REQ）、services（1 REQ）、cli（1 REQ）、templates（3 REQs）、tests（1 REQ）均已反映最終行為。正式規格在本次 archive 畢業，來源與規格責任分離。

## Harvest

本次 quality_log 的 plan FAIL、verify C 與 review WARN 經 keyed upsert 累積至 ledger；不自動晉升共享規則。永久證據：[review.md](./2026-09-27-route-playbook-by-station/review.md)、[verify.md](./2026-09-27-route-playbook-by-station/verify.md)。新增 regression pins 中，Sweep 治理保全已於兩份 reference 的既有 contract 守衛；fallback literal oracle 保留於 E2E，compact 條款保留於 repo 專屬 contract，無待晉升的跨家族新 invariant。
