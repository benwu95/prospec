# freeze-acceptance-evidence — Archive Summary

- **Archived**: 2026-09-20
- **Original Created**: 2026-09-20
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/277

## User Story

讓開發者在 story 完成後凍結 acceptance scenarios，以受控修訂保留歷史；verify 使用固定 context、真實 test_attempt 與逐 REQ 證據，明列漏驗及語意偏離，避免總體 PASS 隱藏缺口。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | High | baseline revision、context、逐 REQ judgment schema |
| lib | High | scenario parser、digest／chain、readiness、coverage floor 與共用 context assessment |
| services | High | freeze/amend、plan/tasks gate、context projection 與 record recheck |
| cli | High | story mutation modes、verify context 及精簡診斷 |
| templates | High | story/ff 凍結時點、verify 固定輸入與共享委派契約 |
| tests | High | unit、contract、integration、e2e 與修復 regression pins |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-TYPES-103 | ADDED | Acceptance baseline revision contract |
| REQ-TYPES-104 | ADDED | Per-requirement judgments and context contract |
| REQ-LIB-084 | ADDED | Acceptance baseline parsing and mutation decisions |
| REQ-LIB-085 | ADDED | Requirement coverage and judgment floor |
| REQ-SERVICES-114 | ADDED | Controlled scenario freeze and amendment |
| REQ-SERVICES-115 | ADDED | Deterministic verification context projection |
| REQ-TEMPLATES-235 | ADDED | Spec compliance fixed inputs and per-REQ evidence |
| REQ-TESTS-123 | ADDED | Frozen acceptance and per-REQ verification regression suite |
| REQ-TEMPLATES-032 | MODIFIED | New-Story Skill INVEST Guidance |
| REQ-TEMPLATES-150 | MODIFIED | metadata.yaml Format Reference |
| REQ-TEMPLATES-155 | MODIFIED | Verify 2/5 and 6 self-verification is a mechanical grade cap |
| REQ-CLI-029 | MODIFIED | `prospec verify record` Grades and Records the Verify Verdict |
| REQ-SERVICES-087 | MODIFIED | `verify record` appends judgment evidence to `verify.md` |
| REQ-CLI-038 | MODIFIED | `verify record` judgment input carries the grading context |
| REQ-TEMPLATES-180 | MODIFIED | One reference defines the delegated-payload contract for both stations |
| REQ-SERVICES-076 | MODIFIED | Plan and Tasks Stations Honour the Forbidden-Artifact Registry |
| REQ-TESTS-072 | MODIFIED | Lifecycle-Contract and Station-Matrix Coverage |
| REQ-TEMPLATES-115 | MODIFIED | verify scale: backfill spec-fidelity scoring contract |

## Completion

- **Tasks**: 28/28 code（100%）；2/2 verification；無未完成 manual task。
- **Acceptance Criteria**: 5/5；18/18 REQ 裁決 PASS。原始 story baseline 未保存，不追認為實作前凍結。
- **Design**: UI scope 為 none，design consistency 為 not-applicable。

## Review & Verify

- **Review**: 累積 10 rounds，14 critical 全 fixed；4 major 中 R277-12 已 fixed，R277-13/15/18 為 advisory。最後 fresh full-lens round 無新增 finding。修復包括 baseline digest／chain、CRLF／清單 parser、context 完整性、path traversal、quick N/A、已知 test failure 與 WARN/FAIL floor。
- **Verify**: Grade A；machine ledger：tasks／Knowledge／tests PASS；judgment ledger：18/18 REQ PASS，但 baseline 缺失令 2/5 aggregate 為 not-adjudicated；Constitution 8/8 PASS；design not-applicable。單一 baseline WARN 使 S 不可達。
- **Tests**: 245 files、6052 passed、4 skipped（6056 total）；coverage lines 97.35%、statements 96.23%、branches 90.45%、functions 98.25%。build、lint、typecheck、counts:check、agents:check 通過；提交後 knowledge:check 確認六模組全部同步。
- **Quality Log**: plan 初輪 FAIL（scope、provenance 與 owner 契約）已補正；tasks 粒度 WARN 保留。Review 曾因新增 finding 比例 53.8% 超過 50% 與輪次上限熔斷，依使用者授權調為 60% 並增加 2 輪；後續修補由接手 agent 完成。三次 verify C 分別揭露 legacy disclosure／priority taxonomy／backfill 契約與測試矩陣缺漏，最後 code-prewrite 測試修正後重新取得 A。歷次 FAIL 未被覆寫。

## Knowledge Update

六模組 README 與 module-map freshness 已同步。封存前修正 lib 公開 API 名稱、types 的 baseline_revision 所屬層，以及 services 的 capture origin 描述。Feature Spec 由 archive 畢業；raw-scan 由 CLI 更新。對應需求數：types 2、lib 2、services 4、cli 2、templates 6、tests 2。

封存後 strict check：22 checks、0 FAIL、1 knowledge-size WARN（容量／headroom 提示）；已無 active change，provenance 在封存前驗證。

Harvest 將四項既有教訓追加本 change 來源：structural false-green、fix-induced same-class defect、schema/reference drift、verify 與 review 的互補。未修改 Playbook／Constitution。Regression pins 的局部行為案例保留 unit/integration；共享 payload reference 的 schema 欄位投影由既有 contract suite 保護。

## Limitations

- quick 2/5 保留 not-applicable，baseline／proposal／test 資訊僅供參考；backfill／legacy 不捏造原始基準。
- 本 change 缺少原始 acceptance baseline，因此 A 不代表已驗證實作前凍結需求；所有適用 REQ 仍各別裁決。
- R277-13（e2e 未確認 implemented transition）、R277-15（quick context 文件的 proposal 敘述）、R277-18（freeze contract 的 section/order 約束）保留為 advisory major，不計入 verify grade。
- Skill 最低 CLI 為 2.3.0，package 尚為 2.2.0；本次依使用者 PB-020 豁免使用 source CLI，不更動版本。
