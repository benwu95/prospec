# sync-knowledge-at-verify-commit — Archive Summary

- **Archived**: 2026-07-04
- **Original Created**: 2026-07-04
- **Quality Grade**: A
- **Scale**: standard · **Issue**: #65 (part b) · **Commit**: 0682ca5 (branch `benwu95/feat/generate-factual-counts`)

## User Story

As a prospec maintainer, I want module-README Knowledge sync + factual-count re-derivation folded
into the `/prospec-verify` S/A commit prompt (before the commit), with the `/prospec-archive` Entry
Gate demoted to a backstop, so a source-only feature commit no longer flips drift `knowledge-health`
stale — eliminating the PB-005 (`archive/knowledge-sync-touched-module-readme`, freq 17) per-change
stale-then-fix chore. Feature Specs still graduate only at archive Phase 3.5 (deadlock avoidance).

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | `prospec-verify.hbs` commit-prompt 3-step sync (generic wording; `scale: backfill` carve-out); `prospec-archive.hbs` Entry Gate → backstop (still FAILs); `init/status-lifecycle.md.hbs` §What each gate checks reworded |
| tests | Medium | `skill-format.test.ts` — 5 new section-scoped + mutation-verified assertions; 2 pre-existing assertions updated off the old single-checkpoint model |
| (docs, non-module) | Low | canonical `_status-lifecycle.md` (verbatim-identical to template); README×2 "Why Prospec?" row; index.md + services/templates/tests module READMEs describe commit-prompt prevention + Entry-Gate backstop |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-129 | ADDED | Verify S/A commit prompt folds `/prospec-knowledge-update` + count re-derivation into the feature commit (generic; backfill carve-out; no re-stale) |
| REQ-CHNG-004 | MODIFIED | Knowledge-sync prevention point = verify S/A commit prompt; archive Entry Gate = backstop; Feature Specs still archive-only |
| REQ-TEMPLATES-045 | MODIFIED | Verify staleness note points to the commit prompt (Entry Gate re-confirms as backstop) — synced in both sdd-workflow + ai-knowledge copies |
| REQ-TEMPLATES-083 | MODIFIED | Archive Entry Gate reframed from "single mandatory checkpoint" to backstop (still FAILs when unsynced) |

## Completion

- **Tasks**: code tasks 100% complete. `[M]` agent sync done; `[M]` dogfood done (see below); `[V]` mutation-verify done.
- **Acceptance Criteria**: US-1 + US-2 met. **Dogfooded on this change's own commit**: 0682ca5 touched
  templates + tests source AND their synced module READMEs in one commit → **post-commit `prospec check`
  `knowledge-health` PASS, 0 stale** (the PB-005 stale-then-fix did not trigger — issue #65 acceptance met).

## Review & Verify

- **Review**: 1 round, 1 critical / 1 major (both fixed) — **critical**: the new commit-prompt step was
  not scale-aware; a `scale: backfill` change's feature-slug REQ ids would mint phantom modules via
  REQ-prefix `/prospec-knowledge-update` (the exact hazard archive.hbs:139 guards) → added a
  `scale: backfill` carve-out (defer module derivation to the Entry Gate) + corrected the backfill note.
  **major**: `services/README.md` still called the Entry Gate "the mandatory checkpoint" → reworded to
  backstop (PB-007 parallel-site sweep). Verifier-confirmed against the archive guard.
- **Verify**: Grade A — 1/5 tasks PASS, 2/5 delta-spec PASS (129/CHNG-004/045 implemented), 3/5 Constitution
  full-audit PASS, 4/5 knowledge-health PASS (0 stale, 6/6), 5/5 tests WARN, 6 design skipped. drift 8/8 PASS.
- **Quality Log**: review PASS (1 crit + 1 major fixed); verify A. One known **environmental** WARN —
  `tests/e2e/cli.test.ts` "prospec --help" 5s-timeout flake (nondeterministic under full-suite load; passes
  in isolation; this change touches no `cli/` code). Not a regression.

## Knowledge Update

- Synced at the verify S/A commit prompt (dogfood): templates/tests/services module READMEs + index.md
  describe the commit-prompt prevention + Entry-Gate backstop; counts re-derived via `pnpm counts`
  (tests 1926→1934). All folded into 0682ca5 → `knowledge-health` 0 stale post-commit.
- **PB-005 note**: this change is the structural fix for `archive/knowledge-sync-touched-module-readme`
  — its recurrence was NOT incremented this archive (the new commit-prompt kept the feature commit synced).
  Together with part a (`generate-factual-counts`, PB-004), issue #65's two structural stale-then-fix
  root causes are addressed.
