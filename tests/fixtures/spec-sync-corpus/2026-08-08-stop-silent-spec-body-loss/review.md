# Review Findings: stop-silent-spec-body-loss

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
| F-1 | - | critical | correctness | fixed | 首次出現規則＋被吞內容改以內容計，inline label 形狀已擋（mutation M8 KILLED） |
| F-2 | - | critical | security | fixed | 登記表由成員資格改為首次出現，重複欄位判為 body（mutation M7 KILLED） |
| F-3 | - | critical | correctness | fixed | normalizeBullet 移除 list marker 與 WHEN/THEN 強調，假 drop 消失（mutation M9 KILLED） |
| F-4 | src/services/archive.service.ts:1176 | critical | correctness | escalated | 架構性，未自動修：bundle 於 syncToFeatureSpecs 之前 moveToArchive 且事後無條件標記 archived，擋寫後無 CLI 可及的重入路徑——已上呈使用者裁決 |
| F-5 | - | critical | spec-architecture | fixed | fallback truncation 以 currentSection === ADDED 收斂，MODIFIED 回到 preserve+pendingConvergence（mutation M10 KILLED） |
| F-6 | - | critical | test-quality | fixed | **Dropped:** 移至 **Spec:** 之前，heading 邊界守衛恢復（reviewer 的 mutation C 已證明可轉紅） |
| F-7 | - | critical | test-quality | fixed | 同上，第二處 fixture 一併修復 |
| F-8 | - | critical | spec-architecture | fixed | REQ-LIB-045 的 Spec 文字改為與實作一致：不可讀→FAIL、無 delta-spec／已證明 backfill→pass、僅 source 不可用→skipped |
| F-9 | - | critical | docs-claims | fixed | archive skill 與兩份 README 改為 pass；drift-report-format 原本即正確 |
| F-10 | - | critical | docs-claims | fixed | zh-TW 移除「帶原因」，與英文對齊 |
| F-11 | - | critical | docs-claims | fixed | services/README.md 改為五份 worklist 並標明兩份 BLOCKING |
| F-12 | - | critical | parallel-site | fixed | check-output 依 deltaSpecSkipped 分印兩種訊息 |
| F-13 | - | critical | spec-architecture | fixed | Phase 3.5 step 0 改列五份 worklist，並保留「landed 不等於 lost nothing」限定語；契約測試擴為釘住三份新 worklist |
| F-14 | - | critical | spec-architecture | fixed | REQ-TYPES-075 已列入 MODIFIED（two/both → three/all three） |
| F-15 | - | critical | spec-architecture | fixed | REQ-TEMPLATES-172 已列入 MODIFIED，兩份 _status-lifecycle.md 的稽核範圍節同步 |
| F-16 | - | critical | spec-architecture | fixed | REQ-LIB-027 已列入 MODIFIED（all fifteen → all sixteen，兩處） |
| F-17 | tests/contract/spec-sync-corpus.test.ts:68 | major | test-quality | proposed | 未修：.prospec/ 於 CI 被 gitignore，archived-corpus describe 全 skip 且反空洞守衛自身亦 skipIf——需裁決是否提交 fixture 語料進版控 |
| F-18 | - | major | test-quality | fixed | 登記表改以版控字面值釘住，恆真式消除（mutation M11 KILLED） |
| F-19 | - | major | test-quality | fixed | feature-spec-format 半邊改為 section-scope，且 section 切片改為 fence-aware |
| F-20 | - | major | docs-claims | fixed | drift-engine.md 兩處過期敘述與 Public API 已修 |
| F-21 | - | major | docs-claims | fixed | cli/README.md 計數改為 Five |
| F-22 | - | major | parallel-site | fixed | types/README.md 三處已修 |
| F-23 | - | major | parallel-site | fixed | 兩份 _status-lifecycle.md 的 either/both 已改為三個 gate |
| F-24 | - | major | parallel-site | fixed | services/README.md pitfall 說明新 collector 刻意不吃共用 digest |
| F-25 | - | major | parallel-site | fixed | drift-report-format 的 Gates skills read by id 已加入新 check |
| F-26 | - | major | docs-claims | fixed | 兩份 README 的 --record-review 已載明同一次寫入也記 delta-spec 指紋 |
| F-27 | - | major | docs-claims | fixed | 拒絕補救改為指向「refusal 所點名的 block」，涵蓋 ADDED 的 Description/AC |
| F-28 | - | major | spec-architecture | fixed | REQ-TEMPLATES-171 標題改為 all three provenance checks |
| F-29 | src/templates/skills/references/delta-spec-format.hbs:223 | critical | regression | fixed | 由 round-1 的 F-2 修復造成：reference 仍載被取代的成員資格規則，且 REQ-TEMPLATES-166 與 REQ-SERVICES-081 會把互相矛盾的邊界敘述落進同一份 sdd-workflow.md。已將 reference 與 REQ-TEMPLATES-166 一併改為首次出現規則 |
| F-30 | src/cli/formatters/archive-output.ts:90 | critical | regression | fixed | 由 round-1 的 F-27 修復造成：SpecRefusal 不帶 block 身分，「修 refusal 點名的 block」無從遵循，且 CLI 對 ADDED fallback 仍硬寫 `**Spec:**`——而 REQ-SERVICES-081 已宣稱該行為存在。已為 DeltaBlockTruncation／SpecRefusal 加 block 欄位並由 formatter 印出（mutation M13 KILLED） |
| F-31 | src/services/archive.service.ts:507 | critical | regression | fixed | 由 T11 的 per-file 重構造成：filePending 在擋寫 continue 之前就 flush，使被擋住檔案裡的 REMOVED route 仍回報「strike or delete it by hand」——照做會為一個從未發生的 deprecation 刪掉信任區文字。已改為只有 BLOCKING findings 能通過 hold（mutation M14 KILLED） |
| F-32 | src/services/archive.service.ts:1831 | major | regression | fixed | 由 round-1 的 F-3 修復造成：whenThenBullets 的 docstring 仍宣稱「marker 不移出比對鍵」，與改寫後的 normalizeBullet 相反，同一檔案同時載兩套規則。已改寫並記下反轉理由 |
| F-33 | src/services/archive.service.ts:1184 | critical | process | fixed | mutation harness 的 cp 備份／還原跨 Bash 呼叫時回捲了不相關的 preflight 編輯，dist 與 source 同時失去 F-4 修復；僅全套測試抓到（受影響 suite 單跑為綠）。已重新套用並以 e2e ＋ dist 內容雙重確認 |
| F-34 | .claude/skills/prospec-plan/references/delta-spec-format.md:225 | critical | regression | fixed | bundle 與 build 都跑了卻沒跑 agent sync——六份部署的 delta-spec-format.md 仍教被取代的成員資格規則，正是 F-29 的缺陷出現在 agent 真正載入的那份。已執行 `prospec agent sync`（source CLI）並逐份確認 |
| F-35 | .claude/skills/prospec-archive/SKILL.md:112 | critical | regression | fixed | 同一個未部署造成：archive skill 的阻擋型 Phase 3.5 gate 仍寫 TWO worklists（CLI 現產出五份、其中兩份 BLOCKING）、refusal 補救仍指 **Spec:**、delta-spec-provenance 仍寫 skipped；另有四份 drift-report-format.md 從未為本變更同步過。已一併部署 |
| F-36 | tests/contract/skill-format.test.ts:187 | major | test-quality | proposed | 未修：契約測試只讀 src/templates/**，從不讀部署目錄，因此「模板已改但未部署」這一類永遠不會轉紅——本 session 已中兩次（bundle 先於 FS、bundle 不等於 deploy）。需設計一道比對部署產物的守衛，但天真的 render-and-diff 會因 render context 差異產生假紅，故留待裁決 |
| F-37 | src/services/archive.service.ts:525 | minor | maintainability | fixed | reviewer 指出 !landedAny 與 landed filter 現已不可達。二者編碼真實不變量且本 repo 有同型先例（computeChangeDigest 的 fail-closed 防禦），故保留並註明其不可達性與保留理由，而非留下無聲死碼 |
| F-38 | scripts/check-agent-sync.ts:46 | critical | regression | fixed | 新 guard 沒檢查它宣稱檢查的東西：`agent sync` 從 BUNDLED_TEMPLATES 渲染、不讀 src/templates/**，故「改 .hbs 未 bundle」照樣綠燈——正是本輪踩的第一次。已改為先跑 bundler 並把 bundled-templates.ts 納入指紋，整條 template→bundle→deployed 成為單一裁決（mutation M16 KILLED） |
| F-39 | .prospec/changes/stop-silent-spec-body-loss/delta-spec.md:641 | critical | regression | fixed | REQ-TESTS-079 宣稱「sync 不再寫出的檔案會被回報為 removed」為假：orphan sweep 只清整個 prospec-* 孤兒目錄，活躍目錄內的孤兒檔案留存。已改為據實敘明目錄粒度並明列該限制 |
| F-40 | scripts/check-agent-sync.ts:57 | major | regression | fixed | guard 會寫入且自我修復，紅燈後第二次必綠，而 docstring／失敗訊息／CI 註解皆未揭露——開發者可能把第二次的綠讀成前一次是偶發而漏 commit 重生的工件。失敗訊息已明說「本次已重新生成，去看 diff 並 commit」 |
| F-41 | .prospec/changes/stop-silent-spec-body-loss/delta-spec.md:626 | major | regression | fixed | REQ-TESTS-079 掛在 US-31 之下，但該 story 從標題到四條 scenario 全講 factual-count，無一涵蓋部署新鮮度，新行為將無 story 層驗收準則即畢業。已新增 Phase 3.5 手動收斂清單，逐行列出 US-31 標題／narrative／新增 scenario 的收斂內容（US 層文字無畢業載體，ledger 記錄之形狀） |
| F-42 | scripts/check-agent-sync.ts:1 | critical | test-quality | fixed | 自查發現：guard 自身無測試——移除 bundle 步驟的 mutation 存活，無任何斷言轉紅。已抽出可測核心（fingerprint／diffFingerprints／checkGeneratedArtifacts 注入式 regenerate），重生步驟以版控字面值釘住，新增 12 條測試；M16／M17／M18 三個 mutation 皆 KILLED |
| F-43 | src/templates/skills/prospec-archive.hbs:1 | critical | process | fixed | 我在 mutation 還原時用 `git checkout --`，毀掉該檔案本變更全部未 commit 的編輯（五處），連同 bundle 與部署品一併回捲。這是 memory 記錄過的陷阱第三次發生。已自稍早的 /tmp 備份完整復原並逐項確認——救回靠運氣而非流程；還原一律用 cp 備份 |
