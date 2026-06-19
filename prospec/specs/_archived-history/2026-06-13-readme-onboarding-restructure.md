# readme-onboarding-restructure — Archive Summary

- **Archived**: 2026-06-13
- **Original Created**: 2026-06-13
- **Quality Grade**: S
- **Scale**: quick（無 plan/delta-spec）

## User Story

As a 初次造訪 prospec GitHub repo 的新使用者（評估者或首次上手者），
I want README 以「這是什麼 → 適合誰 → 5 分鐘跑起來 → 核心概念 → 需要時再深入」的順序呈現，
So that 我能一次看懂並完成第一次成功使用，不必先消化 reference 級內部細節。

## Affected Modules

無程式模組受影響——`README.md` / `README.zh-TW.md` 為 repo root 文件，不屬 `module-map.yaml` 任一 module（純文件 IA 重排）。

## Spec Impact（quick 診斷）

Entry Gate 診斷：diff 僅重排既有能力的**呈現**，未新增/修改/移除任何 `specs/features/` REQ 行為 → **無 spec 影響**，跳過 Feature Spec graduation（Phase 3.5）。

## Completion

- **Tasks**: 14/14（13 code + 1 `[V]`）100%
- **Acceptance Criteria**: 4/4（funnel 順序、surface 零丟失、英中結構等價、internals 收進 `<details>`）——review T14 grep 驗證通過

## Review & Verify

- `/prospec-review`：Mode B、1 round、review-clean。0 critical，1 major（PB-003 family：Testing per-layer 細項 `433/35` vs 實際 `435/33`）已獨立複核後即時修復。
- `/prospec-verify`：Grade **S**（1/5 PASS、2/5 not-applicable、3/5 Constitution 全 PASS、4/5 PASS、5/5 PASS 909 tests、6 skip）。

## Knowledge Sync

- 本變更不涉任何 module README（docs-only），Entry Gate 知識同步項 PASS。
- 一併校正先前遺留的 **pre-existing 漂移**：`_index.md` 與 `prospec/ai-knowledge/modules/tests/README.md` 的測試細項 `unit 433 / e2e 35` → `unit 435 / e2e 33`（總和 909 不變，對齊 `vitest run tests/<layer>` 實測）。

## Lessons Harvest

新增 ledger 條目 `docs/duplicated-count-drift`（personal）：重複的事實型數字跨 README + knowledge 漂移、aggregate 總數可掩蓋互相抵銷的細項誤差、drift 引擎不檢查數字正確性——校正須從 live run 重新導出。
