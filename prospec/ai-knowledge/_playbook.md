# Team Playbook — Promoted Lessons

> Shared, version-controlled lessons promoted from the lessons ledger (`_lessons-ledger.md`)
> by **`/prospec-learn`**, each only after **explicit human approval**. This is the team tier
> between the lessons ledger and Constitution rules. Load on demand (progressive disclosure):
> Skills read **only the entries relevant to the change at hand**, not the whole file.

Format (one entry per promoted lesson) — see `.claude/skills/prospec-learn/references/promotion-format.md`:

```markdown
### PB-{NNN}: {one-line rule}
- **Source**: {change(s)} · **Criteria**: freq=N, modules=M ({module}, …) · **Kind**: {convention|playbook} · **Approved-by**: {name} · **Date**: {YYYY-MM-DD}
- **TTL**: {date or "review by …"}
- **Guidance**: {what to do / avoid, and why}
```

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
- **Guidance**: when a design changes an artifact's EXISTENCE or a status transition (e.g. a quick path that skips plan/delta-spec), do NOT rebuild the lifecycle from memory or from the proposal's own touchpoint list — copy the station list verbatim from `_status-lifecycle.md` (story → plan → tasks → implement → review → verify → archive) and ask two questions at EVERY station:
  1. **False-block**: does this station's Entry Gate or input contract depend on the artifact that no longer exists? (bit `add-scale-adapter`: tasks↔plan mutual refusal deadlocked quick; review's gate would have hard-failed)
  2. **False-pass**: is this station's check KEYED on the absent artifact, so an empty extraction silently passes? (bit `add-scale-adapter`: archive's knowledge gate keyed on delta-spec REQ prefixes — empty set under quick)
  Plan-stage Call Chains for such designs must show one chain per station, not only the stations the source document names (the bundle doc predated review/implement interactions and was incomplete three times over).
- **#66 gate-fallback evaluation (2026-07-04)**: kept in the playbook, **not** inlined into a per-station gate — freq=1 and it is a narrow design-time authoring rule for the rare artifact-existence-changing design; a standing gate at every station would not pay for itself. Revisit if it recurs (freq≥3).

### PB-003: Documented claims must match actually-observable implementation behavior — mark gaps with deliberate-exclusion wording
- **Source**: add-token-measurement-harness, reorder-stable-prefix-loading, add-drift-checker, add-mcp-server · **Criteria**: freq=4, modules=4 (cli, templates, lib, services) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-06-13 (provenance appended; originally 2026-06-12)
- **Stations**: implement, review, verify, knowledge-update, archive
- **TTL**: review by 2026-12-12
- **Inlined into gate 2026-07-04**: Landing: `src/templates/skills/references/review-lenses-content.hbs` (Docs-Claims / Measurement-Attribution Lens).

### PB-006: Extract logic duplicated across parallel modules into a single-source helper — don't hand-copy
- **Source**: src-review-round2-remediation, harden-feature-prefixed-req-sync, preserve-agent-config-edits · **Criteria**: freq=3, modules=2 (lib, services) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-06-22
- **Stations**: plan, implement, review
- **TTL**: review by 2026-12-22
- **Inlined into gate 2026-07-04**: Landing: `src/templates/skills/references/review-lenses-content.hbs` (Maintainability / DRY Lens).

### PB-007: Applying an invariant, a config-resolution rule, or a FIX? Sweep every site of the same family, and re-review the fix itself — the missed parallel site becomes the next critical
- **Source**: add-mcp-server, src-review-round2-remediation, fix-upgrade-doc-coverage, enforce-metadata-schema · **Criteria**: freq=6, modules=4 (lib, services, types, templates) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-07-28 (broadened to cover remediation; originally 2026-07-02)
- **Stations**: implement, review
- **TTL**: review by 2027-01-02
- **Inlined into gate 2026-07-04**: Landing: `src/templates/skills/references/review-lenses-content.hbs` (Parallel-Site Completeness Lens), `src/templates/skills/prospec-implement.hbs` (canonical resolver).

### PB-008: Relocating a symbol/type/artifact? Sweep every reference site — src imports, TEST imports, wording, knowledge files — not just file-path strings
- **Source**: add-knowledge-flywheel, quick-scale-and-ceremony-cleanup, inject-resolved-knowledge-budgets · **Criteria**: freq=3, modules=5 (templates, types, tests, lib, services) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-07-06
- **Stations**: plan, implement, knowledge-update
- **TTL**: review by 2027-01-06
- **Guidance**: On symbol or artifact moves, review prose and knowledge references; typechecking imports and adding a re-export do not finish that review.
- **Mechanized 2026-07-06**: Test imports are checked by `pnpm typecheck`; prose and knowledge references still require review. Landing: `tsconfig.typecheck.json` (tests/**/*.ts), `tests/contract/typecheck-config.test.ts` (typecheck config covers tests).

### PB-010: Every git/spawn-bound test file declares a 30s file-level testTimeout
- **Source**: generate-factual-counts, sync-knowledge-at-verify-commit, mechanize-review-gate, converge-constitution-audit, support-file-module-paths, split-verify-adjudication · **Criteria**: freq=6, modules=2 (services, tests) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-07-29
- **Stations**: implement, review, verify
- **TTL**: review by 2027-01-29
- **Guidance**: any test file that spawns real processes or drives real git (`execFileSync`/`spawnSync` fixtures, e2e CLI spawns, `gitFixture` contract tests) must declare `vi.setConfig({ testTimeout: 30_000 })` at file level. Under full-suite v8/concurrency load, cold CLI spawns and git-bound fixtures blow vitest's 5s default even though the same file runs green alone (reproduced across six changes; `--help` e2e is the canonical victim) — an environmental flake, not a logic defect, but one with teeth since `--record-tests` stamps whatever exit code the suite produced into `metadata.yaml`, making the machine test verdict non-deterministic. Fix at the FILE level, never per-test overrides (a per-test override is silently outranked by a later file-level default). When a flaky timeout recurs in an untouched file, widen the sweep to every git-bound sibling instead of only the files the change edited (split-verify-adjudication's fix missed the fourth file and stayed 2/5 red under load).

### PB-011: A knowledge file at its token-budget cap — compress existing content, extract a sub-module, or raise the budget explicitly; never dilute knowledge density
- **Source**: align-language-policy-scope, enforce-metadata-schema, split-verify-adjudication · **Criteria**: freq=3, modules=3 (lib, types, docs) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-07-29
- **Stations**: plan, knowledge-update, archive
- **TTL**: review by 2027-01-29
- **Guidance**: when an L1/L2 knowledge file sits at its `knowledge-size` budget cap (README at ~1000 tokens, a core convention at the L1 cap), any real invariant the next change must record trips the WARN — and shaving the new sentence saves single-digit tokens while the root cause is the file being full. Resolutions, in preference order: compress **existing** prose (fold Key Files back to ~top-10, deduplicate restatements), extract a sub-module `.md` (the deliberate deferral from issue #64), or have the **project owner** raise the budget in `.prospec.yaml` — recorded as an explicit REQ that states the shipped defaults are unchanged and self-declares "the PASS comes from the budget relaxation, not from smaller knowledge" (REQ-TYPES-069 is the precedent). Never lower knowledge density to buy space and never bump the budget silently. Measurement note: `estimateTokens` is JS string length / 4 — `wc -c` overestimates non-ASCII files.

### PB-012: Never model an external tool's behavior from its result table — read its primary source, including the WARN and dry-run lines it prints
- **Source**: skip-unspawnable-test-command, restore-cli-first, add-windows-smoke-ci, pin-windows-kill-semantics, pilot-mutation-testing · **Criteria**: freq=5, modules=4 (lib, tests, cli, templates) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-07-31
- **Stations**: plan, implement, review, verify
- **TTL**: review by 2028-01-31
- **Guidance**: writing "tool X behaves like Y" into an implementation, a test, or a doc without checking a first-hand source produces confident, wrong behavior — and the failure is usually a gate inverting rather than a feature breaking. Windows executable search was ordered by PATHEXT although libuv never reads it (`src/win/process.c` tries only `""`/`"com"`/`"exe"`), so a normal npm-global-shim layout was judged unspawnable and a FAIL-class gate degraded to `skip` on a working machine. **The primary source includes the tool's own output, not only its code**: pilot-mutation-testing got one causal sentence wrong in three successive versions by reasoning backwards from Stryker's score table, while the very run that produced those numbers printed `Detected 26 static mutants (46% of total) that are estimated to take 100% of the time running the tests! You might want to enable "ignoreStatic"` plus two dry-run lines (`Ran 57 tests ... net 78ms` vs `Ran 416 tests ... net 54155ms`) that together were the whole answer. The third version — treating `timeoutMS` as the timeout ceiling — closed only after reading `mutant-test-planner.js:124` (`timeoutFactor(1.5) * netTime + timeoutMS + timeOverheadMS`) and the schema default. Rule: before quoting a tool-produced number or explaining WHY it is what it is, read the tool's full output (WARN / dry-run / planner lines) and then its source or schema. Note also that a correct comment does not make the implementation correct — the same diff had the rule written right in a test comment and backwards in the code; comment and implementation are two separate acts of thought.

### PB-013: A fingerprint feeding a gate must fail closed — a swallowed error collapsing to a default turns a fact into a constant
- **Source**: split-verify-adjudication, harden-verify-adjudication, restore-cli-first · **Criteria**: freq=3, modules=2 (lib, services) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-07-31
- **Stations**: plan, implement, review, verify
- **TTL**: review by 2028-01-31
- **Guidance**: `catch` + `?? ''` on a capture that feeds a digest silently disables the detection built on it. `gitCapture` uses `execFileSync`'s default 1 MB `maxBuffer`; a `git diff HEAD` past that throws ENOBUFS → `null` → `''`, so the change digest degrades to the HEAD sha alone and staleness detection switches off — `test-provenance` then reports PASS over code that has since been broken, and records it as `adjudicator: machine` (this repo's own diff was at 47% of the threshold at the time). Rule: any capture feeding a gate's fingerprint returns an honest `null` and the caller refuses to produce a verdict, never a default that reads as a successful measurement. The general shape: a value that can be both "measured and empty" and "not measured at all" must distinguish the two before it reaches a comparison.
- **Strengthened 2026-09-25** (absorbs ledger key `check/vacuous-pass-worse-than-crash`, freq=3, modules=3 (lib, services, types); sources add-artifact-language-check, unify-workflow-contracts, generate-station-reference-map) · **Approved-by**: benwu95. The collector face of the same shape: a scanning check that cannot read an input degrades the whole source to `{available: false, reason}` naming the root — it never drops the unreadable item and reports the smaller sample as usual, and a target's own unavailability never disappears because a sibling produced findings. A crash is visible; a vacuous PASS is recorded as verified. If "never passes vacuously" is refuted round after round, apply PB-007's corollary: rewrite the guarantee definitionally (enumerate the documented conditions, state that everything else is indistinguishable from true absence).

### PB-014: Delegating artifact production to a tool? Write the language rule into that artifact's format reference — policy breaks at the delegation boundary
- **Source**: restore-cli-first, fix-cli-first-regressions, add-harness-capability-flags, add-artifact-language-check · **Criteria**: freq=3, modules=4 (templates, cli, lib, types) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-07-31
- **Stations**: plan, implement
- **TTL**: review by 2028-01-31
- **Guidance**: For CLI-produced artifacts, put per-field language assignments in the producing skill's format reference; identify artifact-language fields and English identifiers.
- **Mechanized 2026-07-31** (partial): `prospec check` warns when an artifact has no required-language prose; mixed-language fields still need the format rule. Landing: `src/lib/drift-checker.ts` (evaluateArtifactLanguage).

### PB-015: At archive Phase 3.5, check each REQ against the MERGED FILE — not against the CLI's list of files it touched
- **Source**: restore-cli-first, fix-cli-first-regressions, add-harness-capability-flags, report-dropped-req-bullets · **Criteria**: freq=3, modules=3 (services, templates, tests) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-07-31
- **Stations**: archive
- **TTL**: review by 2028-01-31
- **Guidance**: the mechanical Feature Spec sync replaces a MODIFIED REQ's WHOLE body with the delta-spec's `**Spec:**` block, so a block that describes only the delta silently deletes the pre-existing behavior around it; without a block, the REQ keeps its pre-change body while the code has moved on. restore-cli-first needed all 26 REQ bodies rewritten from delta-spec + code. The graduation gate is per-REQ against the resulting file, because the CLI's "synced" list reports the files it wrote, not whether each REQ reads correctly afterwards. report-dropped-req-bullets shipped `droppedBehavior` — the CLI now reports the WHEN/THEN bullets a block drops as a set difference, and Phase 3.5 gates on confirming each was deliberate — which covers the delete-by-replacement case; it does NOT cover an ADDED entry reusing an existing REQ id, and it cannot tell you a kept body is now stale. Read the merged file.
- **Strengthened 2026-08-03** (absorbs ledger key `spec/landing-block-states-delta-not-result`, freq=3, modules=4 (services, templates, lib, types); sources add-harness-capability-flags, filter-nonsource-modules, mechanize-light-scale-gates) · **Approved-by**: benwu95. This entry governed the archive end — reading the merged file. The **authoring** end has its own half: because `**Spec:**` is the ONLY field that graduates, a correction to spec content must be typed into that block, and editing a narrative field instead is indistinguishable from not editing at all. filter-nonsource-modules hit this from a second angle — review named a false claim inside a `**Spec:**` block, and the correction went into the delta-spec's `**Description**`, which the Language Policy guarantees can never land; the false statement reached the trust zone anyway and the artifact was then self-contradictory. Two rules follow: write the block as the **resulting requirement**, not the delta (diff it against `git show HEAD:{spec}` and confirm the new body ⊇ every old behavior still in force); and when you correct anything about spec content, check which field you are editing before you type.
- **Strengthened 2026-09-03** (absorbs ledger key `spec/spec-block-replaces-whole-body-omission-is-silent`, freq=3, modules=6 (services, templates, cli, lib, types, tests); sources measure-all-load-surfaces, stop-silent-spec-body-loss, converge-req-body-boundary) · **Approved-by**: benwu95. The omission is **silent and recurs inside one change**: converge-req-body-boundary dropped a `WHEN/THEN` bullet while rewriting a `**Spec:**` block in review rounds 4, 5 and 6 — three separate times — each time the fix round rewrote the block from the delta narrative instead of from the current body. `droppedBehavior` catches the archive-time landing; it does not run during a review fix round. Rule: every time a `**Spec:**` block is rewritten — including inside a fix round — diff it bullet-by-bullet against `git show HEAD:{spec}` (or `prospec spec show <feature> --req <id>`) before saving, and treat a bullet you cannot find in the new block as dropped until you have typed it under `**Dropped:**`.

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
- **Guidance**: sibling of PB-015, and the one failure it explicitly cannot catch. PB-015 governs REQs the delta-spec *names*; this one governs the REQ it never names at all. When a change alters behavior an existing named REQ governs but the delta-spec only ADDs new REQs, nothing surfaces the omission: neither graduation worklist mentions that REQ, `droppedBehavior` has no block to diff, and "read the merged file" does not reach it — its file may not even be written. Archive then graduates the new REQ beside the untouched contradicting one, and the Feature Spec ships self-contradictory. slim-skill-trigger-context: a slimmed `CLAUDE.md` contradicted `REQ-AGNT-020` ("entry config lists per-skill Triggers") — caught only by an adversarial review as a confirmed critical. extend-provenance-audit-scope: the review/verify Entry Gate status precondition — shipped contract prose — was loosened with no REQ carrying it and no assertion pinning it, inside the very change whose thesis is "a contract stated in prose that nothing implements". Rule: at plan/delta-spec time, grep the behavior's own wording and identifiers across `prospec/specs/features/**` and list every REQ that governs it as MODIFIED (with a `**Spec:**` block) — including its User Story acceptance scenarios, which the mechanical merge cannot reach at all. Ask it again for any contract prose a fix touches later: a change's own review rounds edit shipped wording too.
- **Strengthened 2026-08-03** (absorbs ledger key `archive/us-level-spec-text-has-no-graduation-carrier`, freq=3, modules=2 (templates, services); sources fix-cli-first-regressions, report-dropped-req-bullets, add-learn-staleness-sweep) · **Approved-by**: benwu95. The half this entry only gestured at: some spec text has **no graduation carrier at all**. `mergeRequirementInPlace` replaces `#### REQ-` blocks and nothing else, so a User Story's `I want`, its Acceptance Scenarios, its `SC-N`, and the Change History row's Stories column can never be reached mechanically — and an ADDED REQ is inserted before `## Edge Cases`, so when the last User Story section closes with `---` the new REQ lands outside every `## US-` section.Practice: give the delta-spec a **Phase 3.5 Manual Convergence** list naming each site by `file:line` with the intended replacement, and treat that list as adversarially checkable — in `add-learn-staleness-sweep` an independent grader found the list itself missing the ADDED-REQ relocation, and a second item instructing a Change History row the CLI already writes (which would have double-counted the change).
- **Strengthened 2026-09-03** (absorbs ledger key `spec/req-scope-not-listed-modified`, freq=5, modules=5 (templates, services, lib, types, tests); sources report-dropped-req-bullets, mechanize-light-scale-gates, mechanize-knowledge-sync-gate, detect-inlined-gate-desync, capture-session-corrections) · **Approved-by**: benwu95. The question that finds the missing MODIFIED is asked **per touched artifact, not per new feature**: for every file or section the diff changes, ask "which existing REQ declares this artifact's behavior?" — not "what did I add?". report-dropped-req-bullets edited a `delta-spec-format.hbs` section and `prospec-archive.hbs` step 0, both inside REQ-TEMPLATES-166's declared scope, listed neither as MODIFIED, and only the fresh-context 2/5 grader caught it. Five changes recurred on the same omission, so make the per-artifact question a plan-time step: list the touched artifacts, grep each one's name/heading in `prospec/specs/features/**`, and every hit is a MODIFIED candidate.
### PB-018: e2e tests spawn against `dist` — always `pnpm build` before running them, otherwise you test stale code
- **Source**: harden-verify-adjudication, restore-cli-first, measure-all-load-surfaces, stop-silent-spec-body-loss · **Criteria**: freq=4, modules=3 (cli, tests, templates) · **Kind**: playbook · **Approved-by**: ben.hy.wu · **Date**: 2026-08-10
- **Stations**: implement, review, verify
- **TTL**: review by 2027-02-10
- **Guidance**: Build before any local subprocess smoke or workflow test that runs `dist/`; source-driven in-process e2e tests need no compiled binary. `pnpm test` has no pretest build.
- **Mechanized 2026-08-29** (partial): Most e2e runs source in process and CI builds before tests. Landing: `tests/e2e/helpers/run-cli.ts` (runCliInProcess), `.github/workflows/ci.yml` (pnpm run build).

### PB-019: Mutation testing must explicitly assert the mutation applied before running the test
- **Source**: name-change-history-rows, delegate-module-adjudication, measure-all-load-surfaces, stop-silent-spec-body-loss · **Criteria**: freq=4, modules=2 (tests, lib) · **Kind**: convention · **Approved-by**: ben.hy.wu · **Date**: 2026-08-10
- **Stations**: implement, review, verify
- **TTL**: review by 2027-02-10
- **Guidance**: a mutation run is meaningless unless the mutation is confirmed to have landed in the file. A perl substitution containing `${}` and backticks silently matched nothing, the test ran against unmutated code and passed, and the result was nearly recorded as "survived". Practice: after applying each mutation, grep for the target or assert the text changed (e.g. `assert new != s`), then run the test. Contract tests read the bundled templates, so a template mutation must also be bundled (`pnpm bundle`) — or applied to `BUNDLED_TEMPLATES` directly — before it reaches the code under test.
- **Re-evidence (original Guidance, 2026-08-10)**: mutation-verify 若沒確認突變真的落到檔案上，得到的綠燈毫無意義：本輪用 perl 套一個含 ${} 與反引號的替換沒有命中，測試對著未變異的程式跑出 1 passed，我一度把它記成 survived。做法：每個 mutation 套用後先 grep 目標字串或斷言 replace 前後不同（python 的 assert new!=s），再跑測試；工具鏈已有前例——契約測試讀 bundled templates，突變也必須先 pnpm bundle 才會抵達受測物

### PB-020: When the change edits the CLI's own behavior, run every `prospec` command in that change's workflow from source — an installed or built binary that lags the source corrupts the change's own artifacts
- **Source**: restrict-identity-fallback, enforce-counts-in-ci, mechanize-knowledge-sync-gate, prompt-trust-zone-language-at-init · **Criteria**: freq=4, modules=2 (cli, lib) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-09-03
- **Stations**: implement, review, verify
- **TTL**: review by 2027-03-03
- **Guidance**: the installed `prospec` shim and `dist/` are snapshots; the source is the thing under change. Running the change's own review/verify/archive steps through a lagging binary replays the very defect being fixed into the artifacts that record the fix — with no error message. restrict-identity-fallback merged round-2 findings with the 1.0.0 binary and `F-12` was folded into `F-6`'s row (issue #116's defect, reproduced inside its own fix); prompt-trust-zone-language-at-init recorded review/test provenance and `check --json` with a binary that lacked `language-policy-drift` (20 of 21 checks), so `verify record` read an incomplete machine ledger until the three were re-recorded from source. Rule: inside a change that touches `src/cli`, `src/services`, `src/lib` or `src/types`, every `prospec` invocation that writes metadata, a report, or an artifact runs as `pnpm exec tsx src/cli/index.ts …`; first compare the report's check count with `DRIFT_CHECK_IDS`. A polluted artifact is rebuilt from its inputs with the source CLI, never patched by hand.

### PB-021: The verify judgment dimension asks a question review cannot — never treat 2/5 as a formality because review ran many rounds
- **Source**: enforce-counts-in-ci, add-learn-staleness-sweep, converge-req-body-boundary · **Criteria**: freq=3, modules=4 (templates, tests, services, lib) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-09-03
- **Stations**: verify
- **TTL**: review by 2027-03-03
- **Guidance**: three times a fresh-context 2/5 grader failed a change after four or more adversarial review rounds had passed it, and each time the critical was one review could not see by construction. Review asks "what does this assertion defend against?" and probes along the assertion's design intent; 2/5 asks "is the sentence about to graduate verbatim into the trust zone true?" and probes the way the artifact is *actually written* — converge-req-body-boundary's block had every command line indented while the assertion anchored at column 0, invisible to a reviewer reading intent, obvious to a grader reading the file. Rule: 2/5 is not a re-check of review; give it a genuinely fresh context, the delta-spec and the code, and let it run even when review looks exhausted. Skipping or in-session-grading it because "review already found everything" removes the one probe with a different angle.

### PB-022: A guard's predicate must be as wide as the operation it guards — ask what the operation touches before writing the check
- **Source**: refuse-near-miss-feature-map, read-specs-by-req, separate-review-evidence · **Criteria**: freq=3, modules=4 (services, tests, lib, types) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-09-03
- **Stations**: plan, implement, review
- **TTL**: review by 2027-03-03
- **Guidance**: a splice replaced a whole section while its emptiness predicate counted only `###` entries, so content written as a bullet list, a table, or prose was judged "empty" and erased (refuse-near-miss-feature-map); the same shape recurred in a REQ-scoped read and in the review-evidence split. The failure is an asymmetry: the destructive operation's footprint is the section, the guard's footprint is one syntactic form inside it. Rule: before writing a predicate that authorizes a replace/delete/overwrite, enumerate what the operation will actually touch (bytes, lines, section, file) and make the predicate range over exactly that; if the predicate cannot see part of the footprint, the operation must refuse rather than proceed. Pin it with a fixture written in the form the predicate does NOT count.

### PB-023: A skip/degrade test's fixture must actually reach the branch under test — check what earlier filters eat before it arrives
- **Source**: harden-contained-reads, separate-review-evidence, unify-line-splitting · **Criteria**: freq=3, modules=3 (tests, lib, services) · **Kind**: convention · **Approved-by**: benwu95 · **Date**: 2026-09-03
- **Stations**: implement, review
- **TTL**: review by 2027-03-03
- **Guidance**: twice a "skips unreadable files" test used a directory as the unreadable fixture and passed vacuously — once because the `.md` filter had already excluded it (enforce-sub-module-budget), once because the glob scanner's `onlyFiles` dropped it before the read (`collectMarkdownLinks` / `collectReqReferences`) — and both were discovered only when a mutation of the skip branch survived. Sibling of PB-019 (the mutation must land) from the fixture side: the input must land too. Rule: before writing a skip/degrade test, trace the input's path to the branch and list every earlier condition that could consume it; then choose a fixture shape that survives all of them — a real file with revoked permissions (POSIX-gated), a symlink to a missing target, a file the parser rejects — and confirm the branch executed (a spy, a log line, or a mutation that goes red).

### PB-024: A marker that relaxes a gate must be bound to checkable provenance — a hand-editable field is not evidence
- **Source**: backfill-promotion-path, skip-unspawnable-test-command, unify-workflow-contracts · **Criteria**: freq=3, modules=4 (lib, templates, types, services) · **Kind**: playbook · **Approved-by**: benwu95 · **Date**: 2026-09-25
- **Stations**: plan, implement, review, verify
- **TTL**: review by 2027-03-25
- **Guidance**: if a plain-text field anyone can set (`scale: backfill`, a verdict string, a config value) lowers a gate, the gate is optional. Key the relaxation on an artifact the legitimate path alone produces (the backfill exemption only while `backfill-draft.md` exists; verifier verdicts read from their recorded sink), otherwise fall back to the strict contract with a WARN. Tightening markers (e.g. `graded_by: in-session`, which only caps the grade) need no binding. When binding is impossible (an honest skip reachable by config), state the limit in Edge Cases and keep it visible: the report carries `skipped` plus its reason and verify records `not-adjudicated`, never PASS.

## Retired Entries

> Retired by the `/prospec-learn` **Sweep** with human approval — the failure mode can no longer occur. The id is kept and never reused; the TTL and Guidance body are gone so no reader mistakes a dead rule for a live instruction, and `prospec learn upsert`'s TTL report skips these entries.

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
