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
A zero-LLM pure-function evaluator; the collector (I/O) is separated from the evaluator (pure function). The REQ definition source = `specs/features/` headings (excluding `_archived*`), and `req-references` also resolves an id that a `## Deprecated Requirements` section lists as a retired bullet (REQ-LIB-096) without making it a definition; fenced code block content is not scanned (CommonMark closing rule: same character, ≥ length, no info string); dependency direction follows the project's `module-map.yaml` `depends_on` (falling back to Constitution layering when absent), applicable to any prospec project. The collectors' contained file read delegates to `lib/knowledge-reader`'s single contained-read helper — never a collector-local second copy of that invariant — with the caller supplying its own root (collectors use the repo root, knowledge reads use the knowledge tree); the dependency stays one-way (`drift-sources` imports knowledge-reader, never the reverse).
- WHEN any of the three violation categories appears, THEN the finding contains `source_path` + `line`, sorted by (check, path, line number) codepoint
- WHEN module-map exists but its schema is invalid, THEN throw a typed error (fail loudly, do not silently switch rule sets)
- WHEN a module-map path, literal or glob, resolves outside the project — its project-relative form is `..`, begins with a `..` segment, or is absolute — THEN that path is clamped and does not drive scanning or file reads
- WHEN a glob's project-relative form is the project root itself (as `*/..`'s is), THEN it is clamped; WHEN a literal path resolves to the project root, THEN it is inside the project and is kept
- WHEN a kept literal path resolves to the project root, THEN import-edge collection does not scan it and diff attribution assigns it no file
- WHEN a module-map paths entry is a single source file, THEN import-edge collection scans only that file itself (file/dir/glob determined by `classifyModulePath`); non-source-file entries produce no import edges (no longer expanded to `<file>/**` and hitting ENOTDIR)
- WHEN a contained read is needed, THEN it goes through that single helper rather than a collector-local implementation, and the existence probe shares the same containment predicate
- WHEN a collector reads a file it ENUMERATED from disk (feature specs, markdown roots, `tasks.md`, import sources), THEN a read failure skips that entry instead of throwing: each collector is evaluated as an argument to `runChecks(...)`, so one directory wearing a `.md` name used to take all fifteen other verdicts with it. Containment is deliberately not added at those sites — they keep scanning exactly what they scanned before; only the failure mode changes

---

### US-2: Knowledge health check [P2]

As a developer who relies on AI Knowledge to judge context trustworthiness,
I want check to compare each module's current source against the source digest recorded when that module's knowledge was last confirmed, and report coverage,
so that whether Knowledge is stale can be judged rather than blindly trusted.

**Acceptance Scenarios:**
- WHEN a module's current source digest differs from the `source_digest` recorded at its last confirmation — or the module carries no `last_verified` or no `source_digest` of the current version — THEN mark the module stale, severity always WARN (never FAIL)
- WHEN a module's knowledge files are committed without a confirmation being recorded, THEN that commit alone does not clear staleness — the signal is the explicit stamp, not the file's commit time
- WHEN the report is produced, THEN the `knowledge_health` field is a frozen contract (modules[]{name, last_src_commit, last_readme_commit, `last_sub_module_commit` (optional, omitted when the module has none), stale, `last_verified` (optional, omitted when the module declares none), `freshness` (optional)} + coverage{documented, total}), consumed directly by downstream (Knowledge Flywheel, MCP server); the pre-existing keys are never reordered or renamed, and the two commit-time keys are still reported for continuity although they no longer drive `stale`
- WHEN git cannot confirm a work tree or module-map is missing, THEN the check is `skipped` + reason; a shallow clone only leaves the commit-time keys null

#### REQ-LIB-015: Knowledge health check (source content digest vs `source_digest`)
A module's knowledge freshness is judged by comparing a digest of its current source with the `source_digest` that `prospec knowledge verify` recorded in `module-map.yaml` (REQ-TYPES-084, REQ-SERVICES-090); git commit times do not decide it. The digest covers the files git tracks or would add (untracked files git does not ignore) under the module's declared paths, minus the registered generated artifacts (REQ-LIB-039), the knowledge base, the Feature Specs directory (`{base_dir}/specs`) and the workflow bookkeeping the change digest also excludes (`.prospec/` and the drift report); each file contributes its path and git's identity for its content — its index entry when `git status --untracked-files=all --ignore-submodules=none` reports it unchanged; otherwise, unless it is a gitlink whose path, reached without passing through a symlink, still holds a directory, the entry git would record for it, and nothing when git would record none — and file modes do not contribute. Which paths git would record comes from a first pass: `git add -A` into a temporary copy of the index, with `GIT_OBJECT_DIRECTORY` naming an empty object directory of its own and no alternate, `core.safecrlf` disabled, and the untracked nested repositories the listing names excluded. A file kept by that pass contributes the entry it records when that entry equals the file's index entry; a changed file outside the workflow bookkeeping whose entry the pass changed contributes instead the entry `git update-index --add --remove --replace --info-only` records for it over a second temporary copy of the index, which reads the repository's objects and writes none. Both passes run with `core.splitIndex` disabled, `core.hooksPath` set to `/dev/null` (hooks configured through `hook.<name>` keys still run) and `GIT_NO_LAZY_FETCH` set, against index copies that keep the index's mtime, and the recording deletes its temporary index copies and object directory once it ends, whether or not git succeeded. An untracked nested repository the listing names counts as held for the exclusion decisions; it, and a path the first pass records as a gitlink where the index holds no gitlink, keeps a module that counts it from a computable digest. Where git cannot confirm a work tree (not a repository, or a repository git refuses to read), the check is skipped with its reason. Inside a work tree, a documented module is fresh exactly when it has a parsable `last_verified`, a `source_digest` of the current digest version and a computable current digest equal to it; every other documented module is stale, and the report names why (REQ-TYPES-073). A module with no README stays stale by the coverage rule — the coverage-gap finding is that verdict's carrier. Staleness is permanently WARN-class — it must never fail a build. When module-map is missing, phantom coverage must not be fabricated. Source enumeration reached through a symlink is contained by the canonical readers (realpath, reject outside the tree), never skipped. The `knowledge_health` report keeps its pre-existing keys (`last_src_commit`, `last_readme_commit`, `last_sub_module_commit`, `stale`, `coverage`) unreordered and unrenamed for its downstream consumers and carries `last_verified` and the verdict's basis additively; the commit-time keys no longer drive `stale`. They are computed with the registered generated artifacts excluded by git pathspec, degrading to the unexcluded query when the excluded one has no answer, with `gitLastCommit` throwing on an ambiguous capture failure rather than returning null; when commit times cannot be captured — a shallow clone, whose boundary commit times are fabricated facts, an unborn HEAD, or a failed capture — they are null or absent. A declared path without `*` is a literal path, resolved project-relative from the project directory; a declared path with `*` is a glob that git matches with `:(glob)` magic exactly as written — `*` stays within one path segment and `**/` matches any number of leading directories, none included — with `GIT_LITERAL_PATHSPECS`, `GIT_GLOB_PATHSPECS`, `GIT_NOGLOB_PATHSPECS` and `GIT_ICASE_PATHSPECS` removed from git's environment; a path REQ-LIB-107 refuses contributes no file.
- WHEN, inside a git work tree, a documented module has a parsable `last_verified` and a `source_digest` of the current digest version equal to the digest of its current source, THEN the module is NOT stale
- WHEN, inside a git work tree, a documented module's current source digest differs from its recorded `source_digest` — a source file committed or merged in after the stamp, whatever its commit date, or a source file edited, added or deleted in the working tree — THEN the module is stale, severity always WARN (never FAIL)
- WHEN, inside a git work tree, a documented module has no parsable `last_verified`, no `source_digest` of the current digest version, or no computable current digest, THEN it is stale and its finding names which, asking for the README to be confirmed and the module re-stamped with `prospec knowledge verify` when a stamp or digest is missing
- WHEN, inside a git work tree, a module declares no path that is inside the project and not refused by REQ-LIB-107, or at least one file lies under its paths and every such file lies in the knowledge base, the Feature Specs directory or the workflow bookkeeping, THEN the module has no computable current digest; when no supported path remains, its reason says so, names each refused path it reads and refers to REQ-LIB-107's check
- WHEN a module has no supported path, THEN its `last_src_commit` is null, never the newest commit of the repository
- WHEN checkouts hold the same content under a module's paths with the same module paths, generated artifacts, base directory and knowledge path configured, each is not sparse and `git status --untracked-files=all --ignore-submodules=none` reports no change in each, THEN they yield the same digest whatever their commit history, `core.autocrlf`, `eol` attributes, `core.symlinks`, clone depth or whether the project sits in a repository subdirectory
- WHEN a module's paths cover the knowledge base or the Feature Specs directory, THEN writing a stamp or graduating Feature Specs does not change that module's digest
- WHEN a module's literal path is written as `./x`, `x/`, `x/.`, `x//y` or `x/../x`, THEN its digest covers the files of the project-relative path it resolves to
- WHEN a module's literal path resolves to the project root (`.`, `./`, `x/..`), THEN its digest covers every file of the project the exclusions above leave, whether or not the caller clamped the module map first
- WHEN a module's path is a glob REQ-LIB-107 accepts, THEN it contributes the files `git ls-files --cached --others --exclude-standard -- ':(glob)<path>'` lists from the project directory, less the exclusions above — `src/*.ts` covers only the `.ts` files directly under `src/`, and `**/name/**` covers a top-level `name/` as well as a nested one — whatever pathspec variables the user's environment sets
- WHEN a module's literal path holds `[`, `]` or `?` but no `*`, THEN it is matched as the literal path it names
- WHEN only a file's mode changes, THEN the module's digest is unchanged
- WHEN `git status` reports a file listed under a module's paths changed — untracked, deleted and workflow-bookkeeping files included, untracked nested repositories the listing names excepted — THEN whether the first pass keeps an entry for its path decides whether it counts toward the exclusions above and REQ-LIB-039's lift, and, for a counted file that is neither a gitlink whose path, reached without passing through a symlink, still holds a directory nor a path the first pass records as a gitlink where the index holds no gitlink, the digest uses the entry described above for it
- WHEN the first pass exits non-zero, THEN a module that reads it for one of its listed files has no computable current digest and its reason carries git's message, while a module listing no file `git status` reports changed keeps its digest
- WHEN the second pass exits non-zero, THEN a module counting a file that pass was given has no computable current digest and its reason carries git's message, while a module counting none of them keeps its digest
- WHEN a module has no README, THEN it is reported stale with its `coverage gap` finding, not by a timestamp comparison
- WHEN a commit under the module's paths touches ONLY registered generated artifacts and the module has source outside them, THEN `last_src_commit` does not move and that commit alone never makes the module stale
- WHEN one commit touches both a generated artifact and authored source, THEN it still counts as a source commit
- WHEN the excluded-pathspec query fails, THEN the collector falls back to the unexcluded query instead of reporting no source commit
- WHEN the `gitCapture` for `gitLastCommit` unambiguously fails (not just an empty log), THEN it throws an exception rather than returning null
- WHEN git cannot confirm a work tree, THEN the check is skipped with its reason
- WHEN, inside a git work tree, commit times cannot be captured, THEN modules are still judged by digest and their commit-time keys are null or absent
- WHEN the report is produced, THEN the pre-existing `knowledge_health` keys are preserved unreordered/unrenamed and `last_verified` is added additively

#### REQ-LIB-039: Generated-source-artifact registry
`BUNDLED_TEMPLATES_SOURCE` remains a build-time constant in `lib/generated-artifacts.ts` for the templates bundler's output location (single-source for the producer). The module-staleness exclusion reads from `.prospec.yaml` `knowledge.generated_artifacts` (an array of paths and globs, default empty, each read by REQ-LIB-015's literal-or-glob rule; a pattern REQ-LIB-107 refuses excludes nothing) instead of a hardcoded registry — each project declares its own generated files, and projects that declare nothing exclude nothing. It applies to the module's source digest (REQ-LIB-015) and to its reported `last_src_commit`, never to `computeChangeDigest`. Because the exclusion set is project-writable and unbounded, it degrades rather than silences: whenever it leaves a module with no source file, or the excluded query yields no answer, the generated-artifact exclusion alone is lifted, while the other exclusions REQ-LIB-015 names always apply.
- WHEN the templates bundler resolves where to write, THEN it derives the path from `BUNDLED_TEMPLATES_SOURCE` and holds no second copy of that path
- WHEN the staleness collector needs excluded paths, THEN it reads `knowledge.generated_artifacts` from the project's `.prospec.yaml` configuration, not a hardcoded constant
- WHEN `.prospec.yaml` has no `knowledge.generated_artifacts` (or the key is absent), THEN no paths are excluded from the source digest or `last_src_commit` as generated — the default is empty
- WHEN a configured glob matches SOME of the files under a module's paths, THEN those files are excluded from the module's source digest and its `last_src_commit` query but remain inside `computeChangeDigest`
- WHEN the configured patterns cover EVERY file under a module's paths — or git cannot answer the listing or the excluded query that applies them — THEN the module's source digest and `last_src_commit` are computed without the generated-artifact exclusion, so no generated-artifact configuration can freeze a module's digest and silence its staleness

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

#### REQ-TYPES-027: Drift Report Schema (check scopes and enumerated subjects)
`types/drift-report.ts` owns `DriftReportSchema` (`prospec-report.json`), the frozen `DRIFT_CHECK_IDS`, and `DRIFT_CHECK_SCOPES: Record<DriftCheckId, 'change' | 'repository'>` — `change` for `task-completion`, `review-provenance`, `metadata-completeness`, `test-provenance`, `delta-spec-provenance` and `delta-spec-landing-fidelity`, `repository` for every other check. `DriftCheckResultSchema` is `{ id, status, reason?, subjects?, subject_skips? }`.
- WHEN a check id is added to `DRIFT_CHECK_IDS` without a `DRIFT_CHECK_SCOPES` entry, THEN type-checking fails
- WHEN a `change`-scoped check runs, THEN its result carries `subjects` — the change names its collector enumerated (empty when none) — and a `repository`-scoped check carries none
- WHEN a `change`-scoped evaluator could not grade one enumerated change while another produced findings (e.g. `test-provenance` with this change's test command unavailable and a sibling's failing run), THEN the result carries that change under `subject_skips` with its reason, so the whole-check `fail` never reads as the ungraded change's pass
- WHEN an older report without `subjects` is parsed, THEN it still validates; consumers treat the absence as unprovable for per-change adjudication, never as pass

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
- WHEN a group has no module attribution, THEN it is reported with the existing `action: 'failed'` outcome and a remedy for the agent to determine scope and create the change explicitly; no creator call or scaffold write occurs for that group, and other groups continue
- WHEN a knowledge-tree path yields a directory segment, THEN it is claimed as a module only when `module-map.yaml` declares that name: the segment is raw report text, and an undeclared one would be refused at the metadata write after `proposal.md` was already on disk
- WHEN a finding carries the `headroom` knowledge-size tier, or its `source_path` lies under `.prospec/`, THEN it is not draftable: the first reports budget pressure rather than a violation, and the second is an SDD process gate ON a change, so drafting it would create a change whose job is another change's paperwork — and which trips the same gates the moment it exists. Nothing else is dropped or capped
- WHEN one group's scaffold cannot be written, THEN that group is reported with `action: 'failed'` and the remaining groups still run — throwing would discard the result and leave directories on disk that nothing names
- WHEN an unattributed group fails, THEN it is not claimed as a created proposal; the original report remains available and the remedy directs the caller to explicit scope declaration
- WHEN no drift source is given at all, THEN the service throws `PrerequisiteError` instead of returning an empty, clean-looking result
- WHEN `dryRun` is set, THEN no change directory is created — not merely no `proposal.md`, since a metadata-only directory would suppress every later draft for the same finding
- WHEN an explicit `--target` is given, THEN that name is used verbatim instead of being re-derived by path attribution, and combining it with a report source is refused rather than silently ignoring one of them
- WHEN the report cannot be used, THEN absent-or-empty, invalid JSON, and off-schema are reported as three different sentences naming the offending fields, never as a raw validator dump
- WHEN a group has a known module attribution, THEN it supplies that module as an explicit non-empty list to the shared creator rather than relying on a missing-scope default

---

#### REQ-SERVICES-094: Drafting never affects the check's report or verdict
Auto-drafting is a convenience layered on the check, and cannot compromise it.
- WHEN `execute` runs with `autoDraft` and `json`, THEN `prospec-report.json` is written before drafting starts
- WHEN drafting throws, THEN the failure is recorded on the result as `autoDraftError` and reported, never propagated — the report is still returned and `hasFail` still derives from `summary.fail_count`, so `--strict`'s exit code is unchanged
- WHEN `autoDraftDryRun` is set, THEN only drafting is simulated; the flag is named for that scope because the command's other writes are unaffected by it
- WHEN `--auto-draft` is combined with a mode that returns before the drift run (`--init-ci`, `--record-review`, `--record-tests`), or `--auto-draft-dry-run` is given without `--auto-draft`, THEN the command exits non-zero naming the conflict rather than accepting a flag it will not honour

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
- WHEN a finding is unattributable, THEN a test asserts its group fails with a scope-declaration remedy and no change directory or artifacts, instead of silently declaring empty scope
- WHEN a dry run completes, THEN a test asserts no change directory exists at all
- WHEN drafting runs twice against a hand-edited proposal, THEN a test asserts the second run skips and the edited bytes are unchanged
- WHEN drafting throws, THEN a test asserts the JSON report is still written and `hasFail` still derives from the summary
- WHEN the CLI is invoked with no drift source or an invalid `--scale`, THEN E2E tests assert a non-zero exit and an empty `.prospec/changes/`
- WHEN known and unattributed groups share a run, THEN tests assert known groups still scaffold with explicit module lists and failed groups leave no scaffold, while the original report and check verdict retain their existing semantics

---

#### REQ-LIB-069: Anchored, bounded import-edge scan
The cross-module import-edge scan is line-anchored: it matches `import`/`export … from` and bare side-effect imports with a start-of-line-anchored multiline (`gm`) pattern, and derives each edge's line number from a precomputed newline-offset table rather than re-splitting the file per match. The produced edge set is identical to the unanchored scan; only super-linear backtracking on files with many `export … ;` statements is removed.
- WHEN a source file contains a multi-line `import { … }` followed on a later line by `from '…'`, THEN the edge is still captured
- WHEN a source file contains `export const X = './path'` (a string constant with no `from`), THEN no edge is registered
- WHEN the same repository is scanned before and after, THEN the produced edge set (from_path, from_module, to_module, specifier, line) is identical

---

#### REQ-LIB-070: Single git-fact gather per drift run
Within one drift run, git facts are gathered once and reused. The git work-tree probe is computed a single time and shared across the digest, clean, timestamp, and provenance collectors instead of each re-probing. The change digest uses one shared `snapshot-v2` file capture; `computeChangeState` also returns optional HEAD trace and diagnostic cleanliness over the same effective-input scope, with `computeChangeDigest` / `computeWorkingTreeClean` as thin wrappers preserving exports and the clean tri-state (`true` / `false` / `null`). File hashing never spawns Git per file; HEAD and clean do not participate in validity. Each module's three path-groups — its source paths with the generated artifacts excluded, its README, and its sub-module knowledge files — resolve their last-commit timestamp through their own `git log -1` run from the project directory — the source group with the pathspecs REQ-LIB-015 names, the README and sub-module groups as literal pathspecs in POSIX form — so git alone answers merges and repository-subdirectory projects. `collectGitTimestamps` honors a caller-narrowed module set. Module source digests (REQ-LIB-015) reuse that snapshot capture's `ls-files` inventory and status — the snapshot hands its inventory over whenever its listing and its status capture both succeeded and agree on membership, even when a later step of its own capture fails — adding three git subprocesses — `git rev-parse --git-path index`, `git add -A` into a temporary index and `git ls-files` of that index — only when a module lists a file `git status` reports changed (untracked and workflow-bookkeeping files included), and two more — `git update-index --info-only` into a second temporary index and `git ls-files` of it — only when that first pass changes the entry of such a file outside the bookkeeping, a fixed number of reads per gitlink inside a module, for a module whose paths include a glob, its own listing, and one listing per run when a generated-artifact pattern is a glob; attribution and nested-repository detection run over the whole module map; a caller without a snapshot captures the same inventory once; the temporary-index recording always covers the whole project, whatever subset the caller asks about, so every caller attributes a failed recording to the same modules. Besides one `git log -1` per path-group — two when its excluded query has no answer — a full `prospec check` on this repository issues no more than five git subprocesses, plus the five above when they apply.
- WHEN `prospec check` runs on this repository, THEN besides the per-path-group `git log -1` queries it issues at most five git subprocesses, plus at most five temporary-index subprocesses when a module lists a file `git status` reports changed, shares the single snapshot with its consumers, and preserves the existing findings except the evidence-validity changes specified for snapshot-v2
- WHEN a merge's two sides each change a different file of one module, or the project sits in a repository subdirectory beside a same-named path outside it, THEN each module's last_src_commit / last_readme_commit / last_sub_module_commit equals `git log -1 --format=%cI` run from the project directory with the same pathspecs
- WHEN a capture required for identity fails, THEN its digest is null with a reason; WHEN only the diagnostic clean capture fails, THEN cleanliness is null and never supplies evidence validity
- WHEN a caller narrows `collectGitTimestamps` to a subset of the module map, THEN only those modules' timestamps and source digests are gathered, while the temporary-index recording still covers the whole project
- WHEN the number of modules grows while every module path and every generated-artifact pattern is literal and no module holds a gitlink, THEN the git subprocesses spent on source digests stay within a bound independent of the module count
- WHEN opt-in test evidence needs a narrower projection, THEN derive full and test digests from one shared inventory/capture rather than independently enumerating Git inputs for each; default consumers continue sharing the full snapshot, and the existing full-check Git-subprocess bound remains unchanged.

---

#### REQ-TYPES-095: Versioned snapshot report and current-assessment contracts
The existing report schema accepts optional snapshot fingerprint version/scope and Git trace fields without changing the frozen check-id order or knowledge_health keys. The named CurrentDriftAssessment contract carries the current report, snapshot validity/reason and an in-memory observation receipt; it is not a persisted report-input fingerprint cache.
- WHEN an older report lacks the new optional fields, THEN it still parses, but missing or unknown identity version/scope is unprovable as current evidence rather than silently upgraded
- WHEN a new report is produced, THEN change_digest represents snapshot-v2 identity and its recognized version/scope are explicit; optional HEAD trace and generated_at do not participate in content-equivalence comparison
- WHEN the current-assessment contract crosses a module boundary, THEN its required report/snapshot/receipt fields and validity reasons are named types owned by types, with no filesystem/service imports
- WHEN report compatibility is checked, THEN existing check ids remain in their frozen order and knowledge_health fields remain present with their existing names and order; no new drift check id is introduced for the internal assessment
- WHEN the report exposes opt-in reuse, THEN its optional per-change test_evidence data contains only certified reuse payloads from the shared test decision, including original run information and the policy reason; missing diagnostics never establish reuse.
- WHEN an older report omits test_evidence, THEN it remains parseable; change_digest and snapshot metadata continue identifying the full repository inputs, and Knowledge checks retain their existing observation scope.

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
