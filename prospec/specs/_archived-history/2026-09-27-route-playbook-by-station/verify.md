# Verify Evidence: route-playbook-by-station

<!-- prospec:evidence-section -->
## 2026-09-27 — grade C

<!-- prospec:evidence delta-spec-compliance -->
### delta-spec-compliance — FAIL

**Context ID:** `d18230d69c389eda18498c4f2f08b7ea381849e4e3bcb2c609b77f36a1d00051`

**Summary:** 7項REQ中5 PASS、2 FAIL：治理保留條款／compact契約缺口，以及fallback缺獨立literal byte oracle。

唯讀主repo，全部tests/mutation只在票券snapshot；先讀L1再讀六個affected L2及相關linked sub-modules，owner敘述與程式相符，未代判machine dimensions。比較7個MODIFIED REQ與原條款。11 frozen scenarios逐項核對：US-1.1 catalog/body/id、1.2排序、1.3目前legacy bytes相同、1.4 alias/unknown、1.5十站較全文小；US-2.1 299/300/301與stderr/no-truncate、2.2逐條approval、2.3八條id/一行規則/Landing/TTL/active保留；US-3.1两站item6與tokens不增、3.2其他站startup bytes相同/learn全文、3.3help/雙語docs/實測。未見frozen scenario本身的語意偏離，scenario_findings留空；更細的REQ失敗如items所列，並非把review advisory majors重評為FAIL。

#### Requirements Compliance

| REQ ID | Result | Kind | Evidence | Repro |
|---|---|---|---|---|
| REQ-LIB-094 | PASS | executable | 獨立 snapshot 實跑 constitution-parser 28及lessons-ledger 48 tests全過。src/lib/constitution-parser.ts:59 共用大小寫／逗號／空白／alias／sole-all規則；src/lib/lessons-ledger.ts:290、314 保留同一fence-aware block及TTL owner，377起取第一個unfenced Stations並保留全文，完整entry.text以>300判斷；421起active filter、module stable partition、獨立bodySelected、all-undeclared fallback及active-module union符合要求。454起所有active diagnostics、id-only範圍與unknown去重相符；原placeholder、retirement、Source modules與TTL fixtures通過。 | `node node_modules/vitest/vitest.mjs run tests/unit/lib/constitution-parser.test.ts tests/unit/lib/lessons-ledger.test.ts` |
| REQ-SERVICES-123 | PASS | executable | 獨立 snapshot learn.service 19 tests通過。src/services/learn.service.ts:275起在檔案讀取之前驗證selector、empty modules及invalid station，all不是CLI合法station；313的absent分支available:false且warnings:[]，其他unreadable/escaped理由仍拋PrerequisiteError；325委派lib selector並傳回mode/catalog/warnings。測試覆蓋catalog/id診斷差異、legacy、alias、selector拒絕、missing/unreadable/path containment；沒有knowledge寫入。 | `node node_modules/vitest/vitest.mjs run tests/unit/services/learn.service.test.ts` |
| REQ-CLI-059 | PASS | executable | 獨立 snapshot formatter 9、CLI contract 30及E2E 74 tests通過。src/cli/commands/learn.ts:43註冊station並委派service；learn-output.ts:58起diagnostics僅stderr且經sanitizer，station分支依catalog序印bodySelected；modules/id原stdout分支保留。E2E:1865目前fallback與legacy bytes相同；其oracle缺口另記REQ-TESTS-024。cli-help.ts:125、README.md:553、README.zh-TW.md:524及兩份cli-reference均同步station bodies、完整catalog、modules排序、id、fallback及300 cap，數字引用playbook-measurements.md。 | `node node_modules/vitest/vitest.mjs run tests/unit/cli/learn-output.test.ts tests/contract/cli-output.test.ts tests/e2e/cli-station.test.ts` |
| REQ-TEMPLATES-071 | PASS | document | prospec-plan.hbs:27與prospec-implement.hbs:25僅Startup第6項改為本站station+modules，保留literal _playbook.md。獨立對HEAD原始檔與snapshot比較：兩站皆6項且其他項相同；第6項estimateTokens為plan33→32、implement33→33；其他15站Startup bytes相同。learn仍full-playbook load；archive harvest/upsert與退休治理未更動；index.md:16仍load-on-demand。skill-format獨立1118 tests通過。三baseline存在，station-reference及mandatory-policies與HEAD bytes相同，startup baseline只調整對應實測值且ceilings未增。 |  |
| REQ-TEMPLATES-072 | FAIL | document | 新版有Stations、shared cap、兩種cleanup與approval，但完整MODIFIED Spec尚有缺口。 一、保留治理條款：promotion-format.hbs:100–115沒有stale cross-reference也須修正、掃描涵蓋ledger/playbook/skills/shipped Feature Specs且Feature Specs僅MODIFIED REQ→archive更新的規則；沒有one-tier prose ownership（promoted row敘述屬playbook）、ledger自身git log -p取回逐次敘述及_archived-history僅對慣例建立後archive有效的限制。:38雖禁止status附narrative，未明確把approval/scoring/retirement provenance導往description；:36也未明示provenance suffix同屬原correction語言。這些是原Feature REQ及本次delta保留的明文要求。兩個部署reference同樣缺漏。 二、compact未移除covered Guidance：_playbook.md:32、49、58、65（PB-001/003/006/007）仍保留Guidance，sweep-proposals.md:13–16明列它們沒有未覆蓋條款，相鄰Landing指向覆蓋executor；新版reference:77卻要求covered Guidance離開live body。八條After有人工核可，但root確認沒有明確改定此frozen contract的指令。 修復：唯一promotion-format補齊以上保留語意、重生部署物並加契約；依八條Landing完整覆蓋重新準備逐條Before/After，移除已覆蓋Guidance，只保留未覆蓋子句。新的共享條目文字須取得逐條核可，不能推定舊After核可涵蓋改稿。 | `sed -n '27,121p' src/templates/skills/references/promotion-format.hbs` |
| REQ-TEMPLATES-174 | PASS | document | prospec-learn.hbs:38–48將Sweep放Collect前並涵蓋both governed files、四原測試、mechanism AND executor、canonical WHY、明確human approval。:43加入before/after、coverage、per-entry approval及retain uncovered/unapproved。:110–126保留ledger protection、predating occurrence寫description與unresolved Failure Condition。promotion-format.hbs:108–115集中兩種cleanup定義並要求resync strengthened clauses。sweep-proposals.md:5有核可；已覆蓋Guidance的實際遷移缺口由REQ-TEMPLATES-072直接記錄。 |  |
| REQ-TESTS-024 | FAIL | executable | 原snapshot的8 suites獨立執行1329 passed；repo suite覆蓋21 active、8 compact entries與10站輸出較全文小。root coverage lines97.52%、branches90.76%及品質gates完成。但delta明定literal fixtures及「without deriving expected values from the implementation」尚未達成：cli-station.test.ts:1868–1871以同實作產生legacy stdout作fallback期待值；learn-output.test.ts:149–157只釘catalog rows與body片段，沒有完整header/newlines的literal oracle。 獨立mutation僅在票券snapshot把learn-output.ts唯一字串「module-matched with full text; read any other」改為「module-matched with full text!; read any other」，count==1確認套用。執行node node_modules/vitest/vitest.mjs run tests/unit/cli/learn-output.test.ts tests/e2e/cli-station.test.ts -t "formatLearnPlaybookOutput\|keeps legacy stdout byte-identical"仍6 passed、77 skipped、exit0；原stdout bytes已變但相容測試存活。還原後同指令6 passed，main source未寫。這是不同於既有7組紀錄的具體mutation。 修復：新增完整人工固定legacy stdout fixture（header/order/blank lines/trailing newline），至少一個all-undeclared E2E讓modules-only與fallback均對該literal做byte equality，並獨立釘stderr；上述header mutation必須RED、還原GREEN。 | `sed -n '1865,1877p' tests/e2e/cli-station.test.ts` |
<!-- prospec:evidence-end -->

<!-- prospec:evidence constitution -->
### constitution — PASS

**Summary:** 按machine inventory完整檢查8條原則，未判定違反；commit後knowledge:check仍須重跑。

使用prospec-report.json structural.constitution.rules的原名與severity，所有8條均有statement；不以本維度PASS抵消Delta FAIL。此為verify站工作樹判斷，非merge完成證明。本人未聲稱重跑root所有gates；已區分早期失敗log、後續成功root工具執行與knowledge skip的實際界線。
<!-- prospec:evidence-end -->

<!-- prospec:evidence design -->
### design — not-applicable

**Summary:** proposal明列UI scope none，沒有UI設計契約。

proposal.md:108–110的UI Scope為none；plan/tasks及diff為CLI讀取、模板治理與文件變更，無需對照design-spec。
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->

<!-- prospec:evidence-section -->
## 2026-09-27 — grade S

<!-- prospec:evidence delta-spec-compliance -->
### delta-spec-compliance — PASS

**Context ID:** `279441515d345eab76c6c0eca3d7965ecb9fc2a208f1addf946c8ac0b663fea8`

**Summary:** 七條 MODIFIED REQ 與十一個 frozen acceptance scenarios 均符合；前輪兩項 FAIL 已修復。

審查基準為 HEAD 3ade165b 加工作樹、prepared snapshot digest 2a9864f53a33a6e6c346dcedf1c21c82941cd1ce2754bed3ecda169ff05b9e93。已讀全部七個 MODIFIED REQ 的 shipped 切片，確認 Dropped 明列替代語意；逐項結果見 items。所有會寫檔的執行限於指定 snapshot，main 唯一寫入為此 payload。
Frozen scenarios：US-1.1/1.2 對應 lib selector＋formatter 的 catalog/body separation；US-1.3 對應固定 literal fallback stdout E2E；US-1.4 對應 shared parser、aliases、unknown tokens 与獨立 CRLF mixed-all probe；US-1.5 獨立實際 CLI 全10站皆21rows，tokens依序1107、5227、1107、1107、1107、5601、6368、4522、1875、3541，均<8965。US-2.1 299/300/301 fixture與stderr/完整正文；US-2.2 Sweep evidence/approval 文字＋已核可 After；US-2.3 八 compact entries 精確核對。US-3.1 與 HEAD 比較 startup baseline／ceilings無增加；US-3.2 僅 plan/implement Startup bytes 改動、learn全文不變；US-3.3 help及四份公開文件與實測一致。未發現應寫入 scenario_findings 的偏差。
執行證據：snapshot verify-focused.log 記錄7files、1299passed、exit0；獨立全站 CLI 與 evaluateSyncGate 探針exit0。knowledge:check 的 precommit skip 與 postcommit obligation 明確保留。

#### Requirements Compliance

| REQ ID | Result | Kind | Evidence | Repro |
|---|---|---|---|---|
| REQ-LIB-094 | PASS | executable | src/lib/constitution-parser.ts:59 的 parseStationTokens 與 lessons-ledger.ts:378 共用站名正規化；同檔 :423 的 selectPlaybookEntries 將 matched 與 bodySelected 分開，僅 active 宣告影響 fallback，穩定排序不改正文集合，診斷涵蓋全部 active。檢查 splitPlaybookBlocks／TTL 既有 owner 未更動。snapshot 中 lessons-ledger、constitution-parser 測試通過，literal 1196/1200/1204 字元 fixture 分別得到 299/300/301，只有 301 overLimit；另獨立執行 CRLF 的 ALL, prospec-plan，plan 正文命中且 all 只產生 unknown-station 診斷。retired、placeholder、Source-only module list、fenced metadata、id miss 與 fallback 契約均有通過案例。 | `node node_modules/vitest/vitest.mjs run tests/unit/lib/lessons-ledger.test.ts tests/unit/lib/constitution-parser.test.ts` |
| REQ-SERVICES-123 | PASS | executable | src/services/learn.service.ts:277 在 readContained 前驗證 selector 與 normalizeStationName，四組合法選取交由 lib，不寫 knowledge。:315 的 absent 分支不發 fallback，存在空內容仍經 selector；:337 保留 mode、bodySelected 與 warnings。snapshot 的 learn.service.test.ts 通過：selector errors、unknown/retired id、absent/unreadable/escaped、全部 active diagnostics 與 id-only diagnostics。station-only union 與 empty/all-retired 的下層行為由同次 lessons-ledger suite 及 source 分支確認。 | `node node_modules/vitest/vitest.mjs run tests/unit/services/learn.service.test.ts` |
| REQ-CLI-059 | PASS | executable | src/cli/commands/learn.ts 註冊 --station 並傳給 service；learn-output.ts:58 先將結構化 warnings 經 sanitizer 寫 stderr，station catalog 依 service 順序、bodySelected 印全文，legacy 分支保留既有 header/newlines。snapshot 中 formatter 與 cli-station suites 通過；cli-station.test.ts:1865 的完整固定 literal stdout 同時比對 legacy 與 fallback，沒有以 SUT 計算期望值。四份公開文件同步 station body、全 active catalog、module sorting、id、fallback、300 cap；help registry 具三節與完整 example。獨立逐站實際 CLI 量測與四份文件及 playbook-measurements.md 一致：全文 8965，stdout 1107–6368。 | `node node_modules/vitest/vitest.mjs run tests/unit/cli/learn-output.test.ts tests/e2e/cli-station.test.ts tests/contract/skill-format.test.ts` |
| REQ-TEMPLATES-071 | PASS | document | 比對 HEAD 的全部 src/templates/skills/prospec-*.hbs Startup Loading，只有 plan 與 implement 變動，均為原第 6 項加入各自 --station 且保留 _playbook.md 與 --modules；learn 第 5 項仍明言 in full。startup baseline 項數順序不变，plan mandatory tokens 5788→5787、implement 不增；promotion reference 1651→1645，所有 ceilings 未提高。station-reference-baseline.json、workflow-eval/mandatory-policies.json 與 HEAD 完全相同。snapshot 的 skill-format 全部通過，包含原治理、retire-in-place、archive upsert、learn Entry Gate 與 Startup 契約。prospec/index.md Conventions 仍將 playbook 列為 Load-on-Demand。 | `node node_modules/vitest/vitest.mjs run tests/contract/skill-format.test.ts` |
| REQ-TEMPLATES-072 | PASS | document | 逐條對讀已出貨 REQ 與完整 MODIFIED Spec，再查 src/templates/skills/references/promotion-format.hbs。promotion thresholds/config、ledger bare status/provenance、Harvest/queue/heuristic、Criteria modules、Stations、cap/compact form 均保留或擴充；agent-sync.service.ts:172 從唯一 PLAYBOOK_ENTRY_TOKEN_LIMIT 注入 cap。Sweep 現有四 tests、兩 cleanup tests、executor、人類逐條核可、per-tier retirement 之外，:98–100 明確補回 stale cross-reference 全域範圍與 Feature Spec MODIFIED/archive 限制、單一 tier prose ownership、ledger git log -p 與 archived-history 時間範圍。skill-format.test.ts:3383 起三組獨立 section-scoped assertions 在 snapshot 通過。八條 compact 實文逐一與核可 After 比對一致；PB-001/003/006/007 無 Guidance，PB-008/014/016/018 只留 Landing 未覆蓋責任。Source/Criteria/Kind/approval/Stations/Landing/TTL 與 permanent id 均保留，playbook-station suite 通過。 | `node node_modules/vitest/vitest.mjs run tests/contract/skill-format.test.ts tests/contract/playbook-station.test.ts` |
| REQ-TEMPLATES-174 | PASS | document | src/templates/skills/prospec-learn.hbs:44 的 Sweep 位於 Collect 前，涵蓋 ledger 與 playbook，引用唯一 promotion-format 的治理定義。既有四測試、mechanism AND executor、no post-fix occurrence、desynchronized resync、explicit human approval、retire-in-place 與 NEVER counters 保留；新增 cleanup 段要求 before/after、coverage、per-entry approval 並保留未覆蓋條款。sweep-proposals.md 的八條初次核可與 verify-sweep-proposals.md 的六條修訂核可均有確切 After；獨立比較實文符合已核可內容，PB-014/018 保持原核可版本。snapshot skill-format ordered phases／approval／full-playbook pins 通過。 | `node node_modules/vitest/vitest.mjs run tests/contract/skill-format.test.ts` |
| REQ-TESTS-024 | PASS | executable | 在指定 snapshot 執行 lessons-ledger、constitution-parser、learn.service、learn-output、playbook-station、skill-format、cli-station 七個 suite，exit 0，1299/1299 passed（verify-focused.log）。固定 legacy stdout、299/300/301 literal boundaries、station/module 獨立 selection、selector errors、stderr isolation 與原完整治理契約具可檢查 assertions。playbook-station 的獨立 ACTIVE_IDS/COMPACT_IDS/RETAINED_GUIDANCE 保護 21 active、8 compact 與 Landing/TTL/source，skill-format 另外解析 Landing。獨立執行全部 10 stations 真實 CLI，均 21 catalog rows，所有輸出小於同版全文。原七項 mutation 與本輪五項 repair mutation 的 RED→restored GREEN 記錄分別在 playbook-mutation-verification.md、verify-fix-mutations.json；後者涵蓋三治理條款、共用 legacy header 損壞與 covered Guidance 回歸。最終 logs 顯示 lint/typecheck/agents/counts/coverage/strict 完成，coverage 最低 branches 90.76% 高於 80%。knowledge:check 在未 commit 的空 range 是明示 skip（exit 0），未宣称已檢查 commit range；本 grader 另用原 evaluateSyncGate 對 HEAD→working tree＋untracked paths 得到六 source modules confirmed，commit 後仍須正式重跑。 | `node node_modules/vitest/vitest.mjs run tests/unit/lib/lessons-ledger.test.ts tests/unit/lib/constitution-parser.test.ts tests/unit/services/learn.service.test.ts tests/unit/cli/learn-output.test.ts tests/contract/playbook-station.test.ts tests/contract/skill-format.test.ts tests/e2e/cli-station.test.ts` |
<!-- prospec:evidence-end -->

<!-- prospec:evidence constitution -->
### constitution — PASS

**Summary:** 依機器 inventory 完整核對八條 Constitution 規則，未發現本次違規。

inventory 精確採用目前 prospec-report.json structural.constitution.rules 的八個名稱與 severity；所有無 check 規則及 covers 之外範圍均有 statement，未將機器維度自行改判。已載入六模組 L2 與相關 station-engines／skill-authoring／contract-guards，核對分層、治理、文件與測試責任。coverage、count、generated assets 與 strict 的最終 logs 皆與此次變更一致。knowledge-size 為既有 advisory report 信號，未當作 Constitution 違反。尚未 commit/push/merge；commit 後 knowledge:check 必須重跑，不能把空 range skip 宣稱成該檢查已涵蓋交付 commit。
<!-- prospec:evidence-end -->

<!-- prospec:evidence design -->
### design — not-applicable

**Summary:** proposal 明確宣告 UI Scope none，本次為 CLI 與文字治理契約。

proposal.md 的 ## UI Scope 為 **Scope:** none；plan.md 同樣標示 UI scope none。變更包含 CLI stdout/stderr、模板、playbook與文件，無需 design-spec 視覺或互動一致性評級。
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->
