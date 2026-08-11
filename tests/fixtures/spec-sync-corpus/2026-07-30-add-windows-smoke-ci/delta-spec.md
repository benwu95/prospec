# Delta Spec: add-windows-smoke-ci

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-TESTS-062: Windows smoke job + real-host adjudication of the shim gate

**Feature:** drift-detection
**Story:** US-1, US-3

**Description:**
CI 首次在 `windows-latest` 上執行與 shim 相關的測試與一次真實的 `check --record-tests`，讓 `describe.runIf(process.platform === 'win32')` 從「所有環境都靜默 skip」變成真的會跑，並補上 cwd-`.exe` 與 quoted PATH entry 兩個真機佈局作為 libuv 模型的裁決者。

**Acceptance Criteria:**
1. `ci.yml` 有獨立的 `windows-smoke` job（`windows-latest`、觀測期 `continue-on-error: true`），既有 `test`／`comment` job 零改動
2. 該 job 執行 `tests/unit/lib/test-runner.test.ts` 與 `tests/unit/services/check.service.test.ts`，CI log 中真機區塊有非零通過數
3. 該 job 在暫存 git fixture 上實跑 `check --record-tests` 並斷言 `test-provenance` 為 `pass`／`skipped`、非 `fail`

**Spec:**
A `windows-smoke` job (`windows-latest`) makes the shim gate's Windows behavior executed rather than modelled: it runs the two shim-bearing unit files and then `scripts/windows-smoke-record-tests.ts`, which builds a temp git fixture (a `.prospec.yaml`, a `package.json` with a test script, one `implemented` change), invokes the built CLI's `check --record-tests` followed by `check --json`, and exits non-zero when `test-provenance` is `fail` — so the script is already a gate the day `continue-on-error` is removed. The job is deliberately **separate** rather than an `os` matrix: the existing `test` job's coverage step is bound to `shell: bash` + `jq` and feeds the `comment` job through a named artifact, and a matrix would entangle that wiring. `describe.runIf(process.platform === 'win32')` additionally covers the two layouts the injected probe can only model — a real executable found through the spawn cwd, and one found through a quoted PATH entry — each spawning for real, because the injected tests prove the decision and only a real host proves the reality.
- WHEN the job runs on a pull request, THEN the real-host block reports a non-zero passing count in the CI log (never a silent skip)
- WHEN the fixture's test command is a Windows `.cmd` shim, THEN `check --record-tests` reports the honest not-recorded reason and `test-provenance` is `skipped`, not `fail`
- WHEN a failure unrelated to the shim surfaces during the observation period, THEN `continue-on-error: true` keeps it from blocking the PR while the failure is enumerated with its own conclusion — the flag is an observation window, never a permanent mute
- WHEN the fixture script runs on a POSIX host, THEN it takes the recorded branch and still asserts the same outcome, so it is verifiable before it ever reaches a Windows runner

**Priority:** High

---

## MODIFIED

### REQ-LIB-033: Test command resolution, execution and the test-provenance evaluator

**Feature:** drift-detection
**Story:** US-2

**Before:**
`classifyExecutable` 只掃 `probe.pathDirs`；`defaultExecutableProbe` 對 raw PATH 只按 `;` 切分、不處理引號。

**After:**
bare name 的搜尋先查 spawn 的 current directory 再走 PATH（受 `NoDefaultCurrentDirectoryInExePath` 守衛，以 probe 的 `cwd: string | null` 表達，null 代表不搜尋），且 win32 PATH 切分剝除 entry 首尾引號、引號內的 `;` 不切分該 entry。呼叫端把各自的 spawn cwd 貫穿到預設 probe。

**Reason:**
兩處都是與 libuv `src/win/process.c` 的偏差，後果與 PATHEXT 那次同類——能正常 spawn 的命令被誤判成 shim，fail-class 閘門在**能工作**的機器上反向變成 skip（vendored `.exe` 佈局、quoted PATH entry 佈局），且因判定是 `shim` 而非 `not-found`，「`not-found` 不得阻擋」的安全網救不到（#103 重審）。

**Spec:**
`resolveTestCommand(config, cwd)` in `lib/config.ts` (the canonical resolver, alongside `resolveBasePaths`/`resolveKnowledgeTokenBudget`): `tech_stack.test_command` wins; otherwise `<package_manager> test` **only when package.json declares a test script**; neither → `null`. `lib/test-runner.ts`'s `runTestCommand` uses `spawnSync` with `shell: false` and `killSignal: 'SIGKILL'` — shell syntax (pipes, `&&`, redirection) is **deliberately unsupported**, and the kill bounds the direct child only (grandchildren are a documented exclusion, not a claim). `collectTestProvenance` (I/O, in `drift-sources`) reports the recorded command/exit code/digest plus whether `backfill-draft.md` exists; an unresolvable test command is **not** source unavailability — it lands in `command_unavailable_reason` while the changes are still enumerated, so recorded facts survive it (only git-worktree absence, a missing changes dir, or an uncomputable digest stay source-level unavailable). Pure `evaluateTestProvenance` grades in a fixed order: recorded failure → command-unavailability skip → no record → stale.
- WHEN the recorded exit code is non-zero, THEN fail — checked FIRST, before staleness and before the command-unavailability skip, so neither a stale+failing backfill record nor a command that stopped resolving can suppress a known-red run (a recorded failure is a fact that needs no runnable command)
- WHEN a proven backfill (`backfill-draft.md` present) has no record, or a stale **green** record, THEN exempt (outcome unknown, the same state as no tests); an **unproven** backfill (`scale` alone, which is hand-editable) gets no relaxation at all
- WHEN the run timed out or was killed, THEN no record is written and the timeout is distinguished from other signals (SIGSEGV / OOM / Ctrl-C reported as themselves); `TestRunResult` carries the `timeout_ms` the run was actually given, so reporting never restates the default
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
