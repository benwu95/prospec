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
- WHEN the recorded review digest does not match the current code fingerprint (code changed after review), THEN report FAIL "stale review"
- WHEN the digest matches, THEN PASS (no finding)
- WHEN the change is `scale: backfill`, or its status is outside `PROVENANCE_AUDITED_STATUSES` (`story`/`plan`/`tasks`), THEN do not flag (exempt); `archived` is not exempt but unreachable — the bundle has left `.prospec/changes/`
- WHEN not a git repo / `.prospec/changes/` is absent / the digest cannot be computed, THEN the check is `skipped` + reason (never a fake PASS)

#### REQ-TYPES-052: Drift Report review-provenance Check Id
`DRIFT_CHECK_IDS` appends `review-provenance` (additive-only; does not touch the `knowledge_health` frozen contract) — **16** frozen check ids in total (the 11th is `knowledge-size` from US-8; the 12th `test-provenance` and 13th `constitution-severity` arrive with US-9/US-10, see REQ-TYPES-065; the 14th is `artifact-language`, see REQ-TYPES-072; the 15th is `spec-counters`, see REQ-TYPES-076; the 16th is `delta-spec-provenance`, see REQ-TYPES-078). Failing to dispatch the corresponding evaluator in `runChecks` causes a compile failure (the `Record<DriftCheckId, CheckOutcome>` type exhaustiveness guard).
- WHEN a check id is appended to the registry, THEN this total is updated in the same change
- WHEN the total is read, THEN it equals `DRIFT_CHECK_IDS.length`

#### REQ-LIB-024: [review-provenance Collector + Evaluator + computeChangeDigest]
`computeChangeDigest(cwd)`: the content fingerprint = HEAD sha + `git diff HEAD` + untracked, covering the whole working tree (all first-party content that a review audits), using a **denylist** to exclude workflow state (`.prospec/`, `prospec-report.json`), generated artifacts (`.claude/`, `dist/`), and the lockfile — **fail-closed rather than fail-open** (first-party code outside `src`/`tests`, such as `scripts/`, is still included); it does not rely on git commit timestamps (the commit boundary is after verify S/A, and during review/verify the code is not committed). If `head === null`, it immediately returns `null` to defensively pin the fail-closed invariant against future refactoring. `collectReviewProvenance(cwd)` (I/O) enumerates `.prospec/changes/*` with status/scale/recorded digest/`backfill_draft_present` + the current digest; the `gitCapture` helper is shared by `gitLastCommit` and digest; `evaluateReviewProvenance` (pure function) judges every change whose status is in `PROVENANCE_AUDITED_STATUSES` (REQ-TYPES-075) — `implemented` **and** `verified`, so the window between verify and archive is audited rather than silently exempt — exempting backfill **only when proven** by `backfill-draft.md` (`scale` alone is hand-editable — same draft gating as test-provenance). `archived` is outside the registry because such a change is unreachable, not forgiven: its bundle has left `.prospec/changes/` and the collector never enumerates it. Because HEAD is inside the digest, the verify S/A feature commit itself stales the baseline; that red is honest and the remedy is the PB-016 order — commit, then re-record `--record-review` and `--record-tests`, then archive. **Both** digest captures fail closed: a `git diff HEAD` failure and an `ls-files` failure each return `null` (honest skip), never a constant digest that would certify stale code as current; each branch is pinned by a revert-red test (an unborn-HEAD repo reaches the diff branch on real git; selective fault injection covers the untracked listing).
- WHEN the recorded digest is absent, THEN fail "no review recorded"; WHEN recorded ≠ current, THEN fail "stale review"; match → no finding
- WHEN the change is `verified` and its code changed since the recorded review, THEN fail "stale review" — reaching grade S/A ends neither the audit nor the need to re-review
- WHEN a proven backfill (`backfill-draft.md` present) or a change whose status is outside `PROVENANCE_AUDITED_STATUSES`, THEN do not flag; an unproven `scale: backfill` gets no exemption; WHEN not git / no changes directory / digest null, THEN skipped + reason; findings codepoint-sort
- WHEN the change is `archived`, THEN no verdict exists at all — the collector cannot enumerate a bundle that archive has moved out of `.prospec/changes/`
- Single in-flight change assumption: one whole-tree digest is compared against each change (fail-closed, not fail-open); widening the audited statuses widens that over-blocking, never opens it

#### REQ-SERVICES-062: check.service injection + --record-review write path
`check.service` injects `collectReviewProvenance` and `collectDeltaSpecProvenance` into `runChecks`; the `--record-review` branch uses `resolveChange` (`--change` can specify it, guarded by `existsSync`; if metadata is not found it honestly skips) → `computeChangeDigest` and `computeDeltaSpecDigest` → a comment-preserving Document that writes the metadata `review_provenance` and, when the change has a delta-spec, `delta_spec_provenance` in the same write (following the flag-gated side effects of `--json`/`--init-ci`; the pure check path stays read-only and deterministic).
- WHEN `--record-review` runs, THEN both fingerprints are stamped in one document write so they describe the same moment
- WHEN the change has no delta-spec, THEN only the review baseline is written and the omission is reported
- WHEN the pure check path runs, THEN neither fingerprint is written

#### REQ-CLI-012: prospec check --record-review flag
`prospec check` adds `--record-review` (records the review baseline then exits) and `--change <name>` (targets record-review when multiple changes run in parallel), alongside `--json`/`--strict`/`--init-ci`; when the flags are absent, behavior is completely identical to the current one.

#### REQ-TESTS-042: review-provenance engine tests
`evaluateReviewProvenance` six scenarios (absent/stale/fresh/backfill/outside-the-audit-scope/unavailable — the audited statuses themselves, and the `verified` cases in particular, are covered by REQ-TESTS-073), `computeChangeDigest` (temp git dir: changing `src`/`scripts`/docs content flips the digest, changing only `.prospec/`/report/generated does not), `collectReviewProvenance`, `check.service` injection + `--record-review` writes metadata + `--strict` FAIL → exit 1 + backfill skipped — mutation-verified.

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
The `/prospec-archive` Entry Gate adds a machine check: run `prospec check --json` and read `metadata-completeness`, FAIL → refuse archiving (when the CLI is absent, fall back to reading that change's metadata directly); prevents incomplete/ungraded metadata from entering the permanent record.

#### REQ-TESTS-045: metadata-completeness engine tests
`evaluateMetadataCompleteness` (pass / each field missing / verified-no-grade / in-progress-exempt / both-findings), `collectMetadataCompleteness` (changes-dir fixture: complete / stub / present-but-empty / verified-no-grade / verified-with-A / empty-null-comment / unparseable), `check.service` injection + skipped-never-PASS across all 16 checks (including knowledge-size, test-provenance, constitution-severity, artifact-language, spec-counters and delta-spec-provenance) — the S/A clause and the skill clause mutation-verified.
- WHEN a check id is added to the registry, THEN the skipped-never-PASS assertion covers it too

---
