# Terminal History

> Canonical terminal storage, verified bundle publication and retained-work integrity across registered worktrees.
<!-- prospec:module-readme-format 2026-09-01 -->

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `history-paths.ts` | Resolve and recheck separate source/history project roots using registered primary worktree, common-dir and project prefix |
| `terminal-transfer.ts` | Exclusive writer claim, durable operation journal, copy/verify/publish/cleanup, readiness and local-history diagnostics |
| `archive-paths.ts` / `abandon-paths.ts` | Canonical terminal naming and contained entry selection |
| `abandon-history.ts` | Terminal abandoned metadata, patch/blob integrity, optional gitlink pins, retry identities and source-scoped blockers |
| `work-preservation.ts` | Project-scoped binary patches and changed-node preservation; source capture recheck |
| `premise.ts` | Captured causal inputs with per-input containment roots and pre-write rechecks |

## Public API

- `resolveHistoryPaths` / `recheckHistoryPaths` / `historyOrigin` — named roots and source identity; proven non-Git projects retain local roots.
- `transferBundle` / `withHistoryClaim` — services prepare terminal metadata in private staging; shared publication verifies complete inventories before cleaning source.
- `inventoryTree` / `preflightTransferSource` — sorted node inventory and shared read-only source admission for dry-run and transfer; unsafe paths, reserved pointers and unsupported nodes refuse.
- `readHistoryOperation` / `assertHistoryFinalizable` / `readHistoryOperations` — marked lineage and phase admission; finalize requires complete cleanup.
- `assertNoPendingHistory` / `diagnoseLocalHistory` — origin-scoped write blockers and explicit local-only/conflict import remedies.
- `readAbandonedBundle` / `readAbandonHistory` — terminal metadata plus preservation hashes; original worktree need not exist.

## Dependencies

**Depends on:** `types/history`, `types/abandon`, `types/errors`; closed `git-read`, contained `knowledge-reader`, atomic file/YAML helpers and metadata validation.
**Used by:** archive/finalize, abandon, history import, story/retry, status and learn services.

## Modification Guide

1. **Add a history consumer** — resolve named roots once; use shared readiness and integrity readers. Keep active/config/spec/Knowledge operations rooted in the executing source project.
2. **Change publication** — modify the shared transfer owner and fault tests together; services supply only staged preparation, never an independent move/claim implementation.
3. **Change retry inputs** — preserve original metadata bytes and identity; capture each input with its own allowed root, then recheck immediately before writing.

## Pitfalls

- Main means registered primary worktree, independent of branch name. The corresponding project must exist, share the Git common-dir and prefix, and have readable config. Bare/unsafe/missing topology refuses; only an absent resolved history directory means empty history.
- The writer claim is exclusive and never reclaimed by age. Operation origin includes common-dir, worktree, project prefix and change name, so sibling same-name changes cannot inherit each other's pending operation.
- Publication stages on the destination filesystem, records original/prepared inventories separately, creates final exclusively and writes its reserved pointer first. Copy verification precedes source cleanup; modified source entries survive and cause failure. Transfer errors, including writer claim release failures, name the current phase and actual source/staging/final/journal locations.
- Private copies temporarily allow directory writes for preparation, transient-pointer removal and staging cleanup, restoring retained directory modes afterward. Source directory modes are never widened; source cleanup can remain pending when its permissions prevent removal.
- Published cleanup-pending bundles are readable but cannot finalize. Missing/corrupt lineage on a marked bundle is never legacy. Complete summaries may be edited; initial inventory is not an immutable-history requirement.
- Legacy imports are copy-only and retain basename, metadata bytes, manifest origin and retry digests. Their transient pointer disappears only after verified complete publication. Identical trees deduplicate; conflicts refuse without suffixes or overwrite. Marked modern inputs permit canonical no-op or identical canonical copies only.
- Abandoned reads verify staged/unstaged patches and every regular blob against recorded hashes and safe paths; optional gitlinks must parse. Preservation records work without restoring it or guaranteeing referenced Git objects survive repository deletion.
- Nonignored `.prospec` work remains in preservation except the current transfer's own destination/staging/journal/claim. Git state capture does not refresh the index; snapshot rechecks exclude exactly the same owned paths.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
