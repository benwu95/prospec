# Delta Spec: fix-issue-106-drift-engine-blindspots

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)

## ADDED

_No additions in this change._

---

## MODIFIED

### REQ-LIB-033: [Test Provenance digest guard 條件與判定]

**Feature:** drift-detection
**Story:** US-106

**Before:**
`prospec check` 的 test provenance 在 `current_digest === null` 時會早退並回傳 unavailable，導致已記錄的測試失敗 (`exit_code: 1`) 無法觸發 `evaluateTestProvenance` 的紅燈分支，進而使失敗狀態被抑制。

**After:**
`prospec check` 的 test provenance 判斷將已記錄的測試失敗 (`exit_code !== 0`) 置於最高優先級。即使 `current_digest === null`（例如 capture 失敗），只要 metadata 中存在失敗紀錄，便無條件判為 FAIL，不會因 digest 缺失而回傳 unavailable。

**Reason:**
「已記錄的失敗是事實，不需要可計算的 digest」——此修正補齊了 Issue #103 中 digest 軸上最後一個未涵蓋的失敗抑制漏洞。

**Acceptance Criteria:**
1. `current_digest === null` 時，已記錄的 non-zero exit 仍會判為 FAIL。
2. 不會因為 test-provenance 中 `recorded_digest` 的缺失而忽視紅燈。

**Priority:** High

**Spec:**
#### REQ-LIB-033: Test command resolution, execution and the test-provenance evaluator
`resolveTestCommand(config, cwd)` in `lib/config.ts` (the canonical resolver, alongside `resolveBasePaths`/`resolveKnowledgeTokenBudget`): `tech_stack.test_command` wins; otherwise `<package_manager> test` **only when package.json declares a test script**; neither → `null`. `lib/test-runner.ts`'s `runTestCommand` uses `spawnSync` with `shell: false` and `killSignal: 'SIGKILL'` — shell syntax (pipes, `&&`, redirection) is **deliberately unsupported**, and the kill bounds the direct child only (grandchildren are a documented exclusion, not a claim). `collectTestProvenance` (I/O, in `drift-sources`) reports the recorded command/exit code/digest plus whether `backfill-draft.md` exists; an unresolvable test command is **not** source unavailability — it lands in `command_unavailable_reason` while the changes are still enumerated, so recorded facts survive it (only git-worktree absence or a missing changes dir stay source-level unavailable; an uncomputable digest passes the `null` downstream instead of short-circuiting). Pure `evaluateTestProvenance` audits the statuses in `PROVENANCE_AUDITED_STATUSES` (REQ-TYPES-075) — the same registry review-provenance reads, so the two gates cannot cover different windows — and grades in a fixed order: recorded failure → command-unavailability skip → no record → stale.
- WHEN the recorded exit code is non-zero, THEN fail — checked FIRST, before staleness and before the command-unavailability skip, so neither a stale+failing backfill record nor a command that stopped resolving can suppress a known-red run (a recorded failure is a fact that needs no runnable command)
- WHEN the change is `verified`, THEN it is audited exactly like an `implemented` one; `archived` yields no verdict because the collector cannot enumerate a moved bundle
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

---

### REQ-LIB-036: [markdown-fences CommonMark boundary contract]

**Feature:** drift-detection
**Story:** US-12

**Before:**
`withoutFencedBlocks` 對於縮排的判斷過於嚴格，清單內接續的 markdown fences（縮排 ≥ 4 空格）會被誤判為 indented code，作為 advisory boundary 被跳過。

**After:**
放寬縮排判斷，支援 List 內的 4 空格（或任意合法）延續縮排。移除 `^ {0,3}` 的限制，不再將合法的清單內 fence 誤判為 indented code。

**Reason:**
修復漂移引擎的盲點，確保清單內的程式碼區塊能正確被解析而不影響後續掃描。

**Acceptance Criteria:**
1. 清單內縮排的 markdown fence 能正確被 `withoutFencedBlocks` 解析。

**Priority:** High

**Spec:**
#### REQ-LIB-036: markdown-fences CommonMark boundary contract

**Story:** US-12

`withoutFencedBlocks` supports matching fenced blocks even when indented (e.g. continuation indentation inside list items), ignoring the strict `^ {0,3}` limit which incorrectly classified them as indented code blocks; a backtick fence's info string may not contain a backtick (a one-line ```` ```code``` ```` span is inline code, not an opener that swallows the file), while a tilde fence's info string may. The helper stays an import-free lib leaf (consumed one-way by `constitution-parser` and `drift-sources`) and carries its own test file (`tests/unit/lib/markdown-fences.test.ts`) covering indented-fence, inline-span, `~~~`, mixed-marker-close, longer-closer and unclosed-fence classes.
**Scenarios:**
- WHEN a fence is indented (including 4+ spaces inside a list item context), THEN it still opens properly
- WHEN scanning after the fixes, THEN existing consumers (Constitution parser, REQ/link scans) show no regression — full suite green

---

### REQ-LIB-015: [Knowledge health check (git timestamps)]

**Feature:** drift-detection
**Story:** US-2

**Before:**
`gitCapture` 發生未預期的失敗（如指令執行失敗）時，與「無 commit」相同回傳 null，會被 `evaluateKnowledgeHealth` 錯誤判定為 fresh (未漂移)。

**After:**
區分 capture failure 與無 commit。當 `gitCapture` 發生不明確錯誤時拋出例外，確保不會將 capture failure 錯誤地折疊為 fresh。

**Reason:**
防堵 capture failure 被判定為未漂移的漏洞。

**Acceptance Criteria:**
1. `gitLastCommit` 失敗時拋出錯誤，防止靜默折疊為 fresh。

**Priority:** Medium

**Spec:**
#### REQ-LIB-015: Knowledge health check (git timestamps)
The comparison source is git log timestamps (file mtime is distorted after a CI checkout and does not participate in the judgment); timestamps are compared by epoch (%cI carries each one's own timezone offset). A module's knowledge is its `README.md` plus every extracted sub-module `.md` sibling, so staleness compares the module's last source commit against the NEWEST of those knowledge commits; the report carries both `last_readme_commit` (the README's own) and the optional `last_sub_module_commit`, so a documented module's verdict is reproducible from the report alone. The source-commit query EXCLUDES the registered generated artifacts (REQ-LIB-039) by git pathspec — build output that sits under a module path but carries no knowledge a README could describe, so a commit regenerating it must not demand a knowledge update. That exclusion is scoped to this judgment alone: the same file stays inside `computeChangeDigest`, which fingerprints shipped code and must keep invalidating review/test provenance when it changes. A pathspec the local git cannot parse degrades to the unexcluded query — the noisier but true answer — never to a null source commit, which the staleness rule reads as fresh. In case of ambiguous capture failures in `gitLastCommit`, it throws an exception rather than silently returning null, so that a capture failure is not mistakenly folded into a 'fresh' judgment. A module with NO README stays stale by the coverage rule regardless of those timestamps — the coverage-gap finding is that verdict's carrier. A knowledge file reached through a symlink is enumerated like any other: containment is enforced by the canonical readers (realpath, reject outside the tree), never by skipping symlinks, since skipping one would drop a real measurement and let the budget gate fail open. A shallow clone's boundary commit time is a fabricated fact — degrade to skipped. When module-map is missing, phantom coverage must not be fabricated from Constitution fallback modules.
- WHEN a module's source commit is newer than every knowledge commit it has, THEN the module is stale, severity always WARN (never FAIL)
- WHEN only a sub-module file is updated and its commit is newer than the module's last source commit, THEN the module is NOT stale
- WHEN the README is the newer of the two knowledge files, THEN it is the one the source commit is compared against
- WHEN a module has no sub-module file, THEN `last_sub_module_commit` is absent and the verdict matches the README-only comparison
- WHEN a module has sub-modules but no README, THEN it is reported stale with its `coverage gap` finding, not by a timestamp comparison
- WHEN a commit under the module's paths touches ONLY registered generated artifacts, THEN `last_src_commit` does not move and that commit alone never makes the module stale
- WHEN one commit touches both a generated artifact and authored source, THEN it still counts as a source commit
- WHEN the excluded-pathspec query fails, THEN the collector falls back to the unexcluded query instead of reporting no source commit
- WHEN the `gitCapture` for `gitLastCommit` unambiguously fails (not just an empty log), THEN it throws an exception rather than returning null.

---

### REQ-LIB-024: [review-provenance Collector + Evaluator + computeChangeDigest]

**Feature:** drift-detection
**Story:** US-6

**Before:**
`computeChangeDigest` 依賴後續的 `git diff HEAD` 失敗來達到 fail closed，若因未來程式碼重排導致 `head === null` 但仍繼續執行，可能產生常數 digest，造成靜默開洞。

**After:**
在 `computeChangeDigest` 加入 `if (head === null) return null;` 防護，釘死 fail closed 不變式。

**Reason:**
避免未來重排程式碼導致靜默開洞。

**Acceptance Criteria:**
1. 當 `head === null` 時，`computeChangeDigest` 提早退出回傳 `null`。

**Priority:** Medium

**Spec:**
#### REQ-LIB-024: review-provenance Collector + Evaluator + computeChangeDigest
`computeChangeDigest(cwd)`: the content fingerprint = HEAD sha + `git diff HEAD` + untracked, covering the whole working tree (all first-party content that a review audits), using a **denylist** to exclude workflow state (`.prospec/`, `prospec-report.json`), generated artifacts (`.claude/`, `dist/`), and the lockfile — **fail-closed rather than fail-open** (first-party code outside `src`/`tests`, such as `scripts/`, is still included); it does not rely on git commit timestamps (the commit boundary is after verify S/A, and during review/verify the code is not committed). If `head === null`, it immediately returns `null` to defensively pin the fail-closed invariant against future refactoring. `collectReviewProvenance(cwd)` (I/O) enumerates `.prospec/changes/*` with status/scale/recorded digest/`backfill_draft_present` + the current digest; the `gitCapture` helper is shared by `gitLastCommit` and digest; `evaluateReviewProvenance` (pure function) judges every change whose status is in `PROVENANCE_AUDITED_STATUSES` (REQ-TYPES-075) — `implemented` **and** `verified`, so the window between verify and archive is audited rather than silently exempt — exempting backfill **only when proven** by `backfill-draft.md` (`scale` alone is hand-editable — same draft gating as test-provenance). `archived` is outside the registry because such a change is unreachable, not forgiven: its bundle has left `.prospec/changes/` and the collector never enumerates it. Because HEAD is inside the digest, the verify S/A feature commit itself stales the baseline; that red is honest and the remedy is the PB-016 order — commit, then re-record `--record-review` and `--record-tests`, then archive. **Both** digest captures fail closed: a `git diff HEAD` failure and an `ls-files` failure each return `null` (honest skip), never a constant digest that would certify stale code as current; each branch is pinned by a revert-red test (an unborn-HEAD repo reaches the diff branch on real git; selective fault injection covers the untracked listing).
- WHEN the recorded digest is absent, THEN fail "no review recorded"; WHEN recorded ≠ current, THEN fail "stale review"; match → no finding
- WHEN the change is `verified` and its code changed since the recorded review, THEN fail "stale review" — reaching grade S/A ends neither the audit nor the need to re-review
- WHEN a proven backfill (`backfill-draft.md` present) or a change whose status is outside `PROVENANCE_AUDITED_STATUSES`, THEN do not flag; an unproven `scale: backfill` gets no exemption; WHEN not git / no changes directory / digest null, THEN skipped + reason; findings codepoint-sort
- WHEN the change is `archived`, THEN no verdict exists at all — the collector cannot enumerate a bundle that archive has moved out of `.prospec/changes/`
- Single in-flight change assumption: one whole-tree digest is compared against each change (fail-closed, not fail-open); widening the audited statuses widens that over-blocking, never opens it

---

### REQ-TEMPLATES-153: [Verify dimension adjudication split + two-ledger grade]

**Feature:** sdd-workflow
**Story:** US-10

**Before:**
`skill-format.test.ts` 中對於 A-budget "every WARN counts against grade A's ≤ 2 budget" 的斷言使用嚴格的 `≤ 2 WARN` 正則，這對 LLM 產生的同義改寫（如 `at most two WARNs`）盲視並導致 false positive 測試失敗。

**After:**
擴充測試斷言正則表達式，使其能容忍 `at most two WARNs` 等合理的同義改寫。

**Reason:**
提升合約測試的強健性，避免因合理的文字代換導致 CI 失敗。

**Acceptance Criteria:**
1. `skill-format.test.ts` 的 A-budget 斷言能接受 `at most two WARNs` 與 `≤ 2 WARN`。

**Priority:** Low

**Spec:**
#### REQ-TEMPLATES-153: Verify dimension adjudication split + two-ledger grade
`prospec-verify` labels every dimension with its adjudicator — `[machine]` for 1/5, 4/5, 5/5, `[judgment]` for 2/5 and 6, `[mixed]` for 3/5 — and states the division once in `## Key Difference from Other Skills`. A machine dimension's verdict is the engine's, adopted verbatim; the NEVER list forbids overturning it and forbids reporting `not-adjudicated` as PASS. The report presents the two ledgers separately before the merged grade, and the grade itself is computed by `prospec verify record` from the same decision table rather than by hand. The contract tests (`skill-format.test.ts`) covering the Grade A's WARN budget text must be resilient to semantic rewrites (such as `at most two WARNs` instead of `≤ 2 WARN`).
- WHEN a machine dimension FAILs, THEN the grade is capped below S/A no matter how the narrative reads, and no number of judgment PASSes offsets it
- WHEN a machine check honestly skips, THEN the dimension is `not-adjudicated`, grade S is unreachable, and that WARN consumes grade A's budget like any other — every WARN counts, because the CLI is a required file: an unreachable engine is a probe STOP, not a gradable state
- WHEN `quality_log` is written, THEN each `dimensions[]` entry carries its `adjudicator`


## REMOVED

_No removals in this change._
