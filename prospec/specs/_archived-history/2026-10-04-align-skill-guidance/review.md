<!-- prospec:review-metrics round="3" loop_base="2" provenance="b1c145419e477e6f171c84c856e7dbaf0468c4705c7675b4c6b8f77784f7a501" lenses="correctness%20%26%20edge%20cases,security%20%26%20data%20integrity,spec-architecture,docs-claims,parallel-site%20completeness,test-quality" -->
# Review Findings: align-skill-guidance

| ID | Location | Severity | Lens | Status | Origin | Summary | Repro |
|---|---|---|---|---|---|---|---|
| F-326-1 | src/templates/skills/references/review-format.hbs:72 | major | parallel-site completeness | fixed | 1 | 已刪除 clean round 必須手動補句的義務；reference 只保留 closing marker 後的 optional author notes 與 CLI artifact owner。 | sed -n '67,75p' src/templates/skills/references/review-format.hbs |
| F-326-2 | src/types/cli-help.ts:107 | major | docs-claims | fixed | 1 | help、雙語 Reference 與 services Knowledge 已揭露 WARN 及完成的 artifact 寫入留存；兩個後段失敗注入確認 findings 留存且無 round counts。 | sed -n '409,440p' src/services/review-merge.service.ts |

<!-- prospec:evidence-section -->
## Evidence

<!-- prospec:evidence F-326-1 -->
### F-326-1

review-format.hbs:72 現在將 notes 明確標為 Optional，artifact generation 指向 prospec review merge；prospec-review 的 Persistence/Provenance 仍保留 counts、close、baseline 操作。review-merge.service.ts 只在 merged.length === 0 產生 clean sentence；新增 carried fixed/accepted row 案例與 optional author notes scoped contract 均通過。已自行把 template 的 Optional author notes 改成 Author notes must，先重生 bundle 再跑對應 contract，得到 exit 1／AssertionError；還原後轉綠，mutation-optional-author-note.log 為實際來源 mutation receipt。原 major 的誤導操作義務已移除。

本輪以 main HEAD 9e4237e0c430 為基準，讀取 git diff HEAD 的完整累積來源／測試變更，排除 generated bundle/deployed 巨量內容與 factual-count 噪音，另驗證 generated parity。已讀 proposal、plan、delta-spec 的 21 個 MODIFIED、tasks、audit-sites、舊 review 與 mutation-receipts.json；保留 #325 時序及 #342 全面 assertion 清理的排除範圍。實跑六 lenses：correctness & edge cases、security & data integrity、spec-architecture、docs-claims、parallel-site completeness、test-quality。檢查 review merge 完整 execute、verify 的 proven-backfill／Gate A predicate、routeChange、knowledge module classifier 與逐檔 collector；本次 production 邏輯未增添 writer 或改變依賴方向，未發現新 critical/major。grep shipped/init/reference/Knowledge/雙語 README 同族錯誤指引無殘留命中；活 Specs 正文留待 archive sole-writer，delta 已記錄收斂。
隔離 snapshot /private/var/folders/bp/xj24qsl54z1_dxkn4k31tlqr0000gp/T/prospec-snapshot-review-reviewer-1-2-1AQdMk 中執行六個相關測試檔，1,519 tests 全數通過；actual-source mutation 後逐次還原，再重跑同六檔仍 1,519 passed。記錄：review-targeted.log、review-restored.log、review-mutations.json。cacheDir 明確設在 snapshot，node_modules 僅唯讀共用。以 snapshot 原始 sources 重生 bundle，bytes 完全一致；source CLI agent sync 比較 .agents/.claude 全部 142 files，無 changed/added/removed。未在本 reviewer 重跑全套 coverage/lint/typecheck，不把 orchestrator 報告冒稱自行執行。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-326-2 -->
### F-326-2

review merge 的完整寫入路徑仍先寫 WARN，再寫 review.md，最後檢查／寫入 metadata counts。help、reference/cli-reference.md、reference/cli-reference.zh-TW.md 與 services README 已將 metrics-only 限於 initial refusal，後續拒收揭露 persisted WARN 與 completed artifact writes 留存，沒有宣稱 rollback 或 findings 必不變。delta 的 direct owner REQ-SERVICES-086 與 098、CLI-028、TYPES-098 已一致收斂。新增 metadata mutation 與 counts write failure 兩個後段 failure injections 實跑通過：TestGateError、warningRecorded=true、WARN=1、review.md 含 F-1、沒有 prospec-review round counts，且 concurrent comment 保留。已自行施加兩個 source mutations：將 help 的 completed artifact remains 改成不留存，CLI contract exit 1／AssertionError；將 service 的實際 findings 寫入改成只寫 omitted-findings heading，兩個後段案例 exit 1／AssertionError。記錄 mutation-retained-artifact-disclosure.log、mutation-retained-findings.log；來源還原後全數轉綠。因此原 major 已修復，production 寫入演算法維持不變。

本輪以 main HEAD 9e4237e0c430 為基準，讀取 git diff HEAD 的完整累積來源／測試變更，排除 generated bundle/deployed 巨量內容與 factual-count 噪音，另驗證 generated parity。已讀 proposal、plan、delta-spec 的 21 個 MODIFIED、tasks、audit-sites、舊 review 與 mutation-receipts.json；保留 #325 時序及 #342 全面 assertion 清理的排除範圍。實跑六 lenses：correctness & edge cases、security & data integrity、spec-architecture、docs-claims、parallel-site completeness、test-quality。檢查 review merge 完整 execute、verify 的 proven-backfill／Gate A predicate、routeChange、knowledge module classifier 與逐檔 collector；本次 production 邏輯未增添 writer 或改變依賴方向，未發現新 critical/major。grep shipped/init/reference/Knowledge/雙語 README 同族錯誤指引無殘留命中；活 Specs 正文留待 archive sole-writer，delta 已記錄收斂。
隔離 snapshot /private/var/folders/bp/xj24qsl54z1_dxkn4k31tlqr0000gp/T/prospec-snapshot-review-reviewer-1-2-1AQdMk 中執行六個相關測試檔，1,519 tests 全數通過；actual-source mutation 後逐次還原，再重跑同六檔仍 1,519 passed。記錄：review-targeted.log、review-restored.log、review-mutations.json。cacheDir 明確設在 snapshot，node_modules 僅唯讀共用。以 snapshot 原始 sources 重生 bundle，bytes 完全一致；source CLI agent sync 比較 .agents/.claude 全部 142 files，無 changed/added/removed。未在本 reviewer 重跑全套 coverage/lint/typecheck，不把 orchestrator 報告冒稱自行執行。
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->
