# Review: quick-scale-and-ceremony-cleanup

**Rounds:** 2 / cap 3   **Status:** review-clean   **Mode:** A (4 parallel independent lenses)

Lenses: correctness · test-quality (PB-001) · parallel-site completeness (PB-006/007) · spec-architecture + PB-002 + docs-claims. Each critical was independently confirmed (repro / grep / mutation / exact-line read) before fixing; all fixes applied to the working tree, full suite re-run green (1991/1991).

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/lib/drift-sources.ts:825 (collectMetadataCompleteness) | critical | correctness | fixed — `parseYaml` returns `null` (no throw) on empty/blank/comment-only/`null` metadata; old code then dereferenced null and aborted the whole `prospec check`. Guard routes any non-mapping parse into the fully-incomplete branch. Repro-verified + test added (c6–c8). |
| src/templates/skills/references/review-lenses-content.hbs:110 | critical | parallel-site / docs-claims | fixed — stale `readme-counts` reference (renamed check id) in a shipped template; updated to `mcp-readme-counts` + noted its MCP-only scope. Deployed refs regenerated. |
| tests/unit/lib/drift-sources.test.ts (grade cases) | critical | test-quality | fixed — the `hasVerifyGrade` S/A clause was unpinned (dropping it survived every test). Added c10 (verify+`B`→missing) and c11 (review+`A`→missing); mutation-verified (dropping the clause turns c10 red). |
| prospec/CONSTITUTION.md:78 | critical | spec-architecture | fixed — Constraints checklist still asserted a pre-plan INVEST hard-gate, contradicting the reworded advisory clause; reworded to "advisory nudge at new-story, enforced at verify". |
| src/templates/skills/prospec-tasks.hbs:62,144 | major | docs-claims (PB-003) | fixed — "no downstream skill reads `[P]`" was false (implement.hbs reads it as a best-effort reminder); reworded to "no skill *gates* on them". |
| src/templates/skills/prospec-verify.hbs:240 | major | spec-architecture | fixed — condensed quick report conflicted with the "6 dimension sections present" Success Criterion; scoped the criterion for `scale: quick`. |
| tests/contract/skill-format.test.ts:1704 | major | test-quality | fixed — Language-Policy exemption asserted 3 loose substrings; a meaning-inverted rewrite would pass. Replaced with an association match (`AI Knowledge base .* remain in English`). |
| tests/unit/lib/drift-sources.test.ts:503 | major | test-quality | fixed — "present-but-empty field" branch (`name: ""`) was uncovered; added c9. |
| prospec/index.md; modules/{types,tests}/README.md; specs/features/drift-detection.md | major | knowledge-lag | proposed → deferred by design — prose still says `readme-counts`/"9 ids"; module-README/index sync at the verify S/A commit prompt, the drift-detection feature spec graduates at archive Phase 3.5. Expected pre-verify/pre-archive state, not drift. |
| src/lib/drift-sources.ts (collectMetadataCompleteness enumeration) | nit | maintainability | dropped — re-walks `.prospec/changes/` like the sibling collectors; matches the established per-collector pattern, divergent parse-fail semantics make sharing awkward. Candidate for a later refactor. |

## Verified-clean (reviewer-confirmed, no action)

- `metadata-completeness` gate is fully backed and wired (types id + lib collector/evaluator + services); the archive claim matches the implementation exactly; CLI-unavailable fallback scoped to this change; aggregate-across-changes shape mirrors the already-accepted `review-provenance` gate.
- Quick verify reduction skips no *applicable* dimension (2/5 stays a visible `not-applicable`; 1/3/4/5 run in full).
- Checkpoint-commit removal is clean — no dangling reference; implement/verify commit semantics unified.
- Language Policy internally consistent across CONSTITUTION.md, entry.md.hbs, and the ledger; no place still requires AI Knowledge in zh-TW.
- Dual status-lifecycle copies (canonical + shipped template) byte-identical in the added section.
- Quality-Gate dedup: full table only in verify; metadata-completeness wired at all four surfaces.
