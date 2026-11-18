# Knowledge Size

> Sub-module of [Shared Kernel](./README.md) — the `knowledge-size` collector, its merge-base ratchet, and the evaluator that grades both.

## Key Files

| File | Purpose |
|------|---------|
| `drift-sources.ts` | `collectKnowledgeSize` (six surfaces) and the private `applySizeRatchet` with `ratchetBaseRef`, `symlinkOnPath`, `indexPathsIgnoringCase`, `treeModes`; `KnowledgeSizeRatchet` / `KnowledgeSizeRatchetCause` — the collector→evaluator contract, declared here, not in `types` |
| `drift-checker.ts` | `evaluateKnowledgeSize` + `ratchetGrade` (per unit: tokens, and lines where the rule has a `lineKey`) and `RATCHET_REMEDY` (cause → the fix an unresolvable ratchet names) |
| `types/config.ts` | `overBudgetUnits` — the one over-budget predicate: the ratchet picks its targets with it and the evaluator grades with it |

## Public API

- `collectKnowledgeSize(cwd, baseDir, knowledgePath, budget, additionalCore, ratchet, inWorkTree)` → `KnowledgeSizeSource`; `ratchet` absent = not configured
- `evaluateKnowledgeSize(src)` → `CheckOutcome`

## Dependencies

**Depends on:** `types/config` (`KNOWLEDGE_SIZE_RULES`, whose `ratchet` flag is true for `l1`/`l2` only; `knowledge.size_ratchet` is shape-agnostic in the schema), `types/drift-report` (`knowledge_size` with optional `base_commit`/`base_actual`/`ratchet_actual`/`ratchet_skipped`), `git-read` (`GIT_READ_TIMEOUT_MS`; `readIndexEntries` behind `listPathspecs`)
**Used by:** `drift-assessment.ts` → the check, status, verify-record and archive entry points

## Modification Guide

1. **Add a surface** — a `KNOWLEDGE_SIZE_RULES` row decides budget key, remedy and `ratchet`; the evaluator has no per-kind branch.
2. **Change what the ratchet reads** — keep every git read inside `applySizeRatchet`'s `try` and bounded by `GIT_READ_TIMEOUT_MS` — `gitCapture`, plus the index read (`listPathspecs`) and the project prefix (`gitProjectPrefix(cwd, { timeout })`) — and every pathspec `:(literal)` — `gitCapture` drops `git-read`'s `PATHSPEC_ENV`, since an inherited `GIT_LITERAL_PATHSPECS=1` would read the prefix as part of the name; a new failure returns `unresolvable(cause, reason)`, a new per-file exception `{ skipped }`. Pin both in `tests/unit/lib/drift-sources-git-capture.test.ts` (fault flags) and `tests/integration/knowledge-size-ratchet.test.ts` (real git).

## Ripple Effects

- `RATCHET_REMEDY` is the only producer of the unresolvable fix text; `docs/reference/configuration*.md` describe it.
- The skill-side ratchet rule lives only in `prospec-knowledge-update`/`-generate`: `_knowledge-loading-rules.hbs` also renders into every downstream `index.md`, so it carries no ratchet procedure.

## Pitfalls

- `collectKnowledgeSize` measures SIX surfaces (`l1`/`l2`/`spec`/`demand-knowledge`/`skill`/`reference`), each graded through `KNOWLEDGE_SIZE_RULES`. Its l1+demand halves come from ONE `filterConventions` split — the same rule the index writers use, `additional_core_conventions` included, so a promoted convention is graded L1 as its own index.md declares. Skill/reference are collected only in authoring mode (the project holds `src/templates/skills/`), deduped by skill NAME across agent paths (two names = two skills, even via symlink).
- The ratchet reads only over-budget items of a ratchet-governed kind and annotates them only after every read succeeded: any failed read makes the whole ratchet unresolvable — one `fail` on `.prospec.yaml` with no `knowledge_size`, every item a plain warn (PB-013).
- A path missing from the merge-base tree is absent (new debt, FAIL) unless an ancestor is a gitlink (160000) or symlink (120000) there — `ls-tree` cannot list what lies behind a link. Ancestors include the project directory and the repository directories above it (`gitProjectPrefix`, listed with `ls-tree --full-tree`); every `ls-tree` pathspec is `:(literal)`, so a directory named `:x` is a path, not magic. Ancestors match by exact path: for a directory pathspec `ls-tree` may print its children instead of itself. A knowledge base wholly inside a submodule is therefore never ratcheted.
- Only modes 100644/100755 are measured: `cat-file --filters` on a tree, or on a gitlink whose oid is a commit of the same repository, exits 0 and prints that object.
- With `core.ignorecase=true` the lookup path is the index's one case-insensitive match (`ls-files :(icase,literal)` through `listPathspecs`, which drops only `GIT_*_PATHSPECS` and keeps the caller's `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`); `ls-tree` rejects `icase` magic. Several matches → skipped; none (untracked) → the working-tree path. The probe needs `git config --default` (git ≥ 2.18) and runs only when some item is a target.
- `gitCapture` returns null without an exit code, so a failed or timed-out `merge-base` reads as no merge-base (`ref`) — whose fix therefore names the base, full history and a re-run.
- Line endings never decide growth: the base blob and the current text (`lf_measure`, set only when the file holds a `\r`) are both measured with carriage returns removed, while `actual` stays raw; a unit fails only when its normalized size is over budget too. When that size differs from `actual` the finding carries it as `ratchet_actual`, which the fail detail and the check output pair with `base_actual`.
- An absent base (`null`) fails with its own detail ("absent at merge-base", a new or renamed path), never as "grew past".
- Git-bound tests pin `core.ignorecase` (`git init` derives it from the filesystem) so macOS and Linux CI take the same branch.
