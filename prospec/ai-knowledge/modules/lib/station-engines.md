# Station Engines

> The I/O-free engines the cli-first stations delegate their deterministic half to — table mechanics, the S/A/B/C/D grade, the review findings merge, the shared evidence-block grammar, the lessons ledger, and the artifact validators. Reached from [lib](./README.md).

## Key Files

| File | Purpose |
|------|---------|
| `markdown-table.ts` | THE pipe-table engine — escaped-pipe-aware split, table location (blank-line-spanning), render, prose-preserving replace |
| `delegated-evidence.ts` | THE evidence-block grammar both `review.md` and `verify.md` are written with — one marker prefix (so one collision guard), section located by MARKER not heading, `after` returned so nothing below the section is lost, `findUnsafeBlockField` for the raw-line fields, CR-normalised body, EOF closes an unterminated block |
| `review-merge.ts` | Identity-keyed findings merge — severity max, carry-forward, the `Repro` column, cumulative evidence; `parseReviewDocument` reads the table AND re-attaches each row's evidence block |
| `verify-grade.ts` | The S/A/B/C/D decision table as code, plus `resultForGrade` / `gradeAdvancesStatus`, and the self-verification cap (`isSelfVerified`/`applySelfVerifiedCap`: any judgment dimension graded `in-session` makes S unattainable — capped to A without spending the WARN budget) |
| `lessons-ledger.ts` | Ledger upsert + scoring + playbook TTL (per-entry blocks, retirement-marked entries skipped) |
| `artifact-validators.ts` | Artifact structural verdicts (promote-scaffold covers promotion's own product, `delta-spec.md`, not only the artifacts backfill forbids) |

## Public API

- `findTable` / `renderMarkdownTable` / `replaceTableInDocument` / `splitTableRow` / `escapeTableCell`
- `renderEvidenceBlock` / `renderEvidenceSection` (heading is a parameter) / `splitEvidenceSection` (→ `{before, blocks, after}`) / `containsEvidenceMarker` / `findUnsafeBlockField`
- `parseReviewRows` / `parseReviewDocument` / `mergeFindings` / `roundCounts` / `renderReviewDocument` / `evidenceBlocksFor`
- `computeGrade` / `resultForGrade` / `gradeAdvancesStatus` / `isSelfVerified` / `applySelfVerifiedCap`; `upsertLesson`; `validateSlug` / `validate*`

## Modification Guide

1. **Add a table-bearing doc** — reuse `markdown-table.ts`; own only the header predicate and the column vocabulary.
2. **Add an artifact that records delegated evidence** — reuse `delegated-evidence.ts`; own only where the section is spliced in and what the block body says.
3. **Change a station's payload shape** — the schema goes in `types/station.ts` first; these engines consume it, they never define it.

## Pitfalls

- **Decide, never re-derive policy.** `verify-grade` has NO WARN exemption (`not-adjudicated` included — each spends grade A's budget). `lessons-ledger` counts DISTINCT source changes and REFUSES a `retired` row (counters are its only evidence the pattern was real, so an unattended harvest cannot raise them; its playbook marker is case-sensitive and excludes an `UN-RETIRED` annotation, or a revived rule would vanish from the needs-review list).
- `review-merge` **never infers identity from a location** — its (location, lens) fallback needs one id-less side, sees pre-round rows only, and drops any row it claims, moves or renames. `repro` and `evidence` are CUMULATIVE: only a round that SUPPLIES them overwrites, so a fix round cannot blank the reason a finding was raised.
- **A rebuilt section deletes whatever sat below it unless the split hands that back** — the review skill MANDATES appending an artifact-language sentence there, so `splitEvidenceSection` returns `after` and the renderer re-appends it. The boundary is an explicit **closing marker**, never a property of the content: two attempts to infer it ("the tail starts at the first line that is not a block") each left the forgery they were written to stop reachable, because a hand-written tail opens with a marker exactly as a real block does. Between the two markers is a CLI-owned region, and it behaves two ways on purpose: block BODIES are read back (that is the carry-forward mechanism, so editing one edits the recorded evidence), while anything else inside is dropped when the region is rebuilt. Content of your own belongs below the closing marker.
- The section's own heading is skipped by **shape** (`## …` before any block), never by text: `verify.md` heads each run `## {date} — grade {G}`, and a match on `## Evidence` would end that section at once and find none of its blocks. `renderEvidenceSection` takes the heading as a parameter for the same reason — one implementation, not a second hand-assembled copy.
- **The payload is untrusted; the artifact is trusted on read-back.** Every field of an incoming findings/dimensions payload is refused before a byte is written — that is the injection path. `review.md` itself is CLI-owned and believed when read: carry-forward IS reading it back, and no text file can distinguish its own writes from a hand edit. So the section START is located by content and a hand-written marker can hijack it; that is a stated boundary (issue #142 E, decided 2026-08-10), not an open defect — the findings table has always been trusted the same way, and anyone able to write that marker can edit the evidence text directly anyway. Two content-based rules were tried and both were forgeable; the fix is the boundary, not a third heuristic.
- **Guard the block as it will be RENDERED, not field by field.** `key` and `heading` become the marker line and the `###` line verbatim, so a line break or a marker in either forges a second block under another finding's anchor, which the last-wins parse adopts in place of the genuine evidence. `findUnsafeBlockField` is the one check both writers call; the relayed-field schemas refuse the same shapes earlier, and the ceiling set exists to include EVERY field rendered outside a table cell (`id` and `lens` were missed once, and both were forgeable).
- **The locator keys on the MARKER, and only one input can prove it.** A heading-keyed locator that backs up one line is byte-equivalent on well-formed documents, so the whole suite passes either way; the distinguishing fixture is a document carrying an earlier `## Evidence` heading no marker introduces.
- **`replace(/\n+$/, '')` backtracks quadratically** in the length of any newline run — and `evidence` is uncapped, so one payload made each later append take tens of seconds. `lib/markdown-fences`' `trimTrailingNewlines` is the linear replacement, applied at every document-assembly site (it lives there, not here: a generic whole-text primitive is not table mechanics, and `content-merger` handles no tables at all).
- **Where each half of the evidence lives is a round-trip decision, not a layout one.** `repro` is a table column because the pipe-table escaping is exactly invertible; prose sits under a marker as raw lines for the same reason. Putting `repro` in the prose would have needed an inverse of `toInlineCodeSpan`, whose padding and newline collapse are lossy — so a carried-forward command would come back changed.
- `markdown-table.ts`: both consumers (review.md, lessons ledger) once hand-copied it and drifted — a row split ignoring the `\|` its own renderer wrote (PB-006).
- The evidence section is split off **before** any table search: evidence quotes reports, and a quoted findings table would otherwise be the first table found.
