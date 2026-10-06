# Human Decision Reference

## Presentation Contract

**Presenting a human decision**: for each viable option, state its concrete reversal cost — what is redone if it proves wrong now, and after implementation. Cite the rule or evidence behind the recommendation, and give the strongest non-recommended option the condition under which it would be right. Draw on the gate's existing material rather than restating whole reports. A decision the human already stated is not asked again, and nothing here adds a question where the station decides autonomously.

## Plan Sign-off by Scale

On `AWAITING_HUMAN_PLAN_SIGNOFF`:

- **full** — present the candidate summary, the `prospec validate candidates` metrics table, the in-session rationale and the plan verifier report.
- **other scales** — present a direction summary drawn from the existing plan, at most six points, citing plan.md and the plan verifier report; no candidate files or metrics are produced:
  1. **Purpose** — the user-observable behavior that changes.
  2. **Direction** — the approach and its rule or evidence.
  3. **Scope** — modules, public interfaces and data touched.
  4. **Key assumptions** — those that stop or redirect the work if false.
  5. **Strongest alternative** — one line and when it wins.
  6. **Reversal cost** — now versus after implementation, per the contract above.

## Responses

| Human response | Next |
|----------------|------|
| Approves | Record the sign-off (`--signoff <option>` at full scale, `--signoff plan` otherwise) with the human's words as `--warning` notes |
| Adjusts named details | Update the plan, re-run the verifier and record its new report, then sign off the updated version |
| Rejects the direction or a key assumption | Return to `prospec-explore`, then update through the Story and amendment flow |

## Delegation Boundary

- A general delegation ("follow your recommendation") never decides a category in `.prospec.yaml` `workflow.always_escalate` (an `AWAITING_HUMAN_PLAN_SIGNOFF` route lists those in force; `breaking-change` takes back or narrows behavior a graduated requirement promises): ask, unless the human already named that specific change — a specific decision is reused, not asked again.
- "Change X, then continue" authorizes the named change and the continuation once the plan is updated and the affected verification is recorded. A new scope, breaking-change or major trade-off decision is asked anew; an answer too vague to define the change is clarified first.
- Break-Glass overrides and acceptance amendments keep their own gates (escalation guidance, the amendment command). The CLI checks those structured records; whether a conversation is a specific authorization is the skill's judgment.
- Releasing the plan pause with `PROSPEC_PAUSE_AT` releases no other gate or delegation boundary.
