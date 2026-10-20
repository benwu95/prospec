# configure-test-timeout — Archive Summary

- **Archived**: 2026-10-20
- **Original Created**: 2026-10-20T09:42:33.689Z
- **Quality Grade**: A
- **Plan Decision**: plan (graded_by: human)

## User Story

- **US-1 [P0]**：As a 測試套件執行時間較長的專案維護者，I want 在 `.prospec.yaml` 的 `tech_stack.test_timeout_ms` 指定 `check --record-tests` 的測試執行上限，So that 超過預設 15 分鐘的測試也能完整跑完並記錄 passed／failed 的 test provenance。

前提：`check --record-tests` 的上限寫死為 `DEFAULT_TEST_TIMEOUT_MS`（900000 ms），`check.service` 呼叫 runner 時未傳上限；一個下游專案（匿名）的 test_attempt 記錄 `timed out after 900000 ms`。開發者決定不開 issue。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | `TechStackSchema` 加 shape-agnostic 的 `test_timeout_ms`；`MAX_TEST_TIMEOUT_MS`（2147483647）；`TestTimeoutInvalid` |
| lib | Low | `resolveTestTimeoutMs`：未設定回 900000、1～2147483647 整數回傳、其他 throw；錯誤值以 `util.inspect` 印出 |
| services | Low | record-tests 在同一次 config 讀取、有 command 時解析上限並傳給 `runTestCommand`；非法值記 unprovable（reason 含鍵與修正方式）；timeout reason 帶鍵名 |
| templates | Low | init seed 註解行、config 參考範例欄位 |
| tests | Low | resolver、錯誤類別、init seed、record-tests 傳值／非法值／實際 timeout |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-116 | ADDED | `tech_stack.test_timeout_ms` 設定 record-tests 上限；範圍、非法值與文件（project-setup US-018） |

## Completion

- **Tasks**: 13/13 code tasks (100%)；[V] 2/2、[M] 1/1
- **Acceptance Criteria**: 4/4 凍結情境（revision 2）有實作，verify 2/5 無 scenario finding

## Review & Verify

- **Review**: 3 輪，0 critical／1 major／3 minor，全數 fixed。R1-1 上界數字在錯誤訊息與常數兩處寫死 → 常數移至 `src/types/config.ts` 單一來源；R1-2 NaN／Infinity 訊息無測試；R2-1 自我參照 alias 使 `JSON.stringify` throw、reason 未指名鍵 → 改用 `util.inspect`；R2-2 文件宣稱缺「有 test command 時」前提。
- **Verify**: Grade A — machine 1/5、4/5、5/5 PASS；2/5 delta-spec-compliance not-adjudicated（late-capture 基準缺口；REQ-TYPES-116 由 fresh-subagent 判 PASS，覆蓋 1/1）；3/5 constitution PASS（8/8 規則）；6 not-applicable；`pnpm test` 8,599 passed／4 skipped；`test:coverage` 96.42%
- **Quality Log**:
  - prospec-plan：verifier r1–r4 皆 WARN（0 FLAWS）；r2 實測 Bun 1.4.0 `spawnSync` timeout ≥ 2^31 溢位（2^31 → 4 ms SIGKILL），上界收斂為 2147483647，凍結情境經開發者同意 amend（revision 2，late-capture）；人工簽核
  - prospec-tasks：verifier WARN（init seed 無測試、mutation 清單缺兩項等，已補入 tasks）
  - prospec-review：r1 WARN（R1-1 major）、r2／r3 PASS
  - 測試錄製兩次在高負載下出現 git submodule hook timeout（未改動的 `input-snapshot`／`work-preservation`），單獨重跑通過、重錄全綠
  - prospec-verify：Grade A（warning：acceptance baseline late-capture）

## Follow-ups

- timeout 只殺直接子程序（孫程序可能殘留）的既有限制不在本 change 範圍；上限調高後影響變大，可另開 issue。
- `release.yml` 未釘 Bun 版本，上界依據為 Bun 1.4.0 實測，無 Bun 端測試守護。
