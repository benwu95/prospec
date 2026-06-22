# Feature Boundary Criteria Reference

Concrete, checkable criteria for **prospec-backfill-spec**'s feature-first clustering — deciding where one
feature ends and the next begins, and where read/query behavior belongs. Loaded **on demand** at the
Phase 1 cluster step; it is NOT a Startup Loading item.

> A feature is a **vertical slice** (one end-to-end capability across the modules that implement it), not a
> module. This file does NOT redefine the trust-zone invariant or the `[NEEDS CLARIFICATION]` rules (owned by
> the skill body) — it only decides feature boundaries that those rules then operate on.

---

## Unifying Principle

A **feature boundary = one actor's coherent intent over a domain-object lifecycle.** CRUD verbs, code layer,
and file length are **not** feature boundaries. The two decisions below are the same test applied twice: how
to split, and where read/query behavior belongs.

---

## Decision 1 — Splitting signals are binding; line-count / 40% are soft "re-examine" signals

The Feature Spec format ships size governance (`feature-spec-format.md`: under **300 lines** per spec;
beyond that **consider** splitting into sub-features; the User Stories section should occupy **40%+**).
Treat those numbers as **soft signals** — they trigger "look again at whether this should split", they do
**not** decide it. The **binding** verdict is the three splitting signals below. A spec can exceed 300 lines
and still be one feature (e.g. a single lifecycle whose stories share acceptance criteria). To make 300
lines a hard cap instead, you would have to change `feature-spec-format.hbs` in the same change — this
reference keeps it a guideline and names it a soft signal.

**Split into sibling slugs when ANY signal holds** (→ propose the split, mark `[NEEDS CLARIFICATION]` for
human confirmation):

1. **Independent lifecycle** — one half would `deprecate` / version on its own while the other would not
   (`status` is per-file; half a feature cannot be deprecated alone).
2. **No shared User Story** — you cannot write any one US whose Acceptance Criteria reference both halves.
3. **Actor and trigger both disjoint** — the two halves share only infrastructure modules, not domain intent.

A "feature family" is expressed as **sibling slugs sharing a prefix/theme** — a naming convention, not a new
nesting level. A large capability stays **one slug / one file** with multiple `US-NNN` (each US = one
sub-story); do not invent a third structural layer.

**Safety valve (built-in, no new magic number):** the `>50%` `[NEEDS CLARIFICATION]` guardrail + the 40%
US-share + the 300-line soft signal + per-story human review. A slice wide enough to push the NC ratio toward
50%, drop US-share below 40%, or exceed what a reviewer can audit in one pass is the operational signal that
it should split.

---

## Decision 2 — Read/query defaults into the domain feature; only exceptions become their own feature

- **Default:** `GET by id` / `list` that share the same actor and domain object as the write side fold into
  that domain feature as a "view" User Story — do not spin a read-only feature off every getter.
- **Exception (own feature):** a query that serves an actor/intent **no single domain owns** — a
  cross-domain search / report / dashboard, or an outward consumer (an integration partner, an agent-facing
  read-only API). Test: can you write "As a 〈distinct actor〉, I want 〈cross-domain read intent〉" that no
  single domain feature can hold? If yes, it is its own feature.

Collapsing every `GET` into one "read feature" just swaps the WHERE-axis for a horizontal read layer — the
exact anti-pattern feature-first extraction exists to kill.

---

## Reference Information

- Project name: `prospec`
- Skill: `prospec-backfill-spec`
- Companion: `feature-spec-format.md` (size governance), Constitution (trust-zone invariant)
