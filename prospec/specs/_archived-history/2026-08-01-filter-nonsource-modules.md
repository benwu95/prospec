# filter-nonsource-modules — Archive Summary

- **Archived**: 2026-08-01
- **Original Created**: 2026-07-31
- **Quality Grade**: S

## User Story

As a developer onboarding a brownfield project with prospec,
I want module 偵測只看原始碼檔案，
So that 產出的 `module-map.yaml` 只列真正含程式碼的目錄，不必手動修剪一堆文件目錄。

（另含 US-2「窄化不得把偵測不精準升級成完全偵測不到」與 US-3「src-集中型專案零回歸」。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `module-detector.ts` 新增 `NON_SOURCE_FILE_EXTENSIONS` 拒絕清單與 `isSourceFile()`／`filterSourceFiles()`；`detectModules()` 以子集跑策略，零結果退回完整清單 |
| tests | Medium | `module-detector.test.ts` 新增 10 個 gating 測試（+261 行） |

REQ-KNOW-014 的 `KNOW` 是 feature 前綴（feature-map `req_prefixes`）而非 module；經 `**Feature:** ai-knowledge` 解析為 `[cli, lib, services, templates, tests]`，本變更實際只觸及 `lib`／`tests`。

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-038 | ADDED | Module 偵測以非原始碼副檔名拒絕清單收斂輸入，零結果退回完整清單 |
| REQ-KNOW-014 | MODIFIED | 四種策略改吃原始碼子集；子集無結果時同策略以完整清單重跑 |

## Completion

- **Tasks**: 11/11 code tasks (100%)，外加 1 `[M]` + 2 `[V]` 全數完成
- **Acceptance Criteria**: REQ-LIB-038 六個 AC 全 PASS、REQ-KNOW-014 四條 WHEN/THEN 全 PASS（獨立評分者逐條查證）

## Review & Verify

- **Review**: 2 round(s)，2 critical / 4 major。**F-1（critical）**：原白名單極性搭配全專案 fallback，使語言不在清單上的專案丟失全部程式碼目錄（實測 Fortran 專案僅剩 `['docs']`）→ 極性反轉為非原始碼拒絕清單。**NEW-1（critical；審查者評 major，實際判 critical）**：反轉後子集「太薄」仍產出零 module，而 `knowledge init` 只在檔案不存在時寫入，空 map 永久黏著（k8s manifest／docs-as-code／LaTeX 實測，並以 knowledge-init 端到端確認）→ fallback 判準改為「找不到 module」。Majors：F-2 template／樣式測試對整組排除恆真、F-3 entryPoints 註解理由為假且 delta-spec 條目不可傑偽、F-4 `16→10` 數字殘留、R-1 已知殘留（無副檔名／文稿副檔名專案；advisory，移交 issue #114）。8 次變異驗證各令預期測試轉紅。
- **Verify**: Grade S — machine ledger `task-completion=PASS · knowledge=PASS · tests=PASS`；judgment ledger `delta-spec-compliance=PASS`（fresh context，三輪收斂）、`constitution=PASS`（6/6 規則）、`design=not-applicable`（`ui_scope: none`）。`pnpm test` exit 0（2940 passed／4 skipped）；`module-detector.ts` 覆蓋率 99.17% stmts／95.13% branch／100% funcs。
- **Quality Log**: 兩筆 `prospec-review` WARN（第一輪 F-1 escalate、第二輪 R-1 advisory 殘留）；new-story／plan／tasks／implement／verify 皆 PASS，無 FAIL。

驗收數據：真實 brownfield `../olfparser`（1199 檔）module 數 **16 → 9**，移除的 7 個（`.github`、`docs`、`enbspec`、`iwbspec`、`olfspec`、`pptxspec`、`samples`）逐一確認為零原始碼目錄。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md` — 已於 verify S/A commit 前同步（Key Files 標註 source-gated；Pitfalls 記載 gate 住在 detector 而非 scanner 的理由與極性選擇）
