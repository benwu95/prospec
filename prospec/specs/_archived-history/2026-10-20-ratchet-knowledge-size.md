# ratchet-knowledge-size — Archive Summary

- **Archived**: 2026-10-20
- **Original Created**: 2026-10-19T05:31:30.222Z
- **Quality Grade**: S
- **Issue**: #401
- **Plan Decision**: plan (graded_by: human)

## User Story

As a 在 CI 用 `prospec check --strict` 守門的專案維護者,
I want 一個 change 讓已超標（或新超標）的 L1/L2 知識檔變大時，knowledge-size 回報 FAIL,
So that 知識檔不能再默默成長，而現有的超量不必在一次 change 內還清。

另有兩個配套 story：未設定 ratchet 時行為完全不變（升級不會讓下游 CI 轉紅）；base 無法解析時明確 FAIL 並說明修正方式，不會默默放行。三個 story 在 Feature Spec 合併為 drift-detection 的 US-23。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `knowledge.size_ratchet` config、finding 的 `base_commit`／`base_actual`／`ratchet_skipped` 欄位、`KNOWLEDGE_SIZE_RULES` 的 `ratchet` 旗標 |
| lib | High | `collectKnowledgeSize` 解析 merge-base 並以 `git cat-file --filters` 量測基準；`evaluateKnowledgeSize` 依 token／行數分別評 ratchet |
| cli | Medium | `prospec check` 的分組輸出正確顯示 FAIL 與 merge-base commit |
| services | Low | 無程式變更；`check.service` 經 `assessCurrentDrift` 帶入 ratchet |
| templates | Medium | config example、drift-report-format、knowledge-loading-rules 說明 ratchet |
| tests | Medium | unit、contract 與真實 git repo 的 integration test |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-117 | ADDED | knowledge.size_ratchet config and the ratchet finding fields |
| REQ-LIB-107 | ADDED | knowledge-size ratchet against the merge-base |
| REQ-TEMPLATES-255 | ADDED | the ratchet is documented where users configure and read it |
| REQ-TESTS-142 | ADDED | knowledge-size ratchet tests |
| REQ-TYPES-060 | MODIFIED | Drift Report knowledge-size Check Id |
| REQ-TYPES-077 | MODIFIED | KNOWLEDGE_SIZE_RULES — one registry binding kind, budget and remedy |
| REQ-LIB-027 | MODIFIED | knowledge-size Collector + Evaluator |
| REQ-SERVICES-065 | MODIFIED | check.service injects the knowledge-size collector |
| REQ-TYPES-083 | MODIFIED | knowledge-size structured finding field |
| REQ-CLI-011 | MODIFIED | `prospec check` command |
| REQ-LIB-054 | MODIFIED | knowledge-size evaluator emits structured fields |
| REQ-TYPES-069 | MODIFIED | Per-project knowledge budget override, declared not silent |

ADDED 的四條在 archive 後移入新 slice `prospec/specs/features/drift-detection/us-23.md`（US-23）；`us-8.md` 的 story 與兩個 scenario 補上「US-23 ratchet 下成長會 FAIL」。

## Completion

- **Tasks**: 21/21 (100%), 3/3 [M]/[V] (not counted)
- **Acceptance Criteria**: 7/7（verify 2/5 grader 判定 7 個 frozen scenario 都沒有語意偏離）

## Review & Verify

- **Review**: 3 round(s)，0 critical / 2 major — R-8（只有行數超標的 L2 檔沒有測試守住）與 R-9（文件缺 delegation snapshot 的 base 說明）皆在 round 2 修正並驗證；R-8 的 pin 經 M-lines mutation 驗證會轉紅。仍開著的 minor：R-5、R-6、R-10～R-14（含 R-14：knowledge-update step 3a 沒涵蓋「已超標又成長」）。第 3 輪是 Knowledge freshness stamp 後的重新進入，review-clean。
- **Verify**: Grade S（兩次，Knowledge 同步後重新評一次），task-completion／knowledge／tests PASS，delta-spec-compliance PASS（12/12 REQ），constitution PASS（8/8 rules），design not-applicable；全套 321 files／8516 tests 綠燈（Node 22.23.3，與 CI 相同）。grader 以 source 版 CLI 實測 `check --strict`：本 repo exit 0，讓超標 README 變大 exit 1，base 為 `no-such-ref`／`-x` exit 1。
- **Quality Log**: plan FAIL ×1（formatter 會把 ratchet FAIL 印成 warn → cli 加入範圍）、plan WARN ×4；tasks FAIL ×1（reference ceiling anchor）、tasks WARN ×1；implement WARN ×2（T14 簽核後修改 delta-spec 措辭；測試以 `VITEST_MAX_WORKERS=4` 記錄）；review WARN ×3（其中一筆記載 R-8／R-9 與 Node 22 執行環境，兩筆未附 warning）。

## Notes

- Node 25.2.1 的 `fs.rmSync` 刪不掉懸空 symlink，使 `tests/unit/lib/delegation-checkpoint.test.ts` 的 T-6 pin 在 Node 25 失敗，與本 change 無關；`package.json` 的 `engines`（`>=22.13.0`）涵蓋 Node 25，建議另開 issue。
- 本機 Jamf Protect／Spotlight 高負載曾讓全套測試超時（status-router-rules、work-preservation），等負載下降後重跑皆綠。
- `lib/README.md:29` 說 `withFixedGitEnv` 包住 drift-sources 的 git 讀取，實際並未使用；是既有的不精確描述，非本 change 引入。

## Knowledge Update

types、lib、templates、tests、services、cli 的 README 已確認沒有因本 change 變成錯誤的陳述，並以 `prospec knowledge verify` 更新 `last_verified`。這些 README 都已超出 L2 預算，在 ratchet 下不能直接變大；若要補 ratchet 的 Pitfall，需先抽出 sub-module。
