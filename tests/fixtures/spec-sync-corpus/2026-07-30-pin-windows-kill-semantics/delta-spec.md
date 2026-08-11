# Delta Spec: pin-windows-kill-semantics

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

_No additions in this change._

## MODIFIED

### REQ-LIB-033: Test command resolution, execution and the test-provenance evaluator

**Feature:** drift-detection
**Story:** US-1

**Before:**
「timed out or killed → 不寫記錄，且 timeout 與其他訊號可區分」被寫成跨平台成立。

**After:**
timeout 與 kill 拆成兩條。kill 那條改以「只有**被訊號終止**的執行才不寫記錄」為軸，並說明訊號的有無是平台形狀：POSIX 從 wait status 取訊號（`WIFSIGNALED`／`WTERMSIG`，與誰發的無關），但子行程若**接住**訊號後正常結束，仍有 exit code、仍會被記錄；Windows 的 wait status 根本沒有訊號，libuv 只在 kill 經 `uv_process_kill` 下達時才有 `exit_signal` 可合成，故自我／第三方 kill 無訊號、以 `TerminateProcess` 的 exit code 收場而被記錄（fail-closed）。timeout 半邊兩平台皆成立，因為那個 kill 是 `spawnSync` 自己下的。

**Reason:**
windows-smoke 首跑（run 30543703603）唯一與 shim 無關的失敗即由此而來：`check.service.test.ts` 的斷言把 POSIX 訊號前提當成跨平台事實。真正的問題是規格本身在 Windows 為假——用測試 skip 迴避會讓觀測期永遠留一個不確定，且違反本專案「宣稱必須等於可觀測行為」的既有作法（grandchildren、no-cwd 兩處 exclusion 同一風格）。

**Spec:**
`resolveTestCommand(config, cwd)` in `lib/config.ts` (the canonical resolver, alongside `resolveBasePaths`/`resolveKnowledgeTokenBudget`): `tech_stack.test_command` wins; otherwise `<package_manager> test` **only when package.json declares a test script**; neither → `null`. `lib/test-runner.ts`'s `runTestCommand` uses `spawnSync` with `shell: false` and `killSignal: 'SIGKILL'` — shell syntax (pipes, `&&`, redirection) is **deliberately unsupported**, and the kill bounds the direct child only (grandchildren are a documented exclusion, not a claim). `collectTestProvenance` (I/O, in `drift-sources`) reports the recorded command/exit code/digest plus whether `backfill-draft.md` exists; an unresolvable test command is **not** source unavailability — it lands in `command_unavailable_reason` while the changes are still enumerated, so recorded facts survive it (only git-worktree absence, a missing changes dir, or an uncomputable digest stay source-level unavailable). Pure `evaluateTestProvenance` grades in a fixed order: recorded failure → command-unavailability skip → no record → stale.
- WHEN the recorded exit code is non-zero, THEN fail — checked FIRST, before staleness and before the command-unavailability skip, so neither a stale+failing backfill record nor a command that stopped resolving can suppress a known-red run (a recorded failure is a fact that needs no runnable command)
- WHEN a proven backfill (`backfill-draft.md` present) has no record, or a stale **green** record, THEN exempt (outcome unknown, the same state as no tests); an **unproven** backfill (`scale` alone, which is hand-editable) gets no relaxation at all
- WHEN the run timed out, THEN no record is written and the timeout is distinguished from other signals (SIGSEGV / OOM / Ctrl-C reported as themselves); `TestRunResult` carries the `timeout_ms` the run was actually given, so reporting never restates the default
- WHEN the run is killed rather than exiting on its own, THEN only a **signal-terminated** run goes unrecorded, and whether a kill produces one is platform-shaped. POSIX reads the signal out of the wait status whoever sent it (`WIFSIGNALED`/`WTERMSIG`), so such a run carries no exit code and nothing is recorded — but a child that *catches* the signal and exits normally reports an exit code and IS recorded, like any run. Windows carries no signal in the wait status at all: libuv synthesizes one from an `exit_signal` it sets only for a kill issued through `uv_process_kill` on that handle, so a self-kill or third-party kill reports none and surfaces as `TerminateProcess`'s exit code (1 when libuv issued it), indistinguishable from a suite that failed on its own — recorded like a red suite: fail-closed, never silently absent, and pinned per platform rather than asserted as one cross-platform rule. The timeout half holds on both platforms because that kill is the one `spawnSync` issues itself (on Windows it reports `signal: 'SIGKILL'` alongside `ETIMEDOUT`)
- WHEN no test command resolves and nothing recorded failed, THEN the check is `skipped` with the reason — never a permanent FAIL; missing/stale branches skip too (meaningless to demand a run that cannot spawn)
- WHEN the resolved command cannot be spawned without a shell on this platform, THEN the same honest skip applies (again, unless a recorded non-zero exit exists — that still fails). `classifyExecutable(bin, probe)` decides it behind an injected `ExecutableProbe` (platform, PATH, spawn cwd, file-existence), so the win32 branch is provable from a POSIX host; `describeUnspawnable` yields the single reason string both `collectTestProvenance` and `runTestCommand` report, and the runner refuses **before** spawning rather than letting EINVAL surface
- WHEN resolving a bare name on Windows, THEN follow **libuv**, not PATHEXT: it searches the spawn's current directory first and then each PATH directory, trying the literal name (only when it contains a dot), `.com`, then `.exe`. The search is therefore two passes — any directory holding a startable file means `spawnable`, so an earlier `.cmd` never shadows a later real `.exe`; only when no directory holds one does a `.cmd`/`.bat` become the diagnosis. Ordering by PATHEXT would classify a working command as a shim and silently turn this fail-class gate into a skip
- WHEN the current directory must not be searched (`NoDefaultCurrentDirectoryInExePath` is defined, mirroring `NeedCurrentDirectoryForExePathW`), THEN the probe carries `cwd: null` and only PATH is searched — the guard lives in probe construction so `classifyExecutable` stays a pure function over the probe
- WHEN a Windows PATH entry is quoted, THEN the surrounding quote characters are stripped and a `;` **inside** the quotes does not split the entry — a real `.exe` behind a quoted entry must stay visible, otherwise a `.cmd` elsewhere degrades the verdict to a false `shim`
- WHEN the probe's `cwd` is supplied by a caller, THEN it is that caller's spawn cwd (`runTestCommand`'s `cwd`, `collectTestProvenance`'s `cwd`), never `process.cwd()` re-derived downstream — libuv resolves against the cwd the spawn will use, and `unspawnableReason` therefore takes the probe as a **required** argument rather than defaulting to one it cannot know the cwd for
- WHEN a searched directory (or the bin itself) is a relative path, THEN the candidate resolves against the probe's cwd, mirroring libuv's `search_path_join_test`, which prepends the spawn cwd to any directory that is not drive-absolute or UNC; with no cwd on the probe there is no base to resolve against and the entry falls back to the ambient process cwd — a stated exclusion, not a claim
- WHEN the verdict is `not-found`, THEN it does **not** block — this probe's view of PATH may differ from the spawn's, so the real spawn reports ENOENT instead of our model skipping a working command

**Priority:** High

---

## REMOVED

_No removals in this change._
