# Getting Started

This page covers what the [README Quickstart](../README.md#quickstart) leaves out: every installation option, what the bootstrap commands expand to, and driving each station yourself. Its [prerequisites](../README.md#prerequisites) apply here too.

## 1. Install

The `prospec` CLI is the **essential deterministic engine** driving the SDD workflow runtime loop. Skills running inside your AI Agent (e.g. `prospec-new-story`, `prospec-plan`, `prospec-verify`, `prospec-archive`) automatically invoke `prospec` commands under the hood for scaffolding, lifecycle status transitions, quality_log recording, drift validation, and Feature Spec synchronization.

Ensure the `prospec` executable is available on your system `PATH`:

**Option A: Standalone Binary (Recommended & No Node.js Required)**
For macOS and Linux, run the one-click installer script (installs to `~/.prospec/bin` and configures `PATH`):
```bash
curl -fsSL https://raw.githubusercontent.com/benwu95/prospec/main/install.sh | bash
```

For Windows, run the one-click PowerShell installer script:
```powershell
powershell -c "irm https://raw.githubusercontent.com/benwu95/prospec/main/install.ps1 | iex"
```

Both installers take the newest release by default. To pin a specific release, pass its tag (tags carry no `v` prefix) — as an argument on macOS/Linux, or via `PROSPEC_INSTALL_VERSION` when the script is piped into a shell that cannot forward arguments:
```bash
curl -fsSL https://raw.githubusercontent.com/benwu95/prospec/main/install.sh | bash -s -- 2.1.1
```
```powershell
$env:PROSPEC_INSTALL_VERSION = "2.1.1"
irm https://raw.githubusercontent.com/benwu95/prospec/main/install.ps1 | iex
```

Alternatively, download the precompiled binary manually from the [GitHub Releases](https://github.com/benwu95/prospec/releases) page and place it in your `PATH`:

- **Linux (x64)**: `prospec-linux-x64.tar.gz`
- **macOS (Apple Silicon)**: `prospec-macos-arm64.tar.gz`
- **macOS (Intel)**: `prospec-macos-x64.tar.gz`
- **Windows (x64)**: `prospec-windows-x64.zip`

**Option B: Pin as devDependency (Node.js projects)**
Install as a local project dependency:
```bash
npm install -D github:benwu95/prospec     # or: pnpm add -D github:benwu95/prospec
```

**Option C: Run on demand with npx (Node.js environments)**
Run one-off commands without global installation:
```bash
npx github:benwu95/prospec <command>
```

> [!WARNING]
> We **do not recommend** global installation via `npm install -g` because global compilation of an unpublished fork may fail depending on your local Node/build environment. Use **Option A Standalone Binary** instead.

## 2. Bootstrap your project

Run `prospec quickstart` in the project, then `prospec-quickstart` inside your AI agent, as shown in [step 2 of the README Quickstart](../README.md#2-bootstrap-your-project). What the two commands expand to on a greenfield or brownfield project is detailed at the end of step 3 below.

## 3. Run your first change (inside your AI agent)

Describe the change in plain language and the agent drives the gated SDD cascade; [step 3 of the README Quickstart](../README.md#3-run-your-first-change-inside-your-ai-agent) shows what that run looks like. The cascade's pause rules are in [AI Skills and the Workflow](./concepts/workflow.md#cascade-and-pauses).

Prefer to drive each step yourself? Run them explicitly:

```text
🤖 Run inside your AI Agent chat:
prospec-explore                   # (optional) clarify the requirement first
prospec-new-story add-my-feature  # capture it as a structured story
prospec-plan                      # design the implementation (a `quick`-scale change skips this)
prospec-design                    # (optional after Plan) UI / interaction specs
prospec-tasks                     # break the plan into an ordered task checklist
#   ↑ collapse story → plan → tasks in one pass with: prospec-ff add-my-feature
prospec-implement                 # implement task-by-task (no commit yet)
prospec-review                    # adversarial review → fix loop
prospec-verify                    # validate; grade S/A opens the commit boundary
prospec-knowledge-update          # sync affected module Knowledge into the feature commit
prospec-archive                   # archive + graduate Feature Specs
prospec-learn                     # (periodic) promote recurring lessons → team rules
```

That's the full SDD loop. Because `prospec-quickstart` already seeded AI Knowledge, the agent starts from an understanding of your modules. The full greenfield &amp; brownfield walkthroughs below break down every step `prospec quickstart` automates.

<details>
<summary>Greenfield vs. brownfield bootstrap — what the two commands expand to</summary>

### Greenfield (new projects)
`prospec quickstart` → `prospec-quickstart` is the whole bootstrap:

```bash
mkdir my-project && cd my-project
prospec quickstart --name my-project   # init + agent sync (interactive assistant + language selection)
# then, inside your AI agent:
prospec-quickstart                     # localize triggers · re-sync · generate AI Knowledge
```

Those two commands expand to:

```bash
# `prospec quickstart` runs:
prospec init --name my-project   # → select AI assistants (interactive checkbox)
                                 # → choose the doc language (default: English, or
                                 #   --language "Traditional Chinese (Taiwan)"); when it is
                                 #   non-English, also choose the trust-zone language
                                 #   (defaults to the same; --trust-zone-language skips the
                                 #   prompt). A [MUST] path-scoped Language Policy rule is
                                 #   seeded into CONSTITUTION.md from both; code and git
                                 #   commit messages stay in English
                                 # → creates .prospec.yaml + directory structure
prospec agent sync               # → per-agent config + Skills (Claude Code → CLAUDE.md +
                                 #   .claude/skills/; Antigravity / Codex / Copilot →
                                 #   AGENTS.md + .agents/skills/)

# `prospec-quickstart` then, inside your AI agent:
#   • non-English doc language? proposes native trigger words for `skill_triggers`
#     in .prospec.yaml and re-runs agent sync once you confirm — skills then match
#     requests phrased in your language
#   • prospec knowledge init → prospec-knowledge-generate (seeds AI Knowledge)
```

On a fresh repo, `prospec-knowledge-generate` produces a minimal Knowledge base that fills in as you ship changes. Then run your first change exactly as in step 3 above.

### Brownfield (existing projects)
same two commands; `prospec-quickstart` reads your existing code into AI Knowledge:

```bash
cd existing-project
prospec quickstart                      # auto-detects tech stack; runs init + agent sync
# then, inside your AI agent:
prospec-quickstart                     # localize triggers · re-sync · knowledge init · prospec-knowledge-generate
```

Those two commands expand to:

```bash
# `prospec quickstart` runs:
prospec init          # → auto-detect tech stack; select AI assistants; choose doc
                      #   language (default: English; --language to skip the prompt) and,
                      #   if non-English, the trust-zone language (--trust-zone-language)
prospec agent sync    # → per-agent config + Skills

# `prospec-quickstart` then, inside your AI agent:
prospec knowledge init       # → generates raw-scan.md + empty skeletons (prospec/index.md, _conventions.md, module-map.yaml)
prospec-knowledge-generate  # → AI reads raw-scan.md, decides module partitioning,
                             #   creates modules/*/README.md + fills prospec/index.md
```

Here `knowledge init` reads your existing code, so `prospec-knowledge-generate` produces a rich Knowledge base up front. Then run your first change exactly as in step 3 above — the develop loop is identical to greenfield.

`knowledge init` captures *how* your code is structured, but brownfield modules usually still lack a Feature Spec describing *what* they do. Closing that WHAT-layer gap is its own first-class flow — see **[Backfill: bringing brownfield code into the trust zone](./guides/backfill.md#backfill-bringing-brownfield-code-into-the-trust-zone)**. It is not part of bootstrap, so run it whenever you choose.

</details>

> The full generated tree — every directory `prospec quickstart` and `prospec-quickstart` create —
> is in [CLI Reference — Generated project layout](./reference/cli-reference.md#generated-project-layout).
