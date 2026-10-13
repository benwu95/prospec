# Delegation and Physical Receipt Protocol

## Physical Receipt Verification Protocol

Before consumption:

1. **Physical Existence & Non-Empty**: the payload path resolves to a readable regular file with
   `size > 0` bytes.
2. **Target Schema Compliance**: the payload parses as JSON matching the station's executable schema
   and closed enums (schema owned by the station).
3. **Lifecycle Probe & Bounded Await**: Inspect lifecycle state or transcript evidence when the file is absent; wait — never unboundedly:
   when payload and transcript are idle for **10 minutes**,
   or after **6 polls**, the delegate has failed. Re-spawn it — re-spawns per
   delegation: at most **1** (at review and verify each under a new ticket, see
   below). When the last re-spawn fails too, record the failure as a `quality_log` WARN and take step 4.
4. **Explicit Degradation & Honest Disclosure**: on crash, spawn failure, timeout or exhausted re-spawn, take Harness Degradation and
   disclose the grading context honestly — `graded_by: in-session` where the sink records it, a plain
   statement where it does not.
5. **Zero-Mock / No-Dummy Mandate**: never fabricate an empty array `[]`, a mock file or a synthetic
   pass to get past a missing receipt or a CLI gate. Unreadable, incomplete or invalid payloads fail closed with the concrete error.

Ticketless spawn failures (plan, tasks, ff) use
`prospec change log --skill prospec-delegation --result WARN --warning "<station> delegate failed: <reason>"` —
never under the station's own label, which its verifier gate reads.

## Ticketed delegation (review and verify)

Tickets/payloads/checkpoints: `.prospec/changes/{name}/.delegated/`.

Ticket before every review/verify spawn; receive before fixes.

1. **Issue**:
   `prospec change delegate --station <review|verify> --role <role> --round <n>`. `<n>`: station round (review loop or verify run). Each round delegate needs a distinct role —
   `lens-<name>`, `verifier-<finding id>` (the CLI lowercases the id; when two findings of a round
   normalize alike, add `-2`, `-3`), `grader` (verify 2/5 and 3/5), `grader-design` (verify dimension 6)
  . The CLI records the repository
   state (`content`, `head`, `index`, `refs`, `stash`; `refs`: local refs only), checkpoints uncommitted/untracked file bytes
   and the index, and builds a temporary snapshot. Give the delegate the printed absolute payload and snapshot paths.
   When no ticket can be issued (not a git repository, a shallow repository, a split index, a file marked
   assume-unchanged, no index yet, a sparse or gitlink input,
   a snapshot that does not reproduce the tree), never spawn an unticketed delegate: skip the degraded
   path's fresh-run options too, grade in-session, and let the sink disclose the round as not covered.
   When issuance succeeds, degraded-path fresh runs are ticketed too, under
   `<role>-fresh`.
2. **Spawn** — brief the delegate to:
   - For review findings: file one finding per failure mode; `location` names the first instance, `repro` is a one-line rerunnable command describing the failure-mode structure and listing its instances, and `evidence` lists known instances.
   - run every test, regression pin, mutation check and repro that writes inside the snapshot path only —
     never in the main working tree;
   - supply ignored dependencies absent from the snapshot per the project test runner without writing
     the main tree; if impossible, report the claim untested;
   - read change artifacts (`.prospec/`, which the snapshot does not hold) and compute the change diff in
     the main tree, read-only;
   - never run a git command that writes refs, the stash or the config, nor a fetch that writes `.git`
     metadata (`--depth`, `--shallow-*`, `--unshallow`).
3. **Receive** — on delegate return: `prospec change delegate --receive <stem>`. Between
   issue and receipt the orchestrator changes nothing in the working tree — no fixes/count/knowledge sync. Compare repository state first, then steps 1–2 and payload age:
   - *protected state changed* (named, with both values and the checkpoint path) → refused as mutated, even with
     no payload; go to step 4;
   - *necessary facts cannot be read with no proved protected difference* → the ticket stays open; name the cause for the human to remove and
     receive again; if the human keeps the tree, one `--accept-current-tree` ends that attempt together
     with every sibling that returned the same way;
   - *not written yet, empty, or not yet complete JSON* → the ticket stays open; keep waiting within the
     bound, then end it (step 5);
   - *schema failure or stale payload* → refused; re-spawn under a new ticket, or end it.
4. **Hand off a mutation** — the flow stops. Present the changed facets with both values and the
   checkpoint path to the human. The ticket lists copied paths and sha256; with
   the human's consent the orchestrator brings back only what the human agrees to, using git and the
   files under the checkpoint (verify each copy's sha256 first) — never a CLI command, since the CLI
   writes no working tree, index, HEAD or ref. The CLI refuses every new attempt of the change until the
   protected state satisfies the refused attempt's pre-spawn policy; issue one only on the human's explicit
   go-ahead — never re-issue after a mutation refusal on your own, so each refusal costs one human
   decision. Such a recovered attempt is not a re-spawn and does not use the re-spawn allowance, which
   counts only spawn failures and exhausted waits. A sibling refused because of a parallel delegate's
   change, whose protected state already satisfies its pre-spawn policy, goes straight to a new attempt. The human
   alone may instead end the attempt with
   `--spawn-failed <stem> --reason "<what was lost>" --accept-current-tree`, which keeps the checkpoint
   and prints its path.
5. **End a failed delegation** — `prospec change delegate --spawn-failed <stem> --reason "<why>"` for spawn failure, exhausted wait, or a refusal without re-spawn. It records the
   `prospec-delegation` WARN itself before the ticket turns failed, and it refuses while protected state differs or necessary facts are unreadable — receive it, then hand it off (step 4).
   V1 tickets retain exact five-facet equality. V2 uses one policy at all gates:
   Protect the union of before/after current branches from HEAD and topology; content, HEAD, index and non-branch refs (tags included) stay protected. Other local branches are outside protection regardless of sibling activity or baseline existence: additions, moves, renames and deletions use `non-current-branch` with exact ref names and old/new OIDs; before/after HEAD and topology must be readable.
   Allow stash additions only with a valid sibling and an intact baseline suffix (order and duplicates preserved).
   Single-worktree stash changes remain protected. Protected changes refuse; protected differences take precedence over unreadable topology.
   Missing topology keeps receipt pending even with zero raw diff; issue requires readable topology.
   V2 keeps bounded issue, receive and failure observations: allowed ref OIDs and stash prefixes;
   pending/refused evidence writes must succeed. Ordinary failure refusal writes evidence only, without WARN or cleanup.
6. **Sink** — `prospec review merge` / `prospec verify record` refuse while any latest attempt is still
   open or refused, and print whether the run was covered by delegate mutation detection. Receive every round payload first (Mode A lenses, verify `grader`/`grader-design`), then combine them into the sink's one input file.

## What this guarantees, and what it does not

The CLI detects and preserves: it names protected differences and keeps the issue-time copies
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
whole repository. Allowed changes: endpoint facts do not identify the actor.
Topology brackets capture with one retry, not an atomic snapshot. Unused backup branches are also outside V2 protection. V2 is revised directly, without a new ticket version. End outstanding attempts through the existing authorized lifecycle before changing CLI versions; then use consistent CLI versions and issue new tickets. Historical `baseline-sibling` and `new-sibling` reasons remain readable; older CLIs may reject `non-current-branch`. No automatic acceptance, unlocking, ticket migration or historical receipt rewriting/rejudgment. The CLI cannot distinguish the two V2 releases; undrained attempts use the revised policy at their next assessment.
Snapshots cost a working-tree checkout each and live until their ticket settles.
