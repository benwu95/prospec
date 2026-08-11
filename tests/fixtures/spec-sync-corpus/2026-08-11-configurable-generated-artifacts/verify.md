# Verify Evidence: configurable-generated-artifacts

<!-- prospec:evidence-section -->
## 2026-08-11 — grade B

<!-- prospec:evidence delta-spec-compliance -->
### delta-spec-compliance — WARN

**Summary:** 8 個 REQ 中 7 個 PASS、REQ-TEMPLATES-173 為 WARN：設定驅動的 generated_artifacts 排除（含空答案退回未排除時間戳）、hasVerifyGrade 的 archived/verified 時間軸分流、以及 syncToFeatureSpecs 兩個 heading 錨點三條主線都與 Spec 相符，1046 條相關測試全綠且 typecheck 乾淨；WARN 在於本輪新加進兩份 _status-lifecycle.md 與 prospec-verify/prospec-archive 樣板的「metadata-completeness 只讀最新一筆 verify」該句沒有任何 contract test marker 釘住，而 REQ-TEMPLATES-173 第四條正是以 contract test 作為 lifecycle 副本內容的執行機制。
**Repro:** `npx vitest run tests/unit/lib/drift-sources.test.ts tests/unit/lib/drift-sources-git-capture.test.ts tests/unit/services/check.service.test.ts tests/unit/services/mcp.service.test.ts tests/unit/services/archive-spec-body.service.test.ts tests/contract/generated-artifacts-single-source.test.ts tests/contract/skill-format.test.ts tests/integration/skill-contract.test.ts tests/contract/mcp-server.test.ts && pnpm typecheck && grep -rn 'reads only the LATEST' tests/ || echo 'NOT PINNED'`

## REQ-LIB-039: Generated-source-artifact registry — PASS

`BUNDLED_TEMPLATES_SOURCE` 仍是 templates bundler 的建置期常數（`src/lib/generated-artifacts.ts:19`），`GENERATED_SOURCE_ARTIFACTS` 已刪除，`src/` 底下無殘留引用。（信任區 `prospec/specs/features/drift-detection.md:68,70` 仍帶舊登記表敘述，那是 archive 才畢業的部分，依規則不列為發現。）

- Bullet 1（bundler 由常數推導、不留第二份路徑）：`scripts/bundle-templates.ts:10` 以 `OUTPUT_FILE = path.resolve(__dirname, '..', BUNDLED_TEMPLATES_SOURCE)` 推導寫入位置；契約測試 `tests/contract/generated-artifacts-single-source.test.ts:17-19` 斷言 `OUTPUT_FILE === path.resolve(REPO_ROOT, BUNDLED_TEMPLATES_SOURCE)`。
- Bullet 2（collector 讀設定而非寫死常數）：`collectGitTimestamps` 新增第四參數 `generatedArtifacts: readonly string[]`（`src/lib/drift-sources.ts:566`），於 `src/lib/drift-sources.ts:620` 傳入 `gitLastCommit`。兩個呼叫端各自由設定供給：`src/services/check.service.ts:183`、`src/services/mcp.service.ts:365`（`McpServerContext` 於 `src/services/mcp.service.ts:70` 新增 `config` 欄位，`execute` 於 `src/services/mcp.service.ts:88` 注入 `readConfig` 結果）。
- Bullet 3（欄位缺席 → 不排除任何路徑）：兩端皆寫成 `config.knowledge?.generated_artifacts ?? []`，schema 為 `.optional()` 無 `.default()`（`src/types/config.ts:175`）。`tests/unit/services/check.service.test.ts:97` 用同一個 repo、同一組 commit，只切換 `.prospec.yaml` 內容，雙向斷言：宣告 `src/lib/generated.ts` → 該 module 不 stale；不宣告（整個 key 缺席）→ stale。這正是「兩個 service 呼叫端都硬寫 `[]` 也能全綠」那個盲點的封堵。
- Bullet 4（部分命中：排除於 `last_src_commit`、但仍在 `computeChangeDigest` 內）：`computeChangeDigest`（`src/lib/drift-sources.ts:1404-1417`）的排除集合是固定清單，完全沒有接 `generatedArtifacts`；`tests/unit/lib/drift-sources.test.ts:1451` 釘住同一個生成檔被編輯時 digest 必翻。
- Bullet 5（全覆蓋或 `:(exclude)` 無法解析 → 退回未排除時間戳，絕不 null）：`src/lib/drift-sources.ts:1344-1345` 由原本的 `if (excluded !== null) return excluded.trim() || null` 改為 `const excluded = gitCapture(...)?.trim(); if (excluded) return excluded;`，capture 失敗（`undefined`）與排除後無檔（`''`）兩種「無答案」一律落到未排除查詢。我在 temp repo 實測 `git log -1 --format=%cI -- src/lib ':(exclude)src/**'` 確實回空字串（不是回原時間戳），因此 `tests/unit/lib/drift-sources.test.ts:1162` 走的是真正的空結果分支，而非碰巧同值。

## REQ-LIB-025: metadata-completeness Collector + Evaluator — PASS

`hasVerifyGrade` 已改為 `(quality_log, status)` 雙參數（`src/lib/drift-sources.ts:1825`），呼叫端於 `src/lib/drift-sources.ts:1812` 傳入該變更的 `status`。時間軸判準落在 `src/lib/drift-sources.ts:1844-1849`：`archived` 走 `quality_log.some(entry => isVerify(entry) && isPass(entry))`（保留歷史任一筆 S/A），其餘 `GRADED_STATUSES`（即 `verified`）走 `quality_log.findLast(isVerify)`，找不到則 false。

Spec 其餘既有條款經檢視未被破壞：`REQUIRED_METADATA_FIELDS` 存在性檢查在 `src/lib/drift-sources.ts:1802-1805`；`skill`/`grade`/`result` 的 trim 由 `str()` helper 統一提供（`src/lib/drift-sources.ts:1831`，抽成共用後 `isVerify`/`isPass` 兩路都吃到，未退化）；legacy `result ∈ {S,A}` fallback 保留在 `src/lib/drift-sources.ts:1841`；non-mapping parse 視為全欄位缺失、不 deref null 在 `src/lib/drift-sources.ts:1792-1801`；無 `.prospec/changes/` → `available:false` 帶 reason 在 `src/lib/drift-sources.ts:1781-1787`。`evaluateMetadataCompleteness` 與 check id 未被本次 diff 觸及。

`findLast` 需要 ES2023：`tsconfig.json` 為 `target: es2023` / `lib: ["es2023"]`，`pnpm typecheck`（涵蓋 `src/` + `tests/` + `scripts/`）乾淨通過。

行為斷言：`tests/unit/lib/drift-sources.test.ts:1711`（verified 最新 B、較早 S → `missing_verify_grade: true`）、`:1722`（同一份 log 以 archived 讀 → false）、`:1733`（verified 唯一一筆 S → false）、`:1743`（verified 空 log／無 verify 條目 → true）。

## REQ-TESTS-071: Generated-artifact exclusion and digest-boundary coverage — PASS

六條 bullet 逐條對上：

1. 只提交已宣告的生成物 → `last_src_commit` 停在 06-10：`tests/unit/lib/drift-sources.test.ts:1150`。
2. 設定為空／缺席 → 不排除任何路徑，該路徑被當成人寫原始碼（`last_src_commit` 移到 06-12 且 stale）：`tests/unit/lib/drift-sources.test.ts:1140`。這就是取代寫死常數的負向斷言。
3. 之後提交人寫原始碼且未更新知識 → 仍 stale：`tests/unit/lib/drift-sources.test.ts:1173`（另有 `:1186` 釘住混合 commit）。
4. 同一生成物被編輯 → `computeChangeDigest` 改變，且與排除測試同檔並列：`tests/unit/lib/drift-sources.test.ts:1451`。
5. 排除 pathspec 的 capture 被注入失敗 → collector 報未排除時間戳而非 null：`tests/unit/lib/drift-sources-git-capture.test.ts:96-112`，並已配合新簽章傳入 `['src/lib/x.ts']`（`:108`），涵蓋 module 唯一原始檔，使未排除重試成為唯一的真值路徑；`beforeEach` 於 `:56` 重置 `failExcludePathspec`，避免旗標跨測試殘留。
6. Mutation 主張（把排除或 digest 覆蓋改回去會轉紅）分析上成立：拿掉 `gitLastCommit` 的 `excludes` 分支 → `:1150` 期待 06-10 卻得 06-12 轉紅；把 `if (excluded) return excluded` 改回 `excluded.trim() || null` → `:1162` 的 `last_src_commit` 變 null，`toContain` 直接拋錯轉紅（我已實測 `:(exclude)src/**` 的確產生空結果，故該測試不是碰巧同值而是真的走 fall-through）；若把生成物排除進 `computeChangeDigest` → `:1451` 轉紅。

上述 6 個測試檔（327 tests）與 `tests/contract/skill-format.test.ts`、`tests/integration/skill-contract.test.ts`、`tests/contract/mcp-server.test.ts`（719 tests）我都實跑，全綠。

## REQ-TEMPLATES-171: archive Entry Gate consumes all three provenance checks — PASS

信任區現行文字（`npx tsx src/cli/index.ts spec show drift-detection --req REQ-TEMPLATES-171`）確實寫著「`hasVerifyGrade` accepts any earlier S/A entry ... leaves both `status` and `metadata-completeness` green」，與本變更後的程式碼相反，因此把它列為 MODIFIED 是正確且必要的（不列就會在信任區永久留一條與碼相反的敘述）。

- Bullet 4（本次改寫的那條）已落地：`src/templates/skills/prospec-archive.hbs:32` 的 Entry Gate 項目改為「`status` will not say so — but `metadata-completeness` will: for a `verified` change it reads only the LATEST `/prospec-verify` entry, so an earlier S/A no longer covers a B/C/D re-verify」；已 bundle（`src/lib/bundled-templates.ts` 內含該句）並同步到兩份出貨副本 `.claude/skills/prospec-archive/SKILL.md:47`、`.agents/skills/prospec-archive/SKILL.md:47`。而「`metadata-completeness` 會回報」這件事本身由 REQ-LIB-025 的碼實現（`src/lib/drift-sources.ts:1844-1849`）並由 `tests/unit/lib/drift-sources.test.ts:1711` 釘住，所以這條 bullet 的兩半都有支撐。
- Bullet 1/2/3/5（三檢查任一 FAIL 即拒、`delta-spec-provenance` 指向 landing block、全 PASS/skipped 則放行、CLI 缺席由探針 STOP）皆為前一變更既有內容，未被本次 diff 破壞，且由 `tests/contract/skill-format.test.ts:4428-4459` 的 marker 清單釘住（該測試實跑通過）。

記錄一項不構成違反的觀察：該 contract test 的 marker 清單未隨這次改寫加入新句的任何 marker，其上方註解（`tests/contract/skill-format.test.ts:4450-4452`）仍以「`quality_log` keeps the earlier S/A entry」為理由——該敘述本身仍為真（log 的確保留該筆），只是不再是「沒有機器檢查會說」的理由。REQ-TEMPLATES-171 未含任何測試釘住的 bullet，故不扣分，但這新句在 archive 樣板側同樣是無測試保護的。

## REQ-TEMPLATES-173: review and verify are re-enterable from `verified` — WARN

- Bullet 1（floor：`implemented` 或更後，含 `verified`）與 Bullet 2（`/prospec-review` Error Handling 以「BEFORE `implemented`」為拒絕條件，並列舉 `story`/`plan`/`tasks`）為既有內容，由 `tests/contract/skill-format.test.ts:4465-4488` 釘住（含「`metadata status not \`implemented\``」不得回歸的負向斷言），實跑通過。
- Bullet 3（B/C/D 重入時 `status` 停在 `verified`，而 `metadata-completeness` 依最新評級轉紅，兩者共同說明不可封存）已落地於四個地方：`src/templates/skills/prospec-verify.hbs:345-347`、`src/templates/init/status-lifecycle.md.hbs:51`、`prospec/ai-knowledge/_status-lifecycle.md:51`，以及出貨副本 `.claude/skills/prospec-verify/SKILL.md:379-381` 與 `.agents/skills/prospec-verify/SKILL.md:379-381`；`src/lib/bundled-templates.ts` 內 "reads only the LATEST" 出現 3 次（archive.hbs / verify.hbs / status-lifecycle.md.hbs），bundle 已同步。行為面由 REQ-LIB-025 的碼與 `tests/unit/lib/drift-sources.test.ts:1711` 支撐。兩份 `_status-lifecycle.md` 內容一致（template 與 repo 副本同句）。
- Bullet 4（「WHEN either lifecycle copy omits the re-entry facts, THEN the contract test fails」）—— **這是 WARN 的來源**。現行的 lifecycle 雙副本 contract test 在 `tests/contract/skill-format.test.ts:4501-4519`，它釘的是前一變更的兩個事實：`re-entering after a post-verify edit stays \`verified\`` 的正向 marker、`leaves \`status\` unchanged (stays \`implemented\`)` 的負向 marker，以及 `re-runs **after** \`verified\``。本次新增的第三個 re-entry 事實（`metadata-completeness` 只讀最新一筆 verify、`archived` 保留 any-entry 讀法）**沒有任何 marker 釘住**：我對 `tests/` 全域 grep `reads only the LATEST`／`any-entry reading`／`turns it red until a fresh` 皆為零命中。同理，`tests/contract/skill-format.test.ts:4490-4499` 的 verify 側 marker 清單（`already-\`verified\` change, "unchanged" means it stays \`verified\``、`status never regresses`、`NOT archivable`）也未加入新句。後果是：把這三份樣板（含兩份 lifecycle 副本）裡的新句整段刪掉或改回舊的「neither `status` nor `metadata-completeness`」，整個測試套件仍會全綠——而 bullet 4 正是把 contract test 指定為 lifecycle 副本內容的執行機制。判為 WARN 而非 FAIL，是因為 bullet 4 字面上說的「the re-entry facts」整體仍受既有 marker 保護（副本若整段缺席仍會轉紅），只有本次新增的那一項落在保護之外。

## REQ-TYPES-082: generated_artifacts config field — PASS

`src/types/config.ts:175` 新增 `generated_artifacts: z.array(z.string()).optional()`，位置與寫法都與同排的 `additional_core_conventions`（`src/types/config.ts:171`）一致，對既有 `knowledge` 形狀是純新增。

- Bullet 1（存在時解析為 glob 字串陣列）：`.prospec.yaml:22-23` 的 dogfood 宣告 `- src/lib/bundled-templates.ts` 經 `tests/unit/services/check.service.test.ts:97` 的等價 fixture 實證可解析並生效；`tests/unit/services/mcp.service.test.ts:378` 以 `['src/gen/**']` 斷言值原樣傳到 collector。
- Bullet 2（缺席時每個消費端讀成 `[]`）：兩個消費端皆為 `?? []`（`src/services/check.service.ts:183`、`src/services/mcp.service.ts:365`），schema 端刻意不用 `.default([])`。這個取捨的理由在 Description 已寫明，而且可驗證：`pnpm typecheck` 通過，代表帶 `knowledge` 物件的具型別 `ProspecConfig` 字面值（含 `prospec init` 的那個）沒有被迫補上該欄位。
- Bullet 3（既有 `.prospec.yaml` 省略此欄位仍可解析、無具型別建構點被迫具名）：`ProspecConfigSchema` 以 `.loose()` 收尾（`src/types/config.ts:207`），`KnowledgeSchema` 本身 `.optional()`；`tests/contract/mcp-server.test.ts:92,156` 與 `tests/unit/services/mcp.service.test.ts:81` 都只給 `{ version, project }`（無 `knowledge`）即可建構 `McpServerContext`，實跑通過。

## REQ-SERVICES-088: Spec-sync section anchors match headings, not bare strings — PASS

前提事實已核對：`prospec/specs/features/drift-detection.md:619` 與 `:621` 各自在 US-15 的驗收 bullet 內以行內程式碼引用 `## Edge Cases`，真正的 `## Edge Cases` 標題在 `:731`；`:621` 也引用 `## Deprecated Requirements`（另有 `:614`、`:648`），真正的標題在 `:755`。子字串比對確實會命中引用而非標題。

- Bullet 1（ADDED 路徑）：`src/services/archive.service.ts:2182` 改為 `const insertBefore = /^## Edge Cases[ \t]*$/m`，`:2188` 用 `.test()`，`:2192` 用 `content.replace(insertBefore, (heading) => newReq + '\n' + heading)`。迴歸測試 `tests/unit/services/archive-spec-body.service.test.ts:230-290`：fixture 讓引用出現在真標題之前，斷言引用 bullet 與其相鄰 bullet 原文完整保留（`:275-278`）、新 REQ 位在引用之後且真標題之前（`:280-286`）、真標題恰好一個（`:288`）、引用仍在標題之前（`:289`）。
- Bullet 2（REMOVED 路徑）：`src/services/archive.service.ts:2213` 的 `_(None)_` 分支改為 `/^## Deprecated Requirements\r?\n\r?\n_\(None\)_/m`，`:2219` 的既有區段分支改為 `/^## Deprecated Requirements[ \t]*$/m`，`:2221` 以 `(heading) => \`${heading}${deprecatedEntry}\`` 回填。迴歸測試 `tests/unit/services/archive-spec-body.service.test.ts:292-337`，斷言方式與 ADDED 路徑對稱（引用段落完整、標題數 1、退役條目落在真標題之後）。
- Bullet 3（兩個標題都不存在時退回既有 fallback）：`src/services/archive.service.ts:2196`（新 REQ 附加檔尾）與 `:2225`（整段新建 Deprecated 區段）維持原樣，既有覆蓋在 `tests/unit/services/archive.service.test.ts:682-704`（`_(None)_` 路徑，含 `$&` 描述）與 `:771-779`（既有 Deprecated 區段）仍全綠。
- Bullet 4（任一錨點退回子字串比對 → 對應迴歸測試轉紅）分析上成立：ADDED 側退回 `content.replace('## Edge Cases', ...)` 會把新 REQ 塞進引用 bullet 中間，`:275-278` 的 `toContain`（要求引用 bullet 與其下一行原文相連）立刻失敗；REMOVED 側退回子字串會同時打破 `:329-332` 的 `toContain` 與 `:335-336` 的 `entry > depHeading` 順序斷言。
- Spec 另一句「function replacer is retained in every branch」逐分支確認：`:2192`、`:2215`、`:2221` 三處皆為函式 replacer，檔尾 fallback 為字串串接不經 `replace`，`$&`/`$1`/`$$` 不會被展開。
- 附帶觀察（非發現）：改用 regex 後 `_(None)_` 分支在 CRLF 檔案上也會命中（原本的 `includes('...\n\n_(None)_')` 不會），寫回的仍是 LF。這是行為擴張而非退化，REQ 未涉及行尾議題。

## REQ-TESTS-084: hasVerifyGrade timeline-aware coverage — PASS

四條驗收條件逐條有測試，全部落在 `tests/unit/lib/drift-sources.test.ts` 的 `collectMetadataCompleteness` describe：

1. 最新 `prospec-verify` 為 grade B、較早為 grade S、status `verified` → `missing_verify_grade: true`（`:1711-1720`，fixture c15）。
2. 同一份 `quality_log` 以 `archived` 檢查 → `false`（`:1722-1731`，fixture c16，與 c15 逐字同構、僅 status 不同，因此確實隔離出 status 這一個變因）。
3. 唯一一筆 `prospec-verify` 為 grade S、status `verified` → `false`（`:1733-1741`，fixture c17）。
4. `quality_log` 為空或無 `prospec-verify` 條目時，`verified` 與 `archived` 皆回 true（即缺 grade）：`verified` 半邊在 `:1743-1756`（c18 空陣列、c19 只有 `prospec-review` 條目），`archived` 半邊在 `:1758-1774`（c20、c21 同形）。Spec 特別要求 `archived` 這半必須也釘，理由是 any-entry 分支正是空 log 可能 fail-open 之處——已釘，且 `src/lib/drift-sources.ts:1845` 的 `.some()` 對空陣列回 false，語意一致。

`hasVerifyGrade` 本身未 export，測試是透過公開的 `collectMetadataCompleteness` 間接驅動；這與該檔既有的 c1–c14 測試慣例一致，且 `missing_verify_grade` 是該函式唯一的可觀察輸出，故仍屬有效釘住。

## 執行紀錄

- `npx vitest run tests/unit/lib/drift-sources.test.ts tests/unit/lib/drift-sources-git-capture.test.ts tests/unit/services/check.service.test.ts tests/unit/services/mcp.service.test.ts tests/unit/services/archive-spec-body.service.test.ts tests/contract/generated-artifacts-single-source.test.ts` → 6 files / 327 tests 全綠。
- `npx vitest run tests/contract/skill-format.test.ts tests/integration/skill-contract.test.ts tests/contract/mcp-server.test.ts` → 3 files / 719 tests 全綠。
- `pnpm typecheck`（`tsconfig.typecheck.json`，涵蓋 tests/ 與 scripts/）→ 無錯誤。
- 全程唯讀：未執行任何 `git checkout`/`stash`/`restore`/`clean`/`reset`，未編輯任何 repo 檔案，未跑 `prospec verify record` 或 `prospec check --record-tests`；工作區檔案清單前後一致（30 個 modified）。
<!-- prospec:evidence-end -->

<!-- prospec:evidence constitution -->
### constitution — WARN

**Summary:** 8 條規則 1:1 稽核：7 條 PASS、1 條 WARN——[SHOULD] User-Facing Documentation Stays Current 被違反，新增的設定鍵 knowledge.generated_artifacts 在兩份根 README 皆缺席，而同層的 additional_core_conventions 在兩份 README 都有完整散文說明與 YAML 範例。其餘規則皆有機器或實測證據。
**Repro:** `grep -c 'generated_artifacts' README.md README.zh-TW.md; grep -n 'additional_core_conventions' README.md README.zh-TW.md | head -2`

以 prospec-report.json 的 structural.constitution.rules[] 為清單逐條稽核（共 8 條），嚴重度一律取自清單、未自行改派。

**1. [MUST] Language Policy — PASS**
`artifact-language` 檢查 PASS。delta-spec.md 1262 個中日韓字元，Before/After/Reason 為繁中、`**Spec:**` 區塊為英文；proposal/plan/tasks/review.md 皆繁中；信任區（`prospec/ai-knowledge/**`、`src/templates/**`、`prospec/specs/features/**`）維持英文。兩條 ADDED REQ 的 Description/Acceptance Criteria 改為繁中，其英文 `**Spec:**` 區塊才是落地載體——以已封存的 2026-08-10-feature-spec-sub-modules 為前例實測確認：其英文 Spec 落在 knowledge-reader.md:28，繁中 Description 未進入信任區。

**2. [MUST] Atomic Commits and Format Requirements — PASS（附提醒）**
本變更尚無任何 commit（commit 邊界正是本 S/A 閘門），故無違反事實。提醒：本變更現含三個關注點（US-1 設定化排除、US-2/3 hasVerifyGrade、US-4 archive 錨點），要滿足「一個 commit 一個關注點」需在 commit 提示時拆為 ≥2 個 commit；此為對尚未發生步驟的指引，不計為違反。

**3. [MUST] User Stories Follow INVEST — PASS**
四條 US 逐條檢核六準則：US-1（設定化排除）、US-2（最新一筆判準）、US-3（archived 作用域）、US-4（封存插入點）各自 Independent（可獨立交付）、Negotiable、Valuable、Estimable、Small、Testable（皆有 Acceptance Scenarios 與 Independent Test）。附註：proposal.md 的 Constitution Check 自檢文字仍寫「兩個 US」，未隨 US-4 更新——屬工件陳述過時，非 INVEST 違反。

**4. [MUST] Test-Driven Development — PASS**
每項行為變更皆附測試，且多數經 mutation 驗證（服務接線硬寫 [] 使兩條新測試轉紅；gitLastCommit 折成 null 使 fallback 測試轉紅；archive 兩個錨點退回子字串比對各使對應迴歸測試轉紅；archived 分支 fail-open 使新增的空 quality_log 測試轉紅）。實跑 `pnpm test:coverage`：statements 94.48%、branches 89.6%、functions 95.08%、lines 95.02%，全數 ≥ 80% 門檻。

**5. [SHOULD] One-way Dependency Direction — PASS**
`import-direction` 檢查 PASS。變更涉及 types/lib/services 三層：lib/drift-sources.ts 只向下引用 types/config.js；services/mcp.service.ts 以 type-only import 取用 types/config.js；無任何上行或循環引用。

**6. [SHOULD] User-Facing Documentation Stays Current — WARN（違反，SHOULD 權重）**
本變更新增使用者面向的設定鍵 `knowledge.generated_artifacts`，但 README.md 與 README.zh-TW.md 皆未記載。對照組明確：同一層的 `knowledge.additional_core_conventions` 在 README.md:767 與 README.zh-TW.md:734 都有整段散文說明，並在 README.md:794／README.zh-TW.md:761 的 YAML 範例中列出。兩份 README 對新鍵皆為零命中。補救：在兩份 README 的 knowledge 設定鍵段落各補一條說明與範例（雙語同步落地）。此為審查階段列為 major 的 F-13，未修而帶到此處。

**7. [MUST] Factual Count Integrity — PASS**
`pnpm counts` 已重跑，`counts:check` 回報 in sync。第三層手維護計數無欠項：本變更未新增或移除模組原始碼檔案（模組 README 的 (N files, N lines) 標頭不變）、未新增 DRIFT_CHECK_IDS 條目（根 README 的檢查列舉不變）、REQ 尚未畢業（feature spec frontmatter 的 story_count/req_count 於 archive 才變動）。

**8. [MUST] Pre-Merge CI Checks — PASS**
六項逐一實跑：`pnpm lint` exit 0；`pnpm typecheck` exit 0；`pnpm test:coverage` exit 0 且覆蓋率如上；`pnpm counts:check` in sync；`pnpm agents:check` 回報 templates → bundle → deployed 104 檔皆為最新；`prospec check --strict` exit 0（17/17 檢查，0 fail、2 warn）。其中兩個 warn 為 `knowledge-size`（既有 L2/spec 檔案超預算）與 `unjustified-budget-override`；後者經比對 HEAD 版 .prospec.yaml 確認結構相同，屬既有狀態，非本變更引入。
<!-- prospec:evidence-end -->

<!-- prospec:evidence design -->
### design — not-applicable

**Summary:** proposal.md 的 UI Scope 為 none，且無 design-spec.md，本維度不適用。
**Repro:** `grep -A2 '^## UI Scope' .prospec/changes/configurable-generated-artifacts/proposal.md; ls .prospec/changes/configurable-generated-artifacts/design-spec.md 2>&1`
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->

<!-- prospec:evidence-section -->
## 2026-08-11 — grade A

<!-- prospec:evidence delta-spec-compliance -->
### delta-spec-compliance — WARN

**Summary:** 8 個 REQ 中 7 個 PASS、REQ-TEMPLATES-173 為 WARN：設定驅動的 generated_artifacts 排除（含空答案退回未排除時間戳）、hasVerifyGrade 的 archived/verified 時間軸分流、以及 syncToFeatureSpecs 兩個 heading 錨點三條主線都與 Spec 相符，1046 條相關測試全綠且 typecheck 乾淨；WARN 在於本輪新加進兩份 _status-lifecycle.md 與 prospec-verify/prospec-archive 樣板的「metadata-completeness 只讀最新一筆 verify」該句沒有任何 contract test marker 釘住，而 REQ-TEMPLATES-173 第四條正是以 contract test 作為 lifecycle 副本內容的執行機制。
**Repro:** `npx vitest run tests/unit/lib/drift-sources.test.ts tests/unit/lib/drift-sources-git-capture.test.ts tests/unit/services/check.service.test.ts tests/unit/services/mcp.service.test.ts tests/unit/services/archive-spec-body.service.test.ts tests/contract/generated-artifacts-single-source.test.ts tests/contract/skill-format.test.ts tests/integration/skill-contract.test.ts tests/contract/mcp-server.test.ts && pnpm typecheck && grep -rn 'reads only the LATEST' tests/ || echo 'NOT PINNED'`

## REQ-LIB-039: Generated-source-artifact registry — PASS

`BUNDLED_TEMPLATES_SOURCE` 仍是 templates bundler 的建置期常數（`src/lib/generated-artifacts.ts:19`），`GENERATED_SOURCE_ARTIFACTS` 已刪除，`src/` 底下無殘留引用。（信任區 `prospec/specs/features/drift-detection.md:68,70` 仍帶舊登記表敘述，那是 archive 才畢業的部分，依規則不列為發現。）

- Bullet 1（bundler 由常數推導、不留第二份路徑）：`scripts/bundle-templates.ts:10` 以 `OUTPUT_FILE = path.resolve(__dirname, '..', BUNDLED_TEMPLATES_SOURCE)` 推導寫入位置；契約測試 `tests/contract/generated-artifacts-single-source.test.ts:17-19` 斷言 `OUTPUT_FILE === path.resolve(REPO_ROOT, BUNDLED_TEMPLATES_SOURCE)`。
- Bullet 2（collector 讀設定而非寫死常數）：`collectGitTimestamps` 新增第四參數 `generatedArtifacts: readonly string[]`（`src/lib/drift-sources.ts:566`），於 `src/lib/drift-sources.ts:620` 傳入 `gitLastCommit`。兩個呼叫端各自由設定供給：`src/services/check.service.ts:183`、`src/services/mcp.service.ts:365`（`McpServerContext` 於 `src/services/mcp.service.ts:70` 新增 `config` 欄位，`execute` 於 `src/services/mcp.service.ts:88` 注入 `readConfig` 結果）。
- Bullet 3（欄位缺席 → 不排除任何路徑）：兩端皆寫成 `config.knowledge?.generated_artifacts ?? []`，schema 為 `.optional()` 無 `.default()`（`src/types/config.ts:175`）。`tests/unit/services/check.service.test.ts:97` 用同一個 repo、同一組 commit，只切換 `.prospec.yaml` 內容，雙向斷言：宣告 `src/lib/generated.ts` → 該 module 不 stale；不宣告（整個 key 缺席）→ stale。這正是「兩個 service 呼叫端都硬寫 `[]` 也能全綠」那個盲點的封堵。
- Bullet 4（部分命中：排除於 `last_src_commit`、但仍在 `computeChangeDigest` 內）：`computeChangeDigest`（`src/lib/drift-sources.ts:1404-1417`）的排除集合是固定清單，完全沒有接 `generatedArtifacts`；`tests/unit/lib/drift-sources.test.ts:1451` 釘住同一個生成檔被編輯時 digest 必翻。
- Bullet 5（全覆蓋或 `:(exclude)` 無法解析 → 退回未排除時間戳，絕不 null）：`src/lib/drift-sources.ts:1344-1345` 由原本的 `if (excluded !== null) return excluded.trim() || null` 改為 `const excluded = gitCapture(...)?.trim(); if (excluded) return excluded;`，capture 失敗（`undefined`）與排除後無檔（`''`）兩種「無答案」一律落到未排除查詢。我在 temp repo 實測 `git log -1 --format=%cI -- src/lib ':(exclude)src/**'` 確實回空字串（不是回原時間戳），因此 `tests/unit/lib/drift-sources.test.ts:1162` 走的是真正的空結果分支，而非碰巧同值。

## REQ-LIB-025: metadata-completeness Collector + Evaluator — PASS

`hasVerifyGrade` 已改為 `(quality_log, status)` 雙參數（`src/lib/drift-sources.ts:1825`），呼叫端於 `src/lib/drift-sources.ts:1812` 傳入該變更的 `status`。時間軸判準落在 `src/lib/drift-sources.ts:1844-1849`：`archived` 走 `quality_log.some(entry => isVerify(entry) && isPass(entry))`（保留歷史任一筆 S/A），其餘 `GRADED_STATUSES`（即 `verified`）走 `quality_log.findLast(isVerify)`，找不到則 false。

Spec 其餘既有條款經檢視未被破壞：`REQUIRED_METADATA_FIELDS` 存在性檢查在 `src/lib/drift-sources.ts:1802-1805`；`skill`/`grade`/`result` 的 trim 由 `str()` helper 統一提供（`src/lib/drift-sources.ts:1831`，抽成共用後 `isVerify`/`isPass` 兩路都吃到，未退化）；legacy `result ∈ {S,A}` fallback 保留在 `src/lib/drift-sources.ts:1841`；non-mapping parse 視為全欄位缺失、不 deref null 在 `src/lib/drift-sources.ts:1792-1801`；無 `.prospec/changes/` → `available:false` 帶 reason 在 `src/lib/drift-sources.ts:1781-1787`。`evaluateMetadataCompleteness` 與 check id 未被本次 diff 觸及。

`findLast` 需要 ES2023：`tsconfig.json` 為 `target: es2023` / `lib: ["es2023"]`，`pnpm typecheck`（涵蓋 `src/` + `tests/` + `scripts/`）乾淨通過。

行為斷言：`tests/unit/lib/drift-sources.test.ts:1711`（verified 最新 B、較早 S → `missing_verify_grade: true`）、`:1722`（同一份 log 以 archived 讀 → false）、`:1733`（verified 唯一一筆 S → false）、`:1743`（verified 空 log／無 verify 條目 → true）。

## REQ-TESTS-071: Generated-artifact exclusion and digest-boundary coverage — PASS

六條 bullet 逐條對上：

1. 只提交已宣告的生成物 → `last_src_commit` 停在 06-10：`tests/unit/lib/drift-sources.test.ts:1150`。
2. 設定為空／缺席 → 不排除任何路徑，該路徑被當成人寫原始碼（`last_src_commit` 移到 06-12 且 stale）：`tests/unit/lib/drift-sources.test.ts:1140`。這就是取代寫死常數的負向斷言。
3. 之後提交人寫原始碼且未更新知識 → 仍 stale：`tests/unit/lib/drift-sources.test.ts:1173`（另有 `:1186` 釘住混合 commit）。
4. 同一生成物被編輯 → `computeChangeDigest` 改變，且與排除測試同檔並列：`tests/unit/lib/drift-sources.test.ts:1451`。
5. 排除 pathspec 的 capture 被注入失敗 → collector 報未排除時間戳而非 null：`tests/unit/lib/drift-sources-git-capture.test.ts:96-112`，並已配合新簽章傳入 `['src/lib/x.ts']`（`:108`），涵蓋 module 唯一原始檔，使未排除重試成為唯一的真值路徑；`beforeEach` 於 `:56` 重置 `failExcludePathspec`，避免旗標跨測試殘留。
6. Mutation 主張（把排除或 digest 覆蓋改回去會轉紅）分析上成立：拿掉 `gitLastCommit` 的 `excludes` 分支 → `:1150` 期待 06-10 卻得 06-12 轉紅；把 `if (excluded) return excluded` 改回 `excluded.trim() || null` → `:1162` 的 `last_src_commit` 變 null，`toContain` 直接拋錯轉紅（我已實測 `:(exclude)src/**` 的確產生空結果，故該測試不是碰巧同值而是真的走 fall-through）；若把生成物排除進 `computeChangeDigest` → `:1451` 轉紅。

上述 6 個測試檔（327 tests）與 `tests/contract/skill-format.test.ts`、`tests/integration/skill-contract.test.ts`、`tests/contract/mcp-server.test.ts`（719 tests）我都實跑，全綠。

## REQ-TEMPLATES-171: archive Entry Gate consumes all three provenance checks — PASS

信任區現行文字（`npx tsx src/cli/index.ts spec show drift-detection --req REQ-TEMPLATES-171`）確實寫著「`hasVerifyGrade` accepts any earlier S/A entry ... leaves both `status` and `metadata-completeness` green」，與本變更後的程式碼相反，因此把它列為 MODIFIED 是正確且必要的（不列就會在信任區永久留一條與碼相反的敘述）。

- Bullet 4（本次改寫的那條）已落地：`src/templates/skills/prospec-archive.hbs:32` 的 Entry Gate 項目改為「`status` will not say so — but `metadata-completeness` will: for a `verified` change it reads only the LATEST `/prospec-verify` entry, so an earlier S/A no longer covers a B/C/D re-verify」；已 bundle（`src/lib/bundled-templates.ts` 內含該句）並同步到兩份出貨副本 `.claude/skills/prospec-archive/SKILL.md:47`、`.agents/skills/prospec-archive/SKILL.md:47`。而「`metadata-completeness` 會回報」這件事本身由 REQ-LIB-025 的碼實現（`src/lib/drift-sources.ts:1844-1849`）並由 `tests/unit/lib/drift-sources.test.ts:1711` 釘住，所以這條 bullet 的兩半都有支撐。
- Bullet 1/2/3/5（三檢查任一 FAIL 即拒、`delta-spec-provenance` 指向 landing block、全 PASS/skipped 則放行、CLI 缺席由探針 STOP）皆為前一變更既有內容，未被本次 diff 破壞，且由 `tests/contract/skill-format.test.ts:4428-4459` 的 marker 清單釘住（該測試實跑通過）。

記錄一項不構成違反的觀察：該 contract test 的 marker 清單未隨這次改寫加入新句的任何 marker，其上方註解（`tests/contract/skill-format.test.ts:4450-4452`）仍以「`quality_log` keeps the earlier S/A entry」為理由——該敘述本身仍為真（log 的確保留該筆），只是不再是「沒有機器檢查會說」的理由。REQ-TEMPLATES-171 未含任何測試釘住的 bullet，故不扣分，但這新句在 archive 樣板側同樣是無測試保護的。

## REQ-TEMPLATES-173: review and verify are re-enterable from `verified` — WARN

- Bullet 1（floor：`implemented` 或更後，含 `verified`）與 Bullet 2（`/prospec-review` Error Handling 以「BEFORE `implemented`」為拒絕條件，並列舉 `story`/`plan`/`tasks`）為既有內容，由 `tests/contract/skill-format.test.ts:4465-4488` 釘住（含「`metadata status not \`implemented\``」不得回歸的負向斷言），實跑通過。
- Bullet 3（B/C/D 重入時 `status` 停在 `verified`，而 `metadata-completeness` 依最新評級轉紅，兩者共同說明不可封存）已落地於四個地方：`src/templates/skills/prospec-verify.hbs:345-347`、`src/templates/init/status-lifecycle.md.hbs:51`、`prospec/ai-knowledge/_status-lifecycle.md:51`，以及出貨副本 `.claude/skills/prospec-verify/SKILL.md:379-381` 與 `.agents/skills/prospec-verify/SKILL.md:379-381`；`src/lib/bundled-templates.ts` 內 "reads only the LATEST" 出現 3 次（archive.hbs / verify.hbs / status-lifecycle.md.hbs），bundle 已同步。行為面由 REQ-LIB-025 的碼與 `tests/unit/lib/drift-sources.test.ts:1711` 支撐。兩份 `_status-lifecycle.md` 內容一致（template 與 repo 副本同句）。
- Bullet 4（「WHEN either lifecycle copy omits the re-entry facts, THEN the contract test fails」）—— **這是 WARN 的來源**。現行的 lifecycle 雙副本 contract test 在 `tests/contract/skill-format.test.ts:4501-4519`，它釘的是前一變更的兩個事實：`re-entering after a post-verify edit stays \`verified\`` 的正向 marker、`leaves \`status\` unchanged (stays \`implemented\`)` 的負向 marker，以及 `re-runs **after** \`verified\``。本次新增的第三個 re-entry 事實（`metadata-completeness` 只讀最新一筆 verify、`archived` 保留 any-entry 讀法）**沒有任何 marker 釘住**：我對 `tests/` 全域 grep `reads only the LATEST`／`any-entry reading`／`turns it red until a fresh` 皆為零命中。同理，`tests/contract/skill-format.test.ts:4490-4499` 的 verify 側 marker 清單（`already-\`verified\` change, "unchanged" means it stays \`verified\``、`status never regresses`、`NOT archivable`）也未加入新句。後果是：把這三份樣板（含兩份 lifecycle 副本）裡的新句整段刪掉或改回舊的「neither `status` nor `metadata-completeness`」，整個測試套件仍會全綠——而 bullet 4 正是把 contract test 指定為 lifecycle 副本內容的執行機制。判為 WARN 而非 FAIL，是因為 bullet 4 字面上說的「the re-entry facts」整體仍受既有 marker 保護（副本若整段缺席仍會轉紅），只有本次新增的那一項落在保護之外。

## REQ-TYPES-082: generated_artifacts config field — PASS

`src/types/config.ts:175` 新增 `generated_artifacts: z.array(z.string()).optional()`，位置與寫法都與同排的 `additional_core_conventions`（`src/types/config.ts:171`）一致，對既有 `knowledge` 形狀是純新增。

- Bullet 1（存在時解析為 glob 字串陣列）：`.prospec.yaml:22-23` 的 dogfood 宣告 `- src/lib/bundled-templates.ts` 經 `tests/unit/services/check.service.test.ts:97` 的等價 fixture 實證可解析並生效；`tests/unit/services/mcp.service.test.ts:378` 以 `['src/gen/**']` 斷言值原樣傳到 collector。
- Bullet 2（缺席時每個消費端讀成 `[]`）：兩個消費端皆為 `?? []`（`src/services/check.service.ts:183`、`src/services/mcp.service.ts:365`），schema 端刻意不用 `.default([])`。這個取捨的理由在 Description 已寫明，而且可驗證：`pnpm typecheck` 通過，代表帶 `knowledge` 物件的具型別 `ProspecConfig` 字面值（含 `prospec init` 的那個）沒有被迫補上該欄位。
- Bullet 3（既有 `.prospec.yaml` 省略此欄位仍可解析、無具型別建構點被迫具名）：`ProspecConfigSchema` 以 `.loose()` 收尾（`src/types/config.ts:207`），`KnowledgeSchema` 本身 `.optional()`；`tests/contract/mcp-server.test.ts:92,156` 與 `tests/unit/services/mcp.service.test.ts:81` 都只給 `{ version, project }`（無 `knowledge`）即可建構 `McpServerContext`，實跑通過。

## REQ-SERVICES-088: Spec-sync section anchors match headings, not bare strings — PASS

前提事實已核對：`prospec/specs/features/drift-detection.md:619` 與 `:621` 各自在 US-15 的驗收 bullet 內以行內程式碼引用 `## Edge Cases`，真正的 `## Edge Cases` 標題在 `:731`；`:621` 也引用 `## Deprecated Requirements`（另有 `:614`、`:648`），真正的標題在 `:755`。子字串比對確實會命中引用而非標題。

- Bullet 1（ADDED 路徑）：`src/services/archive.service.ts:2182` 改為 `const insertBefore = /^## Edge Cases[ \t]*$/m`，`:2188` 用 `.test()`，`:2192` 用 `content.replace(insertBefore, (heading) => newReq + '\n' + heading)`。迴歸測試 `tests/unit/services/archive-spec-body.service.test.ts:230-290`：fixture 讓引用出現在真標題之前，斷言引用 bullet 與其相鄰 bullet 原文完整保留（`:275-278`）、新 REQ 位在引用之後且真標題之前（`:280-286`）、真標題恰好一個（`:288`）、引用仍在標題之前（`:289`）。
- Bullet 2（REMOVED 路徑）：`src/services/archive.service.ts:2213` 的 `_(None)_` 分支改為 `/^## Deprecated Requirements\r?\n\r?\n_\(None\)_/m`，`:2219` 的既有區段分支改為 `/^## Deprecated Requirements[ \t]*$/m`，`:2221` 以 `(heading) => \`${heading}${deprecatedEntry}\`` 回填。迴歸測試 `tests/unit/services/archive-spec-body.service.test.ts:292-337`，斷言方式與 ADDED 路徑對稱（引用段落完整、標題數 1、退役條目落在真標題之後）。
- Bullet 3（兩個標題都不存在時退回既有 fallback）：`src/services/archive.service.ts:2196`（新 REQ 附加檔尾）與 `:2225`（整段新建 Deprecated 區段）維持原樣，既有覆蓋在 `tests/unit/services/archive.service.test.ts:682-704`（`_(None)_` 路徑，含 `$&` 描述）與 `:771-779`（既有 Deprecated 區段）仍全綠。
- Bullet 4（任一錨點退回子字串比對 → 對應迴歸測試轉紅）分析上成立：ADDED 側退回 `content.replace('## Edge Cases', ...)` 會把新 REQ 塞進引用 bullet 中間，`:275-278` 的 `toContain`（要求引用 bullet 與其下一行原文相連）立刻失敗；REMOVED 側退回子字串會同時打破 `:329-332` 的 `toContain` 與 `:335-336` 的 `entry > depHeading` 順序斷言。
- Spec 另一句「function replacer is retained in every branch」逐分支確認：`:2192`、`:2215`、`:2221` 三處皆為函式 replacer，檔尾 fallback 為字串串接不經 `replace`，`$&`/`$1`/`$$` 不會被展開。
- 附帶觀察（非發現）：改用 regex 後 `_(None)_` 分支在 CRLF 檔案上也會命中（原本的 `includes('...\n\n_(None)_')` 不會），寫回的仍是 LF。這是行為擴張而非退化，REQ 未涉及行尾議題。

## REQ-TESTS-084: hasVerifyGrade timeline-aware coverage — PASS

四條驗收條件逐條有測試，全部落在 `tests/unit/lib/drift-sources.test.ts` 的 `collectMetadataCompleteness` describe：

1. 最新 `prospec-verify` 為 grade B、較早為 grade S、status `verified` → `missing_verify_grade: true`（`:1711-1720`，fixture c15）。
2. 同一份 `quality_log` 以 `archived` 檢查 → `false`（`:1722-1731`，fixture c16，與 c15 逐字同構、僅 status 不同，因此確實隔離出 status 這一個變因）。
3. 唯一一筆 `prospec-verify` 為 grade S、status `verified` → `false`（`:1733-1741`，fixture c17）。
4. `quality_log` 為空或無 `prospec-verify` 條目時，`verified` 與 `archived` 皆回 true（即缺 grade）：`verified` 半邊在 `:1743-1756`（c18 空陣列、c19 只有 `prospec-review` 條目），`archived` 半邊在 `:1758-1774`（c20、c21 同形）。Spec 特別要求 `archived` 這半必須也釘，理由是 any-entry 分支正是空 log 可能 fail-open 之處——已釘，且 `src/lib/drift-sources.ts:1845` 的 `.some()` 對空陣列回 false，語意一致。

`hasVerifyGrade` 本身未 export，測試是透過公開的 `collectMetadataCompleteness` 間接驅動；這與該檔既有的 c1–c14 測試慣例一致，且 `missing_verify_grade` 是該函式唯一的可觀察輸出，故仍屬有效釘住。

## 執行紀錄

- `npx vitest run tests/unit/lib/drift-sources.test.ts tests/unit/lib/drift-sources-git-capture.test.ts tests/unit/services/check.service.test.ts tests/unit/services/mcp.service.test.ts tests/unit/services/archive-spec-body.service.test.ts tests/contract/generated-artifacts-single-source.test.ts` → 6 files / 327 tests 全綠。
- `npx vitest run tests/contract/skill-format.test.ts tests/integration/skill-contract.test.ts tests/contract/mcp-server.test.ts` → 3 files / 719 tests 全綠。
- `pnpm typecheck`（`tsconfig.typecheck.json`，涵蓋 tests/ 與 scripts/）→ 無錯誤。
- 全程唯讀：未執行任何 `git checkout`/`stash`/`restore`/`clean`/`reset`，未編輯任何 repo 檔案，未跑 `prospec verify record` 或 `prospec check --record-tests`；工作區檔案清單前後一致（30 個 modified）。
<!-- prospec:evidence-end -->

<!-- prospec:evidence constitution -->
### constitution — WARN

**Summary:** 8 條規則 1:1 稽核：7 條 PASS、1 條 WARN——[SHOULD] User-Facing Documentation Stays Current 被違反，新增的設定鍵 knowledge.generated_artifacts 在兩份根 README 皆缺席，而同層的 additional_core_conventions 在兩份 README 都有完整散文說明與 YAML 範例。其餘規則皆有機器或實測證據。
**Repro:** `grep -c 'generated_artifacts' README.md README.zh-TW.md; grep -n 'additional_core_conventions' README.md README.zh-TW.md | head -2`

以 prospec-report.json 的 structural.constitution.rules[] 為清單逐條稽核（共 8 條），嚴重度一律取自清單、未自行改派。

**1. [MUST] Language Policy — PASS**
`artifact-language` 檢查 PASS。delta-spec.md 1262 個中日韓字元，Before/After/Reason 為繁中、`**Spec:**` 區塊為英文；proposal/plan/tasks/review.md 皆繁中；信任區（`prospec/ai-knowledge/**`、`src/templates/**`、`prospec/specs/features/**`）維持英文。兩條 ADDED REQ 的 Description/Acceptance Criteria 改為繁中，其英文 `**Spec:**` 區塊才是落地載體——以已封存的 2026-08-10-feature-spec-sub-modules 為前例實測確認：其英文 Spec 落在 knowledge-reader.md:28，繁中 Description 未進入信任區。

**2. [MUST] Atomic Commits and Format Requirements — PASS（附提醒）**
本變更尚無任何 commit（commit 邊界正是本 S/A 閘門），故無違反事實。提醒：本變更現含三個關注點（US-1 設定化排除、US-2/3 hasVerifyGrade、US-4 archive 錨點），要滿足「一個 commit 一個關注點」需在 commit 提示時拆為 ≥2 個 commit；此為對尚未發生步驟的指引，不計為違反。

**3. [MUST] User Stories Follow INVEST — PASS**
四條 US 逐條檢核六準則：US-1（設定化排除）、US-2（最新一筆判準）、US-3（archived 作用域）、US-4（封存插入點）各自 Independent（可獨立交付）、Negotiable、Valuable、Estimable、Small、Testable（皆有 Acceptance Scenarios 與 Independent Test）。附註：proposal.md 的 Constitution Check 自檢文字仍寫「兩個 US」，未隨 US-4 更新——屬工件陳述過時，非 INVEST 違反。

**4. [MUST] Test-Driven Development — PASS**
每項行為變更皆附測試，且多數經 mutation 驗證（服務接線硬寫 [] 使兩條新測試轉紅；gitLastCommit 折成 null 使 fallback 測試轉紅；archive 兩個錨點退回子字串比對各使對應迴歸測試轉紅；archived 分支 fail-open 使新增的空 quality_log 測試轉紅）。實跑 `pnpm test:coverage`：statements 94.48%、branches 89.6%、functions 95.08%、lines 95.02%，全數 ≥ 80% 門檻。

**5. [SHOULD] One-way Dependency Direction — PASS**
`import-direction` 檢查 PASS。變更涉及 types/lib/services 三層：lib/drift-sources.ts 只向下引用 types/config.js；services/mcp.service.ts 以 type-only import 取用 types/config.js；無任何上行或循環引用。

**6. [SHOULD] User-Facing Documentation Stays Current — WARN（違反，SHOULD 權重）**
本變更新增使用者面向的設定鍵 `knowledge.generated_artifacts`，但 README.md 與 README.zh-TW.md 皆未記載。對照組明確：同一層的 `knowledge.additional_core_conventions` 在 README.md:767 與 README.zh-TW.md:734 都有整段散文說明，並在 README.md:794／README.zh-TW.md:761 的 YAML 範例中列出。兩份 README 對新鍵皆為零命中。補救：在兩份 README 的 knowledge 設定鍵段落各補一條說明與範例（雙語同步落地）。此為審查階段列為 major 的 F-13，未修而帶到此處。

**7. [MUST] Factual Count Integrity — PASS**
`pnpm counts` 已重跑，`counts:check` 回報 in sync。第三層手維護計數無欠項：本變更未新增或移除模組原始碼檔案（模組 README 的 (N files, N lines) 標頭不變）、未新增 DRIFT_CHECK_IDS 條目（根 README 的檢查列舉不變）、REQ 尚未畢業（feature spec frontmatter 的 story_count/req_count 於 archive 才變動）。

**8. [MUST] Pre-Merge CI Checks — PASS**
六項逐一實跑：`pnpm lint` exit 0；`pnpm typecheck` exit 0；`pnpm test:coverage` exit 0 且覆蓋率如上；`pnpm counts:check` in sync；`pnpm agents:check` 回報 templates → bundle → deployed 104 檔皆為最新；`prospec check --strict` exit 0（17/17 檢查，0 fail、2 warn）。其中兩個 warn 為 `knowledge-size`（既有 L2/spec 檔案超預算）與 `unjustified-budget-override`；後者經比對 HEAD 版 .prospec.yaml 確認結構相同，屬既有狀態，非本變更引入。
<!-- prospec:evidence-end -->

<!-- prospec:evidence design -->
### design — not-applicable

**Summary:** proposal.md 的 UI Scope 為 none，且無 design-spec.md，本維度不適用。
**Repro:** `grep -A2 '^## UI Scope' .prospec/changes/configurable-generated-artifacts/proposal.md; ls .prospec/changes/configurable-generated-artifacts/design-spec.md 2>&1`
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->
