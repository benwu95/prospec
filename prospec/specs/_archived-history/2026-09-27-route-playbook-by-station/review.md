<!-- prospec:review-metrics round="2" loop_base="1" provenance="c252063f8bf8fbc9e73372e46a70e90ed9f5a2f0e06f9f73f660f4451970e138" lenses="correctness-edge-cases,security-data-integrity,spec-architecture,maintainability-dry,docs-claims,parallel-site-completeness,test-quality" signatures="R1-M1:F,R1-M2:F" -->
# Review Findings: route-playbook-by-station

| ID | Location | Severity | Lens | Status | Origin | Summary | Repro |
|---|---|---|---|---|---|---|---|
| R1-M1 | tests/unit/lib/lessons-ledger.test.ts:534 | major | test-quality | proposed | 1 | all 萬用宣告的 selector 行為測試缺口仍存在；本輪未新增 mutation，第一輪刪除 wildcard 分支而測試仍綠的證據繼續適用。 | sed -n '534,615p' tests/unit/lib/lessons-ledger.test.ts |
| R1-M2 | tests/contract/skill-format.test.ts:286 | major | test-quality | proposed | 1 | 公開文件契約仍使用固定 1800 字元視窗，未按 heading／命令條目邊界隔離；第一輪將說明移至下一 heading 仍綠的缺口未改動。 | sed -n '282,297p' tests/contract/skill-format.test.ts |

<!-- prospec:evidence-section -->
## Evidence

<!-- prospec:evidence R1-M1 -->
### R1-M1

本輪以 fresh context 審閱 HEAD 3ade165b 至工作樹的累積 diff（包含新 playbook-station contract），完成 correctness-edge-cases、security-data-integrity、spec-architecture、maintainability-dry、docs-claims、parallel-site-completeness、test-quality 七鏡角。讀取完整 parser／selector／service／formatter 路徑並搜尋所有消費端；station grammar 共用 normalizeStationName，讀檔保留 readContained，所有新增 stdout／stderr 自由文字走 sanitizeTerminal，無新增寫入路徑或逆向模組依賴。未發現新 critical。verify 修正的三組 Sweep 治理條款、literal fallback stdout 與 compact Guidance 以 regression pins 檢查，不重新裁決已核可文字。所有執行均在委派 snapshot prospec-snapshot-review-reviewer-1-2-Rj1dDr；七檔以 playbook|Sweep|sweep|shared station tokens|compact 篩選，60 passed、1239 skipped；另完整執行 lessons-ledger、constitution-parser、learn.service、learn-output 四個 unit suites，104 passed。未跑全套，未新增 mutation；第一輪已執行的 mutation 證據保留如下。

第一輪證據（此輪 inspected source 確認相關實作與斷言未修正）：
獨立 reviewer 在隔離 snapshot /private/var/folders/bp/xj24qsl54z1_dxkn4k31tlqr0000gp/T/prospec-snapshot-review-reviewer-1-1-buMldi 執行實際變異。先跑本變更涉及的九個測試檔：unit/lib/lessons-ledger、unit/lib/constitution-parser、unit/services/learn.service、unit/cli/learn-output、contract/playbook-station、contract/skill-format、contract/cli-output、e2e/cli-station、unit/services/agent-sync.service，1381 tests 全綠。將 src/lib/lessons-ledger.ts 的 `item.entry.stations === 'all' || (item.entry.stations?.includes(station) ?? false)` 改為 `false || (item.entry.stations?.includes(station) ?? false)`，先 assert 替換恰好命中一次並確認已寫入，再跑同一組九檔，仍為 1381 passed、exit 0。此 mutation 確實使僅宣告 all 的條目無法在任一合法站別印正文；現行正常實作沒有這個 bug，缺口在測試。shared token parser 的 ALL 斷言只驗證解析，沒有驗證 wildcard 選取；repo 的 21 條實際資料也沒有提供 wildcard 案例。日誌：/private/var/folders/bp/xj24qsl54z1_dxkn4k31tlqr0000gp/T/prospec-snapshot-review-reviewer-1-1-buMldi/wildcard-mutation.log。
作為 mutation 正向對照，再把整個 station 選取 expression 改為 `item.matched`，lessons-ledger unit suite 實測 RED（2 failed、46 passed、exit 1），證明 runner 能載入變異源碼；日誌：/private/var/folders/bp/xj24qsl54z1_dxkn4k31tlqr0000gp/T/prospec-snapshot-review-reviewer-1-1-buMldi/module-selects-body-mutation.log。兩次 mutation 均在 finally 還原；還原後 lessons-ledger 與 skill-format 合計 1166 passed，日誌：/private/var/folders/bp/xj24qsl54z1_dxkn4k31tlqr0000gp/T/prospec-snapshot-review-reviewer-1-1-buMldi/restored-green.log。建議增加 literal fixtures：單獨 all 對所有 SDD_STATIONS 選取正文；all 混用 plan 只選 plan 且診斷 all，再以移除 wildcard 分支驗證 RED。此項是測試品質 advisory，並非把 REQ 完整度當成 review critical。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R1-M2 -->
### R1-M2

本輪以 fresh context 審閱 HEAD 3ade165b 至工作樹的累積 diff（包含新 playbook-station contract），完成 correctness-edge-cases、security-data-integrity、spec-architecture、maintainability-dry、docs-claims、parallel-site-completeness、test-quality 七鏡角。讀取完整 parser／selector／service／formatter 路徑並搜尋所有消費端；station grammar 共用 normalizeStationName，讀檔保留 readContained，所有新增 stdout／stderr 自由文字走 sanitizeTerminal，無新增寫入路徑或逆向模組依賴。未發現新 critical。verify 修正的三組 Sweep 治理條款、literal fallback stdout 與 compact Guidance 以 regression pins 檢查，不重新裁決已核可文字。所有執行均在委派 snapshot prospec-snapshot-review-reviewer-1-2-Rj1dDr；七檔以 playbook|Sweep|sweep|shared station tokens|compact 篩選，60 passed、1239 skipped；另完整執行 lessons-ledger、constitution-parser、learn.service、learn-output 四個 unit suites，104 passed。未跑全套，未新增 mutation；第一輪已執行的 mutation 證據保留如下。

第一輪證據（此輪 inspected source 確認相關實作與斷言未修正）：
新增 public playbook station documentation 測試用 lastIndexOf(command) 起點加 content.slice(start, start + 1800)，再查 --modules、--id、300、28%–88%；視窗跨越其他標題／指令條目，後方無關說明可替 playbook 區塊滿足斷言。獨立 reviewer 在 snapshot /private/var/folders/bp/xj24qsl54z1_dxkn4k31tlqr0000gp/T/prospec-snapshot-review-reviewer-1-1-buMldi 對 README.md、README.zh-TW.md、reference/cli-reference.md、reference/cli-reference.zh-TW.md 的最後一個 `prospec learn playbook --station` 命令所在行之後插入空行及 `## Unrelated command`，使原本所有實質說明離開該 playbook 區塊。每檔均 assert mutation 已改變文字後，執行 `node node_modules/vitest/vitest.mjs run tests/contract/skill-format.test.ts -t 'public playbook station documentation'`；結果 4 passed、exit 0，mutation 存活，日誌：/private/var/folders/bp/xj24qsl54z1_dxkn4k31tlqr0000gp/T/prospec-snapshot-review-reviewer-1-1-buMldi/docs-section-mutation.log。檔案均在 finally 還原，之後完整 skill-format 加 lessons-ledger 為 1166 passed（/private/var/folders/bp/xj24qsl54z1_dxkn4k31tlqr0000gp/T/prospec-snapshot-review-reviewer-1-1-buMldi/restored-green.log）。依 review-lenses-content 的 Test-Quality Lens，這是缺乏 section-scoped assertion 的 major false-green risk。建議以實際 playbook command 條目或 heading 邊界取得非空區塊，再限定欄位斷言；保留移到下一個條目／標題的負向 mutation，使其 RED。
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->
