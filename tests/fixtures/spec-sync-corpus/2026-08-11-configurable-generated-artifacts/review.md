# Review Findings: configurable-generated-artifacts

| ID | Location | Severity | Lens | Status | Summary | Repro |
|---|---|---|---|---|---|---|
| F-1 | tests/unit/lib/drift-sources-git-capture.test.ts:97 | critical | correctness | fixed | collectGitTimestamps 新增第 4 參數時漏掃這個呼叫點（只傳 3 個引數，pnpm typecheck 報 TS2554）；且因 gitLastCommit 的 excludes 預設為 []，即使補上 [] 也不會產生任何 :(exclude) argv，failExcludePathspec 這個 fault injection 永遠不會觸發——REQ-TESTS-071「fault-injected 時回報未排除時間戳而非 null」的唯一釘子變成恆真式，刪掉 gitLastCommit 的 fallback 分支測試仍全綠。 | pnpm typecheck 2>&1 \| grep 'drift-sources-git-capture'; sed -n '1331,1344p' src/lib/drift-sources.ts |
| F-2 | src/types/config.ts:175 | critical | spec-architecture | fixed | generated_artifacts 用 z.array(z.string()).optional().default([])，.default() 使該欄位在 z.infer 的 output type 成為必填，於是每個具型別的 ProspecConfig 字面值都編譯失敗——包含生產碼 src/services/init.service.ts:124 以及三個測試 fixture，佔 typecheck 6 個錯誤中的 4 個；同排的 additional_core_conventions 只用 .optional() 且兩個消費端都已寫 ?? []，此 .default() 另會把 generated_artifacts: [] 寫回使用者的 .prospec.yaml。 | sed -n '170,177p' src/types/config.ts; pnpm typecheck 2>&1 \| grep "generated_artifacts' is missing" |
| F-3 | tests/contract/mcp-server.test.ts:150 | critical | parallel-site | fixed | McpServerContext 新增必填欄位 config 時，本檔案裡這個 inline 物件字面值沒有一起更新（writeFixtureProject 那條路徑有補、這條沒有），pnpm typecheck 報 TS2345 Property 'config' is missing。 | pnpm typecheck 2>&1 \| grep 'mcp-server.test.ts(150' |
| F-4 | src/lib/drift-sources.ts:1825 | critical | correctness | fixed | hasVerifyGrade 重構把原本已具型別的 narrowing（entry as { skill?: unknown; result?: unknown; grade?: unknown }）換成三個 (entry as any)，加上兩個測試 fixture 的 as any，使 pnpm lint 出現 5 個 @typescript-eslint/no-explicit-any 錯誤而 exit 1；Constitution [MUST] Pre-Merge CI Checks 明列 lint 為必過閘門。 | pnpm lint 2>&1 \| tail -12 |
| F-5 | src/templates/skills/prospec-verify.hbs:345 | critical | docs-claims | fixed | 三個出貨模板（prospec-verify.hbs:345、prospec-archive.hbs:32、init/status-lifecycle.md.hbs:51）仍敘述 hasVerifyGrade 舊的 .some()「歷史上曾拿過 S/A 即可」語意，而本變更已把 verified 改為只看最新一筆——這些文字已隨 bundle 部署到 .claude/ 與 .agents/ 的 SKILL.md，且 templates 模組不在 related_modules，沒有任何後續站點會修正它。 | grep -rn "earlier S/A entry" src/templates .claude/skills .agents/skills prospec/ai-knowledge/_status-lifecycle.md |
| F-6 | prospec/specs/features/drift-detection.md:557 | critical | spec-architecture | fixed | 已畢業的 REQ-TEMPLATES-171（與 US-14 驗收條件 :542）明文斷言 metadata-completeness 接受任何較早的 S/A 條目，本變更把 verified 的語意反轉後該 REQ 即為偽，但 delta-spec.md 完全沒有把它列為 MODIFIED（grep 計數為 0），archive 的 REQ 畢業只搬本變更列出的 REQ，因此這個矛盾不會被任何後續站點收斂。 | grep -c 'REQ-TEMPLATES-171' .prospec/changes/configurable-generated-artifacts/delta-spec.md; grep -n 'accepts any earlier S/A' prospec/specs/features/drift-detection.md |
| F-7 | tests/unit/lib/drift-sources.test.ts:1136 | critical | test-quality | fixed | US-1 的核心接線（check.service 與 mcp.service 把 config.knowledge.generated_artifacts 傳給 collector）完全沒有測試釘住：mutation 把 src/services/check.service.ts:183 與 src/services/mcp.service.ts:365 兩處都改成硬寫 []（等同整個功能失效）後，全部 3762 個測試仍然全綠；測試只直接呼叫 collector 並自行傳參，從未驗證 service 真的讀了設定。 | grep -rn 'generated_artifacts' tests/ \| grep -v drift-sources.test |
| F-8 | src/lib/drift-sources.ts:1337 | critical | security | fixed | gitLastCommit 在排除後查詢成功但結果為空時回傳 null（excluded.trim() \|\| null），而 isStale 把 null 讀成「不 stale」；把排除集合從一條稽核過的固定路徑改成使用者可寫的任意 glob 後，一個涵蓋整個模組的設定值（例如 src/**）會讓該模組永久不 stale——這正是 proposal 邊界案例與 PB-013 要求「降級為較吵但真實」而非靜默跳過的 fail-open。 | cd "$(mktemp -d)" && git init -q && mkdir -p src/lib && echo x > src/lib/a.ts && git add -A && git -c user.email=a@b -c user.name=a commit -qm i && echo "unexcluded=[$(git log -1 --format=%cI -- src/lib)] all-excluded=[$(git log -1 --format=%cI -- src/lib ':(exclude)src/**')]" |
| F-9 | prospec/index.md:31 | critical | spec-architecture | fixed | 本變更新增/移除測試後未重跑 pnpm counts，19 個事實計數在 README.md、README.zh-TW.md、prospec/index.md、module-map.yaml、modules/tests/README.md 之間漂移（tests.total 3762→3766、unit 2800→2805、contract 832→831），pnpm counts:check exit 1；Constitution [MUST] Factual Count Integrity 與 [MUST] Pre-Merge CI Checks 都明列此閘門。 | pnpm counts:check 2>&1 \| tail -5 |
| F-10 | prospec/ai-knowledge/modules/lib/drift-engine.md:45 | major | parallel-site | proposed | lib 模組 README 仍記載已刪除的 GENERATED_SOURCE_ARTIFACTS 符號與隨之失效的 recipe（:13、:27、:45）；因 lib 在 related_modules 內，_status-lifecycle.md 的 verify S/A commit 提示與 archive Entry Gate 這兩個後續站點涵蓋它，故列 major 而非 critical。 | grep -n 'GENERATED_SOURCE_ARTIFACTS' prospec/ai-knowledge/modules/lib/drift-engine.md |
| F-11 | src/templates/references/config-example.yaml.hbs:52 | major | docs-claims | proposed | 唯一的使用者面向文件把 generated_artifacts 描述為「repository-root-relative, posix-formatted paths」，delta-spec 與 proposal 則一致稱其為 glob 陣列；glob 語意經實測確實成立（git 預設 pathspec 套用 wildmatch），但既無文件說明也無測試釘住，且被刪除的契約測試中那條字面路徑形狀斷言沒有任何替代品。 | sed -n '49,58p' src/templates/references/config-example.yaml.hbs; grep -n 'glob' .prospec/changes/configurable-generated-artifacts/delta-spec.md |
| F-12 | src/templates/references/config-example.yaml.hbs:55 | major | docs-claims | proposed | 範例值 dist/bundle.js 在典型的 prospec 專案中位於 .gitignore 之下，從未被 git 追蹤，因此永遠不會出現在 last_src_commit 的 pathspec 裡——這個示範對讀者而言是無效示例，無法示範此設定鍵真正要解決的問題（被追蹤的生成檔）。 | sed -n '52,56p' src/templates/references/config-example.yaml.hbs; grep -n 'dist' .gitignore |
| F-13 | README.md:757 | major | docs-claims | proposed | 兩份根 README 都逐條列舉 knowledge 區塊的設定鍵，卻都沒有新增的 generated_artifacts；Constitution [SHOULD] User-Facing Documentation Stays Current 要求使用者面向介面在同一變更內同步更新雙語 README（該規則為 SHOULD，故列 major）。 | sed -n '750,765p' README.md; sed -n '718,730p' README.zh-TW.md |
| F-14 | .prospec/changes/configurable-generated-artifacts/plan.md:52 | major | docs-claims | proposed | plan.md 的 Call Chain 與 tasks.md 的兩條任務都指名一個不存在的函式 collectKnowledgeHealth（實際被改的是 collectGitTimestamps），使規劃工件與落地程式碼對不上，後續讀者依 plan 追蹤呼叫鏈會落空。 | grep -rn 'collectKnowledgeHealth' .prospec/changes/configurable-generated-artifacts/ src/ \| head |
| F-15 | tests/unit/lib/drift-sources.test.ts:1732 | major | test-quality | fixed | REQ-TESTS-074 驗收條件 4 要求「quality_log 為空或無 prospec-verify 條目時，不論 status 一律回傳 false」，但新測試只涵蓋 verified 這一半；mutation 在 archived 分支加入 fail-open（若無任何 prospec-verify 條目即回傳 true）後測試仍全綠。 | pnpm vitest run tests/unit/lib/drift-sources.test.ts -t 'empty quality_log or no prospec-verify entries' |
| F-16 | tests/contract/generated-artifacts-single-source.test.ts:1 | major | test-quality | proposed | 契約測試改寫後的檔頭宣稱 BUNDLED_TEMPLATES_SOURCE 被用於 .prospec.yaml 的 generated_artifacts 排除，但沒有任何斷言把兩者綁在一起——.prospec.yaml 是這條路徑的第二份手抄本；mutation 把 .prospec.yaml 的值改成不存在的 src/lib/MOVED-bundled-templates.ts 後 871 個契約測試仍全綠，正是舊檔頭警告的「沒人知道要改的第二處手抄編輯」。 | sed -n '1,19p' tests/contract/generated-artifacts-single-source.test.ts; sed -n '20,24p' .prospec.yaml |
| F-17 | src/types/config.ts:175 | major | test-quality | proposed | REQ-TYPES-082（原編號 REQ-TYPES-076）的三條驗收條件（陣列解析、缺省為 []、既有 .prospec.yaml 無此欄位仍可解析）沒有任何一條有對應測試，schema 變更完全未被覆蓋。 | grep -rn 'generated_artifacts' tests/unit/lib/config.test.ts \|\| echo 'NO COVERAGE' |
| F-18 | src/lib/drift-sources.ts:1837 | major | maintainability | proposed | 「取最新一筆 prospec-verify 條目」這個判準現在同時存在於 hasVerifyGrade 與 src/services/status.service.ts:116-127，兩處語意不一致且無共用 helper，違反 PB-006 單一來源常數/判準的教訓，日後修改其一必然漏改另一。 | sed -n '1830,1842p' src/lib/drift-sources.ts; sed -n '112,130p' src/services/status.service.ts |
| F-19 | src/lib/generated-artifacts.ts:1 | major | docs-claims | proposed | 檔案頂端的 docblock 仍以「registry」的語彙描述已被刪除的 GENERATED_SOURCE_ARTIFACTS 行為，而檔案現在只剩一個 build 常數 BUNDLED_TEMPLATES_SOURCE，註解與實際內容不符。 | sed -n '1,20p' src/lib/generated-artifacts.ts |
| F-20 | src/services/mcp.service.ts:70 | major | spec-architecture | proposed | check.service 只把所需的 generated_artifacts 值注入 collector，mcp.service 卻把整個 ProspecConfig 塞進 McpServerContext，兩個平行站點對同一份設定採取不一致的注入粒度，並因此讓 McpServerContext 多出一個必填欄位而波及所有 fixture。 | sed -n '63,74p' src/services/mcp.service.ts; sed -n '180,186p' src/services/check.service.ts |
| R2-1 | .prospec/changes/configurable-generated-artifacts/delta-spec.md:92 | critical | spec-architecture | fixed | 兩個 ADDED REQ ID 都撞到同一份 feature spec 內的現役需求（REQ-TYPES-076 在 drift-detection.md:642、REQ-TESTS-074 在 :660，皆 2026-08-06 畢業）；archive 對 ADDED 一律走插入分支，實跑 syncToFeatureSpecs 會長出兩個同 ID 區塊且所有 worklist 皆空，插入點還誤命中 :619 行內程式碼片段中的 ## Edge Cases 字樣而截斷既有驗收情境。已改號為 REQ-TYPES-082 / REQ-TESTS-084（delta-spec.md 與 tasks.md 共 6 處）。 | grep -n '^#### REQ-TYPES-082\\|^#### REQ-TESTS-084' prospec/specs/features/drift-detection.md \|\| echo 'FIXED: renumbered ids no longer collide' |
| R2-2 | .prospec/changes/configurable-generated-artifacts/delta-spec.md:98 | critical | docs-claims | fixed | F-2 修復自身寫進 REQ-TYPES-082 Description 的兩句全稱理由被本變更程式碼證偽：加回 .default([]) 實測只有 4 個 TS 錯誤且全是帶 knowledge 物件的字面值（F-3 新增的三個 typed 字面值編得過），而無 knowledge 區塊的設定 round-trip 後不會冒出該欄位。此段經 buildDescriptionBody 逐字落入信任區，已改寫為帶限定條件的敘述。 | sed -n '/A schema-level/,/undefaulted/p' .prospec/changes/configurable-generated-artifacts/delta-spec.md |
| F-21 | .prospec/changes/configurable-generated-artifacts/delta-spec.md | critical | spec-architecture | fixed | delta-spec.md 全檔零個中日韓字元（proposal.md 有 1125、plan.md 685、tasks.md 208），亦即每一條 REQ 的 Before/After/Reason 敘事都以英文書寫，違反 Constitution [MUST] Language Policy——該規則只豁免會逐字落入信任區的 **Spec:** 區塊，明文要求「surrounding Before/After/Reason narrative stays in Traditional Chinese (Taiwan)」；prospec check 的 artifact-language 已對本檔報 WARN。此為第一輪四個 lens 全數漏掉的既有缺陷，非本輪修復造成。 | grep -c -P '[\x{4e00}-\x{9fff}]' .prospec/changes/configurable-generated-artifacts/delta-spec.md; prospec check 2>&1 \| grep -A1 'no Traditional Chinese' |
| R4-1 | .prospec/changes/configurable-generated-artifacts/delta-spec.md:133-141 (REQ-TEMPLATES-173 **Spec:** / **Dropped:**) vs prospec/specs/features/drift-detection.md:577-581 | critical | delta-spec fidelity / trust-zone content loss | fixed | F-6 為 REQ-TEMPLATES-173 新寫的 **Spec:** 只有 3 條 bullet，信任區現行 body 有 4 條；第四條 `- WHEN either lifecycle copy omits the re-entry facts, THEN the contract test fails` 既沒被複製、也沒列進 **Dropped:**（Dropped 只列了 B/C/D 那條）。該 bullet 至今為真（tests/contract/skill-format.test.ts:4501 正是它描述的契約測試），archive 會把 **Spec:** 逐字覆蓋整個 body，因此不是被 droppedBehavior 擋下封存、就是永久從信任區抹掉一條真的驗收條件。 | diff <(sed -n '/^#### REQ-TEMPLATES-173:/,/^---$/p' prospec/specs/features/drift-detection.md \| grep '^- WHEN') <(awk '/^### REQ-TEMPLATES-173:/,/^\*\*Priority:\*\*/' .prospec/changes/configurable-generated-artifacts/delta-spec.md \| awk '/^\*\*Spec:\*\*/,/^\*\*Dropped:\*\*/' \| grep '^- WHEN') |
| R4-2 | src/lib/drift-sources.ts:1337-1346 (gitLastCommit fallback) vs .prospec/changes/configurable-generated-artifacts/delta-spec.md:24 (REQ-LIB-039 **Spec:** bullet 4) and :74-81 (REQ-TESTS-071); tests/unit/lib/drift-sources.test.ts:1162 | critical | spec-code contradiction (delta-spec landing block) | fixed | F-8 讓「排除 glob 涵蓋整個模組」時退回未排除的時間戳，但 REQ-LIB-039 的 **Spec:** 第 4 條仍是全稱句「WHEN a configured glob matches files under a module's paths, THEN those files are excluded from the staleness last_src_commit query」——在整模組被涵蓋的情況下該檔案根本沒被排除，reported last_src_commit 就是它的 commit。新測試名稱直接掛 REQ-LIB-039，但該 REQ 的落地文字沒有這個行為；REQ-TESTS-071 也只列了 fault-injection 那條，缺整模組這條。archive 後信任區會留下一條與程式碼相反的全稱句。 | grep -n 'covers the whole module' tests/unit/lib/drift-sources.test.ts; grep -n "THEN those files are excluded from the staleness" .prospec/changes/configurable-generated-artifacts/delta-spec.md |
| R4-3 | prospec/specs/features/drift-detection.md:542 | critical | trust-zone consistency / spec graduation coverage | deferred-to-archive | US-14 驗收情境仍斷言被反轉的舊語意，而 US 層規格文字無畢業載體。使用者裁決為封存時一併手改，已在 tasks.md 立 [M] 任務指名檔案、行號與應同時落地的 REQ-TEMPLATES-171／173 更正。 | grep -n 'leaves both `status` and `metadata-completeness` green' prospec/specs/features/drift-detection.md; grep -n '\[M\] 封存時手改' .prospec/changes/configurable-generated-artifacts/tasks.md |
| R4-4 | prospec/ai-knowledge/modules/lib/drift-engine.md:45 | critical | knowledge-implementation consistency | fixed | lib 的 sub-module 知識檔仍寫著 `GENERATED_SOURCE_ARTIFACTS`（本變更已從 src/lib/generated-artifacts.ts 刪除的 export），並且只描述 F-8 之前的窄規則「an unparsable `:(exclude)` falls back to the unexcluded query」——F-8 已把退回條件擴大到「成功但為空」。本變更已同步 module-map.yaml／index.md／modules/tests/README.md 的計數，唯獨漏掉這份直接描述被改動行為的檔案，且沒有任何 check 會抓到懸空符號。 | grep -n 'GENERATED_SOURCE_ARTIFACTS' prospec/ai-knowledge/modules/lib/drift-engine.md src/lib/generated-artifacts.ts |
| R4-5 | .prospec/changes/configurable-generated-artifacts/delta-spec.md:146-179 (## ADDED — REQ-TYPES-082, REQ-TESTS-084) vs prospec/CONSTITUTION.md:12-21 (Language Policy englishExceptions) and src/services/archive.service.ts:1841-1871 (buildDescriptionBody / landingBody) | critical | constitution compliance (Language Policy) / delta-spec landing contract | fixed | F-21 把三條 MODIFIED 的 Before/After/Reason 譯成繁中，卻讓兩條 ADDED REQ 的 **Description:**／**Acceptance Criteria:** 留在英文。Constitution 的 englishExceptions 只列 `**Spec:**` 一項，這兩個區塊不在豁免內；而 `.prospec/archive` 近 20 個變更 100% 為每條 ADDED REQ 都寫了 `**Spec:**`（英文）並把 Description/AC 寫成繁中，本變更的 ADDED 區 `**Spec:**` 數為 0。根因是缺 `**Spec:**` 才被迫二選一，落地時還會退回 Description fallback，把規劃文字而非 WHEN/THEN 行為敘述搬進信任區。 | awk '/^## ADDED/,0' .prospec/changes/configurable-generated-artifacts/delta-spec.md \| grep -c '^\*\*Spec:\*\*'; for f in .prospec/archive/*/delta-spec.md; do awk '/^## ADDED/,/^## (MODIFIED\|REMOVED\|DEPRECATED)/' "$f" \| grep -c '^\*\*Spec:\*\*'; done \| sort -u |
| R4-6 | tests/unit/lib/drift-sources-git-capture.test.ts:96-110 (comment at lines 98-105) | major | test efficacy / misleading rationale | fixed | F-8 讓「成功但為空」也退回未排除查詢之後，F-1 測試新增的註解「were the injected fault to stop firing — this would read as 'no source commit'」已為偽：實測把 `state.failExcludePathspec` 改成 false，該測試仍然 PASS（因為 `src/lib/x.ts` 是模組唯一檔案，排除查詢成功回空，照樣退回）。測試本身仍非空轉（另一個 mutation 證明它仍能殺掉「capture 失敗折成 null」這個 mutant），但註解宣稱的不變式不成立，會誤導後續維護者以為故障注入是判定性的。 | sed -i '' 's/state.failExcludePathspec = true;/state.failExcludePathspec = false;/' tests/unit/lib/drift-sources-git-capture.test.ts && npx vitest run tests/unit/lib/drift-sources-git-capture.test.ts   # 3 passed — then revert the line |
| R4-7 | tests/unit/lib/drift-sources.test.ts:1171 | major | test efficacy / dead assertion | fixed | 新測試第二行斷言 `expect(libHealth(['src/**'])?.last_src_commit).not.toBeNull()` 是死重量：它永遠不會失敗——前一行 `.toContain('2026-06-10')` 對 null 早就會炸，而實測 mutation 讓值變成空字串時，`.toContain` 轉紅但 `.not.toBeNull()` 依然通過。它讓測試看起來多釘了一個「不得為 null」的保證，實際上一個 mutant 都沒多殺，還額外跑一次 git fixture。 | perl -pi -e "s/    if \\(excluded\\) return excluded;/    if (excluded !== undefined) return excluded;/" src/lib/drift-sources.ts && npx vitest run tests/unit/lib/drift-sources.test.ts   # toContain fails, not.toBeNull passes — then revert |
| R5-1 | src/services/archive.service.ts:2179 | critical | Trust-zone integrity / archive landing position | fixed | ADDED 插入點已改為行首標題錨定 /^## Edge Cases[ \t]*$/m，並補上迴歸測試與 REQ-SERVICES-088；獨立驗證確認新錨點在 drift-detection.md 命中 :731 真標題而非 :619 行內引用，實跑 syncToFeatureSpecs 對真實信任區副本驗證 :619 保持逐位元組不變、無重複 REQ id。 | grep -nE '^## Edge Cases[ \t]*$' prospec/specs/features/drift-detection.md; pnpm vitest run tests/unit/services/archive-spec-body.service.test.ts -t 'inserts before the Edge Cases HEADING' |
| V-1 | src/services/archive.service.ts:2216-2221 (moveReqToDeprecated); live victim prospec/specs/features/sdd-workflow.md:1076 (real heading :1948) | critical | Trust-zone integrity / incomplete fix (same defect class left open in the same function family) | fixed | moveReqToDeprecated 的 `## Deprecated Requirements` 兩個插入點帶著與 ADDED 路徑完全同型的子字串錨點未修（PB-007 平行站點漏掃），而 drift-detection.md:621 正是在 bullet 中引用該標題，故 REMOVED 需求今天就會被插進該 bullet 中間。兩個分支已改為行首標題錨定，並補上獨立的迴歸測試；mutation 退回子字串比對時該測試轉紅。 | S=/tmp/v1; rm -rf $S; mkdir -p $S/ad $S/f; cp prospec/specs/features/sdd-workflow.md $S/f/; printf '## REMOVED\n\n### REQ-SERVICES-064: x\n\n**Feature:** sdd-workflow\n**Story:** US-6\n\n**Reason:**\nprobe\n\n---\n' > $S/ad/delta-spec.md; printf "import{syncToFeatureSpecs}from'$PWD/src/services/archive.service.js';await syncToFeatureSpecs('$S/ad','$S/f','p',false);" > $S/r.mts; npx tsx $S/r.mts; sed -n '1076,1077p' $S/f/sdd-workflow.md   # bullet split, entry buried in the code span |
| V-2 | src/services/archive.service.ts:2182 (insertBefore regex, no fence masking) vs src/templates/skills/references/feature-spec-format.hbs:98-103 | major | correctness residual / single-source (read side is fence-masked, write side is not) | proposed | 新錨點只做行首/行尾比對，沒有 fence masking：feature spec 若在 ```markdown 圍籬區塊裡引用自己的 scaffold（feature-spec-format.hbs:98-103 正是規定用這個形狀寫），圍籬內的 `## Edge Cases` 位於行首、會先被命中，新 REQ 被塞進 code block 內部——同樣靜默。archive.service.ts 已經 import withoutFencedBlocks/hasUnclosedFence，read side（US-15）也早就用 fence-masked 視角，這裡仍是第二套實作，正是 review.md:983 明確建議要收斂的那一點。目前 14 份 spec 皆無圍籬內標題，故不算 live defect。 | npx tsx -e "const re=/^## Edge Cases[ \t]*\$/m;const s=['# f','','#### REQ-A-001: quotes the scaffold','','\`\`\`markdown','## Edge Cases','\`\`\`','','## Edge Cases','','- real'].join('\n');console.log('anchor line',s.slice(0,re.exec(s).index).split('\n').length,'(fence example is 6, real heading is 9)')" |
| V-3 | tests/unit/services/archive-spec-body.service.test.ts:230-285 ('inserts before the Edge Cases HEADING, not an inline-code mention of it') | major | test efficacy / mutation coverage | fixed | ADDED 路徑的迴歸測試有兩個錨點 mutant 存活。已補上「全檔僅一個行首 Edge Cases 標題」與「引用段落仍在標題之前」兩條結構性斷言，並新增 REMOVED 路徑的對應測試。 | perl -pi -e 's{const insertBefore = /\^## Edge Cases\[ \\t\]\*\$/m;}{const insertBefore = /## Edge Cases[ \\t]*\$/m;}' src/services/archive.service.ts && npx vitest run tests/unit/services/archive-spec-body.service.test.ts   # 39 passed = mutant survives; then revert the line |
| V-4 | .prospec/changes/configurable-generated-artifacts/review.md:35 (row R5-1, Status column) | major | artifact fidelity / permanent record | fixed | review.md 在 R5-1 修復落地後仍標記為 escalated。已於本輪 merge 更正為 fixed。 | grep -n '\| R5-1 \|' .prospec/changes/configurable-generated-artifacts/review.md \| grep -o 'escalated'; grep -n 'REQ-SERVICES-088' .prospec/changes/configurable-generated-artifacts/tasks.md |

<!-- prospec:evidence-section -->
## Evidence

<!-- prospec:evidence F-1 -->
### F-1

### [parallel-site / P-1] tests/unit/lib/drift-sources-git-capture.test.ts:97

掃描方式：`grep -rn "collectGitTimestamps" src tests scripts prospec .claude .agents README.md README.zh-TW.md .prospec`。全部呼叫站與判定如下。

src 端兩個消費者皆已更新：`src/services/check.service.ts:183`（傳 `config.knowledge?.generated_artifacts ?? []`）、`src/services/mcp.service.ts:365`（傳 `ctx.config.knowledge?.generated_artifacts ?? []`）。沒有第三個 src 消費者——`collectGitTimestamps` 只由這兩處呼叫，`runChecks` 不自行呼叫，`verify`/`status`/`archive` service 皆無。

測試端：`tests/unit/lib/drift-sources.test.ts` 的 1034、1050、1087、1104、1207、1137（`libHealth` helper）六處全部已補第四參數。`tests/unit/services/mcp.service.test.ts:68` 是 `vi.fn()` mock（`(...a: unknown[])` 可變參數，不受簽名影響，無需改）。`tests/contract/mcp-server.test.ts:4` 只是註解提及。

唯一漏掉的是 `tests/unit/lib/drift-sources-git-capture.test.ts:97`：`const r = collectGitTimestamps(tmpDir, MAP, 'knowledge');`。

這處有兩重缺陷，第二重比 typecheck 更嚴重：
1. 打斷 gate。`pnpm typecheck` 報 `TS2554: Expected 4 arguments, but got 3`，而 `.github/workflows/ci.yml:29` 跑 `pnpm run typecheck`，PR 直接紅。
2. 測試語意被抽空。這個 describe 叫 `generated-artifact exclusion under a pathspec-magic failure`，靠 `state.failExcludePathspec = true` 讓 `:(exclude)` pathspec 解析失敗，驗證 `gitLastCommit` 會退回未排除的查詢（PB-013 的 fail-closed 規則）。但 `src/lib/drift-sources.ts:1334` 的簽名是 `excludes: readonly string[] = []`，傳 `undefined` 會套用預設值 `[]`，於是 `1337: if (excludes.length > 0)` 恆為 false，`:(exclude)` pathspec 從此不會被組出來，`failExcludePathspec` 這個 fixture 旗標永遠不會被觸發。也就是說：即使把第四參數補成 `[]`，這個測試仍是恆真式；要救回它的原意，必須傳一個非空的排除清單（例如 `[BUNDLED_TEMPLATES_SOURCE]`）。這正是 PB-007 2026-07-31 強化段講的「修正只改變缺陷的形狀」——只補 `[]` 讓 typecheck 轉綠，會留下一個永遠不再驗證任何東西的迴歸防護。

---

### [correctness / C-2] tests/unit/lib/drift-sources-git-capture.test.ts:97 with src/lib/drift-sources.ts:1334

tests/unit/lib/drift-sources-git-capture.test.ts:96-101：

      state.failExcludePathspec = true;
      const r = collectGitTimestamps(tmpDir, MAP, 'knowledge');
      expect(r.available).toBe(true);
      expect(r.modules[0]?.last_src_commit).toBeTruthy();

這是整個 repo 唯一守住 REQ-TESTS-071 那條「WHEN the excluded-pathspec capture is fault-injected to fail, THEN the collector reports the unexcluded timestamp rather than null」的測試，它自己的 docblock（tests/unit/lib/drift-sources-git-capture.test.ts:77-85）也寫明「`:(exclude)` is the only pathspec magic here」。

collectGitTimestamps 的簽章在本變更加了必填第 4 參數 generatedArtifacts（src/lib/drift-sources.ts:562-567），這個呼叫點沒跟上。runtime 上 generatedArtifacts 是 undefined，傳進 src/lib/drift-sources.ts:620 的 `gitLastCommit(cwd, entry.paths, generatedArtifacts)`；gitLastCommit 的第 3 參數帶有預設值 `excludes: readonly string[] = []`（src/lib/drift-sources.ts:1334），undefined 會觸發預設值，於是 `if (excludes.length > 0)`（1337）恆為 false，`:(exclude)` argv 永遠不會產生，vi.mock 裡那個 `args.some(a => a.startsWith(':(exclude)'))` 的故障注入（同檔 33-40 行）永遠不會命中。斷言退化成「未排除查詢有回值」，恆真。

實測（用 PATH shim 攔住真 git 並記錄 argv，直接呼叫 production 的 collectGitTimestamps，temp repo 模組 paths=['src/lib']）：
  3-arg call  -> :(exclude) argv emitted = 0
  4-arg call  -> :(exclude) argv emitted = 1

而 `npx vitest run tests/unit/lib/drift-sources.test.ts tests/contract/generated-artifacts-single-source.test.ts tests/unit/lib/drift-sources-git-capture.test.ts` 是 197 passed / 3 files 全綠——測試層完全看不出來；只有 typecheck 會叫（TS2554 Expected 4 arguments, but got 3）。這正是「假綠」：既然 C-1 的 fail-open 就住在同一個函式的相鄰分支，這條唯一的 PB-013 護欄空轉是有實質後果的，不是型別潔癖。

附帶：gitLastCommit 的 `= []` 預設值本身就是這次漏接的遮蔽器——collectGitTimestamps 的新參數是必填（無預設），但它一路傳進一個有預設值的參數，任何漏傳都會靜默降級成「不排除」而不是拋錯。

---

### [spec-architecture / S-2] tests/unit/lib/drift-sources-git-capture.test.ts:97

REQ-TESTS-071 的 **Spec:** 明列兩條：`WHEN the excluded-pathspec capture is fault-injected to fail, THEN the collector reports the unexcluded timestamp rather than null` 與 `WHEN the exclusion or the digest coverage is reverted, THEN mutation verification turns the corresponding test red`。承載這兩條的唯一測試是 `tests/unit/lib/drift-sources-git-capture.test.ts:88-102`（docblock 明寫 REQ-LIB-015 與 PB-013 fail-open 禁令）。`tests/unit/lib/drift-sources.test.ts` 的七個呼叫點都補上了第 4 個引數，唯獨這一個檔案整份沒動。實跑 `npx tsc -p tsconfig.typecheck.json` 得 `tests/unit/lib/drift-sources-git-capture.test.ts(97,17): error TS2554: Expected 4 arguments, but got 3.`。更嚴重的是執行期：vitest 只 transpile 不 typecheck，所以測試照跑，`generatedArtifacts` 是 `undefined`，傳進 `src/lib/drift-sources.ts:620` 的 `gitLastCommit(cwd, entry.paths, undefined)`，而 `gitLastCommit` 簽名（1331-1335 行）是 `excludes: readonly string[] = []`，`undefined` 觸發預設值 `[]`，於是 1337 行的 `if (excludes.length > 0)` 恆假，整段 `:(exclude)` 分支永不執行；測試檔 34-40 行的注入器條件是 `args.some(a => a.startsWith(':(exclude)'))`，因此 `state.failExcludePathspec = true` 完全空轉，第 100 行的 `expect(...last_src_commit).toBeTruthy()` 在任何實作下都成立。我用 mutation 實證：把 `src/lib/drift-sources.ts:1339` 的 `if (excluded !== null) return excluded.trim() || null;` 改成 `if (excluded === null) return null; return excluded.trim() || null;`（即把 fail-safe 退回改回 PB-013 禁止的 fail-open null）。在 /private/tmp/.../scratchpad/mutrepo 的工作樹副本上跑 `npx vitest run tests/unit/lib/drift-sources-git-capture.test.ts` → `Tests 3 passed`（綠）。把 `src/lib/drift-sources.ts` 與 `src/lib/generated-artifacts.ts` 換成 `git show HEAD:` 版本、施加同一個 mutation → `× falls back to the unexcluded timestamp instead of reporting no source commit` / `AssertionError: expected null to be truthy` / `Tests 1 failed | 2 passed`（紅）。所以本變更把 REQ-TESTS-071 明文承諾的 mutation 保護靜默拆掉了。

---

### [test-quality / T-1] tests/unit/lib/drift-sources-git-capture.test.ts:95-101

REQ-TESTS-071 的 bullet：「WHEN the excluded-pathspec capture is fault-injected to fail, THEN the collector reports the unexcluded timestamp rather than null」，其唯一載體是 tests/unit/lib/drift-sources-git-capture.test.ts:95 的 'falls back to the unexcluded timestamp instead of reporting no source commit'。

本變更把 collectGitTimestamps 的簽章從 3 參數改為 4 參數（src/lib/drift-sources.ts:563，generatedArtifacts: readonly string[]，非 optional），但這個測試檔沒有同步更新，第 97 行仍是 `collectGitTimestamps(tmpDir, MAP, 'knowledge')`。

【證據一：instrumentation 證明參數是 undefined】
暫時把 src/lib/drift-sources.ts:620 改成：
  last_src_commit: gitLastCommit(cwd, entry.paths, (() => { if (generatedArtifacts === undefined) throw new Error('PROOF_UNDEFINED_EXCLUDES'); return generatedArtifacts; })()),
執行 `npx vitest run tests/unit/lib/drift-sources-git-capture.test.ts` → 該測試 RED（AssertionError: expected false to be true，r.available 變成 false）。這證明執行期 generatedArtifacts 確實是 undefined。

因為 undefined 會落到 gitLastCommit 的預設參數 `excludes: readonly string[] = []`（src/lib/drift-sources.ts:1333），`excludes.length > 0` 為 false，整個 excluded 分支不進入，argv 裡永遠沒有任何 `:(exclude)` 前綴的字串。而測試的 mock 判斷條件是 `args.some((a) => typeof a === 'string' && a.startsWith(':(exclude)'))`（第 37 行），故 state.failExcludePathspec 這個旗標從頭到尾不會被觸發——測試等同於「在沒有故障注入的情況下呼叫 collector，然後斷言它正常回傳」，是恆真式。

【證據二：mutation 證明它抓不到它存在的理由】
把 PB-013 的 fallback 整段殺掉，src/lib/drift-sources.ts:1339：
  原：if (excluded !== null) return excluded.trim() || null;
  改：return excluded === null ? null : excluded.trim() || null;
這正是該測試 docstring 明言要防的行為（「a git that cannot parse it must still get the noisier-but-true pre-exclusion timestamp」、「folding a pathspec failure into null would silence the staleness check for every module at once」）。
執行 `npx vitest run tests/unit/lib/drift-sources-git-capture.test.ts` → 3 tests passed，GREEN。
再執行 `npx vitest run tests/unit/lib/drift-sources.test.ts tests/unit/lib/drift-sources-git-capture.test.ts` → 195 tests passed，全 GREEN。

結論：整個 repo 沒有任何一條斷言釘住 gitLastCommit 的 fallback 分支。REQ-TESTS-071 的第 5 個 bullet 與第 6 個 bullet（「WHEN the exclusion or the digest coverage is reverted, THEN mutation verification turns the corresponding test red」）在 fault-injection 這一路上都不成立。

【修法】把第 97 行改為 `collectGitTimestamps(tmpDir, MAP, 'knowledge', ['src/lib/x.ts'])`（或任何非空陣列，讓 :(exclude) argv 真的生成），並重跑上述 fallback mutation 確認它會 RED。注意 fixture 只 commit 了 src/lib/x.ts，若把它整個排除掉，unexcluded fallback 才有可區分的回傳值，設計 fixture 時需讓「排除後為空 / 未排除有值」兩態可分。

所有 mutation 均已逐行還原，`git diff | git apply --check --reverse` 通過。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-2 -->
### F-2

### [correctness / C-3] src/types/config.ts:175

src/types/config.ts:175 用了 `.optional().default([])`。`.default()` 作用在輸出型別上：z.infer<typeof KnowledgeSchema> 的 generated_artifacts 變成 `string[]`（必填），不是 `string[] | undefined`。後果有兩層。

型別層（4 個站點，`pnpm typecheck` 現在 grep 到 4 筆 "generated_artifacts' is missing"）：
- src/services/init.service.ts(124,5) — production code，不是測試
- tests/unit/lib/config.test.ts(144,37)
- tests/unit/lib/init-docs.test.ts(85,20)
- tests/unit/lib/language-policy.test.ts(80,50)
（另外兩筆 typecheck error 是 mcp-server.test.ts 的 config 缺漏與 git-capture 的 arity，屬別的根因。）把 4 個地方各補一個 `generated_artifacts: []` 可以讓 typecheck 過，但那正是把「additive」變成「mandatory」的證據，而且 init.service 補完之後 `prospec init` 會在每個新專案的 .prospec.yaml 寫出一個使用者沒要求的空陣列。

行為層（這才是我這個 lens 真正在意的）：src/lib/config.ts:163-181 的 validateConfig 回傳的是 `result.data`，也就是套用過 default 之後的物件。src/services/upgrade.service.ts:171/196 做的是 `const config = await readConfig(cwd)` → `await writeConfig(config, cwd)`，而 writeConfig（src/lib/config.ts:191-212）用 mergeIntoDocument 就地合併回使用者的 YAML。實測（tsx 直接跑 validateConfig + parseYamlDocument + mergeIntoDocument + stringifyYamlDocument）：

  輸入 .prospec.yaml:
    knowledge:
      # my comment
      base_path: prospec/ai-knowledge
  parsed knowledge = {"base_path":"prospec/ai-knowledge","generated_artifacts":[]}
  prospec upgrade 會寫回:
    knowledge:
      # my comment
      base_path: prospec/ai-knowledge
      generated_artifacts: []

也就是說每個既有下游專案只要跑一次 `prospec upgrade`，手維護的設定檔就會被塞進一個從未宣告的鍵。這個 repo 對 writeConfig 的註解特別強調「only changed values are rewritten, so user comments and formatting on untouched lines survive」，就是為了避免動使用者的檔案；`.default([])` 直接破壞這個保證。

正解是拿掉 `.default([])`、只留 `.optional()`：兩個呼叫端（src/services/check.service.ts:183、src/services/mcp.service.ts:365）本來就寫了 `?? []`，語意完全不變。順帶回答「`??` 是否可達／必要」：`knowledge` 本身是 `.optional()`，所以 `config.knowledge?.generated_artifacts` 的型別仍是 `string[] | undefined`，`?? []` 對 knowledge 整段缺席那條路是必要的；但 `.default([])` 讓它在 knowledge 存在的那條路上變成死碼——兩份預設值互相重複，留 `.optional()` 那一份就好。兩個呼叫端讀設定的方式一致（check.service 用 `config`，mcp.service 用 `ctx.config`），這點沒問題。

---

### [parallel-site / P-3] src/services/init.service.ts:124

掃描方式：`grep -rn "as ProspecConfig|satisfies ProspecConfig|: ProspecConfig" src tests scripts`，逐一分辨「建構」與「消費」。

src 端消費站（收 `config: ProspecConfig` 當參數，不建構、不受影響）：`lib/language-policy.ts:45`、`lib/config.ts:32/51/75/89/108/166/192`、`lib/init-docs.ts:50/113`、`services/trigger-localization.ts:23`、`services/check.service.ts:328`、`services/upgrade.service.ts:257/282/313/340/353/397`、`services/mcp.service.ts:70`。**`upgrade.service.ts` 完全不建構 config 字面量**（它只 merge 既有 YAML），所以 orchestrator 提到的「upgrade.service 可能也要改」在這一輪不成立。

src 端唯一建構站：`src/services/init.service.ts:112` 的 `const config: ProspecConfig = { ... }`，其中 `knowledge: { base_path: ... }`（124 行）缺 `generated_artifacts` → `TS2741`。

根因值得寫進工件：`src/types/config.ts:175` 用 `generated_artifacts: z.array(z.string()).optional().default([])`。`.default()` 會讓 zod 的**輸出**型別變成 `string[]`（非 optional），所以每個以 `ProspecConfig` 型別註記的物件字面量都被迫要寫這個欄位。這與同一個 schema 內既有欄位的作法不一致——`additional_core_conventions`、`strategy`、`base_path` 都只用 `.optional()`，沒有 `.default()`，因此不會傳染。實作端其實也沒有依賴這個 default（`check.service.ts:183` 與 `mcp.service.ts:365` 都自己寫了 `?? []`），也就是說 `.default([])` 沒有帶來任何好處，卻製造了 5 個型別破口。把它改成純 `.optional()` 可以一次消掉 P-3 與 P-4 的四個站。

連帶影響（非 typecheck 可見）：一旦在 init.service 補上 `generated_artifacts: []`，`prospec init` 產生的每一份 `.prospec.yaml` 都會多出一個空陣列鍵。這對下游是噪音（預設就是空），且與 README 說的「新初始化專案不含 token_budget 區塊、全部回退預設」的風格不一致；建議用 `...(x.length > 0 ? { generated_artifacts: x } : {})` 或把 schema 改回純 `.optional()`。

---

### [parallel-site / P-4] tests/unit/lib/config.test.ts:144, tests/unit/lib/init-docs.test.ts:85, tests/unit/lib/language-policy.test.ts:80

三個確定的破口（typecheck 逐字輸出）：
- `tests/unit/lib/config.test.ts:144`（`should respect knowledge.base_path override`，139-143 行的 inline config 物件傳給 `resolveBasePaths`）
- `tests/unit/lib/init-docs.test.ts:85`（`honors a relocated knowledge.base_path`，`baseConfig({ knowledge: { base_path: 'docs/kb' } })`）
- `tests/unit/lib/language-policy.test.ts:80`（`resolves a relocated base_dir and knowledge.base_path`，`config({ paths: {...}, knowledge: { base_path: 'docs/kb' } })`）

三者是同一族：都在測 `knowledge.base_path` override 的解析，都用 inline `knowledge: { base_path }` 字面量。

更值得記錄的是**同族但 typecheck 看不見的站**——這正是本 lens 被要求回答「orchestrator 的清單是否完整」的地方。以下站點寫的是同樣不完整的 config，但因為用了 `as ProspecConfig` 型別斷言，tsc 不會報錯：
- `tests/unit/lib/config.test.ts:153`（`{ project: { name: 't' } } as ProspecConfig`）
- `tests/unit/lib/config.test.ts:161`、`:188`
- `tests/unit/lib/config.test.ts:194-195` 的 `cfg()` helper（`({ project, tech_stack }) as ProspecConfig`）
- `tests/unit/lib/init-docs.test.ts:25-32` 的 `baseConfig()` helper（結尾 `}) as ProspecConfig`）
- `tests/unit/lib/language-policy.test.ts:18` 的 `config()` helper

這些站現在不會紅，但它們證明「typecheck 通過」不等於「所有 config 建構站都跟上了」：斷言把型別檢查關掉了。若日後有任何 runtime 程式碼改成直接讀 `config.knowledge.generated_artifacts`（不帶 `?.` 或 `?? []`），這些站會在執行期炸而不是編譯期。目前兩個消費者（`check.service.ts:183`、`mcp.service.ts:365`）都寫了 `?? []`，所以 runtime 安全——但那個 `?? []` 也正好說明 schema 的 `.default([])` 是多餘的（見 P-3）。

---

### [spec-architecture / S-1] src/types/config.ts:175 (consumed at src/services/init.service.ts:124)

REQ-TYPES-076 的 Description 明文寫 `The field is additive to the existing knowledge shape; projects without it behave as if the array is empty`。實作 `src/types/config.ts:175` 寫成 `generated_artifacts: z.array(z.string()).optional().default([])`。Zod 的 `ZodDefault` 會把 output 型別的 `undefined` 剝掉，因此 `z.infer<typeof ProspecConfigSchema>`（= `ProspecConfig`）的 `knowledge.generated_artifacts` 型別變成必填 `string[]`。而本專案的 `ProspecConfig` 同時被當成「parse 輸出型別」與「建構型別」使用：`src/services/init.service.ts:111` 是 `const config: ProspecConfig = { ... knowledge: { base_path: `${baseDir}/ai-knowledge` } }`，於 124 行整個 `knowledge` 物件字面量因缺 `generated_artifacts` 而編譯失敗。實跑 `npx tsc -p tsconfig.typecheck.json` 得 `src/services/init.service.ts(124,5): error TS2741: Property 'generated_artifacts' is missing in type '{ base_path: string; }' but required in type '{ generated_artifacts: string[]; ... }'`。同一個 TS2741/TS2345 還打斷三個測試建構點：`tests/unit/lib/config.test.ts:144`、`tests/unit/lib/init-docs.test.ts:85`、`tests/unit/lib/language-policy.test.ts:80`——這四處都是「對這個欄位沒有意見」的呼叫端，卻被迫具名一個空陣列。`_conventions.md` 的 Config 慣例（plan.md:25 也複述）是 `.loose()` 讀取、建構端用 strict schema，這個 codebase 的 config 型別本來就沒有區分 input/output 型別，因此在任何欄位上加 `.default()` 都是結構性敵對的。關鍵是這個 `.default([])` 一點好處都沒有：`KnowledgeSchema` 尾端就是 `.optional()`，所以 `knowledge` 整段缺席時 default 根本不會觸發（`config.knowledge` 直接是 `undefined`）；而兩個消費點 `src/services/check.service.ts:183` 與 `src/services/mcp.service.ts:365` 都已經寫了 `config.knowledge?.generated_artifacts ?? []`。改成單純 `z.array(z.string()).optional()` 行為完全等價、零建構點改動。

---

### [test-quality / T-2] tests/unit/lib/drift-sources-git-capture.test.ts:97, tests/contract/mcp-server.test.ts:150, tests/unit/lib/config.test.ts:144, tests/unit/lib/init-docs.test.ts:85, tests/unit/lib/language-policy.test.ts:80

在乾淨的工作樹上執行 `pnpm typecheck`（tsc -p tsconfig.typecheck.json，依 [[include-tests-in-typecheck]] 已涵蓋 tests/ 與 scripts/）得到 6 個 error：

1. src/services/init.service.ts(124,5): TS2741 — Property 'generated_artifacts' is missing in type '{ base_path: string; }'
2. tests/contract/mcp-server.test.ts(150,34): TS2345 — Property 'config' is missing in type '{ cwd; baseDir; knowledgePath; specsPath; featuresDir }' but required in type 'McpServerContext'
3. tests/unit/lib/config.test.ts(144,37): TS2345 — knowledge 屬性不相容，缺 generated_artifacts
4. tests/unit/lib/drift-sources-git-capture.test.ts(97,17): TS2554 — Expected 4 arguments, but got 3
5. tests/unit/lib/init-docs.test.ts(85,20): TS2741 — 缺 generated_artifacts
6. tests/unit/lib/language-policy.test.ts(80,50): TS2741 — 缺 generated_artifacts

【根因】src/types/config.ts:175 寫成 `generated_artifacts: z.array(z.string()).optional().default([])`。`.default()` 讓 Zod 的 **output** type 變成非 optional 的 `string[]`，因此凡是把物件字面量指派成 schema output type 的地方（`resolveBasePaths(config, ...)` 的參數、`ProspecConfig` 的 knowledge 欄位）都被要求補上此欄位。這與 REQ-TYPES-076 AC-2「When absent, defaults to `[]`」在 parse 面是相容的，但在 TS 型別面造成 build 中斷。`.optional()` 與 `.default()` 疊用本身也是冗餘寫法（`.default()` 已使 input optional）。

【範圍評估】`npx vitest run` 全套 3762 passed / 4 skipped，執行期是綠的——vitest 預設不做 typecheck，所以這 6 個錯只在 `pnpm typecheck` 這道閘門浮現。這正是 PB-001「機制存在≠機制在跑」的反面：測試跑得過不代表測試碼是有效的（見 T-1，第 4 項 TS2554 正好是 T-1 那條恆真式的機械證據）。

【額外的執行期隱患】tests/contract/mcp-server.test.ts:150 建構的 McpServerContext 沒有 config 欄位。src/services/mcp.service.ts:365 現在做 `ctx.config.knowledge?.generated_artifacts ?? []` —— 對 `ctx.config` 本身沒有 optional chaining。該 fixture 目前只讀 knowledge://feature-map 與 spec://product，沒踩到 readHealth，所以執行期僥倖不炸；一旦有人在該 client 上讀 knowledge://health 就是 TypeError。這是 PB-001 2026-07-28 broadened 條款講的「修好被點名的那一處，卻沒 sweep 同族的其他呼叫點」——mcp-server.test.ts 的第一個 context（第 92 行）補了 config，第二個（第 150 行）漏了。

【修法】兩條路：(a) 把 config.ts 改成 `z.array(z.string()).optional()`，讓 output type 保持 optional，兩個呼叫端已經寫了 `?? []` 所以行為不變、5 個既有測試不必改；(b) 保留 `.default([])` 並補齊全部 6 個站點。(a) 的 surgical 面積小很多，且與 REQ-TYPES-076 AC-2/AC-3 的語意一致。無論選哪條，drift-sources-git-capture.test.ts:97 都必須補第 4 個參數（見 T-1）。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-3 -->
### F-3

### [parallel-site / P-2] tests/contract/mcp-server.test.ts:150

掃描方式：`grep -rn "McpServerContext" src tests scripts`，逐一判定每個「建構」站（型別註記與參數宣告不算建構）。

src 端：`src/services/mcp.service.ts:63` 是 interface 宣告；100/108/209/253/356/378 都是把 ctx 當參數收，不建構。唯一的建構站是 `execute()` 內（86 行附近的物件字面量），已補 `config,`——而且 `config` 就是同函式上方 `readConfig()` 的結果，取得方式正確、沒有二次解析 `.prospec.yaml`。

tests 端共五個建構站：
1. `tests/unit/services/mcp.service.test.ts:75` 的 `const CTX: McpServerContext` —— 已補（81 行）。
2. `tests/contract/mcp-server.test.ts:76` 的 `writeFixtureProject()` —— 已補（92 行）。
3. `tests/contract/mcp-server.test.ts:230` 的 `writeMapless()` —— 內部是 `const ctx = writeFixtureProject(); rmSync(...); return ctx;`，直接沿用同一個物件，因此自動帶著 `config`，**不是漏站**。
4. `tests/contract/mcp-server.test.ts:498` 的 `gitFixture()` —— 同樣是 `const ctx = writeFixtureProject(); ...; return ctx;`，也自動繼承，**不是漏站**。
5. `tests/contract/mcp-server.test.ts:150` 的 inline 字面量（在 `feature-map and product resources error when their files are absent` 這個 case 裡直接餵給 `connect({...})`）—— **這是唯一漏掉的**，`TS2345: Property 'config' is missing`。

影響：打斷 `pnpm typecheck`（ci.yml:29）。runtime 面本身不會炸，因為這個 case 只讀 `knowledge://feature-map`／`spec://product`／`knowledge://index`，不會走到 `readHealth()`（`src/services/mcp.service.ts:356`）那條會 deref `ctx.config.knowledge` 的路徑；但只要有人日後在這個 fixture 上加一條讀 health 的斷言，就會拿到 `TypeError: Cannot read properties of undefined`。

另外值得注意：`config` 被宣告為**必填**（`src/services/mcp.service.ts:70` 沒有 `?`），這是刻意的（省得每個消費者再判空），但它讓每個 fixture 都必須造一份 config；兩個已補的站都用 `as any` 繞過型別（見 P-5，那是 lint gate 的問題）。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-4 -->
### F-4

### [parallel-site / P-5] src/lib/drift-sources.ts:1825,1829,1830; tests/contract/mcp-server.test.ts:92; tests/unit/services/mcp.service.test.ts:81

實跑 `pnpm lint`（`eslint src/ tests/`）結果：`5 problems (5 errors, 0 warnings)`，exit 1。逐項：

```
src/lib/drift-sources.ts
  1825:26  error  Unexpected any  @typescript-eslint/no-explicit-any
  1829:33  error  Unexpected any  @typescript-eslint/no-explicit-any
  1830:34  error  Unexpected any  @typescript-eslint/no-explicit-any
tests/contract/mcp-server.test.ts
  92:64  error  Unexpected any
tests/unit/services/mcp.service.test.ts
  81:62  error  Unexpected any
```

五處**全部**是本變更引入的（`git diff` 逐行對照可證）。

lib 的三處是**回歸**，不是新債：修改前的 `hasVerifyGrade` 已經有一個乾淨的具型別 narrowing——`const e = entry as { skill?: unknown; result?: unknown; grade?: unknown };`——正是為了滿足 `no-explicit-any` 而寫的。重構把它拆成 `isVerify`/`isPass` 兩個 helper 時，改成 `str((entry as any).skill)`、`str((entry as any).grade)`、`str((entry as any).result)`，把既有的 lint 相容寫法丟掉了。修法很小：在兩個 helper 內各留一行 `const e = entry as { skill?: unknown; result?: unknown; grade?: unknown };`，語意完全不變。

測試的兩處是新 fixture：`config: { version: '1.0.0', project: { name: 'test' } } as any`。可用 `as ProspecConfig` 取代（同檔其他 helper 已是這個慣例，見 P-4 evidence），或直接補齊必填欄位。

為什麼這條算 parallel-site：CI（`.github/workflows/ci.yml`）跑四道 gate——`lint`(27)、`typecheck`(29)、`counts:check`(40)、`agents:check`(47)。orchestrator 手上的事實只來自 typecheck，而 `no-explicit-any` 這一類缺陷對 tsc 完全透明。我另外實測 `pnpm agents:check` 為綠（3.4 秒，`✓ generated artifacts are current: templates → bundle → deployed (104 files)`），所以四道 gate 目前是 lint 紅、typecheck 紅、agents:check 綠。

---

### [spec-architecture / S-4] src/lib/drift-sources.ts:1825,1829,1830

`git diff HEAD -- src/lib/drift-sources.ts` 顯示原本 1820 行附近是 `const e = entry as { skill?: unknown; result?: unknown; grade?: unknown };`，重構後變成 `str((entry as any).skill)`（1825）、`str((entry as any).grade)`（1829）、`str((entry as any).result)`（1830）。`prospec/ai-knowledge/_conventions.md:89` 的 Code Patterns (Avoid) 第一條就是 `Avoid any type — use unknown or proper generics`。`npx eslint src/lib/drift-sources.ts` 回三個 `@typescript-eslint/no-explicit-any` error，`pnpm lint` 整體 exit 1（另兩個在 `tests/contract/mcp-server.test.ts:92`、`tests/unit/services/mcp.service.test.ts:81`，同樣是本變更新增的 `as any`），而 `prospec/CONSTITUTION.md:103` 的 [MUST] Pre-Merge CI Checks 第 1 項就是 `pnpm run lint`。修法是把舊的具名 cast 抽成一個 `type QualityLogEntry = { skill?: unknown; result?: unknown; grade?: unknown }` 給兩個 helper 共用，行為完全不變。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-5 -->
### F-5

### [docs-claims / P-6] src/templates/skills/prospec-verify.hbs:345; src/templates/skills/prospec-archive.hbs:32; src/templates/init/status-lifecycle.md.hbs:51

先確認實作事實。`src/lib/drift-sources.ts:1806` → `missing_verify_grade: GRADED_STATUSES.has(status) && !hasVerifyGrade(meta.quality_log, status)`，`GRADED_STATUSES = new Set(['verified', 'archived'])`（239 行）。新的 `hasVerifyGrade` 對 `status !== 'archived'` 走 `quality_log.findLast(isVerify)`，只看最新一筆。因此 `status: verified` + quality_log `[grade S, grade B]` → `missing_verify_grade = true` → `drift-checker.ts:523` 產生 FAIL-class finding。本變更自己新增的測試把這件事釘死了：`tests/unit/lib/drift-sources.test.ts` 的 `rejects a verified change if its latest verify grade is B, even if a previous verify was S` 斷言 `missing_verify_grade` 為 `true`。

然後是被推翻的宣稱，逐站列出（全部**不在** diff 內，整個 templates 面沒被碰過）：

1. `src/templates/skills/prospec-verify.hbs:344-346`：「**On a re-entering already-`verified` change, "unchanged" means it stays `verified`** — status never regresses, and `quality_log` keeps the earlier S/A entry, so neither `status` nor `metadata-completeness` records this grade.」→ 後半句現在為假。
2. `src/templates/skills/prospec-archive.hbs:32`（Entry Gate 的 provenance 條目）：「a change already at `verified` keeps that status whatever the new grade is, and `quality_log` still holds the earlier S/A entry, so neither `status` nor `metadata-completeness` will say so.」→ 同一句假宣稱。
3. `src/templates/init/status-lifecycle.md.hbs:51`：「Neither `status` nor `metadata-completeness` (it accepts any earlier S/A entry) then records the new grade」→ 這是**出貨給每一個下游專案**的 `_status-lifecycle.md` 樣板，括號內甚至直接把舊的 `.some()` 語意寫成理由。

下游副本（`pnpm agents:check` 目前綠，代表它們與樣板一致，所以樣板一改就必須重跑 bundle + sync）：
- `src/lib/bundled-templates.ts` 內 `skills/prospec-verify.hbs`、`skills/prospec-archive.hbs`、`init/status-lifecycle.md.hbs` 三個 blob
- `.claude/skills/prospec-verify/SKILL.md:379`、`.agents/skills/prospec-verify/SKILL.md:379`
- `.claude/skills/prospec-archive/SKILL.md:47`、`.agents/skills/prospec-archive/SKILL.md:47`
- `prospec/ai-knowledge/_status-lifecycle.md:51`（本 repo 由樣板生成的實例；這一份屬 `/prospec-knowledge-update` 站，但它與樣板同源，改樣板時一併處理最省事）

為什麼是 critical 而不是「延後到 archive」：這些是 `src/templates/**` 底下的**實作檔**，沒有任何生命週期站台把它們延後——`prospec/ai-knowledge/_status-lifecycle.md` 的站台歸屬表只延後 `prospec/specs/features/**`（archive 畢業）與 `prospec/ai-knowledge/**`（knowledge-update，防範點在 verify S/A commit prompt）。而且這句假宣稱的危害是**方向性**的：它教 agent「機器閘門抓不到這種情況，所以你要靠報告自己說」，實際上機器閘門現在抓得到；agent 讀了會以為 metadata-completeness 的 FAIL 是誤報。

修法順序（依專案慣例）：先改 `.hbs` → `pnpm bundle` → `prospec agent sync`（或直接跑 `pnpm agents:check` 驗證），否則 bundle 與 FS 不同步，`agents:check` 會從綠轉紅。此外整個 delta-spec 沒有任何 `REQ-TEMPLATES-*`，代表這三份樣板的修改也需要一條 MODIFIED REQ 才能在 archive 畢業。

---

### [spec-architecture / S-3] src/templates/init/status-lifecycle.md.hbs:51, src/templates/skills/prospec-verify.hbs:345, src/templates/skills/prospec-archive.hbs:32

本變更的 REQ-LIB-025 **After:** 寫 `for other GRADED_STATUSES (verified), it checks only the LATEST /prospec-verify entry — a re-verify grading B/C/D after an earlier S/A now correctly returns false`，實作在 `src/lib/drift-sources.ts:1834-1839`（`archived` 走 `.some()`、其餘走 `.findLast()`）。但下列出貨文本仍宣告相反契約：(1) `src/templates/init/status-lifecycle.md.hbs:51` —— `Neither status nor metadata-completeness (it accepts any earlier S/A entry) then records the new grade: the report, not the status, says the change is not archivable`；(2) `src/templates/skills/prospec-verify.hbs:345` —— `quality_log keeps the earlier S/A entry, so neither status nor metadata-completeness records this grade`；(3) `src/templates/skills/prospec-archive.hbs:32` —— `a change already at verified keeps that status whatever the new grade is, and quality_log still holds the earlier S/A entry, so neither status nor metadata-completeness will say so`。這三處都在 `src/` 之下，是 templates 模組的原始碼，不是 `prospec/ai-knowledge/**` 知識庫；`prospec/ai-knowledge/_status-lifecycle.md:67` 把延後保護的範圍限定在 `AI Knowledge (module READMEs)`，第 68 行則把 Feature Spec 的延後限定在 `/prospec-archive` Phase 3.5，兩者都涵蓋不到 `src/templates/**`。而且 `pnpm agents:check` 現在是綠的（`✓ generated artifacts are current: templates → bundle → deployed (104 files)`），意思是這些錯誤敘述已經原封不動部署到 `.claude/skills/prospec-verify/SKILL.md:379`、`.claude/skills/prospec-archive/SKILL.md:47`、`.agents/skills/**` 同位置——`/prospec-archive` 的 Entry Gate 正在用一個現在已為假的前提指導 agent（它告訴 agent「metadata-completeness 不會說這個變更不可封存」，但改完之後它會說）。另有一處同文在信任區 `prospec/ai-knowledge/_status-lifecycle.md:51`（該檔自述 `Canonical definition ... All prospec skills MUST follow this`）。`.prospec/changes/configurable-generated-artifacts/metadata.yaml` 的 `related_modules` 只有 `types` 與 `lib`，所以連 archive Entry Gate 的 module-knowledge 回檢也不會碰到 templates。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-6 -->
### F-6

### [docs-claims / P-7] prospec/specs/features/drift-detection.md:557 (REQ-TEMPLATES-171), :542 (US-14 AC)

先講清楚為什麼這**不**適用「feature spec 未更新是預期的」豁免。那條規則保護的是「本變更自己的 REQ 要等 archive 才畢業」；本 finding 講的是**另一條早已畢業、被本變更推翻的姊妹 REQ**。archive 只會把 delta-spec **點名**的 REQ 搬進信任區（這正是 `delta-spec-provenance` 存在的理由），所以一條沒被 delta-spec 列為 MODIFIED 的既有 REQ，永遠不會有人去改它——延後不會自動變成修好。

被推翻的原文，`prospec/specs/features/drift-detection.md:557`（REQ-TEMPLATES-171 的 `**Spec:**` body）：「…the item also states the boundary of the re-run: a change already at `verified` keeps that status whatever the new grade is, and **`hasVerifyGrade` accepts any earlier S/A entry in `quality_log`**, so a re-verify grading B/C/D leaves both `status` and `metadata-completeness` **green** while the change is not archivable.」

同一份 spec 的 `:542`（US-14 的 Acceptance Scenario）重述一次：「…and states that a re-verify which does not reach S/A leaves both `status` and `metadata-completeness` green while the change is not archivable」。

本變更後，對 `status: verified` 的變更，`metadata-completeness` 不再 green（見 P-6 evidence 的實作推導與本變更自己新增的測試）。所以兩處皆為假。

delta-spec 涵蓋範圍實測：`.prospec/changes/configurable-generated-artifacts/delta-spec.md` 只有 5 條 REQ——MODIFIED `REQ-LIB-039`／`REQ-LIB-025`／`REQ-TESTS-071`，ADDED `REQ-TYPES-076`／`REQ-TESTS-074`。`grep -c 'REQ-TEMPLATES-171'` = **0**；`grep -c 'REQ-TEMPLATES-142'`（另一條講 archive Entry Gate 消費 metadata-completeness 的 REQ）也不在其中。

這是 PB-007 的教科書形狀：`hasVerifyGrade` 的「最新一筆說了算」這個不變式，只套到了 `REQ-LIB-025` 一條 REQ，卻沒掃過同一份 feature spec 裡陳述同一事實的姊妹 REQ 與 US 層 AC。應在 delta-spec 補 `## MODIFIED` 的 `REQ-TEMPLATES-171`（Before/After/Reason/Spec/Dropped 齊全），把那句改成 archived 才沿用 `.some()`、verified 只看最新一筆；US-14 的 AC 同時修。注意 US 層的 Acceptance Scenario 沒有獨立的畢業載體，必須靠所屬 REQ 的 MODIFIED 帶過去。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-7 -->
### F-7

### [test-quality / T-3] tests/unit/lib/drift-sources.test.ts:1136-1148, src/services/check.service.ts:183, src/services/mcp.service.ts:365

REQ-LIB-039 的 **Spec** bullet 明寫：「WHEN the staleness collector needs excluded paths, THEN it reads `knowledge.generated_artifacts` from the project's `.prospec.yaml` configuration, not a hardcoded constant」。REQ-TESTS-071 的 Spec 也寫「pinned from BOTH directions against temp-git fixtures **using config-driven excludes**」。

【證據一：靜態掃描】
`grep -rn 'generated_artifacts' tests/` 的唯一命中是 tests/contract/generated-artifacts-single-source.test.ts:4 —— 一行 docstring 註解。整個 tests/ 樹沒有任何一行程式碼觸及這個 config key。新增的 tests/unit/lib/drift-sources.test.ts:1136 helper `libHealth(generatedArtifacts: readonly string[] = [])` 是直接把陣列遞進 collectGitTimestamps 的第 4 個參數，config 讀取、`?? []` 退回、`.prospec.yaml` 解析這三段都在測試範圍外。所以測試名稱裡的 'when config is empty' / 'explicitly configured' 其實是「當呼叫端傳空陣列 / 傳非空陣列」，名實不符。

【證據二：mutation，整條接線切斷仍全綠】
同時施加兩處 mutation：
  src/services/check.service.ts:183
    原：collectGitTimestamps(cwd, moduleMap, paths.knowledgePath, config.knowledge?.generated_artifacts ?? [])
    改：collectGitTimestamps(cwd, moduleMap, paths.knowledgePath, [])
  src/services/mcp.service.ts:365
    原：collectGitTimestamps(ctx.cwd, moduleMap, ctx.knowledgePath, ctx.config.knowledge?.generated_artifacts ?? [])
    改：collectGitTimestamps(ctx.cwd, moduleMap, ctx.knowledgePath, [])
這相當於把整個變更的功能拔掉（設定寫什麼都不會被套用）。執行 `npx vitest run` 全套：
  Test Files 150 passed (150)
  Tests 3762 passed | 4 skipped (3766)
零紅燈。

【對照：參數層本身是有釘住的】為了區分「參數層有效」與「接線層無效」，我另外做了兩個 mutation 確認 collectGitTimestamps 的參數語意確實被釘：
  M1（殺正向排除）：drift-sources.ts:620 的 `generatedArtifacts` 改成 `[]` → 'does not move last_src_commit for an explicitly configured generated artifact (REQ-LIB-015)' RED（expected '2026-06-12T00:00:00Z' to contain '2026-06-10'）。
  M2（還原硬編碼）：同一行改成 `['src/lib/bundled-templates.ts']` → 'moves last_src_commit when config is empty, meaning the generated artifact is not excluded' RED。
所以 REQ-TESTS-071 的前兩個 bullet 在「參數」這個抽象層是雙向 mutation-verified 的；缺的是把參數接到 config 的那一段。

【digest 邊界另行確認為有效】M3（digest 排除該檔）：computeChangeDigest 的 scope 陣列（drift-sources.ts:1406 附近）插入 `':(exclude)src/lib/bundled-templates.ts'` → 'flips when the generated bundle changes — the digest scope is NOT the staleness scope'（tests/unit/lib/drift-sources.test.ts:1440）RED。REQ-TESTS-071 的 digest-boundary bullet 成立，此項無問題。

【修法】補一條 service 層或 config 層的測試：在 temp 專案寫入含 `knowledge.generated_artifacts` 的 .prospec.yaml，跑 check（或至少 readConfig + resolveBasePaths + collectGitTimestamps 的組合），斷言配置路徑真的被排除；並補反向（.prospec.yaml 無此 key → 不排除）。然後用上述兩處 `[]` mutation 驗證它會 RED。

所有 mutation 均已逐行還原，`git diff | git apply --check --reverse` 通過。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-8 -->
### F-8

### [security / C-1] src/lib/drift-sources.ts:1337-1343 (gitLastCommit) with src/lib/drift-checker.ts:816-819 (isStale)

根因在 src/lib/drift-sources.ts:1331-1344 的 gitLastCommit。它的 docblock（1325-1330）把 PB-013 的契約寫得很清楚：「A pathspec the local git cannot parse fails the capture — and folding THAT into null would report 'no source commit', which the staleness rule reads as fresh (PB-013…). Fall back to the unexcluded query」。但實作只覆蓋了「capture 失敗」那條路：

  if (excludes.length > 0) {
    const excluded = gitCapture(cwd, [...args, ...excludes.map((p) => `:(exclude)${p}`)]);
    if (excluded !== null) return excluded.trim() || null;
  }

`excluded !== null`（git exit 0）但輸出為空字串時，`excluded.trim() || null` 直接回 null，而且**不會**退回未排除查詢。這正是 docblock 自己禁止的那個結果。

下游判準：src/lib/drift-checker.ts:816-819 `isStale(srcCommit, knowledgeCommit)` 開頭就是 `if (srcCommit === null || knowledgeCommit === null) return false;`，所以 last_src_commit 為 null 等於「永遠不 stale」，且 evaluateKnowledgeHealth（drift-checker.ts:171-215）在 readme_exists 為 true 時完全不產生 finding — 沒有 warn、沒有 skip、沒有 reason，check 直接綠。knowledge-health 是 /prospec-verify 4/5 的機器維度，這是餵 gate 的事實。

變更前 excludes 是 lib/generated-artifacts.ts 的一元素建置常數（`src/lib/bundled-templates.ts`），結構上不可能涵蓋任何模組的整個 paths；變更後 excludes 完全由下游專案的 .prospec.yaml 提供，寬度無上界，而 src/types/config.ts:175 的 `z.array(z.string())` 對值不做任何限制（空字串、`.`、`*`、模組 paths 的祖先目錄全部合法）。

實測（git 2.50.1，temp repo，模組 paths = ['src/lib']）：
- `:(exclude)` （空字串條目）→ rc=0、輸出空 → 排除掉全部
- `:(exclude).` → rc=0、輸出空
- `:(exclude)*` → rc=0、輸出空
- `:(exclude)src` → rc=0、輸出空
- `:(exclude)../outside`、`:(exclude)/etc/passwd` → rc=128（這兩個會走 PB-013 退回，是正確的吵而真實）

端到端用 production code 驗過（tsx 直接 import src/lib/drift-sources.ts + src/lib/drift-checker.ts + src/lib/config.ts，temp git repo：README 提交於 2026-06-11、authored source 提交於 2026-06-20，模組 lib paths=['src/lib']）：
  config parsed OK (no ConfigInvalid), generated_artifacts = [""]
  []  control  -> last_src_commit=2026-06-20T00:00:00Z stale=true  findings=1
  ['']  blank  -> last_src_commit=null                stale=false findings=0
注意第一行：`generated_artifacts:\n  - ""` 通過 validateConfig（src/lib/config.ts:163-181 的 safeParse）不報 ConfigInvalid，所以使用者不會收到任何警訊。

這同時抵觸 proposal.md 的 Edge Case「設定值為 glob 但 git pathspec 不支援：降級為無排除的查詢（較吵但真實），不靜默跳過」——「靜默跳過」正是空結果這條路徑做的事，而且它連 skip 都不是，是 pass。

另外查證：git 的預設 pathspec magic 確實支援 glob（`:(exclude)src/generated/**` 會排掉巢狀檔案；且因為預設不是 WM_PATHNAME，`*` 會跨 `/`，所以 `*.pb.ts` 也會命中 `src/api/foo.pb.ts`，反而 `:(exclude,glob)` 才會失效），所以 delta-spec REQ-LIB-039 的 glob 宣稱本身是成立的，不是問題點。argv 注入也不成立：execFileSync 傳陣列、無 shell，且值永遠被前綴成 `:(exclude)…`，不可能被解讀成選項；`..`/絕對路徑會 rc=128 走安全退回。真正的洞只有「成功但為空」這一條。

src/templates/references/config-example.yaml.hbs 新增的說明只寫「repository-root-relative, posix-formatted paths … exempt from knowledge staleness checks」，完全沒有提示一個過寬的值會讓整個檢查靜默失效。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-9 -->
### F-9

### [spec-architecture / S-6] prospec/ai-knowledge/modules/tests/README.md:3, prospec/index.md:31, prospec/ai-knowledge/module-map.yaml:252, README.md:7, README.zh-TW.md:7

`pnpm counts:check` exit 1，輸出 `19 count(s) out of sync — run pnpm counts to fix`，散布於 `README.md:7/833/846/847/848`、`README.zh-TW.md:7/800/813/814/815`、`prospec/index.md:31`、`prospec/ai-knowledge/module-map.yaml:252-253`、`prospec/ai-knowledge/modules/tests/README.md:3`。成因是本變更在 `tests/unit/lib/drift-sources.test.ts` 新增 5 個 unit test（`hasVerifyGrade` 四條 REQ-TESTS-074 情境 ＋ 一條 config-empty 負向斷言），並在 `tests/contract/generated-artifacts-single-source.test.ts` 刪掉 1 個 contract test。`prospec/CONSTITUTION.md:106` 的 [MUST] Pre-Merge CI Checks 第 4 項是 `pnpm run counts:check`，第 112 行的 Verify 要求所有列出的指令 exit 0。這些計數是機械生成的，修法就是跑一次 `pnpm counts`，但它跨 `README.md`/`README.zh-TW.md` 雙語與 `module-map.yaml`，不重跑就會在 CI 上紅。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-10 -->
### F-10

### [parallel-site / P-8] prospec/ai-knowledge/modules/lib/drift-engine.md:13,27,45

刪除符號 `GENERATED_SOURCE_ARTIFACTS` 的全 repo 掃描（`grep -rn` 涵蓋 `src/`、`tests/`、`scripts/`、`prospec/`、`README.md`、`README.zh-TW.md`、`.claude/`、`.agents/`、`src/templates/**/*.hbs`、以及 `src/lib/bundled-templates.ts` 這個 bundle blob，排除 node_modules 與 .git）。結果只有 4 個檔案命中，逐一裁決：

**src/ 與 tests/：0 命中——程式碼面掃乾淨了。** `src/lib/drift-sources.ts` 的 import 已移除、`tests/contract/generated-artifacts-single-source.test.ts` 已改寫、`src/templates/**/*.hbs` 與 bundle blob 皆無殘留。

1. `prospec/ai-knowledge/modules/lib/drift-engine.md`——**live dangling，本 finding 的主體**，三處：
   - `:13` Key Files 表格：「`generated-artifacts.ts` | The build-output registry subtracted from module staleness — single-sourced with `scripts/bundle-templates.ts`, its only other consumer」。「registry subtracted from module staleness」已不成立：該檔現在只剩 `BUNDLED_TEMPLATES_SOURCE`，唯一用途是 bundler 的輸出位置；staleness 排除清單改由 `.prospec.yaml` 提供。
   - `:27` Recipe 2：「**Add a generated artifact** — register it in `generated-artifacts.ts`; the producer resolves its output path from that constant.」這是**會誤導人動手做錯事**的指引——照做完全不會產生排除效果。正確步驟是在專案 `.prospec.yaml` 的 `knowledge.generated_artifacts` 加一筆。
   - `:45` Pitfalls：「`GENERATED_SOURCE_ARTIFACTS` subtracts build output from `last_src_commit` only, never from the digest；an unparsable `:(exclude)` falls back to the unexcluded query」。後半（digest 邊界、fallback）仍為真，只有主詞要換成設定鍵。

2. `prospec/ai-knowledge/_lessons-ledger.md:62`——`knowledge/generated-file-trips-module-stale` 這一列的 **Retired 理由**寫「根因已由 exclude-generated-from-staleness 機械解消除（issue #121）：`GENERATED_SOURCE_ARTIFACTS` 註冊表把生成檔排除在 `last_src_commit` 的路徑集合外」。裁決：**不列為 finding**。ledger 是有日期的歷史稽核軌跡，該列記錄的是 2026-08-02 當時為真的事實；而且對本 repo 而言根因**仍**被消除（`.prospec.yaml:22` 已 dogfood 宣告 `src/lib/bundled-templates.ts`）。若之後 `/prospec-learn` 要更新它，屬 learn 站的工作，不是本輪。

3. `prospec/specs/_archived-history/2026-08-02-exclude-generated-from-staleness.md`——歷史封存，**不列為 finding**（依專案慣例，`_archived-history` 是稽核軌跡，不回改）。

4. `prospec/specs/features/drift-detection.md:68,70`（REQ-LIB-039 本體與其 AC）——**不列為 finding**，這條 REQ 正是 delta-spec 明確列為 MODIFIED 的那一條（含 `**Dropped:**` 把兩條 AC 撤下），archive 會畢業它。

站台歸屬確認（依 `prospec/ai-knowledge/_status-lifecycle.md:67`）：「AI Knowledge (module READMEs) tracks current code; updated by `/prospec-knowledge-update` anytime。Knowledge-sync's **prevention point is the `/prospec-verify` S/A commit prompt**；`/prospec-archive` Entry Gate is the **backstop**」。所以 review 期未更新是合法延後 → major。但務必在 verify 的 S/A commit 前補完，否則 archive Entry Gate 會擋。

連帶（現況正確、無需動）：`prospec/ai-knowledge/modules/lib/README.md:38` 只是軟指向 drift-engine.md；`prospec/ai-knowledge/modules/tests/contract-guards.md:11` 仍列 `generated-artifacts-single-source.test.ts` 並描述為「Registry ⇄ producer equality」，而該測試保留下來的那條斷言（`OUTPUT_FILE === resolve(REPO_ROOT, BUNDLED_TEMPLATES_SOURCE)`）確實還是 producer equality，描述仍成立。

---

### [spec-architecture / S-5] prospec/ai-knowledge/modules/lib/drift-engine.md:45

`prospec/ai-knowledge/modules/lib/drift-engine.md:45` 寫 `- GENERATED_SOURCE_ARTIFACTS subtracts build output from last_src_commit only, never from the digest; an unparsable :(exclude) falls back to the unexcluded query (null reads as not-stale).`，但 `src/lib/generated-artifacts.ts` 已把該 export 刪除（只留 `BUNDLED_TEMPLATES_SOURCE`），`grep -rn GENERATED_SOURCE_ARTIFACTS src tests scripts` 在程式碼中零命中。判級依據是 `prospec/ai-knowledge/_status-lifecycle.md:67`：`AI Knowledge (module READMEs) tracks current code; updated by /prospec-knowledge-update anytime. /prospec-verify grades only pre-existing Knowledge ↔ code drift (lag behind the change under verification is informational). Knowledge-sync's prevention point is the /prospec-verify S/A commit prompt ... the /prospec-archive Entry Gate is the backstop that still refuses to archive until affected-module READMEs reflect the change's final state.` 亦即 review 站不是這份文件的擁有站，落後屬預期狀態；且 `metadata.related_modules` 含 `lib`，archive Entry Gate 會兜底。要修的具體內容是把該行改寫成「排除來源改為 `.prospec.yaml` `knowledge.generated_artifacts`（透過 `collectGitTimestamps` 第 4 參數注入）」，並保留 `:(exclude)` 解析失敗退回未排除查詢這一句（該行為未變）。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-11 -->
### F-11

### [docs-claims / P-9] src/templates/references/config-example.yaml.hbs:52-55

文件端原文（`src/templates/references/config-example.yaml.hbs:52-55`）：「# List of repository-root-relative, posix-formatted **paths** to generated artifacts.」

規格端原文：delta-spec 的 REQ-LIB-039 `**Spec:**`「The module-staleness exclusion reads from `.prospec.yaml` `knowledge.generated_artifacts` (a **glob array**, default empty)」；REQ-TYPES-076「declaring repository-root-relative **globs**」；並有一條 AC「WHEN a configured **glob** matches files under a module's paths, THEN those files are excluded from the staleness `last_src_commit` query but remain inside `computeChangeDigest`」。

實作端我做了實測（臨時 git repo，`src/lib/a.ts` 與 `src/gen/x.pb.ts` 兩次 commit，第二次只動生成檔）：
```
no-exclude:                2026-06-12T00:00:00Z
:(exclude)src/gen/*.pb.ts  2026-06-10T00:00:00Z   ← glob 有效
:(exclude)src/**/*.pb.ts   2026-06-10T00:00:00Z   ← 有效
:(exclude)*.pb.ts          2026-06-10T00:00:00Z   ← 有效
:(exclude)src/gen          2026-06-10T00:00:00Z   ← 裸目錄有效
```
所以 glob 真的可用（git pathspec 預設就吃 wildmatch），**文件是 claim ⊂ implementation 的那一側**，不算 PB-003 第一條的違規，但它讓使用者不知道最有用的用法（`src/generated/**`、`*.pb.ts` 這類才是真實世界的生成檔形狀）。既然規格已經承諾 glob，出貨文件應該說 glob 並給一個 glob 範例。

證據缺口（PB-003 2026-08-03 強化段：宣稱某性質被保證時，要指名誰在跑它）：本變更新增／修改的所有 staleness 測試都只用**精確路徑** `BUNDLED_TEMPLATES_SOURCE`（`tests/unit/lib/drift-sources.test.ts` 的 `libHealth([BUNDLED_TEMPLATES_SOURCE])`），沒有任何一條測試餵 glob。也就是說 delta-spec 那條 glob AC 沒有執行者。補一條 glob fixture 測試（例如註冊 `src/lib/*.generated.ts` 並驗證排除生效）即可同時收掉 AC 與這個文件落差。

另外一個同族觀察（併入本條，不另立）：文件說「posix-formatted」，但沒有任何機制驗證。實測 `:(exclude)src\gen\x.pb.ts`（Windows 反斜線）回傳 `2026-06-12`（＝未排除），也就是**靜默無效**、沒有任何警告，使用者只會看到一個永遠清不掉的 staleness WARN 而查不出原因。舊版本至少有 `tests/contract/generated-artifacts-single-source.test.ts` 的 `lists repository-root-relative posix paths that exist on disk`（`toMatch(/^[^/\\][^\\]*$/)` + `existsSync`）在驗證出貨清單的形狀，本變更把它刪了（刪得沒錯——它驗的是已不存在的常數），但沒有任何東西接手驗證使用者設定。若要保留「posix-formatted」這句宣稱，就得指名它的執行者（例如 zod schema 加 `.refine(p => !p.includes('\\'))`）；否則依 PB-003 2026-08-06 條款，一個沒有執行者的形狀宣稱應該改寫成「送讀者去看 git pathspec 語意」而非斷言。

---

### [spec-architecture / S-8] src/templates/references/config-example.yaml.hbs:52, tests/contract/generated-artifacts-single-source.test.ts:1

先確認不是矛盾：REQ-LIB-039 的 **Spec:** 說 `reads from .prospec.yaml knowledge.generated_artifacts (a glob array, default empty)`，REQ-TYPES-076 AC-1 說 `parses as an array of strings (glob patterns)`。實作路徑是 `src/lib/drift-sources.ts:1338` 的 `excludes.map(p => ':(exclude)' + p)`，git 的預設 pathspec 不帶任何 magic 時走 wildmatch 且不設 WM_PATHNAME，`*` 會跨 `/` 比對。我在 temp repo 實測（scratchpad/globtest）：`git log -1 --format=%cI -- src ':(exclude)src/generated/**' ':(exclude)*.pb.ts'` 回 `2020-01-01T00:00:00Z`（生成檔的 2021 那筆被排掉），而無 exclude 時回 `2021-01-01T00:00:00Z`。所以 glob 確實生效，**不是** spec contradiction。問題在於這條契約在其他三個面向都沒有被承接：(1) 唯一的使用者文件 `src/templates/references/config-example.yaml.hbs:52-55` 寫的是 `List of repository-root-relative, posix-formatted paths to generated artifacts`，範例只給 `dist/bundle.js` 一個字面路徑，讀者不會知道可以寫 `src/generated/**` 或 `*.pb.ts`——而 REQ-LIB-039 的 Reason 正是拿 `src/generated/**`、`*.pb.ts` 當立論；(2) 新增/修改的測試（`tests/unit/lib/drift-sources.test.ts:1136-1186`）全部只傳 `[BUNDLED_TEMPLATES_SOURCE]` 這個字面路徑，沒有任何一條釘住 glob 比對；(3) 舊契約測試裡那條 `lists repository-root-relative posix paths that exist on disk`（含註解 `git pathspecs are matched literally`）被整個刪除，沒有等價替代。附帶一提，同一份契約測試的新 docblock 宣稱 `BUNDLED_TEMPLATES_SOURCE is used in prospec.yaml's generated_artifacts exclusion`，但 `.prospec.yaml:22-23` 的 `src/lib/bundled-templates.ts` 是一份手抄的第二副本，沒有任何測試把它和 `BUNDLED_TEMPLATES_SOURCE` 綁在一起——這正是 PB-006 與 REQ-LIB-039 原本 single-source 論證要防的漂移，改用設定之後失去了機械保護。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-12 -->
### F-12

### [docs-claims / P-10] src/templates/references/config-example.yaml.hbs:55

這個功能要生效需要同時滿足兩個條件，而 `dist/bundle.js` 兩個都不滿足。

條件一：該檔必須被 **git 追蹤**。排除機制是 `gitLastCommit`（`src/lib/drift-sources.ts:1331-1344`）在 `git log -1 --format=%cI -- <module paths> :(exclude)<p>` 裡加一條 exclude pathspec。未追蹤的檔案從來不會出現在 `git log` 的結果裡，所以把它排除掉不會改變任何時間戳。本 repo 的 `.gitignore` 第 5 行就是 `dist/`；一般 JS/TS 專案也幾乎都 gitignore `dist/`。

條件二：該檔必須落在某個 module 的 `paths` 底下。`collectGitTimestamps` 只對 `moduleMap` 的每個 entry 用 `entry.paths` 查 `last_src_commit`，exclude pathspec 只在這個查詢裡起作用。`module-map.yaml` 的 module paths 指的是原始碼目錄（本 repo 的 lib module 是 `src/lib`），`dist/` 這種建置輸出目錄不會被列為 module。

換句話說：出貨的範例教使用者去排除一個**可證明不可能造成 staleness** 的檔案。真正會踩到這個坑的形狀是「被 commit 進版控、而且住在原始碼目錄裡的生成檔」——本 repo 自己的 `src/lib/bundled-templates.ts` 就是標準案例（`.prospec.yaml:22-23` 的 dogfood 值），`src/generated/**`、`*.pb.ts`、`src/**/*.gen.ts` 也是。

建議把範例改成這種形狀（併同 P-9 改成 glob 寫法），例如：
```yaml
  generated_artifacts:
    - src/generated/**      # committed build output that lives inside a module's paths
    - src/**/*.pb.ts
```
並補一句 deliberate-exclusion 措辭說明「未被 git 追蹤的檔案本來就不影響 staleness，不需要列在這裡」——這正是 PB-003 第二條（把「不做什麼」明說出來）要的東西。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-13 -->
### F-13

### [docs-claims / P-11] README.md:757; README.zh-TW.md:724

orchestrator 要求先判定「這個 repo 的 README 到底有沒有在記設定鍵」，因為若沒有，就不算落差。實測結論是**有**：

- `README.md:757` 起的 `## Configuration` 章節：「Prospec can be configured via a `.prospec.yaml` file in the project root… Key configurations you can tweak:」後接逐條清單。
- `README.md:718-736` 另有一段 `**Tuning the `knowledge-size` budgets**`，內含一整塊 `knowledge.token_budget` 的 YAML 範例並逐欄註解。
- `README.zh-TW.md:724-746`：`## 設定 (Configuration)` 逐條列出 `artifact_language`、`exclude`、`agents`、`tech_stack`、**`knowledge.strategy`**、**`knowledge.token_budget`**、**`knowledge.additional_core_conventions`**、`skill_triggers`，接著給一整段 `.prospec.yaml` 範例，其中 `knowledge:` 區塊寫出 `base_path`／`strategy`／`token_budget`。

也就是說 `knowledge` 底下**三個既有子鍵全部都被兩份 README 記載**，新增第四個卻沒跟上。這正是 Constitution `prospec/CONSTITUTION.md:77-83` `[SHOULD] User-Facing Documentation Stays Current` 的適用情形：「When a change adds… a user-facing surface documented in the root `README.md`… the README is updated in the same change, **during implementation — before verification**… the two stay at content parity: a user-visible edit to either lands in the other within the same change.」該規則的 Verify 段說明 gap 會被 `/prospec-verify` 的 Constitution 稽核判 **WARN**（advisory，不擋 S/A），且明言「Prose parity has **no machine guard**」——`pnpm counts:check` 只涵蓋數字，所以沒有任何機器會抓到這個，只能靠 review。

最小補法：兩份 README 的 Configuration 清單各補一條 `knowledge.generated_artifacts` bullet（英／繁中各一，維持雙語對等），zh-TW 的 `.prospec.yaml` 範例區塊順手加一行。措辭要與 P-9／P-10 收斂後的 config-example 一致（glob、且限於已被 commit 又住在 module paths 內的生成檔），免得三個文件面又各講一套。

另外掃過但**無落差**的 README 段落：`README.md:701` 的 `prospec check` 長描述提到「knowledge freshness (git commit timestamps, WARN-only)」，沒有對生成檔排除做任何宣稱，因此不是假宣稱、不需改（但若要，這裡是宣告新行為最自然的位置）。`README.md:898` 的 `pnpm agents:check` 說明與本變更無關。

---

### [spec-architecture / S-7] README.md:734, README.zh-TW.md:733

`README.md:730` 起的 `## Configuration` 章節有一份 `Key configurations you can tweak:` 條列，逐項說明 `artifact_language`、`exclude`、`agents`、`tech_stack`、`knowledge.strategy`、`knowledge.token_budget`（733 行）、`knowledge.additional_core_conventions`（734 行）、`skill_triggers`，其後（約 755 行起）還有一段 `Example .prospec.yaml` 的 `knowledge:` 區塊；`README.zh-TW.md:733-734/755-761` 是對應的繁中副本。`grep -c generated_artifacts README.md README.zh-TW.md` 兩邊都是 0。`prospec/CONSTITUTION.md:79` 的 [SHOULD] User-Facing Documentation Stays Current 要求「新增使用者可見表面時，同一個變更內、實作階段（verify 之前）就更新 README」，並明訂 `README.md` 與 `README.zh-TW.md` 維持內容對等。`src/templates/references/config-example.yaml.hbs` 已加了註解（由 `prospec config example` 吐出），但那是 CLI 產出的完整參考，不等於 README 的精選清單——README 是使用者第一眼看到「有哪些欄位可調」的地方。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-14 -->
### F-14

### [docs-claims / P-12] .prospec/changes/configurable-generated-artifacts/plan.md:52; .prospec/changes/configurable-generated-artifacts/tasks.md:9,19

`grep -rn 'collectKnowledgeHealth' src tests scripts` → **零命中**。這個名字在整個實作面不存在。

變更工件裡的三處：
- `plan.md:52` 的 Call Chain：`→ collectKnowledgeHealth(cwd, moduleMap, config.knowledge?.generated_artifacts ?? [])` —— 名字錯，而且參數數量錯（實作是 `collectGitTimestamps(cwd, moduleMap, knowledgePath, generatedArtifacts)`，第三個參數 `knowledgePath` 在 plan 裡整個消失了）。
- `tasks.md:8`：「修改 `collectKnowledgeHealth` 簽名，新增 `generatedArtifacts: readonly string[]` 參數」。
- `tasks.md:19`：「在 `check.service` 中讀取 config 的 `knowledge.generated_artifacts`，傳遞給 `collectKnowledgeHealth`」。

對照實際 diff，這三條描述的工作**確實做了**，只是做在 `collectGitTimestamps` 上（`src/lib/drift-sources.ts:562`、`src/services/check.service.ts:183`）。所以這不是漏做，是工件文字與實作漂移——PB-003 的正字標記：文件指名的機制在程式碼裡不存在。

為什麼要修而不是放過：`/prospec-verify` 的 1/5 task-completion 與 2/5 spec-compliance 會逐條拿 tasks.md 對照程式碼；一個查無此符號的任務描述會讓稽核者（人或 agent）花時間確認「這條到底做了沒」，而 `plan.md` 的 Call Chain 是後續 review／verify 判斷相依方向的依據之一，錯的簽名會誤導。修法就是三處改名成 `collectGitTimestamps`，並把 plan.md:52 的 Call Chain 補回 `knowledgePath` 參數。

順帶確認（無問題）：plan.md 其餘章節提到的 `ProspecConfigSchema`、`check.service`、`.prospec.yaml` dogfood 值 `src/lib/bundled-templates.ts` 都與實作一致；`.prospec.yaml:22-23` 的 dogfood 也確實有效——`prospec/ai-knowledge/module-map.yaml` 的 lib module `paths: [src/lib]` 涵蓋該檔，所以排除會真的作用在 lib module 的 `last_src_commit` 上。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-15 -->
### F-15

### [test-quality / T-4] tests/unit/lib/drift-sources.test.ts:1732-1746, src/lib/drift-sources.ts:1834

REQ-TESTS-074 的四條驗收準則中，AC-1、AC-2、AC-3 都有對應且經 mutation 驗證有效的測試，AC-4 只覆蓋一半。

【已驗證有效的部分】
  M4（findLast → find）：src/lib/drift-sources.ts:1837 `quality_log.findLast(isVerify)` 改為 `quality_log.find(isVerify)` → 'rejects a verified change if its latest verify grade is B, even if a previous verify was S'（第 1700 行）RED。AC-1 成立。
  M5（archived 分支改用 findLast）：drift-sources.ts:1835 `return quality_log.some((entry) => isVerify(entry) && isPass(entry));` 改為 `const le = quality_log.findLast(isVerify); return le ? isPass(le) : false;` → 'accepts an archived change if ANY verify grade was S/A (historical timeline-unaware fallback)'（第 1711 行）RED。AC-2 成立。
  M6（isPass 恆真）：drift-sources.ts 的 isPass return 改為 `return true || grade === 'S' || ...` → 3 條 RED（'a verified change with a non-S/A verify grade still lacks the grade'、'a structured grade of B does not satisfy the S/A gate'、'rejects a verified change if its latest verify grade is B...'）。S/A 判準成立。

【AC-4 的缺口】
AC-4 原文：「WHEN `quality_log` is empty or has no `prospec-verify` entries, THEN returns false **regardless of status**」。tests/unit/lib/drift-sources.test.ts:1732 的 'rejects a verified change with an empty quality_log or no prospec-verify entries' 只建了兩個 fixture：c18（status: verified、quality_log: []）與 c19（status: verified、只有 prospec-review 條目）。`grep -n 'status: archived' tests/unit/lib/drift-sources.test.ts` 顯示全檔只有三個 archived fixture（第 1693 行 c14、第 1714 行 c16、第 2088 行 old-change），全部都帶有 prospec-verify 條目——沒有任何一個 archived 且 quality_log 為空或無 verify 條目的 fixture。

【M7 mutation：破洞證明】
  src/lib/drift-sources.ts:1834-1836
    原：if (status === 'archived') { return quality_log.some((entry) => isVerify(entry) && isPass(entry)); }
    改：if (status === 'archived') { if (!quality_log.some(isVerify)) return true; return quality_log.some((entry) => isVerify(entry) && isPass(entry)); }
這個 mutation 讓「一個 archived 但從未跑過 verify 的 change」直接通過 metadata-completeness 閘門——正是 REQ-LIB-025 Reason 段所要根除的 false positive 家族。
執行 `npx vitest run tests/unit/lib/drift-sources.test.ts`：192 tests passed，零紅燈。

PB-001 準則二明列「negative assertions for『must NOT appear』rules」是三要件之一；AC-4 的 archived 半邊就是那條缺席的 negative。目前的實作是正確的（`.some()` 對空陣列回傳 false），但這個正確性沒有回歸防護，任何後續對 archived 分支的重構都可以無聲地打開這個 fail-open 洞。

【修法】在同一個 it 內或緊鄰處加 c20（status: archived、quality_log: []）與 c21（status: archived、只有 prospec-review 條目），斷言 `missing_verify_grade` 為 true，然後用上述 M7 mutation 驗證會 RED。

所有 mutation 均已逐行還原。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-16 -->
### F-16

### [test-quality / T-5] tests/contract/generated-artifacts-single-source.test.ts:1-19, .prospec.yaml:22

本變更把 tests/contract/generated-artifacts-single-source.test.ts 的 docstring 改寫成：
  「`BUNDLED_TEMPLATES_SOURCE` is used in prospec.yaml's generated_artifacts exclusion. If the bundler could name its own output path independently, moving that output would leave the configuration pointing at a path nothing writes (REQ-LIB-039).」
但檔案裡只剩下一條測試 'is where the templates bundler resolves its own output path'，斷言是 `expect(OUTPUT_FILE).toBe(path.resolve(REPO_ROOT, BUNDLED_TEMPLATES_SOURCE))`——只釘住 bundler ↔ 常數，完全沒有觸及 .prospec.yaml。docstring 承諾的第二段契約（常數 ↔ 配置）是純敘述、零斷言。

【mutation 證明】
  .prospec.yaml:23
    原：    - src/lib/bundled-templates.ts
    改：    - src/lib/MOVED-bundled-templates.ts
執行 `npx vitest run tests/contract/`：Test Files 20 passed，Tests 871 passed，零紅燈。

【為何這是實質退化，不只是註解不精確】
被刪掉的那條測試（'lists repository-root-relative posix paths that exist on disk'）做了兩件事：斷言每個註冊路徑是 repo-root 相對的 posix 形式（`/^[^/\\][^\\]*$/`），以及 `fs.existsSync` 確認它真的存在。改為 config 驅動之後，這兩個守衛都沒了，而風險反而放大：
- git pathspec 是字面比對，`.prospec.yaml` 裡的一個 typo 或一個 Windows 反斜線不會報錯，只會讓 `:(exclude)` 比不中任何檔案——排除靜默失效（fail-open）。
- 這正是 REQ-LIB-039 的 Reason 段點名要根除的失效形狀（「the exemption silently stops working, and the fix is a second hand-copied edit nobody knows to make」）。原本註冊表把路徑集中在 TS 常數裡、由 contract 測試守住；現在 .prospec.yaml 的那一行就是 REQ-LIB-039 bullet 1 所說的「second copy of that path」——由手抄產生、無任何機制守住。

另外 `describe('generated-artifact registry')` 這個 suite 名稱在 registry 已被移除後也名不符實。

【修法】在這個 contract 檔補一條：讀取 repo 根目錄的 .prospec.yaml，parse 出 `knowledge.generated_artifacts`，斷言它 includes `BUNDLED_TEMPLATES_SOURCE`；並對每個宣告的 glob/path 保留 existsSync 或至少 posix 形式的守衛。用上述 `.prospec.yaml` 改路徑的 mutation 驗證它會 RED。這條同時也是 T-3 端到端缺口的最小補丁之一。

mutation 已還原，`git diff | git apply --check --reverse` 通過。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-17 -->
### F-17

### [test-quality / T-6] src/types/config.ts:175, tests/unit/lib/config.test.ts

REQ-TYPES-076 是本變更的 ADDED 需求，帶三條驗收準則：
  1. `knowledge.generated_artifacts` parses as an array of strings (glob patterns)
  2. When absent, defaults to `[]` (no exclusions)
  3. Existing `.prospec.yaml` files without the field continue to parse without error (`.loose()`)

【掃描結果】`grep -rn 'generated_artifacts' tests/` 的唯一命中是 tests/contract/generated-artifacts-single-source.test.ts:4，那是一行 JSDoc 註解，不是斷言。tests/unit/lib/config.test.ts 完全沒有觸及這個欄位。三條 AC 都沒有載體。

【為何不是可略過的缺口】
- AC-2「When absent, defaults to []」目前是由 **兩個不同機制** 同時提供的：Zod 的 `.default([])`，以及兩個呼叫端各自寫的 `?? []`（check.service.ts:183 / mcp.service.ts:365）。沒有測試就無從得知哪個機制在生效——把 `.default([])` 拿掉、或把 `?? []` 拿掉，行為都不變，兩邊互相遮蔽。這正是 PB-001 準則三（mutation-verify）要防的「機制存在但無人證明它在跑」。
- AC-3 的 `.loose()` 向後相容主張，在既有 fixture 裡雖然被間接經過（許多測試的 config 都沒有這個欄位），但沒有任何一條斷言把「無此欄位 → 解析成功且 generated_artifacts 為 []」這個結果本身釘下來；一旦有人把 `.optional()` 拿掉改成必填，這個變更會以 T-2 描述的 typecheck 錯誤形式浮現，而不是以測試紅燈形式浮現——對下游專案（真正吃 `.loose()` 的那群）則完全無防護。
- AC-1 的「array of strings」型別約束同理：把 `z.array(z.string())` 換成 `z.array(z.any())` 或 `z.string()`，沒有測試會紅。

【與 T-2 的關係】T-2 是這個 schema 寫法（`.optional().default([])`）造成的 build 破口，屬於既有站點的連帶損傷；T-6 是這個 schema 本身的新行為沒有正向覆蓋。兩者根因同源但修法不同：T-2 要改 schema 寫法或補齊 6 個站點，T-6 要在 tests/unit/lib/config.test.ts（或既有的 config schema 測試處）補三條 parse 斷言。

【修法】在 config 的 schema 測試處補：(a) 給定含 `knowledge.generated_artifacts: ['dist/bundle.js', '*.pb.ts']` 的物件，parse 後該欄位等於原陣列；(b) 給定 knowledge 存在但無此欄位，parse 後為 `[]`；(c) 給定完全沒有 knowledge 區塊，parse 不拋錯。逐條用 mutation（拿掉 `.default([])`、把 `z.string()` 換成 `z.any()`）驗證會 RED。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-18 -->
### F-18

### [correctness / M-1] src/lib/drift-sources.ts:1837 vs src/services/status.service.ts:116-127

src/services/status.service.ts:116-127 早就有一個「最後一筆 prospec-verify 的 grade」helper：

  for (let i = qualityLog.length - 1; i >= 0; i--) {
    const entry = qualityLog[i];
    if (entry !== undefined && entry.skill === 'prospec-verify' && entry.grade !== undefined) return entry.grade;
  }

它的判準是「最後一筆**帶 grade 的** prospec-verify 條目」。本變更在 src/lib/drift-sources.ts:1837 新寫的是 `quality_log.findLast(isVerify)`，判準是「最後一筆 prospec-verify 條目」，不管有沒有 grade，接著才用 isPass 看 grade 或 legacy result。

差異可觀測：`prospec change log --skill prospec-verify --result WARN`（src/cli/commands/change-log.ts:73 的 `--grade` 是 optional）可以合法追加一筆沒有 grade 的 prospec-verify 條目。假設 quality_log 是 [verify grade S] → [verify result WARN 無 grade]，status-router（src/lib/status-router.ts:175-180）看到 lastVerifyGrade='S' 判定已通過，metadata-completeness 的 hasVerifyGrade 卻回 false 判定 missing_verify_grade。同一份 metadata、兩個 gate、相反答案。

這個 repo 的 playbook PB-006（prospec/ai-knowledge/_playbook.md:64）明文要求 parallel modules 的重複邏輯抽成單一來源 helper；這次新增時序判準是把第二份實作寫進另一個模組，正是 PB-006 描述的形狀。建議把「最後一筆 prospec-verify 條目」抽成一個共用 helper（lib 層），status.service 與 drift-sources 都走它，語意差異一次拍板。

（順帶查證過幾件不是問題的事：GRADED_STATUSES 只有 verified/archived（src/lib/drift-sources.ts:239），呼叫點 1806 行是 `GRADED_STATUSES.has(status) && !hasVerifyGrade(...)` 短路，所以 else 分支實務上只會收到 'verified'，非 graded status 行為不變，符合 US-2 第三條；hasVerifyGrade 沒有其他呼叫點。Array.prototype.findLast 在 tsconfig lib es2023 與 engines node>=22.13.0 下都可用，不是相容性問題。appendQualityLogEntry（src/lib/change-metadata.ts:133-136）用 addIn 追加在陣列尾端，findLast 的時序假設成立。verify record 在 B/C/D 時只是不推進 status（src/services/verify-record.service.ts:318 的 isStatusBefore 守衛），不會降級，所以 US-2 那個「verified 之後 re-verify 拿 B」的情境確實可達，不是空規則。）
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-19 -->
### F-19

### [correctness / M-2] src/lib/generated-artifacts.ts:1-19

src/lib/generated-artifacts.ts 刪掉了 GENERATED_SOURCE_ARTIFACTS，但整段 docblock 一字未動，仍在描述被刪掉的那個 registry：

  * Repository files that are BUILD OUTPUT rather than authored source.
  * Scope is deliberately narrow: these paths are excluded from the module
  * staleness comparison only (`last_src_commit`, REQ-LIB-015).
  * …
  * Each path is repository-root relative and posix-separated, and is the single
  * source shared with the artifact's producer …

檔案裡現在只剩一個匯出：`export const BUNDLED_TEMPLATES_SOURCE = 'src/lib/bundled-templates.ts';`。「these paths are excluded from the module staleness comparison」對這個常數已經是假的——它不再被任何 staleness 查詢消費（唯一的排除來源是 .prospec.yaml 的 knowledge.generated_artifacts），複數 "paths" / "Each path" 也沒有對應物。

delta-spec.md 的 REQ-LIB-039 After 明說：「`BUNDLED_TEMPLATES_SOURCE` remains a build-time constant for the templates bundler (single-source for the producer's output location) … The build constant and the check configuration are two separate concerns: one tells the bundler where to write, the other tells `prospec check` what to exclude from staleness.」docblock 講的正好是被切開的那件事還黏在一起。

在這個 repo 裡 docblock 是被當作契約在讀的（tests/contract/generated-artifacts-single-source.test.ts 的 header 就已經同步改寫了），留一段自我否定的模組說明比沒有說明更糟：下一個要調整 staleness 豁免的人會來改這個常數，而那不會有任何效果。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-20 -->
### F-20

### [spec-architecture / S-9] src/services/mcp.service.ts:70,365 (missed site: tests/contract/mcp-server.test.ts:150)

`src/services/check.service.ts:183` 的注入形狀是 `collectGitTimestamps(cwd, moduleMap, paths.knowledgePath, config.knowledge?.generated_artifacts ?? [])`——呼叫端解析、collector 收窄後的 `readonly string[]`。`src/services/mcp.service.ts` 走另一條路：70 行把 `config: ProspecConfig` 塞進 `McpServerContext` 介面，86 行灌入整包 config，再到 365 行的 `readHealth` 內重複寫一次 `ctx.config.knowledge?.generated_artifacts ?? []`。同一個設定值在兩個平行呼叫點用兩種形狀解析，正是 `prospec/ai-knowledge/_playbook.md:73`（PB-007）點名的「新消費者必須走同一個 canonical resolver、不得各自重推」家族；讓 `McpServerContext` 只帶 `generatedArtifacts: readonly string[]` 就能與 check.service 對齊，且不會把整份 config 的生命週期綁進 MCP context。代價已經具體出現：介面新增必填欄位後三個 `McpServerContext` 建構點只改了兩個，`npx tsc -p tsconfig.typecheck.json` 回 `tests/contract/mcp-server.test.ts(150,34): error TS2345: ... Property 'config' is missing in type ...`；而補上的兩個（`tests/contract/mcp-server.test.ts:92`、`tests/unit/services/mcp.service.test.ts:81`）都寫成 `config: { version: '1.0.0', project: { name: 'test' } } as any`，各自新增一個 `@typescript-eslint/no-explicit-any` lint error（違反 `_conventions.md:89`）。若 context 只帶一個字串陣列，這三處都不需要 `as any`。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R2-1 -->
### R2-1

這個缺陷是在稽核 F-2 修復時浮現的：任務指定我確認「REQ-TYPES-076 是 ADDED REQ，其 **Description** 是否算落地區塊」。追這條線時先確認了落地機制——src/services/archive.service.ts:1841 的 buildDescriptionBody 會把 ADDED REQ 的 `**Description:**` 加上 `**Acceptance Criteria:**`（數字清單轉成 `-` bullet）組成 landing body，:1869 的 landingBody 對 ADDED 以 descriptionBody 為 fallback，所以 F-2 改寫的那段 Description 確實會逐字進入信任區（因此它必須是英文，這點 F-2 做對了）。但接著比對該 ID 在信任區的現況，發現 ID 本身就撞號。

事實面：prospec/specs/features/drift-detection.md:642 是 `#### REQ-TYPES-076: \`spec-counters\` drift check id`，:660 是 `#### REQ-TESTS-074: REQ-heading matcher and spec-counters tests`，兩者都在 Behavior Specifications 區、都不在 `## Deprecated Requirements`，且 Change History :766 明列 `2026-08-06 | unify-req-heading-matcher | ADDED REQ-LIB-041; ADDED REQ-TYPES-076; ADDED REQ-LIB-042; ADDED REQ-SERVICES-077; ADDED REQ-TESTS-074`——兩個 ID 都已畢業為現役 REQ。而本變更的 delta-spec.md:90 的 `## ADDED` 區下，:92 是 `### REQ-TYPES-076: generated_artifacts config field`、:109 是 `### REQ-TESTS-074: hasVerifyGrade timeline-aware coverage`，語意與既有 REQ 完全無關。

落地行為面：archive.service.ts 的 mergeRequirementInPlace 在 :2084 寫 `const existingLevel = route.status === 'MODIFIED' ? existingReqLevel(content, route.reqId) : null;`——ADDED 被硬性設為 null，永遠不會進入「以 ID 找到既有 heading 並就地取代」的分支。於是流程直落 :2172 起的註解「ADDED (or a MODIFIED id this spec does not carry yet): append before Edge Cases or at the end」，用 `const titleLine = \`#### ${route.reqId}: ${route.description}\`` 組出新區塊並 `content.replace(insertBefore, ...)` 插在 `## Edge Cases` 之前。結果是 drift-detection.md 會同時存在兩個 `#### REQ-TYPES-076`（一個講 spec-counters check id、一個講 generated_artifacts config field）與兩個 `#### REQ-TESTS-074`。

嚴重性判準：同檔 :2059 的 docblock 自己就把這個形狀命名為已知災難——「Matching the literal `#### {id}:` instead sent every non-h4 spec down the ADDED path, which appended a SECOND section with the same id beside the original — two contradicting bodies for one REQ, reported by neither worklist (issue #138)」。也就是說本變更會用另一條路徑重製 issue #138 的損壞，而且依那段註解，兩份 worklist（pendingConvergence / drops）都不會報出來；:2101 的 duplicates 計數只在 MODIFIED 分支內生效，ADDED 走不到。信任區被寫壞後沒有任何後續站點會收斂它。

可用編號：對 prospec/specs/features/*.md 全域抓取後，REQ-TYPES 的最大值是 081、REQ-TESTS 的最大值是 083，故正確的下一號分別是 REQ-TYPES-082 與 REQ-TESTS-084。修復方式是把 delta-spec 的兩個 ADDED 條目重新編號（並同步 proposal.md / plan.md / tasks.md 內的引用），而不是改 archive 的合併邏輯。

---

**verdict: confirmed**（並且比宣稱更嚴重）。三個環節我都獨立重跑過，沒有一個能推翻。

## (1) 兩個 ID 確實是信任區的活需求

`prospec/specs/features/drift-detection.md:642` 是 `#### REQ-TYPES-076: \`spec-counters\` drift check id`，本文講 `DRIFT_CHECK_IDS` 把 `spec-counters` 當第 15 個 frozen id；`:660` 是 `#### REQ-TESTS-074: REQ-heading matcher and spec-counters tests`，本文講 `matchReqHeading` 的單元測試與 mutation 契約。兩者都在 `### Behavior Specifications` 底下、都不在 `## Deprecated Requirements` 區、都沒有刪除線 —— 是活的，不是 archived 或 retired。

畢業時點也對得上：`:766` 的 Change History 列 `| 2026-08-06 | unify-req-heading-matcher | ADDED REQ-LIB-041; ADDED REQ-TYPES-076; ...; ADDED REQ-TESTS-074; ... |` —— 兩個都是 2026-08-06 由 `unify-req-heading-matcher` 以 ADDED 身分畢業。發現描述的日期與畢業載體完全正確。

而本變更 `.prospec/changes/configurable-generated-artifacts/delta-spec.md` 在 `## ADDED`（:90）底下，`:92` 宣告 `### REQ-TYPES-076: generated_artifacts config field`、`:109` 宣告 `### REQ-TESTS-074: hasVerifyGrade timeline-aware coverage`。兩個 ID 撞號，而且語意完全無關（一個是 config schema 欄位、一個是 hasVerifyGrade 測試覆蓋，對上的是 drift check id 與 matcher 測試）。

## (2) 決定性環節：archive 真的會複製，而且兩份工作清單都不報

`src/services/archive.service.ts:2084` 一行定生死：

```ts
const existingLevel = route.status === 'MODIFIED' ? existingReqLevel(content, route.reqId) : null;
```

`existingReqLevel` 只在 `status === 'MODIFIED'` 時才查。ADDED 一律拿到 `null`，於是 `if (existingLevel !== null)` 的 in-place 合併分支（含 `duplicates` 計數與 `duplicatePending` 回報）**整段被跳過**，直接落到 `:2172` 起的 ADDED 分支：組 `#### ${route.reqId}: ${route.description}`，用 `content.replace('## Edge Cases', ...)` 插入。這裡沒有任何「這個 id 已經存在」的檢查。

我沒有只讀碼就下判斷 —— 我把真實的 `prospec/specs/features/drift-detection.md` 與真實的 delta-spec 複製到 fixture，直接呼叫真正的 `syncToFeatureSpecs(changeDir, featuresDir, 'configurable-generated-artifacts', false)`。結果：

- `files:` 有寫出（不是拒絕）
- `pendingConvergence: []`、`droppedBehavior: []`、`refusedRequirements: []` —— **全空**
- 輸出檔內 `#### REQ-TYPES-076` 出現在 **621 與 662** 兩處；`#### REQ-TESTS-074` 出現在 **630 與 680** 兩處

也就是同一份 feature spec 裡，同一個 REQ id 各有兩個區塊、兩份互相矛盾的本文，而且兩份工作清單都不吭聲。這正是 `:2059` 註解自己指名的 issue #138 損害形狀：「sent every non-h4 spec down the ADDED path, which appended a SECOND section with the same id beside the original — two contradicting bodies for one REQ, reported by neither worklist」。#138 修的是「非 h4 spec 走錯路」這個成因；ADDED 撞號是**同一個損害形狀的另一條入口**，而且是 #138 的修復刻意不涵蓋的那條（`route.status === 'MODIFIED' ?` 這個三元把 ADDED 明確排除在查詢之外）。

**額外發現（比宣稱更糟，發現本身沒提）**：插入點錯了。`content.replace('## Edge Cases', ...)` 取的是**字串第一次出現**的位置，而 `drift-detection.md:619` 的一條 acceptance bullet 裡有 inline code `` `## Edge Cases` ``（原文：「an h1-level REQ would swallow \`## Edge Cases\` and the Change History table」）。真正的 `## Edge Cases` 章節標題在 `:731`。所以兩個新區塊是被塞進 **619 那條 bullet 的中間**，把該 bullet 攔腰截斷（fixture 第 620 行結尾停在一個孤懸的反引號）。所以實際損害是「重複區塊 **＋** 一條既有 acceptance scenario 被切斷」，而且一樣兩份清單全空。

## (3) 下一個可用號碼：REQ-TYPES-082 / REQ-TESTS-084（宣稱正確）

我不採信發現給的數字，自己重掃了全部來源：`prospec/specs/`（含 `features/` 與 `_archived-history/`）、`.prospec/changes/*/delta-spec.md`、`.prospec/archive/`（實存，85 個項目）。

- `REQ-TYPES-*` 出現過的最大號 = **081**
- `REQ-TESTS-*` 出現過的最大號 = **083**

進行中 delta-spec 只出現 REQ-TESTS-071、REQ-TESTS-074、REQ-TYPES-076（都是本變更自己的），沒有更高號佔位。所以下一個未占用號碼是 **REQ-TYPES-082** 與 **REQ-TESTS-084** —— 與宣稱一致。

## (4) 可達性：前面沒有任何閘門會攔

這是我最想用來推翻發現的角度，結果反而坐實了它。

- **`req-references`**（`src/lib/drift-checker.ts:108-126`）只做 `refs.filter((r) => !defined.has(r.id))`，即「被引用但未定義」的 dangling 檢查。撞號的 ID 是**已定義**的，`defined.has()` 為真，永遠不報。
- **`req-definitions` 側的 `collectReqDefinitions`**（`src/lib/drift-sources.ts:324-345`）把 id 收進 `const ids = new Set<string>()`。Set 天生把重複折疊掉 —— 就算 spec 裡真有兩個同 id 區塊，這個索引也只會看到一個。它結構上沒有偵測重複的能力。
- **全部 17 個 `DRIFT_CHECK_IDS`**（`src/types/drift-report.ts:18` 起：req-references、file-paths、import-direction、knowledge-health、task-completion、dangling-prefix、feature-modules、mcp-readme-counts、review-provenance、metadata-completeness、knowledge-size、test-provenance、constitution-severity、artifact-language、spec-counters、delta-spec-provenance、unjustified-budget-override）沒有一個檢查「REQ 定義重複」或「ADDED id 是否已被占用」。
- **`spec-counters`** 也救不了：它比對 frontmatter 的 `story_count`/`req_count` 與本文推導值。archive 前 spec 是自洽的（65 = 65），archive 後 `finalize` 會依本文重寫計數，所以重複那一筆只會讓計數一起長大、依然自洽。它偵測的是「計數與本文不合」，不是「本文自我重複」。
- **archive Entry Gate**：`.claude/skills/prospec-archive/SKILL.md` 全篇對 ADDED 的處置是「appended（新 spec 依 scaffold 建立）」、Phase 3.5 的判斷工作是 refused REQ 與人工歸位（`:120` 甚至明說「the mechanical merge appends before Edge Cases」），checklist（`:128`、`:130`）只要求「每個被 CLI **拒絕** 的 REQ 已修好」與「每個 REQ 已 routed 進 feature spec（CLI 回報、抽查）」。這裡沒有任何一條會對「ADDED id 已存在」發難 —— 而且因為兩份工作清單都空、CLI 也回報寫入成功，抽查者拿到的訊號全是綠的。
- 我另外在 `src/` 全域搜過 `already exist` / `collision` / `duplicate id` / `duplicate REQ`，沒有任何撞號守衛。

所以路徑是暢通的：`/prospec-verify` 不看 REQ 號碼占用，`/prospec-archive` 的 Entry Gate 不看，機械同步本身不看，事後的 drift check 也因為 Set 折疊而看不見。這個缺陷會**靜默**落地。

## 結論

三個宣稱的事實（ID 撞號、archive 會複製且無人回報、下一個可用號碼）全部成立，可達性也成立且無閘門攔截。實測結果甚至比發現描述的更糟（多一條 acceptance bullet 被截斷）。這不是理論風險，是我用真程式碼跑出來的實檔輸出。修法很直接：把 delta-spec `:92`／`:109` 的兩個 ID 改成 REQ-TYPES-082 與 REQ-TESTS-084。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R2-2 -->
### R2-2

F-2 的程式碼修復本身是對的：src/types/config.ts:175 現在是 `generated_artifacts: z.array(z.string()).optional(),`，與同排 :172 的 `additional_core_conventions` 一致；全域 grep 顯示只有兩個讀取點（src/services/check.service.ts:183 與 src/services/mcp.service.ts:365），兩者都寫了 `?? []`，沒有任何一處裸讀。頂層 `.loose()` 只在 ProspecConfigSchema 這一層加索引簽章，KnowledgeSchema 是封閉的 `z.object`，所以不存在 typecheck 看不到的讀取點。問題出在修復同時寫進 delta-spec 的那段理由文字。

第一句實測：把 `.default([])` 加回 src/types/config.ts:175 後跑 pnpm typecheck，輸出剛好 4 個 error TS，分別是 src/services/init.service.ts(124)、tests/unit/lib/config.test.ts(144)、tests/unit/lib/init-docs.test.ts(85)、tests/unit/lib/language-policy.test.ts(80)——四者的共同點是字面值都帶了 `knowledge: { ... }` 物件。錯誤訊息本身就說明了原因：`Property 'generated_artifacts' is missing in type '{ base_path: string; }'`，也就是只有「已經提供 knowledge 物件」的字面值才會被要求補上該欄位；`knowledge` 整個缺席時它是 `undefined`，什麼都不缺。決定性的反例正好是 F-3 修復剛加進來的三處：tests/contract/mcp-server.test.ts:92、:156 與 tests/unit/services/mcp.service.test.ts:81 的 `config: { version: '1.0.0', project: { name: 'test' } }`，這些是被 McpServerContext.config 上下文定型為 ProspecConfig 的 typed 字面值，在 `.default([])` 之下一個錯誤都沒有。所以「every typed `ProspecConfig` literal」是假的，正確說法是「every typed literal that supplies a `knowledge` object」。

第二句同理：src/lib/config.ts:191 的 writeConfig 走 mergeIntoDocument(doc, config)，寫回的是 readConfig 產出的物件；但 KnowledgeSchema 是 `z.object({...}).optional()`，本身沒有 `.default()`，Zod 對缺席的 optional 物件不會實體化其內層欄位的 default。因此一份沒有 `knowledge:` 區塊的 `.prospec.yaml`（例如 tests/contract/mcp-server.test.ts 的 gitFixture 之外那些最小設定）round-trip 後不會被塞進 `generated_artifacts: []`。「any config that round-trips」同樣是過度概化。

為何算 critical 而非 major：這段文字不是變更敘事，而是落地正文。archive.service.ts:1841 的 buildDescriptionBody 對 ADDED REQ 以 `**Description:**` + `**Acceptance Criteria:**` 組成 landing body，:1869 的 landingBody 在 ADDED 時採用它，於是整段（含這兩句全稱句）會逐字寫進 prospec/specs/features/drift-detection.md 成為 REQ-TYPES-076 的 body。信任區是英文技術參考、被逐行引用，之後沒有任何站點會回頭訂正一句寫死的假理由——這與本輪 round 1 判為 critical 的 F-5（出貨模板敘述已被推翻的 .some() 語意）、F-6（已畢業 REQ 被證偽卻未列入 delta-spec）屬同一類。修法很小：把兩句收斂為有界敘述（「every typed literal that carries a `knowledge` object」、「any config that already declares a `knowledge` block」），或整段刪掉只留行為陳述——理由本來就該放在 **Reason:**，那一塊不會落地。

---

**verdict: confirmed**。兩句全稱句在字面讀法下都是假的，而且都被本變更自己的程式碼推翻。我採用的是**字面讀法**（unqualified universal quantifier 依其字面範圍解釋），理由見最後的相稱性判斷。

## 先確立「這段文字會逐字進信任區」

`buildDescriptionBody`（`src/services/archive.service.ts:1841-1851`）：

```ts
function buildDescriptionBody(bodyLines: string[]): string {
  const description = extractDeltaBlock(bodyLines, 'Description').content;
  const criteria = extractDeltaBlock(bodyLines, 'Acceptance Criteria').content;
  const bullets = criteria.split('\n').map((l) => l.replace(/^\s*\d+\.\s+/, '- '))...
  return [description, bullets].filter((part) => part !== '').join('\n');
}
```

`description` 是**原封不動**取出的（只有 Acceptance Criteria 的數字編號被改成 `- ` bullet）。它在 `:1605` 進 `route.descriptionBody`，ADDED 又沒有 `**Spec:**` 區塊時它就是 landing body。

我不是只讀碼 —— 在 R2-1 那次真實 `syncToFeatureSpecs` 跑完後，fixture 的 `drift-detection.md:622` 就是這段 Description **一字不差**的原文，含「breaking every typed `ProspecConfig` literal」與「into any config that round-trips through `readConfig` → `writeConfig`」。落地是實測過的事實。之後也沒有任何站點會校正它：archive Phase 3.5 的人工工作是處理 refused REQ 與歸位，不是重寫已成功落地的 Description；而這次落地連 pendingConvergence 都是空的，不會有任何提示要人回頭看這段字。

## (a)「breaking every typed `ProspecConfig` literal」—— 假

基準線先確認乾淨：mutation 前 `pnpm typecheck` 是 **0 個 error**。

加上 `.default([])` 後，**恰好 4 個 error TS**：

1. `src/services/init.service.ts(124,5)` —— 這是 `prospec init` 的那個 literal
2. `tests/unit/lib/config.test.ts(144,37)`
3. `tests/unit/lib/init-docs.test.ts(85,20)`
4. `tests/unit/lib/language-policy.test.ts(80,50)`

四個的錯誤訊息形狀一致：`Property 'generated_artifacts' is missing in type '{ base_path: string; }'` —— 換言之，**四個全都是帶 `knowledge` 物件的 literal**（第 2 個訊息裡直接印出 `knowledge: { base_path: string; }`）。壞掉的判準不是「是不是 typed ProspecConfig literal」，而是「這個 literal 有沒有寫出 `knowledge` 子物件」。

被點名的三個 literal 我逐一確認：

- `tests/contract/mcp-server.test.ts:92` → `config: { version: '1.0.0', project: { name: 'test' } },`
- `tests/contract/mcp-server.test.ts:156` → 同上
- `tests/unit/services/mcp.service.test.ts:81` → 同上

三個都經由 `McpServerContext.config: ProspecConfig`（`src/services/mcp.service.ts:70`）取得 contextual typing，**確實是 typed `ProspecConfig` literal**，但都省略 `knowledge`，於是 `knowledge` 保持 `undefined`，`.default([])` 從未被觸及。`pnpm typecheck 2>&1 | grep -E 'mcp-server|mcp.service'` 在 mutation 生效時**零輸出** —— 它們編譯全綠。

我另外找到兩個同樣沒壞的 typed literal：`tests/unit/services/agent-triggers.service.test.ts:17`（`({ project: { name: 't' }, ...extra }) as ProspecConfig`）與 `tests/unit/lib/language-policy.test.ts:104`（`{ project: { name: 'demo' } } as ProspecConfig`）—— 兩者也都不帶 `knowledge`。

所以：**至少 5 個 typed `ProspecConfig` literal 在 `.default([])` 下毫髮無傷**。「every」在字面上被反例推翻。

我試著找一個能救它的讀法：如果把句子讀成「every typed `ProspecConfig` literal *that declares knowledge*」，它就是真的。但原文沒有這個限定子句，而且緊接的括號「(`prospec init`'s among them)」是在**舉例強化全稱範圍**，不是在收窄它 —— 讀者拿到的訊息是「所有 typed literal 都會壞」。這個讀法救不了。

## (b)「would write `generated_artifacts: []` into any config that round-trips」—— 假

前提先確認：`src/types/config.ts:170-176` 的 `KnowledgeSchema` 以 `}).optional();` 收尾，`:203` 是 `knowledge: KnowledgeSchema,`。所以 `knowledge` 自己就是 optional 且**沒有 default**。發現的前提正確。

我沒有停在推理，做了真實 round-trip：在 mutation 仍生效的狀態下，用真正的 `readConfig` / `writeConfig` 跑兩份 `.prospec.yaml`。

**無 `knowledge` 區塊者**：
```
parsed knowledge: undefined
檔案 round-trip 後：
version: "1.0.0"
project:
  name: demo
```
—— 一個字都沒多。`knowledge` 是 undefined，`writeConfig` 的 `mergeIntoDocument` 沒有東西可以合併，`generated_artifacts` 根本不會出現。

**有 `knowledge` 區塊者**：
```
parsed knowledge: {"base_path":"prospec/ai-knowledge","generated_artifacts":[]}
檔案 round-trip 後：
knowledge:
  base_path: prospec/ai-knowledge
  generated_artifacts: []
```
—— 這一份才會被污染。

所以真正的行為是「**任何已帶 `knowledge` 區塊的 config**」，不是「any config」。原文的 `any` 在英文技術文件裡就是全稱量詞（= every），字面上為假。

## 相稱性判斷

我刻意分開評「結論」與「論據」：

- **這段話的結論是對的**。不用 `.default([])` 是正確的工程選擇 —— 它確實會弄壞 4 個 literal（包含 `prospec init` 自己那個，這個括號完全屬實），也確實會把 `generated_artifacts: []` 寫進帶 `knowledge` 的 config。決策沒有問題，不需要改設計。
- **兩句論據作為寫下的斷言是假的**，不只是「不夠精確」。差別在於：「不夠精確」是範圍描述得含糊；這裡是明確斷言了一個全稱範圍，而該範圍內存在可具體點名的反例（5 個 literal、以及所有不帶 `knowledge` 的 config）。一個讀了這段 spec 的後人若據此推論「任何 ProspecConfig literal 都不能省略 knowledge 欄位」或「任何 config round-trip 後都會長出這個欄位」，都會得到錯誤結論。信任區的文字是被當作契約引用的，這就是它的殺傷力所在。

嚴重度上這屬於「信任區全稱句」這一類 —— 本專案歷史上反覆出現、且是逐輪 review 的 critical 常客。修法極輕：把 (a) 收窄為「every typed `ProspecConfig` literal that declares a `knowledge` object (`prospec init`'s among them)」，把 (b) 收窄為「into any config that already carries a `knowledge` block」。兩處各改幾個字，結論與論據就一致了。

## Mutation 已精確還原

`src/types/config.ts:175` 回到 `generated_artifacts: z.array(z.string()).optional(),`；`git diff src/types/config.ts` 只剩本變更原有的那一行新增；`git diff --stat` = **19 files changed, 234 insertions(+), 69 deletions(-)**；`pnpm typecheck` 回到 **0 error**。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-21 -->
### F-21

以 `grep -oP '[\x{4e00}-\x{9fff}]' | wc -l` 逐檔計數：delta-spec.md = 0、proposal.md = 1125、plan.md = 685、tasks.md = 208。亦即同一個變更的其他三份工件都遵循 Language Policy，只有 delta-spec.md 整檔英文。

Constitution `prospec/CONSTITUTION.md` [MUST] Language Policy 的 change-artifact 例外只有一條，且範圍明確：「the `**Spec:**` block of `.prospec/changes/**/delta-spec.md` — it lands verbatim as the REQ body in `prospec/specs/features/**`, so it is authored in THAT zone's language; **the surrounding Before/After/Reason narrative stays in Traditional Chinese (Taiwan)**」。本檔三條 MODIFIED REQ（REQ-LIB-039、REQ-LIB-025、REQ-TESTS-071）的 Before/After/Reason 全為英文散文，兩條 ADDED REQ 的 Description 則屬落地載體、英文正確。

機器面佐證：`prospec check` 的 artifact-language 檢查對 `.prospec/changes/configurable-generated-artifacts/delta-spec.md` 報 `no Traditional Chinese (Taiwan) prose found — change artifacts are written in Traditional Chinese (Taiwan) (Constitution Language Policy)`。

時序歸屬：本輪只對本檔做了兩件事——REQ ID 改號（純識別碼替換）與 REQ-TYPES-082 Description 的限定詞改寫（落地載體，本就該英文）。兩者都未移除任何中文，故 0 CJK 為既有狀態，屬第一輪漏檢而非修復引入。

不自動修復的理由：補正需要把三條 REQ 的 Before/After/Reason 全部改寫為繁體中文，那是變更作者的敘事，屬 authoring 而非 drop-in 修補，依 skill 契約應交回人類決定。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-1 -->
### R4-1

以機械比對確認：`prospec/specs/features/drift-detection.md` 的 REQ-TEMPLATES-173 目前 body 是 1 段敘述 + 4 條 bullet；F-6 新寫進 delta-spec 的 `**Spec:**` 只有 1 段敘述 + 3 條 bullet。逐行 diff 顯示第三條（B/C/D re-entry）被改寫（舊版已正確登記在 `**Dropped:**` 第 140 行），但第四條 `- WHEN either lifecycle copy omits the re-entry facts, THEN the contract test fails` 直接消失，而 `**Dropped:**` 區塊只列了一條 bullet。

這條 bullet 現在仍然為真：`tests/contract/skill-format.test.ts:4501` 的 `it('both lifecycle copies state the B/C/D re-entry case and review re-running after verified')` 正是它所描述的契約測試，該測試同時讀 `renderTemplate('init/status-lifecycle.md.hbs')` 與 `prospec/ai-knowledge/_status-lifecycle.md`，兩份都必須含 `re-entering after a post-verify edit stays \`verified\``。本輪 F-5 才剛同步這兩份檔案的第 51 行，正是靠這個測試在守。也就是說，這條驗收條件不但沒有被本變更推翻，反而是本變更行為的守門人。

落地機制：`src/services/archive.service.ts` 的 `landingBody()` 對 MODIFIED 只認 `**Spec:**`，`mergeRequirementInPlace` 以該 body 整段取代既有 REQ body。因此結果只有兩種，兩種都是缺陷：(a) `droppedFor()` 把這條 WHEN/THEN 算成 undeclared drop，archive 被擋，這一輪修復反而讓變更封不了；(b) 若操作者為了過關把它補進 `**Dropped:**`，信任區就永久少掉一條仍然成立的驗收條件——正是 F-6 這條修復本身宣稱要防的「信任區永久留著與程式碼相反／缺漏的敘述」。

修法：把該 bullet 原文照抄回 `**Spec:**` 的 bullet 清單末尾，`**Dropped:**` 維持只列 B/C/D 那一條。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-2 -->
### R4-2

F-8 的新行為以實測確認：在 temp repo 中 `git log -1 --format=%cI -- src/lib ':(exclude)src/**'` 的 exit code 為 0、輸出為空（不是失敗），所以走的是「成功但空」這條新分支，`gitLastCommit` 於是回傳未排除查詢的結果。換言之，被宣告為 generated 的檔案在「glob 涵蓋整個模組」時會照樣推動 `last_src_commit`，模組會被判 stale。

這正是新測試 `tests/unit/lib/drift-sources.test.ts:1162` 釘住的行為，而該測試的名稱把它歸給 `(REQ-LIB-039)`。但 delta-spec 第 24 行的 REQ-LIB-039 `**Spec:**` bullet 是無條件全稱句：`WHEN a configured glob matches files under a module's paths, THEN those files are excluded from the staleness \`last_src_commit\` query but remain inside \`computeChangeDigest\``。整模組被涵蓋時，第一次查詢確實帶了 `:(exclude)`，但它回空、實際被報出去的 `last_src_commit` 來自不帶排除的第二次查詢，因此對讀者而言「those files are excluded」是假的。這個 `**Spec:**` 會在 archive 時逐字落進 `prospec/specs/features/drift-detection.md`，形成信任區的全稱假句——與前幾輪 review 反覆抓到的同一類缺陷。

同一份 delta-spec 的 REQ-TESTS-071（第 74-81 行）列了 `WHEN the excluded-pathspec capture is fault-injected to fail, THEN the collector reports the unexcluded timestamp rather than null`，卻沒有對應「WHEN a configured glob covers every file a module has」的那條，所以新增的測試在測試面 REQ 也沒有載體。

另附：`proposal.md:23` 的 US-1 驗收情境 `WHEN 設定宣告了 glob（如 src/generated/**），THEN 符合的檔案全部被排除` 同樣是被 F-8 推翻的全稱句；Edge Cases 第 63 行只涵蓋「git pathspec 不支援」一種降級，沒有涵蓋整模組涵蓋這種。

修法：把 REQ-LIB-039 bullet 4 加上例外子句（排除只在還有未被涵蓋的檔案時可觀測；當 glob 涵蓋模組全部檔案時降級為未排除的時間戳，寧可吵也不 fail-open），並在 REQ-TESTS-071 補一條對應的覆蓋 bullet。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-3 -->
### R4-3

掃描信任區殘留舊語意：`grep -rn -e 'nor \`metadata-completeness\`' -e 'any earlier S/A' -e 'no machine check' -e 'both \`status\` and \`metadata-completeness\` green' src/templates/ .claude/ .agents/ prospec/ai-knowledge/ prospec/specs/features/` 只剩四個命中，全在 `prospec/specs/features/drift-detection.md`：557 與 561 屬 REQ-TEMPLATES-171（F-6 已用 `**Spec:**` 覆蓋）、580 屬 REQ-TEMPLATES-173（同上），剩下 542 這一條屬 `## US-14` 的 `**Acceptance Scenarios:**`，內容是 `- WHEN the /prospec-archive Entry Gate runs, THEN it reads all three checks and refuses to archive on any FAIL, and states that a re-verify which does not reach S/A leaves both \`status\` and \`metadata-completeness\` green while the change is not archivable`。

`hasVerifyGrade(quality_log, status)` 現在對 `verified` 只讀最新一筆 `prospec-verify`（`src/lib/drift-sources.ts:1837-1849`），`GRADED_STATUSES = {verified, archived}`，所以 B/C/D re-verify 後 `metadata-completeness` 會 FAIL——這句已為偽。

沒有載體可以更正它：`src/services/archive.service.ts` 的 `mergeRequirementInPlace` 以 REQ ID 定位並只取代 REQ section 的 body，US 段落與其 Acceptance Scenarios 不在任何路由裡；delta-spec 全文也沒有出現過 `US-14`（grep 計數為 0）。這正是 F-6 自己在 REQ-TEMPLATES-171 的 **Reason:** 裡寫的失效模式——「archive 只搬變更列出的 REQ，若不列為 MODIFIED，信任區會永久留著一條與程式碼相反的敘述」——只是這次漏的是 US 層。

修法：因為 US 層無畢業載體，必須在 archive 的手動收斂步驟中一併改寫 542 行（或在 delta-spec/plan 明確記下這筆手動工作），否則封存當下就會留下矛盾。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-4 -->
### R4-4

`grep -n 'GENERATED_SOURCE_ARTIFACTS' prospec/ai-knowledge/modules/lib/drift-engine.md src/lib/generated-artifacts.ts` 只在知識檔命中，程式碼端已無此符號——`git diff src/lib/generated-artifacts.ts` 顯示 `export const GENERATED_SOURCE_ARTIFACTS = [BUNDLED_TEMPLATES_SOURCE] as const;` 已被刪除。

該行完整內容為 `- \`GENERATED_SOURCE_ARTIFACTS\` subtracts build output from \`last_src_commit\` only, never from the digest; an unparsable \`:(exclude)\` falls back to the unexcluded query (null reads as not-stale).`，兩個事實都壞掉：(1) 符號不存在，排除來源已改為 `.prospec.yaml` 的 `knowledge.generated_artifacts`（`src/services/check.service.ts` 與 `src/services/mcp.service.ts` 皆以 `config.knowledge?.generated_artifacts ?? []` 注入）；(2) 「an unparsable `:(exclude)`」這個限定詞正是 F-8 改掉的——現在成功但回空的排除查詢也會退回未排除查詢（`src/lib/drift-sources.ts:1337-1346`）。

`prospec/ai-knowledge/**` 屬信任區，且本變更已經動過知識庫（module-map.yaml、index.md、modules/tests/README.md 的測試計數），代表知識同步是本變更範圍內的工作，只是漏了這一份。沒有機械 check 會抓：`req-references`／`file-paths` 檢查的是連結與 REQ ID，不檢查 TypeScript 符號是否存在，所有 gate 目前全綠。

修法：把該 bullet 改寫為設定驅動的敘述，並把退回條件寫成「排除查詢無答案時（不論失敗或為空）退回未排除查詢」。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-5 -->
### R4-5

Constitution（`prospec/CONSTITUTION.md` [MUST] Language Policy）在 change-artifact 區只列一項英文例外：「the `**Spec:**` block of `.prospec/changes/**/delta-spec.md` — it lands verbatim as the REQ body ... the surrounding Before/After/Reason narrative stays in Traditional Chinese (Taiwan)」。同一段文字由 `src/lib/language-policy.ts:75-76` 的 `englishExceptions` 生成，只有這一條。因此 `**Description:**`／`**Acceptance Criteria:**` 寫英文，按規則字面就是違規。

房規實測：`.prospec/archive/*/delta-spec.md` 中所有含 ADDED 區的變更（近期 20 個，含 2026-08-10-unify-line-splitting、2026-08-10-separate-review-evidence、2026-08-09-add-issue-link-field 等）其 `**Description:**` 數與 `**Spec:**` 數完全相等——每條 ADDED REQ 都同時具備繁中的 Description/AC 與英文的 `**Spec:**`。本變更 ADDED 區的 `**Spec:**` 計數為 0。

落地後果不只是語言：`src/services/archive.service.ts:1868-1871` 的 `landingBody()` 是 `route.specBody ?? fallback`，`fallback` 只在 ADDED 時等於 `buildDescriptionBody()`（Description 段 + 把 `1.` 編號轉成 `- ` 的 AC 清單）。所以現況下這兩條 ADDED REQ 會用規劃敘述 + 非 WHEN/THEN 的驗收條列落進 `prospec/specs/features/drift-detection.md`，與該檔其他 REQ 的行為敘述體例不符——房規之所以每條 ADDED 都寫 `**Spec:**`，就是為了讓落地的是行為敘述而不是規劃文字。

也就是說 F-21 的取捨是在一個壞掉的前提下做的：因為沒有 `**Spec:**`，作者只能在「繁中但把中文搬進英文信任區」與「英文但違反 Language Policy」之間二選一。

修法：為 REQ-TYPES-082 與 REQ-TESTS-084 各補一段英文 `**Spec:**`（WHEN/THEN 行為敘述），並把 `**Description:**`／`**Acceptance Criteria:**` 譯回繁體中文（台灣），與 archive 房規一致。

附註：`prospec check` 的 `artifact-language` 目前 PASS，但它只是檔案層級的「有沒有出現該語系字集」（`collectArtifactLanguage` 收 `hasScript`，WARN class），無法辨識區塊層級的語言切分，所以它的綠燈不能當作本項的反證。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-6 -->
### R4-6

把 `tests/unit/lib/drift-sources-git-capture.test.ts:97` 暫時改成 `state.failExcludePathspec = false;` 後執行該檔，結果 `3 passed`，其中包含 `falls back to the unexcluded timestamp instead of reporting no source commit`（已改回原值，`git diff --stat` 總計已復原為 27 files changed, 271 insertions(+), 85 deletions(-)）。原因是 F-8 之後兩條路徑同流：故障注入時 capture 失敗 → `?.trim()` 得 undefined → 落到未排除查詢；故障不觸發時 `git log -1 --format=%cI -- src/lib ':(exclude)src/lib/x.ts'` 成功且回空（我以 real git 在 temp repo 驗證 exit=0、輸出為空）→ `''` 為 falsy → 同樣落到未排除查詢。兩者都得到 truthy 的時間戳。

因此註解第 100-102 行「were the injected fault to stop firing — this would read as 'no source commit', which \`isStale\` takes for 'not stale'」是錯的。

但測試並未空轉：我另外把 `src/lib/drift-sources.ts` 暫時改成 `if (excluded === undefined) return null; if (excluded) return excluded;`（只把「capture 失敗」折回 null、保留空字串的退回），執行後只有這個 F-1 測試轉紅（`expected null to be truthy`），而 `drift-sources.test.ts` 的 195 個測試全綠。也就是說 F-1 測試仍是唯一能殺掉該 mutant 的斷言，故 **仍為非空轉**（程式碼已還原）。

修法：把註解中「were the injected fault to stop firing」那個子句刪掉或改寫為「故障注入釘的是 capture 失敗這一條路徑；『成功但為空』由 drift-sources.test.ts 的 whole-module 案例分開釘」，避免宣稱一個實測不成立的不變式。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-7 -->
### R4-7

以 mutation 實測：把 `src/lib/drift-sources.ts:1345` 暫時改成 `if (excluded !== undefined) return excluded;`（排除查詢成功回空時直接回傳空字串），執行 `npx vitest run tests/unit/lib/drift-sources.test.ts`，唯一失敗是第 1170 行的 `AssertionError: expected '' to contain '2026-06-10'`；第 1171 行的 `.not.toBeNull()` 因為 `''` 不是 null 而通過。程式碼已還原，`git diff --stat` 總計回到 27 files changed, 271 insertions(+), 85 deletions(-)。

換句話說第 1171 行在兩種情境下都沒有貢獻：值正確時 `.toContain` 已經涵蓋；值退化成 null 時 `.toContain` 會先炸；值退化成 `''` 時它自己還是綠的。而且 `libHealth(['src/**'])` 被呼叫兩次，等於白跑一次 `collectGitTimestamps`（真 git fixture）。

修法：刪掉第 1171 行；若想釘住「絕不 fail-open」的意圖，改成對 `stale` 或 `last_src_commit` 的單一具名斷言即可。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R5-1 -->
### R5-1

## 現象

把本變更的 `delta-spec.md` 與信任區的 `prospec/specs/features/drift-detection.md` 複製到暫存目錄後，直接呼叫真正的 `syncToFeatureSpecs(archiveDir, featuresPath, 'configurable-generated-artifacts', false)`，產出的信任區檔案在 line 619 附近變成：

```
- WHEN a requirement's boundaries are derived, THEN they end at the first following REQ heading, at the first heading at or above its own level (h1/h2 always, whatever the requirement's level, or an h1-level REQ would swallow `
#### REQ-TYPES-082: generated_artifacts config field
`ProspecConfigSchema`'s `knowledge` object carries a `generated_artifacts` field — …
- WHEN `knowledge.generated_artifacts` is present, THEN it parses as an array of glob strings
…
---


#### REQ-TESTS-084: hasVerifyGrade timeline-aware coverage
…
---

## Edge Cases` and the Change History table), or at a `---` rule
```

也就是說：US-15 那條既有的驗收 bullet 被從 inline code span 的正中央剖成兩半，兩個新的 ADDED REQ（`REQ-TYPES-082`、`REQ-TESTS-084`）連同它們的 `---` 分隔線整段被塞進那個 code span 裡面，而 bullet 的尾巴 `` and the Change History table), or at a `---` rule `` 被推到 20 行之後。

## 根因

`src/services/archive.service.ts:2176-2186`：

```ts
const insertBefore = '## Edge Cases';
…
if (content.includes(insertBefore)) {
  return { content: content.replace(insertBefore, () => newReq + '\n' + insertBefore), pending };
}
```

`String.prototype.replace` 吃字串樣式時只換「第一個」出現位置，而且比對的是純粹的子字串，完全不看 markdown 結構。`grep -n '## Edge Cases' prospec/specs/features/drift-detection.md` 的結果是：

- line 619 — 位於一條 REQ 驗收 bullet 內、被反引號包起來的 `` `## Edge Cases` ``
- line 621 — 同樣是 bullet 內的反引號引用
- line 731 — 這才是真正的 `## Edge Cases` 章節標題

插入點因此落在 line 619，而不是 line 731 的真標題。

諷刺的是，被剖開的那條 bullet 講的正是這件事——它描述 `indexSpec` 如何推導 REQ 邊界，並特別說明「h1-level REQ 會吞掉 `## Edge Cases` 與 Change History table」。同一份規格在別處（US-15）已經明訂讀取端必須用 fence-masked 的視角來辨識標題，但這條寫入路徑既沒有 fence masking，也沒有「必須是行首標題」的錨定條件。

## 為什麼這是 critical

1. **信任區內容損毀且不可逆**：`**Spec:**` 區塊是逐字落地的。封存一旦執行，US-15 那條既有的驗收條件就被永久切成兩段語意破碎的文字，而這不是本變更宣告要修改的 REQ，也沒有出現在 delta-spec 的任何 MODIFIED 條目裡。
2. **兩個新 REQ 落在錯誤位置**：`REQ-TYPES-082` 與 `REQ-TESTS-084` 應該是獨立的 h4 REQ 定義，結果被埋進另一條 REQ 的 bullet 內的 code span。它們既不屬於任何 User Story 的正確切片，其後續的 REQ 邊界推導也全部錯位。
3. **完全靜默**：實跑結果 `pendingConvergence: []`、`refusedRequirements: []`。`droppedBehavior`、`staleDeclarations` 也都沒有攔截。換言之，沒有任何機器閘門會在封存時回報這件事——這正是本專案最忌諱的 fail-open 形狀。
4. **Change History 照樣寫入**：產出檔案尾端仍正常追加了 `| 2026-08-11 | configurable-generated-artifacts | … ADDED REQ-TYPES-082; ADDED REQ-TESTS-084 | …` 這一列，於是稽核軌跡會宣稱兩個 REQ 已正確畢業，掩蓋掉實際的損毀。

## 與 round 4 的因果關係（誠實揭露）

這個缺陷**不是** R4-5 造成的。插入錨點的行為與「落地的是 `**Spec:**` 區塊還是 Description+AC」無關——不論哪個區塊落地，插入位置都一樣錯。`prospec/specs/features/drift-detection.md` 在本次 working tree 中未被修改，line 619 的 `` `## Edge Cases` `` 早已存在於 HEAD。

但它是在執行 R4-5 指定的驗證步驟（「if feasible by running the real archive sync against a temp copy」）時被實測揭露的，而且它會在本變更封存時實際引爆。就嚴重度規則而言，它屬於「trust-zone content loss」，因此以 critical 提報。

## 建議修法方向（不在本輪職權內，僅供裁決參考）

錨定條件應改為「行首且整行等於 `## Edge Cases` 的標題行」，而非子字串比對；理想上重用既有的 fence-masked／heading matcher 單一來源（US-15 已經為讀取端建立了這條規則，寫入端目前是第二套實作）。同時建議補一條回歸測試：以一份在真標題之前就含有 `` `## Edge Cases` `` inline code span 的 fixture spec 走 ADDED 插入路徑，斷言新 REQ 落在真標題之前、且既有 bullet 保持完整。

## 本輪其餘查核結論（無 finding，一併記錄）

- **R4-1 resolved**：以機械化逐句／逐 bullet 比對 `REQ-TEMPLATES-171` 與 `REQ-TEMPLATES-173` 的 delta-spec `**Spec:**` 與信任區現行 body。兩者各只有 1 句 prose（S3）與 1 條 bullet 不同，且差異內容正是本變更刻意要更正的 `hasVerifyGrade` 語意反轉；其餘所有句子與 bullet 皆逐字相同，無任何被靜默改寫的措辭、被丟失的子句或被更動的 backtick 格式。全部差異歸類為 deliberate-correction，accidental-loss 為 0。
- **R4-2 resolved**：新措辭對照 `src/lib/drift-sources.ts:1331` 的 `gitLastCommit` 屬實——`gitCapture(...)?.trim()` 後 `if (excluded) return excluded;` 確實把「capture 失敗」與「查詢成功但為空」合併為同一個 fall-through，因此「EVERY file 被涵蓋」與「pathspec 無法解析」兩種情形都降級到未排除時間戳。SOME-of-the-files 那條 bullet 仍然正確。`REQ-TESTS-071` 與 `REQ-LIB-039` 無衝突（前者釘 fault-injection 分支，後者敘述兩種無答案情形，彼此互補）。`proposal.md` 未觸及降級語意，無矛盾。
- **R4-4 resolved**：三處改寫皆與程式碼相符——`src/lib/generated-artifacts.ts` 現在只剩 `BUNDLED_TEMPLATES_SOURCE`；recipe 改名後 Modification Guide 仍是連續的 1./2. 編號；ripple bullet 的降級敘述與 `gitLastCommit` 一致。`grep -rn 'Add a generated artifact'` 全 repo 零命中，無任何檔案引用舊 recipe 名稱。token 預算方面，實跑 `npx tsx src/cli/index.ts check --json` 顯示 `drift-engine.md` 為 1583 tokens，低於 1800 的 `l2_per_module` 預算（僅 headroom 0.85 的 pressure signal，非超標）。
- **R4-5 resolved**：閱讀 `landingBody`（`src/services/archive.service.ts:1866-1870`）確認 `route.specBody ?? fallback ?? ''`，其中 `fallback` 只在 `route.status === 'ADDED'` 時取 `descriptionBody`；由於 `??` 是 nullish coalescing，只要 `**Spec:**` 區塊非空，`specBody` 就會勝出，Description+AC 完全不參與。實跑真正的 `syncToFeatureSpecs` 佐證：落地的 `REQ-TYPES-082` 與 `REQ-TESTS-084` body 正是英文 `**Spec:**` 區塊，且對整份落地 diff 做 CJK 掃描（`grep -P '[\x{4e00}-\x{9fff}]'` 掃所有新增行）零命中——繁體中文並未進入英文信任區。兩個新 `**Spec:**` 區塊亦忠實承載原驗收條件：`REQ-TESTS-084` 的 AC 1-4 對應 bullet 1-4 完全一致；`REQ-TYPES-082` 的 AC 1-3 亦全數承載（AC3 的 `.loose()` 機制名雖未複述，但「既有設定仍可解析」的行為已寫入 bullet 3）。
- **R4-6 resolved**：新註解為真，且經實測證明。先把 `state.failExcludePathspec` 由 `true` 改為 `false`，測試仍通過——這正是註解自己承認的「fault 已非 outcome-determining」。關鍵驗證是注入 capture-failure 專屬 mutation（把 `gitCapture` 回傳 null 的情形改為 `return null`，即只還原 capture 失敗那半邊）：`drift-sources-git-capture.test.ts` 立刻轉紅（line 111 `toBeTruthy()` 失敗），而 `drift-sources.test.ts` 的姊妹測試 `falls back to the unexcluded timestamp when a configured glob covers the whole module` 維持綠燈。這精確符合註解所述「what this pins is specifically the capture-failure branch, and only reverting THAT reddens it」。
- **R4-7 resolved**：移除 `.not.toBeNull()` 後剩下的斷言仍具殺傷力。把 `gitLastCommit` 還原成舊寫法 `if (excluded !== null) return excluded.trim() || null;`，`covers the whole module` 測試轉紅（`expect(null).toContain('2026-06-10')`）。
- **F-15 resolved**：親自重驗 mutation。在 `archived` 分支前插入 `if (!quality_log.some(isVerify)) return true;` 後，新測試 `rejects an archived change with an empty quality_log or no prospec-verify entries`（c20/c21）轉紅，而 `verified` 那半邊（c18/c19）維持綠燈——證明新測試正是攔截該 fail-open 的唯一防線。mutation 已逐行還原。

## 唯讀紀律

全程僅做暫時性 mutation，每次皆逐行還原。起始 `git diff --stat` 為 `28 files changed, 293 insertions(+), 88 deletions(-)`，結束時完全相同，且 `git status --porcelain` 中非 ` M` 的項目為 0（`prospec-report.json` 已由 `.gitignore:56` 涵蓋，未污染工作樹）。還原後重跑 `tests/unit/lib/drift-sources.test.ts` 與 `tests/unit/lib/drift-sources-git-capture.test.ts` 共 197 tests 全數通過。
<!-- prospec:evidence-end -->

<!-- prospec:evidence V-1 -->
### V-1

本次修復把 mergeRequirementInPlace 的 ADDED 插入錨點從 `'## Edge Cases'` 子字串改為 `/^## Edge Cases[ \t]*$/m`，理由（寫在新增註解裡）是「A spec routinely quotes its own structure, so `## Edge Cases` also occurs inside prose and inline code spans; a first-substring match lands there instead and splices the new REQ into the middle of another requirement's bullet, truncating it. That corruption is silent」。這段理由逐字適用於同一支檔案往下 24 行的 `moveReqToDeprecated`（:2202-2225），而該函式完全沒有被動到。

它有兩條分支。第一條 `content.includes('## Deprecated Requirements\n\n_(None)_')` 因為帶了 `\n\n_(None)_` 後綴，實務上只會命中真標題（drift-detection.md 就是靠這條倖免——它的 Deprecated 區段是 `_(None)_`）。第二條 `content.includes('## Deprecated Requirements')` 則是純粹的第一個子字串，和修復前的 Edge Cases 錨點一模一樣。

機械掃描 prospec/specs/features/ 全部 14 份 spec，比對「第一個含該字串的行」與「第一個整行等於該標題的行」：
- sdd-workflow.md：firstSubstrLine=1076、firstHeadingLine=1948（不一致）
- drift-detection.md：firstSubstrLine=614、firstHeadingLine=755（不一致，但被 `_(None)_` 分支救下）
第 1076 行原文是 `- WHEN a selected REQ sits under \`## Deprecated Requirements\`, THEN it is emitted with its deprecated status marked rather than silently presented as active, and a struck id is reported as struck even where no deprecated section is in force`——正是「spec 引用自己的結構」這個形狀。

實跑驗證（把真實 sdd-workflow.md 複製到 temp dir，餵一條 `## REMOVED` 的 REQ-SERVICES-064 路由，跑 source 版 syncToFeatureSpecs）：
- 第 1076 行變成兩行：`- WHEN a selected REQ sits under \`## Deprecated Requirements` 與 `- **REQ-SERVICES-064**: archive.service does not auto-trigger knowledge-update / raw-scan _(removed 2026-08-11)_\`, THEN it is emitted with ...`。原本一條完整的驗收情境被切成兩半，中間插進一條 deprecation 條目，反引號 code span 也被拆掉。
- 真正的 `## Deprecated Requirements` 標題（:1948）底下沒有任何新增條目——這條 REMOVED 在信任區裡等於沒有落地。
- 回報面：refusedRequirements=0、droppedBehavior=0、acknowledgedDrops=0，只有一筆與此無關的 STALE_DEPRECATED_REASON pendingConvergence。也就是說沒有任何閘門會發現，症狀與 R5-1 原始描述（「pendingConvergence／refusedRequirements 皆為空、Change History 照寫」）完全一致。

嚴重度判定：這不是本次修復造成的迴歸，是既有缺陷；但（a）它今天就對 sdd-workflow.md 生效，而 sdd-workflow.md 正是本變更 REQ-SERVICES-088 自己要落地的那份 spec；（b）`moveReqToDeprecated` 的註解 `// Function replacers keep the untrusted route.description literal — see mergeRequirementInPlace` 直接把讀者導向剛被修好的那支函式，會讓人誤以為兩處同樣安全；（c）drift-detection.md 只要哪天長出第一條 deprecated REQ、`_(None)_` 消失，第二條分支立刻在該檔也生效。因此「這個修復是完整的」這個命題被推翻：同型錨點只修了一個。
<!-- prospec:evidence-end -->

<!-- prospec:evidence V-2 -->
### V-2

新的 `/^## Edge Cases[ \t]*$/m` 把「行內程式碼／散文中的引用」這個子類關掉了，但沒有關掉「圍籬程式碼區塊中、位於行首的同名標題」這個子類。構造探針：一份 spec 在真標題之前先有 ```markdown 圍籬，圍籬內第 6 行是 `## Edge Cases`，真標題在第 9 行——`re.exec` 落在第 6 行，也就是新 REQ 會被插進 code block 內部，同樣不會有任何 worklist 報出來。

這個形狀不是我硬掰的：`src/templates/skills/references/feature-spec-format.hbs:96-103` 的「### 4. Edge Cases」小節，本身就是用 ```markdown 圍籬包一段 `## Edge Cases` 範例來規定 feature spec 的寫法。任何一份 feature spec 只要引用 scaffold（而「引用自己的結構」正是 R5-1 的成因），就會重演。

收斂成本很低：archive.service.ts:10 已經 `import { hasUnclosedFence, withoutFencedBlocks } from '../lib/markdown-fences.js'`，而且 read side 的 US-15 規則早就要求用 fence-masked 視角辨識標題。review.md:983 的建議原文就是「理想上重用既有的 fence-masked／heading matcher 單一來源（US-15 已經為讀取端建立了這條規則，寫入端目前是第二套實作）」——修復只做了「行首錨定」，沒有做「重用單一來源」。

現況風險評估（決定為何是 major 而非 critical）：用 repo 自己的 `withoutFencedBlocks` 對 14 份 feature spec 做遮罩前後比對，每一份的第一個 `## Edge Cases` 標題行號都相同，且 headingsInsideFences 全為 0——今天沒有任何一份 spec 觸發這條路徑，所以不是 live defect，是殘留面。

連帶：REQ-SERVICES-088 的 `**Spec:**` 段落寫「A feature spec routinely quotes its own structure, so the bare string also appears in prose and inline code spans; matching there splices...」，並以 `- WHEN the string occurs before the heading in prose or an inline code span, THEN ...` 作為驗收句。這句話在字面上為真（圍籬區塊既非 prose 也非 inline code span），但敘述方式讀起來像是把「spec 引用自己結構」這一整類都關掉了，實際上只關了兩個子類中的一個。落進信任區後會成為一句過度收口的敘述。
<!-- prospec:evidence-end -->

<!-- prospec:evidence V-3 -->
### V-3

測試 fixture 的引用行是 `- WHEN a REQ is ADDED, THEN it is inserted before the \`## Edge Cases\` heading`——`## Edge Cases` 後面還有一個反引號和 ` heading`，所以單靠 `$`（行尾錨）就足以排除它。這代表 `^`（行首錨）在這份 fixture 下完全不承重。

實測三個 mutation（每次改一行、跑完立刻還原）：
1. `/## Edge Cases[ \t]*$/m`（刪 `^`）→ Test Files 1 passed、Tests 39 passed。存活。
2. `/^## Edge Cases/m`（刪 `[ \t]*$`）→ Tests 39 passed。存活。
3. `/Edge Cases/m`（完全退化成子字串語意）→ Failed Tests 2。死亡。
4. 另外驗證 replacer 方向：`(heading) => heading + '\n' + newReq`（插在標題之後）→ Failed Tests 1。死亡，方向是被釘住的。

所以測試釘住的是「不得插在一行的中間」與「必須插在標題之前」，沒有釘住「必須是完整的一行標題」。要殺掉 mutation 1 需要一個「行尾剛好是 `## Edge Cases`、但行首不是」的 fixture 行（例如縮排的子項目或 `> ## Edge Cases` 引用行）；要殺掉 mutation 2 需要一個「行首是 `## Edge Cases` 但後面還有字」的行（例如 `## Edge Cases (deferred)`）。

緩解事實：對今天的 14 份 feature spec 做差分掃描，`/^## Edge Cases[ \t]*$/m`、`/## Edge Cases[ \t]*$/m`、`/^## Edge Cases/m` 三者命中的位移完全相同，所以這兩個存活 mutant 在現行信任區上是等價變異，不構成 live defect——但它們讓「錨定在行首標題」這句 spec 敘述在測試層沒有對應的判定。
<!-- prospec:evidence-end -->

<!-- prospec:evidence V-4 -->
### V-4

review.md:35 的 R5-1 列 Status = `escalated`，Location 仍寫 `insertBefore = '## Edge Cases'; content.replace`——那段程式碼已經不存在於工作樹（現在是 `/^## Edge Cases[ \t]*$/m` + `insertBefore.test(content)`）。同一份 review.md 裡，另一條升交項 R4-3 的處理方式是在 tasks.md 開一條 `[M]` 封存手改任務並保留 `escalated`，這是合理的；但 R5-1 不同——它已經被真的修掉了，tasks.md 的「Services（審查追加）」區塊兩條都是 `[x]`。

契約面：src/templates/skills/references/review-format.hbs:70-72 寫「a fix round reports a status and must not erase the reason the finding existed」，且第 47-48 行明訂表格由 CLI 寫入、`prospec review merge --findings <file>` 是唯一寫入路徑（issue #107，禁止手改表格）。因此正解是發一輪 findings JSON 把 R5-1 的 status 併成 `fixed`（evidence 區塊會被保留），而不是留在 escalated。

後果面：prospec-archive.hbs:68 規定 Phase 2 要「Assemble the Review & Verify section from metadata.yaml quality_log, review.md (critical/major counts + a short findings excerpt), and the verify report」，而 :216 規定「NEVER emit a summary.md that lacks the ## Review & Verify section」——因為 .prospec/archive 被 gitignore，_archived-history 的那份拷貝是唯一durable 紀錄。現況封存會把「R5-1 escalated / 未解 critical」寫死進永久稽核軌跡，與程式碼事實相反。另外 review-provenance 的 digest 是在此次修復之前錄的，archive Entry Gate 會對本變更報 stale，需要重跑 review 或在 commit 後重錄——這與 status 欄一起處理才一致。
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->

## 審查輪次總結

五輪對抗式審查（達硬上限）＋使用者裁決後的修復與收尾。findings 表最終為 **19 個 critical（18 已修、1 延至封存）與 16 個 major（5 已修、11 proposed）**。（先前本節寫「25 critical／17 major」係將各輪 merge 報告的 `criticals_found` 相加所致，該數字會重複計入跨輪沿用的列；以表格實際列數為準。）

- **第一輪**（模式 A，四個平行 lens）9 critical／11 major（去重前 32 筆），全數由獨立 verifier 實跑 repro 對抗式確認。
- **第二輪**（窄審）確認六個修復成立，另揪出 2 個 critical，其中 R2-2 由第一輪 F-2 的修復本身引入。
- **第三輪**補記前兩輪皆漏的 F-21（delta-spec 全檔零中文）。使用者裁決四個升交項目全採建議方案。
- **第四輪**審查那四個修復，揪出 5 個 critical——其中 R4-1 是**信任區內容遺失**：抄寫 REQ-TEMPLATES-173 落地區塊時漏掉第四條 bullet，肇因於先前 `sed` 視窗截斷原文。此後改以機械式 bullet 比對驗證，而非閱讀。
- **第五輪**確認第四輪六個修復與 F-15 全部成立，並以真實 `syncToFeatureSpecs` 驗證 ADDED REQ 只落地英文 `**Spec:**` 區塊（落地 diff 的 CJK 掃描為零），另揪出 R5-1。
- **收尾輪**（使用者裁決後）修掉 R5-1，其獨立驗證再揪出 V-1：`moveReqToDeprecated` 帶著完全同型的子字串錨點未修——**PB-007 平行站點漏掃**，且 `drift-detection.md:621` 正在 bullet 中引用該標題，故 REMOVED 路徑今天就會踩到。兩條路徑現皆行首錨定，各有 mutation 驗證過的迴歸測試。

**已修 critical（18）**：F-1～F-9、F-21、R2-1、R2-2、R4-1、R4-2、R4-4、R4-5、R5-1、V-1。**已修 major（5）**：F-15、R4-6、R4-7、V-3、V-4。每輪修復後 `pnpm test` 皆全綠；收尾時六道 CI 閘門（lint／typecheck／test 3768 passed／counts:check／agents:check／prospec check）全部通過。

**延至封存（1）**：R4-3——`drift-detection.md:542` 的 US-14 驗收情境仍斷言舊語意，US 層規格文字無畢業載體。使用者裁決封存時一併手改，已在 `tasks.md` 立 `[M]` 任務指名檔案、行號與應同時落地的 REQ-TEMPLATES-171／173 更正。

11 個 major 維持 proposed（含 F-13 雙語 README 缺口與 V-2 fenced-block 遮蔽，後者目前不可達），依 severity 契約以 advisory WARN 傳遞給 `/prospec-verify`，不計入其評級。

**誠實揭露**：五輪對抗式審查共記錄四筆 `prospec-review` quality_log 條目（第二、四輪的發現分別併入第三、五輪的 merge），輪次與條目數不等量。另有兩處修復落在硬上限之後、依使用者裁決執行，其中 R5-1 與 V-1 皆經獨立 verifier 與 mutation 驗證，但未再走完整的 fresh-context 審查輪。
