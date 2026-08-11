# Delta Spec: extend-provenance-audit-scope

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-TYPES-075: Provenance audit-scope registry

**Feature:** drift-detection
**Story:** US-1

**Description:**
把「哪些 change status 受兩道 provenance 閘門稽核」從 evaluator 內的字面常數收斂成 `types/change.ts` 的一份登記表，並附一個純述詞供兩個 evaluator 共用，使稽核範圍成為可被文件與測試指名的單一來源。

**Acceptance Criteria:**
1. `PROVENANCE_AUDITED_STATUSES` 以 `satisfies readonly ChangeStatus[]` 守衛，不在 `CHANGE_STATUSES` 內的字串造成編譯失敗
2. `isProvenanceAudited()` 對 `null`／`undefined`／未知字串／`Object` 原型鍵一律回傳 false
3. 兩個 evaluator 均透過該述詞判斷，沒有第二份集合

**Spec:**
`PROVENANCE_AUDITED_STATUSES` in `types/change.ts` is the ONE registry of change statuses the two provenance gates audit — `implemented` and `verified` — declared `as const satisfies readonly ChangeStatus[]` so a status that is not in `CHANGE_STATUSES` cannot enter it, and read through the pure `isProvenanceAudited(status)` predicate that both evaluators share instead of each testing a literal. It sits beside `SCALE_FORBIDDEN_ARTIFACTS` as the same kind of registry: an executable copy of a scope the lifecycle doc states in prose. Membership is tested through a `Set`, never a plain-object lookup, so an inherited key (`constructor`, `toString`) cannot resolve truthy and admit a change whose metadata carries a forged status. `archived` is deliberately absent and is NOT an exemption: `prospec archive` moves the bundle out of `.prospec/changes/`, so the collectors never enumerate such a change and no verdict about it exists to give.
- WHEN a status string outside `CHANGE_STATUSES` is added to the registry, THEN compilation fails on the `satisfies` clause
- WHEN `isProvenanceAudited` receives `null`, `undefined`, an unknown string, or an `Object` prototype key, THEN it returns false
- WHEN either evaluator filters by status, THEN it calls that predicate rather than comparing against a literal, so the two gates cannot drift into different scopes

**Priority:** High

---

### REQ-TEMPLATES-171: archive Entry Gate consumes both provenance checks

**Feature:** drift-detection
**Story:** US-2

**Description:**
`/prospec-archive` 的 Entry Gate 新增一條機器檢查條目，讀 `prospec check --json` 的 `review-provenance` 與 `test-provenance`，FAIL 即拒絕 archive，讓唯一會把 REQ 寫進信任區的站自己主張「review 與測試對應的是最終程式碼」。

**Acceptance Criteria:**
1. Entry Gate 段落同時指名兩個 check id，並寫明 FAIL → 不 archive
2. 修復指引涵蓋兩種成因：verify 後改碼（重跑 review/verify）與 commit 後未重刷 baseline
3. 沿用 metadata-completeness 條目的 CLI-required 語氣，不提供手動退回路徑
4. 明載重驗未達 S/A 時不可 archive——`status` 與 `metadata-completeness` 都不會反映新評級

**Spec:**
The `/prospec-archive` Entry Gate carries a machine check that runs `prospec check --json` and reads BOTH `review-provenance` and `test-provenance` for the archive target: either one FAIL refuses the archive. It closes the station's own blind spot — the gate that graduates REQs into the trust zone previously asserted nothing about whether any review round had seen the code those REQs describe. The remediation it names covers both causes the two findings distinguish: code edited after verify (re-run `/prospec-review`, then `/prospec-verify`) and a baseline left behind by the verify S/A commit (re-record both after committing, the order PB-016 states). Because that remediation routes back through verify, the item also states the boundary of the re-run: a change already at `verified` keeps that status whatever the new grade is, and `hasVerifyGrade` accepts any earlier S/A entry in `quality_log`, so a re-verify grading B/C/D leaves both `status` and `metadata-completeness` green while the change is not archivable. The CLI is required, matching the `metadata-completeness` item beside it: the shared probe STOPs before this gate when the engine is missing, so the item offers no manual fallback.
- WHEN either provenance check reports FAIL for the target, THEN the Entry Gate refuses to archive and names the remediation
- WHEN both report PASS or `skipped`, THEN the item passes and the remaining Entry Gate items judge as before
- WHEN the re-run of `/prospec-verify` does not reach S/A, THEN the change is not archivable even though `status` still reads `verified` — the item says so explicitly, because no machine check will
- WHEN the CLI is absent, THEN the probe has already stopped the skill — the item never degrades into a hand-run comparison

**Priority:** High

---

### REQ-TEMPLATES-172: `_status-lifecycle.md` states the provenance audit scope

**Feature:** drift-detection
**Story:** US-3

**Description:**
`_status-lifecycle.md` 的兩份副本新增一張逐 status 的 Provenance audit scope 表，明列受稽核與不受稽核的狀態及其理由，成為登記表的散文對照面，供契約測試雙向釘住。

**Acceptance Criteria:**
1. 兩份副本的 Provenance audit scope 表各自對得上登記表；指名的 marker 句則以字面子字串在兩份副本都出現（那是副本對副本的比對，與登記表無關）。整段逐字相等只存在於 `## What each gate checks`，本節沒有
2. 表格逐一列出六個 status 並標記是否受稽核
3. `archived` 的理由寫成「collector 列舉不到」而非「豁免」

**Spec:**
Both copies of `_status-lifecycle.md` (`init/status-lifecycle.md.hbs` and this project's `prospec/ai-knowledge/_status-lifecycle.md`) carry a `## Provenance audit scope` table that names, for every one of the six statuses, whether `review-provenance` and `test-provenance` audit it and why. `PROVENANCE_AUDITED_STATUSES` is the executable copy and a contract test pins the table against it by set equality in both directions, so the stated scope and the enforced scope cannot diverge — the failure this section exists to prevent was a gate whose filter excluded the very state it was meant to guard while no document admitted it. The table states the two non-audited groups as different facts, not one exemption: `story`/`plan`/`tasks` are before review is due, while `archived` is unreachable because the bundle has left `.prospec/changes/`.
- WHEN a status is added to or removed from the registry without the table following, THEN the contract test fails
- WHEN a reader asks which statuses the provenance gates cover, THEN the answer is in the lifecycle doc rather than only in the evaluator source
- WHEN either copy's table, or one of the marker sentences asserted in both, diverges, THEN the contract test fails. The section's remaining prose is deliberately NOT compared copy-to-copy: only `## What each gate checks` carries whole-section string equality between the two files, so claiming a copy-equality guard here would assert a check that does not exist

**Priority:** Medium

---

### REQ-TEMPLATES-173: review and verify are re-enterable from `verified`

**Feature:** drift-detection
**Story:** US-2

**Description:**
把 `verified` 納入稽核範圍後，「verify 之後帶著紅燈的變更」成為合法狀態，而清掉它必須重進 review 與 verify 兩站。這兩站的 status 前提、review 的 Error Handling 表、以及 `_status-lifecycle.md` 對 B/C/D 與 review 站位的敘述都必須承認這條路徑，否則新的補救指引在散文層自相矛盾。

**Acceptance Criteria:**
1. 兩站的 Entry Gate status 條目明載那是下限（`implemented` 或更後面），`verified` 可再進入
2. review 的 Error Handling 表以「status 早於 `implemented`」為拒絕條件（與 Entry Gate 的 floor 同一條件，涵蓋 `story`／`plan`／`tasks`），而非「不是 `implemented`」——後者連 `verified` 一起擋掉
3. verify 明載再進入時 B/C/D 讓 `verified` 原地保留，且該組合不可 archive
4. `_status-lifecycle.md` 兩份副本同步上述兩點，並記載 review 也會在 `verified` 之後重跑

**Spec:**
Widening the provenance audit scope to `verified` makes "a graded change carrying a red gate" a legitimate state, and clearing it requires re-entering both the review and verify stations. Their status precondition is therefore stated as a **floor** — `implemented` or later, a `verified` change included — and `/prospec-review`'s Error Handling table keys its refusal on the same condition the floor states, a status BEFORE `implemented` (`story`/`plan`/`tasks`), instead of on "not `implemented`", which also refused the very re-entry the archive Entry Gate prescribes and pointed the operator at `/prospec-implement`, a station that cannot help a graded change. Neither station needs a backward transition: review owns no status, and `prospec verify record` on an already-`verified` change writes its `quality_log` entry and reports `already verified — status unchanged`, which is success. `/prospec-verify` states the boundary of that re-entry: on B/C/D the status stays `verified` because status never regresses, and `hasVerifyGrade` still finds the earlier S/A entry, so the report — not `status` and not `metadata-completeness` — is what says the change is not archivable. Both `_status-lifecycle.md` copies carry the same two facts, so the canonical lifecycle admits the flow its skills describe.
- WHEN a `verified` change's baseline is stale, THEN it re-enters review and verify without any status regression, and each station's status item reads as satisfied
- WHEN `/prospec-review` meets a status at or past `implemented`, THEN its Error Handling table does not refuse it; a change still before `implemented` — `story`, `plan` or `tasks` alike — is the one sent to `/prospec-implement`
- WHEN a re-entering `verified` change grades B/C/D, THEN `status` stays `verified` and no machine check records the new grade — the verify report states it is not archivable
- WHEN either lifecycle copy omits the re-entry facts, THEN the contract test fails

**Priority:** High

---

### REQ-TESTS-073: Provenance audit-scope coverage

**Feature:** drift-detection
**Story:** US-1

**Description:**
以雙向測試釘住新的稽核範圍（verified 改碼轉紅、未改碼維持綠），並以契約測試釘住「文件宣稱的範圍 == 登記表」，兩者皆 mutation 驗證。

**Acceptance Criteria:**
1. 兩個 evaluator 各有 `verified` 的紅向與綠向案例
2. `story`/`plan`/`tasks` 仍不產生 finding；`verified` 的 proven backfill 仍豁免；`verified` 且 recorded 非零 exit 仍 FAIL
3. 契約測試以集合相等比對兩份 lifecycle 副本與登記表
4. 把登記表改回僅含 `implemented` 會讓紅向案例轉綠（mutation 驗證）
5. 新增的契約散文（兩站的 floor 措辭、再進入邊界、router 的閘門宣告）各自有斷言；被取代的宣稱另有負向斷言（review 的 `status not implemented` 拒絕列、lifecycle 的 `(stays implemented)` 括號），純新增的宣稱只有正向斷言

**Spec:**
The widened audit scope is pinned from both directions for each gate, and the stated scope is pinned against the registry rather than against the other document. `evaluateReviewProvenance` and `evaluateTestProvenance` each get a `verified` change with a stale baseline (FAIL) and a `verified` change with a matching baseline (no finding), alongside negative cases that the widening must not disturb: a `tasks` change stays unaudited, a `verified` proven backfill keeps its draft-gated exemption, and a `verified` change with a recorded non-zero exit still fails through the recorded-failure branch that outranks staleness. A contract test compares the `## Provenance audit scope` table in both `_status-lifecycle.md` copies against `PROVENANCE_AUDITED_STATUSES` by set equality — document-to-document agreement alone never proved either matched the code. The archive Entry Gate assertion slices that gate's section and then narrows to the provenance bullet: of its markers only `The CLI is required` appears elsewhere in the section, so section scope alone already goes red on removal, and the narrowing is what stops a weaker marker list from passing on the neighbouring `metadata-completeness` bullet. No count is stated here on purpose — the marker list grows with the bullet, and a number would go stale the next time it does. The prose this change adds to the review, verify and lifecycle documents is pinned too — with a **negative** assertion per reinstatable claim, since each was written to replace a sentence that contradicted the new scope. Every new assertion is mutation-verified: reverting the registry to `implemented` alone must turn the stale-`verified` cases red.
- WHEN the registry is reverted to `implemented` only, THEN the stale-`verified` cases for both gates fail
- WHEN the lifecycle table and the registry disagree in either direction, THEN the contract test fails
- WHEN the Entry Gate item is removed from the archive skill, THEN the bullet-scoped assertion fails
- WHEN a replaced claim is reinstated — review's `status not implemented` refusal row, or the lifecycle's unconditional `(stays implemented)` parenthetical — THEN its negative assertion fails
- WHEN the router's `verified` branch drops the provenance gate declaration, THEN its unit assertion fails
- WHEN a negative case (`tasks`, proven backfill, recorded non-zero exit) is evaluated, THEN its pre-existing verdict is unchanged

**Priority:** High

---

## MODIFIED

### REQ-LIB-024: review-provenance Collector + Evaluator + computeChangeDigest

**Feature:** drift-detection
**Story:** US-1

**Before:**
`evaluateReviewProvenance` 只判 `status==implemented`，其餘狀態一律不產生 finding。REQ 只陳述這個過濾，未陳述後果：`verified → archived` 這段窗口因此不受任何稽核。

**After:**
狀態過濾改讀 `PROVENANCE_AUDITED_STATUSES`（`implemented` + `verified`），並在 REQ 明載稽核範圍、`archived` 為「列舉不到」而非豁免，以及 verify S/A 的 feature commit 必然使 baseline 轉 stale、須依 PB-016 重刷。

**Reason:**
實測顯示 grade S/A 之後改碼時兩道閘門仍雙 PASS，archive 會把描述未經審查實作的 REQ 畢業進信任區（issue #125）。缺的不是新機制，而是既有機制的稽核範圍恰好排除了最需要它的狀態。

**Spec:**
`computeChangeDigest(cwd)`: the content fingerprint = HEAD sha + `git diff HEAD` + untracked, covering the whole working tree (all first-party content that a review audits), using a **denylist** to exclude workflow state (`.prospec/`, `prospec-report.json`), generated artifacts (`.claude/`, `dist/`), and the lockfile — **fail-closed rather than fail-open** (first-party code outside `src`/`tests`, such as `scripts/`, is still included); it does not rely on git commit timestamps (the commit boundary is after verify S/A, and during review/verify the code is not committed). `collectReviewProvenance(cwd)` (I/O) enumerates `.prospec/changes/*` with status/scale/recorded digest/`backfill_draft_present` + the current digest; the `gitCapture` helper is shared by `gitLastCommit` and digest; `evaluateReviewProvenance` (pure function) judges every change whose status is in `PROVENANCE_AUDITED_STATUSES` (REQ-TYPES-075) — `implemented` **and** `verified`, so the window between verify and archive is audited rather than silently exempt — exempting backfill **only when proven** by `backfill-draft.md` (`scale` alone is hand-editable — same draft gating as test-provenance). `archived` is outside the registry because such a change is unreachable, not forgiven: its bundle has left `.prospec/changes/` and the collector never enumerates it. Because HEAD is inside the digest, the verify S/A feature commit itself stales the baseline; that red is honest and the remedy is the PB-016 order — commit, then re-record `--record-review` and `--record-tests`, then archive. **Both** digest captures fail closed: a `git diff HEAD` failure and an `ls-files` failure each return `null` (honest skip), never a constant digest that would certify stale code as current; each branch is pinned by a revert-red test (an unborn-HEAD repo reaches the diff branch on real git; selective fault injection covers the untracked listing).
- WHEN the recorded digest is absent, THEN fail "no review recorded"; WHEN recorded ≠ current, THEN fail "stale review"; match → no finding
- WHEN the change is `verified` and its code changed since the recorded review, THEN fail "stale review" — reaching grade S/A ends neither the audit nor the need to re-review
- WHEN a proven backfill (`backfill-draft.md` present) or a change whose status is outside `PROVENANCE_AUDITED_STATUSES`, THEN do not flag; an unproven `scale: backfill` gets no exemption; WHEN not git / no changes directory / digest null, THEN skipped + reason; findings codepoint-sort
- WHEN the change is `archived`, THEN no verdict exists at all — the collector cannot enumerate a bundle that archive has moved out of `.prospec/changes/`
- Single in-flight change assumption: one whole-tree digest is compared against each change (fail-closed, not fail-open); widening the audited statuses widens that over-blocking, never opens it

**Priority:** High

---

### REQ-LIB-033: Test command resolution, execution and the test-provenance evaluator

**Feature:** drift-detection
**Story:** US-1

**Before:**
`evaluateTestProvenance` 同樣只判 `status==implemented`，因此 verify 之後改碼不會讓已記錄的測試結果轉 stale。

**After:**
狀態過濾改讀同一份 `PROVENANCE_AUDITED_STATUSES`，其餘判序（recorded failure → command-unavailability skip → 無記錄 → stale）與所有平台語意完全不變。

**Reason:**
兩道閘門是同一個缺口的兩半：只收緊 review 而放過測試，archive 仍可能收下一份對不上最終程式碼的測試記錄。範圍必須同源，才不會再分岔。

**Spec:**
`resolveTestCommand(config, cwd)` in `lib/config.ts` (the canonical resolver, alongside `resolveBasePaths`/`resolveKnowledgeTokenBudget`): `tech_stack.test_command` wins; otherwise `<package_manager> test` **only when package.json declares a test script**; neither → `null`. `lib/test-runner.ts`'s `runTestCommand` uses `spawnSync` with `shell: false` and `killSignal: 'SIGKILL'` — shell syntax (pipes, `&&`, redirection) is **deliberately unsupported**, and the kill bounds the direct child only (grandchildren are a documented exclusion, not a claim). `collectTestProvenance` (I/O, in `drift-sources`) reports the recorded command/exit code/digest plus whether `backfill-draft.md` exists; an unresolvable test command is **not** source unavailability — it lands in `command_unavailable_reason` while the changes are still enumerated, so recorded facts survive it (only git-worktree absence, a missing changes dir, or an uncomputable digest stay source-level unavailable). Pure `evaluateTestProvenance` audits the statuses in `PROVENANCE_AUDITED_STATUSES` (REQ-TYPES-075) — the same registry review-provenance reads, so the two gates cannot cover different windows — and grades in a fixed order: recorded failure → command-unavailability skip → no record → stale.
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

**Priority:** High

---

### REQ-TESTS-042: review-provenance engine tests

**Feature:** drift-detection
**Story:** US-1

**Before:**
場景清單把「不受稽核」寫成 `non-implemented`。

**After:**
改稱「outside the audit scope」，並指向 REQ-TESTS-073 承載的 `verified` 雙向覆蓋。

**Reason:**
`verified` 現在既是 non-implemented 又受稽核，舊用語會讓讀者以為 verify 之後不受檢——正是本變更要消滅的那種未被承認的宣稱（PB-007 同族清掃）。

**Spec:**
`evaluateReviewProvenance` six scenarios (absent/stale/fresh/backfill/outside-the-audit-scope/unavailable — the audited statuses themselves, and the `verified` cases in particular, are covered by REQ-TESTS-073), `computeChangeDigest` (temp git dir: changing `src`/`scripts`/docs content flips the digest, changing only `.prospec/`/report/generated does not), `collectReviewProvenance`, `check.service` injection + `--record-review` writes metadata + `--strict` FAIL → exit 1 + backfill skipped — mutation-verified.

**Priority:** Medium

---

### REQ-TESTS-056: Engine tests for the new collectors and evaluators

**Feature:** drift-detection
**Story:** US-1

**Before:**
`evaluateTestProvenance` 的場景清單同樣以 `non-implemented` 指稱不受稽核的狀態。

**After:**
改稱「outside the audit scope」，其餘每一項（判序、平台形狀、shim 分類、revert-red mutation pin）逐字不動。

**Reason:**
與 REQ-TESTS-042 同一處用語漂移；兩道閘門的測試描述必須同時收斂，否則下一個讀者會從其中一份得到相反結論。

**Spec:**
`evaluateTestProvenance` (missing / stale / non-zero exit / stale+failing precedence / proven-backfill exemptions / unproven backfill / outside-the-audit-scope / unavailable — the audited statuses, `verified` included, are covered by REQ-TESTS-073), `evaluateConstitutionSeverity`, `parseConstitutionRules` (fence-aware, untagged, unknown tag, level-1 heading closes the section), `aggregateEscapedDefects`, `resolveTestCommand`, `runTestCommand` (exit code / timeout, driven by `process.execPath` so it can never recurse into the project suite), and all three collectors against temp-git fixtures. Shim classification is tested through an **injected** probe so the win32 branch runs on any host: non-win32 always spawnable, a real `.exe` in any PATH directory beating an earlier `.cmd`, `.com` accepted, a shim reported only when no directory holds a startable file, a declared extension short-circuiting the search, a path never searched on PATH, a negative assertion that PATHEXT does not influence the verdict, and `defaultExecutableProbe.exists` across file / directory / missing. A `describe.runIf(process.platform === 'win32')` block additionally pins the real-host behaviour and runs once a Windows job exists — the injected tests prove the decision, that one proves the reality. The digest self-trip guard is **derived from the report filename constants**, not hand-listed, so a future report joins it by construction. Every headline hardening carries a **revert-red mutation pin**: the recorded-failure-vs-unresolvable-command ordering test (red under the old skip-first collector), the mixed-alias `passed=1` fixture (reproduces the schema abort pre-fix), the unborn-HEAD fixture reaching the `diff === null` branch on real git, and a selective `child_process` fault injection for the `ls-files` capture (its own file, `vi.setConfig` 30s like every git-bound suite).

**Priority:** Medium

---

### REQ-LIB-035: Pure Route Evaluator

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
`verified` 分支只宣告兩道 blocking gate（只有 `verified` 可 archive、affected-module Knowledge 已同步）。

**After:**
加入第三道宣告：review/test provenance 必須對應最終程式碼，並指名「commit 後重刷」這個補救。

**Reason:**
`verified` 進入稽核範圍後，兩道 provenance 閘門就是 verified→archive 這條邊上的活閘門，而 router 自稱是 `_status-lifecycle.md` 的 executable copy。少報等於 `prospec status`——CLAUDE.md 指定的 session-start 阻擋閘門報告者——恰好對本變更唯一擴大稽核的狀態說「沒有其他阻擋」。

**Spec:**
`lib/status-router.ts` exposes the I/O-free `routeChange(facts)` — the executable copy of `_status-lifecycle.md`: six-state order, the `scale: quick` story→tasks legal skip, the `scale: backfill` `implemented` entry (absent plan/tasks are its normal state), the design station insertion (`ui_scope` full/partial between plan and tasks, never under a scale with no plan), review done-ness via `review_provenance`, verify B/C/D stay reasons, and the archive gate declarations — Knowledge sync **and** review/test provenance currency, the latter live on this edge because `verified` is inside `PROVENANCE_AUDITED_STATUSES` and the verify S/A commit stales both baselines by construction. Those gates are **declared, never evaluated**: the router stays I/O-free and never reads the drift report, so `prospec check` remains the only adjudicator. Which stations a scale skips is read from `SCALE_FORBIDDEN_ARTIFACTS`, not from a scale name re-tested here.
- WHEN the full status × scale matrix runs, THEN every computed station matches `_status-lifecycle.md` (fixture-pinned; retro-validated 46/46 against the local archive at verification)
- WHEN `scale: quick` at `story`, THEN next is tasks and plan.md is never gated on; WHEN `scale: backfill` at `implemented`, THEN it is a legal entry, not a skip
- WHEN `status: implemented` without `review_provenance`, THEN next is review (by workflow order, not status); with it, next is verify
- WHEN `status: verified`, THEN the blocking gates name review/test provenance currency alongside Knowledge sync, and the remedy they name is re-recording both baselines after the commit
- WHEN the function runs, THEN it performs no I/O (drift-checker evaluator precedent)
- WHEN a scale forbids `plan.md` but not `tasks.md`, THEN `story` routes to `tasks` (the quick skip) — derived from the registry, not from the scale's name
- WHEN a scale forbids both `plan.md` and `tasks.md` and the change has not reached `implemented`, THEN it routes to `promote` with the incomplete promotion as the reason, and its blocking gate names `prospec validate promote-scaffold`
- WHEN such a change reaches `implemented`, THEN routing resumes at the normal review/verify/archive path, and the completed station it reports is `promote` — never `implement`, a station that scale's contract never let it run
- WHEN a scale's contract has no plan, THEN the design station is never suggested for it at any status (design hangs off `plan`), keyed on the artifact registry rather than the scale's name

**Priority:** Medium

---

## REMOVED

_No removals in this change._

## Story Convergence（archive Phase 3.5 必做，機械合併碰不到）

`prospec archive` 的 `mergeRequirementInPlace` 從 `#### REQ-…` 起算、遇下一個 h2–h4 或 `---` 停止，因此 **User Story 敘事與 `**Acceptance Scenarios:**` 條列永遠不在替換範圍內**。`prospec/specs/features/drift-detection.md` 的 US-6／US-9 仍以 `implemented` 為唯一稽核狀態，其中兩條直接與出貨行為相反，且沒有任何測試會抓到。graduation 時必須人工收斂：

| 位置 | 現況 | 應收斂為 |
|------|------|----------|
| US-6 AC，`:175` | `WHEN the change is `scale: backfill` or its status is not `implemented`, THEN do not flag (exempt)` | 狀態條件改為「outside `PROVENANCE_AUDITED_STATUSES`」——**與出貨行為相反，必改** |
| US-9 AC，`:282` | `WHEN the change's status is not `implemented`, THEN do not flag (exempt)` | 同上——**與出貨行為相反，必改** |
| US-6 story `:168`、AC `:172` | 「an `implemented` non-backfill change」 | 改為受稽核狀態；現況只是範圍過窄，非假敘述 |
| US-9 story `:273`、AC `:277` | 「an `implemented` change」 | 同上 |

行號以 archive 執行前的檔案為準；graduation 時請以文字比對而非行號定位（PB-015：對照合併後的檔案本身）。
