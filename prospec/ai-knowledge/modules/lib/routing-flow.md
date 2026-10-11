# Routing Flow

> How `routeChange` (`src/lib/status-router.ts`) places a change: the global rules first, then the branch for its status; within a scope the first rule whose condition holds decides. The ladder below is generated from `ROUTING_TABLE` — edit the table, then run `pnpm routing-flow`.

<!-- routing-flow:start -->
```mermaid
flowchart TD
  %% ═══ global rules ═══
  g0{"scale has no plan and no task list,<br>premise not blocked,<br>status before implemented?"} -->|Yes| g0L["PROMOTION_INCOMPLETE<br>next: promote"]
  g0 -->|No| g1{"non-terminal, escalation pending,<br>an applicable grant for the pending event (applicableGrant)?"} -->|Yes| g1L["LIFECYCLE_NEXT<br>next: pending station"]
  g1 -->|No| g2{"non-terminal, escalation pending?"} -->|Yes| g2L["ESCALATE_TO_HUMAN<br>next: null"]
  g2 -->|No| g3{"non-terminal, premise blocked?"} -->|Yes| g3L["PREMISE_INCOMPLETE<br>next: explore"]
  g3 -->|No| S{"status?"}
  %% ═══ story ═══
  S -->|story| b0r0{"scale has no plan?"} -->|Yes| b0r0L["QUICK_SKIPS_PLAN<br>next: tasks"]
  b0r0 -->|No| b0r1L["LIFECYCLE_NEXT<br>next: plan"]
  %% ═══ plan ═══
  S -->|plan| b1r0{"plan verifier FAIL,<br>no escalation history,<br>streak ≥ max retries?"} -->|Yes| b1r0L["ESCALATE_TO_HUMAN<br>next: null"]
  b1r0 -->|No| b1r1{"plan verifier FAIL?"} -->|Yes| b1r1L["PLAN_VERIFIER_FAILED<br>next: plan"]
  b1r1 -->|No| b1r2{"sign-off pause applies (enabled, scale has a plan),<br>no verifier result?"} -->|Yes| b1r2L["PLAN_VERIFIER_PENDING<br>next: plan"]
  b1r2 -->|No| b1r3{"pause applies, not signed off,<br>plan changed since verifier?"} -->|Yes| b1r3L["PLAN_VERIFIER_PENDING<br>next: plan"]
  b1r3 -->|No| b1r4{"pause applies, not signed off?"} -->|Yes| b1r4L["AWAITING_HUMAN_PLAN_SIGNOFF<br>next: null"]
  b1r4 -->|No| b1r5{"design applies (scale has a plan,<br>UI scope full/partial), no design spec?"} -->|Yes| b1r5L["DESIGN_REQUIRED<br>next: design"]
  b1r5 -->|No| b1r6L["LIFECYCLE_NEXT<br>next: tasks"]
  %% ═══ tasks ═══
  S -->|tasks| b2r0{"tasks verifier FAIL,<br>no escalation history,<br>streak ≥ max retries?"} -->|Yes| b2r0L["ESCALATE_TO_HUMAN<br>next: null"]
  b2r0 -->|No| b2r1{"tasks verifier FAIL?"} -->|Yes| b2r1L["TASKS_VERIFIER_FAILED<br>next: tasks"]
  b2r1 -->|No| b2r2L["LIFECYCLE_NEXT<br>next: implement"]
  %% ═══ implemented ═══
  S -->|implemented| b3r0{"no review provenance?"} -->|Yes| b3r0L["REVIEW_PENDING<br>next: review"]
  b3r0 -->|No| b3r1{"recorded grade below S/A,<br>no escalation history,<br>streak ≥ max retries?"} -->|Yes| b3r1L["ESCALATE_TO_HUMAN<br>next: null"]
  b3r1 -->|No| b3r2{"recorded grade below S/A?"} -->|Yes| b3r2L["VERIFY_GRADE_BELOW_BAR<br>next: verify"]
  b3r2 -->|No| b3r3L["VERIFY_PENDING<br>next: verify"]
  %% ═══ verified ═══
  S -->|verified| b4r0{"latest grade below S/A,<br>no escalation history,<br>streak ≥ max retries?"} -->|Yes| b4r0L["ESCALATE_TO_HUMAN<br>next: null"]
  b4r0 -->|No| b4r1{"latest grade below S/A?"} -->|Yes| b4r1L["VERIFY_GRADE_BELOW_BAR<br>next: verify"]
  b4r1 -->|No| b4r2{"a knowledge-sync reason<br>other than UNSYNCED?"} -->|Yes| b4r2L["KNOWLEDGE_INPUT_INVALID<br>next: null"]
  b4r2 -->|No| b4r3{"any knowledge-sync reason?"} -->|Yes| b4r3L["KNOWLEDGE_UNSYNCED<br>next: knowledge-update"]
  b4r3 -->|No| b4r4L["LIFECYCLE_NEXT<br>next: archive"]
  %% ═══ abandoned / archived ═══
  S -->|abandoned / archived| b5r0L["TERMINAL<br>next: null"]
  classDef decisionNode fill:#fff,color:#333,stroke:#999
  classDef readyNode fill:#7ED321,color:#fff,stroke:#5CA018
  classDef stateNode fill:#F5A623,color:#fff,stroke:#D4871A
  classDef successNode fill:#417505,color:#fff,stroke:#2E5204
  class g0,g1,g2,g3,S,b0r0,b1r0,b1r1,b1r2,b1r3,b1r4,b1r5,b2r0,b2r1,b3r0,b3r1,b3r2,b4r0,b4r1,b4r2,b4r3 decisionNode
  class g2L,b1r0L,b1r4L,b2r0L,b3r1L,b4r0L,b4r2L readyNode
  class g0L,g1L,g3L,b0r0L,b0r1L,b1r1L,b1r2L,b1r3L,b1r5L,b1r6L,b2r1L,b2r2L,b3r0L,b3r2L,b3r3L,b4r1L,b4r3L,b4r4L stateNode
  class b5r0L successNode
```
<!-- routing-flow:end -->

## Writer Gates

These refusals belong to the CLI command on each edge, not to a routing rule.

```mermaid
flowchart LR
  T["TASKS"] --> G1{"prospec change status implemented"} -->|accepted| I["IMPLEMENTED"]
  I --> G2{"prospec review merge"} -->|accepted| M["REVIEW ROUND MERGED"]
  G1 & G2 -->|refused| R1["TEST_GATE_REFUSED"]
  V["VERIFIED"] --> G3{"prospec archive"} -->|accepted| A["ARCHIVED"]
  G3 -->|refused| R3["Entry Gate: CHECK_UNPROVABLE · TASKS_INCOMPLETE · METADATA_INCOMPLETE<br>REVIEW_STALE · TESTS_STALE · DELTA_SPEC_STALE<br>KNOWLEDGE_UNSYNCED · KNOWLEDGE_INPUT_INVALID"]
  classDef decisionNode fill:#fff,color:#333,stroke:#999
  classDef failNode fill:#D0021B,color:#fff,stroke:#A80216
  classDef stateNode fill:#F5A623,color:#fff,stroke:#D4871A
  class G1,G2,G3 decisionNode
  class R1,R3 failNode
  class T,I,M,V,A stateNode
```

## Adding a Routing Decision

1. **Scope and position** — global (before any status) or the status's branch; a rule placed earlier takes every facts set both rules hold for.
2. **`label`** — the human reading of `when`; change both in the same edit.
3. **`code`** — a `WORKFLOW_REASON_CODES` member; a new code is appended there and to `frozen-registries.test.ts`'s exact list.
4. **`next`** — a station, or `null` for a human halt, whose code then belongs in `HUMAN_HALT_CODES` (`status-router-rules.test.ts`).
5. **Lifecycle prose** — `_status-lifecycle.md` and its shipped twin `src/templates/init/status-lifecycle.md.hbs` describe each code; update both alike.
6. **Diagram** — run `pnpm routing-flow`; `tests/contract/routing-flow.test.ts` fails until the region is redrawn.
7. **Tests** — add cases to `tests/unit/lib/status-router.test.ts`.
8. **A refusal at a CLI write is a writer gate, not a rule** — it belongs to that command (e.g. `lib/archive-gate.ts`).
