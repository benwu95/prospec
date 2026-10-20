## US-5: Review Lens Yield Statistics and Retirement Guidance [P1]

As a project maintainer,
I want Prospec to calculate confirmed yield statistics for each review lens across archived changes,
so that I can identify low-yield or stale lenses and make data-driven decisions on whether to review, retire, or keep them.

**Acceptance Scenarios:**
- WHEN `prospec learn yield` is executed THEN display a sorted table of lens yield statistics including invocation count, confirmed finding count, yield ratio, consecutive zero-yield changes count, and recommended actions
- WHEN a declared conditional or custom lens reaches the consecutive zero-yield threshold and has at least the minimum of declared invocations THEN recommend `retire`
- WHEN a declared must-run lens reaches the consecutive zero-yield threshold and has at least the minimum of declared invocations THEN recommend `review` of criteria, execution and attribution; retirement requires an explicit must-run policy change
- WHEN a declared lens has a yield ratio below the minimum threshold and has at least the minimum of declared invocations THEN recommend `review`
- WHEN a lens has only proxy invocations (inferred from rows rather than declared via `--lenses`) THEN preserve `action: 'keep'` with a proxy note
- WHEN `--corpus <dir>` names additional archive directories THEN their `review.md` files join the corpus and `total_changes_analyzed` reflects them

#### REQ-TYPES-090: Lens Yield Configuration and Statistics Contracts
Define type contracts and schemas in `types/station.ts` for review lens yield statistics, thresholds, and retirement recommendations.
- WHEN lens yield thresholds are parsed, THEN `LensYieldThresholdsSchema` provides defaults `consecutive_zero_threshold: 5`, `min_invocations: 3`, `min_yield: 0.1` and validates positive integers for the first two and a 0–1 ratio for `min_yield`
- WHEN lens yield statistics are computed, THEN `LensYieldStatSchema` includes `lens`, `invocations`, `declared_invocations`, `confirmed_findings`, `yield_ratio`, `confirmed_per_invocation`, `consecutive_zero_changes`, `last_yield_change`, `action` (`retire` | `review` | `keep`), `reason`, and `invocation_source` (`declared` | `rows`)
- WHEN a full report is built, THEN `LensYieldReportSchema` aggregates `generated_at`, `total_changes_analyzed`, `thresholds`, and `stats[]`

#### REQ-LIB-065: Pure Function Lens Yield Computation and Staleness Recommendation Engine
Provide stateless computation functions in `lib/lens-yield.ts` for calculating lens yield statistics and retirement recommendations from an in-memory corpus of `ChangeReviewEntry[]`.
- WHEN an entry corpus is supplied, THEN calculate per-lens invocation counts (declared via `--lenses`, plus one rows-proxy invocation for an undeclared lens that reported a finding, tracked separately as `declared_invocations`), confirmed findings (`confirmed`, `fixed`, `verified`), yield ratio (`yield_ratio` = changes with at least one confirmed finding / invocations; `confirmed_per_invocation` = `confirmed_findings / invocations` is the auxiliary density), and consecutive zero-yield change counts
- WHEN a conditional or custom lens with invocation_source === 'declared' reaches consecutive_zero_threshold and declared_invocations >= min_invocations, THEN recommend action: 'retire' before considering low yield
- WHEN a must-run lens from REQ-TYPES-114 has invocation_source === 'declared' and declared_invocations >= min_invocations and either reaches consecutive_zero_threshold or has yield_ratio < min_yield, THEN recommend action: 'review', with a reason directing review of criteria, execution and attribution and stating that retirement requires an explicit must-run policy change; a qualifying conditional or custom lens below min_yield receives review when its retirement condition does not apply
- WHEN a lens has `invocation_source === 'rows'` (no declared run at all), THEN keep `action: 'keep'` with a proxy protection note stating invocations are approximate; a declared lens below `min_invocations` declared runs also stays `keep`, with the shortfall named in `reason`
- WHEN grouping a corpus, THEN recognize only the canonical IDs and explicit aliases in REQ-TYPES-114 after trim/lowercase, group each known lens under its canonical ID independently of encounter order, and count each change at most once per lens for invocations and declared_invocations while counting each confirmed finding under the existing confirmed-status rule
- WHEN a label is unknown or mixes concerns such as security/correctness, THEN retain existing trim/lowercase grouping and custom display selection without splitting labels or guessing aliases; an empty corpus produces an empty report
- WHEN neither the zero-yield nor low-yield condition qualifies, THEN keep the lens; classification does not change threshold comparison operators, report fields or action tokens
- WHEN calculating statistics or recommendations, THEN operate on in-memory projections without rewriting archive artifacts, finding labels, finding identities, evidence associations or review-round history

#### REQ-SERVICES-099: Lens Yield Service
Implement business service `executeYield` in `services/learn.service.ts` to scan historical review artifacts and build lens yield reports.
- WHEN `executeYield` is invoked, THEN read configuration from `.prospec.yaml` `learn.lens_thresholds`, scan the canonical archive from REQ-LIB-104 and any `extraCorpusDirs` (resolved against the working directory, deduplicated, ordered by date then name in code-point order) for `review.md` files, parse findings tables and metrics comments, and compute lens yield statistics; an `extraCorpusDirs` entry that is not an existing directory raises a `PrerequisiteError` while an absent default archive yields an empty corpus
- WHEN no archived reviews exist, THEN return an empty report gracefully without error
- WHEN invalid threshold values are provided in config or CLI overrides, THEN raise a `PrerequisiteError` with actionable remediation guidance
- WHEN either default or explicit archive corpus entries are scanned, THEN abandoned metadata and incomplete abandon operation markers exclude those attempts from review-yield statistics; legacy corpus entries without these markers retain existing behavior.
- WHEN shared history is scanned, THEN incomplete transfer entries are reported and excluded under REQ-LIB-105, default and explicit references to the same physical corpus are deduplicated, and local-only history is disclosed rather than counted as already shared.

#### REQ-CLI-044: prospec learn yield CLI Command
Add CLI subcommand and output formatter for lens yield statistics under `prospec learn yield`.
- WHEN `prospec learn yield` is executed, THEN display a formatted table of lens yield statistics sorted by yield ascending with recommended actions, color-coded status badges, and each lens's invocation source (`declared` vs `rows` proxy) so a proxy-protected keep is distinguishable from a healthy one
- WHEN `--json` flag is provided, THEN output the raw JSON `LensYieldReport` payload to stdout
- WHEN `--corpus <dir>` is provided (repeatable), THEN include each directory in historical review scanning

#### REQ-TEMPLATES-204: Prospec-Learn Lens Yield Staleness Sweep Guidance
Update `prospec-learn` skill template and references to integrate lens yield analysis into the Staleness Sweep workflow.
- WHEN the learn skill Staleness Sweep runs, THEN run `prospec learn yield` to analyze historical review findings across archived changes
- WHEN retirement recommendations are surfaced, THEN require explicit human approval before modifying team playbooks or lens configurations
- WHEN the Sweep interprets lens recommendations, THEN follow REQ-LIB-065: rows-only and insufficient-declaration evidence stays keep, must-run lenses never receive yield-based retirement, and a qualifying must-run review examines criteria, execution and attribution; conditional and custom recommendations retain their existing approval requirements

#### REQ-TESTS-100: Lens Yield Statistics and Recommendation Tests
Provide unit, service, contract, and CLI test suites validating lens yield calculations and reporting.
- WHEN test suites run, THEN verify calculation accuracy, declared vs proxy invocation distinction, threshold boundary conditions, legacy table tolerance, and CLI formatting
- WHEN the lens regression suites run, THEN cover known aliases across declarations and rows, encounter-order stability, cross-round change deduplication, multiple distinct findings, custom and mixed labels, proxy-only and insufficient evidence, exact threshold boundaries, all must-run canonical IDs and aliases, and conditional/custom recommendation compatibility
- WHEN declaration persistence is tested, THEN cover supplied, omitted and replayed lenses, preserve finding identity and evidence including id-less fallback and multiple findings at one location, and prove rejected or stale-gate requests do not introduce normalization writes
- WHEN rendered contract tests run, THEN compare the complete eight-lens set and classifications in the review skill and reviewer table to the shared registry, verify security summary and on-demand loading in all affected surfaces, and cover plain-text, filesystem-write and web/HTTP applicability; removing a must-run safeguard or a required rendered lens/classification makes the corresponding test fail
- WHEN measuring the templates synchronized with the shared lens registry with the established estimateTokens/mandatory-loading contract, THEN review mandatory context does not exceed the pre-change measured baseline, and that synchronization increases neither the cumulative mandatory-context nor the reference ceiling; record before/after values for all three metrics and retain exact-size fixture checks
- WHEN producing the fixed-corpus comparison, THEN record corpus scope and change count, input archive digests, before/after source versions and exact alias mapping, and the measured invocations, declared invocations, confirmed findings, yield, zero streak and actions; reading the corpus leaves its archive bytes unchanged
- WHEN the completed change is validated, THEN lint, typecheck, full Unit/Contract/Integration/e2e coverage tests with at least 80 percent coverage, counts:check, agents:check, knowledge:check and prospec check --strict pass, and bilingual public documentation, affected Knowledge and deployed templates are synchronized

#### REQ-TYPES-114: Shared shipped review lens registry
A read-only shipped review lens registry in types owns canonical IDs, explicit aliases, display labels, must-run or conditional classification, and short condition/summary text consumed by yield policy and template rendering.
- WHEN consumers enumerate the registry, THEN correctness, security and spec-architecture are must-run; performance, maintainability, docs-claims, parallel-site-completeness and test-quality are conditional, with one entry per canonical ID
- WHEN aliases are declared, THEN correctness & edge cases maps to correctness; security & data integrity, security-data-integrity and security/data-integrity map to security; efficiency / performance and efficiency/performance map to performance; maintainability / DRY and maintainability/DRY map to maintainability; parallel-site completeness maps to parallel-site-completeness; canonical IDs also resolve to themselves after trim/lowercase
- WHEN registry data is consumed, THEN detailed criteria and severity remain owned by their existing references, runtime grouping and policy stay in lib, and types has no dependency on lib or services; unknown names and mixed labels such as security/correctness are not registered aliases

---
