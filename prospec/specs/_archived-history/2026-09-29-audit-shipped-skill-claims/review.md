<!-- prospec:review-metrics round="2" lenses="correctness,security,spec-architecture,docs-claims,parallel-site-completeness,test-quality,maintainability" signatures="R1-ARCHIVE-EXCLUSIVE-RECORD:FP,R1-ROUTE-OWNER-FALSE-GREEN:FP" -->
# Review Findings: audit-shipped-skill-claims

| ID | Location | Severity | Lens | Status | Origin | Summary | Repro |
|---|---|---|---|---|---|---|---|
| R1-ARCHIVE-EXCLUSIVE-RECORD | src/templates/skills/prospec-archive.hbs:143 | major | parallel-site-completeness | fixed | 1 | 已修正 archive Phase 3.7／NEVER 與 archive-format §6 的排他紀錄宣稱；archive-finalize-exclusive、archive-never-exclusive、archive-format-exclusive mutations 全數轉紅。 | rg -n 'only per-change\|sole durable record\|survives only' src/templates/skills/prospec-archive.hbs src/templates/skills/references/archive-format.hbs |
| R1-ROUTE-OWNER-FALSE-GREEN | tests/contract/skill-format.test.ts:4069 | major | test-quality | fixed | 1 | owner 正向檢查已限縮到實際載入區段；route-owner-deletion 與 entry-owner-deletion mutations 均轉紅，還原後 targeted pins 通過。 |  |

<!-- prospec:evidence-section -->
## Evidence

<!-- prospec:evidence R1-ARCHIVE-EXCLUSIVE-RECORD -->
### R1-ARCHIVE-EXCLUSIVE-RECORD

獨立 round 2 重新檢視相對 main 的完整累積 source、tests、Knowledge 與文件 diff（排除 generated bundle／deployed copies 的逐行展開），執行 correctness、security、spec-architecture、docs-claims、parallel-site-completeness、test-quality、maintainability 七個 lenses，未找到新增可成立的 critical／major。runtime services、lib predicate 及 dependency direction 未變更；canonical registry 只增加兩個 bounded archive sites。必要 reference 操作規則、授權正文、語言與 override 規則保留，現有 sectionOf 與 directory-enumerated contracts 繼續使用。原 finding 的三個平行站點現在只描述 summary 載入的證據與目的地；全模板搜尋已無原來三種 archive 排他宣稱。
在獲配 snapshot /private/var/folders/bp/xj24qsl54z1_dxkn4k31tlqr0000gp/T/prospec-snapshot-review-lens-all-2-1-rgSAB2 獨立執行 node node_modules/vitest/vitest.mjs run tests/contract/skill-format.test.ts tests/contract/canonical-claims.test.ts，1,243/1,243 通過。對 source 逐一施加 archive-finalize-exclusive（Phase 3.7 加回 only per-change record）、archive-never-exclusive（NEVER 加回 sole durable record）、archive-format-exclusive（§6 加回 survives only），每次確認 source 改變、重新 bundle，再跑 -t secondary summaries；三者均在對應 section negative assertion 失敗，exit 1。source 與 bundle 隨後逐次還原；最後兩個 targeted pins 通過。變異記錄保留於 snapshot 的 round2-mutations.json 與同名 logs。完整 suite／coverage 由 orchestrator 執行，本輪未宣稱重新跑全套。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R1-ROUTE-OWNER-FALSE-GREEN -->
### R1-ROUTE-OWNER-FALSE-GREEN

cascade owner 現在以 sectionOf 截取 Per-Station Execution Loop，再精確取得 Step 1 [LOAD]；entry owner 以 Station Transition Protocol 起點與 Checkpoint Correction Capture Protocol 終點擷取，同時 assert body 存在，無法再由文件其他段落拼湊匹配。非 owner 的全樹負向掃描保持不變。
獨立 snapshot mutation route-owner-deletion 刪除完整 cascade Step 1 [LOAD] 行；entry-owner-deletion 刪除 entry 的整個 Station Transition Protocol 區塊。兩者每次均先 assert source 已變更並成功 bundle，再執行 node node_modules/vitest/vitest.mjs run tests/contract/skill-format.test.ts -t "no shipped template restates"；兩者都因對應 owner 的 route owner is missing assertion 轉紅，exit 1，並非執行環境失敗。所有 source／bundle 已還原；最後執行 -t "no shipped template restates|secondary summaries" 得 2 passed，exit 0。沒有修改主工作樹的 source、git refs、stash、config 或 dependencies；唯一主樹寫入為本 ticket 指定 payload。
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->
