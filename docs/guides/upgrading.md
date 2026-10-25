# Upgrading Prospec
[繁體中文](./upgrading.zh-TW.md) • [Documentation](../README.md)

When a new prospec version is available, update the binary first:

```bash
# If using standalone binary (recommended): re-run the install script
curl -fsSL https://raw.githubusercontent.com/benwu95/prospec/main/install.sh | bash

# If pinned as a project devDependency:
npm install -D github:benwu95/prospec     # or: pnpm add -D github:benwu95/prospec
```

Then upgrade existing projects in two seamless steps — a deterministic CLI pass followed by a consent-gated AI migration pass:

```bash
prospec upgrade                  # Step 1: CLI (zero-LLM) syncs infrastructure and audits docs inventory
```

```text
🤖 Run inside your AI Agent chat:
prospec-upgrade                 # Step 2: AI agent migrates drifted doc formats, enriches scaffolds, and localizes triggers (asks per change)
```

## Step 1: `prospec upgrade` (CLI Deterministic Pass)
- **Version Tracking**: Merges the running prospec version into `.prospec.yaml` `version` in place, preserving existing comments and formatting.
- **Agent & Template Sync**: Re-runs `agent sync` to align all agent configurations and Skills with latest bundled templates.
- **Scanner Refresh**: Regenerates `ai-knowledge/raw-scan.md` using the updated scanner logic.
- **Backfill Missing Docs**: Creates newly introduced init files using baseline templates (skip-if-exists; never overwrites or mutates existing files).
- **Migration Report**: Outputs version deltas, a docs inventory listing present/missing files, and any skill trigger gaps.

## Step 2: `prospec-upgrade` (AI Agent Judgment Pass)
- **Format Migration**: Compares existing files against the latest templates and proposes formatting upgrades, **asking for explicit confirmation per file** (never overwrites authored prose).
- **Scaffold Enrichment**: Populates newly backfilled baseline docs with real project context (e.g. `index.md` module table).
- **Trigger Localization**: Localizes missing trigger phrases for newly added skills into the project's configured `artifact_language`.
- **Final Sync**: Re-runs `agent sync` so all changes immediately take effect across all configured agents.

> [!TIP]
> - **Legacy File Cleanup**: If upgrading from an older pre-1.0 Prospec layout, remove the now-unused legacy files and directories after re-syncing: `GEMINI.md`, `.gemini/skills/`, `.codex/skills/`, `.github/copilot-instructions.md`, and `.github/instructions/`.
> - **Configuration Version & Triggers**: `.prospec.yaml` `version` tracks the prospec version the project last upgraded to. If you ever need to localize triggers after adding a skill, simply run `prospec agent sync` — it explicitly reports missing `skill_triggers` entries so you fill only the gaps.

## Upgrade to the next release (unreleased)

**Breaking:** Knowledge freshness is judged by a digest of each module's source content instead of commit dates, so a same-day follow-up commit or a merged older branch no longer reads fresh. After upgrading, every module whose `module-map.yaml` entry has no `source_digest` reads stale: `knowledge-health` warns, and a change touching that module is held at the Knowledge sync gate until it is re-stamped.

For each module, confirm its README still matches the source, then run `prospec knowledge verify <module>`; it records `source_digest` beside `last_verified`. Re-stamp only after that review — the stamp asserts the knowledge was checked. A shallow clone is now judged by digest instead of being skipped, with the report's commit-time fields left null.

Run `prospec status` and `prospec check --strict` after upgrading.

## Upgrade to 2.9.0

Update the binary before running `prospec upgrade`: the synced Skills require CLI 2.9.0 or later, including configurable test timeouts and in-repository directory-symlink evidence support. No configuration change is required for existing behavior.

For test suites that need more than the default 900,000 ms (15 minutes), optionally set `tech_stack.test_timeout_ms` in `.prospec.yaml` to a positive integer up to 2,147,483,647 ms. When a test command resolves, an invalid value records an unprovable attempt without running tests. Changing the timeout makes prior test evidence stale; re-run `prospec check --record-tests`. See the [Configuration Reference](../reference/configuration.md).

`init` and full `agent sync` now maintain a marked `.gitignore` block for local artifacts and generated Skills. Content outside the block is preserved; inspect any warning about another ignore rule still hiding a Skill. `agent sync --cli <name>` does not update the block.

Run `prospec status` and `prospec check --strict` after upgrading.

## Upgrade to 2.8.0

Update the binary before running `prospec upgrade`: the synced Skills require CLI 2.8.0 or later for explicit related-module scope. No configuration change is required.

Story creation no longer infers modules from keywords. Update scripts to pass `--related-module <module>` (repeatable), or `--no-related-modules` when none apply. Creation without either option is refused before writing artifacts.

Existing changes with an absent `related_modules` declaration remain readable but block knowledge-sync and archive. Declare their complete scope with `prospec change related-modules <modules...> --change <name>`, or `prospec change related-modules --no-related-modules --change <name>` after determining none apply. This replaces the complete list; an explicit empty list means none, while an absent declaration means unknown. Independent requirement-based gates still apply.

Unattributed auto-draft groups now fail without creating scaffolds. Determine their scope and create explicitly; attributed groups continue normally. See [Change management](../reference/cli-reference.md#change-management-commands) for the command contracts.

Run `prospec status` and `prospec check --strict` after upgrading.

## Upgrade to 2.7.0

Update the binary before running `prospec upgrade`: the synced Skills now require CLI 2.7.0 or later for the test evidence assessment contract. No configuration change is required for existing behavior.

If your tests do not consume AI Knowledge, optionally add this to `.prospec.yaml`:

```yaml
test_evidence:
  exclude_knowledge: true
```

Record a successful test run with the new policy before expecting reuse. Subsequent Knowledge-only edits can reuse compatible evidence; changes to the policy, configuration, command or other test inputs require a new run. Explicit `prospec check --record-tests --change <name>` always executes tests. Review and pre-merge CI still apply. See the [Configuration Reference](../reference/configuration.md) for configuration conditions and path restrictions, and [Review and test evidence](../reference/cli-reference.md#review-and-test-evidence) for the evidence workflow.

Run `prospec status` and `prospec check --strict` after upgrading.

## Upgrade to 2.6.0

Update the binary, then run `prospec upgrade` to sync the delegation guidance. No configuration migration is required.

New delegation tickets use V2 and allow bounded sibling-worktree branch and stash activity. Existing V1 tickets remain readable and retain exact comparison. Older CLI versions are not guaranteed to read V2 tickets; coordinate CLI versions before sharing new delegation state. Protected or unreadable differences still require inspection, and recovery remains an explicit human decision. See [Delegation commands](../reference/cli-reference.md) for the policy and its endpoint-detection limits.

Run `prospec status` and `prospec check --strict` after upgrading.

## Upgrade to 2.5.0

Update the binary before running `prospec upgrade` so the synced Skills can use the new `history` commands. No configuration migration is required.

Archive and abandoned bundles created in linked worktrees now live in the corresponding main-worktree project. Active changes, configuration, Feature Specs and Knowledge remain in the source project. Before removing a worktree that contains older local history, inspect and import it:

```bash
prospec history paths --json
prospec history import --from /path/to/source-project --dry-run
prospec history import --from /path/to/source-project
```

Import retains source bundles; resolve reported conflicts or failures before removing the source worktree. Finish `prospec archive finalize <name> --bundle <archiveIdentity>` in the original source project before removing it. Scripts must use the CLI-returned paths and identities rather than reconstructing paths under the current worktree. Main-worktree storage does not back up the repository or Git objects. See [History commands](../reference/cli-reference.md) for supported topology and failure reporting.

Run `prospec status` and `prospec check --strict` after upgrading.

## What's new in 2.0

Prospec 2.0 turns SDD from a guided sequence into a **gated, resumable pipeline**: Skills retain judgment, while the CLI owns state transitions, evidence, and spec landing.

| Capability | What changes in 2.0 |
|------------|---------------------|
| **Stronger planning** | Independent architecture and task verifiers check layering, blast radius, reuse, REQ traceability, task ordering, and TDD closure before implementation. Quantitative acceptance targets need a measured baseline; unmet gaps need a closing mechanism and estimated improvement. Full-scale plans can compare multiple candidate architectures; standard plans must state the simpler alternative. |
| **Gated, resumable execution** | `prospec status` routes the next station, names its canonical Skill as the action and the resolved skill file as a fallback, and names its entry gate. Station instructions are loaded at every transition — through the host's own skill mechanism where the agent registry declares one, by reading the file everywhere else; state-changing commands refuse illegal transitions instead of relying on prose discipline, and `implemented` plus every `review merge` require a fresh green test attempt recorded by `prospec check --record-tests` (a project with no test command or a proven backfill passes with a `tests: not-adjudicated` WARN). Design is conditional, Knowledge Update is a formal station, and quick/backfill routes remain explicit. A `verified` change whose latest grade is B/C/D is routed back to verify, and a plan or tasks station whose recorded verifier result is FAIL is routed back to itself. Archive and verify gates are adjudicated per change: a sibling change's missing evidence never blocks the target (the shared whole-tree evidence digest still does). |
| **Escalation with bounded retries** | Planning, review and verify share lifetime escalation history. A repeated pending event offers re-scope, abandon or break-glass; only an explicit human reason grants one new attempt for that event and station. Accepted replay consumes no grant, tests remain independent, and status/verify/archive preserve override reasons after PASS. |
| **Self-correcting quality** | Drift can draft a bounded follow-up, review uses fresh-context verifier loops and circuit breakers, Verify records judgment provenance, and Archive checks requirement landing fidelity before the trust zone changes. Recurring corrections can graduate through the human-approved learning pipeline. |

### Upgrade from 1.3

Upgrade an existing 1.3 project in this order:

1. Update the standalone binary (or your pinned GitHub devDependency) to 2.0.
2. Run `prospec upgrade` in the project. The CLI records the installed version, re-syncs agent assets, refreshes the deterministic scan, creates only missing init docs, and reports format/trigger gaps.
3. Invoke the bare `prospec-upgrade` Skill using your host's syntax. Review and approve each proposed curated-document migration; authored content is not silently overwritten.
4. Review these behavior boundaries before resuming work:
   - Explicit Skill syntax is host-specific (`/` for Claude Code and Copilot, `$` for Codex, bare name/browser selection for Antigravity); shared prose and automation use the bare `prospec-<name>` identity.
   - Lifecycle commands enforce more entry gates and may refuse shortcuts that 1.3 accepted. Use `prospec status` as the resume point instead of editing lifecycle metadata by hand.
   - The standard post-Verify path is now `verify → knowledge-update → archive`; Knowledge changes join the same feature commit, while Feature Specs still graduate at Archive.
   - The L1 Knowledge entry point is `{base_dir}/index.md`. If a project still relies only on legacy `ai-knowledge/_index.md`, preserve its authored content in the root index before removing the orphaned file; the retired compatibility branch no longer performs that relocation.
5. Run `prospec status` and `prospec check --strict`, resolve newly enforced failures, then continue from the station reported by the CLI.

The major version signals **workflow-contract changes**, not a forced rewrite of your product code or existing Markdown specs. The upgrade path preserves current project choices and asks before judgment-based document edits; stricter refusals and host invocation syntax are the compatibility boundaries to plan for.
