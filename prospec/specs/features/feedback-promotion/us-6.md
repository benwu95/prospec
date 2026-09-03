## US-6: Executor Label Vocabulary and Per-Executor Statistics [P1]

As a project maintainer,
I want the self-declared `executor` recorded on verify dimensions and review baselines to come from a vocabulary my `.prospec.yaml` declares, and `prospec learn stats` to aggregate grades, dimension results, grading contexts, spend and false greens per label,
so that the executor field #203 opened becomes group-by-able data with a real consumer, and an executor that self-grades too generously is exposed by the archive record rather than by memory.

**Acceptance Scenarios:**
- WHEN `.prospec.yaml` declares `executors` and a provenance writer receives a label outside it THEN the write is refused before any byte reaches disk and the declared labels are listed
- WHEN no `executors` vocabulary is declared THEN every non-empty label is accepted and the write paths behave byte-identically to before the key existed
- WHEN `prospec learn stats` runs over the archive THEN one block per executor label reports grade distribution, dimension results, grading contexts, spend median and false-green count, with unlabeled dimensions and skipped records disclosed
- WHEN `--json` is passed THEN `executor-stats-report.json` is written under the working directory while stdout stays human-readable

---

#### REQ-TYPES-095: Executor Stats Report Contracts
`ExecutorStatSchema` (`executor`, `changes`, `verify_entries`, `grades` keyed by every verify grade, `dimension_results` keyed by every dimension result, `graded_by` keyed by every grading context, `spend {samples, median | null}`, `review_baselines`, `false_greens`) and `ExecutorStatsReportSchema` (`generated_at`, `total_changes_analyzed`, `skipped`, `unlabeled_dimensions`, `stats[]`) sit beside the lens-yield contracts in `types/station.ts`; `EXECUTOR_STATS_REPORT_FILENAME` (`executor-stats-report.json`) is the one name every writer and reader of the `--json` file imports.
- WHEN a stats report is built, THEN it validates against `ExecutorStatsReportSchema` and its count records carry a key for every registered grade, dimension result and grading context (zero when unseen)
- WHEN the `--json` file name is needed, THEN it is imported from `EXECUTOR_STATS_REPORT_FILENAME`, never spelled inline

---


#### REQ-LIB-076: Per-Executor Statistics Aggregation Engine
`aggregateExecutorStats(records, generatedAt)` is a pure function over parsed archive metadata: it groups `quality_log[].dimensions[].executor` (normalized — trimmed, whitespace runs collapsed) into one stat per label sorted by code point; a `spend` that is negative or not finite is ignored rather than allowed to fail the report; for every `prospec-verify` entry carrying a `grade`, each distinct executor among its dimensions receives that grade once; dimension results and grading contexts are counted per dimension; `spend` takes one sample per (entry, executor) before the median; a false green is counted at most once per change for the executor named in `review_provenance.executor` when a `prospec-verify` entry dated on or after the baseline carries any `FAIL` dimension; non-machine (judgment) dimensions without an executor increment `unlabeled_dimensions` while machine dimensions never carry one and are not counted; the result is validated by `ExecutorStatsReportSchema` before it is returned.
- WHEN a verify entry carries three dimensions with the same executor and one spend, THEN that executor's grade count rises by one and its spend samples by one
- WHEN a judgment dimension has no executor, THEN no group is created and `unlabeled_dimensions` increments; a machine dimension is never counted
- WHEN a change's `review_provenance.executor` is E and a later verify entry has a FAIL dimension, THEN E's `false_greens` rises by exactly one for that change
- WHEN the corpus is empty, THEN the report has zero stats and zero counts and still validates

---


#### REQ-SERVICES-108: Learn Stats Service
`learn-stats.service` enumerates archived change directories through the `listArchivedChangeDirs` export shared with the lens-yield scan (an explicit `--corpus` that is not a directory is refused, the default archive may be absent), reads each `metadata.yaml` leniently (a missing, unparseable or non-mapping file increments `skipped`), aggregates with `aggregateExecutorStats`, and when `json` is set writes the report to `EXECUTOR_STATS_REPORT_FILENAME` under `cwd` and returns that path; it reads no config and writes no change artifact.
- WHEN the archive is absent or carries no executor, THEN the report has zero stats, `skipped` and `unlabeled_dimensions` are reported, and the exit code is 0
- WHEN one metadata.yaml cannot be parsed, THEN `skipped` increments and the other changes are still aggregated
- WHEN `--json` is set, THEN `executor-stats-report.json` is written atomically under `cwd` and `reportPath` names it
- WHEN `learn yield` runs after this change, THEN its corpus order and `--corpus` refusal text are unchanged

---


#### REQ-CLI-052: prospec learn stats CLI Command
`prospec learn stats [--json] [--corpus <dir>]` registers beside `upsert` and `yield`, loads its service inside the action, and prints one block per executor (grade distribution, dimension results, grading contexts, spend median, review baselines, false greens) plus the corpus totals, every free-form string passing through `sanitizeTerminal`; `--json` writes `executor-stats-report.json` and keeps stdout human-readable, naming the written path, and its help text states that difference from `learn yield --json`. The non-empty executor parser moves to `cli/parse-options.ts` and is shared by `verify record` and `check`.
- WHEN `prospec learn stats` runs, THEN stdout lists each executor group with its counts and the corpus totals
- WHEN `--json` is passed, THEN the report file is written and stdout names its path instead of dumping JSON
- WHEN `--executor ""` is passed to `verify record` or `check`, THEN the shared parser refuses it with the existing non-empty message

---


#### REQ-TEMPLATES-227: Executor Label Guidance in Shipped Templates
The shipped templates teach the label, never a model: every `prospec check --record-review` command line in `prospec-review` carries `[--executor <label>]` and states the label must be one the project's `.prospec.yaml` `executors` declares when it declares any; `prospec-learn`'s Staleness Sweep names `prospec learn stats` as the per-executor false-green source; `metadata-format` describes `executor` as a label validated against the declared vocabulary and consumed by `learn stats`, and marks `review_provenance` as carrying an optional `executor`; `config-example.yaml` documents `executors` with abstract placeholder labels and the undeclared-means-free-string rule.
- WHEN the review skill is rendered, THEN each `--record-review` command line includes `--executor <label>`
- WHEN the config example is rendered, THEN it carries an `executors` key with a comment explaining the undeclared behavior
- WHEN any judgment-station template is scanned, THEN it names no model or vendor

---


#### REQ-TESTS-112: Executor Vocabulary and Stats Tests
Unit tests pin both vocabulary branches and the trim rule, every aggregation field (grade attribution, per-(entry, executor) spend median for odd and even sample counts, the once-per-change false-green cap, `unlabeled_dimensions`, code-point order, the empty corpus), the byte-identical refusal in both write paths, the stats service's `skipped` and `--json` behavior, and the formatter's sanitization; contract tests pin every `--record-review` command line in the review template, the config example's `executors` key, the model/vendor-name negative scan extended to `skills/references/metadata-format.hbs` and `references/config-example.yaml.hbs`, and a root-README parity check that both `README.md` and `README.zh-TW.md` document `learn stats`; e2e runs `learn stats` with and without `--json`, `check --record-review --executor`, and the declared-vocabulary refusal through both commands.
- WHEN the vocabulary is declared in a fixture, THEN both `verify record` and `check --record-review` refusal tests assert metadata.yaml is unchanged
- WHEN the aggregation tests run, THEN each report field is asserted at least once, including the empty-corpus report
- WHEN the e2e `--json` case runs, THEN `executor-stats-report.json` exists under the fixture cwd and validates against the schema
