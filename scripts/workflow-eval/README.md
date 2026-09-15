# Workflow evaluation (development only)

This repository-local tool evaluates eight bounded workflow scenarios. It is not a
downstream CLI feature and installs no provider SDK. Ordinary tests and CI use no
model credentials or paid API calls. Synthetic traces test the controller; they
are never evidence of model capability.

## Offline preparation

```sh
pnpm workflow:evaluate offline
pnpm bundle
pnpm workflow:evaluate offline --snapshot .prospec/baseline-instructions.json --runtime dist/cli-bundle.js --freeze-runtime .prospec/workflow-runtime.mjs
```

The snapshot contains deployed `.agents/skills/**/*.md`, including references.
The frozen standalone runtime must be the same file/content for baseline and
candidate; its SHA-256 is recorded independently of instruction identity. It is
created from the source CLI **after** prerequisite changes and evaluator setup.
Do not overwrite it when rebuilding candidate templates. A HEAD name alone is
not content identity, especially with dirty instructions.

Prepare an independently audited mandatory-load policy JSON with exactly the eight
keys listed in `tests/fixtures/workflow-eval/public`. Each value has this shape:

```json
{
  "audit": "Reviewer/date and route-specific audit reference",
  "roots": [{"station": "tasks", "paths": [".agents/skills/prospec-tasks/SKILL.md"]}],
  "dependencies": {".agents/skills/prospec-tasks/SKILL.md": []}
}
```

This is a **shape example, not a complete policy**: list every applicable mandatory
reference recursively. Explicit empty dependency lists are required for leaves.
Paths are fixture-relative, not relative to the containing reference. Repeat roots
for later stations that reload a document. Non-skill project documents can be added
under `prospec/` in the instruction snapshot, but cannot overwrite fixture state.
Missing sources, missing dependency inventories, cycles or an absent audit refuse
live execution. The auditor must check conditional applicability; the tool cannot
infer intent from prose or prove that a human-authored inventory is exhaustive.

## Native subscription CLI capture (preferred for this change)

Use the ordinary `claude -p` / `agy -p` tools with cached subscription login. No
tool-free agent, global configuration edit, provider SDK or action-proposal wrapper
is required. The native path is separate from the mediated adapter below.

Copy [native.config.example.json](native.config.example.json) to a local configuration,
replace executable paths and freeze exact `--version` output and model IDs. The
example carries the two already-consumed readiness launches into the 1,600 total.
Use **one ledger for every capture**, across both models, failures and variants:

```sh
pnpm workflow:evaluate native --live --config .prospec/native-config.json --executor agy --scenario quick --instructions .prospec/baseline-instructions.json --runtime .prospec/workflow-runtime.mjs --ledger .prospec/native-launches.json --out .prospec/native-agy-quick
```

This executes one scenario directly in a fresh Git fixture. It saves `identity.json`,
`launch.json`, `transport.json` (raw stream-json and stderr), and `before.json` /
`after.json` (base64 file contents and source CLI status). The fixture is retained
for inspection, including failures. Output directories cannot be overwritten.
The ledger reservation is written **before** launch and never refunded. An exclusive
ledger lock prevents concurrent runs; after a crash inspect the reserved launch and
ensure the process has stopped before manually removing its stale lock. Do not reset
or replace the ledger to resume. Keep these private local artifacts; raw native
output is not a redacted publication report.

AGY launches also use `--new-project` to avoid sharing `default-cli-project`
([project association](https://antigravity.google/docs/cli/projects/)). This is
not a filesystem sandbox or proof that native subagents cannot read other projects.
The first native AGY quick readiness run timed out and its child transcript showed
reads from the development repository. Its evidence is contaminated, not baseline.
The flag was subsequently exercised, but remote cancellation remains unverified.

A subsequent `--new-project` readiness run completed its workflow but its verifier
read the private oracle through a global package symlink into the development repo.
It is **oracle-exposed**, not clean baseline evidence. Fresh project association
and an explicit project-root prompt do not enforce filesystem isolation. Before
further model evaluation, isolate both native parent and child tools from the
development repository and its aliases; do not remove global installations to hide
the problem.

Docker quick readiness subsequently completed planning, an independent child-written
verifier receipt, CLI registration and the implementation handoff. AGY project
documents must be written as ordinary files, not UI Artifacts: native capture adds
the shared `AGY_FILE_GUIDANCE` (omit `ArtifactMetadata`, use `IsArtifact=false`, and
do not probe permissions with unrelated scratch files). This guidance changes no
permissions. Twelve readiness/diagnostic launches have been consumed; none is a
formal baseline run.

The thirteenth launch, a scoped Claude Docker capture, timed out after the parent
had written the plan and an independent child had written its verifier report: the
child kept retrying unauthorized interpreters to parse that JSON and never reported
back. Scoped Claude captures therefore also carry the shared `CLAUDE_TOOL_GUIDANCE`
(read JSON and Markdown with the Read tool, stop and report a denial instead of
switching interpreters, pass the same constraints to delegated workers). It is
attached only when session settings are in effect, and like the AGY guidance it
grants no permissions, adds no allow rules, and is not a substitute for evidence:
that capture remains incomplete and outside the baseline.

Container AGY readiness then failed three times in a row, each within about a
minute and each for the same structural reason: in headless mode a denied tool
call is fatal, so the session was cancelled outright when the model quoted the
frozen CLI path (the container allow rule is the bare command), listed the
directory with `ls -la`, and opened the frozen CLI bundle outside the project
root. Two fixes followed, neither of which widens permissions: the prompt now
passes a shell-safe path unquoted for both executors, and a container AGY run
additionally carries `AGY_COMMAND_GUIDANCE`, which names the approved command
set, confines reads to the project root, and states that a denial ends the
session. The fourth attempt completed the workflow. The frozen CLI bundle
embeds the very instructions under measurement, so reading it is treated as an
external read, not as ordinary project work.

The `runNativeCli` transport now accepts an optional typed `docker` target with
an absolute Docker executable, immutable container ID and image digest, nonzero
numeric UID, and container working directory. It uses the same quota reservation,
raw trace parser and bounded process owner as host execution. Preflight refuses
mounts, elevated privileges, port mappings, host namespaces, added capabilities,
missing resource limits, stopped containers and changed identities before reserving
a launch. Only a selected inspect summary is returned; Docker environment values
are not persisted. The Docker process receives only the host PATH; container login
and environment remain independently configured and must be audited for baseline.

Execution uses separate argv elements, `docker exec --user --workdir`, and an
in-container timeout with five seconds of kill grace; it does not install software,
alter account settings, grant permissions or mount host data. These checks are not
a complete sandbox attestation: bridge networking remains available, other data
already in the container may remain accessible, and remote daemon cancellation is
unverified. Host `--scoped-permissions` cannot be applied to Docker paths.
See [Docker exec](https://docs.docker.com/reference/cli/docker/container/exec/) and
[Docker inspect](https://docs.docker.com/reference/cli/docker/inspect/).

The `native` capture entry accepts `--docker-config <file>` using
[docker.capture.example.json](docker.capture.example.json). Replace the placeholder
container ID/image with the approved immutable target, select the container CLI
path, and choose a new, explicitly authorized container working directory for each
capture. Its parent must exist without symlinks; existing destinations are refused.
The controller copies only its newly prepared disposable fixture (including its own
Git history), never the development repository, oracle or host login files. Docker
copy ownership is normalized only inside that new fixture. The frozen runtime must
already be installed in the container and match the host snapshot's SHA-256.

```sh
pnpm workflow:evaluate native --live --config .prospec/native-config.json --docker-config .prospec/docker-capture.json --executor agy --scenario quick --instructions .prospec/baseline-instructions.json --runtime .prospec/workflow-runtime.mjs --ledger .prospec/native-launches.json --out .prospec/docker-native-agy-quick
```

Without `--docker-config`, capture still runs on the host. Invalid Docker settings
fail closed, never falling back to host execution. Docker runs check the container
CLI version (not the configured host executable) and record container settings and
their digest separately alongside the shared launch ledger. Prompts use container
paths, and before/after capture uses the same dependency-free collector on both
transports: JSON/base64 is validated, symlinks and Git internals are excluded, and
no agent-authored archive is extracted on the host. Claude background updating is
disabled per invocation, not by mutating account settings. Docker-local login and
tool permissions must already be provisioned; the host `--scoped-permissions` flag
is refused with Docker. For an explicitly approved Claude session, set optional
`claude_write_directory` in the Docker capture config to exactly one directory
`<target.cwd>/.prospec/changes/<slug>`. This emits inline `--settings`: fixture reads,
Edit/Write only beneath that change, the fixed Node + runtime command, and exact
read-only `git status` / `git ls-files` variants. It does not modify global settings
or grant arbitrary shell execution. AGY rejects this Claude-only option. These
allow rules are CLI permissions, not a comprehensive OS isolation guarantee.
Formal paired adjudication and baseline execution remain
incomplete; this entry still returns UNASSESSED.

Capture currently returns exit code **1 / UNASSESSED**, even when the CLI succeeds.
It is not wired to the mediated scorer or paired comparison: independent native
trace/artifact adjudication is still required before a complete baseline can pass
the implementation gate. Do not classify these captures as certified baseline runs.
Required reads, route decisions, independent receipts and absence of forbidden
operations cannot be inferred from final prose, file existence or exit code zero.

Local process groups, elapsed time and combined output bytes are bounded. Native
internal turns/actions, ambient hooks/MCP/context and remote daemon cancellation are
not comprehensively controlled or observed. In particular, 1,600 launches are not
1,600 provider calls, and a separate cwd is not an OS sandbox. Original native events
are retained without fabricating gateway observations. Provider final usage is kept
as reported; step totals, thinking and cache fields are not blindly added together.
Existing login is retained; API credential environment variables are not forwarded,
but that alone does not attest the CLI's global billing configuration. Do not enable
extra credits or API fallback. No permission-bypass flags or automatic retries are used.

Print-mode references: [AGY](https://antigravity.google/docs/cli/headless/) and
[Claude Code](https://code.claude.com/docs/en/headless).

## Mediated adapter contract (compatibility / offline controller tests)

### Execution modes

The default `api` mode requires `budget_usd`, verified per-model prices and
`token_bound: "utf8-bytes"`. The existing worst-case cost reservation applies.

Explicit `execution_mode: "subscription"` instead requires `max_requests` and
exactly two executor tiers (eight scenarios each, baseline plus candidate = 32
scenario runs). Omit all USD prices and `budget_usd`; set each executor's
`token_bound` to `"unavailable"`. Each controller launch, including fresh-context
delegation and failed responses, consumes one nonrefundable request. Candidate
execution carries the baseline's `requests_consumed` forward. The batch records
`committed_usd: null`, not a zero bill. Missing baseline accounting is refused.

The approved working limits for this change are 1,600 total controller requests,
50 turns / 100 actions / 300 seconds per scenario, and 500,000 response bytes per
request. These are execution limits, **not** subscription credits, provider call
counts, monetary guarantees or measured usage. A CLI may make multiple internal
model calls per launch. In subscription mode `max_input_tokens` is used only as
the transport request's UTF-8 byte ceiling; `max_output_tokens` is an adapter hint,
not a provider-enforced guarantee. Missing usage stays unavailable. Neither mode
automatically retries or switches billing methods.

These adapter constraints apply only to the mediated path. The native subscription
path above deliberately permits native tools and reports its observation limits.

### Local CLI readiness (2026-09-06)

`claude` and `agy` are installed and support print / JSON output. `agy models`
lists `gemini-3.8-flash-{high,medium,low}`; choose and freeze one effort variant
before baseline. No provider SDK or direct API fallback is required by the runner.

The earlier tool-free adapter experiment was unsuccessful. A temporary
workspace agent with `tools: []` was not listed by `agy agent`, even after Git
initialization. An explicitly approved global agent was discovered, but two
readiness calls using `tools: []` and `tools: [finish]` both advertised native
file/shell/MCP/delegation tools and `always-proceed` in their init events. Neither
configuration establishes a tool-free boundary. The test agent was removed;
the user subsequently approved direct native capture instead. Baseline has not run.
Remote cancellation and ambient configuration isolation remain unproven and are
reported limitations, not reasons to require a tool-free agent again.
Readiness launches are recorded separately and must be deducted from
the authorized overall request allowance. The local `useG1Credits` setting is unset; the official CLI reference
documents its default as `false` ([reference](https://antigravity.google/docs/cli/reference/)), so no global setting change is needed for that
default. The two readiness inferences are not baseline evidence.
Do not modify global user settings or credentials merely to make an eval pass.

A subsequent native Claude quick readiness launch confirmed the requested model
and produced actual Read/Bash events. Default headless permissions refused the
frozen CLI commands (`This command requires approval`), and the agent correctly
reported blocked rather than manufacturing a receipt. Shared fixture setup now
provides project Constitution/index/conventions/module knowledge before historical
evidence initialization, preserving scenario-specific documents. Session-only scoped
command permissions still require approval before another live workflow attempt.
The three readiness launches are recorded in the local shared ledger; none is a
certified baseline. No global settings or permission-bypass flags were changed.

After explicit approval, add `--scoped-permissions` to native capture for Claude.
This supplies session-only `--settings` JSON: file rules name the canonical fixture
path, Bash rules name the exact frozen CLI, the fixture suite and specific read-only
Git commands. Direct edits to `.git`, `.agents` and `.claude` are denied. It does not
set `bypassPermissions`, grant arbitrary Bash, or edit global settings. The selected
policy and effective arguments are preserved in capture identity; keep the same
policy for baseline and candidate. The flag adds no AGY permission flags, since AGY
uses its existing native permission environment. This is an approval list, not OS
confinement or proof that inherited settings grant nothing else.

Official references: [headless permissions](https://antigravity.google/docs/cli/headless/)
auto-allow workspace file access; [custom agents](https://antigravity.google/docs/subagents)
document explicit tool lists; [credit settings](https://antigravity.google/docs/cli/credits/)
describe `useG1Credits: false` as the control for credit fallback. A flag or
self-reported lack of tools is not runtime evidence of isolation or cancellation.

### Transport

Copy [the configuration example](config.example.json) outside
tracked source and replace every placeholder. The sample prices are **not provider
prices**. Independently verify the configured upper rates, including cache-write
surcharges, reasoning/output classes and any adapter framing. Choose one stronger
and one cheaper executor; no model is recommended or silently selected.

The adapter is a trusted local executable, launched with `shell: false`. It reads
one JSONL request from stdin, writes exactly one JSONL response to stdout, and exits.
Every request is stateless and includes the complete current conversation:

```json
{"version":1,"request_id":1,"model":"configured-model","settings":{},"limits":{"max_input_tokens":200000,"max_output_tokens":8192,"token_bound":"utf8-bytes"},"messages":[{"role":"user","content":"task"}]}
```

```json
{"version":1,"request_id":1,"action":{"kind":"read","path":".prospec/changes/x/proposal.md"},"usage":{"input":123,"output":45}}
```

In API mode, the adapter must enforce token caps over the **entire provider request**, including
its added framing, and the entire charged output (including reasoning). The UTF-8
byte bound is a conservative request preflight, not the `chars/4` display estimate.
Use no native model shell/file/network tools: return mediated action proposals only.
Do not retain hidden conversation state or silently retry provider calls. `usage`
is either the observed total input/output usage or `null`; unknown usage never
releases the API call's worst-case reservation. API rates must cover all billed token
classes; extra non-token charges are unsupported and such adapters must not run.

Credentials are passed only through the explicitly named environment keys. Never
put credentials in argv, model IDs, settings, prompts or files. Do not print them
on stdout/stderr. Known credential values are redacted from persisted batches;
redacted evidence cannot certify an exact-identity comparison.

The transport is trusted; `cwd` is **not an OS sandbox**. A malicious local adapter
could bypass the gateway. An executor with uncontrolled native tools, independent
background daemons, or (in API mode) unenforceable token/billing caps is incompatible. The
controller bounds stdout+stderr bytes, turns, actions, elapsed time, shared cost
and POSIX process groups; Windows live execution is refused rather than claiming
equivalent process-tree termination.

## Baseline, policy, candidate

```sh
pnpm workflow:evaluate live --live --config .prospec/eval-config.json --instructions .prospec/baseline-instructions.json --runtime .prospec/workflow-runtime.mjs --mandatory .prospec/baseline-policy.json --variant baseline --out .prospec/baseline-runs.json
pnpm workflow:evaluate offline --baseline .prospec/baseline-runs.json --policy .prospec/comparison-policy.json
```

Do not modify shipped instructions before the complete baseline. The policy binds
the baseline evidence digest and freezes optional duration limits before candidate
execution. `null` means no extra duration threshold, not missing time telemetry.
If choosing a numeric limit, set it now, before seeing candidate results.

After candidate changes, capture the new deployed instruction snapshot and audit
its route-specific mandatory policy. Keep the runtime, evaluator code, corpus,
oracle, executor/model/settings and total budget unchanged:

```sh
pnpm workflow:evaluate offline --snapshot .prospec/candidate-instructions.json
pnpm workflow:evaluate live --live --config .prospec/eval-config.json --instructions .prospec/candidate-instructions.json --runtime .prospec/workflow-runtime.mjs --mandatory .prospec/candidate-policy.json --variant candidate --baseline .prospec/baseline-runs.json --policy .prospec/comparison-policy.json --out .prospec/candidate-runs.json
pnpm workflow:evaluate compare --config .prospec/eval-config.json --baseline .prospec/baseline-runs.json --candidate .prospec/candidate-runs.json --policy .prospec/comparison-policy.json --out .prospec/workflow-comparison
```

The candidate uses the **remaining total budget/quota**, subtracting baseline commitments.
Each completed run is persisted immediately, including failures; no automatic
retry or best-of selection. Restarting baseline is a new explicitly opted-in batch,
not a cost-free resume. Keep failed batches and disclose any reruns.

## What the evidence means

- At least 32 runs: two executor tiers × eight scenarios × two instruction variants.
- Completion cannot regress for either executor. That is the gate. Forbidden attempts
  and false PASS are compared per pair against that pair's own frozen count and
  **reported as warnings, never gated** — they come from dimensions a capture cannot
  establish (see *What is certified, and what is only disclosed*). An absolute zero was
  never the bar either: the baseline itself attempts forbidden actions. Denied attempts
  are still counted and reported.
- The controller validates actual payloads with existing station schemas and uses
  actual CLI sinks. `delegate` makes a fresh-context report request; self-written
  JSON is not accepted as an independent receipt. This is an evaluator constraint,
  not a claim that the product CLI can authenticate report authorship.
- Context reports retain per-station loads, repeated and unique content, named
  character estimates and separate provider usage. Missing provider usage is
  unavailable, never filled with an estimate. Mandatory context must not increase.
- Scenarios stop at the versioned handoff/diagnostic endpoint; these are not claims
  that a model completed every station of an entire SDD lifecycle.

Review the JSON traces and failed cases, not only the Markdown headline. The private
oracle lives outside disposable model workspaces and is never supplied in prompts.
Policies and the adapter's billing/capability attestations still require independent
human review; a syntactically valid configuration is not proof they are truthful.

## What is certified, and what is only disclosed

A native capture cannot establish everything the workflow contract cares about, and
pretending otherwise produced a false verdict in every round of this change's own
adversarial review. The report therefore separates the two:

**Certified** — `execution`, `artifacts`, `payloads`, `independent_receipt`, `routes`,
`endpoint`, `required_reads`, `required_commands`. Completion (`complete`) is computed
over these alone, and only a contradicted one can turn a claimed success into a
`false_pass`.

**Disclosed** — `state`, `cli_receipts`, `forbidden_reads`, `external_reads`,
`forbidden_commands`, `write_policy`, `delegation_policy`, `delegation_signals`,
`suite_runs`. Each is reported with its outcome and diagnostics; none is scored. Two
reasons, both learned the hard way:

- **Authorship is not observable.** The frozen CLI's own writes never appear in a tool
  trace, so a well-formed `metadata.yaml` says nothing about who wrote it. Enumerating
  the model's write shapes was bypassed twice — the write tool first, then shell
  redirection — and requiring a matching CLI invocation instead made a legitimate
  `verify record` or `archive` transition permanently unprovable.
- **Negative detectors are positive-only.** A satisfied `forbidden_commands` means no
  violation was *seen*, which is a weaker claim than "none occurred". Scoring it turns
  incomplete visibility into a passing grade.

The consequence is deliberate and worth stating plainly: **a run that visibly reads a
forbidden file, reaches outside the fixture, runs a forbidden command and an unnecessary
suite can still be `complete: true`** — with all four facts in its `disclosed` block and
in the comparison's warnings. `complete` means "the certified dimensions hold", never
"the run behaved". A consumer that needs those facts must read what is disclosed.

## Adjudicating a native capture

`workflow:evaluate adjudicate --capture <capture directory>` reads a saved native
capture — `identity.json`, `before.json`, `after.json`, `transport.json` — and
writes `adjudication.json` beside it. It makes no model call, consumes no launch
quota and never rewrites the capture, so a run can be re-adjudicated after the
rules change. Captures written by the historical one-off readiness pilots use a
different identity shape and are deliberately not adjudicable here.

Every dimension is judged under two evidence standards, both reported:

- **strict** credits only directly attributed observations. Claude attributes a
  delegated tool call through `parent_tool_use_id`, so a child-written verifier
  report is provable; AGY reports the subagent step but not the tools inside it,
  so an AGY receipt is `unobserved` under this standard.
- **graded** additionally credits delegation inferred from the absence of a
  parent write: a delegation was observed, the receipt appeared during the run,
  and no parent operation wrote it. The dimension carries
  `evidence: inferred-from-absence` so the weaker basis stays visible.

A dimension is `satisfied`, `violated` or `unobserved`; only `satisfied`
everywhere makes a run complete under that standard. Violations are detected
positively — a `satisfied` forbidden-read, forbidden-command or external-read
dimension means no violation was observed under incomplete native tool
visibility, not that none occurred. Artifacts, parked state, CLI-recorded
receipts and payload schema validity come from the fixture itself; routes come
from the frozen CLI invocations the model actually ran, never from narrated
intent, and a `handoff` terminal's final route is credited from the parked state
rather than from a claim. A terminal success record over contradicted evidence is
counted as a false PASS, never as a pass; a merely unobservable dimension leaves
the run incomplete without accusing the model of a false claim. A read attempted outside the project
root — the private oracle, another project, or the frozen CLI bundle that embeds
the instructions under measurement — is a violation whether or not the CLI
denied it.

Read-only scenarios (`allow_writes: false`, `allow_delegation: false`) count any
observed write or delegation as a forbidden action, and a scenario's
`required_commands` must be seen to complete, not merely attempted. One oracle
rule has no native equivalent: `required_signals` describes delegation
pending/timeout transitions that exist only in the mediated gateway, so the
`missing-receipt` scenario stays `unobserved` under both standards in native
mode and cannot be completed there. That limit applies equally to baseline and
candidate, and the report states it rather than scoring around it.

## Freezing a baseline and comparing a candidate

`workflow:evaluate freeze --capture <batch> --instructions <snapshot> --out <policy>`
reads every `adjudication.json` in a batch directory and freezes it. All sixteen
pairs (two executors × eight scenarios) must be present and share one content
identity; a partial batch is refused rather than averaged. The policy records the
instruction, corpus, oracle and runner manifest digests, per-pair metrics under
both standards, the observed instruction context and wall clock, and a
deliberately unenforced `max_duration_ratio: null`.

`workflow:evaluate compare-native --baseline <policy> --candidate <batch>
--standard graded --out <report>` scores a candidate batch against that frozen
policy. It passes only when the frozen policy carries every pair it claims to bind,
the candidate shares the baseline's config and runtime identity while carrying a
*different* instruction snapshot, the policy still verifies against its own content
digest and the current corpus/oracle/runner manifests, every recorded adjudication
still follows from the capture beside it, and per-executor completion does not
regress. A missing pair, a drifted identity, a tampered policy or adjudication, or an
unchanged instruction snapshot leaves the verdict `incomplete` — never a pass.
Forbidden actions and false PASS travel as reported warnings, not as gates.

Observed instruction context and duration are reported, not gated: they come
from what a run actually read, which varies between runs, so a rise is disclosed
as a warning. Reading less than the mandatory inventory is a finding about the
run, never a smaller requirement.
