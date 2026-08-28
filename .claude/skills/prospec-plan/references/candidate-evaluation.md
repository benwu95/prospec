# Candidate Architecture Evaluation Reference

This document defines the **orthogonal candidate generation** and **symmetric pairwise tournament selection** protocol used by `/prospec-plan` (Phase 4) for `metadata.scale: full` (or on-demand standard) changes.

---

## Purpose

Complex, architectural changes (`scale: full`) are prone to the *Single Trajectory Trap* — where an AI assistant commits prematurely to its first intuitive approach, leading to over-engineering, brittle abstractions, or unnecessarily large blast radiuses.

Grounded in the *LLM-as-a-Verifier* methodology (Best-of-N Candidate Generation + Probabilistic Pivot Tournament / Pairwise Comparison), this protocol forces orthogonal solution divergence, eliminates positional bias via position-swapped tournament comparisons, and records transparent trade-off rationale in `plan.md`.

> **Language- and Architecture-Agnostic Principle**:
> Prospec is a language-agnostic and architecture-agnostic SDD framework. Candidate generation and tournament judging must dynamically anchor to the project's actual tech stack (detected from manifests such as `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.), existing design patterns (L2 Module READMEs), and `prospec/ai-knowledge/_conventions.md`. It **never** presumes specific language idioms or hardcodes internal framework assumptions.

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

---

## Tournament Evaluation Criteria

> **Route the Tournament Judge to the strongest model / agent tier the harness makes available** — a
> judgment gate's discrimination is bounded by its judge, so the strongest available tier is the goal
> (named abstractly — never a specific model or vendor; "strongest available" is resolved by the
> harness). In single-context degraded mode, disclose that the judge shares the generation context.

The Tournament Judge evaluates each candidate across three orthogonal dimensions:

### 1. Blast Radius & Complexity
- **Checks**:
  - Does the option minimize unnecessary file changes and cognitive overhead?
  - Does it avoid over-engineering and premature abstraction?
  - Can the changes be easily audited, tested, and rolled back?

### 2. Constitution & Layering Adherence
- **Checks**:
  - Does the option strictly follow `prospec/CONSTITUTION.md` and project layering conventions?
  - Does it preserve unidirectional dependencies without cyclic or bypassing imports?
  - Does it adhere to project error handling and state mutation invariants?

### 3. Extensibility vs. Simplicity
- **Checks**:
  - Does the option satisfy all current requirements without excessive coupling?
  - Is the balance between future adaptability and present simplicity well-calibrated (Simplicity First)?

---

## Symmetric Pairwise Tournament Protocol

To eliminate LLM **Positional Bias** (the tendency to favor the first presented option):

1. **Position-Swapped Evaluation**:
   - Compare `Option A (First) vs Option B (Second)` with detailed scoring.
   - Compare `Option B (First) vs Option A (Second)` with detailed scoring.
   - Consolidate verdicts to determine the true dominant option.
2. **Scoring Matrix & Decision**:
   - For each criterion, assign win / loss / tie.
   - The candidate winning the majority of orthogonal dimensions is selected as the **Recommended Architecture**.
   - **Tie-Breaker Rule**: When scores are tied, favor the option with the smaller blast radius and higher simplicity (Simplicity First).
3. **Synthesized / Hybrid Plan**:
   - If Option B's clean boundary can be combined with Option A's minimal diff without adding friction, the Judge may recommend a synthesized approach.

---

## Execution Modes & Harness Degradation

### Subagent Parallel Mode (`can_spawn_subagent: yes`)
1. Spawn Subagent 1: Generate Option A (Pragmatic).
2. Spawn Subagent 2: Generate Option B (Decoupled).
3. Spawn Tournament Judge Subagent: Perform position-swapped pairwise evaluation and produce the Decision Record.

### Single-Context Degraded Mode (`can_spawn_subagent: no` or spawn failure)
1. Sequentially generate Option A and Option B in prompt-isolated steps.
2. Execute the Tournament Judge persona to perform position-swapped comparison.
3. Explicitly notify the developer of the degraded sequential execution mode.

---

## Human Choice Override

The Tournament Judge's decision is advisory and transparent:
1. The evaluation matrix and recommendation are presented to the developer.
2. The developer may choose to:
   - Accept the recommended option.
   - Override and select a different candidate option.
   - Request a hybrid synthesis.
3. The chosen architecture is reflected in `plan.md`'s Call Chain and Implementation Steps, with the full trade-off rationale preserved in `plan.md` Technical Summary and Risk Assessment.

---

## Language Policy

Tournament comparison notes, rationale, and trade-off records must follow the project's configured `artifact_language` (e.g. Traditional Chinese for `.prospec/changes/**`). Technical identifiers, code symbols, and REQ IDs remain in English.

---

## Reference Information

- Project name: `prospec`
- AI Knowledge path: `prospec/ai-knowledge`
- Constitution file: `prospec/CONSTITUTION.md`
