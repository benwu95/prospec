# add-windows-smoke-ci — Archive Summary

- **Archived**: 2026-07-30
- **Original Created**: 2026-07-30
- **Quality Grade**: A

## User Story

As a 出貨 Windows 二進位的 prospec 維護者,
I want CI 有一個獨立的 `windows-latest` job，實跑與 shim 相關的測試並在暫存 fixture 上真跑一次 `prospec check --record-tests`，同時讓 `classifyExecutable` 對齊 libuv 的實際解析規則,
So that 「Windows 上是誠實 skip 而非 FAIL」這個宣稱有真機證據，且能正常 spawn 的命令不會被誤判成 shim。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `ExecutableProbe` 新增必填 `cwd: string \| null`；PATH 切分改引號感知；`classifyExecutable` 先搜 spawn cwd 再走 PATH 且候選以該 cwd 為基準解析；`unspawnableReason` 改必填 probe |
| tests | High | 三類新注入斷言＋`runIf(win32)` 三條真機案例＋`test-provenance-probe-wiring.test.ts`（預設 probe 貫穿的 wiring pin） |
| services | Low | `check.service` 的 `--record-tests` 路徑僅被 fixture 執行，邏輯未改 |
| （非模組） | Medium | `.github/workflows/ci.yml` 新增 `windows-smoke` job；`scripts/windows-smoke-record-tests.ts` 新增 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TESTS-062 | ADDED | windows-smoke job ＋ 真機裁決（fixture 腳本斷言 `test-provenance` 非 FAIL、runIf 區塊涵蓋 cwd 與 quoted PATH 兩佈局） |
| REQ-LIB-033 | MODIFIED | libuv 解析：cwd-first（受 `NoDefaultCurrentDirectoryInExePath` 守衛）、quoted PATH entry 去引號且內含 `;` 不切分、候選以 spawn cwd 為基準、cwd 貫穿不得下游重取 `process.cwd()` |

## Completion

- **Tasks**: 16/16 code tasks (100%)；`[M]` 3/3、`[V]` 4/4 全數完成
- **Acceptance Criteria**: 11/11（US-1 4/4、US-2 5/5、US-3 2/2）——SC-001／SC-002 由真機 run 補齊，見下

## Review & Verify

- **Review**: 2 round(s)，1 critical / 8 major，全數修復。Critical：job 層 `continue-on-error` 不影響 step 續跑，隱含 `success()` 會在 vitest 轉紅時 skip 掉唯一的真機證據步驟（獨立 verifier 以 GitHub 官方文件確認，改用 `if: ${{ !cancelled() }}`）。代表性 major：delta-spec「cwd 不得下游重取」零 revert-red 覆蓋（補 wiring pin）、`unspawnableReason` 平行點缺一（改必填 probe）、`candidate()` 未以 probe cwd 解析相對 entry（第三處 libuv 偏差）、既有 `unspawnableReason('pnpm test')===null` 斷言在 Windows 必紅（改 POSIX-only）、`beforeAll` 複製 110MB `node.exe` 未提高 hookTimeout
- **Verify**: Grade A；machine ledger task-completion／knowledge／tests 全 PASS，judgment ledger delta-spec-compliance=WARN（fresh context）、constitution=PASS（6/6 規則）、design=not-applicable；recorded suite `pnpm test` exit 0（2,818 passed / 4 skipped）
- **Quality Log**: 1 WARN — 評分時 REQ-TESTS-062 的 Windows 執行期宣稱與 SC-001／SC-002／SC-005 尚無真機證據。**該 WARN 的成因已於評分後關閉**：PR #110 的 windows-smoke 首跑（run 30543703603）顯示 `test-provenance: skipped`（`pnpm` → `…\.bin\bin\pnpm.cmd`）而非 FAIL、四條真機案例全數執行通過（Windows 85 tests／1 skipped vs macOS 同兩檔 4 skipped）、且 `if: !cancelled()` 在 vitest 轉紅時確實讓證據步驟續跑
- **首跑的與 shim 無關失敗**：1 條（`check.service.test.ts:500` kill/signal 斷言的 POSIX 前提在 Windows 不成立——`process.kill(SIGTERM)` 映射為 `TerminateProcess`，子行程以 exit code 收場故記錄被寫入）。已逐條列於 issue #101 並結論為「修，放在獨立後續 change」

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md`（libuv 解析規則已補 cwd-first／去引號／候選基準，並壓回 L2 預算內）
- `prospec/ai-knowledge/modules/tests/README.md`（測試計數由 `pnpm counts` 重導）
