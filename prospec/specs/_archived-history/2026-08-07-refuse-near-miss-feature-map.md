# refuse-near-miss-feature-map — Archive Summary

- **Archived**: 2026-08-07
- **Original Created**: 2026-08-07
- **Quality Grade**: A

## User Story

**US-1** — As a 在既有 product.md 上首次導入 prospec 的下游維護者，I want sync 在偵測到「近似 Feature Map 標題」時拒絕動作並指名該標題，So that 我的文件不會多出第二份 feature map，而是收到一則可據以改名的指示。

**US-2** — As a 執行 `prospec archive` 的維護者，I want 任何「sync 決定不寫 product.md」的判斷都在實跑輸出裡現形，So that 我不會誤以為 Feature Map 已同步。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | `inspectProductSpecSync` 單一判定（三種 decline）＋ `featureMapRegionHasContent` 狀態感知補救；`generateProductSpec` 改回傳 `{ path, declined }`；`ArchiveResult.productSpecDeclined` |
| cli | Medium | `archive-output.ts` 新增 warning-class stderr 區塊（`--quiet` 可見、不改 exit code） |
| templates | Medium | `product-spec-format` 載明近似標題規則與補救；`prospec-archive` Phase 3.6 與 Gate 新增 decline 與換名 feature map 兩問 |
| tests | Medium | 近似規則雙向列舉、三種 decline、bullet／table／prose 區段判定、formatter 與 contract 斷言 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-080 | ADDED | The product.md sync reports why it declined |
| REQ-CLI-033 | ADDED | archive prints a declined product.md sync to stderr |
| REQ-TESTS-076 | ADDED | Near-miss refusal is pinned in both directions |
| REQ-SERVICES-079 | MODIFIED | generateProductSpec splices instead of regenerating（折入近似標題拒絕） |
| REQ-SPEC-011 | MODIFIED | Product Spec Format Template（載明近似標題的拒絕與補救） |
| REQ-TEMPLATES-175 | MODIFIED | Archive skill Phase 3.6 states the preservation contract |

## Completion

- **Tasks**: 15/15 code tasks (100%)；`[M]`×2、`[V]`×2 皆已完成
- **Acceptance Criteria**: US-1 五項、US-2 四項全數有測試對應

## Review & Verify

- **Review**: 6 round(s), 7 critical / 7 major — 6 個 critical 全修並各自突變驗證；未解 major 一筆（F-10：`missing-features-dir` 的 false 分支在「近似標題＋目錄缺席」複合狀態下預測失真，無資料損失）。**6 個 critical 中有 5 個由前一輪的修復引入**，集中於「只條件化剛動過的那一格、未重讀所在合取式」與「判準問錯問題」（F-9 以 `###` 條目數回答「splice 會抹掉什麼」，一度重演本變更要防的資料損失）
- **Verify**: Grade A — machine ledger 1/5 task-completion PASS · 4/5 knowledge-health PASS · 5/5 test-provenance PASS；judgment ledger 2/5 WARN（fresh context）· 3/5 PASS（7/7 憲章規則）· 6 not-applicable；`pnpm test` 143 檔 3320 綠、覆蓋率 Statements 94.82%／Lines 95.26%
- **Quality Log**: 2 筆 WARN —— F-8（既有缺口：Phase 3.6 Gate 末項 `feature-map.yaml` present 在無 `specs/features/` 的專案永遠勾不起來，本變更之前既有）、F-10（未解 major，同上）

## Knowledge Update

已於 verify S/A commit prompt 折入 feature commit：
- `prospec/ai-knowledge/modules/services/spec-sync.md`
- `prospec/ai-knowledge/modules/cli/README.md`
- `prospec/ai-knowledge/modules/templates/README.md`

## Notes

- 觸發來源為下游 dogfood 回報：手寫的 `## Feature Map (34 active)` 對不上精確比對，archive 於檔尾 append 出第二份機器所有的 Feature Map，且舊 Phase 3.6 檢查項在該 append 版本上會通過，人工把關攔不住。
- 登記為 `stop-clobbering-product-spec` 的逃逸缺陷（`introduced_by`）。
