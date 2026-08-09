---
name: submit-pr
description: "Open a prospec pull request in the house format — push the change's two commits, write the Traditional Chinese body, and link it to its issue. Triggers: submit pr, open pr, 開 PR, 送 PR, 發 PR, pull request, 提交 PR"
---

# Submit PR Skill

Open the pull request for a completed change: push its branch, write the body in the house format,
and link it to the issue the change registered. `CONTRIBUTING.md` → **Submit a Pull Request** is the
authority for these rules; this skill only executes them, so when the two disagree, that file wins
and this one is stale.

## Language

The PR **body is Traditional Chinese (Taiwan)** — a house convention, deliberately *not* a
consequence of the Constitution's `[MUST] Language Policy` (that rule is defined over repo *paths*,
and a PR body is not one). The PR **title** mirrors the feature commit's subject and therefore stays
English, as do code, commit messages, and the trust zone inside the same PR (see
`prospec/CONSTITUTION.md` → Language Policy, mirrored in `CLAUDE.md`).

**Never append an AI attribution footer** — not to the body, not to the commits. This repo carries no
AI co-authorship anywhere.

## Preconditions — do not open the PR until all hold

1. **The change is archived.** `/prospec-archive` has run: REQs graduated, Knowledge synced,
   `prospec/specs/_archived-history/{date}-{name}.md` written. `prospec status` reporting the change
   as still in flight means this step is unfinished.
2. **Both commits exist**, in order — the feature commit (boundary: `/prospec-verify` at grade S/A,
   folding implementation + review fixes + verify fixes + module READMEs + re-derived counts), then
   the archive commit. `CONTRIBUTING.md` → §4 Commit specifies both.
3. **Green locally**: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `prospec check`, and
   `pnpm run counts:check` (CI gates this one; a stale factual count fails the PR). Capture the
   numbers — the body reports them.
4. **`gh` is authenticated as an account with write access.** With more than one account logged in,
   the active one can silently be the wrong one, and `gh` then fails with a *misleading* error.
   `git push` may travel over a different credential path (an SSH host alias) and succeed regardless,
   so a successful push proves nothing here:

   ```bash
   gh api user -q .login                                     # must be able to write to this repo
   gh auth switch --hostname github.com --user <account>      # only if it is not
   ```

## Step-by-step

### 1. Read the change's own record

```bash
prospec status                                    # in-flight changes (should be clean post-archive)
git log --oneline main..HEAD                      # the two commits
git diff --shortstat main..HEAD                   # file/line stats for the body
```

The issue number comes from the change's `metadata.yaml` `issue` field — the mechanical registration
written at scaffold time by `prospec change story --issue "#NN"`:

```bash
grep -h '^issue:' .prospec/changes/*/metadata.yaml .prospec/archive/*-<name>/metadata.yaml
```

An archived change keeps its `metadata.yaml` inside the (gitignored) archive bundle, so read it
there. **If the field is absent, ask the user for the issue number** — do not infer one from the
branch name or commit text, and do not silently omit the link.

### 2. Push the branch

```bash
git push -u origin HEAD
```

### 3. Draft the body

Write it to a scratch file (git-ignored), e.g. `.tasks/<branch>/pr-body.md`, and show the draft to
the user for sign-off before opening — a PR body is public and hard to un-see. Follow the format
below.

### 4. Open the PR

```bash
gh pr create --base main --head <branch> \
  --title "<feature commit subject>" \
  --body-file .tasks/<branch>/pr-body.md
```

`--head` is **required here**, not optional: `origin` is an SSH host alias
(`git@github.com-benwu95:…`), and without `--head` `gh` mis-derives the head ref from it.

### 5. Verify it landed

```bash
gh pr view --json number,title,url,body -q '.number, .url'
gh pr checks                                       # CI green before asking for a merge
```

Report the PR URL. Confirm the body rendered (the issue link is a live reference, not literal text).

## Body format

Traditional Chinese, Markdown. The structure below is **derived from the last ten merged PRs** — its
stable parts are the order (problem → what changed → verification → optional honest disclosure) and
the content of each part, not the exact headings, which vary in wording. The issue link is the one
element that is **not** consistently present in that sample; item 5 says what to do anyway.

1. **Lead** — the problem, stated first and with concrete numbers, either as an unheaded opening
   paragraph or under `## 背景` / `## 問題`. It says what was broken or missing and what it cost, not
   what the PR does. A measurement, a token count, a downstream report — evidence, never adjectives.
2. **What changed** — `## 改了什麼` (also seen: `## 這個 PR 做了什麼`, `## 解法`, `## 交付`). One
   **bold lead sentence** per theme, then the mechanism: which file owns the behaviour now, and why
   this shape rather than the obvious alternative. Name the design decisions a reviewer would
   otherwise have to reverse-engineer from the diff.
3. **Verification** — `## 驗證` (also: `## 品質`, `## 審查與驗證`). Bulleted, and every claim real:
   `pnpm test` result with the test count, `prospec check` (N checks, fail/warn counts, and what any
   deliberate WARN is), the `/prospec-verify` grade with its dimension verdicts, and that
   `/prospec-archive` ran. Never claim a green you did not run.
4. **Honest disclosure (when applicable)** — a section for what this PR deliberately leaves undone:
   `## 刻意不修`, `## 已知未解`, `## 誠實揭露`, or derived follow-ups as
   `## 衍生 issue（不在本 PR 範圍）` / `## 後續（不由本 PR 關閉）`. Omit the section only when there
   is genuinely nothing to disclose — a review round that surfaced deferred findings always has
   something.
5. **Issue link** — write `Closes #NN` as the **last line**, so the merge closes the issue rather
   than a human closing it by hand. **Do not read the merged history as a settled convention here**:
   across the last ten merges, a trailing `Closes #NN` is the most common form (#144, #143, #141),
   `Refs #NN` appears when the PR advances an issue it does not close (#149), a **leading** reference
   on the first line is current rather than retired practice (`fix #130` on #152 — the most recent
   merge — and `Resolves #106` on #129), the singular `Close #NN` also occurs (#128), and **three of
   the ten carry no issue reference at all** (#148, #145, #137). That last group is a gap to avoid,
   not a pattern to copy — the whole point of the `issue` registration is that the link stops
   depending on whoever remembers to write it. Prefer trailing `Closes #NN`; use `Refs #NN` when the
   PR genuinely does not close the issue.

When the PR carries a commit unrelated to the change (a drift convergence landed alongside it, kept
separate per Atomic Commits), add a short `## 附帶` section saying which commit and why it is separate.

## NEVER

- **NEVER** open the PR before `/prospec-archive` has run — the archive commit belongs in the same PR.
- **NEVER** write the body in English, and never append an AI attribution footer.
- **NEVER** state a test count, coverage figure, check result or grade you did not actually observe.
- **NEVER** invent the issue number — read it from `metadata.yaml` `issue`, or ask.
- **NEVER** close the issue by hand; `Closes #NN` and the merge do it.

## Notes

- **This is maintainer tooling for the prospec repo itself**, not a prospec SDD skill shipped to
  users. It has no `.hbs` template and is not produced by `prospec agent sync`.
- It lives under **both** `.claude/skills/submit-pr/` and `.agents/skills/submit-pr/`, each
  version-controlled via its own explicit `!` exception in `.gitignore` (the repo otherwise tracks
  only `.claude/skills/prospec-*` / `.agents/skills/prospec-*`). The two copies are hand-maintained
  mirrors — no generator produces them and no drift check compares them, and the `release` skill's
  pair has silently diverged before. Edit **both** in the same change, and keep the only permitted
  difference the harness-specific wording (entry config `CLAUDE.md` vs `AGENTS.md`).
