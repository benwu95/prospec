# Review Findings: mechanize-light-scale-gates

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
| R1-C1 | tests/unit/services/change-progress.service.test.ts:87 | critical | test-quality | fixed | 既有斷言被替換而非擴充：加入 suggestion 匹配時，把 tasks.md 訊息與 PrerequisiteError 類別兩個保證一起拿掉 |
| R1-C2 | tests/contract/skill-format.test.ts:2804 | critical | test-quality | fixed | parseMatrix 只抓反引號 token，導致 standard／full 兩列無論文件寫什麼都不會紅；實測無反引號散文、清空格子、寫成 all of them 三種皆綠 |
| R1-C3 | src/services/knowledge-update.service.ts:613 | critical | parallel-site | fixed | 缺 delta-spec 時的建議把 quick 變更導向 `prospec change plan`，而本變更剛讓該站拒絕 quick —— 本變更自己造出的死路 |
| R1-C4 | .prospec/changes/mechanize-light-scale-gates/delta-spec.md | critical | spec-architecture | fixed | REQ-CLI-031 列舉 validate promote-scaffold 的完整裁決卻未列入 MODIFIED，archive 會把漏掉 delta-spec 檢查的清單畢業進信任區 |
| R1-C5 | src/services/change-tasks.service.ts:73 | critical | correctness | fixed | quick 下略過 plan.md 前置後整站零工件前置：實測刪掉 proposal.md 仍產出 tasks.md 並推進 status |
| R1-M1 | prospec/ai-knowledge/modules/services/README.md | major | docs-claims | fixed | README 編輯把 services(1840)／tests(1823) 推過 1800 token L2 預算，knowledge-size 轉 WARN 並吃掉 verify 的兩格 WARN 額度 |
| R1-M2 | prospec/ai-knowledge/_status-lifecycle.md:30 | major | docs-claims | fixed | 矩陣說明宣稱「沒有任何站履行的契約會讓 build 失敗」，但測試只釘文件↔登記表，從未釘登記表↔站點 |
| R1-M3 | src/lib/artifact-validators.ts:136 | major | parallel-site | fixed | validatePromoteScaffold 自寫 backfill 禁用集合，未消費 FR-006 指定與驗證器共用的登記表 |
| R1-M4 | src/lib/status-router.ts:50 | major | parallel-site | partially-fixed | router 藏著第三份 quick 硬編碼（已改讀登記表）；backfill 卡在 status story 的路由仍未解 —— 牽涉 SDD_STATIONS 是否新增 promote 站，屬架構決策，升級人工裁決 |
| R1-M5 | src/types/change.ts:202 | major | correctness | fixed | forbiddenArtifacts 用 ?? 導致繼承鍵（constructor）回傳 Object.prototype.constructor，呼叫端 .includes 會拋 TypeError |
| R1-M6 | src/services/change-plan.service.ts:64 | major | test-quality | fixed | plan 閘門只看 plan.md，與 length>0 無法區分且無測試；改為以該站自身產物集合判斷並補上順序 fixture |
| R1-M7 | .prospec/changes/mechanize-light-scale-gates/plan.md | major | docs-claims | fixed | PB-002 走查表只測了兩格就寫下「prospec status 無需變更（實測正確路由）」 |
| R1-M8 | src/services/change-tasks.service.ts:51 | minor | correctness | accepted | metadata 先讀使無效 metadata 錯誤先於 plan.md 前置浮現；verifier 判為可放行（未寫入、指名真正第一個阻塞欄位），REQ 文字與 proposal Edge Case 已據實訂正 |
| R2-F1 | src/services/change-scale.service.ts:38 | major | correctness | fixed | `change scale` 無工件守衛：standard 產出 plan.md 後改標 backfill 是合法序列，router 隨即宣稱「無 plan／無 tasks」並指向必然 FAIL 的 gate；改為寫入前依登記表拒絕並指名衝突檔案 |
| R2-F2 | src/lib/status-router.ts:46 | major | correctness | fixed | 落地的 backfill 變更會回報 completed station 為 implement —— 一個它從未跑過、且其 scale 契約禁止工件的站；改為記為 promote |
| R2-F3 | src/lib/status-router.ts:104 | major | correctness | fixed | 既有缺陷（本輪列舉才浮現）：quick 在 status plan 且 ui_scope full 時仍路由到 design，與 lifecycle 文件明文相反；design 判斷改讀登記表 |
| R2-F4 | prospec/ai-knowledge/modules/types/README.md:22 | major | docs-claims | fixed | types README 仍把 status.ts 描述為只含 design/review 無狀態站，未提 promote |
| R2-F5 | README.md:543 | major | docs-claims | fixed | 雙語 README 列舉 router 的特殊路徑時漏掉本變更新增的第四條（promote 路由） |
| R2-F6 | src/lib/status-router.ts:88 | major | test-quality | fixed | `!forbidden.includes('tasks.md')` 在早退之後是恆真式，屬死條件；已簡化並註明為何足夠 |
| R2-F7 | tests/unit/lib/status-router.test.ts:195 | major | test-quality | fixed | 把 NEXT_BY_STATUS 放寬成 union 使 full × tasks 完全失去釘住；改為 status × scale 雙軸精確期望，實測 reviewer 提供的存活 mutation 現在轉紅 |
| R2-F8 | tests/unit/types/status.test.ts:29 | major | test-quality | fixed | STATION_SKILLS 只斷言 /^\/prospec-/ 形狀，`/prospec-planning` 這種不存在的 skill 仍會綠；改為與 SKILL_DEFINITIONS 交叉比對 |
| R2-F9 | .prospec/changes/mechanize-light-scale-gates/delta-spec.md | major | docs-claims | fixed | REQ-TYPES-070 宣稱 SDD_STATIONS 與 lifecycle 文件一致，但文件從未載有站點順序（信任區副本漏掉 design 多年即為證）；已在兩份副本加入 Station order 並補雙向契約測試 |
