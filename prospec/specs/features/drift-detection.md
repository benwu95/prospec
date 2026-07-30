---
feature: drift-detection
status: active
last_updated: 2026-07-30
story_count: 12
req_count: 41
---

# Deterministic Drift Check

## Who & Why

**Target users**: Developers who keep spec and code in sync; maintainers who guard the team's main branch

**Problem solved**: G2 "spec is the source of truth" was previously verified only by a manual LLM check during development — referential drift (dangling REQ-ID references, broken file paths, reversed import dependency direction, stale Knowledge, incomplete code tasks) accumulates silently, with no gatekeeping at the CI layer.

**Why it matters**: `prospec check` is a fully deterministic, zero-LLM, zero-token mechanical checker — the same repo state produces a byte-for-byte identical report, and it can be enforced in the CI main pipeline. Honest boundary: semantic consistency still belongs to `/prospec-review` (the report always marks it `not-checked`); whenever a source is unavailable it is always explicitly `skipped` + reason, and faking a PASS is strictly prohibited.

## User Stories & Behavior Specifications

### US-1: Structural consistency check command [P1]

As a developer who keeps spec and code in sync,
I want a deterministic `prospec check` command that detects dangling REQ-ID references, broken file-path references, and direction-violating module dependencies,
so that structural drift is caught by a machine before it accumulates into real chaos.

**Acceptance Scenarios:**
- WHEN a document references a REQ-ID that does not exist in `specs/features/`, THEN report FAIL and list the reference location (file + line number)
- WHEN a markdown relative link points to a nonexistent in-repo file, THEN report FAIL (placeholder / glob / out-of-repo targets are not checked)
- WHEN an import violates the `module-map.yaml` `depends_on` declaration, THEN report FAIL and list the violating edge
- WHEN run twice consecutively against the same repo state, THEN results are completely identical (zero LLM, zero network)

#### REQ-LIB-014: Deterministic structural drift engine
A zero-LLM pure-function evaluator; the collector (I/O) is separated from the evaluator (pure function). The REQ definition source = `specs/features/` headings (excluding `_archived*`); fenced code block content is not scanned (CommonMark closing rule: same character, ≥ length, no info string); dependency direction follows the project's `module-map.yaml` `depends_on` (falling back to Constitution layering when absent), applicable to any prospec project.
**Scenarios:**
- WHEN any of the three violation categories appears, THEN the finding contains `source_path` + `line`, sorted by (check, path, line number) codepoint
- WHEN module-map exists but its schema is invalid, THEN throw a typed error (fail loudly, do not silently switch rule sets)
- WHEN module-map paths point outside the repo, THEN that path is clamped and does not drive scanning or file reads
- WHEN a module-map paths entry is a single source file, THEN import-edge collection scans only that file itself (file/dir/glob determined by `classifyModulePath`); non-source-file entries produce no import edges (no longer expanded to `<file>/**` and hitting ENOTDIR)

---

### US-2: Knowledge health check [P2]

As a developer who relies on AI Knowledge to judge context trustworthiness,
I want check to compare module source code against its README by git commit timestamp and report coverage,
so that whether Knowledge is stale can be judged rather than blindly trusted.

**Acceptance Scenarios:**
- WHEN a module's last src commit is later than its last README commit, THEN mark the module stale, severity always WARN (never FAIL)
- WHEN the report is produced, THEN the `knowledge_health` field is a frozen contract (modules[]{name, last_src_commit, last_readme_commit, stale} + coverage{documented, total}), consumed directly by downstream (Knowledge Flywheel, MCP server)
- WHEN git timestamps are unavailable (non-git / shallow clone) or module-map is missing, THEN the check is `skipped` + reason

#### REQ-LIB-015: Knowledge health check (git timestamps)
The comparison source is git log timestamps (file mtime is distorted after a CI checkout and does not participate in the judgment); timestamps are compared by epoch (%cI carries each one's own timezone offset). A shallow clone's boundary commit time is a fabricated fact — degrade to skipped. When module-map is missing, phantom coverage must not be fabricated from Constitution fallback modules.

---

### US-3: Code-task completion-rate check [P2]

As a developer who confirms work completeness before archiving,
I want check to compute the completion rate from code tasks only, per the frozen kind schema,
so that the completion rate reflects real code work and is not distorted by manual/verification tasks.

**Acceptance Scenarios:**
- WHEN an active change has unchecked code tasks, THEN report FAIL including the list and locations
- WHEN all unchecked tasks are `[M]`/`[V]`, THEN do not judge FAIL
- WHEN `.prospec/changes/` is absent (e.g., a CI checkout), THEN `skipped (source unavailable)`

#### REQ-LIB-016: Kind-aware task completion-rate check
The only executable copy of the kind grammar lives in `lib/task-markers.ts` (`parseTaskLine()`), consumed jointly by the drift engine and archive task stats — the two never diverge on the same tasks.md.

---

### US-4: Machine-readable report and CI gate [P1]

As a maintainer who guards the team's main branch,
I want a machine-readable `prospec-report.json`, `--strict` exit semantics, and a hardened CI workflow template,
so that drift checks are enforced in the CI main pipeline without burning any tokens.

**Acceptance Scenarios:**
- WHEN run with `--json`, THEN the report schema is layered into structural/semantic, with semantic always `not-checked`
- WHEN run with `--strict` and a FAIL exists, THEN exit 1; WARN and skipped never affect the exit code
- WHEN the report contains skipped checks, THEN both the report and the PR comment explicitly state the reason and do not count toward PASS

#### REQ-TYPES-027: Drift Report Schema (extend with two check ids)

#### REQ-SERVICES-027: Check Service thin orchestration
`execute()` pattern: collect → evaluate → schema-validate → (--json) atomicWrite the report; `--init-ci` renders the workflow template (rerun-safe, does not overwrite); the Result contains `hasFail`, and the exit-code decision stays in the cli layer.

#### REQ-CLI-011: `prospec check` command
Flags `--json`/`--strict`/`--init-ci`; the human-readable output lists each of the five checks with its own status (skipped explicitly attaches a reason); untrusted repo strings are output after `sanitizeTerminal()` filters C0/C1 control characters.

#### REQ-TEMPLATES-091: CI Workflow template
Two jobs: check (checkout `fetch-depth: 0` → `--strict --json` (`shell: bash` enables pipefail, tee must not mask the exit code) → report artifact) + comment (**no checkout**, only downloads the artifact, an off-the-shelf sticky action posts a 4-space-indented code block — no fence can escape, `head -c 60000` cap). Supply-chain hardening is the default: third-party actions are pinned to full commit SHAs, minimal-privilege `permissions:`.

---


#### REQ-LIB-018: dangling-prefix drift (REQ-prefix validity lint, warn-class)

---


#### REQ-LIB-019: feature-modules self-validating drift (validates the modules edge, fail-class)

---


#### REQ-TESTS-031: feature-map drift collector/evaluator tests

---

## US-5: README factual-count truthfulness check [P2]

As a developer who keeps README and code consistent,
I want check to mechanically compare the counts a module README declares (e.g., "registers N resources") against the actual count in the code it names,
so that factual-count drift is intercepted by a machine in CI, no longer relying solely on humans.

**Acceptance Scenarios:**
- WHEN a module README's declared count does not match the actual count in the code it names, THEN report WARN (including README `file:line` + expected vs actual)
- WHEN counts match, there is no parseable declaration, or the declaration falls inside a fenced code block, THEN do not report (no false positives)
- WHEN module-map is missing, THEN `mcp-readme-counts` is skipped (with reason), never faking a PASS

#### REQ-TYPES-034: Drift Report mcp-readme-counts Check Id
`DRIFT_CHECK_IDS` renames `readme-counts` → `mcp-readme-counts` (name matches reality: scope is only MCP registration counts, not generic README counts; does not touch the `knowledge_health` frozen contract). For the current total number of frozen check ids see REQ-TYPES-052 (**13**).

#### REQ-LIB-020: README count collector + evaluator
`collectMcpReadmeCounts` (I/O: a whitelist pattern captures README count declarations + counts `registerResource`/`registerTool` in the named file; string/template-literal/fenced-block-aware counting; skips the claim when the source is missing) + pure `evaluateMcpReadmeCounts` (declared ≠ actual → warn finding).
**Scenarios:**
- WHEN the README declares N but the named code has M (N≠M), THEN a warn finding: severity `warn`, `source_path`=README, detail contains expected/actual
- WHEN module-map is missing, THEN `skipped` + reason; the evaluator stays I/O-free, findings codepoint-sort

#### REQ-SERVICES-034: check.service injects the mcp-readme-counts collector
`check.service` injects `collectMcpReadmeCounts` into `runChecks` (when moduleMap is missing it degrades to `{available:false}`, sharing the `moduleMapMissing` helper with `timestamps`).

---

## US-6: review-provenance gate check [P1]

As a maintainer who guards the verify gate,
I want a deterministic `review-provenance` check that determines whether an `implemented` non-backfill change has a recorded review that still reflects the current code,
so that "review must precede verify" turns from process prose into a machine-checkable, testable gate.

**Acceptance Scenarios:**
- WHEN an `implemented` non-backfill change has no recorded review baseline, THEN report FAIL "no review recorded" (points to `/prospec-review`)
- WHEN the recorded review digest does not match the current code fingerprint (code changed after review), THEN report FAIL "stale review"
- WHEN the digest matches, THEN PASS (no finding)
- WHEN the change is `scale: backfill` or its status is not `implemented`, THEN do not flag (exempt)
- WHEN not a git repo / `.prospec/changes/` is absent / the digest cannot be computed, THEN the check is `skipped` + reason (never a fake PASS)

#### REQ-TYPES-052: Drift Report review-provenance Check Id
`DRIFT_CHECK_IDS` appends `review-provenance` (additive-only; does not touch the `knowledge_health` frozen contract) — **13** frozen check ids in total (the 11th is `knowledge-size` from US-8; the 12th `test-provenance` and 13th `constitution-severity` arrive with US-9/US-10, see REQ-TYPES-065). Failing to dispatch the corresponding evaluator in `runChecks` causes a compile failure (the `Record<DriftCheckId, CheckOutcome>` type exhaustiveness guard).

#### REQ-LIB-024: review-provenance Collector + Evaluator + computeChangeDigest
`computeChangeDigest(cwd)`: the content fingerprint = HEAD sha + `git diff HEAD` + untracked, covering the whole working tree (all first-party content that a review audits), using a **denylist** to exclude workflow state (`.prospec/`, `prospec-report.json`), generated artifacts (`.claude/`, `dist/`), and the lockfile — **fail-closed rather than fail-open** (first-party code outside `src`/`tests`, such as `scripts/`, is still included); it does not rely on git commit timestamps (the commit boundary is after verify S/A, and during review/verify the code is not committed). `collectReviewProvenance(cwd)` (I/O) enumerates `.prospec/changes/*` with status/scale/recorded digest/`backfill_draft_present` + the current digest; the `gitCapture` helper is shared by `gitLastCommit` and digest; `evaluateReviewProvenance` (pure function) judges only `status==implemented`, exempting backfill **only when proven** by `backfill-draft.md` (`scale` alone is hand-editable — same draft gating as test-provenance). **Both** digest captures fail closed: a `git diff HEAD` failure and an `ls-files` failure each return `null` (honest skip), never a constant digest that would certify stale code as current; each branch is pinned by a revert-red test (an unborn-HEAD repo reaches the diff branch on real git; selective fault injection covers the untracked listing).
**Scenarios:**
- WHEN the recorded digest is absent, THEN fail "no review recorded"; WHEN recorded ≠ current, THEN fail "stale review"; match → no finding
- WHEN a proven backfill (`backfill-draft.md` present) or a non-implemented change, THEN do not flag; an unproven `scale: backfill` gets no exemption; WHEN not git / no changes directory / digest null, THEN skipped + reason; findings codepoint-sort
- Single in-flight change assumption: one whole-tree digest is compared against each change (fail-closed, not fail-open)

#### REQ-SERVICES-062: check.service injection + --record-review write path
`check.service` injects `collectReviewProvenance` into `runChecks`; the `--record-review` branch uses `resolveChange` (`--change` can specify it, guarded by `existsSync`; if metadata is not found it honestly skips) → `computeChangeDigest` → a comment-preserving Document writes the metadata `review_provenance` (following the flag-gated side effects of `--json`/`--init-ci`; the pure check path stays read-only and deterministic).

#### REQ-CLI-012: prospec check --record-review flag
`prospec check` adds `--record-review` (records the review baseline then exits) and `--change <name>` (targets record-review when multiple changes run in parallel), alongside `--json`/`--strict`/`--init-ci`; when the flags are absent, behavior is completely identical to the current one.

#### REQ-TESTS-042: review-provenance engine tests
`evaluateReviewProvenance` six scenarios (absent/stale/fresh/backfill/non-implemented/unavailable), `computeChangeDigest` (temp git dir: changing `src`/`scripts`/docs content flips the digest, changing only `.prospec/`/report/generated does not), `collectReviewProvenance`, `check.service` injection + `--record-review` writes metadata + `--strict` FAIL → exit 1 + backfill skipped — mutation-verified.

## US-7: metadata-completeness gate check [P1]

As a maintainer who guards the archive gate,
I want a machine-checkable `metadata-completeness` check that determines whether each change's metadata.yaml has complete fields and, for verified/archived ones, has a recorded verify S/A grade,
so that incomplete or ungraded metadata cannot quietly enter the permanent record (the same protection level as "only archive verified").

**Acceptance Scenarios:**
- WHEN a change's metadata is missing any of `name`/`created_at`/`status`/`scale`, THEN report FAIL and list the missing items
- WHEN a change is `status: verified`/`archived` but `quality_log` has no `prospec-verify` S/A grade, THEN report FAIL
- WHEN a change is in-progress (story/plan/tasks/implemented), THEN do not apply the grade rule (no false-block)
- WHEN metadata is empty/comment/null/non-mapping (parseYaml returns null without throwing), THEN report all fields missing, never crashing
- WHEN there is no `.prospec/changes/`, THEN the check is `skipped` + reason (never a fake PASS)

#### REQ-TYPES-055: Drift Report metadata-completeness Check Id
`DRIFT_CHECK_IDS` appends `metadata-completeness` (the 10th frozen check id, FAIL-class; additive-only, does not touch the `knowledge_health` frozen contract). Failing to dispatch the corresponding evaluator in `runChecks` causes a compile failure (the `Record<DriftCheckId, CheckOutcome>` exhaustiveness guard).

#### REQ-LIB-025: metadata-completeness Collector + Evaluator
`collectMetadataCompleteness(cwd)` (I/O) enumerates `.prospec/changes/*` and reads metadata: it checks the existence of `REQUIRED_METADATA_FIELDS` (name/created_at/status/scale) + `hasVerifyGrade` for `GRADED_STATUSES` (verified/archived) ones — prioritizing the structured `grade ∈ {S,A}` of the `prospec-verify` entry, keeping the legacy `result ∈ {S,A}` fallback so that existing archived metadata still passes; `skill`/`grade`/`result` are **trimmed before comparison** (these rows come off raw YAML with no schema pass — an exact match on `"A "` would flip a genuinely verified change into a FAIL-class finding); a non-mapping parse (empty/comment/null) is treated as all fields missing, not a crash. Pure `evaluateMetadataCompleteness` emits a fail finding for each missing field and each missing grade; in-progress does not apply the grade rule. The `metadata-completeness` check id is unchanged.
**Scenarios:**
- WHEN a required field is missing, THEN fail listing the missing items; WHEN verified has a structured grade S/A or a legacy result S/A, THEN pass; WHEN verified has neither, THEN fail; in-progress is exempt from the grade
- WHEN metadata is empty/null, THEN an all-fields-missing finding (does not deref null); no changes directory → skipped + reason; findings codepoint-sort

#### REQ-SERVICES-063: check.service injects the metadata-completeness collector
`check.service` injects `collectMetadataCompleteness` into `runChecks`, wired the same way as `collectReviewProvenance`; the pure check path stays read-only and deterministic.

#### REQ-TEMPLATES-142: archive Entry Gate consumes metadata-completeness
The `/prospec-archive` Entry Gate adds a machine check: run `prospec check --json` and read `metadata-completeness`, FAIL → refuse archiving (when the CLI is absent, fall back to reading that change's metadata directly); prevents incomplete/ungraded metadata from entering the permanent record.

#### REQ-TESTS-045: metadata-completeness engine tests
`evaluateMetadataCompleteness` (pass / each field missing / verified-no-grade / in-progress-exempt / both-findings), `collectMetadataCompleteness` (changes-dir fixture: complete / stub / present-but-empty / verified-no-grade / verified-with-A / empty-null-comment / unparseable), `check.service` injection + skipped-never-PASS across all 13 checks (including knowledge-size, test-provenance and constitution-severity) — the S/A clause and the skill clause mutation-verified.

---

## US-8: knowledge-size budget check [P2]

As a maintainer who maintains the effectiveness of layered knowledge loading,
I want a deterministic `knowledge-size` check that counts tokens/lines for index.md, the core conventions, and each module README and compares them against the declared budget,
so that the layered token budget — long declared but never mechanically enforced — becomes a machine-checkable warn, preventing the layered model's effectiveness from silently eroding change by change.

**Acceptance Scenarios:**
- WHEN an L1 file (index.md or a core convention) exceeds the per-file token budget, THEN report WARN (including `source_path` + measured token/budget + `TOKEN_ESTIMATOR_LABEL`)
- WHEN a module README's tokens exceed the per-module budget or its line count exceeds the readme line-count cap, THEN report WARN (tokens and lines each form an independent finding)
- WHEN the file size is `≤` the budget, THEN do not report (boundary inclusive)
- WHEN the knowledge base does not exist, THEN `knowledge-size` is skipped (with reason), never faking a PASS
- WHEN `.prospec.yaml` sets `knowledge.token_budget`, THEN override `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` field by field; otherwise use the default

#### REQ-TYPES-060: Drift Report knowledge-size Check Id
`DRIFT_CHECK_IDS` appends `knowledge-size` (the 11th frozen check id, **warn-class**; additive-only, does not touch the `knowledge_health` frozen contract). Failing to dispatch the corresponding evaluator in `runChecks` causes a compile failure (the `Record<DriftCheckId, CheckOutcome>` exhaustiveness guard).

#### REQ-TYPES-061: token_budget honest naming + DEFAULT single source
`TokenBudgetSchema` renames the fields `l0_max` → `l1_per_file` and `l1_per_module` → `l2_per_module` (`readme_max_lines` unchanged, all optional), aligning name with reality to index.md's L1/L2 semantics. It adds `DEFAULT_KNOWLEDGE_TOKEN_BUDGET = {l1_per_file:1800, l2_per_module:1000, readme_max_lines:100}` as the **single authoritative source** for the knowledge-size thresholds and index.md's declaration (the old field names were dead config, never read by the code). The default values were honestly calibrated by slim-knowledge-l1-l2 (#64): 1500/400 was too tight for already well-disciplined index/README, 1800/1000 is the structural lower bound and still warn-class as an anti-regression ratchet; `.prospec.yaml` can override field by field, and the init seed is synced. Since inject-resolved-knowledge-budgets, this single source is also injected — via `lib/config`'s `resolveKnowledgeTokenBudget` + agent-sync — into the budget rendering of generated skill templates (templates no longer hardcode budget numbers or a named `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`); `KnowledgeSizeBudget` (the resolved type) moves from `lib/drift-sources` to `types/config`.

#### REQ-LIB-027: knowledge-size Collector + Evaluator
`collectKnowledgeSize(cwd, baseDir, knowledgePath, budget)` (I/O): using the canonical contained readers (`readIndex`/`readContainedFile`/`readModuleReadme`) it reads index.md + `CORE_CONVENTIONS` (L1) and `modules/*/README.md` (L2), `estimateTokens` counts tokens, `countLines` counts lines; the module name is derived from the README path (no module-map needed); if `knowledgePath` does not exist → `{available:false, reason}`. Pure `evaluateKnowledgeSize`: `!available → skipped`; an L1 file with tokens > `l1_per_file`, an L2 README with tokens > `l2_per_module` or lines > `readme_max_lines` → warn finding; L0 is out of scope.
**Scenarios:**
- WHEN an L1/L2 file exceeds the limit, THEN a warn finding (`source_path` + detail contains measured/budget/`TOKEN_ESTIMATOR_LABEL`); the `≤` boundary is not reported
- WHEN the knowledge base is absent, THEN `skipped` + reason; the evaluator is I/O-free, findings codepoint-sort

#### REQ-LIB-028: resolveKnowledgeTokenBudget canonical helper (lib/config)
`resolveKnowledgeTokenBudget(config): KnowledgeSizeBudget` lives in `lib/config.ts` (config resolution, the same category as `resolveBasePaths`/`resolveArtifactLanguage`), overriding `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` field by field with `config.knowledge?.token_budget`; the `KnowledgeSizeBudget` type lives in `types/config`. Both `check.service` and `agent-sync` import this single source from `lib/config`, with no duplicate implementation and no service→service coupling (PB-006/PB-007, dependency direction `cli→services→lib→types`).

#### REQ-SERVICES-065: check.service injects the knowledge-size collector
`check.service.execute` injects `collectKnowledgeSize(cwd, paths.baseDir, paths.knowledgePath, resolveKnowledgeTokenBudget(config))` into `runChecks`; `resolveKnowledgeTokenBudget` (imported from `lib/config`, see REQ-LIB-028) has `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` overridden field by field by `config.knowledge?.token_budget`; the pure check path stays read-only and deterministic.

#### REQ-TEMPLATES-149: init scaffold adopts the renamed budget fields
The `knowledge.token_budget` seed in `init/prospec.yaml.hbs` switches to `l1_per_file`/`l2_per_module`/`readme_max_lines`, with values consistent with `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`.

#### REQ-TESTS-048: knowledge-size engine tests + single-source assertion
`evaluateKnowledgeSize` (over-L1 / over-L2-tokens / over-L2-lines / boundary / skipped / config-override); `collectKnowledgeSize` (temp fixture: over-limit + compliant + missing knowledgePath skipped); `drift-report.test.ts` frozen count 10→11 + adds the id to the list; **single-source test**: reads the repo's `prospec/index.md`, extracts the L1/L2 budget numbers, and asserts == `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` (a mismatch is a FAIL, mutation-verified).

---

## US-9: test-provenance gate check [P1]

As a maintainer who guards the verify gate,
I want a deterministic `test-provenance` check that decides whether an `implemented` change has a recorded test run that is current and green,
so that verify's test dimension is a machine verdict instead of an agent's self-report.

**Acceptance Scenarios:**
- WHEN an `implemented` change has no recorded test run, THEN report FAIL naming `prospec check --record-tests` as the remediation
- WHEN the recorded run predates the current code, THEN report FAIL "stale test run"
- WHEN the recorded run's exit code is non-zero, THEN report FAIL naming the command and the code — **never** suppressed, including for a proven backfill
- WHEN the project has no resolvable test command, THEN the check is `skipped` + reason, so a project that cannot satisfy it is never permanently barred from `verified`
- WHEN the resolved command cannot be spawned on this platform — on Windows a `.cmd`/`.bat` shim, which Node refuses to spawn shell-free even by absolute path — THEN the check is `skipped` + reason naming the constraint and a shell-free alternative, for the same reason: a gate no configuration could clear is not a signal
- WHEN the change's status is not `implemented`, THEN do not flag (exempt)

#### REQ-TYPES-065: Drift Report test-provenance / constitution-severity check ids + constitution section
`DRIFT_CHECK_IDS` appends `test-provenance` (12th, fail-class) and `constitution-severity` (13th, warn-class) — additive only, the pre-existing eleven keep their frozen order (report `checks[]` order and the CLI's status-line order both derive from it). `structural` gains an optional `constitution` section (`rules[]{name, severity: MUST|SHOULD|MAY|null, has_verify_hint, line}`), mirroring the `knowledge_health` optional-section precedent without touching that frozen contract.
**Scenarios:**
- WHEN a `runChecks` dispatch for either new id is missing, THEN compilation fails (`Record<DriftCheckId, CheckOutcome>` exhaustiveness guard)
- WHEN a rule carries no RFC-2119 tag, THEN `severity` is `null` — accepted by the schema and never defaulted to a severity
- WHEN the Constitution is unavailable, THEN the whole `constitution` object is absent (not empty-and-passing)

#### REQ-LIB-033: Test command resolution, execution and the test-provenance evaluator
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

#### REQ-SERVICES-068: check.service collector injection + the --record-tests write path
`check.service.execute` injects `collectTestProvenance` (with the resolved command and the run's single digest) and `collectConstitutionRules` (path from `resolveBasePaths`, never re-derived). The `--record-tests` branch checks every precondition — target change, metadata presence, test command, git-ness — **before** spawning the suite, then records the **post-run** digest so a suite that writes an untracked artifact still converges in one run, disclosing `treeChangedDuringRun` when the tree moved mid-run. Metadata is **re-read after the run** and `test_provenance` merged into the fresh document — a long suite leaves a wide edit window, and writing back the pre-run snapshot would silently clobber a mid-run edit. A null digest names its real cause (`digestFailureReason`): "not a git repository" vs "could not compute the change digest".
**Scenarios:**
- WHEN the same repo state is checked twice, THEN the report is byte-identical except `generated_at` (the pure path spawns nothing and writes nothing)
- WHEN the suite fails, THEN the record IS written (a failing suite is the fact) and the evaluator turns it into the FAIL
- WHEN a precondition is unmet, THEN `{recorded:false, reason}` and the suite never runs
- WHEN metadata is edited while the suite runs, THEN the edit survives alongside the new `test_provenance`; WHEN it stops validating mid-run, THEN nothing is recorded — the stale snapshot never resurrects

#### REQ-CLI-022: prospec check --record-tests / --escaped-defects flags
`prospec check` adds `--record-tests` (run the test command, record the outcome, exit) and `--escaped-defects` (report per-gate miss rate, exit), reusing `--change <name>` for disambiguation. Both are non-check modes that never grade drift, so `--strict`'s exit code is unaffected. Every repo-sourced string in the new output paths passes `sanitizeTerminal()`. The `--json` help names its output file **per mode** (`prospec-report.json`; `escaped-defect-report.json` with `--escaped-defects`).
**Scenarios:**
- WHEN either new check runs, THEN it prints its own status line, with the reason attached when `skipped`
- WHEN no flag is passed, THEN behavior is identical to the previous version

#### REQ-TESTS-056: Engine tests for the new collectors and evaluators
`evaluateTestProvenance` (missing / stale / non-zero exit / stale+failing precedence / proven-backfill exemptions / unproven backfill / non-implemented / unavailable), `evaluateConstitutionSeverity`, `parseConstitutionRules` (fence-aware, untagged, unknown tag, level-1 heading closes the section), `aggregateEscapedDefects`, `resolveTestCommand`, `runTestCommand` (exit code / timeout, driven by `process.execPath` so it can never recurse into the project suite), and all three collectors against temp-git fixtures. Shim classification is tested through an **injected** probe so the win32 branch runs on any host: non-win32 always spawnable, a real `.exe` in any PATH directory beating an earlier `.cmd`, `.com` accepted, a shim reported only when no directory holds a startable file, a declared extension short-circuiting the search, a path never searched on PATH, a negative assertion that PATHEXT does not influence the verdict, and `defaultExecutableProbe.exists` across file / directory / missing. A `describe.runIf(process.platform === 'win32')` block additionally pins the real-host behaviour and runs once a Windows job exists — the injected tests prove the decision, that one proves the reality. The digest self-trip guard is **derived from the report filename constants**, not hand-listed, so a future report joins it by construction. Every headline hardening carries a **revert-red mutation pin**: the recorded-failure-vs-unresolvable-command ordering test (red under the old skip-first collector), the mixed-alias `passed=1` fixture (reproduces the schema abort pre-fix), the unborn-HEAD fixture reaching the `diff === null` branch on real git, and a selective `child_process` fault injection for the `ls-files` capture (its own file, `vi.setConfig` 30s like every git-bound suite).

#### REQ-TESTS-062: Windows smoke job + real-host adjudication of the shim gate

**Story:** US-9

A `windows-smoke` job (`windows-latest`) makes the shim gate's Windows behavior executed rather than modelled: it runs the two shim-bearing unit files and then `scripts/windows-smoke-record-tests.ts`, which builds a temp git fixture (a `.prospec.yaml`, a `package.json` with a test script, one `implemented` change), invokes the built CLI's `check --record-tests` followed by `check --json`, and exits non-zero when `test-provenance` is `fail` — so the script is already a gate the day `continue-on-error` is removed. The job is deliberately **separate** rather than an `os` matrix: the existing `test` job's coverage step is bound to `shell: bash` + `jq` and feeds the `comment` job through a named artifact, and a matrix would entangle that wiring. `describe.runIf(process.platform === 'win32')` additionally covers the two layouts the injected probe can only model — a real executable found through the spawn cwd, and one found through a quoted PATH entry — each spawning for real, because the injected tests prove the decision and only a real host proves the reality.
- WHEN the job runs on a pull request, THEN the real-host block reports a non-zero passing count in the CI log (never a silent skip)
- WHEN the fixture's test command is a Windows `.cmd` shim, THEN `check --record-tests` reports the honest not-recorded reason and `test-provenance` is `skipped`, not `fail`
- WHEN a failure unrelated to the shim surfaces during the observation period, THEN `continue-on-error: true` keeps it from blocking the PR while the failure is enumerated with its own conclusion — the flag is an observation window, never a permanent mute
- WHEN the fixture script runs on a POSIX host, THEN it takes the recorded branch and still asserts the same outcome, so it is verifiable before it ever reaches a Windows runner

---

## US-10: Constitution rule inventory + severity check [P2]

As a maintainer who wants verify's Constitution audit to be reproducible,
I want check to parse the Constitution into a rule inventory with RFC-2119 severities,
so that the audit cannot silently skip a principle or re-assign its severity.

**Acceptance Scenarios:**
- WHEN the report is produced, THEN it lists every principle with name, severity and whether it carries a `Verify` hint
- WHEN a principle carries no RFC-2119 tag, THEN report WARN (it cannot be graded by weight) while still listing it with `severity: null`
- WHEN a `### [MUST] …` line sits inside a fenced code block, THEN it is not inventoried
- WHEN the Constitution is missing or declares no principles, THEN the check is `skipped` with the distinct reason (never a fake PASS)

#### REQ-LIB-032: Constitution rule parser + constitution-severity evaluator
`lib/constitution-parser.ts`'s `parseConstitutionRules(markdown)` scans only the `## Principles` section — closed by any heading at that depth **or shallower**, so a level-1 `# Appendix` does not leak later `###` headings into the inventory — extracting name, `[MUST]`/`[SHOULD]`/`[MAY]` severity (unknown or absent → `null`, never guessed) and whether a `**Verify**:` hint follows. Fence blanking is shared via `lib/markdown-fences.ts` (extracted from `drift-sources`, single source). `collectConstitutionRules` reads through the contained reader, so a `base_dir` escaping the repo cannot make the report an out-of-tree file oracle and an unreadable path degrades instead of throwing out of `runChecks`.
**Scenarios:**
- WHEN the section closes, THEN entry count equals the number of `###` headings inside it, each anchored at its own 1-based line
- WHEN a `**Verify**:` hint precedes the first rule, THEN it attaches to no rule
- WHEN the evaluator runs, THEN it stays I/O-free and findings codepoint-sort

---

## US-11: Per-gate escaped-defect aggregation [P2]

As a maintainer who wants to know how accurate the gates themselves are,
I want per-gate escaped-defect rate computed from the `introduced_by` registration,
so that the only ground-truth accuracy signal the pipeline has is actually calculated.

**Acceptance Scenarios:**
- WHEN the report runs against existing archived changes, THEN it is produced with no data backfill
- WHEN no change registers `introduced_by`, THEN say so — `gates` is empty rather than a table of fabricated 0% rates
- WHEN a registration names no change, or more than one, THEN it lands in `unresolved_references` instead of being attributed to an arbitrary winner
- WHEN neither ledger directory exists, THEN `ledger_available: false` — distinct from "records were read and none registered"

#### REQ-TYPES-067: EscapedDefectReport schema
`types/escaped-defect.ts` — `{version, generated_at, archive_available, ledger_available, sample_count, gates[]{gate, passed, escaped, escaped_rate}, samples[], unresolved_references[]}` plus `ESCAPED_DEFECT_REPORT_FILENAME`. A deliberately separate shape from `DriftReport`: this is a historical aggregate, not a drift check. `escaped` counts **distinct blamed changes**, matching `passed`'s unit, so `escaped_rate` is bounded to 0..1.

#### REQ-LIB-034: Quality-ledger collector + pure aggregator
`collectQualityLedger(cwd)` enumerates `.prospec/changes/*` **and** `.prospec/archive/*` (reporting whether the archive — gitignored by design — exists at all), carrying each change's canonical name and its ledger directory. Pure `aggregateEscapedDefects` resolves `introduced_by` against every alias a registration may use (canonical name, ledger directory, and the un-dated directory name, so a dated archive folder resolves) while treating an alias two changes both claim as ambiguous. Denominators are counted once per change, never once per alias — and the **escaped numerator keys on the resolved per-change gate-set object, not the raw `introduced_by` string**, so two accepted spellings of one change count once and `escaped ≤ passed` holds structurally. `readGateResults` trims `result` symmetrically with `skill`, so a `'PASS '` record enters the denominator instead of silently vanishing.
**Scenarios:**
- WHEN two fixes blame the same change — through the same alias or different ones — THEN that gate records one escaped change (two samples), so the rate stays a true rate in 0..1 and the report never aborts at the passed=1 boundary
- WHEN a gate record carries stray whitespace in `result`, THEN it counts as its trimmed value
- WHEN a malformed `quality_log` entry appears, THEN it is dropped rather than taking the whole report down

#### REQ-SERVICES-069: check.service --escaped-defects aggregation mode
A third non-check mode alongside `--init-ci`/`--record-review`: collector → pure aggregator → schema validation → (with `--json`) an `atomicWrite` of `escaped-defect-report.json`. It produces no findings and never affects `--strict`'s exit code; the written report is excluded from the change digest, so generating it cannot invalidate the provenance baselines it feeds.

---

## US-12: CommonMark fence boundaries for markdown scanners [P2]

As a maintainer whose drift scanners blank fenced examples before scanning,
I want `markdown-fences` to follow CommonMark fence boundaries with a contract of its own,
so that an indented or inline ``` literal can no longer flip fence state and blind a scanner to the whole rest of a document.

**Acceptance Scenarios:**
- WHEN a document contains a 4-space-indented (or tab-indented) ``` literal, THEN fence state does not flip — REQ references and Constitution rules after it stay scannable
- WHEN a one-line inline span whose info string contains a backtick appears, THEN it is not an opener (the line itself stays visible)
- WHEN a `~~~` fence opens, THEN only `~~~` closes it (mixed-marker close rule pinned by tests)

#### REQ-LIB-036: markdown-fences CommonMark boundary contract

**Story:** US-12

`withoutFencedBlocks` accepts up to three spaces of opener indentation (four or more, or a tab, is an indented code block per CommonMark); a backtick fence's info string may not contain a backtick (a one-line ```` ```code``` ```` span is inline code, not an opener that swallows the file), while a tilde fence's info string may. The helper stays an import-free lib leaf (consumed one-way by `constitution-parser` and `drift-sources`) and carries its own test file (`tests/unit/lib/markdown-fences.test.ts`) covering indented-fence, inline-span, `~~~`, mixed-marker-close, longer-closer and unclosed-fence classes.
**Scenarios:**
- WHEN a fence is indented up to three spaces, THEN it still opens; at four or more (or a tab) it does not
- WHEN scanning after the fixes, THEN existing consumers (Constitution parser, REQ/link scans) show no regression — full suite green
- Known boundary (advisory): fences nested in list items at ≥4-space continuation indentation are container-context CommonMark — currently treated as indented code (zero occurrences in scanned roots; failure direction is false-positive, never content-hiding)

---

## Edge Cases

- `specs/features/` does not exist or is empty: req-references `skipped (source unavailable)`, not FAIL
- `_archived*` directories and flat files: consistently excluded on both sides (definition / reference)
- imports commented out inside a block comment: not counted as edges; the `export const X = './path'` string constant is not counted
- parenthesized / percent-encoded links (`design%20(v2).md`): decodeURI + balanced parentheses, not misjudged as broken
- out-of-repo paths (`../` links, module-map paths): not probed, not scanned — no file-existence oracle
- multiple violations in the same file: all listed; Windows backslashes are always normalized to `/`

## Success Criteria

- **SC-1**: On a consistent-state repo, `check --strict` exits 0, and each of the five checks has an explicit status
- **SC-2**: After injecting the three drift categories, `--strict` exits 1, and all findings are locatable
- **SC-3**: On the same repo state, consecutive runs produce byte-for-byte identical reports (except generated_at); sorting is by codepoint (stable across environments)
- **SC-4**: The semantic layer is `not-checked` under any run
- **SC-5**: When there is no `.prospec/changes/`, the completion rate is skipped and does not affect the exit code

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace existing versions
2. **Functional Grouping**: New requirements insert under the corresponding User Story
3. **No Inline Provenance**: Historical attribution only in Change History table
4. **Deprecation over Deletion**: Removed requirements move to Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|--------------|
| 2026-06-19 | archive-sync | ADDED REQ-LIB-018; ADDED REQ-LIB-019; ADDED REQ-TESTS-031; MODIFIED REQ-TYPES-027 | REQ-LIB-018, REQ-LIB-019, REQ-TESTS-031, REQ-TYPES-027 |
| 2026-06-20 | harden-feature-prefixed-req-sync | ADDED US-5; ADDED REQ-TYPES-034; ADDED REQ-LIB-020; ADDED REQ-SERVICES-034 (README factual-count drift check, BL-043) | US-5, REQ-TYPES-034, REQ-LIB-020, REQ-SERVICES-034 |
| 2026-07-04 | mechanize-review-gate | ADDED US-6 (review-provenance gate check, the 9th check id); ADDED REQ-TYPES-052/REQ-LIB-024/REQ-SERVICES-062/REQ-CLI-012/REQ-TESTS-042; MODIFIED REQ-TYPES-034 (total → 9) (issue #66 scope 1+2) | US-6, REQ-TYPES-052, REQ-LIB-024, REQ-SERVICES-062, REQ-CLI-012, REQ-TESTS-042, REQ-TYPES-034 |
| 2026-07-05 | quick-scale-and-ceremony-cleanup | MODIFIED US-5 + REQ-TYPES-034/REQ-LIB-020/REQ-SERVICES-034 (readme-counts→mcp-readme-counts rename, name matches reality, MCP-only); MODIFIED REQ-TYPES-052 (total → 10); ADDED US-7 (metadata-completeness gate, the 10th check id) + REQ-TYPES-055/REQ-LIB-025/REQ-SERVICES-063/REQ-TEMPLATES-142/REQ-TESTS-045 (issue #67) | US-5, US-7, REQ-TYPES-034, REQ-TYPES-052, REQ-TYPES-055, REQ-LIB-020, REQ-LIB-025, REQ-SERVICES-034, REQ-SERVICES-063, REQ-TEMPLATES-142, REQ-TESTS-045 |
| 2026-07-05 | unlock-measurement | MODIFIED REQ-LIB-025: `hasVerifyGrade` prioritizes reading the structured `grade ∈ {S,A}`, keeping the legacy `result ∈ {S,A}` fallback (converges the schema/reality gap, backward-compatible); the `metadata-completeness` check id is unchanged (issue #61) | US-7; REQ-LIB-025 (MODIFIED) |
| 2026-06-12 | add-drift-checker | Deterministic drift engine + `prospec check` CLI + hardened CI gate (BL-030 + OPT-A2; OPT-B3 consumed) | US-1~4; REQ-TYPES-027, REQ-LIB-014~016, REQ-SERVICES-027, REQ-CLI-011, REQ-TEMPLATES-091 |
| 2026-07-06 | enforce-knowledge-size-budget | ADDED US-8 (knowledge-size budget check, the 11th check id, warn-class) + REQ-TYPES-060/061, REQ-LIB-027, REQ-SERVICES-065, REQ-TEMPLATES-149, REQ-TESTS-048; MODIFIED REQ-TYPES-052/034 (total → 11) + REQ-TESTS-045 (skipped-never-PASS → 11 checks); config token_budget honest rename + DEFAULT_KNOWLEDGE_TOKEN_BUDGET single source (issue #63) | US-8, REQ-TYPES-060, REQ-TYPES-061, REQ-LIB-027, REQ-SERVICES-065, REQ-TEMPLATES-149, REQ-TESTS-048, REQ-TYPES-052, REQ-TYPES-034, REQ-TESTS-045 |
| 2026-07-06 | slim-knowledge-l1-l2 | MODIFIED REQ-TYPES-061: `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` honestly recalibrates `l1_per_file` 1500→1800, `l2_per_module` 400→1000 (warn-class unchanged, init seed synced) (issue #64) | REQ-TYPES-061 (MODIFIED) |
| 2026-07-06 | inject-resolved-knowledge-budgets | ADDED REQ-LIB-028 (`resolveKnowledgeTokenBudget` moved to the `lib/config` canonical single source, `KnowledgeSizeBudget` moved to `types/config`); MODIFIED REQ-TYPES-061 (the single source also feeds the budget rendering of generated skill templates), REQ-SERVICES-065 (the resolver now imports from `lib/config`) | REQ-LIB-028 (ADDED); REQ-TYPES-061, REQ-SERVICES-065 (MODIFIED) |
| 2026-07-09 | support-file-module-paths | MODIFIED REQ-LIB-014: import-edge collection handles single-file entries via `classifyModulePath` (source file → scan that file, non-source file → no edge, fixes `<file>/**` ENOTDIR); the classifier itself, REQ-LIB-029, lives in the ai-knowledge feature | REQ-LIB-014 (MODIFIED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
| 2026-07-28 | split-verify-adjudication | ADDED US-9 (test-provenance gate check, the 12th check id) + US-10 (Constitution rule inventory + severity, the 13th) + US-11 (per-gate escaped-defect aggregation); ADDED REQ-TYPES-065/067, REQ-LIB-032/033/034, REQ-SERVICES-068/069, REQ-CLI-022, REQ-TESTS-056; MODIFIED REQ-TYPES-052 (11 → 13), REQ-TYPES-034 (defers the count), REQ-TESTS-045 (13 checks) (issue #96) | US-9, US-10, US-11, REQ-TYPES-065, REQ-TYPES-067, REQ-LIB-032, REQ-LIB-033, REQ-LIB-034, REQ-SERVICES-068, REQ-SERVICES-069, REQ-CLI-022, REQ-TESTS-056, REQ-TYPES-052, REQ-TYPES-034, REQ-TESTS-045 |
| 2026-07-29 | skip-unspawnable-test-command | MODIFIED US-9 (a second honest-skip trigger: a command that cannot be spawned on this platform), REQ-LIB-033 (shim classification behind an injected probe, libuv resolution rule rather than PATHEXT, pre-spawn refusal, `not-found` deliberately non-blocking) and REQ-TESTS-056 (platform-injected assertion classes) — closes the Windows `.cmd` gap escalated by split-verify-adjudication's review | US-9, REQ-LIB-033, REQ-TESTS-056 |
| 2026-07-29 | harden-verify-adjudication | ADDED US-12 + REQ-LIB-036 (markdown-fences CommonMark contract — planned as REQ-LIB-035, renumbered at graduation: that id was claimed by add-status-router, merged mid-flight); MODIFIED REQ-LIB-033 (recorded failure outranks an unresolvable command — `command_unavailable_reason` replaces the source-level early return), REQ-LIB-034 (escaped numerator keys on the resolved gate-set object; `result` trimmed), REQ-LIB-024 (both digest captures fail closed with revert-red pins; review backfill exemption draft-gated), REQ-LIB-025 (`hasVerifyGrade` trims like every quality_log consumer — review-round parallel-site sweep), REQ-SERVICES-068 (post-run metadata re-read/merge; honest digest-failure reason), REQ-CLI-022 (per-mode `--json` help), REQ-TESTS-056 (revert-red mutation pins for every headline hardening) — closes the #102 re-review gaps (issue #103) | US-12, REQ-LIB-036, REQ-LIB-033, REQ-LIB-034, REQ-LIB-024, REQ-LIB-025, REQ-SERVICES-068, REQ-CLI-022, REQ-TESTS-056 |
| 2026-07-30 | add-windows-smoke-ci | ADDED REQ-TESTS-062 (a `windows-smoke` job on `windows-latest` plus the fixture script that gates on `test-provenance`, and real-host coverage of the cwd and quoted-PATH layouts — the runIf block stops being a silent skip); MODIFIED REQ-LIB-033 (libuv resolution completed: the spawn cwd is searched before PATH under the `NoDefaultCurrentDirectoryInExePath` guard, quoted PATH entries are unquoted and an inner `;` no longer splits them, candidates resolve against that cwd, and each caller threads its own cwd into the default probe — `unspawnableReason` therefore requires one) — two further deviations of the same inverted-gate class as the PATHEXT one (issue #101) | REQ-TESTS-062, REQ-LIB-033 |
| 2026-07-30 | pin-windows-kill-semantics | MODIFIED REQ-LIB-033: the "timed out or was killed" scenario splits in two, and the killed half narrows to "only a signal-terminated run goes unrecorded" — POSIX reads the signal from the wait status whoever sent it (a child that CATCHES it and exits normally is recorded), while Windows carries none there and libuv synthesizes one from an `exit_signal` set only by `uv_process_kill`, so a self-kill surfaces as `TerminateProcess`'s exit code and is recorded fail-closed. Closes the one non-shim failure windows-smoke's first run surfaced (issue #101) | REQ-LIB-033 |
