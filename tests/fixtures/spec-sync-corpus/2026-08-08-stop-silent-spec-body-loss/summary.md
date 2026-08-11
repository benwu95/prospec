# stop-silent-spec-body-loss — Archive Summary

- **Archived**: 2026-08-08
- **Original Created**: 2026-08-07
- **Quality Grade**: A

## User Story

下游專案回報 `prospec archive` 的 Feature Spec sync 洗掉信任區內容：兩份規格 `**Scenarios:**` 底下全部的 WHEN/THEN 條列消失，且 review 前的舊 delta-spec 把剛修好的 REQ 覆蓋回去。根因調查找出四個彼此獨立的機制缺口，全落在「機械 sync 可以在無人察覺下改寫信任區」這條路徑上。

作為使用 prospec 的維護者，我要 archive 在會流失既有行為時停下來而不是照寫，這樣保住信任區就不必依賴「記得先做快照」。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | 邊界改為首次出現判定＋截斷拒絕；`**Dropped:**` 宣告與三分類；流失判定前移至 `moveToArchive` 之前；`--record-review` 同寫 delta-spec 指紋 |
| lib | High | `computeDeltaSpecDigest`／`collectDeltaSpecProvenance`／`evaluateDeltaSpecProvenance`；第 16 個 check 的分派 |
| types | Medium | 第 16 個 frozen check id；`delta_spec_provenance` 欄位 |
| cli | Medium | refusal 渲染帶 block 身分；dropped／refusal 改為 blocking-class 並驅動退出碼；`--record-review` 分印兩種訊息 |
| templates | Medium | 兩份 format reference 收斂；archive Entry Gate 三個 provenance；Phase 3.5 列出五份 worklist |
| tests | High | 合成 fixture、真實語料迴歸、契約測試、e2e 恢復路徑、guard 自身測試 |

## Requirements

9 ADDED：`REQ-TESTS-079`／`REQ-SERVICES-081`／`REQ-CLI-034`／`REQ-SERVICES-083`／`REQ-TESTS-077`（sdd-workflow）、`REQ-TYPES-078`／`REQ-LIB-045`／`REQ-SERVICES-082`／`REQ-TESTS-078`（drift-detection）

19 MODIFIED：`REQ-SERVICES-072`／`REQ-SERVICES-073`／`REQ-CLI-032`／`REQ-CLI-033`／`REQ-TEMPLATES-166`／`REQ-TEMPLATES-168`／`REQ-SPEC-010`／`REQ-TESTS-070`（sdd-workflow）、`REQ-TYPES-052`／`REQ-SERVICES-062`／`REQ-TEMPLATES-171`／`REQ-TESTS-045`／`REQ-TYPES-075`／`REQ-TEMPLATES-172`／`REQ-LIB-027`／`REQ-TYPES-034`／`REQ-LIB-014`／`REQ-TESTS-074`／`REQ-CLI-011`（drift-detection）

## Completion

- **Tasks**: 27/27 code tasks (100%)，另 `[M]` 2 ／ `[V]` 1 皆完成
- **Acceptance Criteria**: 6 條 User Story 的驗收情境全數以測試或實測覆蓋

## Review & Verify

- **Review**: 4 round(s), 27 critical / 20 major — 全解。Round 2 的三個發現有兩個由 round-1 的修復造成（本 repo 最常見的失敗模式）。最嚴重者：擋寫發生在 `moveToArchive` 之後，使「held write」實為永久不寫且無 CLI 可及的重入路徑（三個 lens 各自實測）；登記表白名單只是把靜默截斷換窄，且掉落偵測接不住（被吞的是新文字）；條列放寬造成假 drop，讓它想幫的專案反而被硬擋。
- **Verify**: Grade A，1/5 · 4/5 · 5/5 machine PASS，2/5 · 3/5 judgment PASS，6 not-applicable；`pnpm test` exit 0（3,464 passed），coverage 94.91%。2/5 跑了五輪 fresh-context 才收斂（發現數 1 → 3 → 2 → 1 → 0）。
- **Quality Log**: 4 筆 `prospec-review` WARN（逐輪 16/4/2/4 critical，皆已修）、1 筆 `prospec-verify` WARN（grade B，WARN 超標）、1 筆 `prospec-verify` PASS（grade A）。唯一未解 WARN：F-17 —— `.prospec/` 於 CI 被 gitignore，`spec-sync-corpus` 的 archived-corpus 迴歸在 CI 全 skip（issue #146）。

## Notes

- **本變更成功自我歸檔**：它新增的擋寫機制作用在自己的 archive run 上，12 個 `**Dropped:**` 宣告與計算集合完全相符，零拒絕、零未宣告。過程中守衛四度在自己身上生效，每次都逼出一條真的漏改。
- **無法靠 dogfood 驗證**：截斷與條列放寬在本 repo 皆零觸發（75 份 archived delta-spec 的 128 個終止點全為樣板欄位；1,734 條 bullet 全為 `- WHEN`），下游踩到是因為照另一份 reference 的骨架寫。驗證以合成 fixture ＋ 真實語料迴歸 ＋ mutation 為準。
- **Phase 3.5 手動收斂清單共 13 項**（見 delta-spec 末尾）——US 層文字沒有機械畢業載體，已於本次 graduation 逐條執行。
