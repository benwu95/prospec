# mechanize-knowledge-sync-gate — Archive Summary

- **Archived**: 2026-08-14
- **Original Created**: 2026-08-14
- **Quality Grade**: A
- **Issue**: 147

## User Story

**US-1**：As a prospec contributor（人或 agent，正讓一個觸及模組 source 的變更落地），I want 一個決定論閘門在 merge-base..HEAD 上比對「source 有變的模組」對「`last_verified` 有 bump 的模組」，缺同步即以非零離開並點名該模組，So that `knowledge-sync-touched-module-readme` 的失效模式在源頭被**預防**，而非依賴事後 backstop。

**US-2**：As a prospec maintainer，I want module-map.yaml 每個模組帶一個 CLI 戳記的 `last_verified`，且 `knowledge-health` 依它判 staleness，So that 「知識是否過期」由一個顯式、可稽核的確認時間決定，而非依 README 的 git commit 時間推斷。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `ModuleEntrySchema` 新增 optional `last_verified`（載重欄位：不入 schema 即被 reader strip）；`knowledge_health` 報告加法式帶出該鍵 |
| lib | High | knowledge-health staleness 信號由「README／sub-module commit 時間」遷移為「`last_src_commit` vs `last_verified`」，按 UTC 日比較，嚴重度維持 WARN；凍結報告鍵不改名不重排 |
| services | High | 新增 `knowledge-verify.service.ts`——`last_verified` 的唯一 writer（注入 `now`、走 comment-preserving Document 寫入）；`knowledge update` 保留但不 auto-stamp |
| cli | Medium | 新增 `prospec knowledge verify <module>...` 指令＋formatter，接線於 `cli/index.ts` |
| templates | Low | shipped `references/drift-report-format` 改述 `last_verified` 為 staleness 參考 |
| tests | High | 閘門三情境／schema round-trip／staleness 遷移／報告形狀／戳記與保留；ci.yml step-order 契約 baseline |
| (scripts / CI / docs) | High | `scripts/check-knowledge-sync.ts` ＋ `pnpm knowledge:check`；ci.yml step ＋ `fetch-depth: 0`；Constitution Pre-Merge CI Checks 6→7；雙語 root README 對等 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-084 | ADDED | Module entry carries a `last_verified` confirmation time |
| REQ-SERVICES-090 | ADDED | `prospec knowledge verify` stamps and preserves `last_verified` |
| REQ-TESTS-088 | ADDED | CI gate fails a source change that does not bump `last_verified` |
| REQ-LIB-015 | MODIFIED | Knowledge health check：source commit vs `last_verified`（取代 README／sub-module commit 比較） |
| REQ-TYPES-073 | MODIFIED | `knowledge_health` 可重現參考改為 `last_verified`；`last_sub_module_commit` 續報但不驅動 `stale` |
| REQ-TESTS-067 | MODIFIED | sub-module commit 與 staleness 脫鉤，原條款與 fixture 退位 |

## Completion

- **Tasks**: 22/22 (100%)（code 21、`[M]` 1）
- **Acceptance Criteria**: 7/8 —— US-2 第 3 條（`knowledge update` 重寫 README 時 bump）於實作期被明確反轉為「`knowledge verify` 為唯一 stamper」，畢業時以實作決策為準寫入 Feature Spec

## Review & Verify

- **Review**: 2 round(s)，2 critical / 7 major / 1 minor —— critical 皆為 spec-architecture（A-1 delta-spec REQ-SERVICES-090 與 no-auto-bump 實作不符；A-2 遺漏 REQ-TYPES-073／REQ-TESTS-067 的 staleness 信號調和），已修；major 主軸為閘門 fail-open（M-1／S-1 bump 判定放行手改值、M-2／S-2 無效 base map 靜默通過）與 T-1 契約測試未 pin `fetch-depth: 0`，已修；A-3 留 `proposed`，於本次畢業調和
- **Verify**: Grade A —— 1/5 task-completion PASS、2/5 delta-spec-compliance PASS（獨立 fresh context，6 REQ 逐條 AC 有實碼佐證）、3/5 Constitution WARN（8 條逐條稽核，Factual Count Integrity 的 hand-maintained 層失準，已於 commit prompt 修正）、4/5 knowledge-health PASS（6/6 documented、0 stale）、5/5 test-provenance PASS、6 design not-applicable；`pnpm test` exit 0（154 files / 3,853 tests），coverage 94.41%
- **Quality Log**: 3 筆 —— review ×2 WARN（皆為 A-3 順延至 archive 調和）、verify ×1 PASS grade A 帶 2 個 warning（hand-maintained 計數失準；proposal/plan 敘事與已落地決策相反）

## Dogfood

本變更自證通過它新增的閘門：commit 後 `pnpm knowledge:check` 回報 `6 source-touched module(s) all confirmed since 4e7da3e98494`、exit 0（proposal SC-006）。

## Knowledge Update

已於 verify S/A commit prompt 同步並折入同一個 feature commit：
- `prospec/ai-knowledge/modules/cli/README.md`（檔數／registrar／formatter 計數、`knowledge (init/update/verify)`）
- `prospec/ai-knowledge/modules/services/README.md`（檔數、`knowledge-verify` 為唯一 writer）
- `prospec/ai-knowledge/modules/lib/drift-engine.md`（staleness 改讀 `last_verified`、UTC 日粒度）
- `prospec/ai-knowledge/modules/types/README.md` ＋ `frozen-registries.md`（`last_verified` 為載重 schema 欄位、加法式凍結鍵）
