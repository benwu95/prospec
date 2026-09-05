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
A zero-LLM pure-function evaluator; the collector (I/O) is separated from the evaluator (pure function). The REQ definition source = `specs/features/` headings (excluding `_archived*`); fenced code block content is not scanned (CommonMark closing rule: same character, ≥ length, no info string); dependency direction follows the project's `module-map.yaml` `depends_on` (falling back to Constitution layering when absent), applicable to any prospec project. The collectors' contained file read delegates to `lib/knowledge-reader`'s single contained-read helper — never a collector-local second copy of that invariant — with the caller supplying its own root (collectors use the repo root, knowledge reads use the knowledge tree); the dependency stays one-way (`drift-sources` imports knowledge-reader, never the reverse).
- WHEN any of the three violation categories appears, THEN the finding contains `source_path` + `line`, sorted by (check, path, line number) codepoint
- WHEN module-map exists but its schema is invalid, THEN throw a typed error (fail loudly, do not silently switch rule sets)
- WHEN module-map paths point outside the repo, THEN that path is clamped and does not drive scanning or file reads
- WHEN a module-map paths entry is a single source file, THEN import-edge collection scans only that file itself (file/dir/glob determined by `classifyModulePath`); non-source-file entries produce no import edges (no longer expanded to `<file>/**` and hitting ENOTDIR)
- WHEN a contained read is needed, THEN it goes through that single helper rather than a collector-local implementation, and the existence probe shares the same containment predicate
- WHEN a collector reads a file it ENUMERATED from disk (feature specs, markdown roots, `tasks.md`, import sources), THEN a read failure skips that entry instead of throwing: each collector is evaluated as an argument to `runChecks(...)`, so one directory wearing a `.md` name used to take all fifteen other verdicts with it. Containment is deliberately not added at those sites — they keep scanning exactly what they scanned before; only the failure mode changes

---

### US-2: Knowledge health check [P2]

As a developer who relies on AI Knowledge to judge context trustworthiness,
I want check to compare each module's last source commit against the explicit time that module's knowledge was last confirmed, and report coverage,
so that whether Knowledge is stale can be judged rather than blindly trusted.

**Acceptance Scenarios:**
- WHEN a module's last source commit falls on a later UTC day than its `last_verified` confirmation time — or the module carries no such time — THEN mark the module stale, severity always WARN (never FAIL)
- WHEN a module's knowledge files are committed without a confirmation being recorded, THEN that commit alone does not clear staleness — the signal is the explicit stamp, not the file's commit time
- WHEN the report is produced, THEN the `knowledge_health` field is a frozen contract (modules[]{name, last_src_commit, last_readme_commit, `last_sub_module_commit` (optional, omitted when the module has none), stale, `last_verified` (optional, omitted when the module declares none)} + coverage{documented, total}), consumed directly by downstream (Knowledge Flywheel, MCP server); the pre-existing keys are never reordered or renamed, and the two commit-time keys are still reported for continuity although they no longer drive `stale`
- WHEN git timestamps are unavailable (non-git / shallow clone) or module-map is missing, THEN the check is `skipped` + reason

#### REQ-LIB-015: Knowledge health check (source commit vs `last_verified`)
A module's knowledge freshness is judged against its `last_verified` timestamp — an explicit, CLI-stamped confirmation time recorded per module in `module-map.yaml` — not against the git commit time of its README or sub-module files. The reference source is git log timestamps for the module's last SOURCE commit (file mtime is distorted after a CI checkout and does not participate). The source commit is compared against `last_verified` by UTC calendar day (`%cI` offsets are normalized to epoch first): a source commit on a later UTC day than `last_verified` is stale. Day granularity is deliberate — `last_verified` is stamped moments before the commit that carries both it and the source, so an instant comparison would mark every freshly-committed module stale. The source-commit query EXCLUDES the registered generated artifacts (REQ-LIB-039) by git pathspec, so a commit regenerating build output under a module path does not demand a knowledge update; that exclusion is scoped to this judgment alone, and the same file stays inside `computeChangeDigest`. A pathspec the local git cannot parse degrades to the unexcluded query — the noisier but true answer — never to a null source commit, which the rule would read as fresh. `gitLastCommit` throws on an ambiguous capture failure rather than returning null, so a capture failure is never folded into a 'fresh' judgment. A module with no README, or with no `last_verified`, stays stale by the coverage rule regardless of timestamps — the coverage-gap finding is that verdict's carrier. Source enumeration reached through a symlink is contained by the canonical readers (realpath, reject outside the tree), never skipped. A shallow clone's boundary commit time is a fabricated fact — degrade to skipped. When module-map is missing, phantom coverage must not be fabricated. Staleness is permanently WARN-class — it must never fail a build. The `knowledge_health` report keeps its pre-existing keys (`last_src_commit`, `last_readme_commit`, `last_sub_module_commit`, `stale`, `coverage`) unreordered and unrenamed for its downstream consumers, and carries `last_verified` additively.
- WHEN a module's last source commit falls on a later UTC day than its `last_verified` (or `last_verified` is absent), THEN the module is stale, severity always WARN (never FAIL)
- WHEN a module's `last_verified` is on the same or a later UTC day than its last source commit, THEN the module is NOT stale
- WHEN a module has no README, THEN it is reported stale with its `coverage gap` finding, not by a timestamp comparison
- WHEN a commit under the module's paths touches ONLY registered generated artifacts, THEN `last_src_commit` does not move and that commit alone never makes the module stale
- WHEN one commit touches both a generated artifact and authored source, THEN it still counts as a source commit
- WHEN the excluded-pathspec query fails, THEN the collector falls back to the unexcluded query instead of reporting no source commit
- WHEN the `gitCapture` for `gitLastCommit` unambiguously fails (not just an empty log), THEN it throws an exception rather than returning null
- WHEN the report is produced, THEN the pre-existing `knowledge_health` keys are preserved unreordered/unrenamed and `last_verified` is added additively

#### REQ-LIB-039: Generated-source-artifact registry
`BUNDLED_TEMPLATES_SOURCE` remains a build-time constant in `lib/generated-artifacts.ts` for the templates bundler's output location (single-source for the producer). The module-staleness exclusion reads from `.prospec.yaml` `knowledge.generated_artifacts` (a glob array, default empty) instead of a hardcoded registry — each project declares its own generated files, and projects that declare nothing exclude nothing. Because the exclusion set is now project-writable and unbounded, it degrades rather than silences: whenever the excluded query yields no answer, the collector answers with the unexcluded timestamp instead of null.
- WHEN the templates bundler resolves where to write, THEN it derives the path from `BUNDLED_TEMPLATES_SOURCE` and holds no second copy of that path
- WHEN the staleness collector needs excluded paths, THEN it reads `knowledge.generated_artifacts` from the project's `.prospec.yaml` configuration, not a hardcoded constant
- WHEN `.prospec.yaml` has no `knowledge.generated_artifacts` (or the key is absent), THEN no paths are excluded from `last_src_commit` — the default is empty
- WHEN a configured glob matches SOME of the files under a module's paths, THEN those files are excluded from the staleness `last_src_commit` query but remain inside `computeChangeDigest`
- WHEN the configured globs cover EVERY file under a module's paths — or git cannot parse the `:(exclude)` pathspec — THEN the excluded query has no answer and the collector degrades to the unexcluded timestamp, never to null: `isStale` reads a null `last_src_commit` as "not stale", so no configuration may be able to silence a module's staleness entirely

---


#### REQ-TESTS-071: Generated-artifact exclusion and digest-boundary coverage
The generated-artifact staleness exclusion is pinned from BOTH directions against temp-git fixtures using config-driven excludes, and the digest boundary is pinned beside it so the two scopes cannot silently converge into one.
- WHEN only a configured generated artifact is committed under a module's paths, THEN `last_src_commit` stays at the last authored-source commit
- WHEN the configuration declares no generated artifacts (empty or absent), THEN no paths are excluded from `last_src_commit` — the previously hardcoded path is treated as authored source
- WHEN authored source is committed afterwards with no knowledge update, THEN the module still reports stale
- WHEN that same generated artifact is edited, THEN `computeChangeDigest` changes — asserted alongside the exclusion tests
- WHEN the excluded-pathspec capture is fault-injected to fail, THEN the collector reports the unexcluded timestamp rather than null
- WHEN the exclusion or the digest coverage is reverted, THEN mutation verification turns the corresponding test red

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
`prospec check`'s human-readable output lists every check in `DRIFT_CHECK_IDS` with its own status (a skipped check attaches its reason) and renders the `Findings:` block grouped by finding type; untrusted repo strings pass through `sanitizeTerminal()` (C0/C1 control-character filtering) before output. Flags: `--json` / `--strict` / `--init-ci`.
- WHEN findings exist, THEN they are grouped under a per-`check` heading in `DRIFT_CHECK_IDS` order, each heading carrying its severity tally, and a check with no finding shows no heading
- WHEN the `knowledge-size` group is rendered, THEN it is split into an over-budget sub-section shown first and an approaching-headroom sub-section, and within each the findings are grouped by surface and budget key so the shared threshold and remedy appear once in the heading while each finding line shows only its path and measured token/line count
- WHEN an untrusted path or detail carries control characters, THEN they are filtered by `sanitizeTerminal()` before printing
- WHEN `--strict` is set and a FAIL exists, THEN the exit code is unchanged by the grouped rendering — display grouping never alters which findings or severities are reported

#### REQ-TEMPLATES-091: CI Workflow template
Two jobs: check (checkout `fetch-depth: 0` → `--strict --json` (`shell: bash` enables pipefail, tee must not mask the exit code) → report artifact) + comment (**no checkout**, only downloads the artifact, an off-the-shelf sticky action posts a 4-space-indented code block — no fence can escape, `head -c 60000` cap). Supply-chain hardening is the default: third-party actions are pinned to full commit SHAs, minimal-privilege `permissions:`.

---


#### REQ-LIB-018: dangling-prefix drift (REQ-prefix validity lint, warn-class)

---


#### REQ-LIB-019: feature-modules self-validating drift (validates the modules edge, fail-class)

---


#### REQ-TESTS-031: feature-map drift collector/evaluator tests

---

#### REQ-TYPES-083: knowledge-size structured finding field
The Drift Report schema's `DriftFinding` carries an OPTIONAL `knowledge_size` object — `{ surface, budget_key, budget, actual, unit, tier, remedy? }` — populated only for `knowledge-size` findings; it is additive and optional, so a report without it still validates and existing consumers are unaffected.
- WHEN a `knowledge-size` finding is serialized, THEN it carries a `knowledge_size` object whose `surface` is the load-surface label, `budget_key`/`budget` name the threshold, `actual`/`unit` (`tokens`|`lines`) the measurement, `tier` (`over`|`headroom`) the band, and `remedy` the convergence hint (absent for the headroom band)
- WHEN any other check's finding is serialized, THEN `knowledge_size` is absent and the finding validates unchanged
- WHEN an older report without `knowledge_size` is parsed, THEN it still validates because the field is optional

---

#### REQ-LIB-054: knowledge-size evaluator emits structured fields
`evaluateKnowledgeSize` populates each finding's `knowledge_size` structured fields from `KNOWLEDGE_SIZE_RULES` and the measured item. The human-readable `detail` string is the canonical prose rendering of the finding, and the structured fields are strictly additive to it — never a replacement — so consumers can group by surface/tier without parsing the prose.
- WHEN a file exceeds a token or line budget, THEN its finding's `knowledge_size.tier` is `over`, with `surface`/`budget_key`/`budget`/`actual`/`unit`/`remedy` taken from the rule and measurement
- WHEN a file is within budget but past the headroom band, THEN its finding's `knowledge_size.tier` is `headroom` and `remedy` is absent
- WHEN a knowledge-size finding is produced, THEN its `detail` prose and its `knowledge_size` fields describe the same measurement

---

#### REQ-TESTS-087: knowledge-size structured-finding coverage
The knowledge-size structured-finding behavior is pinned by unit tests: the schema accepts and round-trips `knowledge_size`, the evaluator emits the correct `tier`/`surface`/`budget_key`/`budget`/`actual`/`unit`/`remedy` for over-budget and headroom cases, and each finding's `detail` prose is asserted against a fixed expected string.
- WHEN the evaluator's structured emission is reverted, THEN a test turns red
- WHEN a finding's `detail` wording changes, THEN its byte-identity assertion turns red
- WHEN the optional schema field is removed, THEN a schema test turns red

---

#### REQ-TYPES-088: Auto-draft type contracts
The type layer defines the auto-draft contract and the status drift signal.
- WHEN `AutoDraftOptions` is built, THEN it carries a drift source — in-memory findings, a report path, or an explicit target/reason — plus optional scale, issue and dry-run flags, and the service REFUSES a report source combined with an explicit target/reason/check rather than silently preferring one
- WHEN `AutoDraftResult` is returned, THEN it reports each processed group as `created`, `skipped` or `failed` with its target, check id, scale, every distinct reported remedy, and the skip-or-error reason, alongside the created/skipped/failed counts and whether the run was a dry run
- WHEN `DriftSignal` is produced, THEN it is either `findings` with a count, or `unusable` naming which of three things went wrong — `unreadable` (malformed or off-schema), `stale` (its digest names a different working tree), `unprovable` (it records no digest, so freshness was never measured) — and there is no state meaning "clean", which is expressed by omitting the signal

---

#### REQ-LIB-060: Auto-draft proposal renders from a bundled template
The auto-drafted proposal body is rendered from a bundled Handlebars template, never from a template literal in code, and change names are derived so that distinct subjects stay distinct.
- WHEN a proposal body is built, THEN it renders `change/auto-draft-proposal.md.hbs` through `renderTemplate`, so the bundled-template sync contract covers it like every other shipped template
- WHEN the project's `artifact_language` is not English, THEN the rendered proposal states that it is machine-drafted in English and must be rewritten in that language before leaving the story station, rather than hardcoding any single language's prose
- WHEN the group could not be attributed to a module, THEN `## Related Modules` says so instead of presenting the grouping subject as a module name
- WHEN drift text carries `&`, `<`, or quotes, THEN it renders verbatim: the output is markdown, and HTML escaping would corrupt it
- WHEN a change name is derived, THEN `deriveFixChangeName` produces `fix-<target-slug>-<check-slug>` with path separators and dots collapsed by `sanitizeChangeSlug`, so a `source_path` can never escape `.prospec/changes/`
- WHEN a target does not survive slugging unchanged, THEN a short suffix derived from that target alone is appended, so two different targets can never resolve to one directory — and the name stays the same across runs regardless of what else the report contained, so re-drafting the same drift skips instead of creating a second change
- WHEN the slug of a target or check id would be empty, THEN `general` / `drift` stand in, and the suffix rule above keeps two such targets apart

---

#### REQ-SERVICES-093: Auto-draft delegates scaffolding to the change creator
The auto-draft service turns drift findings into change scaffolds without owning the creation of them.
- WHEN a group is scaffolded, THEN creation goes through `change-story.service`, so the change carries the same guards as `prospec change story` (collision refusal, issue normalization, excess-property-checked metadata) and no second creator exists
- WHEN a change directory for the derived name already exists, THEN `AlreadyExistsError` is caught and the group is reported as skipped — the directory is never read, matched by prefix, or written into
- WHEN a finding's `source_path` is attributed, THEN it resolves through `module-map.yaml` and the configured `knowledge.base_path` / `paths.base_dir`; a path under the configured feature-spec root groups under that feature's name, and a path matching neither groups under `general` — never under an arbitrary file basename, which produced one bogus subject per file
- WHEN a group's target is not a module declared in `module-map.yaml`, THEN an EMPTY explicit module list is passed rather than the key omitted — omitting it re-enables the creator's `index.md` keyword matching, which would attach guessed modules to a change whose subject could not be attributed
- WHEN a knowledge-tree path yields a directory segment, THEN it is claimed as a module only when `module-map.yaml` declares that name: the segment is raw report text, and an undeclared one would be refused at the metadata write after `proposal.md` was already on disk
- WHEN a finding carries the `headroom` knowledge-size tier, or its `source_path` lies under `.prospec/`, THEN it is not draftable: the first reports budget pressure rather than a violation, and the second is an SDD process gate ON a change, so drafting it would create a change whose job is another change's paperwork — and which trips the same gates the moment it exists. Nothing else is dropped or capped
- WHEN one group's scaffold cannot be written, THEN that group is reported with `action: 'failed'` and the remaining groups still run — throwing would discard the result and leave directories on disk that nothing names
- WHEN a group merges findings that could not be attributed, THEN the proposal carries EVERY finding with its own `source_path` and every DISTINCT reported remedy, and says the group may need splitting
- WHEN no drift source is given at all, THEN the service throws `PrerequisiteError` instead of returning an empty, clean-looking result
- WHEN `dryRun` is set, THEN no change directory is created — not merely no `proposal.md`, since a metadata-only directory would suppress every later draft for the same finding
- WHEN an explicit `--target` is given, THEN that name is used verbatim instead of being re-derived by path attribution, and combining it with a report source is refused rather than silently ignoring one of them
- WHEN the report cannot be used, THEN absent-or-empty, invalid JSON, and off-schema are reported as three different sentences naming the offending fields, never as a raw validator dump

---

#### REQ-SERVICES-094: Drafting never affects the check's report or verdict
Auto-drafting is a convenience layered on the check, and cannot compromise it.
- WHEN `execute` runs with `autoDraft` and `json`, THEN `prospec-report.json` is written before drafting starts
- WHEN drafting throws, THEN the failure is recorded on the result as `autoDraftError` and reported, never propagated — the report is still returned and `hasFail` still derives from `summary.fail_count`, so `--strict`'s exit code is unchanged
- WHEN `autoDraftDryRun` is set, THEN only drafting is simulated; the flag is named for that scope because the command's other writes are unaffected by it
- WHEN `--auto-draft` is combined with a mode that returns before the drift run (`--init-ci`, `--record-review`, `--record-tests`, `--escaped-defects`), or `--auto-draft-dry-run` is given without `--auto-draft`, THEN the command exits non-zero naming the conflict rather than accepting a flag it will not honour

---

#### REQ-CLI-041: `prospec check --auto-draft` flag
`prospec check` can draft from the run it just reported.
- WHEN `prospec check --auto-draft` runs, THEN drafted and skipped changes are reported after the check summary, with every free-form value sanitized
- WHEN drafting failed, THEN the output states that the check verdicts above are unaffected
- WHEN `--quiet` is set, THEN the names of change directories that were actually created are still printed, because what was written must stay visible
- WHEN `--auto-draft-dry-run` is set, THEN the block is marked as a dry run and no follow-up action is suggested

---

#### REQ-TESTS-096: Auto-draft behavior is pinned by tests, not by shape assertions
Each guarantee below is pinned by a test that fails if the behavior is removed — asserted on the drafted result and on disk, not on the shape of a returned object.
- WHEN the knowledge root is relocated via `knowledge.base_path`, THEN a test asserts findings still group under their real module name
- WHEN a finding is unattributable, THEN a test asserts the change is named `general` and writes no `related_modules`
- WHEN a dry run completes, THEN a test asserts no change directory exists at all
- WHEN drafting runs twice against a hand-edited proposal, THEN a test asserts the second run skips and the edited bytes are unchanged
- WHEN drafting throws, THEN a test asserts the JSON report is still written and `hasFail` still derives from the summary
- WHEN the CLI is invoked with no drift source or an invalid `--scale`, THEN E2E tests assert a non-zero exit and an empty `.prospec/changes/`

---

#### REQ-LIB-069: Anchored, bounded import-edge scan
The cross-module import-edge scan is line-anchored: it matches `import`/`export … from` and bare side-effect imports with a start-of-line-anchored multiline (`gm`) pattern, and derives each edge's line number from a precomputed newline-offset table rather than re-splitting the file per match. The produced edge set is identical to the unanchored scan; only super-linear backtracking on files with many `export … ;` statements is removed.
- WHEN a source file contains a multi-line `import { … }` followed on a later line by `from '…'`, THEN the edge is still captured
- WHEN a source file contains `export const X = './path'` (a string constant with no `from`), THEN no edge is registered
- WHEN the same repository is scanned before and after, THEN the produced edge set (from_path, from_module, to_module, specifier, line) is identical

---

#### REQ-LIB-070: Single git-fact gather per drift run
Within one drift run, git facts are gathered once and reused. The git work-tree probe is computed a single time and shared across the digest, clean, timestamp, and provenance collectors instead of each re-probing. The change digest uses one shared `snapshot-v2` file capture; `computeChangeState` also returns optional HEAD trace and diagnostic cleanliness over the same effective-input scope, with `computeChangeDigest` / `computeWorkingTreeClean` as thin wrappers preserving exports and the clean tri-state (`true` / `false` / `null`). File hashing never spawns Git per file; HEAD and clean do not participate in validity. Per-module last-commit timestamps are resolved from a single `git log -c --name-only` walk — newest to oldest, assigning each path-group its first touching non-excluded commit and reproducing the generated-artifact exclusion in-walk, the combined diff (`-c`) attributing a merge commit exactly as `git log -1 -- <path>` does — with a per-group fallback to the individual `git log -1` only for a path-group untouched within the walk window; the batched result is byte-identical to the per-module query. `collectGitTimestamps` honors a caller-narrowed module set. A full `prospec check` on this repository issues no more than six git subprocesses.
- WHEN `prospec check` runs on this repository, THEN it issues at most six git subprocesses, shares the single snapshot with its consumers, and preserves the existing findings except the evidence-validity changes specified for snapshot-v2
- WHEN the batched timestamp walk covers a repository with excluded generated artifacts, extra sub-module knowledge files, and a module untouched within the walk window, THEN each module's last_src_commit / last_readme_commit / last_sub_module_commit is byte-identical to the per-module `git log -1` result
- WHEN a capture required for identity fails, THEN its digest is null with a reason; WHEN only the diagnostic clean capture fails, THEN cleanliness is null and never supplies evidence validity
- WHEN a caller passes an already-filtered module set to `collectGitTimestamps`, THEN only those modules' timestamps are gathered

---

#### REQ-TYPES-095: Versioned snapshot report and current-assessment contracts
The existing report schema accepts optional snapshot fingerprint version/scope and Git trace fields without changing the frozen check-id order or knowledge_health keys. The named CurrentDriftAssessment contract carries the current report, snapshot validity/reason and an in-memory observation receipt; it is not a persisted report-input fingerprint cache.
- WHEN an older report lacks the new optional fields, THEN it still parses, but missing or unknown identity version/scope is unprovable as current evidence rather than silently upgraded
- WHEN a new report is produced, THEN change_digest represents snapshot-v2 identity and its recognized version/scope are explicit; optional HEAD trace and generated_at do not participate in content-equivalence comparison
- WHEN the current-assessment contract crosses a module boundary, THEN its required report/snapshot/receipt fields and validity reasons are named types owned by types, with no filesystem/service imports
- WHEN report compatibility is checked, THEN existing check ids remain in their frozen order and knowledge_health fields remain present with their existing names and order; no new drift check id is introduced for the internal assessment

---

#### REQ-LIB-075: Read-only current drift assessment and observation receipt
lib/drift-assessment.ts owns the existing collector-to-runChecks assembly as a read-only current assessment shared by check, verify record, archive and status. It reuses the established snapshot, metadata, Knowledge, grading and archive-gate owners rather than calling command services or duplicating evaluators.
- WHEN an assessment runs, THEN it collects and evaluates current facts without spawning the project test command, writing metadata or reports, drafting changes, or performing archive mutations
- WHEN collectors observe config, module-map/Knowledge, specs, change membership, tasks, metadata including latest verify grade/provenance/attempt, delta-spec, backfill evidence or required external Git facts, THEN the receipt records the same observations that supplied those verdicts, including bytes, existence and enumeration membership; hashing a different end-state after grading cannot validate earlier observations
- WHEN a gate's preflight finishes and before its first mutation, THEN re-read and compare those observations including the shared knowledge-sync inputs; changed, missing or unreadable required observations refuse the action with byte-identical files under dry-run and execution
- WHEN an ordinary change's required snapshot or assessment is unprovable or a required check is missing, THEN verify record and archive refuse before writing, even if another mechanical check was skipped or a WARN budget would otherwise allow A; proven-backfill applicability and honest command-unavailability skips retain their existing meaning and never suppress known non-zero failure
- WHEN a previous report predates a normal verify record that appends B/C/D, changes to tasks, delta-spec or provenance, or a new failed/non-passing attempt, THEN gates evaluate current facts directly and cannot authorize from that previous report
- WHEN each new command creates an assessment, THEN its receipt is in-memory only and excludes the saved report itself; ordinary verify bookkeeping and content-equivalent commits require no persisted receipt migration or automatic test rerun
- WHEN status compares a saved report, THEN compare its recognized deterministic payload with the live assessment excluding generated_at and pure Git trace, retaining the existing draftable-finding predicate and read-only behavior
- WHEN repository-wide gate aggregation or read-only MCP collection runs, THEN retain the existing scope and public interfaces; this assessment does not introduce per-change gate filtering or a new MCP resource
- WHEN concurrency guarantees are described, THEN limit them to the observed capture boundaries and the receipt check before the first mutation; do not claim a filesystem transaction or detection of every transient mutation restored between observations

---
