# Review: skill-template-partials

**Rounds:** 1 / cap 3   **Status:** review-clean (0 critical; 1 major fixed)

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| skill-format.test.ts (byte-sync guard) | major | test-quality | fixed — added a test asserting each committed `.claude`/`.agents` SKILL.md contains the full expanded partial block (a partial edit without resync → red) |

## Summary

Independent fresh-context reviewer audited the whole #60 diff vs the #59 branch base.
**0 critical, 1 major** (advisory) — fixed.

**Definitive verdicts (reviewer):**
- **(a) Does the generated marker risk breaking SKILL.md frontmatter/consumers?** No. It is an HTML comment inserted after the closing `---` and before the first `#` — outside the YAML frontmatter the registry/gray-matter parsers read. No prospec code parses the SKILL.md body (the CLAUDE.md skill list is generated from `SKILL_DEFINITIONS`, not by parsing SKILL.md; drift treats `.claude/` as opaque). `skill_name` is sourced from `skill.name` on the single render path — every marker names its own template (all 17 verified, none stale).
- **(b) Are the left-inline blocks genuinely non-identical?** Yes — leaving them inline is correct. `promote-backfill`/`learn` Output Contract note omits the "/ test result" segment (those skills run no tests); `promote-backfill`'s Next-Step Handoff hardcodes `/prospec-verify` as successor (backfill lands `implemented`). Extracting either would break byte-identity.

**Independently confirmed:** the deployed-SKILL.md diff is **marker-only** (34 files, 34 insertions, 0 non-marker changed lines). Extraction is byte-identical; dependency direction sound (partials registered in `lib/template.ts`, consumed by template resources).

## The fix
Added a byte-sync contract test: for each skill, reads the committed `.claude/skills/<name>/SKILL.md` and `.agents/skills/<name>/SKILL.md` and asserts they contain the full expanded `_next-step-handoff` / `_output-summary-note` block (with `{{knowledge_base_path}}` substituted) + the per-skill generated marker. A whitespace/content edit to a partial not followed by `agent sync` now turns this red — closing REQ-TESTS-047's byte-identical clause.

## Post-fix gates
`pnpm typecheck` / `test` (2023) / `lint` green; `pnpm counts:check` in sync; `prospec check` 10/10 (0 fail, 0 warn).
