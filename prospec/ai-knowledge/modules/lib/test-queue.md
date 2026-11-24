# Test Queue

> Sub-module of [Shared Kernel](./README.md) — the repository test queue: one full-suite run at a time across worktrees, in ticket order, with the command's process tree tied to the turn.

## Key Files

| File | Purpose |
|------|---------|
| `types/test-queue.ts` | `TestQueueStateSchema` (strict: an unknown version or shape is rejected), waiting / holding ticket, `ProcessIdentity` (pid + start reading), `TestQueueBusy`, the busy exit code, the token env name and the four default limits |
| `test-queue-engine.ts` | Pure rules over a state, a request and injected facts: `decideAcquire`, `decideSpawn`, `decideRegister`, `decideUnregister`, `decideRelease`, `describeHolder` |
| `test-queue.ts` | `resolveTestQueueRoot` (`<git-common-dir>/prospec/test-queue/`), the mutex, the state file and `withTestQueue` — the one acquire → run → release path |
| `process-tree.ts` | `runProcessTree` (async spawn, own timeout; kills the tree on SIGINT, SIGTERM or SIGHUP) and the status rules: `holderStatus`, `treeStatus`, `killTree`, `killTreeIfAlive`, behind an injected `ProcessProbe` |
| `test-runner.ts` | `runTestCommand` (tokenize) and `runArgv`: the shim refusal, then `runProcessTree` |

## Public API

- `withTestQueue(request, body)` → `{ kind: 'ran', value, warning? } | { kind: 'busy', busy }`; `body` gets a session whose `run(timeoutMs, start)` hands `start` the hooks the runner must receive
- `runProcessTree(argv, options)` → `{ exit_code, signal?, timed_out, interrupted_by?, error?, hook_error? }`
- `holderStatus(identity, probe)` / `treeStatus(tree, probe)` → `gone | alive | unknown`

## Dependencies

**Depends on:** `git-read` (the common dir), `fs-utils` (`atomicWrite`, `createFileExclusive`), `types/test-queue`
**Used by:** `services/check.service` (`--record-tests`), `services/exclusive.service`

## Modification Guide

1. **Change a queue rule** — edit `test-queue-engine.ts` only and add a row to its table test; the engine reads no file, process or clock, so every branch is driven by injected facts.
2. **Change what counts as alive** — edit `process-tree.ts`; a status is three-valued and only `alive` (same pid, same start reading, not a zombie) licenses a kill by a process that did not spawn the tree.
3. **Add an entry that runs a full suite** — call `withTestQueue` with a key built from the project root's real path, and run the command through `session.run` so its tree is registered; never spawn beside it.
4. **Shorten limits in a test** — pass `limits` in the request; the two CLI entries pass none.

## Ripple Effects

- `TestRunResult` (`interrupted_by`, `hook_error`, `queue_abort`) is read by `check.service` (attempt reason) and `exclusive.service`; the busy contract is rendered by `cli/formatters/test-queue-output.ts` for both entries.
- The state file is shared by every worktree, whichever prospec version each runs: a shape change is refused by the other version until the queue directory is removed.

## Pitfalls

- Time takes only a WAITING ticket's place (its own lease). A ticket holding the turn leaves by release, or when its holder is `gone` and every registered tree is `gone`, or past its deadline once no registered tree is `alive` — and stays while its holder is `alive`, deadline or not.
- `unknown` is the answer to every doubt — a pid that exists with a missing or different start reading, a failed `ps`, a group whose leader ended while a member remains, a zombie leader. It never licenses a kill; past the deadline such a tree is left running and its ticket removed.
- A timeout is the runner's own verdict: a group leader killed with its group reports either the signal or exit 137, so the reported result cannot decide it.
- `spawning` (entered before the spawn) holds the turn until its deadline even with the holder gone: the command may already run with no tree on record.
- A ticket written by another host is never touched by pid rules: holding, it stays until removed by hand.
- The guard directory used to remove a dead owner's mutex is never reclaimed: a process killed inside it leaves every later call refused, with a typed error naming the mutex and the guard.
- The command runs in its own session and process group: a signal sent only to the CLI's group does not reach it, and a descendant that starts its own group is outside both the status and the kill.
- Re-entry is by token: `PROSPEC_TEST_QUEUE_TOKEN` in the child's environment lets a nested entry of the same queue run at once, registering its tree under the holder's ticket; release kills what is still registered and `alive` inside the transaction that removes the ticket, before the write.
- On `win32` there is no start reading and no process group: every existing pid is `unknown`, and the tree is the spawned process alone.
- Tests: the engine by table, with no process; `process-tree` and `test-queue` start real processes in POSIX-only blocks; `integration/test-queue-contention` kills contenders at random — give its command a cap far above its run time (a process start takes seconds under load) and accept a refusal only with a leftover guard.
