# collapse-knowledge-refresh-into-init-flag — Archive Summary

- **Archived**: 2026-06-16
- **Original Created**: 2026-06-16
- **Quality Grade**: A (verified)

## User Story

As a prospec 維護者（與透過 skill 流程或 CLI 觸發掃描重生的下游開發者），
I want 用 `prospec knowledge init --raw-scan-only` 取代 `prospec knowledge refresh`，
So that CLI 表面只保留單一 `knowledge init` 動詞，同時保留「只刷 raw-scan、不碰 curated 檔」的負向保證。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| cli | High | `knowledge init` 加 `--raw-scan-only`；移除 `knowledge refresh` 指令 + formatter；index.ts 取消註冊 |
| services | High | `knowledge-init.service` 加 rawScanOnly 分支；`raw-scan.service` 移除孤兒 `execute` 委派 |
| templates | Medium | knowledge-generate / archive / raw-scan.md.hbs 改呼叫 `init --raw-scan-only` |
| tests | Medium | 新增 `--raw-scan-only` 單元 + e2e；移除 execute / 舊 refresh 案例 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-022 | MODIFIED | raw-scan-only 重生改由 `init --raw-scan-only` 提供；standalone refresh 指令移除 |
| REQ-KNOW-023 | MODIFIED | shared `generateRawScan` 呼叫者收斂；`execute` 委派移除 |
| REQ-KNOW-024 | MODIFIED | archive Phase 4 改用 `init --raw-scan-only`；archive.service safety net 不變 |
| REQ-KNOW-025 | MODIFIED | generate startup 改用 `init --raw-scan-only`；loading item first backtick token 維持 raw-scan.md |

## Completion

- **Tasks**: 16/16 code (100%); 2 `[M]` + 2 `[V]` done
- **Acceptance Criteria**: 5/5 met
- **Quality**: tests 1145 green, lint clean, build clean, drift 5/5 PASS, review 0 critical / 0 major

## Knowledge Update

Synced at archive: module READMEs (cli / services / templates) + raw-scan.md header; `_index.md` cli counts already accurate (no edit). Feature Spec `ai-knowledge.md` graduated (REQ-KNOW-022/023/024/025 MODIFIED, replace-in-place + Change History).

## Notes

- 指令表面收斂，capability 不變 → 全 MODIFIED，無 ADDED/REMOVED。
- 實作於 PR #35（branch `refactor/knowledge-init-raw-scan-only`）：feature commit `2ff4d35` + 本 archive commit。
