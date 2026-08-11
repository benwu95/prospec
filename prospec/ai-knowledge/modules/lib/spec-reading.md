# Spec Reading

> Sub-module of [Shared Kernel](./README.md) — the ONE definition of a feature-spec REQ heading, the index derived from it, and the REQ-scoped read both the CLI and the MCP server serve from.

## Key Files

| File | Purpose |
|------|---------|
| `spec-headings.ts` | `matchReqHeading` (the heading rule), `REQ_ID_SOURCE` (the id shape, exported as regex SOURCE), `readSpecCounters` (declared vs body counters), `indexSpec` (ordered REQ + story records with boundaries), `DEPRECATED_SECTION` |
| `spec-slices.ts` | `selectSpecSlices` (pure selection by REQ id / story id → slices + misses) and `renderSpecSlices` (slices back to spec source) |

## Public API

- `matchReqHeading(line, {includeStruck})` → `{id, level}` at any ATX level; struck ids are opt-in and exist for the DEFINITION inventory alone
- `readSpecCounters(content)` → what the frontmatter declares beside what the body holds
- `indexSpec(content, {includeStruck})` → `{requirements, stories}`; each requirement carries id, level, owning story, deprecated flag and content boundaries
- `selectSpecSlices(content, index, {req, story})` → `{slices, misses}`; `renderSpecSlices(selection)` → markdown

## Dependencies

**Depends on:** `markdown-fences` (the other leaf) — nothing else, so `lib/drift-sources` and `services/archive` import this without a lib→lib cycle
**Used by:** `lib/drift-sources` (`collectReqDefinitions`, `collectSpecCounters`), `services/archive` (the merge, the REMOVED probe, `finalize`'s recount), `services/spec-show`, `services/mcp`

## Modification Guide

1. **Change what a REQ heading IS** — edit `matchReqHeading` only; every reader derives from it.
2. **Change what a REQ BODY is** — edit `indexSpec`'s boundary predicate; the archive merge reads that boundary instead of recomputing it, so there is no second site.
3. **Add a narrow-read consumer** — call `indexSpec` + `selectSpecSlices`; never parse the spec again.

## Ripple Effects

- The counters feed `spec-counters` (drift) AND `archive finalize`'s frontmatter write — a counting change lands in the trust zone.
- The definition inventory feeds the FAIL-class `req-references` check: a heading this module stops recognising turns every mention of it into a dangling reference.

## Pitfalls

- ONE internal walk backs `readSpecCounters` and `indexSpec`. Three copies of the heading rule once disagreed and the narrowest (h4-only, in the only WRITER) held the pen: a spec whose REQs sat at h3 counted as zero and its MODIFIED REQs were appended as duplicates (issue #138). A contract test bans a second heading pattern, a second id shape, and a third body slicer — each detector proven to fire on the shape it bans.
- Branch ORDER inside the walk is load-bearing: an active REQ heading is decided FIRST (a REQ id written at h2 is a REQ, not a story section), and a struck heading deliberately falls through to the section branches. A REQ heading at h1/h2 CLOSES the Deprecated section — membership follows heading level, not heading text.
- A REQ body ends at the next ACTIVE REQ heading at any level, at a heading at or above its own level (h1/h2 always, or an h1-level REQ would swallow `## Edge Cases` and the Change History table), or at a `---` rule — every one read from the fence-masked probe. A STRUCK REQ heading DEEPER than the REQ is body text, not a boundary (cutting there stranded the remainder after an in-place replacement and reported nothing, because the shortened slice never saw the bullets it lost); one at or above the REQ's level still bounds, so a retired sibling keeps its `**Removed**` record. That boundary has exactly ONE owner — `archive.service`'s in-place merge takes each REQ's `start`/`end` from here — and the contract test pins the registry to this file alone.
- Fences are masked before the rules read a line, so a fenced REQ heading is an EXAMPLE, not a definition. An UNCLOSED fence masks the whole tail, so the walk degrades to raw lines instead of trusting the mask — a reader that trusted it would call a plainly-present heading absent.
- `\r?\n` throughout, and slices carry the file's own line endings: tolerating CRLF in the frontmatter while leaving it in the body once made five of ten specs miscount their stories, and the non-zero wrong values sailed past the zeroing refusal into the trust zone.
- Story ownership ends where the story's own slice ends, so `## Deprecated Requirements` and `## Edge Cases` both close it — a retired requirement belongs to no story.
