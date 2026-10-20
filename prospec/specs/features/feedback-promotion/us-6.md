## US-6: Fixed Findings from an Installed Review Skill's Criterion Become Lesson Candidates [P1]

As a project maintainer,
I want archive Harvest and learn Collect to treat a finding that an installed review skill's criterion caught and that was fixed as a lesson candidate,
so that a private criterion worth keeping can, with human approval, become project knowledge that every teammate and host reads.

**Acceptance Scenarios:**
- WHEN `review.md` has a finding whose evidence names an external criterion source and whose status is fixed, THEN Harvest and Collect list it as a lesson candidate written to the ledger through `prospec learn upsert`
- WHEN such a candidate reaches the existing scoring thresholds, THEN promotion follows the existing flow, a human approves before any playbook or Constitution write, and `_conventions.md` is never written automatically
- WHEN a finding names no criterion source or is not fixed, THEN this rule adds no candidate

---

#### REQ-TEMPLATES-254: Harvest turns fixed findings from an installed review skill's criterion into lesson candidates
The Harvest definition in `promotion-format` adds review findings caught by an installed review skill's criterion as lesson candidates, so a criterion the developer accepted can reach the team tiers through the existing scoring and human approval.
- WHEN a `review.md` finding has status `fixed` and its evidence starts with `External criterion:`, THEN archive Harvest and learn Collect treat it as a lesson candidate keyed by that criterion, whose description states the rule in general terms and names its source skill, written through `prospec learn upsert` into the version-controlled ledger as any harvested lesson is
- WHEN such a lesson reaches the promotion thresholds, THEN promotion follows REQ-TEMPLATES-070
- WHEN a finding lacks the marker or is not `fixed` in `review.md`, THEN this rule adds no candidate
- WHEN `prospec-archive` Phase 4.5 and `prospec-learn` Collect describe their `review.md` scan, THEN they keep their existing sources and point to the Harvest definition for this candidate rule

---

#### REQ-TESTS-141: The external-criterion harvest rule is pinned
The external-criterion candidate rule is pinned inside the Harvest section of `promotion-format`, with its marker compared against the marker in the `delegation-protocol` review-criteria item, and the archive Phase 4.5 and learn Collect pointers are pinned section-scoped; the human approval gate those candidates pass through is pinned by the existing Harvest assertion and a section-scoped assertion on the `prospec-learn` Promote rule.
- WHEN the candidate rule is removed or its marker differs from the `delegation-protocol` marker, THEN a contract test fails, shown by an applied mutation
- WHEN the archive Phase 4.5 or learn Collect pointer is removed, THEN a contract test fails
- WHEN the Harvest section's no-auto-promotion rule or the `prospec-learn` Promote rule that never auto-writes `_conventions.md` is removed, THEN a contract test fails — the Harvest rule through its existing assertion, the Promote rule through a new section-scoped assertion — each shown by an applied mutation

---
