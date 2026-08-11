# add-issue-link-field — Tasks

> 依 TDD：每層先寫測試（RED）再實作（GREEN）。測試任務與其實作任務相鄰，落在同一 commit。

## Tests (RED — 先行)

- [x] T1 `tests/unit/types/change.test.ts`：`issue` optional 兩態（有值接受／省略仍通過）+ 形態自由（`#125`／URL／`ABC-123`）~25 lines
- [x] T2 [P] `tests/unit/lib/status-router.test.ts`：facts 帶／不帶 `issue` 的傳遞與缺鍵斷言，並驗證 `next`／gates／reasons 不受影響 ~30 lines
- [x] T3 [P] `tests/unit/services/change-story.service.test.ts`：`--issue` 寫入、未給不寫鍵、純空白視同未給、`#` 開頭值 round-trip ~45 lines
- [x] T4 [P] `tests/unit/services/status.service.test.ts`：`collectFacts` 兩態 ~20 lines
- [x] T5 [P] `tests/unit/services/archive.service.test.ts`：`generateSummary` 有值印 Issue 列／無值不印 ~30 lines
- [x] T6 [P] `tests/unit/cli/status-output.test.ts`：formatter 有值才印、且過 `sanitizeTerminal` ~30 lines

## Types

- [x] T7 `src/types/change.ts`：`ChangeMetadataShape` 於 `introduced_by` 後加 `issue: z.string().optional()` + doc comment（與 `introduced_by` 的語意分野、不校驗、不進必填地板）~15 lines
- [x] T8 `src/types/status.ts`：`ChangeRouteFacts` 與 `ChangeRoute` 各加 `issue?: string` + 註解說明不參與路由 ~10 lines

## Lib

- [x] T9 `src/lib/status-router.ts`：`base` 以條件展開帶入 `issue`（缺席不寫鍵）~5 lines

## Services

- [x] T10 `src/services/change-story.service.ts`：`ChangeStoryOptions.issue` + 條件展開寫入（`trim()` 為空視同未給），展開體標 `satisfies Partial<NewChangeMetadata>` ~12 lines
- [x] T11 `src/services/status.service.ts`：`collectFacts` 條件展開帶入 `metadata.issue` ~5 lines
- [x] T12 `src/services/archive.service.ts`：`generateSummary` 讀 `meta.issue`，有值才在 Quality Grade 後插 `- **Issue**: <ref>` ~12 lines

## CLI

- [x] T13 `src/cli/commands/change-story.ts`：`.option('--issue <ref>', …)` + action 條件展開轉交 ~8 lines
- [x] T14 `src/cli/formatters/status-output.ts`：status 行後印 `issue:`（有值才印，過 `sanitizeTerminal`）~5 lines

## Templates

- [x] T15 `src/templates/skills/references/metadata-format.hbs`：canonical field order 追加 `issue`、欄位表加列、補不校驗／引號化說明，慣例交還給專案自身的 contributor docs（不點名檔案）~20 lines
- [x] T16 `src/templates/skills/references/archive-format.hbs`：§1 Change Overview 加 optional `- **Issue**: {ref}` ~5 lines
- [x] T17 `tests/contract/skill-format.test.ts`：兩份 reference 的 section-scoped 斷言 ~35 lines
- [x] T18 [M] `pnpm bundle` → `npx tsx src/cli/index.ts agent sync`（source CLI，勿用安裝版）~2 lines
- [x] T19 [V] Mutation-verify T17 的斷言：對 `src/lib/bundled-templates.ts` 刪掉新段落確認轉紅，再還原 ~5 lines

## Tests (E2E)

- [x] T20 `tests/e2e/cli.test.ts`：真 CLI 兩案例——給 `--issue "#131"` 後 metadata 含引號化的鍵；不給則產出的 YAML 無 `issue` ~40 lines

## Docs

- [x] T21 `README.md` + `README.zh-TW.md`：`change story` 旗標表加 `[--issue <ref>]`（雙語同步）~4 lines
- [x] T22 `CONTRIBUTING.md`：Submit a Pull Request 補兩 commit 模式，並指向 `metadata.yaml` 的 `issue` 欄位 ~12 lines
- [x] T23 `.claude/skills/submit-pr/SKILL.md` + `.agents/skills/submit-pr/SKILL.md`（互為鏡像，唯一差異為 entry config 名稱）+ `.gitignore` 兩條 `!` 例外 ~130 lines
- [x] T24 [V] `git check-ignore -v` 確認兩份 `submit-pr/SKILL.md` 皆未被忽略 ~2 lines
- [x] T27 delta-spec 補 `REQ-TEMPLATES-179`（兩個建立變更的 skill 併問追蹤項）作為 ff／new-story 模板行為的畢業載體——verify 2/5 指出該行為原本無 REQ 承載 ~30 lines

## Knowledge

- [x] T25 六個 source-touched 模組的 L2 README 同步（types／lib／services／cli／templates／tests）；lib／services／cli 只剩 <40 字元 headroom，必須 net-neutral 編輯，且完成後回檢 `knowledge-size` 的 L2 findings 集合與 `main` 一致 ~12 lines

## Convergence

- [x] T26 [M] `pnpm counts` → `pnpm test` → `pnpm typecheck` → `pnpm lint` → `prospec check`；確認 `metadata-completeness` 判定與變更前一致 ~2 lines

## Summary

- **Total Tasks:** 27
- **Parallelizable Tasks:** 5
- **Total Estimated Lines:** ~551 lines
