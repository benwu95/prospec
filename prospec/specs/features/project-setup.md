---
feature: project-setup
status: active
last_updated: 2026-07-12
story_count: 18
req_count: 43
---

# Project Setup

## Who & Why

**Target Users**: AI-First developers, independent developers, tech leads

**Problem Solved**: Adopting the SDD workflow in a project requires developers to manually create a large number of config files and directory structures — a tedious and error-prone process. Prospec's one-command `prospec init` lets developers complete SDD project setup within 3 minutes.

**Why It Matters**: Project setup is the starting point of the SDD workflow; an incomplete initial structure prevents subsequent phases from functioning. Solid CLI infrastructure ensures developers can quickly locate problems at any phase.

## User Stories & Behavior Specifications

### US-001: CLI Base Framework [P0]

As a developer,
I want a structured CLI entry point supporting `--help`, `--version`, and subcommand routing,
so that I can explore all available commands and know the tool version.

**Acceptance Scenarios:**
- WHEN executing `prospec --help` THEN display all available commands with descriptions
- WHEN executing `prospec --version` THEN display the version number
- WHEN entering an invalid command (e.g., `prospec inti`) THEN show an error and suggest the correct command

#### REQ-SETUP-001: CLI Entry Point and Command Routing
Provide the `prospec` command supporting `--help`, `--version`, and subcommand routing, following the `prospec <command>` or `prospec <resource> <action>` pattern.

**Scenarios:**
- WHEN executing `prospec --help`, THEN display all available commands with descriptions
- WHEN executing `prospec --version`, THEN display version from package.json
- WHEN entering invalid command (e.g., `prospec inti`), THEN suggest similar valid commands
- WHEN single-action command (e.g., `init`), THEN use `prospec <command>` format
- WHEN multi-action resource (e.g., change), THEN use `prospec <resource> <action>` format

### US-002: Config Validation and Error Handling [P0]

As a developer,
I want `.prospec.yaml` to have schema validation, and all commands to provide meaningful error messages,
so that I can quickly locate and fix configuration problems.

**Acceptance Scenarios:**
- WHEN `.prospec.yaml` is missing a required field THEN display the specific field name
- WHEN a command fails THEN the error message includes a problem description and a suggested fix
- WHEN `--verbose` is added THEN output detailed information for each step

#### REQ-SETUP-002: Config Schema Validation
`.prospec.yaml` uses Zod for schema definition and validation, providing a specific error message when a required field is missing.

**Scenarios:**
- WHEN `.prospec.yaml` is valid, THEN successfully parse all fields via Zod schema
- WHEN missing `project.name`, THEN display "project.name is required"
- WHEN multiple required fields missing, THEN list all missing fields
- WHEN contains unknown fields, THEN warn but don't block; suggest correct name if typo

#### REQ-SETUP-003: Error Messages and Debug Mode
All commands provide meaningful error messages and support `--verbose` to output detailed steps.

**Scenarios:**
- WHEN command fails, THEN error includes problem description + suggested fix
- WHEN encountering ProspecError, THEN display error code + message + suggestion
- WHEN `--verbose` added, THEN output detailed info for each step
- WHEN no `--verbose`, THEN only output result summary

### US-003: Project Initialization [P0]

As a developer,
I want running `prospec init` to create a complete SDD project skeleton,
so that I can immediately start the Spec-Driven development workflow.

**Acceptance Scenarios:**
- WHEN executing `prospec init` in an empty directory THEN create `.prospec.yaml`, the AI Knowledge directory, the Constitution, AGENTS.md, and `{base_dir}/README.md` (Prospec introduction)
- WHEN `.prospec.yaml` already exists THEN show a warning and exit
- WHEN package.json is detected THEN automatically identify it as TypeScript/Node
- WHEN an installed AI CLI is detected THEN present an interactive menu for the user to select

#### REQ-SETUP-004: Create Project Structure
Running `prospec init` creates all required files and directories: `.prospec.yaml`, `AGENTS.md`, `{base_dir}/README.md` (Prospec introduction, see REQ-SETUP-023), the root-level `{base_dir}/index.md`, `{base_dir}/ai-knowledge/` (containing `_conventions.md`, `_status-lifecycle.md`, `_module-readme-conventions.md`, `_diagram-conventions.md`), `{base_dir}/CONSTITUTION.md`, and `{base_dir}/specs/`. Writes use per-file skip-if-exists (see REQ-SETUP-018): existing files are always preserved and only missing files are created; the single-file gate (exit if `.prospec.yaml` exists) behavior is unchanged.

**Scenarios:**
- WHEN executing `prospec init` in empty directory, THEN create all required files and directories
- WHEN `{base_dir}/index.md` created, THEN contains empty module table
- WHEN `CONSTITUTION.md` created, THEN contains Principles, Constraints, Quality Standards templates
- WHEN `.prospec.yaml` already exists, THEN show warning and exit without modification (single-file gate unchanged)
- WHEN `.prospec.yaml` is absent but curated files remain (recovery), THEN rebuild only the missing files; existing files stay byte-identical

#### REQ-SETUP-023: In-Project Prospec Introduction README
`prospec init` generates an English introduction README at `{base_dir}/README.md`, letting other developers on the adopting project understand Prospec in place. The content is condensed from the "What is Prospec?" section at the top of the root `README.md` — explaining Prospec through the collaboration of its three components, Skills / AI Knowledge / CLI — and ends with a link to the full documentation at `https://github.com/benwu95/prospec`. This doc is derived from a standalone `base` entry in `INIT_DOC_REGISTRY` (`root: 'base'`, `output: 'README.md'`, standard init context, not derived via `asKnowledgeInitDoc`), reusing init's existing per-file skip-if-exists and the upgrade docs inventory (both automatically covered via the registry); the template is entirely in English (REQ-TEMPLATES-073).

**Scenarios:**
- WHEN executing `prospec init`, THEN create `{base_dir}/README.md` containing the Skills / AI Knowledge / CLI three-piece summary and the `https://github.com/benwu95/prospec` link
- WHEN `{base_dir}/README.md` already exists, THEN per-file skip-if-exists preserves it byte-for-byte
- WHEN executing `prospec upgrade`, THEN the docs inventory reports this README present/MISSING at its actual location (registry-derived)
- WHEN inspecting `INIT_DOC_REGISTRY`, THEN README is a standalone `base` entry, not projected from a convention list via `asKnowledgeInitDoc`

#### REQ-SETUP-005: Auto-Detect Tech Stack
Automatically detect the programming language, framework, and package manager; when detection is not possible, do not block initialization.

**Scenarios:**
- WHEN project has `package.json`, THEN detect as TypeScript/Node
- WHEN project has `pyproject.toml`, THEN detect as Python
- WHEN no recognizable markers, THEN `tech_stack` left empty, init completes normally

#### REQ-SETUP-006: Detect Installed AI CLIs
Automatically detect AI CLI tools installed on the system (Claude Code, Antigravity CLI, Copilot, Codex) and provide interactive selection.

**Scenarios:**
- WHEN `~/.claude` exists, THEN detect Claude Code and pre-check
- WHEN `~/.gemini/antigravity-cli` exists, THEN detect Antigravity CLI and pre-check
- WHEN user unchecks detected CLI, THEN `.prospec.yaml` agents excludes it
- WHEN user checks uninstalled CLI, THEN remind but allow adding
- WHEN detection complete, THEN suggest `prospec agent sync`

#### REQ-SETUP-007: Configurable Project Name
Support the `--name` flag to override the auto-detected directory name.

**Scenarios:**
- WHEN no `--name`, THEN use directory name as project name
- WHEN `--name my-project`, THEN `.prospec.yaml` project.name set accordingly

#### REQ-SETUP-014: Generate Canonical Convention Docs
`prospec init` generates three prospec-bundled, language-neutral convention docs in `{base_dir}/ai-knowledge/`, serving as the single source of truth for Knowledge generation and status transitions.

**Scenarios:**
- WHEN executing `prospec init`, THEN generate `_status-lifecycle.md` (canonical change status state machine), `_module-readme-conventions.md` (module README structure + marker contract), and `_diagram-conventions.md` (Mermaid diagram rules)
- WHEN convention docs created, THEN `{base_dir}/index.md` links to them
- WHEN knowledge-generate / knowledge-update run, THEN defer to these docs as the single source of truth

### US-005: Base Directory Configuration [P1]

As a developer using Prospec,
I want Prospec artifacts placed under a configurable `prospec/` directory rather than a hardcoded path,
so that Prospec output has a clear branded namespace, separated from ordinary project documents.

**Acceptance Scenarios:**
- WHEN `prospec init` runs in interactive mode THEN prompt to choose the artifacts directory (default `prospec`)
- WHEN in non-interactive mode THEN use the default base directory
- WHEN any service needs paths THEN uniformly use `resolveBasePaths()`

#### REQ-SETUP-011: Base Directory Constant and Path Resolution
Define the `DEFAULT_BASE_DIR` constant; `resolveBasePaths()` derives all standard paths from config.

**Scenarios:**
- WHEN base_dir not configured, THEN use default value
- WHEN configured in `.prospec.yaml`, THEN use configured value
- WHEN legacy config has no base_dir, THEN backwards-compatible using `'docs'`
- WHEN config has `paths.base_dir`, THEN derive knowledgePath, constitutionPath, specsPath
- WHEN any service needs paths, THEN uniformly use `resolveBasePaths()`

#### REQ-SETUP-012: Init Interactive Base Directory Selection
`prospec init` interactively prompts for the base directory selection.

**Scenarios:**
- WHEN interactive mode, THEN prompt "Prospec artifacts directory?" (default `prospec`)
- WHEN non-interactive mode, THEN use default base directory
- WHEN user enters custom name, THEN write to `.prospec.yaml` paths.base_dir

### US-006: First-Time Prospec Use [P0]

As a developer encountering Prospec for the first time,
I want a smooth, guided experience from installation to completing my first SDD workflow,
so that I can understand Prospec's value and start using it within 10 minutes.

**Acceptance Scenarios:**
- WHEN running `prospec --help` after installation THEN see a clear list of commands
- WHEN running `prospec init` THEN interactive guidance completes all setup
- WHEN initialization completes THEN output a summary with next-step suggestions
- WHEN running `prospec knowledge init` THEN scan the project and produce raw-scan.md and the knowledge skeleton

#### REQ-SETUP-013: First-Time Use Onboarding Flow
After initialization completes, provide clear next-step suggestions and an operation summary.

**Scenarios:**
- WHEN init complete, THEN output summary with created files, next steps (`prospec knowledge init`, `prospec agent sync`), estimated time
- WHEN knowledge init complete, THEN suggest next action based on project state

### US-007: Executable Constitution [P1]

As a developer using Prospec,
I want `prospec init` to produce guided Constitution rules with severities (rather than an empty template),
so that the Constitution is usable from day one and verify can report by severity level.

**Acceptance Scenarios:**
- WHEN running `prospec init` in a project with a given tech stack THEN CONSTITUTION.md contains 3-5 appropriate, concrete rules tagged with MUST/SHOULD/MAY
- WHEN the tech stack cannot be determined THEN provide language-neutral generic rules that are still non-empty
- WHEN verify encounters severity-tagged rules THEN a MUST violation → FAIL, SHOULD → WARN, MAY → informational note (does not affect grade)

#### REQ-TYPES-021: Constitution Rule Type
Define `ConstitutionRule` (RFC-2119 severity + name / description / rationale / optional check).
- WHEN a rule is defined, THEN severity is one of MUST / SHOULD / MAY

#### REQ-LIB-012: Stack-Appropriate Example Rules
The pure function `exampleRulesFor(techStack)` in `lib/constitution-rules.ts` returns 3-5 guided rules with severities, based on the language.
- WHEN language is python, THEN return python rules including an authentication rule
- WHEN language is unknown or undetected, THEN return language-neutral rules
- WHEN any stack, THEN 3-5 rules, each with a severity, at least one MUST

#### REQ-SERVICES-026: Init Wires Example Rules
`init.service` passes the result of `exampleRulesFor(techStack)` as `example_rules` into the Constitution template.
- WHEN `prospec init` runs, THEN the constitution template context includes `example_rules`

#### REQ-TEMPLATES-062: Guided Structured Constitution Template
`init/constitution.md.hbs` uses `{{#each example_rules}}` to render `### [SEVERITY] Name` + Rationale + Verify, replacing the empty placeholder.
- WHEN rendered, THEN output has severity-tagged rules and no `[Principle Name]` placeholder

#### REQ-TESTS-021: Constitution Rules + Format Tests
`exampleRulesFor` unit tests + constitution.hbs / verify severity contract test.
- WHEN tests run, THEN they cover python/typescript/fallback rule sets and template severity rendering

### US-008: Init Language Selection and Language Policy [P1]

As a project owner who is not a native English speaker,
I want to choose the primary document language during `prospec init` and have the Language Policy automatically written into the Constitution,
so that all AI-generated documents use my language without manually editing the Constitution.

**Acceptance Scenarios:**
- WHEN running interactive init THEN a primary language prompt appears (default English, custom input allowed)
- WHEN `init --language X` THEN skip the prompt and adopt X
- WHEN in CI mode (`--agents`) without the flag THEN adopt English with zero interaction
- WHEN init completes THEN `.prospec.yaml` records `artifact_language` and CONSTITUTION.md contains a [MUST] Language Policy

#### REQ-SETUP-015: Init Primary Language Selection
`prospec init` provides primary language selection: interactive input (default "English"), the `--language <lang>` flag, and English as the default in CI mode.

**Scenarios:**
- WHEN interactive init, THEN prompt for the document language with default English
- WHEN `--language X` (including `--language ""`), THEN skip the prompt; blank resolves to English
- WHEN CI mode without the flag, THEN English with zero interaction

#### REQ-TYPES-025: Config Language and Skill Triggers Schema
`ProspecConfigSchema` adds an optional `artifact_language` (free-form string) and `skill_triggers` (skill name → string array).

**Scenarios:**
- WHEN the fields are absent, THEN legacy `.prospec.yaml` still validates; consumers treat the language as English
- WHEN `skill_triggers` values are not string arrays, THEN validation fails (ConfigInvalid)

#### REQ-LIB-013: Language Policy Constitution Rule
`languagePolicyRule(language)` returns a [MUST] rule — all AI-generated documents (change artifacts + AI Knowledge) use the primary language, while code and technical terms are always in English; init places it first in `example_rules`.

**Scenarios:**
- WHEN `init --language X`, THEN CONSTITUTION.md contains a [MUST] Language Policy rule rendering X
- WHEN no language chosen, THEN the rule renders English

### US-009: English CLI Output [P2]

As a prospec CLI user of any locale,
I want the CLI's option descriptions, error messages, and runtime output to all be in English,
so that the CLI's behavior is consistent with the "artifacts English baseline" positioning, and error messages are searchable.

**Acceptance Scenarios:**
- WHEN `prospec --help` and each subcommand's help THEN the description text is in English
- WHEN any error is triggered THEN the message (including the suggestion) is in English

#### REQ-SETUP-016: CLI Runtime Output in English
CLI option descriptions, error messages (including `suggestion`), and stdout/stderr output are uniformly in English.

**Scenarios:**
- WHEN running any help or error path, THEN output contains no CJK characters
- WHEN scanning `src/`, THEN zero files contain CJK characters

### US-010: Quickstart One-Command Launch [P1]

As a developer adopting prospec,
I want one CLI command to complete the deterministic scaffold, then one slash command to finish up on the agent side,
so that brownfield onboarding is reduced to 2 input steps (including non-English projects), with everything else automated.

**Acceptance Scenarios:**
- WHEN running `prospec quickstart` in an uninitialized project THEN complete init + agent sync and print the next step `/prospec-quickstart`
- WHEN re-running in an already-initialized project THEN skip init, exit 0, and still reach the next-step guidance
- WHEN no agent is configured THEN prompt with a clear message rather than a stack trace

> AI Knowledge generation requires an LLM to read the source, which the CLI cannot accomplish on its own — the CLI→agent context switch is the 2-step lower bound; the rest (trigger localization, knowledge generation) is finished automatically by the `/prospec-quickstart` skill (see agent-integration US-431).

#### REQ-SETUP-017: Quickstart One-Command Onboarding
`prospec quickstart` chains init + agent sync (skipping already-completed steps), printing the agent-side next step; registered in `INIT_COMMANDS`, runnable before `.prospec.yaml` exists; `--name`/`--agents`/`--language` pass through to init.

**Scenarios:**
- WHEN executing `prospec quickstart` in an uninitialized project, THEN run init + agent sync and print the next action (`/prospec-quickstart`)
- WHEN re-run on an initialized project, THEN init is skipped, exit 0, and next-step guidance is still printed
- WHEN no agent is configured, THEN surface a `PrerequisiteError` with actionable guidance, not a stack trace
- WHEN run before `.prospec.yaml` exists, THEN the config-existence preAction gate does not block it (registered in `INIT_COMMANDS`)

#### REQ-SERVICES-028: Quickstart Orchestrator Service
`quickstart.service.execute()` calls sibling `init` (catching `AlreadyExistsError` → marks it skipped) and then `agentSync` in order, aggregating per-step status and forwarding hints; it deliberately does not call knowledge-init (LLM work belongs to the `/prospec-quickstart` skill).

**Scenarios:**
- WHEN init throws `AlreadyExistsError`, THEN catch it and mark the init step skipped without aborting the run
- WHEN agent-sync returns hints (non-English language + empty `skill_triggers`), THEN the result forwards them for display
- WHEN orchestrating, THEN it does not run knowledge init, and the dependency direction `cli → services` is preserved (service-orchestrates-service, cf. change-resolver)

---

### US-011: Init No Longer Overwrites Existing Curated Files [P1]

As a prospec user who re-runs init/quickstart after deleting `.prospec.yaml`,
I want init to skip existing trust-zone files one by one and rebuild only the missing files,
so that I never lose my curated Constitution principles, `_conventions`, and root-level `index.md` due to re-running initialization.

**Acceptance Scenarios:**
- WHEN re-running `prospec init` after deleting `.prospec.yaml` in a project that already has a trust zone, THEN rebuild only `.prospec.yaml`, with zero changes to the contents of `CONSTITUTION.md`/`_conventions.md`/root-level `index.md`
- WHEN re-running init after trust-zone files are partially missing (half-initialized), THEN rebuild only the missing files, leaving existing files untouched
- WHEN running init in a completely empty directory (greenfield), THEN behavior is unchanged and all seed files are generated as usual
- WHEN an existing `AGENTS.md` (a managed artifact, not trust-zone) is present, THEN its hand-written content is migrated into the `prospec:user` section and a stub is placed into `prospec:auto` (not skipped, not overwritten)

#### REQ-SETUP-018: Init Per-File Idempotency Guard
The artifact write loop in `init.service.execute`: curated trust-zone files (`CONSTITUTION.md`/`_conventions.md`/root-level `index.md`/canonical convention docs) use per-file skip-if-exists, with existing files byte-unchanged; `AGENTS.md` is a `managed` artifact and instead goes through `mergeManagedDoc` (existing content migrated into the `prospec:user` section, a stub into `prospec:auto`; if the file is missing, create it with auto=stub and an empty user) and is included in `createdFiles`. `.prospec.yaml` is still written last, serving as the "init complete" recovery marker.

**Scenarios:**
- WHEN re-running `prospec init` after deleting `.prospec.yaml` in a project that already has a trust zone, THEN rebuild only `.prospec.yaml`, with trust-zone artifacts byte-unchanged; `AGENTS.md` is written via merge and included in `createdFiles`
- WHEN re-running init after the trust zone is partially missing (half-initialized), THEN rebuild only the missing trust-zone files, preserving existing ones
- WHEN running greenfield init in an empty directory, THEN all trust-zone files are written and `AGENTS.md` is created (auto=stub, empty user), with behavior unchanged
- WHEN an existing `AGENTS.md` is hand-written (no sections), THEN its content is migrated into the user section (not skipped, not overwritten)

---

### US-012: prospec upgrade Refreshes Canonical Docs [P1]

As a project maintainer upgrading the prospec CLI version,
I want a zero-LLM command to re-render zone 2 canonical docs, re-run agent sync, record the version, and produce an upgrade report,
so that my shipped documents keep up with the new CLI version while zone 3 curated content is completely unaffected.

**Acceptance Scenarios:**
- WHEN running `prospec upgrade` in an initialized project, THEN `.prospec.yaml` `version` is updated to `PROSPEC_VERSION`, agent sync runs, and a report is printed
- WHEN upgrade completes, THEN the upgrade report lists new skills missing triggers and the version delta (from→to)
- WHEN running upgrade in an uninitialized project (no `.prospec.yaml`), THEN `ConfigNotFound` blocks it and prompts to run `prospec init` first, writing no files
- WHEN upgrade runs, THEN the contents of any `prospec/ai-knowledge/` doc and the CONSTITUTION are unchanged

#### REQ-TYPES-037: The `version` Field Represents the prospec Version the Project Uses
The semantics of the `version` field in `.prospec.yaml` are defined as "the prospec version the project uses" (i.e., `PROSPEC_VERSION`), no longer the config schema version "1.0". `init.service` seeds `version: PROSPEC_VERSION`; `upgrade.service` updates it on upgrade. `ProspecConfigSchema.version` remains an optional string (backwards-compatible). No separate `prospec_version` field is added — `version` carries it directly.

**Scenarios:**
- WHEN `prospec init` completes, THEN `.prospec.yaml`'s `version` equals `PROSPEC_VERSION` (not "1.0")
- WHEN a legacy config (`version: "1.0"` or no `version`) is safeParsed, THEN it is still valid (backwards-compatible)
- WHEN `prospec upgrade` runs, THEN `version` is updated to the current `PROSPEC_VERSION`
- WHEN inspecting the schema, THEN there is no separate `prospec_version` field (the semantics are carried solely by `version`)

#### REQ-TYPES-036: PROSPEC_VERSION Single Source
Add `types/version.ts` that uses `createRequire` to read the package `package.json` and exports `PROSPEC_VERSION`, placed in the leaf `types` layer — both `cli` (commander `.version()`) and `services` (`init`/`upgrade`) can import it downward, eliminating duplicated version literals.

**Scenarios:**
- WHEN reading `PROSPEC_VERSION`, THEN the value equals the `version` in `package.json`
- WHEN `prospec --version`, THEN output `PROSPEC_VERSION` (single source, no duplicated literals)
- WHEN inspecting imports, THEN both `cli` and `services` import `types/version`, with no `cli → lib` violation (lint-guarded)

#### REQ-SERVICES-035: Upgrade Orchestrator Service
`upgrade.service.execute({ cwd, interactive? })`: (1) `readConfig`; (2) update `config.version = PROSPEC_VERSION`; (3) in interactive mode, prompt one by one to fill in missing curated fields (`UPGRADE_NUDGE_RULES`) and apply the answers; (4) `writeConfig` (comment-preserving in-place merge, preserving comments; see REQ-LIB-022); (5) orchestrate sibling `agentSync.execute` (service-orchestrates-service, forwarding hints/warnings); (6) best-effort refresh of `raw-scan.md` (`generateRawScan`, non-fatal, returns `rawScanRefreshed`); (7) **`createMissingDocs`** — use `buildDocsInventory` to find MISSING documents, and for each render via the shared `lib/init-docs` helper + `atomicWrite` (skip-if-exists, per-doc best-effort), collecting successes into `createdDocs` (see REQ-SERVICES-061); (8) `buildReport` (post-prompt, post-creation): version delta (from→to), the list of skills missing triggers, config-field nudges (`detectNudges`), the post-creation docs inventory (`buildDocsInventory` — checking each file at its actual location per `INIT_DOC_REGISTRY` × `resolveInitDocLocation`, respecting a migrated `knowledge.base_path`, see REQ-SETUP-022), and `createdDocs`. **Only create missing files, never overwrite an existing curated doc** (format migration belongs to the `/prospec-upgrade` skill); apart from the regenerable `raw-scan.md`, writes to `prospec/ai-knowledge/` are limited to the missing files created this run.

**Scenarios:**
- WHEN execute completes, THEN `.prospec.yaml` `version` = `PROSPEC_VERSION`, agent sync has run, `raw-scan.md` has been refreshed, and missing init docs have been created
- WHEN execute runs and existing curated docs are present, THEN existing docs (CONSTITUTION/root-level index/_conventions/canonical convention docs/module README) are byte-unchanged (only missing files are created, none overwritten)
- WHEN a single file's render/write fails, THEN best-effort — that file stays MISSING and upgrade still succeeds (version + agent sync unaffected); when `generateRawScan` fails, `rawScanRefreshed` is false but it does not abort
- WHEN the report is produced, THEN it includes version{from,to}, the list of skills missing `skill_triggers` entries (when non-English), nudges, the post-creation per-file docs inventory, and `createdDocs`
- WHEN orchestrating, THEN it calls `agentSync` + `generateRawScan` + the shared `lib/init-docs`, without breaking the dependency direction `cli → services → lib → types` (it does not render canonical docs, nor run LLM knowledge generate)

#### REQ-SETUP-019: prospec upgrade Command
The `prospec upgrade` (zero-LLM) CLI command. Responsibilities: (1) upgrade `.prospec.yaml` — update `version` to `PROSPEC_VERSION`, persisting it via a **comment-preserving in-place merge** (preserving user comments and formatting, see REQ-LIB-022); (2) run `agent sync` (zone-1 regeneration) and best-effort refresh `raw-scan.md` (deterministic, equivalent to `--raw-scan-only`, aligned with the new-version scanner); (3) **directly create missing init docs** (rendering + writing each file per `INIT_DOC_REGISTRY`, skip-if-exists, see REQ-SETUP-024); (4) output a report (version delta, docs inventory and this run's "created" list, see REQ-SETUP-022, skills missing triggers, config-field nudges) + the next step `/prospec-upgrade`. In an interactive TTY, prompt one by one to fill in missing curated fields (see REQ-SETUP-021); `--no-interactive` (and non-TTY stdin) forces no prompting, but **missing-file creation is independent of interactivity**, so the `/prospec-upgrade` skill and CI still create the files. **Never overwrite an existing curated doc**, do not migrate existing document formats, and do not modify the CONSTITUTION (format migration belongs to the `/prospec-upgrade` skill). It is a post-init command — not listed in `INIT_COMMANDS`; when uninitialized, `ConfigNotFound` blocks it and prompts to run `prospec init` first.

**Scenarios:**
- WHEN running `prospec upgrade --no-interactive` in an initialized project, THEN `.prospec.yaml` `version` is updated and user comments are preserved, agent sync runs, `raw-scan.md` is refreshed, missing init docs are created, and a report is printed (including the docs inventory and the created list), exit 0
- WHEN running in an interactive TTY with missing curated fields, THEN prompt one by one to fill them in like `prospec init` (e.g., artifact_language)
- WHEN running in an uninitialized project (no `.prospec.yaml`), THEN `ConfigNotFound` blocks it and prompts `prospec init`, writing no files
- WHEN running upgrade, THEN only missing curated docs are created; existing curated docs and the CONSTITUTION are byte-unchanged (format migration belongs to the skill; the other write to `prospec/ai-knowledge/` is the regenerable `raw-scan.md`)

---

### US-013: Interactively Fill In Missing Curated Settings During Upgrade [P1]

As a developer upgrading an older prospec project,
I want `prospec upgrade` to detect curated `.prospec.yaml` fields I have never set and prompt me to fill them in one by one in the terminal,
so that I can complete the setup at upgrade time without entering an AI agent, and my existing choices are never nagged.

**Acceptance Scenarios:**
- WHEN `.prospec.yaml` has no `artifact_language` and upgrading in a TTY, THEN prompt for a language (default English) and write the answer back
- WHEN `--no-interactive` / non-TTY, THEN do not prompt and only print a report containing that nudge
- WHEN the project has already explicitly chosen any language (including English), THEN report no nudge and do not prompt

#### REQ-SETUP-020: Upgrade config-field Nudge Curated Registry
`prospec upgrade` uses the curated `UPGRADE_NUDGE_RULES` (services) to detect optional fields missing in pre-feature projects and reports them in `UpgradeReport.nudges` (`detectNudges`). **Deliberately curated, not "any missing field"**: fields with a reasonable default (`paths.base_dir`/`knowledge`/`exclude`) or whose absence is a hard error (`agents`) are not included. The first example is `artifact_language`; the lib `isArtifactLanguageUnset(config)` distinguishes "field missing / blank" from "explicitly chose English".

**Scenarios:**
- WHEN `artifact_language` is missing, THEN `detectNudges` returns one entry for that field; an explicitly set value (including English) → empty array
- WHEN unset (resolves to English), THEN `missingTriggers` must be empty (the two signals are mutually exclusive in practice)
- WHEN adding a curated field, THEN only one rule needs to be added; the report / formatter / interaction / skill all iterate

#### REQ-SETUP-021: Upgrade Interactive Fill-In and `--no-interactive`
In an interactive TTY, `prospec upgrade` prompts for each matched nudge one by one (`NudgeRule.prompt()` returns a config patch; `artifact_language` = text input, default English), mirroring `prospec init`. The CLI determines interactivity via `!--no-interactive && process.stdin.isTTY`; `UpgradeResult.resolvedNudges` confirms the filled fields. The `/prospec-upgrade` skill instead invokes it with `--no-interactive` and never blocks; trigger translation still belongs to that skill (LLM).

**Scenarios:**
- WHEN interactively entering a non-English language, THEN write it back to the config file, and the report then lists all skills awaiting localization via `missingTriggers`
- WHEN interactively accepting the default (empty input), THEN write `English`, and the nudge self-terminates
- WHEN `--no-interactive` / non-TTY, THEN do not invoke prompts and only print the report, without blocking the skill / CI

---

### US-014: Upgrade Preserves `.prospec.yaml` Comments [P1]

As a developer who has written comments in `.prospec.yaml`,
I want `prospec upgrade` to not wipe out my comments and formatting when it only bumps `version`,
so that upgrading does not silently break the config file I maintain by hand.

**Acceptance Scenarios:**
- WHEN upgrading a `.prospec.yaml` containing top-level and inline comments, THEN all comments are preserved, `version` is updated, and the remaining lines are unchanged
- WHEN `writeConfig` writes to an existing file, THEN only the changed scalar values are rewritten, and unchanged keys and their order are preserved
- WHEN the target file does not exist, THEN fall back to a fresh serialization

#### REQ-LIB-022: writeConfig In-Place Merge Preserves Comments (mergeIntoDocument)
The lib `mergeIntoDocument(doc, value)`: merges an object in place into an existing YAML Document — scalar changes only alter the value (preserving the node and comments), nested maps recurse, array / type changes rebuild the whole block, and keys not present in the object are deleted; when there is no top-level map, fall back to a wholesale replacement. `writeConfig` switches to it, so that comments and formatting of an existing `.prospec.yaml` are preserved on overwrite.

**Scenarios:**
- WHEN changing only one scalar, THEN top-level and inline comments are all preserved and only that value is rewritten
- WHEN adding a key, THEN it is appended at the end without touching existing keys and comments; keys not present in the object are deleted
- WHEN the target file does not exist, THEN fall back to a fresh serialization

---

### US-015: Upgrade Report Reveals Document Coverage Status [P1]

As a project maintainer upgrading the prospec version,
I want the `prospec upgrade` report to list every document that init would create along with its present/missing status (the list derived from the same source as the init implementation),
so that I can see at a glance which files are missing at upgrade time, rather than discovering leftover old formats or uncreated files afterward.

**Acceptance Scenarios:**
- WHEN running `prospec upgrade` in an existing project that lacks `_glossary.md`, THEN the report's docs inventory marks `_glossary.md` as MISSING
- WHEN all init docs are present, THEN the inventory marks each file present, and no files outside the list appear
- WHEN `prospec upgrade` runs, THEN the contents of any curated doc and the CONSTITUTION are byte-unchanged (the CLI only reports, does not write)

#### REQ-TYPES-038: Init-Doc Registry Single Source of Truth
The `INIT_DOC_REGISTRY` in `types/conventions.ts` — the single source of truth for the 8 curated documents init creates: each entry contains a template name, a root discriminator (`base` = under `paths.base_dir`; `knowledge` = under the knowledge base, which consumers must resolve via `resolveBasePaths().knowledgePath` and must not assemble as `base_dir + 'ai-knowledge'`), and a root-relative path; both canonical and user-managed convention docs are derived without duplication from their `ConventionDocSource` constants (`{template, output}` pairs) via the shared `asKnowledgeInitDoc` projection — any document name is declared in exactly one place in the codebase; the index entry declares its render context with `context: 'index'`, and consumers discriminate by field rather than by matching the template path string. It excludes `AGENTS.md` (zone-1, owned by agent-sync) and `specs/.gitkeep` (not a document). `init.service`'s curated list is derived from this (per-file skip-if-exists and write behavior are unchanged); it sits in the leaf `types` layer, pure data with no I/O.

**Scenarios:**
- WHEN reading the registry, THEN exactly 8 entries (base: `README.md`, `CONSTITUTION.md`, `index.md`; knowledge: `_conventions`, `_diagram-conventions`, `_glossary`, `_status-lifecycle`, `_module-readme-conventions`), each with a template and root
- WHEN `prospec init` runs on greenfield, THEN the set of curated documents actually created == the set derived from the registry (bidirectional equality)
- WHEN inspecting imports, THEN `conventions.ts` has no internal imports (leaf pure data)

#### REQ-SETUP-022: Upgrade Report Docs Inventory
The docs inventory section of the `prospec upgrade` report: for each file per `INIT_DOC_REGISTRY`, existence is checked at its **actual location** via the shared `resolveInitDocLocation` (the knowledge root respects a migrated `knowledge.base_path` — consistent with knowledge-init / agent-sync / knowledge-reader); because the CLI creates missing files before reporting, the inventory reflects the **post-creation** state. The formatter outputs a fixed, parseable line format `✓ <path> (template: <hbs>)` / `✗ <path> — MISSING (template: <hbs>)` (paths passed through `sanitizeTerminal`), and lists this run's creations with a `created N missing doc(s): …` line; when still MISSING (creation failed), it prompts to handle it with `/prospec-upgrade`. `buildDocsInventory` itself is purely read-only (no writes); creation is handled by `createMissingDocs`.

**Scenarios:**
- WHEN the project lacks `_glossary.md`, THEN upgrade creates it, and the inventory marks it present and lists it in `createdDocs`
- WHEN `knowledge.base_path` is migrated to a non-default location, THEN missing files are checked and created at the actual location, without falsely reporting MISSING or creating them at the wrong path
- WHEN the report is output, THEN the docs line format is fixed (e2e pins the exact string), and the skill can parse it accordingly

---

### US-016: Skill Fully Refreshes and Creates from Inventory [P1]

As a project maintainer running `/prospec-upgrade`,
I want the skill to consume the report's inventory list — diffing existing files against the latest templates one by one and updating them after my approval, and asking me before creating missing files — replacing the hardcoded file list in the template,
so that after upgrading there are no leftover old-format documents and no missing documents introduced by the new version.

**Acceptance Scenarios:**
- WHEN the report marks a file MISSING and the user approves creation, THEN the skill creates that file from the latest template; if not approved, it is left untouched
- WHEN the report marks a file present and its format diverges from the latest template, THEN show a diff per file and, after approval, migrate only the format
- WHEN rendering the skill template to inspect Step 2, THEN there is no hardcoded init doc list (the scan scope comes entirely from the report inventory)

#### REQ-TESTS-036: Init⇄Registry Drift-Protection Tests
Three layers of drift protection, all mutation-verified: a unit test pins the registry shape (exactly 8 root:output entries, canonical derivation); `init.service.test` asserts that the set memfs init actually produces and the set derived from the registry are **bidirectionally equal** (init privately adding a document or the registry missing an entry both turn it red); the contract `init-doc-registry.test` renders every registry template with the real `renderTemplate()` (a mistyped template name turns it red).

**Scenarios:**
- WHEN removing any entry from the registry, THEN the shape test turns red; WHEN init privately adds a file outside the list, THEN the equality test turns red
- WHEN the registry template path does not match the actual `.hbs`, THEN the contract render test turns red

---

### US-017: prospec upgrade Directly Creates Missing init Docs [P1]

As a project maintainer upgrading the prospec CLI version,
I want `prospec upgrade` to directly create missing init docs (rendering them from their templates, without overwriting existing files),
so that I can obtain documents introduced by the new version without re-running `prospec init` (which an already-initialized project would block with `AlreadyExistsError`).

**Acceptance Scenarios:**
- WHEN `prospec upgrade` runs and an `INIT_DOC_REGISTRY` document is missing at its actual location THEN the CLI renders it from its template and writes it, and the report lists it in the "created" list
- WHEN a registry document already exists THEN it is preserved byte-for-byte (skip-if-exists, never overwritten)
- WHEN running with `--no-interactive` (the skill / CI path) THEN missing files are still created (creation is independent of interactivity)
- WHEN `index.md` is missing THEN the CLI creates a baseline render; the real modules table and migration of the old `_index.md` are completed by the `/prospec-upgrade` skill

#### REQ-SETUP-024: prospec upgrade Directly Creates Missing init Docs
After building the docs inventory, `prospec upgrade` renders and writes each `INIT_DOC_REGISTRY` document marked MISSING from its template (skip-if-exists, existing files never overwritten), so that an initialized project can obtain init documents added by the new version without re-running `prospec init`; creation takes effect in both interactive and `--no-interactive` modes (no per-file prompt, no flag). `index.md` is created as a baseline as well; the real modules table and migration of the old `_index.md` still belong to the `/prospec-upgrade` skill.

**Scenarios:**
- WHEN a registry document is missing at its actual location, THEN upgrade renders its template and writes it, and the report lists it in the "created" list
- WHEN a registry document already exists, THEN it is preserved byte-for-byte (skip-if-exists)
- WHEN running with `--no-interactive`, THEN missing files are still created
- WHEN `index.md` is missing, THEN create a baseline (empty modules table); filling in the content is handled by the skill

#### REQ-LIB-023: Shared init-doc render helper
Add `lib/init-docs.ts`: `buildInitDocContexts(config, cwd)` rebuilds the standard render context and the baseline index context (empty modules table) from config; `renderInitDoc(doc, contexts)` selects the context to render based on `doc.context`; `resolveInitDocLocation(doc, config, cwd)` returns `{ absPath, label }` via `resolveBasePaths`. Both `init.service` and `upgrade.service` consume it, eliminating render-logic drift between the two places; it imports only `lib`/`types`, maintaining the dependency direction.

**Scenarios:**
- WHEN `init.service` switches to the helper, THEN the greenfield init output set and content are byte-for-byte unchanged
- WHEN inspecting imports, THEN `lib/init-docs` has no upward imports of `services`/`cli`
- WHEN `knowledge.base_path` is migrated, THEN `resolveInitDocLocation` returns the actual location (consistent with `buildDocsInventory`)

#### REQ-SERVICES-061: Upgrade Missing-File Creation Step
`upgrade.service.execute` calls `createMissingDocs` after agent sync / raw-scan and before building the report: it uses `buildDocsInventory` to find MISSING files, and for each renders via the shared helper + `atomicWrite` (with a `fileExists` safeguard), collecting successes into `createdDocs`; a single file's failure is best-effort (does not abort upgrade, that file stays MISSING); the report `docs` is rebuilt after creation. It does not overwrite any existing file.

**Scenarios:**
- WHEN there are MISSING documents, THEN render + write each one, and `createdDocs` records the successes
- WHEN a single file's creation throws an exception, THEN upgrade still succeeds and that file stays MISSING
- WHEN an existing file is present, THEN it is not overwritten (byte-unchanged)

#### REQ-TYPES-051: UpgradeReport Created-List Field
`UpgradeReport` adds `createdDocs: string[]` (the project-relative labels of the documents created by the CLI this run); the docs inventory is reported after creation, with created files marked present and listed in `createdDocs`.

**Scenarios:**
- WHEN upgrade creates N missing files, THEN `createdDocs` contains those N; when no files are created, it is an empty array
- WHEN the report is serialized, THEN `docs` reflects the post-creation state (created files present)

#### REQ-TEMPLATES-124: prospec-upgrade skill Step 2 Semantic Shift
`prospec-upgrade.hbs` Step 2 changes from "create missing files" to: (a) filling in documents the CLI created but which need more content (`index.md`'s real modules table, migration of the old `_index.md`, and preservation of curated fields); (b) diffing format drift of existing documents + migrating on approval; creating missing files is demoted to a safety net (only when the report still shows MISSING = creation failed). The scan scope still comes entirely from the report's `Docs inventory:` (no hardcoded list).

**Scenarios:**
- WHEN rendering the skill to inspect Step 2, THEN it explains that the CLI has created the missing files and the skill is responsible for filling in and format migration
- WHEN the report still lists MISSING (creation failed), THEN the skill proposes creating it as a safety net
- WHEN rendering the skill, THEN there is no hardcoded init doc list

#### REQ-TESTS-037: Upgrade Missing-File Creation and Shared helper Tests
New/expanded tests: `upgrade-flow` / `upgrade.service` assert that missing files are created (including `--no-interactive`), existing files are byte-unchanged, `createdDocs` is correct, and single-file failure is best-effort; after refactoring `init.service`, greenfield output is unchanged (the existing equality test stays green); `lib/init-docs` unit tests (context / path, `knowledge.base_path` migration); e2e actually runs the creation.

**Scenarios:**
- WHEN running upgrade in a project with missing files (interactive and `--no-interactive`), THEN missing files are all created and existing files are unchanged
- WHEN running the existing init⇄registry equality test after the init refactor, THEN it stays green
- WHEN coverage is measured, THEN ≥ 80%

---

### US-018: Complete .prospec.yaml Reference Example [P1]

As a prospec user (including an onboarding agent) who wants to understand or correct all fields of `.prospec.yaml`,
I want a CLI command to emit a complete, valid, per-field-annotated `.prospec.yaml` example,
so that I can discover every settable field without reading a minified binary or an incomplete README.

**Acceptance Scenarios:**
- WHEN running `prospec config example` THEN the output covers all fields of `ProspecConfigSchema`, with per-field comments, and passes `safeParse`
- WHEN running in an uninitialized project THEN it can still output (the example is independent of project state)
- WHEN the schema adds a field but the example is not synced THEN the completeness contract test turns red

#### REQ-CLI-021: `prospec config example` Emits Complete Annotated Config
A new `config` command group + `example` subcommand prints a complete, valid, per-field-annotated `.prospec.yaml` example covering all fields of `ProspecConfigSchema`; registered in `INIT_COMMANDS` (runnable without init); success → stdout.

**Scenarios:**
- WHEN the output is parsed, THEN it is valid YAML and `ProspecConfigSchema.safeParse` succeeds
- WHEN inspecting the output, THEN it covers every field of the schema (including `tech_stack` / `paths.base_dir` / `knowledge.base_path`, which the README previously omitted)
- WHEN running in an uninitialized project, THEN it is runnable (`INIT_COMMANDS`); `README.md`/`README.zh-TW.md` document this command

#### REQ-TESTS-051: config-example Completeness Contract
A structure-aware, mutation-verified contract: the `config example` output parses through `ProspecConfigSchema`, and every key of the schema (including nested ones, derived via each nested schema's `.shape`) appears in the example.

**Scenarios:**
- WHEN the example is missing any schema key (including nested), THEN the contract turns red
- WHEN the schema has no dead fields, THEN every declared key in the example is live (no dead allowlist)

---

### US-019: Clean Up Dead Fields in the config schema [P2]

As a prospec maintainer,
I want to remove dead fields from `ProspecConfigSchema` that are declared but never read by the code, and to replace the deprecated `.passthrough()`,
so that the schema retains only effective fields and does not use a deprecated API.

**Acceptance Scenarios:**
- WHEN inspecting `ProspecConfigSchema` THEN it does not contain `project.version`, `knowledge.files` (+ `KNOWLEDGE_FILE_TYPES`), or the `paths` catchall
- WHEN an existing config containing these keys is parsed THEN it still succeeds (Zod strips unknown nested keys), with zero behavior change
- WHEN inspecting the top-level object THEN `.loose()` replaces the deprecated `.passthrough()`, with loose behavior preserved

#### REQ-TYPES-062: Config Schema Carries Only Live Fields + Non-Deprecated Loose API
`ProspecConfigSchema` retains only declared fields that have a runtime reader; it removes the dead `project.version`, `knowledge.files` (+ the orphaned `KNOWLEDGE_FILE_TYPES`), and the `paths` `.catchall`. The top-level `.passthrough()` is replaced with Zod 4's `.loose()` (behaviorally equivalent, preserving unknown top-level keys). Existing configs still parse: the removed nested keys are stripped (they had no reader anyway, zero behavior change), and unknown top-level keys are still passed through.

**Scenarios:**
- WHEN inspecting the schema, THEN it does not declare `project.version` / `knowledge.files` / `KNOWLEDGE_FILE_TYPES` / the `paths` catchall
- WHEN `validateConfig` runs on a config containing the removed nested keys, THEN it succeeds and the result does not contain them
- WHEN there are unknown top-level keys, THEN they are still preserved by `.loose()` (the existing passthrough test stays green)

---

## Edge Cases

- `.prospec.yaml` malformed (YAML syntax): provide a specific error location and a suggested fix
- Running `prospec init` repeatedly: warn and exit without modifying existing files
- The user selects an uninstalled AI CLI: remind but allow adding it to the config
- Insufficient disk space: use atomic write, preserve the original file, and display a specific error
- Unrecognizable command input: show an error and suggest a similar command
- The project uses an unsupported architecture pattern: allow manual configuration of `paths`
- `--language ""` (empty string or blank): treated as unspecified, adopting the default English

## Success Criteria

- **SC-1**: A new project can complete Prospec initialization within 3 minutes
- **SC-2**: All Prospec services uniformly use `resolveBasePaths()` for path resolution
- **SC-3**: A first-time developer can understand and run the complete Greenfield workflow within 10 minutes
- **SC-4**: All CLI commands are discoverable via `--help`
- **SC-5**: 100% of invalid command inputs receive a meaningful error message or command suggestion

## Maintenance Rules

1. **Replace-in-Place**: A MODIFIED requirement is replaced directly with its latest state
2. **Functional Grouping**: New requirements are inserted into the corresponding functional group
3. **No Inline Provenance**: Historical traceability lives only in the Change History
4. **Deprecation over Deletion**: Removed requirements are moved to the Deprecated section

## Deprecated Requirements

#### ~~REQ-SETUP-008: Scan Project Architecture~~
**Removed**: 2026-06-22 | **Change**: remove-deprecated-steering-command
**Reason**: The `prospec steering` command was removed; scanning + module detection is replaced by `prospec knowledge init` (with more accurate tech-stack detection). The unique `.prospec.yaml` tech_stack/paths write-back is deliberately dropped — tech_stack is already written when `prospec init` creates the file; per-module `paths` was a circular setting that only steering wrote and read itself (buildLayers feeding architecture.md), while everywhere else in the system only reads `paths.base_dir`.

#### ~~REQ-SETUP-009: Generate Architecture Report and Module Map~~
**Removed**: 2026-06-22 | **Change**: remove-deprecated-steering-command
**Reason**: The `prospec steering` command was removed. `module-map.yaml` generation is retained in `knowledge init` (the same `buildModuleMap`, an only-if-absent rerun-safe version); the unique `architecture.md` generation is deliberately dropped — its content is already scattered across `raw-scan.md`/`_index.md`/module READMEs, and the Architecture Layers table can also be reconstructed from `module-map.yaml`.

#### ~~REQ-SETUP-010: Scan Control~~
**Removed**: 2026-06-22 | **Change**: remove-deprecated-steering-command
**Reason**: The `prospec steering` command was removed. Scan controls such as `--dry-run`/`--depth`/sensitive-file exclusion already exist in `prospec knowledge init` (sharing the `parseDepth` validator and `config.exclude`).

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-02-04 | mvp-initial | CLI base framework, project initialization, architecture analysis | US-001~004, REQ-SETUP-001~010 |
| 2026-02-09 | configure-base-dir | Configurable Base Directory | US-005, REQ-SETUP-011~012 |
| 2026-03-02 | v2-product-first | Merged into a Feature Spec, added a first-time-use Story | US-006, REQ-SETUP-013 |
| 2026-06-04 | skill-alignment (PR #2) | init generates canonical convention docs | REQ-SETUP-004 (MODIFIED), REQ-SETUP-014 (ADDED) |
| 2026-06-06 | migrate-gemini-to-antigravity | init AI CLI detection Gemini→Antigravity (`~/.gemini/antigravity-cli`) | REQ-SETUP-006 (MODIFIED) |
| 2026-06-07 | make-constitution-executable | init produces guided Constitution rules with severities | US-007; REQ-TYPES-021, REQ-LIB-012, REQ-SERVICES-026, REQ-TEMPLATES-062, REQ-TESTS-021 |
| 2026-06-11 | add-init-language-policy | init language selection + Language Policy seed; English CLI output | US-008~009; REQ-SETUP-015~016, REQ-TYPES-025, REQ-LIB-013 |
| 2026-06-15 | add-quickstart-command | prospec quickstart one-command launch (init+agent-sync orchestrator, finished on the agent side by /prospec-quickstart) | US-010; REQ-SETUP-017, REQ-SERVICES-028 (ADDED) |
| 2026-06-22 | fix-init-clobber-add-upgrade | init per-file idempotency guard + version=prospec-version + prospec upgrade CLI | US-011/012; REQ-SETUP-018/019, REQ-TYPES-037/036, REQ-SERVICES-035 (ADDED), REQ-SETUP-004 (MODIFIED) |
| 2026-06-22 | preserve-agent-config-edits | init's `AGENTS.md` switched to a managed merge (existing content migrated into the `prospec:user` section, a stub into auto); trust-zone keeps skip-if-exists | REQ-SETUP-018 (MODIFIED) |
| 2026-06-22 | remove-deprecated-steering-command | Removed the deprecated `prospec steering` command and its exclusive dead code; retired architecture.md generation and .prospec.yaml per-module paths write-back (deliberately dropped) | US-004 (REMOVED); REQ-SETUP-008/009/010 (REMOVED) |
| 2026-06-27 | upgrade-config-nudges | upgrade interactively fills in missing curated settings (nudge registry + `--no-interactive`), writeConfig in-place merge preserves comments; corrected the canonical-rewrite wording of REQ-SETUP-019/SERVICES-035 | US-013/014 (ADDED); REQ-SETUP-020/021, REQ-LIB-022 (ADDED); REQ-SETUP-019, REQ-SERVICES-035 (MODIFIED) |
| 2026-06-27 | upgrade-refresh-raw-scan | `prospec upgrade` best-effort refresh of `raw-scan.md` (deterministic, aligned with the new-version scanner); narrowed "does not write ai-knowledge docs" to "does not write curated docs" | REQ-SETUP-019, REQ-SERVICES-035 (MODIFIED) |
| 2026-07-02 | fix-upgrade-doc-coverage | Upgrade document coverage completion (issue #48): `INIT_DOC_REGISTRY` single source (root discriminator base/knowledge), upgrade report read-only docs inventory (actual location, `knowledge.base_path`-aware), init⇄registry equality drift protection | US-015/016 (ADDED); REQ-TYPES-038, REQ-SETUP-022, REQ-TESTS-036 (ADDED); REQ-SETUP-019, REQ-SERVICES-035 (MODIFIED) |
| 2026-07-02 | dedupe-init-doc-registry | Converged parallel duplication in the registry (review F2/F3): the user-managed list upgraded to `ConventionDocSource` pairs and derived via `asKnowledgeInitDoc`, the `InitDoc.context` discriminator field replaces template-path string matching; behavior byte-for-byte unchanged | REQ-TYPES-038 (MODIFIED, descriptive) |
| 2026-07-03 | add-init-project-readme | `prospec init` generates an in-project Prospec introduction README (issue #50): added `init/readme.md.hbs` and a standalone base entry in `INIT_DOC_REGISTRY` (README.md); init create + upgrade docs inventory cover it automatically | US-003; REQ-SETUP-023 (ADDED); REQ-SETUP-004 (MODIFIED) |
| 2026-07-03 | upgrade-create-missing-docs | prospec upgrade directly creates missing init docs (render-from-template, skip-if-exists, best-effort); shared `lib/init-docs` helper; skill Step 2 shifts to fill-in + format migration | US-017; REQ-SETUP-024/TYPES-051/LIB-023/SERVICES-061/TEMPLATES-124/TESTS-037 (ADDED); REQ-SETUP-019/SERVICES-035/SETUP-022 (MODIFIED) |
| 2026-07-12 | emit-trigger-scaffold | `prospec config example` (complete per-field-annotated .prospec.yaml example, INIT_COMMANDS); cleaned up config schema dead fields + `.passthrough()`→`.loose()` | US-018/019 (ADDED); REQ-CLI-021, REQ-TYPES-062, REQ-TESTS-051 (ADDED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
