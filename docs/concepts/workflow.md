# AI Skills and the Workflow
[繁體中文](./workflow.zh-TW.md) • [Documentation](../README.md)

Prospec generates 17 Skills — 15 guide AI through the full SDD lifecycle, plus two periodic finishers: `prospec-quickstart` (onboarding) and `prospec-upgrade` (version upgrade):

| Skill | Canonical Skill | Description |
|-------|---------------|-------------|
| **Explore** | `prospec-explore` | Think partner for requirement clarification |
| **New Story** | `prospec-new-story` | Create structured change story |
| **Design** | `prospec-design` | Generate visual + interaction specs (Generate/Extract modes) |
| **Plan** | `prospec-plan` | Generate implementation plan + delta-spec |
| **Tasks** | `prospec-tasks` | Break down into executable tasks |
| **Fast-Forward** | `prospec-ff` | Generate story → plan → tasks in one go |
| **Implement** | `prospec-implement` | Implement tasks one-by-one with MCP-first design reading |
| **Review** | `prospec-review` | Adversarial review → fix loop; verifier-confirmed criticals auto-fixed, spec-aware lens |
| **Verify** | `prospec-verify` | 5+1 dimension audit with quality grade (S/A/B/C/D); prompts commit at S/A |
| **Archive** | `prospec-archive` | Archive changes + Spec Sync + Knowledge sync Entry Gate |
| **Learn** | `prospec-learn` | Feedback promotion: recurring lessons → team `_playbook` / Constitution (auditable, human-gated) |
| **Knowledge Generate** | `prospec-knowledge-generate` | AI-driven module analysis and knowledge creation |
| **Knowledge Update** | `prospec-knowledge-update` | Incremental knowledge update from delta-spec |
| **Backfill Spec** | `prospec-backfill-spec` | Reverse-extract a Feature Spec draft from existing brownfield code (stages a draft, never writes the trust zone) |
| **Promote Backfill** | `prospec-promote-backfill` | Formalize a reviewed backfill draft into the backfill change scaffold (proposal + delta-spec + metadata, `scale: backfill`, `status: implemented`; a light scale — no plan/tasks); never writes the trust zone |
| **Quickstart** | `prospec-quickstart` | After `prospec quickstart` runs init + agent sync, localize skill triggers into your artifact language, prepare the Knowledge scan, and chain into `prospec-knowledge-generate` to seed AI Knowledge; never writes the trust zone |
| **Upgrade** | `prospec-upgrade` | After `prospec upgrade` records the version, re-syncs agents, and back-fills missing init docs, work through the report's docs inventory: migrate drifted init-doc formats + enrich the docs it created, and localize triggers for newly-added skills (fill-missing only) — each with confirmation + a diff/content preview; never overwrites your authored content |

> [!NOTE]
> **Periodic Finisher Skills**: `prospec-quickstart` (runs once after `prospec quickstart`) and `prospec-upgrade` (runs during version upgrades after `prospec upgrade`) finish the judgment steps the CLI cannot handle deterministically. Both deploy to disk as Skills but are excluded from the always-loaded entry config; each deployed `SKILL.md`'s name and description still loads per session, so the saving is the entry-config listing, not the skill metadata.

## Quality Gates & Self-Improvement

Beyond the linear flow, every workflow Skill carries built-in quality machinery:

- **Output Contract** — each Skill self-reports `Met N/M | Overall: PASS|WARN|FAIL` against objective criteria, so you don't hand-check artifacts.
- **Capability-aware station entry** — the generated entry config and the cascade protocol branch on the host's declared skill content lifecycle (`persistent-reattach`, `tool-output` or `unknown`, each traceable to a dated source in the agent registry). A host whose skill mechanism keeps loaded content alive is told to invoke — and re-invoke — the station's Skill; every other host, and any host with no declared lifecycle, runs `prospec status` and reads the station's `SKILL.md` before the entry gates. Neither route is exempt from the gates, and loading a station never implies its references arrived.
- **Station reference maps** — `prospec status` shows the next station's references by phase, including conditional loading hints. A shared registry drives generated reference maps and deployment inventories; `prospec check`'s `skill-reference-map` check detects missing files and mismatched phase citations. Run `prospec agent sync` to refresh deployed Skills after correcting their source. See the [CLI reference](../reference/cli-reference.md).
- **Entry / Exit gates** — a Skill checks preconditions before running (Entry) and Constitution compliance after (Exit); WARN/FAIL records persist to a cross-stage `quality_log` so an earlier stage's concern surfaces at the next.
- **Skill instruction quality** — per-phase gate checklists (finer-grained than the skill-level Entry/Exit gates); outside the `prospec-ff` cascade, each linear-flow Skill (plan→tasks→implement→review→verify→archive) ends with a status-aware **next-step handoff**; new-session detection of in-progress changes to resume; `prospec-implement` re-anchors `Progress X/Y | Goal | Next` after each task; and `prospec-explore` / `prospec-knowledge-generate` warn when the Constitution is still substantively empty (its gates would otherwise be no-ops).
- **Executable Constitution** — rules carry RFC-2119 severity (MUST→FAIL / SHOULD→WARN / MAY→advisory); `prospec-verify` grades against them.
- **Deterministic drift gate** — `prospec check` machine-verifies spec ↔ code ↔ knowledge referential integrity with zero tokens; `prospec-verify` consumes its report at dev time and the scaffolded CI workflow enforces it on every PR. With an optional `feature-map.yaml` (feature→module index, bootstrapped at archive) it adds two governance checks: REQ-prefix legality (WARN) and the feature→module edge (FAIL).
- **Adversarial review** — `prospec-review` sits between implement and verify: an independent fresh-context reviewer audits the whole change diff; only verifier-confirmed, drop-in criticals are auto-fixed, the rest escalate to you. The **commit boundary** is *after* verify reaches grade S/A, so implement + review + verify fixes land in one atomic commit (prospec prompts; it never auto-commits). Findings group instances of the same failure mode. Each applied fix sweeps that class and affected parallel sites, including test counts and owning requirements; the next reviewer receives the repaired classes and predicates to rerun. Repeated claim-wording loops converge by deleting the claim.
- **Feedback promotion** — every **Archive** auto-harvests a change's recurring lessons into a **version-controlled** ledger (`_lessons-ledger.md`); `prospec-learn` then scores them with an explicit reproducible rule (frequency + impact modules) and — only with explicit human approval — promotes them into the team `_playbook.md` or the Constitution. Before each collection it **sweeps both files for entries the project has outgrown** — a rule some gate now enforces, one whose subject is gone, or one that contradicts the Constitution — and surfaces each with its evidence for human retirement; expiry retires in place (a ledger row keeps every counter, a playbook id is never reused), so the audit trail survives the cleanup.

## Right-Sized Process (Scale)

Not every change deserves the full ceremony. At story time, `prospec-new-story` (or `prospec-ff`) assesses complexity against explicit criteria and proposes a scale — **you confirm before it is written** to `metadata.yaml`:

| Scale | What changes |
|-------|--------------|
| `quick` | Slim proposal (single story, no FR/SC enumeration), **plan phase skipped entirely** (`story → tasks`), no module-README loading; review/verify report their delta-spec dimensions as `not-applicable` (never a fake PASS) |
| `standard` (default; absent on existing changes) | The current concise flow — plan ≤ 120 lines, closing with a required **Simpler Alternative** section (a materially simpler alternative or an explicit concession, plus a files/lines change-surface estimate) |
| `full` | Complete architecture analysis — expanded Technical Summary, per-entry-point Call Chains, Best-of-N candidate selection measured by `prospec validate candidates` (its recorded non-selected candidates stand in for Simpler Alternative) |

Two honest backstops keep `quick` from becoming a spec-drift hole: a change expected to touch spec-covered behavior is **vetoed out of quick** at assessment time, and the `prospec-archive` Entry Gate re-checks the **actual diff** — spec impact blocks archiving until a minimal Spec Impact section is added, and the knowledge-sync gate derives affected modules from diff paths instead of the absent delta-spec. Forward-change scales keep TDD, adversarial review, and Constitution audits; proven backfill has a separate fidelity contract where code review is optional.

Tasks also carry a **kind** marker (`[M]` manual, `[V]` verification, unmarked = code): completion rates count code tasks only, so an unchecked "run this command manually" reminder never blocks or distorts a gate.

<details>
<summary>Cache-Stable Prefix Ordering (advanced internals)</summary>

Every skill's Startup Loading section is ordered **static-first** so provider prompt caches
(Anthropic explicit `cache_control`, OpenAI/Gemini automatic prefix caching) can reuse the
longest possible prefix across triggers. Each loading item carries one of two markers:

- **`[STABLE]`** — changes only on `agent sync` or governance edits: startup-needed
  `references/` format specs, the Constitution, `_conventions.md`. These load first.
  (Phase-specific format specs in `ff` / `plan` / `archive` are instead read **per-phase
  on-demand** — off the stable prefix, so an early abort never pays for a later phase's format.)
- **`[DYNAMIC]`** — changes per knowledge update, per change, or per trigger: `prospec/index.md`
  (first after the cache boundary), module READMEs, `_playbook.md`, Feature/Product Specs,
  and `.prospec/changes/` artifacts. These load last.

The classification criterion is **cross-request prefix stability**, not "is it generated":
the entry config's Available Skills list is per-project fixed (it changes only when the
skill set changes), so it is `[STABLE]`. Extension authors adding skills must follow the
same ordering — static loads before the boundary, dynamic after — or they break the cache
prefix for every trigger. What the harness measures is the **prospec assembly pipeline**
(its corpus assembles knowledge files, not the skill templates themselves) — see
[Token Measurement](../reference/cli-reference.md#token-measurement). The template-level reorder takes effect at the agent deployment layer,
outside the harness's observable scope (a deliberate exclusion): its benefit follows from
the providers' documented prefix-caching semantics, not from a direct before/after measurement.

</details>

## Sourced requirement premises

New standard/full changes start with a pending `## Premise` in proposal.md and `premise_version: 1` in metadata. Record the problem, original source/reference, evidence/result, withdrawal condition and verification. `prospec validate proposal <change>` (or `--json`) checks readiness; `prospec status` routes incomplete premises to `prospec-explore`, then `prospec-new-story` updates the same proposal. Plan/tasks, forward status changes, verify recording and archive refuse before writing until ready; promoting a post-story change to standard/full checks the target scale too. Quick/backfill are exempt; metadata without the version remains legacy with a visible limitation. Missing metadata and unknown versions refuse.

Verification never relabels an `ai-proposed` origin. Reproducible bugs use evidence with steps, expected/actual behavior and a conclusion; this can shorten the interview. CLI validation checks structure, not source authenticity or evidence truth, and runs no reproduction steps. Auto-drafts remain pending until their premise is investigated.

## Cascade and pauses

In `prospec-ff` cascading mode, the next station starts automatically as machine gates pass. The cascade pauses only for clarification, a failed gate or circuit breaker, and final Tastemaker sign-off — plus a plan sign-off before any code is written, on `standard` and `full` changes alike, when you opt in with `workflow.pause_at: [plan]` or when the change's verified Premise was proposed by the AI (`source: ai-proposed`). A `full` change shows the measured candidate architectures and you sign off on the recommendation (choosing another candidate sends the agent back to revise the plan and re-run its verifier first); a `standard` change shows a short direction summary — purpose, direction, scope, key assumptions, the strongest alternative, and the cost of reversing — and you approve it, name the details to adjust, or send it back to exploration. The sign-off is bound to the audited plan version, so editing the plan before tasks are generated asks again. The `PROSPEC_PAUSE_AT` environment variable decides alone per run (empty or `none` = no pause; use `none` on Windows, whose shells unset an empty variable), so cloud or scheduled agents can stay fully autonomous while your local sessions pause; it releases only this pause. A general "follow your recommendation" never decides the categories in `workflow.always_escalate` (by default re-scoping, Break-Glass overrides, and breaking changes that take back behavior a graduated requirement promises), while a change you already named specifically is not asked again. Without the pause the agent selects a candidate itself and never stops to ask. At that boundary the agent presents the diff and evidence; it never commits, pushes, or archives without your explicit approval. Individual station Skills outside the cascade still end with a status-aware handoff, so you can drive the same flow one station at a time.
