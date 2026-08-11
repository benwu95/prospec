# Delta Spec: enforce-counts-in-ci

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-TESTS-070: CI Enforces the Factual-Count Contract

**Feature:** sdd-workflow
**Story:** US-1, US-2

**Description:**
`pnpm counts:check` 從「存在但無人執行的檢查器」變成 CI 的一道閘門，且成本為零 —— 它改吃 `test:coverage` 已產出的 vitest JSON 報告而非重跑套件；同時由封閉集合的契約斷言釘住閘門枚舉本身與「閘門必須能讓 job 轉紅」，讓下一道被遺漏或被中和的閘門不再靜默通過。

**Acceptance Criteria:**
1. `test:coverage` 寫出 vitest JSON 報告；`ci.yml` 的 `test` job 在其後執行 `pnpm run counts:check --from <該報告>`，不再重跑一次套件；`--from` 為唯讀專用（改寫模式直接拒絕）
2. 契約斷言以**完整步驟清單**（含 `uses:` 動作、去版號）依序比對 baseline，另含「多行腳本不得內含套件管理器呼叫」「閘門不可被中和（顯式 no-op 不誤紅）」「讀寫路徑一致且 writer 真的會產出」三條
3. 13 個 mutation 各自轉紅（刪步驟／前移／`pnpm exec` 拼法／`uses:` 動作／`|| true`／`continue-on-error: true`／`if: false`／block scalar 內行首與**縮排**的套件管理器各一／windows-smoke 加 counts 步驟（單行、block 各一）／`test:coverage` 拿掉 `--reporter=json`／install 閘門被 continue-on-error 中和），6 個 false-red 防護維持綠（windows-smoke 的 counts 註解／動作版號升級／`continue-on-error: false`／`if: success()`／block scalar 內的 shell 註解與引號字串各一），控制組全綠

**Spec:**
The repository's own quality gates run in CI, and the gate list is itself pinned. `pnpm run test:coverage` writes a vitest JSON report alongside its coverage output, and `ci.yml`'s `test` job then runs `pnpm run counts:check --from <that report>`: the factual-count contract is gated by bucketing a run that already happened, not by running the suite a second time. `sync-counts` reads a report only when `--from` names one — there is no implicit discovery, because a leftover report would turn a measurement into a stale constant — an absent or unreadable report is an explicit skip, which fails `--check`, and the rewrite mode refuses the flag outright rather than writing numbers it cannot date. A contract assertion parses the real `ci.yml` and compares every STEP the `test` job runs, in order, against a version-controlled baseline — scripts by their whole command, actions as `uses:<name>` with the version stripped, a multi-line script as a single token whose body is separately asserted to run no package manager in command position. It also asserts that no command gate is neutralised and that the path the counts step reads is the path the coverage script writes and actually emits. The `windows-smoke` job deliberately runs no counts step: counts are platform-independent.
- WHEN a change adds or removes a counted file category and the counts are not re-derived, THEN CI's `test` job fails and names every stale count
- WHEN the counts match their source, THEN the step exits 0 and writes nothing — `--check` is read-only
- WHEN `--from` names a missing or unreadable report, THEN the count sources are reported unavailable and `--check` exits non-zero — the gate never passes on an unverified count
- WHEN `--from` is absent, THEN the script runs the suite itself, so the local `pnpm counts` path is unchanged
- WHEN `--from` is passed to the rewrite mode, THEN the script refuses with exit 1 and writes nothing — a caller-named report cannot be shown to be fresh, and the rewrite mode would stamp its numbers into every doc; the flag is read-only by construction
- WHEN any step in the `test` job is added, removed, reordered, or rewritten — as a script in any spelling, or as an action — THEN the contract assertion turns red until the baseline is updated in the same change; a multi-line script is compared as one token, so its body is governed by the next bullet rather than this one, and an action's version bump is not such a change and stays green
- WHEN a multi-line script in that job invokes a package manager — as the first word of a line at ANY indentation, or after a shell separator — THEN the assertion turns red: the baseline compares such a step as one token, so a gate must never hide in its body; naming one mid-line — in a quoted string, a comment, or behind another command word (`if`, `env`, `time`, `!`, a backtick substitution) — stays green: the guard covers command-position calls, not every conceivable invocation
- WHEN a command gate — the dependency install, or any `pnpm run` script in the baseline — or the job itself is given a truthy `continue-on-error` or a condition other than the default, THEN the contract assertion turns red: a gate that cannot fail the job is not a gate; the default spelled out explicitly (`continue-on-error: false`, `if: success()`) stays green, and the setup actions and reporting steps are out of scope — two of the latter legitimately carry `if: always()`, and a neutralised checkout or toolchain setup cascades into failures at every gate after it
- WHEN the coverage script's report path and the counts step's `--from` path disagree, or the coverage script stops emitting the JSON reporter that writes it, THEN the contract assertion turns red rather than leaving the gate to fail for a filename reason

**Priority:** High

---

## MODIFIED

### REQ-TESTS-059: Four-Layer Coverage of the cli-first Delegation

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
驗收情境寫「WHEN the suite runs, THEN `pnpm test` is green at ≥ 80% coverage and `pnpm counts:check` passes」—— 但沒有任何 workflow 執行 `counts:check`，這條宣稱只在有人手動跑它時成立。

**After:**
同一條情境改為指向 REQ-TESTS-070：計數閘門由 CI 執行，這條 REQ 不再自行擔保一個沒有執行者的結果。

**Reason:**
PB-003（claim ⊆ implementation）：規格宣稱的每一件事都必須有實際做那件事的路徑。帳本鍵 `docs/duplicated-count-drift` 已 freq=22 並在退役後復發，根因正是這條無執行者的宣稱被當成保護。

**Spec:**
The new engines and commands are covered at four layers: pure-engine unit tests in lib (`verify-grade`, `review-merge`, `lessons-ledger`, `artifact-validators`, `markdown-table`, including a bit-identical recomputation assertion), service and formatter unit tests, per-command e2e against a real temp project, and contract updates (probe single source, `bundled-templates-sync`, the startup-loading baseline, and the delegation wording pins). The negative assertions are mutation-verified.
- WHEN the suite runs, THEN `pnpm test` is green at ≥ 80% coverage; the factual-count contract is gated separately by REQ-TESTS-070, which is what actually runs `pnpm counts:check`
- WHEN a CLI-unavailable fallback phrase reappears under `skills/`/`agent-configs/`, or the shared probe stops being the single source, THEN a negative contract assertion turns red
- WHEN e2e runs, THEN each new command's success and refusal paths are exercised — the forward-only rejection, the validate-before-write refusal that leaves the file untouched, and `archive finalize --dry-run` writing nothing

**Priority:** Medium

---

## REMOVED

_No removals in this change._
