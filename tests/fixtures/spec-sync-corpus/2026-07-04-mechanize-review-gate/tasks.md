# Tasks: mechanize-review-gate

> 層序 Types → Lib → Services → CLI → Templates → Knowledge → Tests。TDD：implement 時每個 code 任務測試先行（測試集中於 Tests 層列出）。kind schema 見 `references/tasks-format.md`。

## Types

- [x] [P] `DRIFT_CHECK_IDS` append `'review-provenance'`（8→9）；drift-report schema/enum 隨動，不改 `knowledge_health` 凍結契約（REQ-TYPES-052）~10 lines
- [x] [P] `ChangeMetadataSchema` 新增 optional `review_provenance{digest:string,date:string}`；補 lossless-read 註記（REQ-TYPES-053）~12 lines

## Lib

- [x] `computeChangeDigest(cwd): string | null` — 雜湊 `HEAD sha` + `git diff HEAD` + untracked（`ls-files --others --exclude-standard`）內容；pathspec 只涵蓋 code（`src/`/`tests/`）、排除 `.prospec/` 與 `prospec-report.json`（避免自我判 stale）；非 git 回 null（`execFileSync`，比照 `gitLastCommit`）（REQ-LIB-024）~45 lines
- [x] `collectReviewProvenance(cwd)` collector — non-git/shallow → `{available:false,reason}`；否則列舉 `.prospec/changes/*/` 讀 metadata（status/scale/review_provenance）+ `computeChangeDigest` 當前值（比照 `collectTaskStates`）（REQ-LIB-024）~50 lines
- [x] `evaluateReviewProvenance` pure evaluator — `implemented`+非 backfill：缺 baseline→fail「no review recorded」、`recorded≠current`→fail「review stale」、相符→無 finding；其餘 status/backfill 不 flag；unavailable→skipped；findings codepoint-sort（REQ-LIB-024）~45 lines
- [x] `DriftCheckInputs` 加 `reviewProvenance` 欄位 + `runChecks` dispatch 加 `'review-provenance'`（REQ-LIB-024）~10 lines

## Services

- [x] `check.service` 將 `collectReviewProvenance(cwd)` 注入 `runChecks`（REQ-SERVICES-062）~10 lines
- [x] `check.service` `recordReview` 分支：`resolveChange` → `computeChangeDigest` → `atomicWrite` metadata `review_provenance`；digest null 時誠實跳過（沿用 `--json`/`--init-ci` flag-gated 副作用慣例）（REQ-SERVICES-062）~30 lines

## CLI

- [x] `prospec check` 註冊 `--record-review` 旗標並映射 `recordReview:true`；人讀輸出說明（REQ-CLI-012）~10 lines

## Templates

- [x] `prospec-review.hbs`：每輪（含 review-clean）寫一筆 `skill: prospec-review` quality_log 條目 + loop 收斂後執行 `prospec check --record-review`（graceful fallback）（REQ-TEMPLATES-130）~25 lines
- [x] `prospec-verify.hbs`：Entry Gate 由 recommended 升為**阻斷** non-backfill 缺席/stale review（讀 review-provenance）、backfill 維持豁免、更新對應 NEVER（移除「Absence does NOT block」放行語）（REQ-TEMPLATES-131）~30 lines
- [x] [P] `prospec-implement.hbs`：加 PB-001（contract 斷言 section-scoped+mutation-verify）與 PB-007（sweep 每個 consumer）NEVER 項（REQ-TEMPLATES-132）~15 lines
- [x] [P] `review-lenses-content.hbs`：新增/強化 test-quality(PB-001)、docs-claims(PB-003)、DRY(PB-006 子句)、parallel-site(PB-007) lens 準則（REQ-TEMPLATES-132）~30 lines
- [x] [P] `prospec-review.hbs` Review Lenses 引用 docs-claims / parallel-site lens（REQ-TEMPLATES-132）~12 lines
- [x] [M] 執行 `pnpm build` 後 `prospec agent sync` 重新部署 `.claude/skills/`（生成物）~5 lines

## Knowledge

- [x] `_playbook.md`：PB-004/PB-005 標記 retired（理由指向 #65 counts 工具 + verify S/A commit-prompt sync）；PB-002「維持 playbook」裁決入 Needs-Review List（REQ-TEMPLATES-132）~20 lines
- [x] `_lessons-ledger.md`：PB-004/005 對應條目狀態改 retired/resolved（REQ-TEMPLATES-132）~10 lines

## Tests

- [x] [P] unit `drift-checker.test.ts`：`evaluateReviewProvenance` 六情境（absent/stale/fresh/backfill/non-implemented/unavailable）（REQ-TESTS-042）~70 lines
- [x] [P] unit `drift-sources.test.ts`：`computeChangeDigest` + `collectReviewProvenance`（temp git dir：改 code 檔後 digest 變、只改 `.prospec/` 或 report 則不變）（REQ-TESTS-042）~65 lines
- [x] service `check.service.test.ts`：review-provenance 入報告、`--record-review` 寫 metadata、non-backfill implemented 缺 review → `--strict` exit 1、backfill → skipped 不影響 exit（REQ-TESTS-042）~50 lines
- [x] contract `skill-format.test.ts`：section-scoped 釘住 review 每輪記錄步驟、verify Entry Gate 阻斷字樣（負向：無「Absence does NOT block」）、PB-001/003/006/007 grep-hit（REQ-TESTS-043）~60 lines
- [x] [V] mutation-verify 新 contract 斷言（移除任一目標字樣→轉紅）（REQ-TESTS-043）~10 lines

## Summary

- **Total Tasks:** 22
- **Parallelizable Tasks:** 7
- **Total Estimated Lines:** ~614 lines
