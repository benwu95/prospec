# skip-unspawnable-test-command — Archive Summary

- **Archived**: 2026-07-29
- **Original Created**: 2026-07-29
- **Quality Grade**: A
- **Scale**: quick ｜ **來源**：split-verify-adjudication review 的 escalated major

## User Story

作為在 Windows 上用 prospec 的開發者，我想要當測試指令是無法無 shell 執行的 shim 時 `test-provenance` 回報誠實 skip 並告訴我怎麼改，以便不會被一個任何設定都清不掉的永久 FAIL 擋在 `verified` 之外。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `test-runner.ts` 新增 `ExecutableProbe` 注入契約與 `classifyExecutable`／`describeUnspawnable`／`unspawnableReason`，`runTestCommand` 於 spawn 前拒絕；`drift-sources.ts` 的 `collectTestProvenance` 把 shim 視為來源不可用 |
| templates | Low | config-example 與 init seed 的 `test_command` 說明載明 Windows 約束與不經 shell 的替代寫法 |
| tests | Medium | 平台注入的分類測試、`exists` 三態、collector／runner 兩處接線，以及一條待 Windows CI 的 `runIf(win32)` |

## Requirements

quick 無 delta-spec —— 畢業自 proposal 的 **Spec Impact** 節：

| REQ ID | Status | Description |
|--------|--------|-------------|
| US-9（drift-detection） | MODIFIED | 誠實 skip 的觸發從一種擴為兩種：加入「解析出的指令在本平台無法執行」 |
| REQ-LIB-033 | MODIFIED | skip 族群擴充 ＋ 分類器與注入契約；解析規則以 libuv 為準而非 PATHEXT |
| REQ-TESTS-056 | MODIFIED | 平台注入的 shim 分類測試、`exists` 三態、兩處接線測試 |
| REQ-TYPES-068 | MODIFIED | `test_command` 文件契約載明 Windows 不得指向 shim |

## Completion

- **Tasks**: 11/11 code tasks (100%)；`[M]` 1、`[V]` 1 皆完成，0 未完成
- **Acceptance Criteria**: 4/4 驗收情境達成；決定性以執行證明（連續兩次 `prospec check` 除 `generated_at` 外逐位元相同）
- **Suite**: 2,397 passed ＋ 1 skipped（總 2,398 / 99 files；skipped 即那條 `runIf(win32)`），exit 0 已蓋章進 `test_provenance`

## Review & Verify

- **Review**: 1 round（mode B，多 lens），**2 critical / 3 major**，全數修復。最嚴重的一條是我的搜尋模型與實際 spawn 相反 —— 我按 PATHEXT 排序並在首個 `.cmd` 命中即判 shim，但 libuv 不讀 PATHEXT（`src/win/process.c`：只試 `""`／`"com"`／`"exe"`），於是「較前目錄 `pnpm.cmd` ＋ 較後目錄真 `pnpm.exe`」這種常見安裝佈局會被判 shim，把 FAIL-class 閘門在**可正常工作**的機器上變成 skip。第二條是 proposal 的 Spec Impact 漏了 US-9（quick 的唯一畢業來源），且誤引一個 feature spec 裡不存在的「AC6」標號。三個 major：兩條斷言把錯模型鎖進去、`defaultExecutableProbe.exists` 零覆蓋（兩個 mutation 存活）、「僅在真 Windows 執行」註解錯置於恆執行的區塊上方。
- **Verify**: Grade **A** —— 1/5 · 4/5 · 5/5 機械帳全 PASS（逐字採用 engine 裁決）；3/5 PASS（6/6 清冊條目、0 未標籤）；2/5 與 6 為 `not-applicable`（quick 無 delta-spec、`ui_scope: none`）。
- **Quality Log**: new-story WARN（scale veto 揭露）；verify PASS 帶 2 條 warning。未解事項：**真機行為在本輪仍未被執行過** —— 注入測試證的是我們對 libuv 規則的理解，而第一版正是把它寫反，唯一能證實際行為的 `runIf(win32)` 測試在此環境被 skip；windows-latest CI job 仍是待辦。另記已知限制：Windows 上可用 `test_command: anything.cmd` 觸發 skip（非新類別，且揭露完整保留）。

## Knowledge Update

已於 verify S/A commit prompt 同步：`modules/lib/README.md`（分類器與 libuv 規則）、`modules/tests/README.md`（計數）。`templates` 的 README 起初未動，我並宣稱「同一 commit 故不會判 stale」—— 這是錯的：README 沒進這個 commit，它的 last commit 就比 templates 原始碼舊，`knowledge-health` 隨即判 stale。已補上真實註記（config 樣板的 `test_command` 註解承載的是平台契約，兩份副本都要寫，且由 `lib/test-runner` 強制）。

## 為什麼 A 而非 S

六個維度全 PASS/not-applicable、13/13 機械 check 綠、9 條 mutation 轉紅。但本修法的真機行為尚未在 Windows 上執行過，宣稱 S 會蓋過這件事。
