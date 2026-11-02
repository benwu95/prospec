# count-index-evidence — Archive Summary

- **Archived**: 2026-11-02
- **Original Created**: 2026-11-02
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/430

- **Plan Decision**: option-a (graded_by: human)

## User Story

As a 維護 Prospec freshness 與 evidence 的開發者，I want 使用 git index 成員的工作樹內容，So that 普通 untracked 暫存檔不使驗證過期，實際交付內容變動仍須重新驗證。三個 story、八個 frozen scenarios 全部符合。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| lib | High | 共用 index reader、digest／snapshot 與 preservation 模式；workTreePaths callers 明示 membership。 |
| services | Medium | 保留 evidence writer 與 before／after guard，同步共用診斷。 |
| cli | Medium | 更新雙語 evidence 操作說明及 staging／migration 取捨。 |
| templates | High | 四站記錄前提示 stage intended 新檔，canonical bundle／部署同步。 |
| tests | High | 真實 Git、migration、preservation、subprocess 與指引 mutation pins。 |
| docs | Medium | 雙語 submodule 行為、staging 與升級限制。 |
| types | Low | SourceInventory 契約註解與既有 schema 相容性。 |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-LIB-015 | MODIFIED | Freshness 以 index 成員與工作樹內容計算。 |
| REQ-LIB-024 | MODIFIED | Evidence 採 index membership，保留版本與 symlink 邊界。 |
| REQ-LIB-070 | MODIFIED | 共用 reader 與 consumer policy，保持 ordinary subprocess 上限。 |
| REQ-SERVICES-068 | MODIFIED | 普通 untracked outputs 可收斂，indexed outputs 保持受檢。 |
| REQ-LIB-071 | MODIFIED | Archive 拒收沿用共用 index-input hint 並去重。 |
| REQ-LIB-090 | MODIFIED | Preservation 明確保留 untracked mutation detection。 |
| REQ-CLI-052 | MODIFIED | 一致的 index／stage 診斷與雙語 migration 指引。 |
| REQ-TESTS-042 | MODIFIED | 成對 real-Git evidence 與 migration 回歸。 |
| REQ-TESTS-112 | MODIFIED | 全站、subprocess、recording 與 preservation 回歸。 |
| REQ-TESTS-137 | MODIFIED | Opt-in reuse 依 indexed inputs 判定。 |
| REQ-TEMPLATES-129 | MODIFIED | Implement final-sync／stamp／record 前 stage 新檔。 |
| REQ-TEMPLATES-162 | MODIFIED | Knowledge stamp 前 stage 新檔。 |
| REQ-TEMPLATES-130 | MODIFIED | Review record 前 stage，保留 provenance 引言與理由。 |
| REQ-TEMPLATES-154 | MODIFIED | Verify reuse／real-run 決策前 stage。 |
| REQ-TESTS-090 | MODIFIED | 四站 section/order 與 deletion／move mutation contracts。 |
| REQ-DOCS-002 | MODIFIED | 雙語 submodule index membership 說明。 |

## Completion

- **Tasks**: 22/22 code tasks（100%）；3/3 verification reminders 完成，沒有 manual tasks。
- **Acceptance Criteria**: 8/8 frozen scenarios；16/16 REQ PASS。
- **Design**: UI Scope none，design 不適用。

## Review & Verify

- **Review**: 4 rounds，0 critical／0 major；唯一 minor 為 Tests Knowledge 的舊 untracked snapshot 宣稱，已刪除。最後 fresh cumulative review 全八個 lens 零新增 finding。
- **Verify**: 最後 Grade S；machine task-completion／knowledge／tests PASS，fresh delta-spec-compliance／constitution PASS，design 不適用。16/16 REQ、8/8 Constitution rules；獨立 snapshot 24 files／2652 cases PASS。
- **Quality Log**: tasks 第一輪 FAIL：T24 將 formatter／lint fix 混入 verification kind，移至 code task 後 PASS。verify 第一輪 Grade C：REQ-CLI-052 遺漏保留的 Git status inspection command，補回唯一 hint owner、雙語 reference 與 mutation assertion 後 Grade S；後續 Claude 四項修正再經 fresh review／verify Grade S。歷史 FAIL 與 evidence 保留，無未解 WARN／FAIL。
- **Tests**: 最終完整 coverage 與 CLI pnpm test 各 341 files、9143 passed／4 platform skips／0 failed；line14252/14550（97.95%）、branch11480/12570（91.32%）。最新 CLI passed attempt 9937b05d-c92f-47c7-b01f-93194eb3a379。
- **Delivery**: build／lint／typecheck／counts:check／agents:check／strict drift exit0；23 checks、0 FAIL／1 既有 knowledge-size WARN／0 skipped。Feature commit 8b20b594 後 knowledge:check 實際通過：5/5 source-touched modules confirmed。
- **Measurement**: mandatory context 91121/91150、review 8125/8215，ceilings 未提高；ordinary Git subprocess 5/6、temporary-index 5/5。

## Decisions & Limitations

採人類簽核的方案 A：共用 git-read reader、保留各 consumer policy 與兩輪 temporary-index recording。Claude review 要求將 workTreePaths membership 改為必填，取代歷史 plan/T05 的 optional default 實作細節，callers 行為與 frozen scenarios 不變。

source-v1／snapshot-v2 不升版；曾包含 untracked 成員的舊記錄可能失效一次。未 stage 的測試依賴仍可能影響執行而不在 evidence 成員內，依雙語指南由 pre-merge CI 補足。#438 indexed-file-to-directory 留待獨立 change。此 summary 記錄的本機環境未執行遠端 CI／Windows；PR 另回報遠端結果。

Knowledge 已確認 lib（5 REQ）、services（1）、cli（1）、tests（4）、templates（4）及 types（SourceInventory ripple，無獨立畢業 REQ）；6/6 registered modules digest-match。docs 的 1 個 REQ 反映於公開雙語文件。Correction ledger 保持獨立 concern，沒有晉升共享規則。

## Post-Archive CI Correction

PR #439 初次 Linux／Node 22 CI 為 9139 passed／7 skipped／1 failed（9147 inventory），失敗位於 test-input-snapshot 的 case-only rename fixture：case-sensitive filesystem 上的新路徑是 untracked，舊斷言卻要求預設 snapshot 隨其 bytes 改變。保留上述 archive 時點的 Grade S 與測試紀錄，不將這次 CI 失敗覆寫為通過。

原 fixture 改為 KB／other-kb 配對，依實際 filesystem alias 判定 stage 前的成員，並新增 stage 後 full snapshot 改變、Knowledge projection 保持不變的斷言；production code 未變。強制 distinct path 在 macOS 重現相同舊斷言失敗，修正後 focused 26/26 PASS；Linux／Node 22.22.3 container 的兩個路徑皆重現舊斷言轉紅並通過新判準。新增一個 case，inventory 9147→9148，由既有 count generator 同步；最終交付測試與遠端結果由 PR checks 補充，不冒稱重新執行 archive 前的 S/A 分級。
