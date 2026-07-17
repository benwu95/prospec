---
feature: drift-detection
status: active
last_updated: 2026-07-09
story_count: 8
req_count: 27
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
`DRIFT_CHECK_IDS` renames `readme-counts` → `mcp-readme-counts` (name matches reality: scope is only MCP registration counts, not generic README counts; does not touch the `knowledge_health` frozen contract). For the current total number of frozen check ids see REQ-TYPES-052 (**11**, including knowledge-size).

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
`DRIFT_CHECK_IDS` appends `review-provenance` (additive-only; does not touch the `knowledge_health` frozen contract) — **11** frozen check ids in total (the 11th is `knowledge-size`, see US-8). Failing to dispatch the corresponding evaluator in `runChecks` causes a compile failure (the `Record<DriftCheckId, CheckOutcome>` type exhaustiveness guard).

#### REQ-LIB-024: review-provenance Collector + Evaluator + computeChangeDigest
`computeChangeDigest(cwd)`: the content fingerprint = HEAD sha + `git diff HEAD` + untracked, covering the whole working tree (all first-party content that a review audits), using a **denylist** to exclude workflow state (`.prospec/`, `prospec-report.json`), generated artifacts (`.claude/`, `dist/`), and the lockfile — **fail-closed rather than fail-open** (first-party code outside `src`/`tests`, such as `scripts/`, is still included); it does not rely on git commit timestamps (the commit boundary is after verify S/A, and during review/verify the code is not committed). `collectReviewProvenance(cwd)` (I/O) enumerates `.prospec/changes/*` with status/scale/recorded digest + the current digest; the `gitCapture` helper is shared by `gitLastCommit` and digest; `evaluateReviewProvenance` (pure function) judges only `status==implemented` and non-backfill.
**Scenarios:**
- WHEN the recorded digest is absent, THEN fail "no review recorded"; WHEN recorded ≠ current, THEN fail "stale review"; match → no finding
- WHEN backfill / not implemented, THEN do not flag; WHEN not git / no changes directory / digest null, THEN skipped + reason; findings codepoint-sort
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
`collectMetadataCompleteness(cwd)` (I/O) enumerates `.prospec/changes/*` and reads metadata: it checks the existence of `REQUIRED_METADATA_FIELDS` (name/created_at/status/scale) + `hasVerifyGrade` for `GRADED_STATUSES` (verified/archived) ones — prioritizing the structured `grade ∈ {S,A}` of the `prospec-verify` entry, keeping the legacy `result ∈ {S,A}` fallback so that existing archived metadata still passes; a non-mapping parse (empty/comment/null) is treated as all fields missing, not a crash. Pure `evaluateMetadataCompleteness` emits a fail finding for each missing field and each missing grade; in-progress does not apply the grade rule. The `metadata-completeness` check id is unchanged.
**Scenarios:**
- WHEN a required field is missing, THEN fail listing the missing items; WHEN verified has a structured grade S/A or a legacy result S/A, THEN pass; WHEN verified has neither, THEN fail; in-progress is exempt from the grade
- WHEN metadata is empty/null, THEN an all-fields-missing finding (does not deref null); no changes directory → skipped + reason; findings codepoint-sort

#### REQ-SERVICES-063: check.service injects the metadata-completeness collector
`check.service` injects `collectMetadataCompleteness` into `runChecks`, wired the same way as `collectReviewProvenance`; the pure check path stays read-only and deterministic.

#### REQ-TEMPLATES-142: archive Entry Gate consumes metadata-completeness
The `/prospec-archive` Entry Gate adds a machine check: run `prospec check --json` and read `metadata-completeness`, FAIL → refuse archiving (when the CLI is absent, fall back to reading that change's metadata directly); prevents incomplete/ungraded metadata from entering the permanent record.

#### REQ-TESTS-045: metadata-completeness engine tests
`evaluateMetadataCompleteness` (pass / each field missing / verified-no-grade / in-progress-exempt / both-findings), `collectMetadataCompleteness` (changes-dir fixture: complete / stub / present-but-empty / verified-no-grade / verified-with-A / empty-null-comment / unparseable), `check.service` injection + skipped-never-PASS across all 11 checks (including knowledge-size) — the S/A clause and the skill clause mutation-verified.

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
