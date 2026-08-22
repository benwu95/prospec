---
name: submit-issue
description: "Open a prospec GitHub issue in the house format — conventional-commit title, Traditional Chinese body (problem → solutions → acceptance criteria), downstream-compatibility block, series cross-links, and optional model-routing guidance. Triggers: submit issue, open issue, create issue, file issue, 開 issue, 發 issue, 建 issue, 提 issue, github issue"
---

# Submit Issue Skill

Open a GitHub issue for the prospec repo in the house format. The format below is derived from the
merged issue corpus (#179–#196, #203–#208); this skill executes the pattern, and newer merged issues
outrank it when they disagree.

## Language

The issue **body is Traditional Chinese (Taiwan)** — a house convention, same rationale as PR bodies:
the Constitution's `[MUST] Language Policy` is defined over repo *paths*, and an issue body is not one
(see `prospec/CONSTITUTION.md` → Language Policy, mirrored in `AGENTS.md`). The **title stays
English** in conventional-commit form, as do code identifiers, file paths, and technical terms inside
the body. **Never append an AI attribution footer.** The repo uses **no labels** — do not add any.

## Scope discipline — one issue per change

Size each issue so it maps to exactly **one prospec change / one PR** (`/prospec-new-story` registers
it via `prospec change story --issue "#NN"`). A body that needs two unrelated 方案 groups or two
independent AC sets is two issues — split them and cross-link the series. Defects discovered
mid-flight go to a change artifact or a new issue, never into frozen planning docs.

## Preconditions

1. **`gh` is authenticated as an account with write access.** With more than one account logged in,
   the active one can silently be the wrong one, and `gh` then fails with a *misleading* error:

   ```bash
   gh api user -q .login                                     # must be able to write to this repo
   gh auth switch --hostname github.com --user <account>      # only if it is not
   ```

2. **Evidence in hand.** Every number, file path, and behavioral claim in the body must come from
   something actually observed — a measurement, an archived record, a review finding, a repro run.

## Step-by-step

### 1. Draft the body to a scratch file

Write it somewhere git-ignored (e.g. `.tasks/issue-<slug>.md` or the session scratchpad), following
the format below. **Show the draft for sign-off before creating** unless the user already approved
the content in conversation — an issue is public the moment it exists.

### 2. Create

```bash
gh issue create --repo benwu95/prospec \
  --title "<type>(<scope>): <english description>" \
  --body-file <scratch-file>
```

Pass `--repo` explicitly: `origin` is an SSH host alias (`git@github.com-benwu95:…`), and letting
`gh` derive the repo from it is the same trap class as `submit-pr`'s `--head` rule.

### 3. Cross-link the series

When the issue belongs to a batch, append the series list (numbers, one-line gists, suggested
execution order, per-issue dependencies) to **every** member's body and push each with
`gh issue edit <n> --repo benwu95/prospec --body-file <file>`. `gh issue edit` **replaces the whole
body** — always update the full scratch file and resend it, never hand-type a partial body.

### 4. Verify

```bash
gh issue view <n> --repo benwu95/prospec --json number,title,url -q .url
```

Confirm the body rendered — cross-references are live links and the AC checkboxes render. Report the
URL(s).

## Title format

`<type>(<scope>): <english description>` — the same `type` vocabulary as commits (`feat`, `fix`,
`docs`, `chore`, …) and a lowercase `scope` naming the touched subsystem (`drift`, `skills`, `plan`,
`review`, `verify`, `config`, `templates`, `tests`, `lifecycle`, …). No trailing period.

## Body format

Sections in order, separated by `---`:

1. **`## 概述 (Overview)`** — the problem first, with concrete numbers and the motivating incident
   (an issue, a PR, an archived record, measured data). State what it costs, not what the issue will
   do. Adjectives are not evidence.
2. **Downstream-compatibility blockquote** — REQUIRED whenever the issue touches skill templates,
   rendered agent configs, or anything shipped to downstream projects:

   > **下遊專案適配原則 (Downstream Compatibility)**：…

   Spell out this issue's specific NEVERs: no hardcoded harness tool names, no named plugin agent
   types, no literal skill paths, no model/vendor names — everything resolved from config, capability
   flags, or sync-time injected values. Issues #179–#183 each carried this block and #195's first
   draft was rewritten for omitting it; do not omit it.
3. **`## 背景與問題 (Problem)`** — numbered list; one mechanism per item, with file paths where known.
4. **`## 改善目標與方案 (Solutions)`** — `### 方案 A/B/…`, each with `**位置**` (file paths) and
   `**機制**` (the behavior). An alternative the issue rejects gets one sentence saying why.
5. **`## 驗收標準 (Acceptance Criteria)`** — `- [ ] **AC-N (Label)**：…`, each independently
   checkable. For code issues the final AC is the standing gates line: Contract / Unit / e2e 與
   `prospec check`、`counts:check`、`agents:check`、`knowledge:check` 全數通過。
6. **`## 開發模型建議 (Development Model Routing)`** — optional, established by #203–#208: the
   生成端 vs 判斷端 executor recommendation plus any issue-specific trap notes for the implementing
   session.
7. **`## 關聯項目 (References)`** — evidence links (issues, PRs, archived records, `_playbook.md`
   PB-xxx rules, ledger keys), hard dependencies marked **依賴**, and the series list with suggested
   order.

## NEVER

- **NEVER** write the body in English, add labels, or append an AI attribution footer.
- **NEVER** state a number, round count, or file path you did not actually observe.
- **NEVER** bundle more than one change's worth of scope into a single issue.
- **NEVER** omit the downstream-compatibility block on an issue that touches shipped templates.
- **NEVER** hand-type a partial body into `gh issue edit` — it replaces the whole body; resend the
  full file.

## Notes

- **This is maintainer tooling for the prospec repo itself**, not a prospec SDD skill shipped to
  users. It has no `.hbs` template and is not produced by `prospec agent sync`.
- It lives under **both** `.claude/skills/submit-issue/` and `.agents/skills/submit-issue/`, each
  version-controlled via its own explicit `!` exception in `.gitignore`. The two copies are
  hand-maintained mirrors — no generator produces them and no drift check compares them. Edit
  **both** in the same change, and keep the only permitted difference the harness-specific wording
  (entry config `CLAUDE.md` vs `AGENTS.md`).
