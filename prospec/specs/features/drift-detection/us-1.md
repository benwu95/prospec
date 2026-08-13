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
I want check to compare module source code against its knowledge files — the README plus each extracted sub-module — by git commit timestamp and report coverage,
so that whether Knowledge is stale can be judged rather than blindly trusted.

**Acceptance Scenarios:**
- WHEN a module's last src commit is later than its newest knowledge commit (the later of its README and sub-module commits), THEN mark the module stale, severity always WARN (never FAIL)
- WHEN the report is produced, THEN the `knowledge_health` field is a frozen contract (modules[]{name, last_src_commit, last_readme_commit, `last_sub_module_commit` (optional, omitted when the module has none), stale} + coverage{documented, total}), consumed directly by downstream (Knowledge Flywheel, MCP server); the pre-existing keys are never reordered or renamed
- WHEN git timestamps are unavailable (non-git / shallow clone) or module-map is missing, THEN the check is `skipped` + reason

#### REQ-LIB-015: [Knowledge health check (git timestamps)]
The comparison source is git log timestamps (file mtime is distorted after a CI checkout and does not participate in the judgment); timestamps are compared by epoch (%cI carries each one's own timezone offset). A module's knowledge is its `README.md` plus every extracted sub-module `.md` sibling, so staleness compares the module's last source commit against the NEWEST of those knowledge commits; the report carries both `last_readme_commit` (the README's own) and the optional `last_sub_module_commit`, so a documented module's verdict is reproducible from the report alone. The source-commit query EXCLUDES the registered generated artifacts (REQ-LIB-039) by git pathspec — build output that sits under a module path but carries no knowledge a README could describe, so a commit regenerating it must not demand a knowledge update. That exclusion is scoped to this judgment alone: the same file stays inside `computeChangeDigest`, which fingerprints shipped code and must keep invalidating review/test provenance when it changes. A pathspec the local git cannot parse degrades to the unexcluded query — the noisier but true answer — never to a null source commit, which the staleness rule reads as fresh. In case of ambiguous capture failures in `gitLastCommit`, it throws an exception rather than silently returning null, so that a capture failure is not mistakenly folded into a 'fresh' judgment. A module with NO README stays stale by the coverage rule regardless of those timestamps — the coverage-gap finding is that verdict's carrier. A knowledge file reached through a symlink is enumerated like any other: containment is enforced by the canonical readers (realpath, reject outside the tree), never by skipping symlinks, since skipping one would drop a real measurement and let the budget gate fail open. A shallow clone's boundary commit time is a fabricated fact — degrade to skipped. When module-map is missing, phantom coverage must not be fabricated from Constitution fallback modules.
- WHEN a module's source commit is newer than every knowledge commit it has, THEN the module is stale, severity always WARN (never FAIL)
- WHEN only a sub-module file is updated and its commit is newer than the module's last source commit, THEN the module is NOT stale
- WHEN the README is the newer of the two knowledge files, THEN it is the one the source commit is compared against
- WHEN a module has no sub-module file, THEN `last_sub_module_commit` is absent and the verdict matches the README-only comparison
- WHEN a module has sub-modules but no README, THEN it is reported stale with its `coverage gap` finding, not by a timestamp comparison
- WHEN a commit under the module's paths touches ONLY registered generated artifacts, THEN `last_src_commit` does not move and that commit alone never makes the module stale
- WHEN one commit touches both a generated artifact and authored source, THEN it still counts as a source commit
- WHEN the excluded-pathspec query fails, THEN the collector falls back to the unexcluded query instead of reporting no source commit
- WHEN the `gitCapture` for `gitLastCommit` unambiguously fails (not just an empty log), THEN it throws an exception rather than returning null

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
Flags `--json`/`--strict`/`--init-ci`; the human-readable output lists each of the sixteen checks with its own status (skipped explicitly attaches a reason); untrusted repo strings are output after `sanitizeTerminal()` filters C0/C1 control characters.

#### REQ-TEMPLATES-091: CI Workflow template
Two jobs: check (checkout `fetch-depth: 0` → `--strict --json` (`shell: bash` enables pipefail, tee must not mask the exit code) → report artifact) + comment (**no checkout**, only downloads the artifact, an off-the-shelf sticky action posts a 4-space-indented code block — no fence can escape, `head -c 60000` cap). Supply-chain hardening is the default: third-party actions are pinned to full commit SHAs, minimal-privilege `permissions:`.

---


#### REQ-LIB-018: dangling-prefix drift (REQ-prefix validity lint, warn-class)

---


#### REQ-LIB-019: feature-modules self-validating drift (validates the modules edge, fail-class)

---


#### REQ-TESTS-031: feature-map drift collector/evaluator tests

---
