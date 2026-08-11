# Review Findings: restore-cli-first

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
| C1 | src/lib/review-merge.ts:50 | critical | correctness | fixed | render 寫 `\\|` 跳脫但 splitRow 用純 split — 含 pipe 的儲存格跨輪 merge 會碎裂；改為 lookbehind 切分＋反跳脫，並加 round-trip 回歸釘 |
| C2 | src/services/archive.service.ts:1252 | critical | correctness | fixed | recountFeatureSpecCounters 只數 `### US-`，真實 spec 多為 `## US-` — finalize 會把 5 份 spec 的正確 story_count 改錯；改計 h2+h3 聯集，並以真實 repo 全 spec 對帳為釘 |
| C3 | src/lib/lessons-ledger.ts:77 | critical | correctness | fixed | findLedgerTable 在真實 ledger 表中空行處截斷（41 列只見 19），upsert 第二塊 key 會重複建列；改為跨空行掃描至最後一列，並加真實 ledger round-trip 釘 |
| C4 | src/services/init.service.ts:147 | critical | parallel-site | fixed | prospec init 渲染 entry config 未注入 minimum_cli_version，新專案 AGENTS.md 探針地板成空洞；改由 buildInitDocContexts 帶入並加 contract 釘 |
| C5 | src/services/change-status.service.ts:48 | critical | spec-architecture | fixed | change status 可前跳至 gate-owned 的 verified/archived，繞過 verify S/A 與 archive 閘；service 與 command 兩層皆拒絕，建議清單亦過濾 |
| C6 | src/services/verify-record.service.ts:97 | critical | spec-architecture | fixed | proven backfill 的 1/5 未標 not-applicable（誤採 repo-wide check），且被排除維度的 skip 警告仍佔 WARN 預算；scale 政策改為先於 machine ledger 計算 |
| C7 | src/templates/skills/references/review-format.hbs:52 | critical | parallel-site | fixed | MANDATORY 的 review-format 參考仍記載舊的 4 欄 Location 去重契約，與 CLI 的 id 鍵 6 欄合併矛盾；改寫為 CLI-written 契約 |
| C8 | src/templates/skills/prospec-knowledge-update.hbs:41 | critical | docs-claims | fixed | knowledge-update 模板宣稱 CLI 會把 REMOVED 模組標為 index Deprecated，實際是移除 module-map 條目使其從表消失；宣稱對齊程式碼 |
| M1 | src/services/change-resolver.ts:26 | major | security | fixed | change-resolver 的 --change 僅檢查存在性即放行路徑穿越；isSafeResourceName 守門前移至存在檢查之前，掃描目錄名亦過濾 |
| M2 | src/services/knowledge-update.service.ts:503 | major | security | fixed | knowledge update --module 未驗證模組名，可在知識庫外建目錄與 README；改為寫入前先驗證並拒絕 |
| M3 | src/lib/artifact-validators.ts:104 | major | security | fixed | trust-zone 探針把 git/config 失敗吞成「乾淨」，等於靜默關閉閘門；改為 `{dirty}\|{unavailable}` 聯集並輸出明確 INFO finding |
| M4 | src/services/verify-record.service.ts:128 | major | security | fixed | verify record 對 prospec-report.json 無新鮮度檢查，過期報告可評分並晉升；報告加蓋 change_digest，verify record 重算並拒絕過期，非 git 時誠實跳過 |
| M5 | src/cli/formatters/validate-output.ts:15 | major | security | fixed | validate formatter 直印受測產物原文與 slug，未過 sanitizeTerminal（OSC/ANSI 注入面）；已改為全部消毒 |
| M6 | src/cli/formatters/change-progress-output.ts:18 | major | security | fixed | change-progress formatter 直印 tasks.md 任務文字未消毒；已改為消毒，Progress X/Y 形狀不變 |
| M7 | src/cli/formatters/learn-output.ts:14 | major | security | fixed | learn formatter 直印 lesson key／警告／playbook 標題未消毒；已改為全部消毒 |
| M8 | src/cli/formatters/change-log-output.ts:15 | major | security | fixed | 其餘 7 個新 formatter 同一系統性缺口（PB-007 平行位置）；change-log/scale/status、review-merge、verify-record、knowledge-update、agent-triggers 全數補齊消毒，列舉與整數維持結構 |
| M10 | src/services/change-story.service.ts:72 | major | correctness | wontfix-scoped | 疑似 --related-module 驗證過晚導致半 scaffold — 依現行程式未能複現，不盲修，以本輪報告記錄替代 |
| M11 | src/templates/change/proposal.md.hbs:24 | major | parallel-site | fixed | change scaffold 的 proposal 模板仍指向已移除的 `knowledge generate`；改為 knowledge init ＋ /prospec-knowledge-generate |
| M12 | src/services/knowledge.service.ts:46 | major | parallel-site | deferred | knowledge.service 孤兒（移除 knowledge generate 後無 runtime consumer）；刪除牽動受 spec 覆蓋的 REQ，依使用者裁決登記 backlog BUG-002 另開 change 處理 |
| M13 | src/templates/skills/prospec-quickstart.hbs:89 | major | parallel-site | fixed | quickstart 錯誤處理列保留與探針分歧的 npm 安裝指引；改為統一指向探針的安裝來源（本專案不發佈 npm） |
| M14 | src/services/learn.service.ts:102 | major | spec-architecture | fixed | learn upsert 直接採信 LLM 提供的 impact_modules 進入 modules≥2 計分；改為對 module-map 查核，未知模組不計分並警示 |
| M15 | src/lib/markdown-table.ts:1 | major | maintainability | fixed | markdown table 引擎在 review-merge 與 lessons-ledger 手抄成兩份（正是 C1 的根源）；抽出單一來源 lib/markdown-table.ts（PB-006） |
| M16 | src/cli/parse-options.ts:19 | major | maintainability | fixed | collect／parseDate／today-stamp 在多個 command 與 service 重複；收斂到 cli/parse-options 與 lib/date-utils，旗標與訊息不變 |
| M17 | src/templates/skills/prospec-archive.hbs:117 | major | maintainability | fixed | archive 模板的 Phase 3.7 插在 Phase 3.6 Gate 之前，導致 gate 順序錯亂；已移到 3.6 Gate 之後 |
| M18 | README.md:548 | major | docs-claims | fixed | README 雙語與 verify 模板宣稱 machine 維度自讀「報告＋test_provenance」，實際只讀報告（其 test-provenance check 承載測試記錄）；宣稱已校正 |
| M19 | src/templates/skills/_cli-probe.hbs:7 | major | docs-claims | fixed | 探針的 npm 安裝指引指向未發佈的套件；依使用者指示改為 install script／GitHub Releases，並明示本專案不發佈 npm |
| M20 | src/services/verify-record.service.ts:173 | major | docs-claims | fixed | not-adjudicated 警告未內嵌報告的 skip reason，與 verify 模板承諾不符；改為逐字內嵌，缺 check 時走備援措辭 |
| M21 | tests/unit/services/knowledge-update.service.test.ts:1037 | major | test-quality | fixed | Deprecated index 契約只在孤立的 collectAllModules 上斷言（execute 永不產生該狀態，假綠）；補 execute 層 REMOVED 全流程釘 |
| M22 | tests/unit/cli/index.test.ts:63 | major | test-quality | fixed | cli index 測試斷言 mock 造出的假頂層指令面（plan/tasks）；mock 改為鏡射真實 registrar 掛在 change 之下，並反向釘住不得出現 |
| M23 | tests/unit/cli/knowledge-update-output.test.ts:45 | major | test-quality | fixed | skill 模板引用的輸出解析契約（README content pending／Next:／round counts）無任何測試釘住；補各 formatter 單元測試 |
| X1 | src/templates/skills/references/drift-report-format.hbs:29 | minor | docs-claims | fixed | 補記 drift report 新增的 change_digest 欄位與過期報告拒絕語義（M4 修復的自陳文件缺口） |
| V1 | src/cli/commands/archive.ts:61 | critical | verify-2/5 | fixed | archive finalize --dry-run 實際會寫入信任區（父子同名旗標被 commander 綁到父指令，子層 opts 為空）；改用 this.optsWithGlobals() 並補 e2e 釘（對修復前的 dist 實測變紅） |
| V2 | src/lib/artifact-validators.ts:143 | major | verify-2/5 | fixed | promote 模板宣稱 validate 會檢查非空 related_modules，實際未傳入；改為機器檢查並回 FAIL，service 傳入 metadata.related_modules |
| V3 | src/services/validate.service.ts:158 | major | verify-2/5 | fixed | coverageGap 僅有測試呼叫端，但 REQ-CLI-031 與 backfill 模板宣稱已交付 feature-map 集合差；改由 validate backfill-draft 實際回報（INFO，永不 FAIL），並涵蓋缺檔與格式壞掉的降級 |
| V4 | src/templates/skills/references/drift-report-format.hbs:22 | major | verify-2/5 | fixed | 參考仍指示「CLI 不可用時退回 skill 記載的手動信號」，而該信號已被本變更刪除（dangling）；改為 required-CLI 姿態 |
| V5 | tests/contract/skill-format.test.ts:793 | major | verify-2/5 | fixed | REQ-TEMPLATES-164 AC2 要求的 design-spec 委派契約測試不存在；補 section-scoped 測試釘住結構檢查交 CLI、元件萃取留判斷 |
| V6 | .prospec/changes/restore-cli-first/review.md:1 | critical | verify-3/5 | fixed | Language Policy [MUST] 違反：review.md 全英文，但 .prospec/changes/** 屬繁中集合；31 列 Summary 改寫為繁中（路徑/識別字/enum 維持英文），並在 review-format 參考補語言指示防回歸 |
