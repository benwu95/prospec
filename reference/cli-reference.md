# Prospec CLI Reference

> The exhaustive command, configuration, layout and architecture detail for
> [prospec](../README.md). The root README keeps the onboarding narrative; this file
> keeps the reference tables. [繁體中文](./cli-reference.zh-TW.md)

## Contents

- [Generated project layout](#generated-project-layout)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [Architecture](#architecture)

---

## Generated project layout

```
your-project/
├── .prospec.yaml              # Prospec config
├── CLAUDE.md                  # Claude Code config (Layer 0, <100 lines)
├── AGENTS.md                  # Antigravity / Codex / Copilot config (agents.md standard)
├── {base_dir}/
│   ├── README.md              # Short Prospec intro for this project's readers
│   ├── CONSTITUTION.md        # Project rules (user-defined)
│   ├── index.md               # AI Entry Point & Module index (Markdown table)
│   ├── specs/
│   │   ├── product.md         # Product Spec (PRD entry point)
│   │   └── features/          # Living Feature Specs (accumulated)
│   └── ai-knowledge/
│       ├── _conventions.md    # Project conventions
│       ├── _playbook.md       # Team lessons promoted by prospec-learn (human-gated)
│       ├── _lessons-ledger.md # Accumulating lessons ledger, auto-fed at Archive (version-controlled)
│       ├── raw-scan.md        # Auto-generated project scan data
│       ├── module-map.yaml    # Module dependencies
│       ├── feature-map.yaml   # Feature→module index (optional; bootstrapped at Archive)
│       └── modules/
│           └── {module}/
│               └── README.md  # Module-specific docs
├── .prospec/                  # Change management (not committed)
│   ├── changes/
│   │   └── {change-name}/
│   │       ├── proposal.md        # User Story + acceptance criteria
│   │       ├── design-spec.md     # Visual spec (optional, UI changes)
│   │       ├── interaction-spec.md # Interaction spec (optional)
│   │       ├── plan.md            # Implementation plan
│   │       ├── tasks.md           # Task breakdown (checkbox format)
│   │       ├── delta-spec.md      # Patch Spec (ADDED/MODIFIED/REMOVED)
│   │       └── metadata.yaml      # Change lifecycle metadata
│   └── archive/               # Archived completed changes
├── .claude/skills/            # Skills for Claude Code (one dir per skill)
│   ├── prospec-explore/
│   ├── prospec-new-story/
│   ├── prospec-design/
│   ├── prospec-plan/
│   ├── prospec-tasks/
│   ├── prospec-ff/
│   ├── prospec-implement/
│   ├── prospec-review/
│   ├── prospec-verify/
│   ├── prospec-archive/
│   ├── prospec-learn/
│   ├── prospec-knowledge-generate/
│   ├── prospec-knowledge-update/
│   ├── prospec-backfill-spec/
│   ├── prospec-promote-backfill/
│   ├── prospec-quickstart/       # one-time onboarding finisher (on disk, excluded from entry config)
│   └── prospec-upgrade/          # version-upgrade finisher (on disk, excluded from entry config)
└── .agents/skills/            # Same skills, agents.md format (Antigravity / Codex / Copilot)
    └── prospec-*/
```

---

## CLI Commands

### Infrastructure Commands

| Command | Description |
|---------|-------------|
| `prospec quickstart [options]` | One-command onboarding: runs `init` + `agent sync`, then hands off to `prospec-quickstart` |
| `prospec upgrade [--cwd <dir>]` | After a version bump: record version in `.prospec.yaml`, re-run `agent sync`, and create missing init docs |
| `prospec init [options]` | Initialize Prospec project structure (sets language and agents) |
| `prospec knowledge init [options]` | Static project scan to generate `raw-scan.md` and module boundary skeletons |
| `prospec knowledge update [options]` | Mechanical incremental knowledge sync from `delta-spec.md` into `module-map` and `index.md` |
| `prospec knowledge verify <modules>` | Stamp `last_verified` for named modules in `module-map.yaml` for CI staleness checks |
| `prospec agent sync [--cli <name>]` | Sync AI agent configs and generate Skills across configured harnesses |
| `prospec agent triggers [--write <file>]` | Print ready-to-translate `skill_triggers` + `skill_exclusions` scaffold and optionally write back |
| `prospec config example` | Print complete annotated `.prospec.yaml` reference with example values |
| `prospec print-template <path>` | Print raw content of bundled template (offline, node-free) |

#### Infrastructure Commands Breakdown

- **`prospec quickstart [options]`**
  - **Purpose**: Fast, streamlined onboarding by chaining `init` and `agent sync`.
  - **Behavior**: Automatically runs initialization steps (skipping completed ones), then prompts to trigger `prospec-quickstart` in the AI agent for trigger localization and Knowledge generation.
  - **Options**: Accepts the same `--name`, `--agents`, `--language`, and `--trust-zone-language` options as `init`.

- **`prospec upgrade [--cwd <dir>]`**
  - **Purpose**: Deterministic project and template upgrade following a Prospec version bump.
  - **Behavior**:
    - Updates the `version` field in `.prospec.yaml` (merged in place, preserving comments and formatting).
    - Re-runs `agent sync` to align agent configurations and Skill templates with the latest release.
    - Scaffolds any missing init-created files from templates (`skip-if-exists`, never overwriting or reordering existing files).
    - Prints a migration report with a docs inventory, handing off to `prospec-upgrade` for consent-gated format migrations.
    - Marks each inventory line `[canonical]` (a whole-file canonical document) or `[canonical] [preserves-user-content]` (a canonical format wrapped around an authored user block — `_module-readme-conventions.md` and its Project Section Extensions registry, for instance). A `[preserves-user-content]` document is never replaced whole-file: a consented migration refreshes only its generated format and keeps your registered sections byte-for-byte, and a marker-less legacy document goes through a no-clobber migration diff — reported as blocked, and left unchanged, if that diff cannot preserve your block.

- **`prospec init [options]`**
  - **Purpose**: Initialize Prospec project structure and baseline configuration.
  - **Options**: `--language <lang>` (sets the change-artifact language, default English), `--trust-zone-language <lang>` (sets the trust-zone language and skips its prompt; interactive init asks only when the artifact language is non-English, defaulting to it; CI mode without the flag stays English), `--name <name>`, `--agents <list>`.

- **`prospec knowledge init [--depth <n>] [--dry-run] [--raw-scan-only]`**
  - **Purpose**: Statically scan project source code to generate structure snapshots and module skeletons.
  - **Behavior**:
    - Scans the repository to generate `raw-scan.md` and initial curated skeletons (`module-map.yaml`, `prospec/index.md`, `_conventions.md`, only if absent).
    - `--raw-scan-only`: Regenerates **only** `raw-scan.md` (deterministic, zero LLM, leaving curated files untouched) to refresh snapshots before `prospec-knowledge-generate`.

- **`prospec knowledge update [--change <name>] [--module <m>...]`**
  - **Purpose**: Incrementally sync knowledge boundaries from a change's `delta-spec.md` or named modules.
  - **Behavior**:
    - Regenerates the `prospec/index.md` auto block from `module-map.yaml`.
    - Creates skeleton READMEs for genuinely new modules and adds deprecation banners for removed ones.
    - Never rewrites existing README content (preserving authored knowledge) and reports a `README content pending` worklist.

- **`prospec knowledge verify <module>...`**
  - **Purpose**: Stamp `last_verified` timestamp for named modules in `module-map.yaml`.
  - **Behavior**: Records when module knowledge was confirmed current against its source code; used by CI and `prospec check` to detect stale documentation.

- **`prospec agent sync [--cli <name>]`**
  - **Purpose**: Synchronize AI agent configurations and generate Skills.
  - **Behavior**:
    - Writes `CLAUDE.md` and `.claude/skills/` for Claude Code.
    - Writes shared `AGENTS.md` and `.agents/skills/` for Antigravity, Codex, and GitHub Copilot.
    - Injects localized trigger words from `.prospec.yaml` `skill_triggers`.
    - Only refreshes `prospec:auto` sections in entry configs, preserving whatever is written in `prospec:user`.

- **`prospec agent triggers [--write <file>]`**
  - **Purpose**: Generate a ready-to-translate localization scaffold with two blocks — `skill_triggers` (invocation words) and `skill_exclusions` (short phrases naming what a skill is NOT for; rendered as a `Not for:` clause after the description) — listing only the skills still missing an entry in each; `--write` inserts the missing keys of both maps in one validated write.
  - **Behavior**:
    - Lists unlocalized skills with their English baselines (from `SKILL_DEFINITIONS`).
    - `--write <file>`: Safely inserts only missing keys back into `.prospec.yaml` without overwriting existing entries.

- **`prospec config example`**
  - **Purpose**: Output a fully annotated `.prospec.yaml` reference with comments and example values.

- **`prospec print-template <path>`**
  - **Purpose**: Output raw bundled template contents without requiring Node.js runtime execution.

#### Agent Configuration Layout & Safety

`prospec agent sync` writes entry configs and Skills for each enabled agent:
- **Claude Code** → `CLAUDE.md` + `.claude/skills/`
- **Antigravity / Codex / GitHub Copilot** → `AGENTS.md` + `.agents/skills/` (shared [agents.md](https://agents.md) open standard; written once when multiple agents are enabled)

Skills whose workflow depends on the harness — `prospec-review`, `prospec-verify`, `prospec-plan`, `prospec-tasks`, and `prospec-ff` — state what it can do (`can_spawn_subagent` / `can_worktree` / `can_background`) directly instead of asking the agent to guess at runtime. Because one `.agents/skills/` copy serves several agents, it declares the **intersection** of their capabilities — never promising what one cannot do.

> [!NOTE]
> **Editing Safety**: Entry configs carry `prospec:auto` and `prospec:user` blocks. `agent sync` (and `init` on `AGENTS.md`) only refreshes the `auto` block and preserves whatever you write in the `user` block; existing hand-written `CLAUDE.md` / `AGENTS.md` files are migrated into the `user` block on first sync rather than overwritten.

#### Project-scan language support

`prospec knowledge init` (incl. `--raw-scan-only`) detects the following into `raw-scan.md`. Detection is deterministic (no LLM, no network) and best-effort; coverage differs by section:

| Language | Tech Stack | Dependencies | Entry Points | Config Files |
|----------|:---:|:---:|:---:|:---:|
| JavaScript / TypeScript | ✅ (+ framework) | ✅ `package.json` | ✅ | ✅ |
| Python | ✅ | ✅ `pyproject.toml` / `requirements.txt` | ✅ | ✅ |
| Go | ✅ | ✅ `go.mod` | ✅ | ✅ |
| Rust | ✅ | ✅ `Cargo.toml` | ✅ | ✅ |
| Java / Kotlin | ✅ Maven / Gradle | ✅ `pom.xml` ¹ | ✅ | ✅ |
| C# | ✅ | ✅ `*.csproj` | ✅ | ✅ |
| Ruby | ✅ | — ² | ✅ | ✅ |
| PHP | ✅ | ✅ `composer.json` | — | ✅ |
| C | ✅ ³ | ✅ `vcpkg.json` / `conanfile.txt` ⁴ | ✅ | ✅ |
| C++ | ✅ ³ | ✅ `vcpkg.json` / `conanfile.txt` ⁴ | ✅ | ✅ |
| Swift | ✅ `Package.swift` | — ⁵ | ✅ | ✅ |

¹ Java dependencies are read from Maven `pom.xml` only — the Gradle Groovy/Kotlin DSL is not statically parsed. ² Ruby dependencies are not parsed (`Gemfile` is a Ruby DSL). ³ C vs C++ is inferred from source-file extensions; set `tech_stack` in `.prospec.yaml` to override. ⁴ C/C++ dependencies are read from declarative manifests only — `CMakeLists.txt` and `conanfile.py` are imperative and not parsed. ⁵ Swift dependencies are not parsed (`Package.swift` is imperative Swift). Any unrecognized language still appears in the Directory Tree and File Stats sections — and, because an unlisted extension counts as source, its code directories stay OUT of Directories Without Source Files.

**Directories the scan cannot classify as code.** `raw-scan.md` also carries a `Directories Without Source Files` section: each topmost directory in which no file counts as source — the module detector requires a file to carry an extension AND for that extension not to be on its non-source denylist, so a directory whose only content is extensionless files (a `bin/` of scripts) lands here too. Root-level files belong to no directory and are never listed. It is a scan fact, not a detection verdict: a curated `module-map.yaml` (which detection always prefers) or the no-module fallback can still make such a directory a module. The section is the evidence `prospec-knowledge-generate` weighs when deciding whether one of them — a `manifests/` of Kubernetes YAML, a `chapters/` of LaTeX — is really this project's substance and belongs in `module-map.yaml`.

**A language outside this table?** It still scans — the Directory Tree and File Stats sections are always populated, and `prospec-knowledge-generate` reads the source directly. The Tech Stack line falls back to `unknown`; declare it authoritatively in `.prospec.yaml` `tech_stack` (free-form — it overrides auto-detection and is reported with `Source: config`):

```yaml
tech_stack:
  language: zig
  package_manager: zig build
```

Entry Points, Dependencies, and Config Files have no per-language override — they stay empty for an unrecognized language until detection patterns are added (the scan never invents them).

### Change Management Commands

#### Lifecycle & Scaffolding Commands

| Command | Description |
|---------|-------------|
| `prospec status [--json]` | Read-only check of in-flight changes, lifecycle station, next steps, blocking gates, and unresolved `quality_log` WARNs; each `reason:` line carries a stable `[CODE]`. On a clean workspace, reports the drift report's state. `--json` emits the full report to stdout |
| `prospec change story <name> [options]` | Create change story scaffold (`proposal.md` + `metadata.yaml`) |
| `prospec change plan [--change <name>] [--force]` | Create technical implementation plan scaffold (`plan.md` + `delta-spec.md`) |
| `prospec change tasks [--change <name>] [--force]` | Create task checklist scaffold (`tasks.md`) |
| `prospec change auto-draft [options]` | Scaffold fix changes from drift findings (or an explicit `--target`) without hand-copying the report |
| `prospec spec show <feature> [options]` | Read-only targeted REQ or Story slice from Feature Specs for token efficiency |
| `prospec archive <name...> [--dry-run]` | Archive verified changes: move directory, generate summary, and mechanically sync specs |
| `prospec archive finalize <name> [--dry-run]` | Post-archive finalization: copy final summary to audit trail and reconcile spec counters |

#### State, Tracking & Validation Commands

| Command | Description |
|---------|-------------|
| `prospec change scale <scale> [--change <name>]` | Set complexity scale (`quick` / `standard` / `full` / `backfill`) |
| `prospec change status <to> [--change <name>]` | Forward-only lifecycle transition (refuses backward or invalid transitions) |
| `prospec change progress [options]` | Calculate code-task progress (excluding `[M]` / `[V]`) and flip checkboxes |
| `prospec change log [options]` | Append structured `quality_log` entry in `metadata.yaml`; `--verifier-report <file>` records a validated plan/tasks verifier report (`FLAWS` → `FAIL`) |
| `prospec review merge --findings <file> [options]` | Merge review JSON findings into cumulative `review.md` table |
| `prospec verify record [options]` | Compute S/A/B/C/D grade from machine/judgment dimensions and advance to verified |
| `prospec learn upsert --lesson <file> [options]` | Idempotent lesson ledger upsert and evaluate promotion rules |
| `prospec learn yield [options]` | Calculate lens yield statistics and retirement recommendations from archived reviews |
| `prospec validate <kind> [target] [options]` | Machine validation of artifact structural integrity (exits 1 on failure) |

#### Change Management Commands Breakdown

- **`prospec status`**
  - **Purpose**: Read-only deterministic routing for all active in-flight changes.
  - **Key Details**:
    - Reports current lifecycle node, suggested next station, blocking gates, and specific reasons.
    - Supports scale-specific routes (`quick` skipping plan to tasks, `backfill` entering at promote).
    - Displays registered `issue` trackers; reports malformed metadata per change without crashing.
    - Lists each change's unresolved `quality_log` WARNs under `warn:` — the latest entry per skill still at WARN — so a station's Entry Gate surfaces prior warnings without re-reading the log itself.
    - Names the next station's canonical Skill under `action:` — `invoke skill prospec-<name>`, loaded the way the running host loads skills. The identity is present for every non-terminal route, including one whose project configures no agent, because it does not depend on a deployment root.
    - Prints the resolved skill file under `fallback:` — the file to read when the host has no skill mechanism, or when that mechanism is unavailable. Absent for a terminal route or a project with no configured agent; never a hardcoded skills directory. `status` states no host capability of its own: which route applies is declared per host in the generated entry config's Station Transition Protocol.
    - Prints the next station's reference map under `read:` — each load point that station reaches, the deployed path to read, why, and any condition `status` cannot decide. Filtered by the change's known scale and UI scope, resolved under the same configured host the `fallback:` line names; absent for a terminal route or a project with no configured agent, empty for a station that ships no reference. A station's instructions arriving never implies its references arrived.
    - `--json` emits the whole status report (including each change's `nextSkill`, `unresolvedWarnings` and `nextReferenceMap`) to stdout for machine consumption.
    - With nothing in flight, reads `prospec-report.json` and reports its STATE: how many findings `--auto-draft` would draft, or that the report is unreadable or was generated against different code (compared by `change_digest`). A report it cannot trust is reported as such, never as an absence of drift.

- **`prospec change story <name> [options]`**
  - **Purpose**: Scaffold a new change directory with `proposal.md` and `metadata.yaml` (`status: story`).
  - **Options**:
    - `--description <d>`: One-line summary of the change.
    - `--related-module <m>...`: Explicitly associate modules (overrides auto-matching).
    - `--issue <ref>`: Register associated Issue / Ticket tracking identifier.
    - `--introduced-by <c>`: Record introducing change source (for escaped-defect analysis).

- **`prospec change plan [--change <name>] [--force]`**
  - **Purpose**: Scaffold `plan.md` and `delta-spec.md`, advancing status to `plan`.
  - **Safety Rules**: Refuses to overwrite existing files unless `--force` is passed; refuses outright for scales where plans are forbidden (`quick` routes to `change tasks`, `backfill` to `prospec-promote-backfill`).

- **`prospec change tasks [--change <name>] [--force]`**
  - **Purpose**: Scaffold `tasks.md`, advancing status to `tasks`.
  - **Key Details**: `quick` changes decompose directly from `proposal.md` (`story → tasks`); refuses to overwrite without `--force`; rejected for `backfill`.

- **`prospec spec show <feature> [--req <ids>] [--story <ids>]`**
  - **Purpose**: Read-only, targeted slice reading of Feature Specs (token-efficient reading).
  - **Key Details**:
    - `--req <ids>`: Quotes only specified requirement IDs (comma-separated or repeated).
    - `--story <ids>`: Quotes complete User Story blocks.
    - Prints full spec when no selector is given; exits 1 on unmatched selectors to prevent false "unspecified" assumptions.
    - Used by verify and archive stations to avoid loading entire multi-thousand-token specifications.

- **`prospec archive <name...> [--dry-run]`**
  - **Purpose**: Execute deterministic archiving mutations for verified changes.
  - **Behavior**:
    - Moves change directory to `.prospec/archive/{date}-{name}/`, generates summary scaffold, and sets `status: archived`.
    - Performs mechanical Feature Spec sync: merges delta-spec `**Spec:**` blocks into feature specs and emits two worklists on stderr (kept bodies requiring convergence, and replaced bodies omitting prior bullets).
    - Syncs `product.md` `## Feature Map` (refusing safely on ambiguous headers, unclosed code blocks, or missing directories).
    - `--dry-run`: Previews all planned file modifications without writing; exits 1 if change is not verified.

- **`prospec archive finalize <name> [--dry-run]`**
  - **Purpose**: Post-judgment archive finalization (runs after human summary edits and REQ convergence).
  - **Key Details**:
    - Copies finalized `summary.md` to `specs/_archived-history/` for version-controlled audit trails.
    - Reconciles `story_count` and `req_count` in feature spec frontmatter against final spec bodies.
    - Refuses to execute if `summary.md` is still an unmodified template scaffold.

- **`prospec change scale <quick|standard|full|backfill> [--change <name>]`**
  - **Purpose**: Write user-confirmed complexity scale to `metadata.yaml` (in-place edit preserving comments).

- **`prospec change status <to> [--change <name>]`**
  - **Purpose**: Forward-only lifecycle state advancement (refuses illegal jumps and lists valid targets).
  - **Test gate on `implemented`**: besides every code task being checked, the change needs a fresh green `test_attempt` — the latest attempt passed with exit 0, linked to its `test_provenance`, against the current snapshot. Missing, stale, running or failing evidence is refused (exit 1) with the remediation `prospec check --record-tests --change <name>`, metadata untouched. Two explicit exemptions advance with a `tests: not-adjudicated` WARN (producer `prospec-test-gate`, deduplicated per entrance and reason, written in the same metadata write as the status): no resolvable test command, or a proven backfill (`backfill-draft.md` present). A known non-zero failure is never exempt; `scale: backfill` alone buys nothing.

- **`prospec change log --skill <station> (--result <PASS|WARN|FAIL> | --verifier-report <file>) [options]`**
  - **Purpose**: Append a structured `quality_log` entry in `metadata.yaml`.
  - **Options**: Supports `--warning <w>`, `--grade <g>`, `--dimension n=r`, `--criticals-found <n>` with canonical key ordering; free text is serialized as YAML data by the yaml library (quoted only when YAML requires it), so metacharacters cannot corrupt the file; this command writes YAML, not a Markdown table, so no table escaping applies. For `prospec-review`, `--criticals-found`, `--criticals-fixed`, and `--majors` are treated as expected-value audit inputs rather than direct writes: any mismatch against the CLI-owned counts recorded by `review merge` appends a `log_mismatch` warning and coerces the result to at least `WARN` without overwriting the recorded counts, and the appended close entry carries no count fields.
  - **`--verifier-report <file>`** (plan/tasks stations): validates the Architecture/Task Verifier JSON report against the rubric-owned schema (verdict `PASS` | `WARN` | `FLAWS`, exactly the owning dimensions, single-line bounded `rationale`/`warnings`) and records it — `FLAWS` lands as `result: FAIL`, an invalid payload is refused before any write. Mutually exclusive with `--result` and the composed-entry fields. `prospec status` routes a station whose latest recorded verifier result is `FAIL` back to that station until a later verifier `PASS` or `WARN`, or a Break-Glass `--result WARN --warning "Manual override: …"`, supersedes it.

- **`prospec change progress [--complete <task>] [--change <name>]`**
  - **Purpose**: Track and update code-task progress in `tasks.md`.
  - **Key Details**:
    - Reports ratio (X/Y, automatically excluding `[M]` manual and `[V]` verification tasks) and next task.
    - `--complete <task>`: Toggles exactly one specified task checkbox.

- **`prospec review merge --findings <file> [--round <n>] [--spend <tokens>] [--budget <tokens>] [--max-fix-induced-ratio <r>] [--max-rounds <n>] [--max-flips <n>] [--lenses <list>] [--change <name>]`**
  - **Purpose**: Merge review round JSON findings into cumulative `review.md` table.
  - **Escaping**: inside a table cell `|` is written as `\|` and a newline is flattened to a space; identity is the finding `id`, never the location text; the success output adds one line when at least one cell was escaped.
  - **Key Details**: Deduplicates by identity key, stamps each finding's `Origin` round, keeps maximum severity, preserves findings across rounds, tracks cumulative token spend, records invoked lenses, and evaluates the dual-axis circuit breaker (fix-induced ratio / spend budget / oscillation flips / hard cap) to emit an EscalationReport when tripped. On each merge, the CLI automatically writes or updates the round's `quality_log` counts entry (`criticals_found`, `criticals_fixed`, `majors`, `round`) in `metadata.yaml` (idempotent by round number). When the cumulative findings table has 0 rows (a clean review round), the CLI also automatically injects an artifact-language clean review sentence into `review.md`.
  - **Test gate**: after the input and round-sequence refusals (which write nothing), every merge requires the change's fresh green `test_attempt` or one of the two explicit exemptions (no resolvable test command, proven backfill), which merge with a `tests: not-adjudicated` WARN. A test refusal exits 1 with `prospec check --record-tests --change <name>`; its ONLY permitted write is the bounded test-failure metrics (`test_failures`, `test_failure_ids`) inside `review.md`'s metrics comment — never a findings merge or round advance. The count is of the distinct failed attempts review merge itself observed (a replayed attempt id never counts twice, a fresh green resets it, an exemption or loop rollover does not); at the default threshold of 3 the refusal also reports `persistent_test_failure` with `ESCALATE_TO_HUMAN`. No threshold flag exists. A malformed or duplicate metrics comment is refused before any write.

- **`prospec verify record --dimension <name>=<result>... | --dimensions <file> [options]`**
  - **Purpose**: Calculate verification grade (S/A/B/C/D) and record structured verification log.
  - **Key Details**: Machine dimensions are self-sourced from `prospec-report.json`, judgment dimensions from CLI flags or JSON; advances status to `verified` on S or A grade.

- **`prospec learn upsert --lesson <file> [--today <date>]`**
  - **Purpose**: Idempotently upsert lessons into `_lessons-ledger.md`.
  - **Escaping**: inside a table cell `|` is written as `\|` and a newline is flattened to a space; identity is the ledger `key`, never the description text; the success output adds one line when at least one cell was escaped.
  - **Key Details**: Evaluates `freq ≥ 3 ∧ modules ≥ 2` promotion rule for playbook promotion and checks playbook TTL validity.

- **`prospec learn yield [--consecutive-zero <n>] [--min-invocations <n>] [--min-yield <ratio>] [--corpus <dir>] [--json]`**
  - **Purpose**: Calculate confirmed yield statistics per review lens and recommend retirements from archived reviews.
  - **Key Details**: Tracks consecutive zero-yield changes and yield ratio per lens; outputs recommendations (`keep`, `review`, `retire`).

- **`prospec validate <kind> [target] [--change <name>]`**
  - **Purpose**: Machine validation of artifact structural integrity (`slug`, `promote-scaffold`, `backfill-draft`, `design-spec`, `module-readme`). `module-readme` validates a module's README against its canonical Markdown convention. Exits 1 on failure.

> [!IMPORTANT]
> **Deterministic Execution Layer**: These change management commands serve as the deterministic core of the workflow (issue #107). Skills (`prospec-new-story`, `prospec-ff`, etc.) delegate every scaffold, status transition, and audit record to the CLI rather than authoring raw bookkeeping artifacts. If the CLI binary is missing or below the version probe threshold, the Skill halts (STOP). All commands can also be run manually or scripted in CI/CD.

### MCP Server

A **read-only**, stdio MCP server that exposes the project's truth — architecture, specs, dependency direction, promoted playbook, and knowledge freshness — to any MCP-capable agent, even one without Prospec Skills installed.

| Command | Description |
|---------|-------------|
| `prospec mcp serve [--cwd <path>]` | Start a **read-only** MCP server on stdio — any MCP-capable agent (even one without Prospec Skills installed) can query the project's architecture truth, spec truth, dependency direction, promoted playbook, and knowledge freshness. `--cwd` pins the project root so one agent can run several project servers regardless of where it was launched |

**Resources** (re-read from disk on every request — clients always see current file state):

| URI | Content |
|-----|---------|
| `knowledge://index` | AI Knowledge module index (`prospec/index.md`) |
| `knowledge://module/{name}` | One module's Recipe-First README plus each sub-module linked from its `## Sub-Modules` section (the whole L2 module knowledge) |
| `knowledge://module-map` | Module boundaries + `depends_on` (`module-map.yaml`) |
| `knowledge://feature-map` | feature → module index + REQ prefixes (`feature-map.yaml`) |
| `knowledge://playbook` | Human-approved team lessons (`_playbook.md`) |
| `knowledge://health` | Per-module staleness + coverage — same pure function as `prospec check` |
| `spec://product` | Product spec — PRD entry point + feature map (`product.md`) |
| `spec://feature/{name}` | Feature specs (REQ source of truth); archived specs are excluded by the same rule `prospec check` uses |

**Tools**: `search_modules` (which module owns a concept — normalized term-OR match over the curated
index columns, so `drift checker` finds `drift-checker`), `get_dependency_direction` (may `from`
import `to`? — answered from module-map `depends_on`, or the Constitution chain when no map exists;
the answer states which source it used), and `get_spec_requirements` (quote just the requirements a
change touches, by REQ id or story, instead of reading a whole Feature Spec — the same narrow read
`prospec spec show` serves; a parameterized query is a tool because a resource template cannot carry
an optional one, and it refuses a call with no selector rather than answering with an empty set).

**Registering** — point your agent's MCP config at `prospec mcp serve --cwd <project-root>`. `--cwd`
pins the project so the server resolves its `.prospec.yaml` no matter where the agent was launched —
which also lets one agent register several projects at once. Assumes the recommended global install
(`prospec` on PATH).

Claude Code:

```bash
claude mcp add project-name -- prospec mcp serve --cwd /path/to/project
```

Other agents — the same command in the agent's JSON MCP config:

```json
{
  "mcpServers": {
    "project-name": {
      "command": "prospec",
      "args": ["mcp", "serve", "--cwd", "/path/to/project"]
    }
  }
}
```

To serve several projects from any directory, register one entry per project — each with a unique
name and its own `--cwd` (Claude Code: add `-s user` so it's available everywhere):

```bash
claude mcp add -s user prospec-a -- prospec mcp serve --cwd /path/to/A
claude mcp add -s user prospec-b -- prospec mcp serve --cwd /path/to/B
```

Pinned prospec as a devDependency rather than installed globally? Route through `npx`: prefix the
Claude Code command (`… -- npx prospec mcp serve --cwd /path/to/project`), or in JSON set
`"command": "npx"` with `"prospec"` as the first arg (`["prospec", "mcp", "serve", "--cwd", "/path/to/project"]`).

Honest boundaries: the server is read-only (no tool or resource can modify files), serves one project
per process (the root given by `--cwd`), and is a pure add-on — no Skill or CLI command depends on it,
so everything works unchanged when it is not running. Transport is stdio only; HTTP/SSE is
deliberately not included in this version.

### Drift Check (CI Gate)

| Command | Description |
|---------|-------------|
| `prospec check [--json] [--strict]` | Zero-LLM deterministic check: verify specs, code, dependencies, and knowledge integrity |
| `prospec check --record-tests [options]` | Run test suite and record command, exit code, and digest into `metadata.yaml` |
| `prospec check --record-review [options]` | Record code digest and `delta-spec.md` fingerprint as review baseline |
| `prospec check --escaped-defects [options]` | Report aggregate escaped-defect rates across lifecycle gates |
| `prospec check --init-ci` | Scaffold hardened GitHub Actions CI workflow (`.github/workflows/prospec-check.yml`) |
| `prospec check --auto-draft [--auto-draft-dry-run]` | After reporting, scaffold a fix change per finding group (never overwrites; a drafting failure never changes the check's own exit code, but combining the flag with a non-check mode is refused up front) |

#### Drift Check Commands Breakdown

- **`prospec check [--json] [--strict]`**
  - **Purpose**: Zero-token machine verification of reference integrity and architectural boundaries across spec ↔ code ↔ knowledge.
  - **Audit Dimensions**:
    - **Specs & Links**: Dangling REQ references, REQ id uniqueness across Feature Specs (`req-id-uniqueness`, FAIL), broken Markdown links, Feature Spec frontmatter count reconciliation (`story_count`/`req_count`).
    - **Architecture & Dependencies**: Import directions enforced by `module-map.yaml`, REQ-prefix legality (WARN), feature→module boundaries (FAIL).
    - **Knowledge Health**: Module freshness (`last_verified` vs source commit, WARN), token and line size budgets (`knowledge-size`, WARN), README declared resource counts (WARN).
    - **Review & Test Provenance**:
      - `review-provenance`: Implemented or verified changes must have a recorded review matching the current code.
      - `test-provenance`: Changes must have a recorded current, passing (green) test run.
      - `delta-spec-provenance`: Change's `delta-spec.md` fingerprint must match the recorded review baseline.
      - `delta-spec-landing-fidelity`: A MODIFIED delta-spec `**Spec:**` landing block must not drop an authored trust-zone `WHEN/THEN` bullet without declaring it under `**Dropped:**` (FAIL) — surfaces the loss at every check, sharing the archive write path's comparison, not only at archive after the commit.
    - **Governance**: RFC-2119 tags on Constitution principles (WARN), artifact language consistency (`artifact-language`, WARN), justification comments on budget overrides and shipped budget keys that bind nothing (`unjustified-budget-override`, WARN), canonical doc drift (`canonical-doc-drift`, WARN), Constitution Language Policy vs. resolved language scope (`language-policy-drift`, WARN).
    - **Skill Deployment**: `skill-reference-map` (FAIL) compares every configured host's deployed skills against the station reference registry — a load point that no longer cites its reference, a registered reference that was never deployed, and a deployed reference no load point claims. A missing configured host directory also fails. The remedy is `prospec agent sync` from a prospec version matching the deployment. No configured agent, or an unreadable host root without another proven failure, yields skipped with a reason; a readable host cannot certify an unreadable one, and known failures retain FAIL.
  - **Execution & Exit Codes**:
    - `--json`: Outputs machine-readable `prospec-report.json`.
    - `--strict`: Exits 1 on any FAIL (WARN and SKIPPED never affect exit codes). `--auto-draft` cannot change this: drafting runs after the report is written and a drafting failure is reported, never thrown.
    - `--auto-draft` is REFUSED (exit 1, nothing written) alongside `--init-ci` / `--record-review` / `--record-tests` / `--escaped-defects`, which all return before any drift check runs, and `--auto-draft-dry-run` is refused without `--auto-draft` — a flag that cannot be honoured is rejected rather than silently ignored.
    - Unavailable inputs degrade to `skipped` with explicit reasons, never fabricating a PASS; known missing required deployment files remain FAIL.

- **`prospec change auto-draft [--from-report [file]] [--target <name>] [--reason <text>] [--check <id>] [--scale <scale>] [--issue <ref>] [--dry-run]`**
  - **Purpose**: Turn drift findings into change scaffolds so an agent can start fixing without transcribing the report. Also available as `prospec check --auto-draft`, which drafts from the run it just reported.
  - **Grouping**: One change per `<target>:<check>` pair, named `fix-<target>-<check>` — with a short stable suffix when the target does not survive slugging unchanged, so two different targets can never land on one directory. The target comes from `module-map.yaml` attribution and the configured `knowledge.base_path` / `paths.base_dir` — never a guessed path shape. A finding under a feature spec groups under that feature's name; one that maps to neither a module nor a feature groups under `general`. Only a name `module-map.yaml` declares is written to `related_modules` — a feature name and `general` are subjects, not modules.
  - **Scope**: two kinds of finding are not drafted — `knowledge-size` findings in the `headroom` (pressure) tier (budget pressure, not a violation), and findings whose `source_path` is under `.prospec/` (SDD process gates ON a change, so drafting one would create a change whose job is another change's paperwork). Nothing else is dropped.
  - **Safety**: Creation goes through the same service as `prospec change story`, so an existing change directory is skipped, never overwritten, and a run is idempotent. `--dry-run` reports what would be drafted and writes nothing at all (on `check` the flag is `--auto-draft-dry-run`, because `check`'s other writes are unaffected by it).
  - **Requires**: exactly one drift source. With none of `--from-report` / `--target` / `--reason` / `--check`, the command exits non-zero rather than reporting a clean verdict; combining a report source with an explicit target is refused rather than silently dropping one.

- **`prospec check --record-tests [--change <name>]`**
  - **Purpose**: Runs project test suite and records `{command, exit_code, digest, date}` in change's `metadata.yaml`.
  - **Key Details**:
    - Serves as the objective oracle for `prospec-verify` test dimension, preventing agent hallucination.
    - Executed via argv directly without shell; degrades to `skipped` when unable to execute honestly.
    - Previously recorded non-zero exit codes remain FAIL even if command subsequently becomes unresolvable.

- **`prospec check --record-review [--change <name>]`**
  - **Purpose**: Records code digest and `delta-spec.md` fingerprint to satisfy `review-provenance` and `delta-spec-provenance`.

- **`prospec check --escaped-defects [--json]`**
  - **Purpose**: Aggregates escaped-defect metrics grouped by `introduced_by` (reporting mode, no findings, does not affect `--strict`).

- **`prospec check --init-ci`**
  - **Purpose**: Scaffolds supply-chain-hardened GitHub Actions CI gate (`.github/workflows/prospec-check.yml`) with SHA pinning, least privilege, and sticky PR comments.

#### Review and test evidence

Evidence connects a recorded review or test result to the repository contents it checked, so Prospec can tell whether an earlier PASS still applies.

- Finish Knowledge, factual-count and generated-asset sync before the final review → tests → verify sequence.
- Staging, committing or amending without changing input contents preserves evidence. Changes to code, manifests, lockfiles, docs or tracked generated files require revalidation.
- A passing test record requires exit code 0 and provably equal input snapshots before and after execution. A running or uncertified latest attempt cannot reuse an old PASS; a known failure remains until a stable successful run.
- Legacy records remain readable, but need one real review and test revalidation.
- Verify/archive assess current inputs and workflow facts, then recheck before writing; archive dry-run uses the same refusal conditions. A saved report alone does not authorize the operation.

The evidence format is `snapshot-v2` / `repository-inputs-v2`; see the [input snapshot specification](../prospec/specs/features/drift-detection/us-5.md) for the precise scope and supported file types. Ignore test outputs in Git (tracked outputs still count as inputs). Unsupported or unreadable inputs remain unprovable. The before/after checks cannot detect every transient change-and-restore, or changes to ignored dependencies, external services and toolchains outside repository inputs.

#### Check results and verification decisions

Honesty rules: an unavailable source degrades the check to `skipped` with an explicit reason — never a fake PASS — and semantic spec↔code consistency stays with `prospec-review` (the report permanently marks it `not-checked`). `prospec-verify` consumes the same report at dev time, so the developer and the CI gate always see the same facts, token-free.

**Who decides what at verify** — the report is not advisory there. `prospec-verify`'s task-completion, Knowledge and test dimensions are **adjudicated by this engine**: verify adopts each check's status verbatim and may not re-grade it, so those three verdicts are reproducible with no LLM involved. The dimensions with no mechanical oracle — delta-spec compliance and design consistency — stay probabilistic and are graded in **fresh context** (an independent reviewer that did not write the code), while the Constitution audit is split: severities and the rule list come from the machine inventory, judging a violation stays human/LLM work. When the engine cannot run, those machine dimensions are reported `not-adjudicated` (never PASS) and grade S becomes unreachable.

#### Tuning the `knowledge-size` budgets

`knowledge-size` grades **every load surface an agent actually reads**, not just the module knowledge: L1 files, module READMEs and sub-modules, Feature Specs and `product.md`, the load-on-demand governance files, and — only where your project holds the skill template sources — every deployed `SKILL.md` and its references — hand-authored skills included, since the harness loads those too. Each per-project surface has its own threshold, overridable **per field** in `.prospec.yaml` `knowledge.token_budget`. Set only the fields you want to change; anything unset falls back to the default. The skill and reference budgets are the exception: they describe the skill files prospec itself generates, so they ship with the prospec version (12,500 / 2,500 tokens) and are not project settings — a key written for them binds nothing and `unjustified-budget-override` asks you to remove it:

```yaml
# .prospec.yaml
knowledge:
  token_budget:
    l1_per_file: 1800               # max tokens per L1 file (index.md + each core convention)
    l2_per_module: 1000             # max tokens per module file (README and each sub-module)
    readme_max_lines: 100           # max lines per module file
    spec_per_file: 5000             # max tokens per Feature Spec (and product.md)
    demand_knowledge_per_file: 10000 # max tokens per load-on-demand knowledge file
    headroom: 0.85                  # ratio of the budget at which the pressure signal triggers (0.85 = 85%)
```

A freshly initialized project's `.prospec.yaml` carries no `token_budget` block, so every threshold resolves from the shipped default above; run `prospec config example` for the fully annotated block to copy the fields you want to change. Over-budget files only WARN (a pressure signal against silent regrowth — never a build breaker, and never affecting `--strict`'s exit code), and each finding names the convergence path for its surface rather than a generic "please compress": slice a Feature Spec under `specs/features/{feature}/`, run `prospec-learn`'s Staleness Sweep on a governance file, extract a sub-module from an L2 file.

Two of these deserve their own note. **Feature Specs grow monotonically** — every archived change appends graduated REQs and nothing ever removes them — so the surface that dominates a mature project's load is the one that had no budget at all before; slices under `specs/features/{feature}/` are measured against the same `spec_per_file`, so splitting a spec cannot move it out of the budget's sight. **Skill files are measured only in authoring projects**, detected by the presence of the skill template sources: a project that merely consumes generated skills cannot act on a finding about one, and an unactionable WARN is exactly what this check exists to avoid.

<details>
<summary>Mutation testing (on-demand audit — NOT a gate)</summary>

| Command | Description |
|---------|-------------|
| `pnpm mutate <path>` | On-demand deep audit: run Stryker mutation testing and report mutation score and surviving mutants |

#### Mutation Testing Breakdown

- **`pnpm mutate <path>`**
  - **Purpose**: On-demand deep audit evaluating test suite effectiveness against subtle code mutations (not a CI gate).
  - **Characteristics & Cost**:
    - Execution cost is the product of static module-level mutants and the size of the dependent test suite.
    - `--ignoreStatic` provides substantial speedups for fast iteration but skips testing module-level constants.
    - Surviving mutants highlight potential test blind spots for human inspection.

</details>

### Token Measurement

| Command | Description |
|---------|-------------|
| `pnpm measure:tokens [options]` | Assemble contexts from live repo and record real provider API token usage and cost |
| `prospec measure [options]` | Parse local session logs for token measurements, or project context budget (zero API calls) |

#### Token Measurement Commands Breakdown

- **`pnpm measure:tokens [--provider <p>] [--budget <usd>] [--offline]`**
  - **Purpose**: Assembles full-dump / naive-rag / prospec contexts and measures real usage and cache hit rates via Provider APIs.
  - **Options**: `--provider` sets provider model; `--budget` sets cost cap (default US$10); `--offline` skips API calls and outputs char-based size estimate in `size-report.json`.

- **`prospec measure [--project-workflow <scale>] [--change <name>]`**
  Parses your local AI CLI session logs to display actual context usage and theoretical baseline savings. Also supports projecting the token floor for a workflow scale.

The harness makes the token-efficiency claim verifiable instead of asserted: for each corpus task (`tests/fixtures/token-corpus/`, version-controlled task **descriptions** only — contexts are assembled at run time) it sends each assembled context twice (cold + warm) and reads the provider's real `usage`.

**Agent → measured provider** (copilot/codex have no public benchmark API; they are measured via their model provider, not the agent harness itself):

| Agent | Provider API | Default model |
|-------|-------------|---------------|
| claude | Anthropic | `claude-haiku-4-5` |
| codex, copilot | OpenAI | `gpt-4.1-mini` |
| antigravity | Google | `gemini-2.5-flash` |

**How to read the numbers (honest boundaries):**

- The efficiency claim is **input-token cost vs the full-dump baseline**; the naive-rag baseline is always shown alongside, where the margin is smaller. Output tokens are unaffected and listed honestly.
- **warm\*** numbers are synthetic cache hits (two back-to-back calls); production hit rates depend on whether triggers land within the provider's cache TTL. Providers also enforce a minimum cacheable prefix (e.g. 4,096 tokens on `claude-haiku-4-5`) — a small prospec assembly below that floor honestly records a 0% hit rate even though the mechanism works at production context sizes.
- Cache discount structures differ per provider (Anthropic explicit `cache_control`, OpenAI/Gemini automatic prefix caching) — numbers are **comparable only within the same provider**, never across providers or repo snapshots (the report records the git commit it measured).
- No thresholds, no CI gating: the report informs humans; it does not pass or fail anything.
- Any "token saving" figure quoted in this project must come from this harness — estimates are not data.

---

---

## Configuration

Prospec can be configured via a `.prospec.yaml` file in the project root. This is the primary way to customize how AI Knowledge is generated and how the workflow operates.

Key configurations you can tweak:

- **`artifact_language`**: Sets the language for change artifacts under `.prospec/changes/` and their archived summaries (e.g. `Traditional Chinese (Taiwan)`). Code, identifiers, technical terms, and git commit messages always stay English; the trust zone follows `trust_zone_language`. `prospec init` seeds a path-scoped Language Policy rule into `CONSTITUTION.md` from the same paths and languages your agent's entry config (`CLAUDE.md`/`AGENTS.md`) renders, and `prospec check` (`language-policy-drift`) warns when the Constitution's Description drifts from them.
- **`trust_zone_language`**: Sets the language of the trust zone — the AI Knowledge base, `specs/features/`, `specs/product.md`, `index.md`, `README.md`, `CONSTITUTION.md`. Defaults to English when absent (the behavior every project had before the key existed). `prospec init` writes it: interactive init asks for it only when `artifact_language` is non-English, defaulting to that same language; `--trust-zone-language` sets it without a prompt, and CI mode (`--agents`) without the flag keeps English. Set it to the same value as `artifact_language` for a project whose whole documentation set is one language.
- **`exclude`**: Glob patterns for directories to exclude from AI knowledge scanning. Defaults include node_modules, .git, and common build directories.
- **`agents`**: Specifies which AI agent configs to generate (`claude`, `antigravity`, `codex`, `copilot`).
- **`tech_stack`**: Overrides auto-detected tech stack (e.g., `language: zig`, `package_manager: zig build`).
- **`knowledge.strategy`**: Determines how the project is split into modules during knowledge generation (`auto`, `architecture`, `domain`, `package`).
- **`knowledge.token_budget`**: Controls the per-file token/line limits `knowledge-size` grades, one per load surface — L1 files, L2 module knowledge, Feature Specs, load-on-demand knowledge, and (in skill-authoring projects) every deployed skill and its references, hand-authored ones included.
- **`knowledge.generated_artifacts`**: Paths (repo-relative) of files your build generates into the source tree. `knowledge-health` ignores their commit timestamps, so regenerating a bundle no longer reports every module that "changed" as stale. Unset means nothing is excluded — the check has no built-in idea of what your build emits.
- **`knowledge.additional_core_conventions`**: Prospec's knowledge system loads `_conventions.md` (and `CONSTITUTION.md`) by default when the Agent starts. If you have other globally shared convention files (e.g., API guidelines, security rules) that you want to be pre-loaded as Core Conventions, you can list them here. These paths are relative to the `ai-knowledge/` directory.
- **`skill_triggers`**: Allows customizing the activation keywords for specific AI Skills to match your native language.
- **`skill_exclusions`**: Same shape as `skill_triggers` — native-language phrases naming what a skill is NOT for; `prospec agent sync` renders them as a `Not for:` clause after the skill description (absent = no clause).

Example `.prospec.yaml` (for the full annotated reference of every field, run `prospec config example`):
```yaml
version: "1.0"
project:
  name: my-project
tech_stack:
  language: typescript
  package_manager: pnpm
paths:
  base_dir: prospec
artifact_language: Traditional Chinese (Taiwan)
exclude:
  - "*.env*"
  - "node_modules"
agents:
  - claude
  - antigravity
knowledge:
  base_path: prospec/ai-knowledge
  strategy: domain
  token_budget:
    l1_per_file: 1800
    l2_per_module: 1000
    readme_max_lines: 100
  additional_core_conventions:
    - my-custom-api-rules.md
skill_triggers:
  prospec-explore:
    - explore
    - 探索
skill_exclusions:
  prospec-review:
    - ad-hoc PR review
```

---

---

## Architecture

Prospec uses **Pragmatic Layered Architecture** for CLI development best practices:

```
src/
├── cli/          — Commander.js commands + formatters
├── services/     — Business logic (30 services)
├── lib/          — Pure utility functions (config, fs, logger, etc.)
├── types/        — Zod schemas + TypeScript types
└── templates/    — Handlebars templates (77 .hbs files)
    └── skills/   — 17 Skill templates + 30 reference templates
```

### Tech Stack

- **CLI Framework**: Commander.js 14 + @inquirer/prompts 8
- **Validation**: Zod 4
- **Templating**: Handlebars 4.7
- **File Scanning**: fast-glob 3.3
- **YAML**: eemeli/yaml 2.x (preserves comments)
- **Testing**: Vitest 4.0 + memfs
- **TypeScript**: 5.9

---
