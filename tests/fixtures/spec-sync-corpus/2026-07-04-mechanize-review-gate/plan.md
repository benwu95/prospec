# Plan: mechanize-review-gate

## Overview

本變更把「review 必經」從 prose 提醒變成機器閘門，並把高頻 playbook 規則落回 authoring skill 的決策點。核心是新增一個確定性的 `review-provenance` drift check：review 每輪完成時由 `prospec check --record-review` 以 code 計算並寫入「本輪 review 所見 change 狀態的內容指紋」；之後任何 `prospec check` 都重算當前指紋比對，缺席或指紋不符（review 後又改 code）即 FAIL。`/prospec-verify` Entry Gate 消費 drift 報告的此檢項，對 non-backfill 變更於 FAIL 時阻斷開跑。

關鍵設計決定（**本輪停在 tasks，此決定請於 implement 前確認**）：staleness 指紋由 **code 計算**（非 review agent 手算，符合專案「事實由機器產生」慣例）；指紋不依賴 git commit 時間戳（commit boundary 在 verify S/A 之後，review/verify 期 code 未 commit），改以 `git diff HEAD` + untracked 檔內容 + HEAD sha 的雜湊——只需偵測 review→verify 間的內容變動，無需偵測 default branch 或 merge-base（避免 base 偵測脆弱性）。寫入路徑沿用既有 `prospec check` 已有的 flag-driven 副作用慣例（`--json` 寫報告、`--init-ci` 寫 workflow），新增 `--record-review` 寫 metadata 的 review baseline，`check` 的純檢查路徑仍唯讀。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| types | Zod schemas、frozen 契約 | `DRIFT_CHECK_IDS`、`ChangeMetadataSchema`、`DriftReportSchema` | — |
| lib | zero-LLM drift 引擎（collector I/O + pure evaluator）、git 助手 | `collectGitTimestamps`/`gitLastCommit`、`runChecks`、`evaluate*` | types |
| services | `execute()` 編排、check 編排 | `check.service.execute`、`resolveBasePaths`、`resolveChange` | types, lib |
| cli | 薄 I/O、`check` 指令旗標 | `registerCheckCommand`（`--json`/`--strict`/`--init-ci`） | services |
| templates | skill 模板（.hbs）——review/verify/implement/plan + review-lenses reference | `prospec-review.hbs`、`prospec-verify.hbs`、`prospec-implement.hbs` | — |

### Existing Patterns (from _conventions.md)

- Collector（I/O，回 `{available, reason?, …}`）與 evaluator（純函式）嚴格分離；料源不可用一律 `skipped` + reason，嚴禁偽 PASS
- git 助手 `execFileSync`（非 shell，無注入）；staleness 以 epoch 比較、shallow/non-git → skipped（REQ-LIB-015 已立 mtime 不參與判定的先例）
- 新 check id 加入 `DRIFT_CHECK_IDS` frozen tuple → `Record<DriftCheckId, CheckOutcome>` 窮盡性成為編譯期護欄
- `check` 副作用僅在明確 flag 下發生（`--json`/`--init-ci`）；`atomicWrite` 寫檔；metadata 經 `parseYaml(doc.toJS())` lossless 讀取
- skill 模板變更須改 `.hbs`（`.claude/skills/` 為生成物），並由 skill-format contract（section-scoped + mutation-verified）釘住

### Architecture Constraints (from Constitution)

- 依賴方向 `cli → services → lib → types`——digest/collector/evaluator 落 lib、schema 落 types、注入與 record 落 services、旗標落 cli
- TDD：新 check 與 gate 行為測試先行、coverage ≥ 80%
- 文件（含本變更 artifacts、AI Knowledge）zh-TW；code/識別字/commit 英文

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Medium | `DRIFT_CHECK_IDS` append `review-provenance`（8→9）；`ChangeMetadataSchema` 新增 optional `review_provenance` |
| lib | High | `computeChangeDigest` + `collectReviewProvenance` collector + `evaluateReviewProvenance` pure evaluator + dispatch |
| services | High | `check.service` 注入 collector；`--record-review` 寫 metadata review baseline（scale-aware skipped in evaluator） |
| cli | Low | `prospec check` 新增 `--record-review` 旗標 |
| templates | High | prospec-review always-record；prospec-verify Entry Gate 阻斷；PB inline 進 implement/plan/review + review-lenses；PB-004/005 ledger/playbook 退役 |
| tests | High | evaluator/collector/service/CLI 單元＋服務測試；skill-format contract（section-scoped + mutation-verified） |

## Call Chain

```
# 1) 記錄 review provenance（review skill persistence 步驟執行）
prospec check --record-review
  → registerCheckCommand: action(options)                         [cli/commands/check.ts]
  → check.service.execute({ recordReview: true })                 [orchestration]
  → resolveChange(cwd) → active change dir                        [services/change-resolver]
  → computeChangeDigest(cwd)                                      [lib — HEAD sha + git diff HEAD + untracked, code-only pathspec (排除 .prospec/、report) → sha256]
  → atomicWrite metadata.yaml (review_provenance:{digest,date})   [side effect, flag-gated]

# 2) 檢查（verify Startup Loading 既有的 prospec check --json）
prospec check --json
  → check.service.execute()                                       [orchestration]
  → collectReviewProvenance(cwd)                                  [lib collector: 讀 .prospec/changes/*/metadata (status/scale/review_provenance) + computeChangeDigest 當前值; non-git/shallow → {available:false}]
  → runChecks({ reviewProvenance, … })                           [lib]
  → evaluateReviewProvenance(source)                              [lib pure: implemented+non-backfill 若缺 baseline 或 digest≠current → fail finding; backfill/非 implemented → 不 flag; unavailable → skipped]
  → DriftReportSchema.parse → prospec-report.json                 [structural.checks 含 review-provenance]

# 3) verify Entry Gate 消費（prose gate，讀既有報告）
/prospec-verify Entry Gate
  → 讀 prospec-report.json 的 review-provenance 檢項/findings
  → 若本 change 有 fail finding 且 scale≠backfill → 阻擋、指示先跑 /prospec-review
```

## Implementation Steps

1. **types：check id + metadata 欄位**
   - `DRIFT_CHECK_IDS` append `'review-provenance'`（additive；不動 `knowledge_health` 凍結契約）——會逼出 `runChecks` dispatch 的編譯期缺項
   - `ChangeMetadataSchema` 新增 optional `review_provenance`（`digest: string`、`date: string`）；沿用 lossless 讀取註記

2. **lib：digest + collector + evaluator**
   - `computeChangeDigest(cwd): string | null` — 雜湊 `HEAD sha` + `git diff HEAD` + untracked（`ls-files --others --exclude-standard`）內容；**pathspec 只涵蓋 code（`src/`、`tests/`），並排除工作流自身會動的檔案（`.prospec/`、`prospec-report.json`）**——否則 `--record-review` 寫 metadata、verify 更新 status 會自我判 stale；非 git 回 null（execFileSync，比照 `gitLastCommit`）
   - `collectReviewProvenance(cwd)` — non-git/shallow → `{available:false, reason}`；否則列舉 `.prospec/changes/*/`，每 change 帶 `{name, source_path, status, scale, recorded_digest, current_digest}`（比照 `collectTaskStates`）
   - `evaluateReviewProvenance(source)` pure — 對 `status==implemented` 且 `scale!==backfill`：無 `recorded_digest` → fail「no review recorded」；`recorded≠current` → fail「review stale — re-run /prospec-review」；相符 → 無 finding。其餘 status/scale 不 flag。`available:false` → `skipped(reason)`。findings codepoint-sort
   - `DriftCheckInputs` 加 `reviewProvenance` 欄位；`runChecks` dispatch 加 `'review-provenance': evaluateReviewProvenance(inputs.reviewProvenance)`

3. **services + cli：注入 + record 路徑**
   - `check.service`：`runChecks({ …, reviewProvenance: collectReviewProvenance(cwd) })`；新增 `options.recordReview` 分支——`resolveChange` → `computeChangeDigest` → `atomicWrite` metadata `review_provenance`（沿用 `--init-ci`/`--json` 的 flag-gated 副作用慣例；`--record-review` 與檢查互斥或先寫後查，二選一於此步定案）
   - `cli/commands/check.ts`：註冊 `--record-review` 旗標，映射 `recordReview: true`

4. **templates：review always-record + verify Entry Gate**
   - `prospec-review.hbs`：Persistence／Exit Gate 改為**每輪**（含 review-clean）寫一筆 `skill: prospec-review` quality_log 條目，並於 loop 收斂後執行 `prospec check --record-review`（graceful：不可用時明示、不靜默）
   - `prospec-verify.hbs`：Entry Gate 由「Recommended (non-blocking)」升為**阻斷**——non-backfill 變更讀 `prospec check` 的 review-provenance，FAIL（缺席/stale）即擋並指向 `/prospec-review`；`scale: backfill` 維持現行 recommended-only 豁免；對應 NEVER 更新

5. **templates：殘餘 playbook 落回 gate**
   - PB-001（contract 斷言 section-scoped+mutation-verify）→ `prospec-implement.hbs` NEVER + `review-lenses-content.hbs` test-quality lens
   - PB-003（claim ⊆ impl／deliberate-exclusion）→ `prospec-review.hbs` docs-claims lens（+ `review-lenses-content.hbs`）
   - PB-006（parallel-module 抽共用 helper）→ 強化 `review-lenses-content.hbs` DRY lens 的 PB-006 子句
   - PB-007（sweep 每個 consumer）→ `prospec-implement.hbs` NEVER + `review-lenses-content.hbs` parallel-site lens
   - PB-002（freq 1，design-time）→ 裁決**維持 playbook**（低頻、design-time authoring rule），於 `_playbook.md` Needs-Review 記錄裁決

6. **knowledge bookkeeping：PB-004/005 退役**
   - `_playbook.md` PB-004/PB-005 標記 retired（理由指向 #65 counts 工具 + verify S/A commit-prompt sync）；`_lessons-ledger.md` 對應條目狀態改 resolved/retired；Needs-Review List 補退役註記

7. **tests：先行 + contract**
   - unit：`evaluateReviewProvenance`（absent/stale/fresh/backfill/non-implemented/unavailable）、`computeChangeDigest`（temp git dir）、`collectReviewProvenance`
   - service：`check.service` 注入後 review-provenance 出現在報告；`--record-review` 寫 metadata；`--strict` FAIL→exit 1
   - contract：`skill-format.test.ts` section-scoped + mutation-verified 釘住 review always-record、verify Entry Gate 阻斷字樣、PB-001/003/006/007 grep-hit

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| digest 機制選型未定（誰算/存哪） | High | 已定 code-computed + `--record-review` 寫 metadata；本輪停在 tasks，implement 前與使用者確認；備案：指紋改存 review.md 由 collector 解析（省 CLI、較脆） |
| `git diff HEAD` 基準漏掉 branch 上 checkpoint commit 的變動 | Medium | 指紋含 HEAD sha——checkpoint commit 移動 HEAD 即改變 digest → 偵測為 stale；implement 本就禁 commit，屬邊界情形 |
| review-provenance 對「剛 implement、尚未 review」的 change 恆 FAIL | Low | 這是預期行為（提示先 review）；CI 中 `.prospec/` gitignored → collector skipped，不影響 CI exit code |
| 舊變更無 `review_provenance` 欄位 | Low | evaluator 視為 absent → 對 non-backfill implemented 變更要求先 review，向後相容、不 crash |
| 與 Change B（Constitution 收斂）同動 review/verify/implement 模板 | Medium | A 先合、B 自更新後的 main 分出；本 change 的模板編輯聚焦 Entry Gate/NEVER/lens，與 B 的 Constitution phase 收斂區段錯開 |
| skill-format contract 對 .hbs 措辭脆弱 | Medium | 斷言 section-scoped、對穩定 token（check id、NEVER 關鍵句）而非整段散文；mutation-verify 每條 |
| `--record-review` 讓 `check` 具寫入副作用 | Low | 沿用既有 `--json`/`--init-ci` flag-gated 副作用慣例；純 `check` 仍唯讀、確定性不變 |

## Constitution Check (Phase 6)

- **[SHOULD] One-way Dependency Direction** — Call Chain 檢視：digest/collector/evaluator 落 lib、schema 落 types、record/注入落 services、旗標落 cli，無反向或跨層；PASS
- **[MUST] TDD** — Step 7 測試先行、coverage ≥ 80%；PASS（承諾）
- **[MUST] Language Policy** — artifacts zh-TW、code/commit 英文；PASS
- 無 layering 違規；無 Risk Assessment 待記之外的憲法衝突
