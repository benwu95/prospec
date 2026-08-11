# Proposal: skip-unspawnable-test-command

## Background

`test-provenance` 把「無可解析的測試指令」判為誠實 skip，但沒有涵蓋「指令存在卻無法在本平台執行」。Windows 上這不是邊角案例：Node 對 `.bat`／`.cmd` 一律報 EINVAL（CVE-2024-27980），**連絕對路徑也擋**，而 `resolveTestCommand` 的預設回退正是 `pnpm test` 這種 shim。結果是每個 Windows 專案的每個 `implemented` change 都拿到 5/5 FAIL → grade C → 永遠到不了 `verified`，且**沒有任何 config 設定能修**。專案有出 `prospec-windows-x64.exe`，所以這會打到真實使用者。此缺口由 split-verify-adjudication 的 review escalate（未修），本變更收掉它。

## User Stories

### US-1: 無法在本平台執行的測試指令回誠實 skip [P1]

作為 **在 Windows 上用 prospec 的開發者**，
我想要 **當測試指令是無法無 shell 執行的 shim 時，`test-provenance` 回報誠實 skip 並告訴我怎麼改**，
以便 **不會被一個任何設定都清不掉的永久 FAIL 擋在 `verified` 之外**。

**Acceptance Scenarios:**

- WHEN 平台為 Windows 且測試指令的 argv[0] 解析成 `.cmd`／`.bat` shim，THEN `test-provenance` 為 `skipped`，reason 說明該約束並指出要把 `tech_stack.test_command` 設成不經 shell 的呼叫
- WHEN 任何 PATH 目錄裡有真正的 `.exe`（即使某個較前的目錄放著 `.cmd`），THEN 依 libuv 的解析規則判為可執行、不得誤判為 shim —— 誤判會把 FAIL-class 閘門在可正常工作的機器上變成 skip
- WHEN `--record-tests` 遇到 shim，THEN 在 spawn 之前就拒絕並回報同一組原因，不留下任何紀錄、也不讓 EINVAL 裸露給使用者
- WHEN 平台不是 Windows，THEN 判定一律為可執行 —— POSIX 沒有 shim 層，找不到指令交由實際 spawn 回 ENOENT

**Independent Test:**
以注入的 platform／PATH／檔案存在探測，在 macOS 上驅動 win32 分支：假造只有 `pnpm.cmd` 的 PATH → 判為 shim；在**任何**目錄補上 `pnpm.exe` → 判為可執行。再對 collector 與 runner 各注入一次，證明兩處都接上同一組原因。真機行為另以 `runIf(win32)` 測試保留，待 Windows CI job 存在時才跑。

## Edge Cases

- **`not-found` 不得阻擋**：本探測對 PATH 的理解可能與實際 spawn 不同（cwd 相對、libuv 細節），所以否定判定只保留給 shim；找不到就讓真正的 spawn 回 ENOENT，避免用自己的模型錯殺可用指令
- **已帶副檔名**：`node.exe` 直接判可執行、`pnpm.cmd` 直接判 shim，都不再搜 PATH
- **本身是路徑**（含分隔符）：按原樣探測，不與 PATH 目錄組合
- **POSIX 上的既有行為不變**：`runTestCommand` 對不存在指令仍回 `{exit_code: null, error}`
- **PATHEXT 不參與判定**：cmd.exe 讀 PATHEXT，libuv 不讀；我們走 `shell: false` 故只有 libuv 的規則算數。若按 PATHEXT 排序，「較前目錄有 `.cmd`、較後目錄有真 `.exe`」的常見安裝佈局會被誤判成 shim，把 FAIL-class 閘門在**可正常工作**的機器上變成 skip
- **這條 skip 在 Windows 上可被設定觸發**（把 `test_command` 指成任意 `.cmd` 即 skip）。這不是新類別 —— 不設 `test_command` 且無 test script 本來就 skip；誠實 skip 家族本質上就是可由設定觸及的。該 check 的用途是防止**無聲的假 PASS**，而非不可繞過：報告會顯示 `skipped` + reason，verify 也把該維度記為 `not-adjudicated`（絕不 PASS），揭露完整保留

## Related Modules

- **lib**: `test-runner.ts` 的分類器與預先拒絕、`drift-sources.ts` 的 collector 可用性判定
- **templates**: config-example 與 init seed 的 `test_command` 說明須載明此約束
- **tests**: 平台注入的單元測試（分類器、兩處接線）＋ 一條真機 `runIf(win32)`

## Spec Impact

quick 無 delta-spec，本節即畢業來源（archive Phase 3.5 從此處畢業）：

- **US-9** — MODIFIED：驗收情境「WHEN the project has no resolvable test command, THEN the check is `skipped` + reason」擴充為兩種觸發 —— 追加「WHEN the resolved command cannot be spawned on this platform（Windows `.cmd`／`.bat` shim），THEN `skipped` + reason 指出要改成不經 shell 的呼叫」。不補這條，畢業後的 feature spec 會把「無可解析指令」寫成唯一的 skip 觸發，與出貨行為矛盾
- **REQ-LIB-033** — MODIFIED：第 4 條 scenario（誠實 skip 那條）的族群擴充 —— 除「無可解析指令」外，「指令存在但在本平台無法無 shell 執行」同樣回 `skipped` + reason；並新增 `classifyExecutable`／`describeUnspawnable`／`unspawnableReason` 與其 `ExecutableProbe` 注入契約，`runTestCommand` 於 spawn 前套用同一判定。**解析規則以 libuv 為準而非 PATHEXT**：libuv 每個目錄只試「含點的字面名稱 →`.com`→`.exe`」，故判定分兩趟 —— 先在全部 PATH 目錄找 libuv 能啟動的檔案（較前目錄的 `.cmd` 不得遮蔽較後目錄的真 `.exe`），全都找不到才回頭找 `.cmd`／`.bat` 作為失敗診斷
- **REQ-TESTS-056** — MODIFIED：新增平台注入的 shim 分類測試（非 win32 恆可執行、`.exe` 跨目錄勝過 `.cmd`、`.com` 亦可執行、全 PATH 皆無才判 shim、PATHEXT 不影響判定的負向斷言、已帶副檔名、路徑不搜 PATH）、`defaultExecutableProbe.exists` 的檔案／目錄／不存在三態，以及 collector／runner 兩處接線測試；真機行為以 `runIf(win32)` 保留
- **REQ-TYPES-068** — MODIFIED：`test_command` 的文件契約載明 Windows 不得指向 shim，並給出不經 shell 的替代寫法

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified：Language Policy（change artifact 繁中、程式碼與 trust zone 英文）；TDD —— 新增公開函式皆有測試且 mutation 驗證（含補釘 runner 守衛的那條）；依賴方向 `lib → types` 不變，`drift-sources → test-runner` 為既有的 lib 單向；User-Facing Documentation —— README 雙語與 config 樣板同步更新

## UI Scope

**Scope:** none
