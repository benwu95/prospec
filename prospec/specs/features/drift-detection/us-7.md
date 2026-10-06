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
