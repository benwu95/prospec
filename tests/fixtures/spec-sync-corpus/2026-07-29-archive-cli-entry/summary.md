# archive-cli-entry — Archive Summary

- **Archived**: 2026-07-29
- **Original Created**: 2026-07-29T14:25:52.713Z
- **Quality Grade**: S

## User Story

As a prospec 維護者（透過 `/prospec-archive` 收尾變更的 AI agent 或人類），
I want 一個 `prospec archive <change>` CLI 命令執行決定論 mutation（搬檔、summary scaffold、spec-sync、`feature-map.yaml`）並支援 `--dry-run` 預覽，且 skill 收斂為只做判斷面工作（US-2），
So that 決定論工作由決定論程式碼執行，skill 與 service 不再雙重維護同一套語義（issue #98／BL-049 收束）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| cli | High | 新增 `commands/archive.ts` + `formatters/archive-output.ts`，`index.ts` 註冊（15→16 命令） |
| services | High | `archive.service.ts` 加 `dryRun` 單旗標短路與 `planned`/`refused`/`notFound`/`skippedReasons` 回報 |
| templates | Medium | `prospec-archive.hbs` 決定論步驟收斂為 CLI 呼叫，判斷面（Entry Gate／REQ 畢業／Review & Verify）保留 |
| tests | Medium | dry-run 零寫入快照、雙向 replay 等價、unsafe-slug 凍結、refusal、formatter/e2e/contract（mutation-verified） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-CLI-024 | ADDED | archive command with dry-run preview |
| REQ-SERVICES-071 | ADDED | archive.service dry-run mode and refusal reporting |
| REQ-TEMPLATES-159 | ADDED | archive skill delegates deterministic mutations to the CLI |

## Completion

- **Tasks**: 16/16 (100%), 3/3 [M]/[V] (not counted)
- **Acceptance Criteria**: 12/12（三 REQ 各 4 條，2/5 fresh-context 評審逐條確認）

## Review & Verify

- **Review**: 2 round(s), 1 critical / 5 major — review-clean。F1（critical, confirmed→fixed）：dry-run 的 feature-map 預測用結果導向 guard（`specFiles.length > 0`）而 real run 的觸發是 routes 存在（`ensureDir` 在 unsafe-slug filter 之前）——all-unsafe-slug delta-spec 下預測漏報；修法為抽 `readFeatureRoutes` 單一來源、預測改鏡射觸發條件。5 majors（notFound 誤診／skipped stdout／docs 高於實作／快照漏空目錄／等價測試單向）經人工核可全修
- **Verify**: Grade S — machine ledger 1/5·4/5·5/5 全 PASS（13/13 drift checks）；judgment ledger 2/5 PASS（fresh context）、3/5 PASS（6/6 rules）、6 not-applicable；`pnpm test` 2,525 passed（test_provenance exit 0）、coverage 95.59%
- **Quality Log**: 1 筆 WARN（prospec-review round 1：F1 critical＋F2-F6 majors，均已解）；其餘 PASS

## Knowledge Update

The following module documentation was synced in the feature commit (759e269):
- `prospec/ai-knowledge/modules/cli/README.md`（16 commands／19 formatters／39 files＋archive 條目）
- `prospec/ai-knowledge/modules/services/README.md`（archive.service dry-run／refusal 描述）
- `prospec/ai-knowledge/modules/templates/README.md`（prospec-archive 委派 CLI 註記）
- `prospec/index.md` cli keywords（archive, dry-run）
