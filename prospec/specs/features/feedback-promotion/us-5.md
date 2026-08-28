## US-5: Review Lens Yield Statistics and Retirement Guidance [P1]

As a project maintainer,
I want Prospec to calculate confirmed yield statistics for each review lens across archived changes,
so that I can identify low-yield or stale lenses and make data-driven decisions on whether to review, retire, or keep them.

**Acceptance Scenarios:**
- WHEN `prospec learn yield` is executed THEN display a sorted table of lens yield statistics including invocation count, confirmed finding count, yield ratio, consecutive zero-yield changes count, and recommended actions
- WHEN a declared lens reaches the consecutive zero-yield threshold and has at least the minimum of declared invocations THEN recommend `retire`
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
- WHEN a lens with `invocation_source === 'declared'` has consecutive zero-yield changes reaching `consecutive_zero_threshold` and `declared_invocations >= min_invocations`, THEN recommend `action: 'retire'`
- WHEN a lens with `invocation_source === 'declared'` has `yield_ratio < min_yield` and `declared_invocations >= min_invocations`, THEN recommend `action: 'review'`
- WHEN a lens has `invocation_source === 'rows'` (no declared run at all), THEN keep `action: 'keep'` with a proxy protection note stating invocations are approximate; a declared lens below `min_invocations` declared runs also stays `keep`, with the shortfall named in `reason`

#### REQ-SERVICES-099: Lens Yield Service
Implement business service `executeYield` in `services/learn.service.ts` to scan historical review artifacts and build lens yield reports.
- WHEN `executeYield` is invoked, THEN read configuration from `.prospec.yaml` `learn.lens_thresholds`, scan `.prospec/archive/` and any `extraCorpusDirs` (resolved against the working directory, deduplicated, ordered by date then name in code-point order) for `review.md` files, parse findings tables and metrics comments, and compute lens yield statistics; an `extraCorpusDirs` entry that is not an existing directory raises a `PrerequisiteError` while an absent default archive yields an empty corpus
- WHEN no archived reviews exist, THEN return an empty report gracefully without error
- WHEN invalid threshold values are provided in config or CLI overrides, THEN raise a `PrerequisiteError` with actionable remediation guidance

#### REQ-CLI-044: prospec learn yield CLI Command
Add CLI subcommand and output formatter for lens yield statistics under `prospec learn yield`.
- WHEN `prospec learn yield` is executed, THEN display a formatted table of lens yield statistics sorted by yield ascending with recommended actions and color-coded status badges
- WHEN `--json` flag is provided, THEN output the raw JSON `LensYieldReport` payload to stdout
- WHEN `--corpus <dir>` is provided (repeatable), THEN include each directory in historical review scanning

#### REQ-TEMPLATES-204: Prospec-Learn Lens Yield Staleness Sweep Guidance
Update `prospec-learn` skill template and references to integrate lens yield analysis into the Staleness Sweep workflow.
- WHEN the learn skill Staleness Sweep runs, THEN run `prospec learn yield` to analyze historical review findings across archived changes
- WHEN retirement recommendations are surfaced, THEN require explicit human approval before modifying team playbooks or lens configurations

#### REQ-TESTS-100: Lens Yield Statistics and Recommendation Tests
Provide unit, service, contract, and CLI test suites validating lens yield calculations and reporting.
- WHEN test suites run, THEN verify calculation accuracy, declared vs proxy invocation distinction, threshold boundary conditions, legacy table tolerance, and CLI formatting
