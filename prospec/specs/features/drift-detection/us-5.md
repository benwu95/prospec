## US-5: README factual-count truthfulness check [P2]

As a developer who keeps README and code consistent,
I want check to mechanically compare the counts a module README declares (e.g., "registers N resources") against the actual count in the code it names,
so that factual-count drift is intercepted by a machine in CI, no longer relying solely on humans.

**Acceptance Scenarios:**
- WHEN a module README's declared count does not match the actual count in the code it names, THEN report WARN (including README `file:line` + expected vs actual)
- WHEN counts match, there is no parseable declaration, or the declaration falls inside a fenced code block, THEN do not report (no false positives)
- WHEN module-map is missing, THEN `mcp-readme-counts` is skipped (with reason), never faking a PASS

#### REQ-TYPES-034: Drift Report mcp-readme-counts Check Id
`DRIFT_CHECK_IDS` renames `readme-counts` → `mcp-readme-counts` (name matches reality: scope is only MCP registration counts, not generic README counts; does not touch the `knowledge_health` frozen contract). For the current total number of frozen check ids see REQ-TYPES-052 (**16**).
- WHEN a check id is appended to the registry, THEN every prose copy of the total is updated in the same change. This spec's copies are enumerated by REQ id rather than counted — REQ-LIB-014 (as total − 1), REQ-TYPES-034, REQ-TYPES-052, REQ-TESTS-045, REQ-LIB-027 (twice), REQ-TESTS-074 and REQ-CLI-011 — because a count of unguarded numbers is one more unguarded number, and this enumeration has now under-counted itself three times: it said "three" while there were four, then named four while there were six, then six while there were seven. Treat a number stated in prose anywhere in this spec as a copy until proven an ordinal. None of them has a machine guard; the ordinal statements ("the 11th frozen id") are historical and correctly frozen

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
I want a deterministic `review-provenance` check that determines whether an audited non-backfill change has a recorded review that still reflects the current code,
so that "review must precede verify" turns from process prose into a machine-checkable, testable gate.

**Acceptance Scenarios:**
- WHEN an audited non-backfill change has no recorded review baseline, THEN report FAIL "no review recorded" (points to `/prospec-review`)
- WHEN recognized review evidence does not match the current effective-input snapshot, THEN report FAIL "stale review" and require real review even on a clean tree
- WHEN recognized fingerprint version/scope and the provable snapshot match, THEN PASS; staging and content-equivalent commit/amend operations preserve that evidence
- WHEN evidence is legacy or its version/scope is unknown, THEN require one normal review; an unprovable capture is never current PASS
- WHEN the change is `scale: backfill`, or its status is outside `PROVENANCE_AUDITED_STATUSES` (`story`/`plan`/`tasks`), THEN do not flag (exempt); `archived` is not exempt but unreachable — the bundle has left `.prospec/changes/`
- WHEN not a git repo / `.prospec/changes/` is absent / the digest cannot be computed, THEN the check is `skipped` + reason (never a fake PASS)

#### REQ-TYPES-052: Drift Report review-provenance Check Id
`DRIFT_CHECK_IDS` appends `review-provenance` (additive-only; does not touch the `knowledge_health` frozen contract) — **16** frozen check ids in total (the 11th is `knowledge-size` from US-8; the 12th `test-provenance` and 13th `constitution-severity` arrive with US-9/US-10, see REQ-TYPES-065; the 14th is `artifact-language`, see REQ-TYPES-072; the 15th is `spec-counters`, see REQ-TYPES-076; the 16th is `delta-spec-provenance`, see REQ-TYPES-078). Failing to dispatch the corresponding evaluator in `runChecks` causes a compile failure (the `Record<DriftCheckId, CheckOutcome>` type exhaustiveness guard).
- WHEN a check id is appended to the registry, THEN this total is updated in the same change
- WHEN the total is read, THEN it equals `DRIFT_CHECK_IDS.length`

#### REQ-LIB-024: review-provenance Collector + Evaluator + computeChangeDigest
`computeChangeState(cwd)` owns the versioned effective-input snapshot; `computeChangeDigest` and `computeWorkingTreeClean` remain wrappers, while HEAD is optional Git trace and the clean tri-state is diagnostic only. `collectReviewProvenance` enumerates `.prospec/changes/*` with status, scale, recorded identity/version and `backfill_draft_present`; `evaluateReviewProvenance` is pure and uses `PROVENANCE_AUDITED_STATUSES`, with one repository snapshot compared against each change.
- WHEN final effective input bytes, paths, supported file kinds and executable modes are identical, THEN `snapshot-v2` identity is identical across unstaged, staged, committed, amended and content-equivalent history states; HEAD, index representation, diff text, mtime and timestamps are not identity inputs
- WHEN capturing inputs, THEN include tracked and non-ignored untracked final working-tree files, deduplicated by path, including source, scripts, tests, documents, manifests, lockfiles, `.prospec.yaml` and generated code; exclude only `.prospec/` and Prospec-owned report filename constants, with no blanket `.agents/`, `.claude/` or `dist/` exemption
- WHEN a tracked file is confirmed deleted and repeat enumeration is consistent, THEN its final absence contributes no history-dependent tombstone, so committing the same deletion preserves identity; sparse missing paths, gitlinks, unsupported kinds and unreadable or racing captures are unprovable rather than empty inputs
- WHEN paths are enumerated, THEN use Git NUL-delimited bytes, lossless decoding checks, raw-byte ordering and length-framed path/kind/mode/content records under a domain-separated SHA-256; never newline-split, trim, unquote or locale-sort paths, and refuse byte paths that cannot round-trip through the string APIs
- WHEN a regular file is captured, THEN hash its raw bytes including binary data and the supported executable bit; WHEN a symlink is captured, THEN hash the link target and require its resolved content to be represented in the snapshot, otherwise report unprovable
- WHEN Git capture, file reading or consistency validation fails, THEN return a null identity with a specific reason and never current PASS; an unborn HEAD can have a valid file snapshot with absent HEAD trace, while a non-Git directory is unprovable
- WHEN a fingerprint has no recognized version/scope, THEN treat it as legacy or unknown and require one normal effective revalidation; computing and stamping a new digest alone does not prove the old review
- WHEN only Git history changes, THEN retain current recognized evidence; WHEN effective inputs change, THEN require the appropriate review/tests even on a clean tree, without inferring prior review from cleanliness
- WHEN a required review is absent, THEN fail "no review recorded"; WHEN a recognized recorded identity differs from the current snapshot, THEN fail "stale review"; only a recognized version/scope with a matching provable snapshot yields current review evidence
- WHEN the change is `verified` and its code changed since the recorded review, THEN fail "stale review" — reaching grade S/A ends neither the audit nor the need to re-review
- WHEN the change is `archived`, THEN no verdict exists at all — the collector cannot enumerate a bundle that archive has moved out of `.prospec/changes/`
- Single in-flight change assumption: one whole-tree digest is compared against each change (fail-closed, not fail-open); widening the audited statuses widens that over-blocking, never opens it
- WHEN a proven backfill (`backfill-draft.md` present) or a change whose status is outside `PROVENANCE_AUDITED_STATUSES` is encountered, THEN keep the existing applicability exemption; an unproven `scale: backfill` gets no exemption, and missing Git/changes sources or an unprovable capture are skipped with their reason, never current PASS; findings codepoint-sort

#### REQ-SERVICES-062: check.service injection + --record-review write path
`check.service` injects `collectReviewProvenance` and `collectDeltaSpecProvenance` into `runChecks`; the `--record-review` branch uses `resolveChange` (`--change` can specify it, guarded by `existsSync`; if metadata is not found it honestly skips) → the versioned `computeChangeState` capture and `computeDeltaSpecDigest` → a comment-preserving Document that writes the metadata `review_provenance` and, when the change has a delta-spec, `delta_spec_provenance` in the same write (following the flag-gated side effects of `--json`/`--init-ci`; the pure check path stays read-only and deterministic). When a grading context is supplied, `review_provenance.graded_by` is written in that same document write; when it is not supplied, the field is absent (never a blank or null).
- WHEN `--record-review` runs, THEN both fingerprints are stamped in one document write so they describe the same moment
- WHEN the change has no delta-spec, THEN only the review baseline is written and the omission is reported
- WHEN the pure check path runs, THEN neither fingerprint is written
- WHEN a grading context is supplied to `--record-review`, THEN `review_provenance.graded_by` is written in the same document write; when omitted, the field is absent
- WHEN a completed review is recorded, THEN capture and validate the current effective-input snapshot and delta-spec observation before the single metadata write, including recognized version/scope and optional HEAD trace; an unprovable or observed-changing input refuses certification
- WHEN evidence is legacy or unknown, THEN this command records a newly completed valid review, never claims that rehashing a baseline proves an earlier review; an equivalent commit does not require another record

#### REQ-CLI-012: prospec check --record-review flag
`prospec check` adds `--record-review` (records the review baseline then exits) and `--change <name>` (targets record-review when multiple changes run in parallel), alongside `--json`/`--strict`/`--init-ci`; it also adds `--graded-by <fresh-subagent|in-session>` (validated against the two-value enum) which, with `--record-review`, records the review convergence's grading context into `review_provenance.graded_by`; when the flags are absent, behavior is completely identical to the current one.
- WHEN `--graded-by` is passed with `--record-review`, THEN the value is recorded into `review_provenance.graded_by`
- WHEN `--graded-by` is outside the two-value enum, THEN the parser refuses it
- WHEN the flags are absent, THEN behavior is completely identical to the current one

#### REQ-TESTS-042: review-provenance engine tests
`evaluateReviewProvenance` six scenarios (absent/stale/fresh/backfill/outside-the-audit-scope/unavailable — the audited statuses themselves, and the `verified` cases in particular, are covered by REQ-TESTS-073), `computeChangeDigest` (temp git dir: changing `src`/`scripts`/docs content flips the digest, changing only `.prospec/`/Prospec-owned reports or ignored untracked outputs does not; tracked and non-ignored generated inputs do flip it), `collectReviewProvenance`, `check.service` injection + `--record-review` writes metadata + `--strict` FAIL → exit 1 + backfill skipped — mutation-verified. The clean-tree message-split fixture is replaced by paired real-Git cases: an equivalent stage/commit/amend preserves evidence, while a clean committed input mutation requires real review/tests rather than merely stamping a new baseline; clean capture remains tri-state diagnostic coverage. Fixtures cover lossless special paths, lockfile changes, unsupported/unreadable inputs, binary and platform-supported mode/symlink changes, and migration. Each changed behavioral guard carries a revert-red pin against its prior failure, while audited-status/backfill and strict-exit coverage remains.

#### REQ-CLI-052: Evidence validity diagnostics and migration remedies
Existing check, verify, archive and status output explains evidence scope, actual attempt outcome and actionable remedies consistently with the versioned snapshot and live assessment. Shared workflow instructions retain their canonical template/reference owners and generated copies.
- WHEN inputs actually changed, THEN direct the user to the appropriate real review/test validation; WHEN only equivalent Git history changed, THEN preserve valid evidence and never demand a baseline stamp or full suite solely because HEAD moved or the tree is clean
- WHEN workflow facts changed, THEN gate output reflects the current recomputed verdict without requiring manual report rebuilding or implying that every workflow edit requires a full test run
- WHEN evidence is legacy or unknown, THEN explain one-time normal revalidation; WHEN capture is unprovable or an attempt is running/failed/unprovable/timeout/unavailable, THEN report the actual cause, command/exit/signal when available and an appropriate remedy, never call it current PASS or invent an exit code
- WHEN output-only files cause an input mismatch, THEN explain tracked/non-ignored inclusion and the option to ignore genuinely non-input untracked outputs, without adding an arbitrary output-exclusion configuration or treating knowledge.generated_artifacts as a digest exemption
- WHEN workflow preparation is documented, THEN order final Knowledge/count sync before final effective review/tests/verify and content-equivalent commit before archive; any later input edit requires the necessary revalidation
- WHEN verify/archive/review/ff/cascade instructions, metadata/test-runner references, both root READMEs or lifecycle prose describe these rules, THEN keep them semantically consistent, edit the canonical sources and regenerate deployed assets through their existing owners; retain station progression and the human commit gate
- WHEN repository-sourced paths, commands or reasons are formatted, THEN pass them through the existing terminal sanitization owner and preserve each command's exit-code and quiet-output contracts

---

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
`collectMetadataCompleteness(cwd)` (I/O) enumerates `.prospec/changes/*` and reads metadata: it checks the existence of `REQUIRED_METADATA_FIELDS` (name/created_at/status/scale) + `hasVerifyGrade` for `GRADED_STATUSES` (verified/archived) ones — prioritizing the structured `grade ∈ {S,A}` of the `prospec-verify` entry, keeping the legacy `result ∈ {S,A}` fallback so that existing archived metadata still passes; `skill`/`grade`/`result` are **trimmed before comparison** (these rows come off raw YAML with no schema pass — an exact match on `"A "` would flip a genuinely verified change into a FAIL-class finding); a non-mapping parse (empty/comment/null) is treated as all fields missing, not a crash. `hasVerifyGrade` is timeline-aware: for `archived` status, any historical S/A entry suffices (backward compatible); for `verified` status, only the latest `prospec-verify` entry's grade is checked — a re-verify at B/C/D after a prior S/A returns false. Pure `evaluateMetadataCompleteness` emits a fail finding for each missing field and each missing grade; in-progress does not apply the grade rule. The `metadata-completeness` check id is unchanged.
- WHEN a required field is missing, THEN fail listing the missing items; WHEN verified has the latest `prospec-verify` grade S/A or a legacy result S/A, THEN pass; WHEN verified has latest grade B/C/D despite historical S/A, THEN fail; WHEN archived has any historical S/A, THEN pass; WHEN verified has neither, THEN fail; in-progress is exempt from the grade
- WHEN metadata is empty/null, THEN an all-fields-missing finding (does not deref null); no changes directory → skipped + reason; findings codepoint-sort

#### REQ-SERVICES-063: check.service injects the metadata-completeness collector
`check.service` injects `collectMetadataCompleteness` into `runChecks`, wired the same way as `collectReviewProvenance`; the pure check path stays read-only and deterministic.

#### REQ-TEMPLATES-142: archive Entry Gate consumes metadata-completeness
`prospec archive` reads the drift report's `metadata-completeness` and refuses on FAIL, so incomplete or ungraded metadata cannot enter the permanent record; the `--allow-incomplete` flag exempts this condition only, for pre-schema records. The `prospec-archive` Entry Gate defers to that CLI refusal in one line.
- WHEN `metadata-completeness` is FAIL and `--allow-incomplete` is not set, THEN archive refuses; WHEN the flag is set, THEN a completeness FAIL alone no longer blocks

#### REQ-TESTS-045: metadata-completeness engine tests
`evaluateMetadataCompleteness` (pass / each field missing / verified-no-grade / in-progress-exempt / both-findings), `collectMetadataCompleteness` (changes-dir fixture: complete / stub / present-but-empty / verified-no-grade / verified-with-A / empty-null-comment / unparseable), `check.service` injection + skipped-never-PASS across all 16 checks (including knowledge-size, test-provenance, constitution-severity, artifact-language, spec-counters and delta-spec-provenance) — the S/A clause and the skill clause mutation-verified.
- WHEN a check id is added to the registry, THEN the skipped-never-PASS assertion covers it too

---
