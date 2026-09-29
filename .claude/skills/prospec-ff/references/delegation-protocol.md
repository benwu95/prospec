# Delegation and Physical Receipt Protocol

The one definition of how a station hands work to a delegated agent and takes the result back.
Every delegating station — review, verify, plan, tasks and ff — applies it; their own text only names
the payload schema and the command that consumes the payload. It reads the same on every host: the
guarantee comes from the prospec CLI and git, never from a host permission mechanism.

---

## Physical Receipt Verification Protocol

Before any payload a delegate wrote is consumed — by a CLI command or by the next workflow step:

1. **Physical Existence & Non-Empty**: the payload path resolves to a readable regular file with
   `size > 0` bytes.
2. **Target Schema Compliance**: the payload parses as JSON matching the station's executable schema
   and closed enums (the station names its schema; this protocol never redefines it).
3. **Lifecycle Probe & Bounded Await**: a completion claim without the file means the write may still
   be landing. Inspect lifecycle state or transcript evidence of the delegate and wait — but never unboundedly:
   when both the payload file and the transcript have been idle for **10 minutes**,
   or after **6 polls**, the delegate has failed. Re-spawn it — re-spawns per
   delegation: at most **1** (at review and verify each under a new ticket, see
   below). When the last re-spawn fails too, record the failure as a `quality_log` WARN and take step 4.
4. **Explicit Degradation & Honest Disclosure**: on a crash, a spawn failure (a rate-limit refusal
   included), a timeout, or an exhausted re-spawn, take the station's Harness Degradation path and
   disclose the grading context honestly — `graded_by: in-session` where the sink records it, a plain
   statement where it does not.
5. **Zero-Mock / No-Dummy Mandate**: never fabricate an empty array `[]`, a mock file or a synthetic
   pass to get past a missing receipt or a CLI gate. A payload still unreadable or not complete JSON when
   the bound runs out, or one that fails its schema, fails closed with the concrete I/O, parse or schema
   error.

A spawn failure at a station with no ticket (plan, tasks, ff) is recorded with
`prospec change log --skill prospec-delegation --result WARN --warning "<station> delegate failed: <reason>"` —
never under the station's own label, which its verifier gate reads.

## Ticketed delegation (review and verify)

Tickets, payloads and checkpoints live under `.prospec/changes/{name}/.delegated/`.

At review and verify the CLI records every delegation, so a delegate that changes the repository is
caught the moment it returns — before the orchestrator applies any fix of its own — and what it may
have destroyed is still on disk for the human.

1. **Issue** — before each spawn (a reviewer or lens agent, the critical-existence verifier, a grader):
   `prospec change delegate --station <review|verify> --role <role> --round <n>`. `<n>` is the station's
   own round counter (the review loop round; the verify run). Each delegate of a round gets its own role —
   `lens-<name>`, `verifier-<finding id>` (the CLI lowercases the id; when two findings of a round
   normalize alike, add `-2`, `-3`), `grader` (verify 2/5 and 3/5), `grader-design` (verify dimension 6)
   — since a second ticket for a role is a re-spawn that retires the first. The CLI records the repository
   state (the facets `content`, `head`, `index`, `refs`, `stash`; `refs` holds local refs only), a checkpoint — byte copies of
   the uncommitted and untracked files and of the index — and builds a snapshot under the temporary
   directory; it prints the absolute payload path and the absolute snapshot path. Hand the delegate
   exactly those paths.
   When no ticket can be issued (not a git repository, a shallow repository, a split index, a file marked
   assume-unchanged, no index yet, a sparse or gitlink input,
   a snapshot that does not reproduce the tree), never spawn an unticketed delegate: skip the degraded
   path's fresh-run options too, grade in-session, and let the sink disclose the round as not covered.
   When a ticket can be issued, a fresh run the degraded path offers is ticketed too, under
   `<role>-fresh`.
2. **Spawn** — with a brief that tells the delegate to:
   - run every test, regression pin, mutation check and repro that writes inside the snapshot path only —
     never in the main working tree;
   - make ignored dependencies (which the snapshot does not hold) available there per the project test
     runner without writing the main tree, and report a claim as untested rather than run it in the main
     tree when that is impossible;
   - read change artifacts (`.prospec/`, which the snapshot does not hold) and compute the change diff in
     the main tree, read-only;
   - never run a git command that writes refs, the stash or the config, nor a fetch that writes `.git`
     metadata (`--depth`, `--shallow-*`, `--unshallow`).
3. **Receive** — the moment the delegate returns: `prospec change delegate --receive <stem>`. Between
   issue and receipt the orchestrator changes nothing in the working tree — no fixes, no count or
   knowledge sync. The receipt compares the repository state first, then checks steps 1–2 above and
   the payload's age:
   - *a facet changed* (named, with both values and the checkpoint path) → refused as mutated, even with
     no payload; go to step 4;
   - *a facet cannot be read while every readable one is unchanged* (for example a nested repository or
     a symlink leaving the tree) → the ticket stays open; name the cause for the human to remove and
     receive again; if the human keeps the tree, one `--accept-current-tree` ends that attempt together
     with every sibling that returned the same way;
   - *not written yet, empty, or not yet complete JSON* → the ticket stays open; keep waiting within the
     bound, then end it (step 5);
   - *schema failure or stale payload* → refused; re-spawn under a new ticket, or end it.
4. **Hand off a mutation** — the flow stops. Present the changed facets with both values and the
   checkpoint path to the human. The checkpoint's ticket lists every copied path with its sha256; with
   the human's consent the orchestrator brings back only what the human agrees to, using git and the
   files under the checkpoint (verify each copy's sha256 first) — never a CLI command, since the CLI
   writes no working tree, index, HEAD or ref. The CLI refuses every new attempt of the change until the
   tree is back at the refused attempt's pre-spawn state; issue one only on the human's explicit
   go-ahead — never re-issue after a mutation refusal on your own, so each refusal costs one human
   decision. Such a recovered attempt is not a re-spawn and does not use the re-spawn allowance, which
   counts only spawn failures and exhausted waits. A sibling refused because of a parallel delegate's
   change, whose tree already equals its own pre-spawn state, goes straight to a new attempt. The human
   alone may instead end the attempt with
   `--spawn-failed <stem> --reason "<what was lost>" --accept-current-tree`, which keeps the checkpoint
   and prints its path.
5. **End a failed delegation** — `prospec change delegate --spawn-failed <stem> --reason "<why>"` for a
   spawn failure, an exhausted wait, or a refused receipt you will not re-spawn. It records the
   `prospec-delegation` WARN itself before the ticket turns failed, and it refuses while any facet
   differs from the pre-spawn state — receive it, then hand it off (step 4).
6. **Sink** — `prospec review merge` / `prospec verify record` refuse while any latest attempt is still
   open or refused, and print whether the run was covered by delegate mutation detection. The payloads of
   a round's several delegates — Mode A lenses, verify's `grader` and `grader-design` — are each received
   first; the orchestrator then combines them into the one file the sink reads.

## What this guarantees, and what it does not

The CLI detects and preserves: it names every facet a delegate changed and keeps the issue-time copies
until the human decides. It prevents nothing and restores nothing, and prompt wording is never the
isolation mechanism. It guards against an accidental or buggy delegate, not a malicious one. The receipt
does not see ignored files (an ignored `prospec-report.json` included); artifacts under `.prospec/`, tickets and checkpoints included — a delegate
that edits its own ticket or another CLI record there can make its receipt pass; the main repository's
`.git/config`, hooks and `info/exclude` — a hook or command a delegate sets there (a `core.fsmonitor`
command, a reference-transaction hook) runs in the CLI's own receive git calls and in every later git
call; repository metadata under `.git` that no facet reads (`.git/shallow`, `info/grafts`,
`info/attributes`); a process that outlives its delegate — one still running after `--spawn-failed` or
after a newer attempt superseded it, or a background process it started — which can change the tree
after the receipt; a change the delegate itself reverted before returning; content outside the project;
or pushes to any remote (remote-tracking refs are not a facet), while tags a `git fetch` auto-follows do
change the `refs` facet, so a delegate's fetch can refuse an otherwise clean receipt. Delegations of
several changes running at once in one repository are not isolated from one another: the facets span the
whole repository, so a sibling worktree's commit or stash during a delegation refuses the receipt.
Snapshots cost a working-tree checkout each and live until their ticket settles.
