# Candidate Architecture Evaluation Reference

This document defines the **orthogonal candidate generation**, **mechanical metrics**, and **selection paths** used by `prospec-plan` (Phase 4) for `metadata.scale: full` (or on-demand standard) changes.

---

## Purpose

Complex, architectural changes (`scale: full`) are prone to the *Single Trajectory Trap* — where an AI assistant commits prematurely to its first intuitive approach, leading to over-engineering, brittle abstractions, or unnecessarily large blast radiuses.

This protocol forces orthogonal solution divergence, measures what can be measured (blast radius and layering) with the CLI instead of asking a second model to re-read the same text, and leaves the one judgment the numbers cannot make — extensibility against simplicity — to a one-way rationale that a human can sign off when the project opts in to pausing after plan.

> **Language- and Architecture-Agnostic Principle**:
> Prospec is a language-agnostic and architecture-agnostic SDD framework. Candidate generation and comparison must dynamically anchor to the project's actual tech stack (detected from manifests such as `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.), existing design patterns (L2 Module READMEs), and `prospec/ai-knowledge/_conventions.md`. It **never** presumes specific language idioms or hardcodes internal framework assumptions.

---

## Candidate Generation Protocol

When generating architecture options (`N <= 3`, default 2 orthogonal options):

### Option A: Pragmatic / Minimal Surface
- **Focus**: Minimal blast radius, high simplicity, direct integration.
- **Strategy**: Maximize reuse of existing modules, data structures, and utilities. Minimize new abstractions or intermediate layers.
- **Trade-off**: Lower initial cognitive load and minimal diff; may have less theoretical extensibility if requirements change radically.

### Option B: Decoupled / Clean Architecture
- **Focus**: Clear module boundaries, strict separation of concerns, explicit contracts.
- **Strategy**: Introduce modular interfaces, dedicated service abstractions, or clean boundary adapters to isolate new behavior.
- **Trade-off**: Higher structural purity and long-term modularity; may introduce additional boilerplate or higher upfront diff.

### Option C: Domain-Specific Alternative (Optional)
- When a distinct third architectural approach exists (e.g. event-driven vs synchronous, centralized vs distributed).

### Writing `call_chain`
One entry per primary entry point, hops separated by `→`. Each hop starts with the **repo-relative path** of the file that runs it (optionally followed by the symbol), so the CLI can attribute it to a module; a leading entry label (the command or route) is allowed. List only code call or import edges — reading a template or data file is not a hop.

---

## Comparison Criteria

### 1. Blast Radius & Complexity — measured
- `touched_modules` and `estimated_lines` from the metrics table; fewer is better.
- Can the changes be easily audited, tested, and rolled back?

### 2. Constitution & Layering Adherence — measured
- `direction_violations`: call-chain edges whose callee is not in the caller's `depends_on` in the module map (the same rules the dependency-direction check uses).
- Does the option follow `prospec/CONSTITUTION.md`, its error-handling and state-mutation invariants?

### 3. Extensibility vs. Simplicity — judged
- Does the option satisfy all current requirements without excessive coupling?
- Is the balance between future adaptability and present simplicity well-calibrated (Simplicity First)?
- This is the judgment the metrics cannot make; under the opt-in pause it is the human's call.

---

## Mechanical Metrics

After the candidate files are written, run `prospec validate candidates --change <name>`. It validates every candidate (and a present `decision.json`) against the executable schemas and prints the metrics table — `option | direction_violations | touched_modules | estimated_lines | unknown_references`. Paste the table into `plan.md` and the sign-off material. A FAIL verdict means a payload is invalid: fix the payload, never hand-edit the numbers. Unattributed references are disclosed, not counted as violations. After writing `decision.json`, re-run it: the verdict also FAILs a decision naming a candidate the set does not validly hold.

## In-Session One-Way Rationale

The orchestrating session writes `candidates/decision.json` itself — no judge sub-agent, no position-swapped scoring:
- Each measured winner follows its own metrics: `blast_radius_complexity` — fewer touched modules, then fewer estimated lines; `constitution_layering` — fewer direction violations; otherwise `tie`.
- `extensibility_simplicity` follows a one-way rationale written from the candidates' own trade-offs.
- `recommended_option` takes the majority of the three winners, so when the measured dimensions split, the extensibility rationale decides; a tie favors the smaller blast radius (Simplicity First). A `hybrid` names its synthesis in `hybrid_recommendation`.
- `graded_by: in-session` — and say in `rationale` that the comparison shares the generation context.

---

## Candidate and Decision Payload Schema

The executable contracts are `CandidatePayloadSchema` and `DecisionPayloadSchema`; `prospec validate candidates` enforces them and this section documents them. Each payload is a closed top-level object: no additional top-level fields are accepted.

### Candidate Payload Schema (`candidates/<id>.json`)
- `id`: `"option-a"` | `"option-b"` | `"option-c"` (required; the file is named `<id>.json`)
- `title`: string (required)
- `overview`: string summary of architecture (required)
- `trade_offs`: object with exactly `pros` (string[]), `cons` (string[]), and `blast_radius` (string); no additional properties (required)
- `call_chain`: string[] of hop chains written as above (optional)
- `estimated_lines`: number (optional)
- `touched_modules`: string[] of module-map names (optional)

### Decision Payload Schema (`decision.json`)
- `recommended_option`: `"option-a"` | `"option-b"` | `"option-c"` | `"hybrid"` (required)
- `evaluation_matrix`: array containing the closed dimensions `blast_radius_complexity`, `constitution_layering`, and `extensibility_simplicity` once each; every item has exactly `dimension`, `winner` (`"option-a"` | `"option-b"` | `"option-c"` | `"tie"`), and `score_rationale`, with no additional properties (required)
- `rationale`: string explanation of decision (required)
- `hybrid_recommendation`: string optional synthesis details
- `graded_by`: `"human"` | `"in-session"` — who selected (required)

### Delegated Return Contract

Each Candidate generator MUST return only its JSON file path. It MUST NOT relay the candidate or
evidence prose through the completion message.

---

## Physical Receipt Verification Protocol

Before consuming candidate proposals:
1. **Physical Existence & Non-Empty**: The orchestrator must verify that the target JSON output exists as a regular file on disk and has `size > 0` bytes.
2. **Schema Validation**: Validate the files against the candidate schema with `prospec validate candidates`.
3. **Lifecycle Probe & Await**: If the output file is missing when a completion message arrives, check abstract subagent lifecycle state or transcript logs and await completion.
4. **Explicit Degradation**: On a confirmed crash, failure, or timeout, fall back to single-context degraded execution and honestly disclose the in-session mode.
5. **Zero-Mock Rule**: NEVER create dummy candidate records or fake decisions. Missing, empty, unreadable, malformed, or schema-invalid outputs fail closed with concrete I/O or parse errors.

---

## Execution Modes & Harness Degradation

### Subagent Parallel Mode (`can_spawn_subagent: yes`)
1. Spawn Subagent 1: Generate Option A (Pragmatic) and write to JSON file.
2. Spawn Subagent 2: Generate Option B (Decoupled) and write to JSON file.
3. Verify candidate receipts via the Physical Receipt Verification Protocol.
4. Write `decision.json` in-session from the metrics table and the one-way rationale.

### Single-Context Degraded Mode (`can_spawn_subagent: no` or spawn failure)
1. Sequentially generate Option A and Option B in prompt-isolated steps.
2. Run the metrics and write `decision.json` as above.
3. Explicitly notify the developer of the degraded sequential execution mode.

---

## Selection Paths

After the plan verifier is recorded, run `prospec status`:
- **No pause** (the route continues to the next station): select the recommended option in-session, keep `graded_by: in-session`, and continue to the next station. NEVER ask the human to choose.
- **Pause** (`code: AWAITING_HUMAN_PLAN_SIGNOFF`): HALT and present the candidate summary, the metrics table, the in-session rationale, and the plan verifier report. The human signs off with `prospec change log --skill prospec-plan --signoff <option>`, which sets `graded_by: human`. NEVER run the sign-off without an explicit human instruction.
- **The human picks another option**: revise `plan.md`, `delta-spec.md`, and `decision.json` for it, re-record the plan verifier (a newer verifier entry supersedes any earlier sign-off), then the human signs off.
- **`code: PLAN_VERIFIER_PENDING`**: record the plan verifier first — there is nothing to sign off yet.

The chosen architecture is reflected in `plan.md`'s Call Chain and Implementation Steps, with the trade-off rationale preserved in `plan.md` Technical Summary and Risk Assessment.

---

## Language Policy

Comparison notes, rationale, and trade-off records must follow the project's configured `artifact_language` (e.g. Traditional Chinese for `.prospec/changes/**`). Technical identifiers, code symbols, and REQ IDs remain in English.

---

## Reference Information

- Project name: `prospec`
- AI Knowledge path: `prospec/ai-knowledge`
- Constitution file: `prospec/CONSTITUTION.md`
