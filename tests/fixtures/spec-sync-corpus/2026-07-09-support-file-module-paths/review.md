# Review: support-file-module-paths

**Rounds:** 2 / cap 3   **Status:** review-clean (0 unresolved critical; M1 fixed on user request, M2 deferred)

**Reviewer:** independent fresh-context (mode B, multi-lens). Empirically verified the core feature (fast-glob: literal file → matches, bare dir → `[]`, `dir/**` → subtree), traced every `.paths` consumer (PB-007), confirmed containment guard identical to `clampModulePaths`, and confirmed all 7 new tests mutation-sensitive.

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/lib/drift-sources.ts:688 (`importScanPattern` file branch) | major | correctness/edge-case | fixed (round 2) |
| src/lib/scanner.ts:244 + src/lib/drift-sources.ts:296 (`.includes('*')` glob test) | major | spec-architecture/consistency | deferred → verify WARN |

## Criticals
None. Change is correct, spec-faithful, dependency-direction-clean; strictly improves on pre-change behavior (a file `paths` entry used to crash `prospec check` with ENOTDIR — now works).

## Majors (advisory — do not block grade)

**M1 — file short-circuit drops the source-extension guard. → FIXED (round 2, user-requested).**
A `paths` entry pointing at a *non-source* file was read and import-regex-scanned; an import-like line in it could emit a spurious cross-module edge → a false dependency-direction finding in `prospec check`. (Correction to the reviewer's scenario: a ```` ```ts ```` *fenced* block is already blanked by the template-literal stripper, so the real vector is a **bare, unfenced** import line in a non-source file — narrower still, a misconfiguration.)
Fix applied: `importScanPattern` returns `null` for a non-source file entry (`/\.(?:ts|tsx|mts|cts|js|jsx)$/` gate) and `collectImportEdges` skips a `null` pattern. This avoids both the spurious edge and the reviewer's own suggested fix, which was buggy (`${prefix}/${EXT}` scandir-s a file → reintroduces ENOTDIR). New test `tests/unit/lib/drift-sources.test.ts` (non-source file entry → no edge) is mutation-verified (reverting the guard → RED with `alpha->beta`). Full suite 2112 green.

**M2 — non-`*` glob syntax diverges between callers (pre-existing heuristic).**
Both `classifyModulePath` and drift's `isGlob` detect globs via `.includes('*')` only. fast-glob magic without `*` (`packages/{a,b}/src`, `config.?s`, `src/[ab]`) is classified `missing`/literal: knowledge passes it verbatim to fast-glob (which brace-expands and matches), drift `existsSync` fails and silently skips it — the exact cross-caller divergence this change targets, for rarer glob syntax. Exotic (real module-maps use `*`/`**`); pre-existing on the drift side.
Optional fix: broaden the glob test to `/[*?{}[\]]/` in both spots.

## Good practices observed
- Single-source `classifyModulePath` with containment explicitly aligned to `clampModulePaths`.
- knowledge-update partial-mock keeps the real classifier/`moduleScanPatterns` against memfs, stubbing only fast-glob-backed `scanDir` — real wiring, not a tautology.
- Tests carry positive controls (bare dir → `[]`) and prove containment (real file just outside cwd), with explicit "revert → red" rationale.
