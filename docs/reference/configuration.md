# Prospec Configuration Reference
[繁體中文](./configuration.zh-TW.md) • [Documentation](../README.md) • [CLI Reference](./cli-reference.md)

Configure Prospec through `.prospec.yaml` in the project root. The tables below cover every supported field; only `project.name` is required. Defaults describe runtime behavior when a field is omitted, not the example values written by setup commands. `prospec config example` prints the complete annotated YAML reference; see [Infrastructure Commands](./cli-reference.md#infrastructure-commands) for command usage.

Project commands warn about undefined field names at the top level of the configuration and inside `project`, `tech_stack`, `paths`, `test_evidence`, `knowledge`, `knowledge.token_budget` and `workflow`. These warnings alone do not stop a command. Extra top-level fields are accepted and preserved; undefined nested fields are removed from the parsed configuration. The checks do not inspect user-defined names in `skill_triggers` or `skill_exclusions`, the contents of `test_timeout_ms`, `pause_at` or `always_escalate`, or anything inside an undefined field.

Each warning names the full field path without displaying its value. For a possible typo, Prospec suggests a supported name in the same configuration section only when it is the single closest match and needs at most two character insertions, deletions or substitutions (case-sensitive Levenshtein distance ≤2). Ties and larger differences produce no suggestion. The check itself does not rename fields or rewrite the YAML file; after the warnings it suggests renaming or removing the fields. `prospec upgrade` rewrites the configuration and removes unknown nested fields, while extra top-level fields are kept.

After a command passes its required startup checks, it checks field names once in the configuration for its target directory. Warnings appear on stderr, even with `--quiet`; `--json` omits these extra messages, and MCP keeps stdout for its protocol. `init`, `config example`, `print-template`, help and version do not check for unknown fields; `quickstart` checks when a configuration already exists. If the file cannot be read or its YAML cannot be parsed, the warning check is skipped and the command handles the error as usual. This check only examines field names; configuration validity and filesystem paths remain subject to the command's existing checks. Calling `readConfig` or `validateConfig` directly does not print warnings.

## Project and paths

| Field | Type | Default / required | Description |
| --- | --- | --- | --- |
| `version` | string | Unset | Version last written by `prospec init` or `prospec upgrade`. Legacy `"1.0"` is treated as stale, not as the current version. |
| `project.name` | string | Required | Project name. |
| `paths.base_dir` | string | `prospec` | Artifact root for the Constitution, index, specs and the Knowledge directory (`{paths.base_dir}/ai-knowledge`). Must be a single directory name beside `.prospec.yaml` — not empty, `.` or `..`, and without `/`, `\`, NUL or a drive prefix such as `C:`. It, `{paths.base_dir}/specs` and `{paths.base_dir}/ai-knowledge` must be ordinary directories, not symlinks, when they exist. |
| `exclude` | string[] | `[]` | Additional project-file exclusions for raw scans, new-module README skeletons and import scanning, interpreted with module-path rules. Built-in sensitive-file exclusions still apply. |

Project-file listing starts from git index members; add new files with `git add` before scanning. Untracked and ignored files outside the index are absent, but tracked dependency/build files, dot-directory files and deep files can appear. Symlinks are not followed and submodule gitlinks are not expanded. Sensitive patterns such as environment files, credentials, secrets, keys and certificates are always excluded; an empty `exclude` does not disable them. There is no automatic dependency/build-directory exclusion for tracked project files.

Each `exclude` entry follows the module-path rule: without `*`, it is literal (including `?`, `[]`, braces, leading `!` and extglob syntax); a trailing `/` excludes a subtree and `.` excludes everything. With `*`, it is passed unchanged to git `:(glob)`: `*` stays within a directory, and `**/` matches any number of directories. Leading `!` and extglob syntax have no fast-glob meaning. Rewrite `**/name` as `**/name/**` for a directory subtree. Globs with braces, `..` segments or absolute roots are refused; `unsupported-module-path` reports them, and they exclude nothing. Module and exclusion globs are listed separately and the excluded matches are subtracted.

## Tech stack and test command

| Field | Type | Default / required | Description |
| --- | --- | --- | --- |
| `tech_stack.language` | string | Auto-detected, or unset | Overrides the detected project language. |
| `tech_stack.framework` | string | Auto-detected, or unset | Overrides the detected framework. |
| `tech_stack.package_manager` | string | Auto-detected, or unset | Overrides the detected package manager. |
| `tech_stack.test_command` | string | Resolved from project configuration and manifests | Command executed by `prospec check --record-tests`; resolution and platform restrictions follow below. |
| `tech_stack.test_timeout_ms` | integer | `900000` (15 minutes) | Wall-clock cap for that command, from 1 to 2147483647 milliseconds. When a test command resolves, an invalid value makes `--record-tests` record an unprovable attempt naming the key, without running the suite. Changing the value makes recorded test evidence stale; re-run `--record-tests`. |

A nonblank `test_command` wins. Otherwise, a configured `package_manager` supplies `<package_manager> test` when `package.json` declares a test script. If that fallback does not apply, Prospec detects a command from Rust, Python, Go, Node.js or Makefile manifests. If no command is available, the test runner reports a skip.

Commands run without a shell: pipes, `&&` and redirection are unsupported. On Windows, `.cmd` and `.bat` shims are also unsupported, including the usual `pnpm` shim; use a shell-free, shim-free invocation such as `node --test` when appropriate for your suite. The runner reports these Windows shim invocations as skips with a reason. See [Review and test evidence](./cli-reference.md#review-and-test-evidence) for recording and reuse rules.

## Agents and languages

| Field | Type | Default / required | Description |
| --- | --- | --- | --- |
| `agents` | string[] | `[]` | Agent configs to generate: `claude`, `codex`, `copilot`, `antigravity`. |
| `artifact_language` | string | `English` | Language for change artifacts and their archived summaries. Blank values also resolve to English. |
| `trust_zone_language` | string | `English` | Language for AI Knowledge, `specs/features/`, `specs/product.md`, `index.md`, `README.md` and `CONSTITUTION.md`. Blank values also resolve to English. |

Code, identifiers, technical terms and git commit messages remain English. Set both language fields to the same value for a project whose documentation uses one language. Runtime resolution does not inherit `artifact_language` into `trust_zone_language`.

Interactive `prospec init` asks for the trust-zone language only when the artifact language is non-English, offering that language as the prompt default. `--trust-zone-language` sets it directly; CI mode (`--agents`) without that flag keeps English. Init generates the Constitution's path-scoped Language Policy and the agent entry config from the same languages and path sets. `prospec check` reports `language-policy-drift` when the Constitution's Description diverges.

## Knowledge

| Field | Type | Default / required | Description |
| --- | --- | --- | --- |
| `knowledge.base_path` | string | Unset | Deprecated and no longer configurable: the Knowledge directory is always `{paths.base_dir}/ai-knowledge`. Omit it; a value equal to `{paths.base_dir}/ai-knowledge` is still accepted, any other value is refused. |
| `knowledge.strategy` | string | `auto` | Module partitioning: `auto`, `architecture`, `domain` or `package`. |
| `knowledge.additional_core_conventions` | string[] | `[]` | Additional convention files to preload as L1 Core Conventions, relative to the Knowledge directory. |
| `knowledge.generated_artifacts` | string[] | `[]` | Project-relative generated artifact patterns excluded from Knowledge staleness (the module source digest and `last_src_commit`). |

Use `additional_core_conventions` for shared API or security rules that should load alongside the built-in Core Conventions. `generated_artifacts` identifies build outputs in the source tree: they are left out of the module's source digest and do not move `last_src_commit`, so regenerating a bundle does not alone make its module stale. Prospec does not infer this list from your build system. Each entry is read like a `module-map.yaml` path: without `*` it is a literal path, and with `*` it is a glob git matches with `:(glob)`, where `*` stays within one directory and `**/` matches any number of directories. A pattern `prospec check` reports under `unsupported-module-path` excludes nothing.

## Knowledge budgets

| Field | Type | Default / required | Description |
| --- | --- | --- | --- |
| `knowledge.token_budget.l1_per_file` | number | `1800` | Maximum tokens per L1 file: `index.md` and each Core Convention. |
| `knowledge.token_budget.l2_per_module` | number | `1000` | Maximum tokens per module README or extracted sub-module file. |
| `knowledge.token_budget.readme_max_lines` | number | `100` | Maximum lines per L2 module file. |
| `knowledge.token_budget.spec_per_file` | number | `5000` | Maximum tokens per Feature Spec, spec slice or `product.md`. |
| `knowledge.token_budget.demand_knowledge_per_file` | number | `10000` | Maximum tokens per load-on-demand Knowledge file, such as the lessons ledger or playbook. |
| `knowledge.token_budget.headroom` | number | `0.85` | Budget ratio at which the pressure signal starts; range `0`–`1`. |

`knowledge-size` measures each load surface an agent reads. Override only the fields you need; omitted fields retain their shipped defaults. A freshly initialized project has no `token_budget` block. Files over budget produce WARN, not a build failure, and do not affect `--strict`'s exit code.

Each finding names a remedy for its surface: trim an L1 file or move detail into its owning module, extract an L2 sub-module, split a Feature Spec under `specs/features/{feature}/`, or run `prospec-learn`'s Staleness Sweep on a governance file. Archived changes add graduated requirements to Feature Specs; each extracted slice remains subject to the same `spec_per_file` budget.

Skill and reference budgets ship with Prospec: **12,500 tokens per skill** and **4,000 tokens per reference**. They are not project settings; `skill_per_file` and `reference_per_file` overrides have no effect and `unjustified-budget-override` asks you to remove them. They are measured only in authoring projects that contain skill template sources, where every deployed `SKILL.md` and reference is checked, including hand-authored skills. Consumers of generated skills cannot act on these findings and are not graded for them. Skill findings recommend extracting phase-specific references; reference findings recommend splitting by phase or moving rarely used material into its owning skill.

## Test evidence

| Field | Type | Default / required | Description |
| --- | --- | --- | --- |
| `test_evidence.exclude_knowledge` | boolean | `false` | Allows certified test evidence reuse across Knowledge-only changes. Enable only when the project's tests do not read Knowledge. |

Absent or `false` preserves the full input scope. With `true`, the excluded directory is `{paths.base_dir}/ai-knowledge`; its existing directory ancestors must be readable ordinary directories, not symlinks. Unsafe or unprovable paths are refused.

The opt-in identity is `test-inputs-v1` / `repository-inputs-without-knowledge-v1`, with `test_policy: {version: 1, excluded_path: <project-relative path>}` on both attempt and provenance. Changing the policy, config bytes, resolved command or any retained input invalidates the evidence; missing or unknown identities require a real run.

Knowledge remains in review and verification-context snapshots. Knowledge checks, document review and project-defined pre-merge CI still apply. Explicit `--record-tests` always executes the suite, and a newer failed or unfinished attempt cannot revive an older PASS. The [CLI evidence reference](./cli-reference.md#review-and-test-evidence) explains certification, target enumeration and verify's reuse gate.

## Workflow

| Field | Type | Default / required | Description |
| --- | --- | --- | --- |
| `workflow.max_station_retries` | number | `3` | Maximum consecutive station recovery failures before human escalation; nonpositive or fractional numbers fall back to 3. |
| `workflow.pause_at` | string[] | `[]`, plus Premise-dependent pause | Stations requiring human sign-off; currently only `plan`, for `standard` and `full` changes. |
| `workflow.always_escalate` | string[] | `[re-scope, break-glass-override, breaking-change]` | Decision categories that a general delegation does not decide; `[]` disables this list. |

The retry bound applies to verify below-bar results and plan/tasks verifier flaws. `pause_at: [plan]` requires direction approval before tasks: full changes sign off a candidate option, standard changes the audited plan version. Without an environment override, a change whose verified Premise is `ai-proposed` pauses at plan even when `pause_at` is absent or empty.

`PROSPEC_PAUSE_AT` decides alone when set, using comma-separated station names. An empty value or `none` disables pausing; use `none` on Windows, whose shells unset an empty variable. Invalid pause values are errors. A `.prospec.yaml` that exists but cannot be read or parsed as YAML causes a conservative pause, disclosed by `prospec status`; a validation error in another field does not prevent reading `workflow.pause_at`.

`always_escalate` reserves listed decisions for the human unless the human explicitly named that specific change. `breaking-change` means removing or narrowing behavior promised by a graduated requirement, such as a delta-spec REMOVED entry or Dropped bullet. Invalid categories are errors. An `AWAITING_HUMAN_PLAN_SIGNOFF` route lists the categories in force.

## Learning thresholds

| Field | Type | Default / required | Description |
| --- | --- | --- | --- |
| `learn.thresholds.frequency` | number | `3` | Minimum distinct-source frequency for a promotion suggestion. |
| `learn.thresholds.impact_modules` | number | `2` | Minimum number of impacted modules for a promotion suggestion. |
| `learn.lens_thresholds.consecutive_zero_threshold` | positive integer | `5` | Consecutive zero-yield changes before a lens receives `retire`. |
| `learn.lens_thresholds.min_invocations` | positive integer | `3` | Declared lens invocations required before a recommendation. |
| `learn.lens_thresholds.min_yield` | number | `0.1` | Yield ratio below which a lens receives `review`; range `0`–`1`. |

Promotion requires both frequency and impact-module thresholds. Nonpositive or nonnumeric promotion thresholds fall back individually to their defaults. Lens thresholds are validated separately; invalid config values are errors, and valid `prospec learn yield` CLI options override the corresponding config fields. Must-run lenses never receive a retirement recommendation. Promotion suggestions do not automatically promote a lesson.

## Skill localization

| Field | Type | Default / required | Description |
| --- | --- | --- | --- |
| `skill_triggers.<skill-name>` | string[] | English trigger baseline | Adds native-language activation keywords for the named skill. |
| `skill_exclusions.<skill-name>` | string[] | No additional clause | Adds native-language negative-scope phrases as a `Not for:` clause after the skill description. |

Use canonical names such as `prospec-explore`; unknown names produce warnings and are ignored. Empty exclusions leave the description's existing English boundary unchanged. Without custom triggers, a non-English artifact language adds a semantic-match hint alongside the English baseline. `prospec agent triggers` emits a translation scaffold for missing entries in both mappings; `prospec agent sync` renders them into skills and entry configs.

## Example

This is a compact configuration, not a list of defaults. Copy only the settings needed by your project; run `prospec config example` for the complete annotated YAML.

```yaml
project:
  name: my-project
agents: [codex]
tech_stack:
  language: typescript
  package_manager: pnpm
artifact_language: Traditional Chinese (Taiwan)
trust_zone_language: English
workflow:
  pause_at: [plan]
knowledge:
  strategy: domain
  token_budget:
    l2_per_module: 1500
skill_triggers:
  prospec-explore: [探索]
```
