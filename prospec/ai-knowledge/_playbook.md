# Team Playbook — Promoted Lessons

> Shared, version-controlled lessons promoted from the lessons ledger (`_lessons-ledger.md`)
> by **`/prospec-learn`**, each only after **explicit human approval**. This is the team tier
> between the lessons ledger and Constitution rules. Load on demand (progressive disclosure):
> Skills read **only the entries relevant to the change at hand**, not the whole file.

Entry format: `.claude/skills/prospec-learn/references/promotion-format.md`.

## Maintenance Rules

- **Append only via `/prospec-learn` with human approval** — never hand-edit a promoted entry's provenance.
- **TTL + conflict**: expired or conflicting entries go on `/prospec-learn`'s needs-review list for human retirement/arbitration; retirement records reason + date here.
- **Staleness sweep before every Collect**: `/prospec-learn` audits this file and the ledger for entries the project has outgrown — **mechanized** (a gate/test/check now enforces it), **no longer applicable** (its subject is gone), **contradicted** (it conflicts with the Constitution, a shipped spec, or a newer entry) — and lists each with its evidence. Retiring an entry is a shared-tier write: same explicit approval as promotion.
- **Ids are permanent**: a retired entry keeps its `PB-{NNN}`, drops its TTL and Guidance body, carries `- **RETIRED {date}**: {reason + the mechanism}`, and moves to `## Retired Entries`. No id is ever reused, and `prospec learn upsert`'s TTL report skips retired entries so a settled decision is never re-opened.
- **Mechanized ≠ retired**: an entry whose rule is enforced by a gate but which still states WHY stays under `## Entries` with an `Inlined into gate` / `Mechanized` annotation.
- **Promotion to Constitution**: a lesson strong enough for a hard rule graduates to `CONSTITUTION.md` as a `ConstitutionRule` (severity-tagged); this playbook holds team conventions below that bar.

## Entries

### PB-001: Contract assertions must be section-scoped, structure-aware, and mutation-verified
- **Source**: add-output-contract, add-review-fix-loop, add-token-measurement-harness, reorder-stable-prefix-loading, add-drift-checker, add-mcp-server · **Criteria**: freq=6, modules=4 (tests, templates, cli, lib) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-06-13 (provenance appended; strengthened 2026-06-11; originally 2026-06-08)
- **Stations**: implement, review
- **TTL**: review by 2026-12-11
- **Inlined into gate 2026-07-04**: Landing: `src/templates/skills/references/review-lenses-content.hbs` (Test-Quality Lens), `src/templates/skills/prospec-implement.hbs` (mutation-verify).

### PB-002: Lifecycle station lists must be mechanically copied from `_status-lifecycle.md`, then audited per station for false-block and false-pass
- **Source**: add-scale-adapter · **Criteria**: freq=1, modules=2 (templates, tests) — below the freq≥3 ∧ modules≥2 rule; **early promotion by human judgment** (within-change ×3 incl. 2 criticals; precedent: PB-001 at freq=2) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-06-12
- **Stations**: plan
- **TTL**: review by 2026-12-12
- **Guidance**: When a design changes artifact existence or a status transition, copy the station list verbatim from `_status-lifecycle.md` and audit EVERY station: does its input/Entry Gate false-block on the absent artifact, or does a check keyed on that artifact false-pass over an empty set? Show one plan-stage Call Chain per station; the proposal’s touchpoint list can omit affected stations. Keep this narrow design-time rule here rather than at every station; revisit gate inlining if it recurs (freq≥3).

### PB-006: Extract logic duplicated across parallel modules into a single-source helper — don't hand-copy
- **Source**: src-review-round2-remediation, harden-feature-prefixed-req-sync, preserve-agent-config-edits · **Criteria**: freq=3, modules=2 (lib, services) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-06-22
- **Stations**: plan, implement, review
- **TTL**: review by 2026-12-22
- **Inlined into gate 2026-07-04**: Landing: `src/templates/skills/references/review-lenses-content.hbs` (Maintainability / DRY Lens).

### PB-007: Applying an invariant, a config-resolution rule, or a FIX? Sweep every site of the same family, and re-review the fix itself — the missed parallel site becomes the next critical
- **Source**: add-mcp-server, src-review-round2-remediation, fix-upgrade-doc-coverage, enforce-metadata-schema · **Criteria**: freq=6, modules=4 (lib, services, types, templates) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-07-28 (broadened to cover remediation; originally 2026-07-02)
- **Stations**: implement, review
- **TTL**: review by 2027-01-02
- **Inlined into gate 2026-07-04**: Landing: `src/templates/skills/references/review-lenses-content.hbs` (Parallel-Site Completeness Lens), `src/templates/skills/prospec-review.hbs` (Class sweep), `src/templates/skills/prospec-implement.hbs` (canonical resolver).

### PB-008: Relocating a symbol/type/artifact? Sweep every reference site — src imports, TEST imports, wording, knowledge files — not just file-path strings
- **Source**: add-knowledge-flywheel, quick-scale-and-ceremony-cleanup, inject-resolved-knowledge-budgets · **Criteria**: freq=3, modules=5 (templates, types, tests, lib, services) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-07-06
- **Stations**: plan, implement, knowledge-update
- **TTL**: review by 2027-01-06
- **Guidance**: On symbol or artifact moves, review prose and knowledge references; typechecking imports and adding a re-export do not finish that review.
- **Mechanized 2026-07-06**: Test imports are checked by `pnpm typecheck`; prose and knowledge references still require review. Landing: `tsconfig.typecheck.json` (tests/**/*.ts), `tests/contract/typecheck-config.test.ts` (typecheck config covers tests).

### PB-010: Every git/spawn-bound test file declares a file-level testTimeout
- **Source**: generate-factual-counts, sync-knowledge-at-verify-commit, mechanize-review-gate, converge-constitution-audit, support-file-module-paths, split-verify-adjudication · **Criteria**: freq=6, modules=2 (services, tests) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-07-29
- **Stations**: implement, review, verify
- **TTL**: review by 2027-01-29
- **Guidance**: Every test file spawning real processes or git declares file-level `vi.setConfig({ testTimeout })`; use the value in `modules/tests/README.md`, never per-test overrides. Full-suite v8/concurrency load exceeds the default even when a file passes alone; `--record-tests` persists the resulting failure. When a timeout recurs in an untouched file, sweep every git/spawn-bound sibling, not only the edited files.

### PB-011: A knowledge file at its token-budget cap — compress existing content, extract a sub-module, or raise the budget explicitly; never dilute knowledge density
- **Source**: align-language-policy-scope, enforce-metadata-schema, split-verify-adjudication · **Criteria**: freq=3, modules=3 (lib, types, docs) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-07-29
- **Stations**: plan, knowledge-update, archive
- **TTL**: review by 2027-01-29
- **Guidance**: At a knowledge token-budget cap, first compress existing prose without losing invariants, then extract a sub-module, or have the project owner explicitly raise `.prospec.yaml` via a REQ. State that shipped defaults remain unchanged and the PASS comes from budget relaxation, not smaller knowledge. Never dilute knowledge density or silently raise budgets. Measure with `estimateTokens` (ceil(JS string length / 4)); byte counts overestimate non-ASCII text.

### PB-012: Never model an external tool's behavior from its result table — read its primary source, including the WARN and dry-run lines it prints
- **Source**: skip-unspawnable-test-command, restore-cli-first, add-windows-smoke-ci, pin-windows-kill-semantics, pilot-mutation-testing · **Criteria**: freq=5, modules=4 (lib, tests, cli, templates) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-07-31
- **Stations**: plan, implement, review, verify
- **TTL**: review by 2028-01-31
- **Guidance**: Before asserting an external tool’s behavior or explaining its numbers, read its full output (including WARN, dry-run and planner lines), then its primary source or schema. A result table does not establish cause, executable-search order or timeout formulas. Incorrect assumptions can invert gates or turn a working command into a skip. Verify implementation separately: a correct comment can accompany reversed code.

### PB-013: A fingerprint feeding a gate must fail closed — a swallowed error collapsing to a default turns a fact into a constant
- **Source**: split-verify-adjudication, harden-verify-adjudication, restore-cli-first · **Criteria**: freq=3, modules=2 (lib, services) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-07-31
- **Stations**: plan, implement, review, verify
- **TTL**: review by 2028-01-31
- **Guidance**: Captures feeding a gate fingerprint distinguish measured-empty from unavailable: return honest `null` on failure and refuse a verdict, never substitute a successful-looking default. A scanner unable to read an input marks the whole source `{available: false, reason}` naming the root; never discard the item or hide a target’s unavailability behind sibling findings. Otherwise a vacuous PASS is recorded as verified. When the same guarantee is repeatedly refuted, enumerate its actual conditions and state what remains indistinguishable from absence.

### PB-014: Delegating artifact production to a tool? Write the language rule into that artifact's format reference — policy breaks at the delegation boundary
- **Source**: restore-cli-first, fix-cli-first-regressions, add-harness-capability-flags, add-artifact-language-check · **Criteria**: freq=3, modules=4 (templates, cli, lib, types) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-07-31
- **Stations**: plan, implement
- **TTL**: review by 2028-01-31
- **Guidance**: For CLI-produced artifacts, put per-field language assignments in the producing skill's format reference; identify artifact-language fields and English identifiers.
- **Mechanized 2026-07-31** (partial): `prospec check`'s `artifact-language` check (REQ-LIB-037); mixed-language fields still need the format rule. Landing: `src/lib/drift-checker.ts` (evaluateArtifactLanguage).

### PB-015: At archive Phase 3.5, check each REQ against the MERGED FILE — not against the CLI's list of files it touched
- **Source**: restore-cli-first, fix-cli-first-regressions, add-harness-capability-flags, report-dropped-req-bullets · **Criteria**: freq=3, modules=3 (services, templates, tests) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-07-31
- **Stations**: archive
- **TTL**: review by 2028-01-31
- **Guidance**: Read each merged REQ, not the CLI’s touched-file list. `**Spec:**` replaces the whole body: author the resulting requirement, edit that field rather than narrative, and diff every rewrite—including fix rounds—against `git show HEAD:{spec}` or `prospec spec show <feature> --req <id>`. Preserve every still-valid bullet; put intentional omissions under `**Dropped:**`. Drop guards do not prove correct authoring, prevent ADDED-id reuse, detect kept-but-stale bodies or perform the fix-round comparison.
- **Mechanized** (partial): undeclared drops block archive writes and fail `delta-spec-landing-fidelity`. Landing: `src/services/archive.service.ts` (fileUndeclared), `src/lib/drift-checker.ts` (evaluateDeltaSpecLandingFidelity).

### PB-016: Finish every content change before recording provenance — evidence identity is the repository input snapshot, not HEAD
- **Source**: align-language-policy-scope, split-verify-adjudication, filter-nonsource-modules · **Criteria**: freq=3, modules=3 (lib, services, templates) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-08-01
- **Stations**: review, verify
- **TTL**: review by 2027-02-01
- **Guidance**: Finish source, test, knowledge and generated-count edits before recording tests or review; when an input changes, re-run the affected gates before recording provenance.
- **Mechanized 2026-08-03**: Provenance is audited through verified status. Landing: `src/types/change.ts` (PROVENANCE_AUDITED_STATUSES), `src/lib/drift-sources.ts` (computeChangeDigest), `tests/unit/lib/input-snapshot.test.ts`.

### PB-017: A change that alters behavior an existing REQ governs must list that REQ MODIFIED — grep for it at plan time
- **Source**: slim-skill-trigger-context, align-language-policy-scope, extend-provenance-audit-scope · **Criteria**: freq=3, modules=3 (templates, tests, types) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-08-03
- **Stations**: plan, review, archive
- **TTL**: review by 2027-02-03
- **Guidance**: At plan time and after fixes, list every touched artifact/section and grep its name, heading and behavior in `prospec/specs/features/**`; mark each governing REQ MODIFIED with a resulting `**Spec:**` block. New-feature lists miss old contracts; unlisted REQs never reach merge/drop checks. For text outside `#### REQ-` bodies (User Story intent/scenarios, SC-N, Change History Stories), add a Phase 3.5 Manual Convergence list with file:line and replacement. Check ADDED-REQ placement and independently review this list for omissions and operations the CLI already performs.
### PB-018: Build before subprocess tests that execute `dist` — otherwise they test stale code
- **Source**: harden-verify-adjudication, restore-cli-first, measure-all-load-surfaces, stop-silent-spec-body-loss · **Criteria**: freq=4, modules=3 (cli, tests, templates) · **Kind**: playbook · **Approved-by**: ben.hy.wu · **Date**: 2026-08-10
- **Stations**: implement, review, verify
- **TTL**: review by 2027-02-10
- **Guidance**: Build before any local subprocess smoke or workflow test that runs `dist/`; source-driven in-process e2e tests need no compiled binary. `pnpm test` has no pretest build.
- **Mechanized 2026-08-29** (partial): Most e2e runs source in process and CI builds before tests. Landing: `tests/e2e/helpers/run-cli.ts` (runCliInProcess), `.github/workflows/ci.yml` (pnpm run build).

### PB-019: Mutation testing must explicitly assert the mutation applied before running the test
- **Source**: name-change-history-rows, delegate-module-adjudication, measure-all-load-surfaces, stop-silent-spec-body-loss · **Criteria**: freq=4, modules=2 (tests, lib) · **Kind**: convention · **Approved-by**: ben.hy.wu · **Date**: 2026-08-10
- **Stations**: implement, review, verify
- **TTL**: review by 2027-02-10
- **Guidance**: Confirm every mutation actually changed its target before testing (grep or assert before ≠ after); a no-op mutation produces a false survival result. Tests reading bundled templates require `pnpm bundle` after mutation, or mutation of `BUNDLED_TEMPLATES` itself. The exercised copy, not merely the edited source, must contain the mutation.

### PB-020: When the change edits the CLI's own behavior, run every `prospec` command in that change's workflow from source — an installed or built binary that lags the source corrupts the change's own artifacts
- **Source**: restrict-identity-fallback, enforce-counts-in-ci, mechanize-knowledge-sync-gate, prompt-trust-zone-language-at-init · **Criteria**: freq=4, modules=2 (cli, lib) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-09-03
- **Stations**: implement, review, verify
- **TTL**: review by 2027-03-03
- **Guidance**: When a change touches `src/cli`, `src/services`, `src/lib` or `src/types`, run every workflow `prospec` invocation that writes metadata, reports or artifacts via `pnpm exec tsx src/cli/index.ts …`. Installed shims and `dist/` can lag and silently replay the defect under repair into review/verify/archive evidence. First compare the report’s check count with `DRIFT_CHECK_IDS`. Rebuild polluted artifacts from their inputs through the source CLI; never hand-patch them.

### PB-021: The verify judgment dimension asks a question review cannot — never treat 2/5 as a formality because review ran many rounds
- **Source**: enforce-counts-in-ci, add-learn-staleness-sweep, converge-req-body-boundary · **Criteria**: freq=3, modules=4 (templates, tests, services, lib) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-09-03
- **Stations**: verify
- **TTL**: review by 2027-03-03
- **Guidance**: Give verify 2/5 fresh context, delta-spec and code even after many clean review rounds. It asks whether the exact text graduating into the trust zone is true, whereas review can follow assertion intent and miss the artifact’s actual shape. Exhausted review is no reason to skip or self-grade this independent question.
- **Mechanized 2026-08-22** (partial): in-session judgment caps the grade below S. Landing: `src/lib/verify-grade.ts` (applySelfVerifiedCap).

### PB-022: A guard's predicate must be as wide as the operation it guards — ask what the operation touches before writing the check
- **Source**: refuse-near-miss-feature-map, read-specs-by-req, separate-review-evidence · **Criteria**: freq=3, modules=4 (services, tests, lib, types) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-09-03
- **Stations**: plan, implement, review
- **TTL**: review by 2027-03-03
- **Guidance**: Before authorizing replace/delete/overwrite, enumerate the operation’s footprint (bytes, lines, section or file) and make the guard inspect all of it. If any part is invisible, refuse the operation. A section replacement guarded only by heading counts erases bullets, tables or prose misclassified as empty. Pin the boundary with a fixture in a form the original predicate omitted.

### PB-023: A skip/degrade test's fixture must actually reach the branch under test — check what earlier filters eat before it arrives
- **Source**: harden-contained-reads, separate-review-evidence, unify-line-splitting · **Criteria**: freq=3, modules=3 (tests, lib, services) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-09-03
- **Stations**: implement, review
- **TTL**: review by 2027-03-03
- **Guidance**: Trace a skip/degrade fixture through every earlier filter; choose an input that actually reaches the branch. Directories can disappear at a `.md` filter or `onlyFiles` before the intended unreadable-file path. Use a surviving fixture (POSIX-gated revoked permissions, missing-target symlink or rejected file) and prove branch execution with a spy, log or mutation that turns the test red.

### PB-024: A marker that relaxes a gate must be bound to checkable provenance — a hand-editable field is not evidence
- **Source**: backfill-promotion-path, skip-unspawnable-test-command, unify-workflow-contracts · **Criteria**: freq=3, modules=4 (lib, templates, types, services) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-09-25
- **Stations**: plan, implement, review, verify
- **TTL**: review by 2027-03-25
- **Guidance**: if a plain-text field anyone can set (`scale: backfill`, a verdict string, a config value) lowers a gate, the gate is optional. Key the relaxation on an artifact the legitimate path alone produces (the backfill exemption only while `backfill-draft.md` exists; verifier verdicts read from their recorded sink), otherwise fall back to the strict contract with a WARN. Tightening markers (e.g. `graded_by: in-session`, which only caps the grade) need no binding. When binding is impossible (an honest skip reachable by config), state the limit in Edge Cases and keep it visible: the report carries `skipped` plus its reason and verify records `not-adjudicated`, never PASS.


### PB-025: A Spec bullet's consequent must state its premise's scope — re-check every sibling bullet of the REQ after rewriting one
- **Source**: restrict-identity-fallback, relax-readme-marker-adjacency, route-playbook-by-station, gate-module-map-writers, contain-knowledge-writes, refuse-unsearchable-write-targets · **Criteria**: freq=6, modules=3 (templates, lib, services) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-10-10
- **Stations**: plan, review, verify
- **TTL**: review by 2027-04-10
- **Guidance**: an absolute consequent ("opens its own row", "never deduplicated by Location") holds only inside the premise the author had in mind, and graduates beside a sibling bullet that covers the case it excludes — the REQ ships self-contradictory. REQ-CLI-028 and REQ-TEMPLATES-066 each carried such a pair, caught only by independent review/verify graders. Rule: write each bullet's consequent for exactly the premise its WHEN states; after rewriting any bullet, compare it pairwise with every other bullet of the same REQ for a case both claim.

### PB-026: Shipped prose that describes what an engine check reads is only as true as its guard — keep such claims inside a guarded section or delete them
- **Source**: configurable-generated-artifacts, fix-spec-sync-safety, align-skill-guidance · **Criteria**: freq=3, modules=5 (templates, lib, services, tests, types) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-10-10
- **Stations**: implement, review
- **TTL**: review by 2027-04-10
- **Guidance**: When a change edits an engine check's inputs, grep shipped prose for statements about that check and fix or delete each; state engine behavior only inside a guarded section, otherwise name the check without describing its criterion.

## Sweep Decisions

| Date | Entries | Decision | Approved-by | Evidence |
|---|---|---|---|---|
| 2026-10-13 | PB-002, PB-010, PB-011, PB-012, PB-013, PB-015, PB-017, PB-019, PB-020, PB-021, PB-022, PB-023 | Compact existing guidance; preserve operative clauses, original provenance, Stations and TTL. | benwu95 | Explicit approval: apply all reviewed cleanup drafts; before/after retained in Git history. |
| 2026-10-13 | PB-018 | Scope the title to subprocess tests that execute dist; guidance unchanged. | benwu95 | Explicit approval: apply all reviewed cleanup drafts. |
| 2026-10-27 | PB-019 | Record test/mutation-verify-must-hit-the-deployed-copy as already covered; retain its full description, counters and sources. Existing PB-019 Guidance is unchanged. | benwu95 | Explicit approval of both cleanup drafts in the Learn report; ledger frequency=5, impact_modules=3; PB-019 requires mutation to reach the exercised copy. |
| 2026-10-27 | PB-026 | Remove the inaccurate guard claim and its historical narrative; retain the operative rule, provenance, Stations and TTL. | benwu95 | Explicit approval of both cleanup drafts in the Learn report; tests/contract/skill-format.test.ts compares both Gates and What each gate checks between local and template documents. |

## Retired Entries

> Retired with human approval. The id is kept and never reused; the TTL and Guidance body are gone so no reader mistakes a dead rule for a live instruction, and `prospec learn upsert`'s TTL report skips these entries.

### PB-004: The factual counts `pnpm counts` does NOT own still drift — re-derive them by hand at the sync point
- **Source**: readme-onboarding-restructure, enhance-skill-instructions, fix-archive-sibling-reference, vendor-engineering-heuristics, enforce-metadata-schema · **Criteria**: freq=3, modules=2 (lib, types) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-07-28 (un-retired + narrowed; originally 2026-06-14)
- **RETIRED 2026-08-04**: promoted to Constitution — `[MUST] Factual Count Integrity` absorbs the three-tier model (machine-owned / CI-gated / hand-maintained) and the re-derive-at-sync-point rule.

### PB-009: Adding a drift check? Sync the root-README check enumeration too — `pnpm counts` covers numbers, not that prose list
- **Source**: mechanize-review-gate, quick-scale-and-ceremony-cleanup, enforce-knowledge-size-budget · **Criteria**: freq=3, modules=2 (lib, cli) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-07-06
- **RETIRED 2026-08-04**: promoted to Constitution — `[MUST] Factual Count Integrity` tier 3 (hand-maintained) now governs the root-README check enumeration.

### PB-005: Touch every source-touched module's README in the feature commit — a source-only commit flips drift knowledge-health stale
- **Source**: centralize-index-column-schema, fix-archive-sibling-reference, vendor-engineering-heuristics · **Criteria**: freq=3, modules=4 (types, templates, services, tests) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-06-14
- **RETIRED 2026-07-04** (issue #66): root cause eliminated by #65 — the verify S/A commit-prompt now syncs every source-touched module README **into the feature commit** (prevention), with the `/prospec-archive` Entry Gate as backstop. A source-only commit no longer reaches archive stale; no longer active.
- **Sweep correction 2026-08-03** (add-learn-staleness-sweep · **Adjudicated-by**: benwu95): the retirement over-stated the prevention. It is an *instruction* in the verify commit prompt, not a mechanism, and it failed on this very change — the feature commit synced `lib`'s README and missed `templates`, so `knowledge-health` reported `templates` stale (pre-amend commit `71db32c` touched `src/templates/**` twice with no `modules/templates/**`); the `/prospec-archive` Entry Gate backstop caught it and an amend fixed it. The conclusion still holds *because of* that backstop, so this entry stays retired by explicit adjudication and is deliberately NOT returned to `## Entries`. The rule itself remains correct and its ledger key `archive/knowledge-sync-touched-module-readme` was un-retired the same day (freq 17→18) to keep accumulating — a future sweep should read this pair as adjudicated, not as a contradiction.

### PB-003: Documented claims must match actually-observable implementation behavior — mark gaps with deliberate-exclusion wording
- **Source**: add-token-measurement-harness, reorder-stable-prefix-loading, add-drift-checker, add-mcp-server · **Criteria**: freq=4, modules=4 (cli, templates, lib, services) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-06-13 (provenance appended; originally 2026-06-12)
- **RETIRED 2026-10-04** (issue #341, approved by benwu95): the claim-writing rules now live in `_conventions.md` § Skill and Documentation Authoring, and in the shipped Docs-Claims lens; the canonical-phrase registry this entry extended was removed.
