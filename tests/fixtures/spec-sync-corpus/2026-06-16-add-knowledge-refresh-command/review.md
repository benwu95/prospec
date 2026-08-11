# Review: add-knowledge-refresh-command

**Rounds:** 1 / cap 3   **Status:** review-clean

Mode A — 4 independent fresh-context lenses (correctness, spec-architecture, maintainability/DRY, security). Each ran `tsc`/`vitest` itself. **0 critical**, loop converged round 1. No auto-fix applied (no confirmed critical). Findings below are advisory (major/nit) → passed to `/prospec-verify` as WARN.

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/cli/formatters/knowledge-refresh-output.ts:25 | major | security | proposed → verify WARN |
| src/services/archive.service.ts:491-499 | major | security/correctness | proposed → verify WARN |
| src/templates/skills/prospec-archive.hbs:129 | major | spec-architecture | proposed → verify WARN |
| SC-005 archive→raw-scan rewrite (test coverage) | major | spec-architecture | proposed → verify (dim 1-2) |
| src/services/knowledge-init.service.ts:49 (dup readConfig) | nit | correctness | dropped |
| src/services/archive.service.ts:494 (refresh uses default depth 10) | nit | correctness | dropped |

## Critical findings
None. Behavior-preserving extraction confirmed byte-for-byte against `HEAD` (4 moved helpers identical; `rawScanContext` field-for-field identical; only `fileExistsSync`→shared `fileExists`). Dependency direction clean (`cli→services→lib→types`; `archive`/`init`→`raw-scan` is service→service, matching the `archive→knowledge-update` precedent). No spec contradiction for REQ-KNOW-022..026. Skill-format contract safe — generate Startup Loading step 4 keeps `{{knowledge_base_path}}/raw-scan.md` as its first backtick token, no new item, no MANDATORY → baseline needs no regen (430 contract tests green). Persona/fallback wording consistent (quickstart=remind-install, no npx; generate/archive=ladder; devDep conditioned on Node.js).

## Advisory majors (defensible as-is; not auto-fixed per severity contract)
1. **knowledge-refresh-output.ts:25** — `result.outputFile` (config-derived path) printed without `sanitizeTerminal`. **Consistent with the sibling `knowledge-init-output.ts:50`** (also unsanitized); the convention pitfall targets `check/measure/error` (untrusted report strings), not the scan-output path. Low risk (needs control bytes in `base_dir`). Fixing only refresh would diverge from init — proper fix touches both formatters (out of this change's scope).
2. **archive.service.ts:491-499** — non-fatal raw-scan refresh `catch {}` is silent. **Matches the sibling `knowledge-update` catch** (also silent on throw; only forwards success-path `ku.warnings`). `generateRawScan` returns no warnings, so there is nothing to forward on success. Could optionally surface a warning, but current behavior is pattern-consistent.
3. **prospec-archive.hbs:129** — archive's refresh step gives thinner non-Node fallback wording than generate's Prerequisite ladder. Technically REQ-KNOW-026-compliant (archive step is a terminal safety net; full nuance lives in generate). Consistency nit-to-minor.
4. **SC-005 coverage** — `archive.service.test.ts` mocks `generateRawScan`, so the archive→raw-scan refresh is verified at the **wiring** level, not as a real rewrite. Per the review contract, REQ/SC completeness is `/prospec-verify`'s dimension, not a review critical — flagged for verify.

## Good practices observed
- `RawScanResult.files` returned so `init` reuses the single scan (extraction *removed* a would-be double `scanDir`).
- Idempotency test reasons correctly about the +1 first-run artifact (fixpoint, not first==second).
- archive test mocks the service to isolate the wiring and asserts `toHaveBeenCalledWith(objectContaining({cwd}))` without over-specifying.
