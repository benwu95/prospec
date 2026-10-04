# restore-harvest-summary — 封存摘要

- **Archived**: 2026-10-04
- **Original Created**: 2026-10-04
- **Quality Grade**: A
- **Issue**: #346

## User Story

身為查閱 change 與 lessons 的開發者，希望每次 change 留下一份可快速閱讀的封存摘要，並從其中的 Review & Verify 追溯審查與驗證過程。

Harvest 指引在 2026-08-30 的 reference 精簡中改為引用原始報告子目錄，與既有單檔摘要契約不一致。本次恢復摘要引用，讓 Codex 與 Claude 的 archive／learn references 使用相同契約。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Low | Harvest 指向設定 base_dir 下的摘要及 Review & Verify，保留舊紀錄的 Git 歷史 fallback；同步四份 references。 |
| tests | Low | 補強既有 REQ-TEMPLATES-128 guard、自訂 base_dir、摘要 placeholder 與實際量測 baseline；ceilings 維持原值。 |
| lib | Low | 透過既有 bundle pipeline 更新生成模板，不新增 renderer 或 archive writer。 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-128 | MODIFIED | 持久證據引用單檔摘要的 Review & Verify，路徑跟隨 base_dir；早於摘要慣例的紀錄由 ledger Git 歷史追溯。 |

## Completion

- **Tasks**: code 3/3（100%）；manual 1/1；verification 5/5。
- **Acceptance Criteria**: 4/4；REQ coverage 1/1。
- **Implementation**: 修正共享 reference、補強現有 guard、重新量測 baseline，並重新生成 bundle 與部署副本。
- **Mutation Checks**: 原始報告子目錄、缺少 Review & Verify、hardcoded base_dir 三種實際 bundle 變異均使 guard 失敗，還原後通過。

## Review & Verify

- **Review**: 獨立 fresh-context 審查 1 輪，0 critical／0 major，review-clean；delegation receipt 確認 repository facets 未改變。
- **Verify**: Grade A；task-completion／Knowledge／tests／delta-spec-compliance PASS；Constitution WARN；design not-applicable。四個凍結情境無語意偏差。
- **Tests**: 正式 pnpm test 與 coverage suite 均為 6,996 passed／4 skipped（共 7,000）；line coverage 97.62%、branch coverage 90.93%；lint、typecheck、counts、agents 及 prospec check --strict 通過。
- **Quality Log — 流程補正**: 在正式建立 change 前先修改；使用者指出後補建 Story、Plan、Tasks，保留真實順序並完成獨立 receipts，不宣稱規劃早於實作。
- **Quality Log — Plan WARN**: 初版漏列 lib 生成檔影響；已補入 metadata、plan、tasks 與 Knowledge stamp。
- **Quality Log — Tasks FAIL → PASS**: 初版將審查修正放入 [V] 任務，且 stamp 順序早於 guard 修改；改為重開對應 code 任務，將 stamp 移至內容確定後，獨立重查 PASS。
- **Constitution WARN**: verify 當時 knowledge:check 因尚未 commit 而 skipped，遠端 PR CI 尚待執行；feature commit 後已重跑 Knowledge gate，PR 的 CI 另行確認，不回寫或冒稱先前 Grade S。
- **Harvest**: 透過 CLI 新增 3 筆流程 lesson、累加 1 筆既有 stamp lesson；持久證據均引用本摘要，不自動晉升。

## Knowledge Update

- templates：REQ-TEMPLATES-128 的摘要證據引用已反映於 skill-authoring 指引。
- tests／lib：既有 guard／bundle owner 指引仍符合實作；三個模組均已檢視並以 CLI stamp。

## Scope

本次修復後續 Harvest 契約；既有封存的原始報告子目錄保留，CLI finalize 的單檔輸出行為沿用既有實作。
