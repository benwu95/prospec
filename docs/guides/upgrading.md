# Upgrading Prospec

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
