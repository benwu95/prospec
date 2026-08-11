# Review Findings: add-issue-link-field

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
| F-1 | src/services/archive.service.ts:380 | critical | security | fixed | 含換行的 issue 值原樣插進 archive summary，可在已納版控的 `_archived-history/` 稽核軌跡偽造 `##` 標題與第二條 `- **Quality Grade**: S`，並撐爛 `prospec status` 的每變更區塊（`sanitizeTerminal` 刻意保留 0x0a）。verifier 以 source CLI 端到端重現。修法：新增共用 helper `normalizeIssueRef`（非字串→未登記、`\s+` 收成單一空白、空白→未登記），寫入面與兩個讀取面全部改走它。 |
| F-2 | .prospec/changes/add-issue-link-field/delta-spec.md:109 | critical | spec-architecture | fixed | REQ-TEMPLATES-178 的 AC2 與 proposal FR-006／US-3 要求出貨模板點名 `CONTRIBUTING.md`，同時與實作、與同一條 REQ 自己的 `**Spec:**`、與契約測試三者矛盾。實作端才是對的（shipped template 不得斷言 THIS repo 的事實）。修法：四份工件的驗收面改成「交還給專案自身的 contributor docs、不點名檔案」，實作與測試不動。 |
| F-3 | prospec/specs/features/sdd-workflow.md:1566 | critical | spec-architecture | not-found | 指控 REQ-TYPES-070 應比照 REQ-CLI-023 列 MODIFIED。verifier 三點推翻：該括號列舉本來就不窮盡（早已省略 `name`／`status`／`scale` 與所有 facts-only 成員）、所引先例（mechanize-light-scale-gates）改的是受契約測試釘住的站點順序而非 payload、route 契約事實已由 ADDED REQ-TYPES-080 以 WHEN/THEN 承載。改寫它反而要重述五條被兩份 `_status-lifecycle.md` 測試釘住的 bullet，製造 droppedBehavior 風險。已加一句交叉引用作零風險補強。 |
| F-4 | src/cli/formatters/status-output.ts:33 | major | correctness | fixed | 空白值語意在兩個讀取面不一致：archive 視 `issue: ""` 為未登記而省略該列，status 只判 `!== undefined` 會印出空標籤，違反 proposal US-2「不印空值」。修法：兩面統一走 `normalizeIssueRef`。 |
| F-5 | tests/unit/services/status.service.test.ts:255 | major | test-quality | fixed | 「無值不寫鍵」的斷言打在 route 上而非 facts 上，被 `routeChange` 自己的條件展開吸收——mutation 證實把 `collectFacts` 改成無條件寫入時 17 個測試全綠。修法：以 `vi.hoisted` + `vi.mock` 攔下傳給 `routeChange` 的 facts 後斷言；同一 mutation 現在轉紅。 |
| F-6 | README.md:573 | major | docs-claims | fixed | 兩份 root README 的 `prospec status` 說明沿用同一份輸出欄位窮盡列舉卻沒加 issue——正是 delta-spec 用來 justify 改寫 REQ-CLI-023 的那條理由所指的使用者面孿生。修法：雙語同步補上。 |
| F-7 | .claude/skills/submit-pr/SKILL.md:123 | major | docs-claims | fixed | 新 skill 把 leading `fix #NN` 標成「older PRs」，但唯一使用它的是最新 merge #152；又宣稱 issue link 是「最近十個 PR」的 stable part，實際三個（#148／#145／#137）完全沒有 issue 參照、#128 用單數 `Close`。已用 `gh pr view` 逐一複核並改成實測值（含各形式的實例編號），雙份同步。 |
| F-8 | src/templates/skills/prospec-new-story.hbs:59 | major | spec-architecture | fixed | issue #131 方案明列「ff Phase 1 與 new-story 訪談把 issue 列為選填一問」未實作、也未記為 descope，兩個唯一會建立變更的站台仍不帶 `--issue`，欄位實務上不會被填——正是 issue 要消滅的形態。修法：合併進既有的 change name 確認點（相容 ff「不得問超過 3 個問題」的 NEVER），scaffold 帶 `[--issue <ref>]`，加契約測試＋三個 mutation 驗紅。 |
| F-9 | src/cli/parse-options.ts:43 | critical | spec-architecture | fixed | round-1 修復在旗標層加的「拒絕換行」與 helper 的收斂皆無 REQ 承載，且直接與 REQ-CLI-036 的 `**Spec:**`（forwards that value unchanged）與 REQ-TEMPLATES-178（never validated）矛盾——而這兩段 body 會在 archive 時逐字畢業進信任區（審查者實際跑 archive 驗證畢業結果）。修法：撤掉旗標層拒絕（回到 issue #131 明文的「不做校驗」立場），只留 sink 端收斂；新增 ADDED REQ-LIB-048 承載收斂語意，並訂正 REQ-SERVICES-085 的 byte-identical、REQ-TEMPLATES-178 的事實數與 REQ-TESTS-081 的覆蓋描述。 |
| F-10 | src/templates/skills/prospec-ff.hbs:55 | critical | docs-claims | fixed | round-1 的收斂讓「prospec validates nothing about it」／「never validated」／「不校驗」在 3 份出貨模板（＋6 份部署副本）、兩份 README、`CONTRIBUTING.md` 與 schema doc comment 全部變成假宣稱，且契約測試把假宣稱釘住；同一支 CLI 的 help 反而說「single line」，使用者可直接觀察到互斥。修法：全部改成有範圍的宣稱（形態不校驗、不呼叫 API；空白收斂為單行且明說是結構防護而非形態判斷），archive-format 的「verbatim」改為「single line」，契約斷言改釘正確語意。 |
| F-11 | src/lib/change-metadata.ts:159 | critical | docs-claims | fixed | round-2 刪掉旗標層拒絕後，`normalizeIssueRef` 的 doc comment 仍斷言「`--issue` refuses a line break outright (`parseIssueRef`)」——是全 repo 唯一殘留的懸空符號參照，且與 REQ-CLI-036 的 `**Spec:**` 矛盾。危害具體：維護者若相信寫入面已擋，會在新的 sink 省略 `normalizeIssueRef`，重開偽造缺口。修法：改述為「收斂是唯一防線、刻意不在入口拒絕、新 sink 必須呼叫此 helper」。 |
| F-12 | tests/unit/services/archive.service.test.ts:2334 | critical | parallel-site | fixed | 同一句被推翻的 refusal 主張在測試 rationale 留了第二份平行副本，把 reader 端收斂描述成「第二道防線」，而它其實是唯一一道——後人可能據此判定 `generateSummary` 的收斂冗餘而移除。修法：兩處同一主張一併訂正，並明寫這個測試就是守住唯一防線的東西。 |
| F-13 | prospec/ai-knowledge/modules/lib/README.md:14 | major | docs-claims | fixed | lib 模組 README 沒列 `normalizeIssueRef`，而它對 `issue` 的唯一陳述（router 列的「display-only」）會把讀者導向「lib 對 issue 只做傳遞」的反方向結論，牴觸 helper 自身「新 sink 必須呼叫它」的告誡——L2 導覽面因此無從發現這個唯一防護點。修法：`change-metadata.ts` 列補上該 helper 與「every sink calls it」，量測後 1799/1800 tokens 仍在預算內、L2 findings 集合與 `main` 一致。 |

## 收斂記錄

四輪對抗式審查（mode B，獨立 fresh-context reviewer；每個 critical 另經獨立 verifier 確認存在才修）。Round 4 回報 0 critical，迴圈收斂為 review-clean。

**成因分佈**：6 個 confirmed critical 中僅 2 個出自原始實作，其餘 4 個全由前一輪的修復造成——round 2 的兩個源於 round 1、round 3 的兩個源於 round 2。形態一致：為修安全性缺陷而在入口加的那道防線，同時改變了系統對外的宣稱，使散在出貨模板、部署副本、兩份 README、schema 註解與測試 rationale 的十餘處「不校驗」同時失真，而契約測試把假宣稱釘住。撤掉入口拒絕、回到 issue #131 明文的「不做校驗」立場，只保留 sink 端收斂（本 repo 對「自由文字 → markdown／終端」的既有模式）後才真正收斂。

**F-3 是唯一被 verifier 推翻的 critical**：若照原判改寫 `REQ-TYPES-070`，需重述五條被兩份 `_status-lifecycle.md` 契約測試釘住的 bullet，反而製造 `droppedBehavior` 阻斷風險——修錯方向比不修更糟。此處以 ADDED `REQ-TYPES-080` 的交叉引用作零風險補強。

**未解項**：無。13 列中 12 列 `fixed`、1 列 `not-found`（F-3），無 `open`。

**Round 5（verify 2/5 觸發的補審）**：2/5 獨立評分指出 ff／new-story 兩份 skill 的新行為無 REQ 承載（與 round 2 同型：交付超出 delta spec）。補 ADDED `REQ-TEMPLATES-179` 後窄審 0 findings——新 REQ 文字經逐條對照模板為真、id 不與現有碰撞、以真的 `extractDeltaBlock` 對全檔 9 條 REQ 跑出 `truncation: null`、`REQ-CLI-023` 的 `**Dropped:**` 以真的 drop diff 算出 undeclared 與 stale 皆為空集（archive 不會 hold write），且 `REQ-TEMPLATES-032`／`REQ-TEMPLATES-085` 無任何陳述被新行為推翻，故採新增 REQ 而非改寫。
