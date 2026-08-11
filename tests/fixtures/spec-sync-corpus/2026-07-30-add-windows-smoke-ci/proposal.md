# add-windows-smoke-ci

## Background

`release.yml` 出貨 `prospec-windows-x64.exe`，但 `ci.yml` 只有一個 `runs-on: ubuntu-latest` 的 `test` job——這支 Windows 二進位的測試套件從未在 Windows 上跑過一次。`skip-unspawnable-test-command` 已把 Windows `.cmd` shim 從 `test-provenance` FAIL 改成誠實 skip，但**那個修法的真機行為至今未被執行過**：唯一能證實際行為的 `describe.runIf(process.platform === 'win32')` 在所有現有 CI 環境都被靜默 skip，平台注入的單元測試證的只是「我們對 Windows 的模型」。

該模型第一版就錯過一次（按 PATHEXT 排序，而 libuv 根本不讀 PATHEXT），後果不是功能失效而是**閘門反向失效**——能正常工作的機器被判成不可執行，fail-class 閘門變成 skip。#103 重審對照 libuv `src/win/process.c` 又找到兩處同類偏差（cwd-first 搜尋缺失、quoted PATH entries 未去引號），皆為對抗式 review 抓出、非測試抓出。

## User Stories

### US-1: windows-smoke job 讓 Windows 行為第一次被執行 [P1]

As a 出貨 Windows 二進位的 prospec 維護者,
I want CI 有一個獨立的 `windows-latest` job，實跑與 shim 相關的測試並在暫存 fixture 上真跑一次 `prospec check --record-tests`,
So that 「Windows 上是誠實 skip 而非 FAIL」這個宣稱有真機證據，而不是只有我們對 Windows 的模型。

**Acceptance Scenarios:**

- WHEN windows-smoke job 在 PR 上執行, THEN CI log 中 `runTestCommand on a real Windows host` 區塊確實執行（看得到通過的測試數，而非靜默 skip）
- WHEN 該 job 在暫存 fixture 上跑 `prospec check --record-tests`, THEN 要嘛成功記錄，要嘛回報 shim 的誠實 skip，且 `test-provenance` 為 `skipped` 而非 FAIL
- WHEN 該 job 出現與 shim 無關的 Windows 失敗, THEN `continue-on-error: true` 使其不阻擋 PR，且失敗被逐條列出並各自有結論（修／記為已知限制／降級）
- WHEN 既有 ubuntu `test` job 與 `comment` job 執行, THEN 行為與本 change 前完全相同——coverage artifact 名稱不撞、sticky PR comment 接線未動

**Independent Test:** 在 PR 上觀測 windows-smoke 的 CI log：runIf 區塊有測試計數、record-tests 步驟印出 `test-provenance` 狀態、且 coverage sticky comment 照舊出現。

### US-2: classifyExecutable 對齊 libuv 的兩條實際解析規則 [P1]

As a 在 Windows 上使用 vendored `.exe` 或 quoted PATH entry 佈局的使用者,
I want shim 判定跟 libuv 真正的搜尋順序一致,
So that 能正常 spawn 的測試命令不會被誤判成 shim，把 fail-class 閘門在能工作的機器上反向變成 skip。

**Acceptance Scenarios:**

- WHEN 專案目錄有 `mytool.exe` 而 PATH 上只有 `mytool.cmd`, THEN 判定 `spawnable`（bare name 先查 current directory 再走 PATH）
- WHEN 真實 `.exe` 位於 quoted PATH entry 而他處存在同名 `.cmd`, THEN 判定 `spawnable`（entry 兩側引號被剝除）
- WHEN quoted PATH entry 內含 `;`, THEN 該 entry 視為單一段落而非被切成兩段
- WHEN `NoDefaultCurrentDirectoryInExePath` 已定義, THEN current directory **不**被搜尋（與 `NeedCurrentDirectoryForExePathW` 一致）
- WHEN 上述佈局下都找不到可啟動檔案, THEN 才回 `shim` 或 `not-found`，且 `not-found` 依舊不阻擋

**Independent Test:** 以注入的 `ExecutableProbe`（`platform: 'win32'`、含引號的 pathDirs、指定 cwd）在 POSIX 主機驅動 win32 分支；每條規則一條斷言，還原舊實作即紅。

### US-3: 真機測試涵蓋這兩個佈局 [P2]

As a 同一位維護者,
I want `describe.runIf(win32)` 也涵蓋 cwd-`.exe` 與 quoted PATH entry 兩個佈局,
So that CI 不只證「我們的模型自洽」，而是證模型與真機 libuv 一致。

**Acceptance Scenarios:**

- WHEN 真機測試在 windows-smoke 上執行, THEN cwd 放真實可執行檔的案例實際 spawn 成功（判定與真機行為一致）
- WHEN 同一區塊測 quoted PATH entry, THEN 判定與真機 spawn 結果一致，或該佈局被逐條記為已知限制並附理由

**Independent Test:** windows-smoke 的 CI log 顯示這些案例執行且通過；在 POSIX 上同一區塊維持 skip，不影響 ubuntu job。

## Edge Cases

- **Windows runner 上 `pnpm` 是 `.cmd` shim**：smoke job 內任何依賴 `pnpm test` 預設回退的路徑都會走誠實 skip——這正是待驗證的行為，不是失敗
- **fixture 需要真 git repo**：`--record-tests` 的前置條件含 git-ness 與 metadata，fixture 必須 `git init` 並帶一個 `implemented` change，否則得到的是 `{recorded:false, reason}` 而非待驗證的路徑
- **CRLF 與路徑分隔**：Windows 上 `git init` fixture 與 digest pathspec 行為未曾驗證，可能噴與 shim 無關的失敗（預期代價，逐條列舉）
- **`continue-on-error` 的掩蓋風險**：綠燈前它掩蓋一切失敗，故失敗清單必須外顯（PR 或 issue），不得長期靠它靜音
- **cwd 搜尋的 cwd 是哪一個**：libuv 用的是 spawn 的 cwd，不是 `process.cwd()`；probe 取錯來源會產出與真機不同的判定

## Functional Requirements

- **FR-001**: `ci.yml` 新增獨立 `windows-smoke` job（`runs-on: windows-latest`、`continue-on-error: true`），不改動既有 `test`／`comment` job 的任何接線
- **FR-002**: 該 job 步驟為 checkout → pnpm setup → install → build → 跑 `tests/unit/lib/test-runner.test.ts` 與 `tests/unit/services/check.service.test.ts` → 在暫存 fixture 上實跑一次 `prospec check --record-tests` 並印出 `test-provenance` 結果
- **FR-003**: `classifyExecutable` 在 pass 1 先搜尋 spawn 的 current directory 再走 PATH，並受 `NoDefaultCurrentDirectoryInExePath` 守衛
- **FR-004**: PATH 切分剝除 entry 兩側引號，且引號內的 `;` 不切分該 entry
- **FR-005**: 新增規則各有注入式單元測試（POSIX 可跑），並在 `describe.runIf(win32)` 區塊補上對應真機案例
- **FR-006**: 與 shim 無關的 Windows 失敗逐條記錄於本 change 的 verify 產出或 issue #101，各自有結論

## Success Criteria

- **SC-001**: PR 的 windows-smoke CI log 中 `runTestCommand on a real Windows host` 區塊有非零通過測試數
- **SC-002**: 該 job 的 record-tests 步驟輸出 `test-provenance` 為 `skipped`（附 shim 理由）或成功記錄，皆非 FAIL
- **SC-003**: `pnpm test` 在 ubuntu 全綠；新增斷言在還原舊 `classifyExecutable` 實作時轉紅（mutation pin）
- **SC-004**: `git diff` 對 `ci.yml` 既有 `test`／`comment` job 零改動
- **SC-005**: 與 shim 無關的 Windows 失敗清單外顯，每條有結論

## Related Modules

- **lib**: `lib/test-runner.ts` 的 `classifyExecutable`／`defaultExecutableProbe`／`ExecutableProbe` 是兩處模型偏差所在
- **tests**: `tests/unit/lib/test-runner.test.ts` 的注入式斷言與 `describe.runIf(win32)` 區塊；`tests/unit/services/check.service.test.ts` 是 smoke job 的第二個目標檔
- **services**: `check.service` 的 `--record-tests` 路徑是 fixture 實跑的受測對象（僅被執行，本 change 不改其邏輯）

## Open Questions

- [ ] 首跑失敗清單的落點：記在 issue #101 comment 或本 change 的 verify 產出——待首次 CI 結果後決定（不阻擋實作）

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — INVEST：三個 Story 各自可獨立交付與驗證（US-2 不需 CI、US-1 不需 US-2）、皆有可測 AC；TDD：FR-005 要求測試先行且帶 mutation pin；Language Policy：本檔為 change artifact，繁中

## UI Scope

**Scope:** none
