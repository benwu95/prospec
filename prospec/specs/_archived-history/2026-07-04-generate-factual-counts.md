# generate-factual-counts — Archive Summary

- **Archived**: 2026-07-04
- **Original Created**: 2026-07-04
- **Quality Grade**: A
- **Scale**: quick · **Issue**: #65 (part a) · **Commit**: c816ddf (branch `benwu95/feat/generate-factual-counts`)

## User Story

As a 要讓 prospec 的 README 與 `prospec/index.md` 和程式碼保持一致的維護者，
I want 一支決定論的 `pnpm counts` 腳本，從單一來源重新推導每一個事實計數，並就地改寫每一份副本，
So that 事實計數只有一個生成來源，`docs/duplicated-count-drift`（PB-004）的人工重新推導不再復發。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| scripts/ (non-knowledge dev tooling) | High | 新增 `scripts/counts/`（types、rewrite、derive、registry、sync）＋ `scripts/sync-counts.ts` 入口；`pnpm counts` / `pnpm counts:check` |
| tests | Medium | 4 支新的 `tests/unit/scripts/counts-*.test.ts`（64 個測試）—— 純 rewrite/derive、registry↔docs 完備性 guard、冪等性、誠實 skip、mutation-verify |
| docs (root, non-module) | Low | README.md ＋ README.zh-TW.md 開發文件；計數已同步至 README×2 / index.md / tests README（dogfood） |

## Requirements

無 delta-spec（scale: quick）。**Quick spec-impact 檢查：無影響** —— `pnpm counts` 是 repo 內部的
開發工具（`scripts/` 不在 npm `files` 清單內），不是出貨的 `prospec` CLI 能力；
`prospec/specs/features/` 沒有任何 REQ 涵蓋它（drift-detection 管的是已出貨、唯讀的 `prospec check`，
屬另一個介面）。依 Entry Gate 診斷略過畢業。

## Completion

- **Tasks**: code tasks 100% 完成（唯一的條件式任務 —— 匯出 fenced-block helper —— 經評估不需要：
  anchor 已夠緊，因此 `lib` 未被動到）。`[M]` dogfood 完成；`[V]` mutation-verify 完成。
- **Acceptance Criteria**: US-1 達成 —— `pnpm counts` 就地改寫（dogfood 同步了 14 個計數：
  tests 1865→1926、unit 1204→1265、files 78→82）；同步後 `pnpm counts:check` exit 0；具冪等性。

## Review & Verify

- **Review**: 1 輪、0 critical / 2 major（皆已修）—— (1) `--check` CI gate 現在 fail closed
  （偵測到 drift 或計數來源不可得即 exit 1；抽出純函式 `checkFailed` ＋ 3 個測試）；
  (2) registry 完備性 guard 收緊為 `toBe(1)`，強制「anchor 恰好命中一行」這條不變式。
  Data-integrity lens 確認無虞：只有 5 份 registry 文件可觸達；
  `_lessons-ledger` / `_archived-history` / `.prospec/changes` 在結構上不可觸達（有測試把關）。
- **Verify**: Grade A —— 1/5 tasks PASS、2/5 delta-spec not-applicable（quick）、3/5 Constitution 全稽核
  PASS、4/5 knowledge-health PASS（0 stale、6/6 已記載）、5/5 tests WARN、6 design skipped（ui_scope none）。
  drift check 8/8 PASS。測試套件：本變更的 64 個測試全過；全套 1928/1929。
- **Quality Log**: review PASS（2 個 major 已修）；verify A。一個已知的**環境性** WARN ——
  `tests/e2e/cli.test.ts` 的 "prospec --help" 在全套並行負載下於 5000ms 逾時
  （既有問題；review 修正前即以相同形式失敗；單獨執行 43/43 全過；本變更未動到任何 `cli/` 程式碼）。
  非回歸。

## Knowledge Update

- `prospec/ai-knowledge/modules/tests/README.md` —— 測試計數已反映新增的測試（82 files / 1,926）；
  與測試檔在同一個 commit 提交，因此 `knowledge-health` 顯示 0 stale（counts 工具順帶讓模組 README
  保持新鮮 —— 本變更未觸發 PB-005 的摩擦）。
- `scripts/counts/` 不需要模組 README —— `scripts/` 是開發工具，不是知識模組
  （與既有的 `scripts/measure/` harness 相同）。
- **PB-004 註記**：本變更是 `docs/duplicated-count-drift` 的結構性修正 —— 本次 archive **未**遞增它的
  復發次數（工具已阻止任何 count-drift finding）。治理與結案屬人為的 `/prospec-learn` 決策，非自動 harvest。
