# Review Lens Criteria Reference

Load for inputs, filesystem writes, auth, secrets, external calls, dependencies or applicable conditional lenses; never Startup mandatory.

> **Severity vocabulary is defined once, in `review-format.md`** (critical / major / minor). This file does
> NOT redefine severity — it maps each criterion onto that vocabulary. The **spec-architecture** lens stays
> owned by prospec (see `review-format.md`) and is never replaced or overridden by the criteria below.

---

## Attribution

Heuristics adapted (de-Node-ified, mapped to prospec's critical/major/minor vocabulary) from the
`security-and-hardening`, `performance-optimization`, `code-simplification`, and `code-review-and-quality`
skills in **addyosmani/agent-skills**, used under the MIT License.
Source: https://github.com/addyosmani/agent-skills · upstream baseline commit `662910cd1a23`.

```
MIT License

Copyright (c) 2025 Addy Osmani

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Security & Data Integrity Lens

Cite defects against authorization, sensitivity and preservation contracts; valid symlinks, public directories and authorized actions are allowed.

### General

| Criterion | Default severity |
|-----------|------------------|
| Prevent query, shell, path and marker injection at input boundaries | critical (execution or authority bypass) |
| Constrain secrets and sensitive data in storage, VCS, output and logs | critical (disclosure) |
| Keep resolved paths and followed symlinks within authorized scope | critical (boundary escape) |
| Match file/directory permissions to sensitivity | critical (unauthorized access) |
| Preserve data on partial failure/overwrite per atomicity or recovery contract | critical (data loss) |
| Distrust model output; authorize context disclosure, tools and side effects | critical (boundary bypass) / major (excess authority) |
| Assess dependency vulnerabilities against actual exposure | major / critical (exploitable defect) |

### Web / HTTP — changed surfaces only

| Criterion | Default severity |
|-----------|------------------|
| Encode output against XSS; authorize resource access against IDOR | critical |
| Constrain destinations, resolved addresses and redirects against SSRF | critical / major (bypass) |
| Protect credentials and sessions: password hashing, cookie flags, expiry, login/reset rate limits | critical / major (brute force) |
| Apply security headers, credential-safe CORS and non-disclosing errors | major / critical (credential exposure) |

---

## Efficiency / Performance Lens

| Criterion | Default severity |
|-----------|------------------|
| N+1 query pattern (one query per item) — use a join/include | critical (scales to timeouts) |
| List endpoints without pagination / unbounded fetch or loops | critical (memory exhaustion, DoS) |
| Missing indexes on queried columns; blocking I/O on a hot path | major |
| Missing or misused caching (none → redundant work; over-use → stale data) | major / minor |
| Frontend: missing code-splitting/lazy-loading; images without dimensions or responsive sizes; no `fetchpriority` on the LCP image | major (bundle / CLS / LCP) |
| Unnecessary re-renders (new objects per render); `memo`/`useMemo` overuse | minor (measure first) |

**Core Web Vitals targets** (good / poor): LCP ≤ 2.5s / > 4.0s · INP ≤ 200ms / > 500ms · CLS ≤ 0.1 / > 0.25.
**Budget guides:** initial JS < 200KB gzipped · API p95 < 200ms · TTI < 3.5s on 4G · Lighthouse Perf ≥ 90.

> Optimize only after measuring — flagging a "slow" path without a baseline is a minor, not a major.

---

## Maintainability / DRY Lens

| Criterion | Default severity |
|-----------|------------------|
| Removing an error-handling path "for cleanliness" | critical (hides bugs) |
| Duplicated logic > ~5 lines, or repeated conditionals — extract a named function; logic needed in a **parallel module** must be extracted to ONE shared leaf helper and imported, never hand-copied (mind dependency direction — never a cycle between leaf modules) | major (DRY) |
| Re-implementing a helper or guard the project's knowledge base documents as the single source (or that an existing service already provides) — delegate to the owner instead | critical when the single-source bypass criterion in `review-format.md` holds (its path condition and both-conditions rule live there); otherwise major (DRY) |
| Deep nesting > 3 levels, or functions > ~50 lines — guard clauses / split by responsibility | major |
| Dead code (unreachable branches, unused vars, commented-out blocks) | major |
| Speculative/premature abstraction not yet used; over-engineered patterns (factory-of-factory) | major / minor (generalize at the 3rd use, not the 1st) |
| Misleading names (a `get*` that mutates); generic names (`data`, `tmp`, `x`); non-universal abbreviations | minor (rename to behavior/role) |
| Nested ternaries, boolean-flag parameters; comments stating *what* not *why* | minor |

**Chesterton's Fence:** understand why code exists (check `git blame`) before simplifying it — complexity
often encodes a real constraint. **Change-size signal:** ~100 lines reviews in one sitting; ~300 stretches
a reviewer (major); ~1000 should be split (critical to reviewability). A "simplification" that needs the
test changed likely changed behavior — treat as suspect.

---

---

## Docs-Claims / Measurement-Attribution Lens

Applies when the change adds or edits README/doc/spec prose that claims behavior.

**Claim writing:**

- State the component’s own guarantees; reference another component’s REQ instead of describing its decision boundary.
- Derive set and condition wording from code predicates.
- Use quantifiers (every, only, whenever, always, one per) and causal clauses (because, would) only when valid throughout the stated scope; otherwise delete them or reference the owning REQ.
- Delete a wrong claim by default.
- Write rules as general positive statements; use a general negative only when one line replaces several positive ones.
- Point tests at behavior and structure; a negative string assertion guards only the phrasing it names.

Rate a claim by what an agent would do with it: major or higher only when following it makes an agent act wrongly; wording that misleads no one is at most minor.

| Criterion | Default severity |
|-----------|------------------|
| A documented claim ("X handles / measures / degrades / supports Y") has no code path that realizes it — **claim ⊆ implementation**: grep for the path before the claim ships | major when it makes an agent act wrongly / minor otherwise |
| A gap or non-goal left silent — what is not done / not measurable must carry explicit **deliberate-exclusion** wording ("not measured here", "left to …") so review/verify can diff claims against behavior | major when an agent would act on it wrongly / minor otherwise |
| A count/attribution stated in prose that the code does not back (the deterministic `mcp-readme-counts` check covers only MCP-registration counts, so general count/attribution prose still needs this lens) | major when an agent would act on it wrongly / minor otherwise |
| **Enforcement face** — a claim that a property is *guaranteed / enforced / cannot happen* names the mechanism but not **who runs it and when**; a checker with no executor is not a gate. A passive-voice assertion with no subject ("is enforced", "cannot happen", "is refused") is the tell — supply the subject, then confirm that subject actually runs | major when an agent would rely on the missing executor / minor otherwise |
| **Qualifier face** — a scope, precondition, ownership subject or ordinal the reader does not need to act is one more falsifiable claim: leave it out, or verify it against the code path like any other claim | minor |
| **No-enforcer face** — a doc states a **shape** nothing enforces (a commit-subject form, a naming pattern, a message template); it is dated the moment it is written. Name the enforcer, or state only what the artifact *carries* (the stable part) and send the reader to the live source (`git log`, the registry, the schema). A repeatedly-refuted claim converges by **deletion**, not by weakening | minor |

---

## Parallel-Site Completeness Lens

Applies when the change introduces or touches an invariant or a shared resolver / config / data source — **or applies a fix** (remediation has the same failure mode).

| Criterion | Default severity |
|-----------|------------------|
| An invariant (realpath containment, terminal sanitization, resource-name guard) or resolution rule applied at one site but a **parallel consumer of the same data source was missed** — grep every consumer and apply + test each | critical (the missed site is the next bug) |
| A NEW consumer re-derives a shared path/config or re-implements the check ad hoc instead of going through the canonical resolver | major |
| **Remediation face** — applying a **fix**: follow `prospec-review` The Loop step 3 (Class sweep, Fix ripple, Shape check), continue re-running the full lens each round over the fix as a new diff | critical (the fix introduces the next defect) / major |

---

## Test-Quality Lens

Applies when the change adds, edits or removes tests (esp. contract/structural assertions), or edits test-gate configuration.

| Criterion | Default severity |
|-----------|------------------|
| A contract assertion is not **section-scoped** (slices the whole file, not heading → next heading; no non-empty guard) | major (false-green risk) |
| Content-presence asserted but **structural invariants** (item-set vs a version-controlled baseline, ordering, contiguity) and **negative assertions** for "must NOT appear" rules are missing — a "must NOT appear" rule pins the **set or structure** (item-set, closed enum, directory enumeration), never a keyword, whose coverage equals the author's vocabulary | major |
| A new assertion class was never **mutation-verified** (delete/corrupt the asserted feature → the test must go red) | major (an unmutated assertion may be a tautology) |
| An assertion passes **vacuously** — the slice, glob, or collection it inspects can be empty and the expectation still holds (`expect(found).not.toContain(x)` over an empty `found`) | major (the recurring shape: a mutation that makes extraction return nothing satisfies the test) |
| An existing assertion is **weakened or deleted** without a basis (an exact check loosened to a negation or a range, an assertion or test case removed); the finding quotes the assertion before and after the change | critical |
| A test **disable or focus marker** is added without a basis (`.skip`, `.only`, `xit`, `xdescribe` or the equivalent in the project's runner) | critical |
| A **test gate is relaxed** without a basis — `tech_stack.test_command` narrowed, `test_evidence.exclude_knowledge` enabled, a test-runner exclude added, a lint suppression added, or a coverage threshold lowered | critical |

**Basis for a loosening.** The three loosening criteria hold only when the change carries no basis: a MODIFIED or REMOVED REQ in the change's delta-spec, a recorded acceptance amendment, or a reason stated in the proposal — written before the review loop, not by a review-round fix. Cite the basis by file and line. Only an acceptance amendment carries a record (`metadata.yaml` `acceptance.revisions`); whether a delta-spec REQ or a proposal reason predates the review is your judgment, since nothing records that moment. A rename or move that keeps behavior, or an assertion made stricter, is not a loosening. Never auto-fix a confirmed loosening: a restored assertion has no fail-then-pass pin and may turn the suite red, so escalate it to the developer with the restore as the proposed fix.

> What the reviewer records about applying the **mutation-verified** criterion's
> mutations — naming each and whether it turned the test red — is a
> **finding-content** rule in `review-format.md` § review.md Format, not a row:
> a row's severity weighs a finding against the change, and this rule has
> nothing to file it on.
