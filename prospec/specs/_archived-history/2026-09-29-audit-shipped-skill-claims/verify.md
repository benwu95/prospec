# Verify Evidence: audit-shipped-skill-claims

<!-- prospec:evidence-section -->
## 2026-09-29 — grade A

<!-- prospec:evidence delta-spec-compliance -->
### delta-spec-compliance — WARN

**Context ID:** `e43ad1313f1968060263a2b5b54f9bb2a3507222a0e7b72e94c169e5ab3d414f`

**Summary:** 29 項 MODIFIED REQ 已逐項核對；28 PASS，REQ-TESTS-129 的提交後 Knowledge-sync gate 尚待有效執行。

以 node --import tsx src/cli/index.ts spec show <feature> --req <ids> 對 5 個 features 讀取全部 29 個既有 MODIFIED REQ，與本次完整 Spec block／source diff 比對；無 ADDED／REMOVED。prepared baseline frozen revision 1、proposal_mismatch=false，6 個 scenario 均核對。US-1.1/1.2/1.3、US-2.1/2.2 有檔案／contract／mutation／token 證據；US-2.3 尚缺提交後 knowledge gate。於 assigned snapshot 執行 node node_modules/vitest/vitest.mjs run tests/contract/skill-format.test.ts tests/contract/canonical-claims.test.ts tests/contract/bundled-templates-sync.test.ts：3 files、1245 tests PASS，exit 0。未在 main 跑寫入性測試或 mutation，未改任一 source。

#### Requirements Compliance

| REQ ID | Result | Kind | Evidence | Repro |
|---|---|---|---|---|
| REQ-TEMPLATES-117 | PASS | document | src/templates/skills/prospec-archive.hbs 的 Entry Gate、Phase 2、Phase 3.5、Phase 4：backfill 以 canonical report set 同步、略過 tasks 完成率並沿 Feature routing 畢業；Entry Gate 與 Phase 4 均未重建 classifier。 |  |
| REQ-TEMPLATES-083 | PASS | document | src/templates/skills/prospec-archive.hbs:35 的 Entry Gate 保留 verified／sync backstop、KNOWLEDGE_UNSYNCED／KNOWLEDGE_INPUT_INVALID remedy，明訂 empty set 不繞過 input validation，README 語意核對主體為 skill；skill-format 的 archive separates CLI gaps 與 archive-empty／archive-readme mutations 固定此界線。 |  |
| REQ-TEMPLATES-118 | PASS | document | src/templates/skills/prospec-promote-backfill.hbs Phase 3、4、5 保留 Feature routing、由 draft 取 related_modules、只產生 proposal/delta/metadata、拒收未解 NC；Phase 5 改為 CLI 決定 grade，archive eligibility 仍受 gates 約束。 |  |
| REQ-TEMPLATES-162 | PASS | document | src/templates/skills/prospec-knowledge-update.hbs:184 的 Error Handling 新列 unreadable／invalid／out-of-root map，要求修復後 retry --change 且不得 --module bypass；既有 Phase 1／3e 的 report、stamp-only、canonical set 與提交後 gate 均保留。 |  |
| REQ-TEMPLATES-221 | PASS | document | tests/contract/skill-format.test.ts:10096 的 directory-enumerated rendered-reference 契約涵蓋 31 references，忽略 fenced examples 後禁止兩個 h2；必要 adapter、DSL、delegation directory 與雙 MIT attribution 各有正向檢查。本 grader 另比對兩份完整 1054 字元 license 與 HEAD，bytes 相同。 |  |
| REQ-TEMPLATES-143 | PASS | document | src/templates/skills/_verifier-rubric-base.hbs 只移除 Reference Information footer；adaptation、Break-Glass explicit rationale、Language Policy 仍由唯一 partial 出貨。skill-format 的 candidate and rubric adaptation 契約驗證两個 rendered rubric；bundled-templates-sync 與既有 partial 契約通過。 |  |
| REQ-TEMPLATES-120 | PASS | document | src/templates/skills/prospec-archive.hbs Entry Gate standard/full 明訂 CLI owns prefix classification，Phase 4 重用 resolved set；skill-format 的 Entry Gate and Phase 4 delegate classification to the CLI 正向／負向核對，不再依 req_prefixes 自行分類。 |  |
| REQ-TYPES-109 | PASS | document | src/types/canonical-claims.ts:50–51 新增 archive-entry-backfill／archive-recheck-backfill 兩個 bounded sites；tests/contract/canonical-claims.test.ts:23 的獨立 inventory 同步，既有 bilingual wording 與 runtime predicates 未改，entry-site／recheck-site source mutations 都轉紅。 |  |
| REQ-TESTS-129 | WARN | document | audit.md 與兩份逐檔 audit 經本 grader filesystem 集合比對，61 個來源皆有列名；mutations.json 30 筆與 review-mutations.json 5 筆全部 applied=true／killed=true／exit=1，mutate.py 先 bundle 再測並 finally 還原；token-comparison.json 顯示 references 50854→48170、mandatory 88515→87408，ceilings 51089／88535 不變。build/typecheck/lint/counts/agents/coverage/strict logs 及目前 test provenance 均有成功證據；唯 knowledge:check 按 CONTRIBUTING.md:86–92 必須 feature commit 後才有有效 range，本輪尚未執行，不能聲稱完整 CI parity 已完成。 |  |
| REQ-TEMPLATES-096 | PASS | document | src/templates/skills/prospec-explore.hbs Constitution Checkpoint 與 prospec-knowledge-generate.hbs Step 8 保留 constitution-severity 查詢、substantively empty／seeded rules 與 edit pointer，只說沒有 project-authored principles，不再說 verify 或 Entry/Exit gates 為 no-op；兩個 scoped tests 與 explore-empty／generate-empty mutations 覆蓋。 |  |
| REQ-TEMPLATES-153 | PASS | document | src/templates/skills/prospec-verify.hbs NEVER 將 machine authority 改為 CLI self-sources from live assessment，保留兩 ledgers、adjudicator、skip=not-adjudicated、WARN budget 及 CLI grade；skill-format 的 verify names live assessment 與 verify-live mutation 固定此修正。 |  |
| REQ-TEMPLATES-071 | PASS | document | src/templates/skills/prospec-archive.hbs Phase 4.5 仍透過 learn upsert、retired row refused 且 counters untouched，移除 because its root cause is gone；harvest-cause mutation 轉紅。其他 TTL／Sweep／playbook progressive loading 未變。 |  |
| REQ-TEMPLATES-115 | PASS | document | src/templates/skills/references/verify-backfill.hbs §§1–4 保留 draft provenance、prepared context、per-REQ fidelity、late-capture limitations 與實際 FAIL 不可豁免，§4 改記錄 fidelity judgments and limitations，由 CLI 定 grade；backfill-fidelity mutation 證實絕對認證文案被拒。 |  |
| REQ-TEMPLATES-119 | PASS | document | src/templates/change/delta-spec.md.hbs:4 與 skills/references/delta-spec-format.hbs REQ ID Naming Convention 保留 feature-first ID／Feature routing，刪除 module derivation 副本；delta-classifier／promote-classifier mutations 轉紅。lifecycle 兩份及 new-story scale 契約保留。 |  |
| REQ-TEMPLATES-129 | PASS | document | src/templates/skills/references/cascade-protocol.hbs Tastemaker Presentation 保留 canonical sync sets、freshness stamp、sync→review→tests→verify→equivalent commit 順序，count generator 改通用名稱；verify-backfill §4 移除從 REQ 拼字推論 minting 的句子，post-feature-commit knowledge gate 時點仍保留。counts-portability／backfill-fidelity mutations 及既有提交時點契約通過。 |  |
| REQ-TEMPLATES-136 | PASS | document | src/templates/skills/references/tasks-format.hbs §4 仍令 code unmarked、manual／verify 要 [M]／[V]；tasks-verifier-rubric.hbs Verdict & Severity Contract 的 WARN 範例不再含 missing optional [P]，task guidance supports quick inputs and optional parallel markers 契約通過。 |  |
| REQ-TEMPLATES-186 | PASS | document | src/templates/skills/references/tasks-verifier-rubric.hbs 保留四 dimensions、framework-neutral shared partial、schema／receipt／bounded fields；刪 Purpose 的 prevents requirement gaps 與 optional marker WARN。skill-format rubric/schema/budget 與 candidate and rubric adaptation 契約通過。 |  |
| REQ-TEMPLATES-188 | PASS | document | src/templates/skills/references/tasks-format.hbs Bidirectional Contract Traceability 的 forward／backward 均涵蓋 quick proposal AC；src/templates/change/tasks.md.hbs:4 使用 CLI-selected planning input，不要求 quick 的 plan/delta。quick-input mutation 轉紅，既有 dynamic layering 指引保留。 |  |
| REQ-DSGN-001 | PASS | document | src/templates/skills/references/design-spec-format.hbs Guidelines 把 structure／intent 與 precise values 分工移到正文，取值依 platform adapter 且明列 HTML prototype；Visual Identity／Components／Responsive Strategy 格式未刪。design-measurement mutation 轉紅。 |  |
| REQ-TEMPLATES-182 | PASS | document | src/templates/skills/references/plan-verifier-rubric.hbs 保留五 dimensions、Reuse & Single-Source／Simpler Alternative、schema vocabulary 與 receipt；只刪 Purpose 的 eliminate confirmation bias 保證，共享 adaptation 仍在 partial。skill-format 的 rubric、schema、budget 與 adaptation 契約通過。 |  |
| REQ-TEMPLATES-192 | PASS | document | cascade-protocol.hbs 保留 scale paths、Per-Station Execution Loop 與 Station Transition Gates，circuit-breaker.hbs 保留停止条件，project-test-runner.hbs 保留 runner resolution；刪 Purpose 的 deterministic verifier／cost bound 及 repository-specific generator。route-owner-deletion／entry-owner-deletion mutations 證明 owner 局部載入要求被固定。 |  |
| REQ-TEMPLATES-203 | PASS | document | src/templates/skills/references/circuit-breaker.hbs Fix-Induced Defect Ratio 定義 non-dismissed 且 origin_round 晚於 loop first round 的比例，改稱 newly surfaced findings，明說不建立因果；review-format 的 regression pin／Origin／metrics 與 persistent failure protocol 保留。ratio mutation 轉紅。 |  |
| REQ-TEMPLATES-111 | PASS | document | src/templates/skills/references/feature-boundary-criteria.hbs Decision 1 保留三個 split signals 與 size soft signal，允許一個 logical feature 使用 mother file 與 registered story slices；Decision 2 read/query attribution 未變。feature-boundary mutation 轉紅。 |  |
| REQ-TEMPLATES-150 | PASS | document | src/templates/skills/references/metadata-format.hbs quality_log entry shape 刪 Each station appends one entry，仍保留 fixed keys、optional structured keys、canonical ordering、CLI writer／ChangeMetadataSchema authority。metadata-log mutation 轉紅。 |  |
| REQ-TEMPLATES-126 | PASS | document | src/templates/skills/references/archive-format.hbs §6 位於 Completion 與 Knowledge Update 之間，保留 grade／findings／quality_log、缺 source 誠實標記及 Source provenance；§6 與 Spec Archiving 不再把 history copy 說成唯一可版本控制紀錄。archive-record／archive-format-exclusive mutations 轉紅。 |  |
| REQ-DSGN-004 | PASS | document | src/templates/skills/references/adapter-pencil.hbs Setting Design Tokens:38 仍建議 set_variables 定義 tokens，刪 ensures consistency across all components；Design／Implement／Verify 工具表未變。本次驗證為文件契約，未聲稱重新實測外部 API；pencil-effect mutation 轉紅。 |  |
| REQ-TEMPLATES-157 | PASS | document | src/templates/skills/references/drift-report-format.hbs Key Check Interpretations 將 knowledge-health 摘要改為指向後文 freshness／coverage，未再簡化成 README git timestamp；Detailed health 欄位、Constitution rule shape／stations 與 metadata grading context 契約仍在。health-summary mutation 轉紅。 |  |
| REQ-TEMPLATES-127 | PASS | document | src/templates/skills/prospec-archive.hbs Phase 2、其 Gate 與 NEVER 均保留 Review & Verify summary 要求，缺 source 標 Unverified／no review round；NEVER 移除 sole durable／lives only 保證。archive-never-exclusive mutation 轉紅。 |  |
| REQ-TEMPLATES-159 | PASS | document | src/templates/skills/prospec-archive.hbs Phase 3 dry-run／Phase 3.7 finalize 維持 CLI owns mutations、兩類 refusal remedy、Entry Gate 與 artifact preservation；Phase 3.7 刪除 downstream gitignore／only record 假設。archive-finalize-exclusive mutation 轉紅。 |  |

#### Scenario Deviation Findings

| Scenario ID | Affected REQs | Spec Location | Result | Summary | Evidence |
|---|---|---|---|---|---|
| US-2.3 | REQ-TESTS-129 | proposal.md:27；delta-spec.md 的 REQ-TESTS-129 | WARN | 完整 CI parity 尚缺 feature commit 後 Knowledge-sync gate 的有效結果。 | CONTRIBUTING.md:86–92 規定 knowledge:check 對 merge-base..HEAD 的 committed range 執行；本輪尚未 S/A feature commit，無 knowledge:check 成功紀錄。其他 CI logs 已完成；依時序提交後、push 前執行並補證據即可，不得把空 range skip 算 PASS。 |
<!-- prospec:evidence-end -->

<!-- prospec:evidence constitution -->
### constitution — WARN

**Summary:** 8 項規則全數審核；7 PASS，Pre-Merge CI Checks 的提交後 Knowledge gate 尚未 adjudicated。

逐項使用 prospec-report.json structural.constitution.rules 的 8 個原名／severity；四個 declared checks 均採 machine PASS，所有 covers gap／無 check 規則補 statement。尚未 merge，Knowledge gate 尚未到有效執行時點屬證據缺口，不虛構 MUST 違反，也不聲稱全部 pre-merge checks 已通過。結案前需按 CONTRIBUTING 執行並補驗。strict 現有 knowledge-size 壓力與 artifact-language 診斷 capture warning 原樣揭露，未升格為本輪程式缺陷或隱匿。
<!-- prospec:evidence-end -->

<!-- prospec:evidence design -->
### design — not-applicable

**Summary:** proposal UI Scope=none，本次無 UI layout 或互動實作。

proposal.md 的 UI Scope 明列 Scope: none；變更集中 skill/reference 文字與測試、generated copies、Knowledge/count。docs/index.html／docs/i18n.js 僅同步測試數字，沒有設計或互動改動，無 design-spec.md。
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->

<!-- prospec:evidence-section -->
## 2026-09-29 — grade S

<!-- prospec:evidence delta-spec-compliance -->
### delta-spec-compliance — PASS

**Context ID:** `e43ad1313f1968060263a2b5b54f9bb2a3507222a0e7b72e94c169e5ab3d414f`

**Summary:** 29 項 MODIFIED REQ 全數 PASS；提交後 Knowledge-sync 證據已補齊，6 個 frozen scenarios 均符合。

本輪為第一輪完整獨立審核後的有界補驗，保留其 29 個 REQ 審核與 snapshot 1245 PASS 證據。實讀 feature commit 85fc8198fb1318a041c5782c3592e86e1bdad11b、bbd4727378dc..85fc8198 的 source／Knowledge diff、clean git status、knowledge-check.log 與 refreshed strict-check.log。prepared context_id 仍為 e43ad1313f1968060263a2b5b54f9bb2a3507222a0e7b72e94c169e5ab3d414f、repository-inputs-v2 digest 仍為 d3e0bea45d1908354a816177e22df880157b3bbbd9548f87548d3ad59b4bfc2a；recorded pnpm test attempt 6a0a80da-a2ce-4797-bfe8-c4b7337cf543 仍 passed／exit 0。既有 28 PASS 不需重跑，REQ-TESTS-129 與 US-2.3 的唯一待驗 Knowledge gate 已有提交後有效成功結果，故不再有 scenario finding。

#### Requirements Compliance

| REQ ID | Result | Kind | Evidence | Repro |
|---|---|---|---|---|
| REQ-TEMPLATES-117 | PASS | document | src/templates/skills/prospec-archive.hbs 的 Entry Gate、Phase 2、Phase 3.5、Phase 4：backfill 以 canonical report set 同步、略過 tasks 完成率並沿 Feature routing 畢業；Entry Gate 與 Phase 4 均未重建 classifier。 |  |
| REQ-TEMPLATES-083 | PASS | document | src/templates/skills/prospec-archive.hbs:35 的 Entry Gate 保留 verified／sync backstop、KNOWLEDGE_UNSYNCED／KNOWLEDGE_INPUT_INVALID remedy，明訂 empty set 不繞過 input validation，README 語意核對主體為 skill；skill-format 的 archive separates CLI gaps 與 archive-empty／archive-readme mutations 固定此界線。 |  |
| REQ-TEMPLATES-118 | PASS | document | src/templates/skills/prospec-promote-backfill.hbs Phase 3、4、5 保留 Feature routing、由 draft 取 related_modules、只產生 proposal/delta/metadata、拒收未解 NC；Phase 5 改為 CLI 決定 grade，archive eligibility 仍受 gates 約束。 |  |
| REQ-TEMPLATES-162 | PASS | document | src/templates/skills/prospec-knowledge-update.hbs:184 的 Error Handling 新列 unreadable／invalid／out-of-root map，要求修復後 retry --change 且不得 --module bypass；既有 Phase 1／3e 的 report、stamp-only、canonical set 與提交後 gate 均保留。 |  |
| REQ-TEMPLATES-221 | PASS | document | tests/contract/skill-format.test.ts:10096 的 directory-enumerated rendered-reference 契約涵蓋 31 references，忽略 fenced examples 後禁止兩個 h2；必要 adapter、DSL、delegation directory 與雙 MIT attribution 各有正向檢查。本 grader 另比對兩份完整 1054 字元 license 與 HEAD，bytes 相同。 |  |
| REQ-TEMPLATES-143 | PASS | document | src/templates/skills/_verifier-rubric-base.hbs 只移除 Reference Information footer；adaptation、Break-Glass explicit rationale、Language Policy 仍由唯一 partial 出貨。skill-format 的 candidate and rubric adaptation 契約驗證两個 rendered rubric；bundled-templates-sync 與既有 partial 契約通過。 |  |
| REQ-TEMPLATES-120 | PASS | document | src/templates/skills/prospec-archive.hbs Entry Gate standard/full 明訂 CLI owns prefix classification，Phase 4 重用 resolved set；skill-format 的 Entry Gate and Phase 4 delegate classification to the CLI 正向／負向核對，不再依 req_prefixes 自行分類。 |  |
| REQ-TYPES-109 | PASS | document | src/types/canonical-claims.ts:50–51 新增 archive-entry-backfill／archive-recheck-backfill 兩個 bounded sites；tests/contract/canonical-claims.test.ts:23 的獨立 inventory 同步，既有 bilingual wording 與 runtime predicates 未改，entry-site／recheck-site source mutations 都轉紅。 |  |
| REQ-TESTS-129 | PASS | document | audit.md 與兩份逐檔 audit 經本 grader filesystem 集合比對，61 個來源皆有列名；mutations.json 30 筆與 review-mutations.json 5 筆全部 applied=true／killed=true／exit=1，mutate.py 先 bundle 再測並 finally 還原；token-comparison.json 顯示 references 50854→48170、mandatory 88515→87408，ceilings 51089／88535 不變。build/typecheck/lint/counts/agents/coverage/strict logs 及目前 test provenance 均有成功證據。本輪補核 feature commit 85fc8198fb1318a041c5782c3592e86e1bdad11b 已存在且 tracked working tree clean；knowledge-check.log 記錄 knowledge:check 的 4 source-touched modules 全部 confirmed since bbd4727378dc，非空 range skip。strict-check.log 現為 0 fail／1 warn／0 skipped，唯一 warning 類別是既有 knowledge-size；缺少的提交後 CI 證據已補齊。 |  |
| REQ-TEMPLATES-096 | PASS | document | src/templates/skills/prospec-explore.hbs Constitution Checkpoint 與 prospec-knowledge-generate.hbs Step 8 保留 constitution-severity 查詢、substantively empty／seeded rules 與 edit pointer，只說沒有 project-authored principles，不再說 verify 或 Entry/Exit gates 為 no-op；兩個 scoped tests 與 explore-empty／generate-empty mutations 覆蓋。 |  |
| REQ-TEMPLATES-153 | PASS | document | src/templates/skills/prospec-verify.hbs NEVER 將 machine authority 改為 CLI self-sources from live assessment，保留兩 ledgers、adjudicator、skip=not-adjudicated、WARN budget 及 CLI grade；skill-format 的 verify names live assessment 與 verify-live mutation 固定此修正。 |  |
| REQ-TEMPLATES-071 | PASS | document | src/templates/skills/prospec-archive.hbs Phase 4.5 仍透過 learn upsert、retired row refused 且 counters untouched，移除 because its root cause is gone；harvest-cause mutation 轉紅。其他 TTL／Sweep／playbook progressive loading 未變。 |  |
| REQ-TEMPLATES-115 | PASS | document | src/templates/skills/references/verify-backfill.hbs §§1–4 保留 draft provenance、prepared context、per-REQ fidelity、late-capture limitations 與實際 FAIL 不可豁免，§4 改記錄 fidelity judgments and limitations，由 CLI 定 grade；backfill-fidelity mutation 證實絕對認證文案被拒。 |  |
| REQ-TEMPLATES-119 | PASS | document | src/templates/change/delta-spec.md.hbs:4 與 skills/references/delta-spec-format.hbs REQ ID Naming Convention 保留 feature-first ID／Feature routing，刪除 module derivation 副本；delta-classifier／promote-classifier mutations 轉紅。lifecycle 兩份及 new-story scale 契約保留。 |  |
| REQ-TEMPLATES-129 | PASS | document | src/templates/skills/references/cascade-protocol.hbs Tastemaker Presentation 保留 canonical sync sets、freshness stamp、sync→review→tests→verify→equivalent commit 順序，count generator 改通用名稱；verify-backfill §4 移除從 REQ 拼字推論 minting 的句子，post-feature-commit knowledge gate 時點仍保留。counts-portability／backfill-fidelity mutations 及既有提交時點契約通過。 |  |
| REQ-TEMPLATES-136 | PASS | document | src/templates/skills/references/tasks-format.hbs §4 仍令 code unmarked、manual／verify 要 [M]／[V]；tasks-verifier-rubric.hbs Verdict & Severity Contract 的 WARN 範例不再含 missing optional [P]，task guidance supports quick inputs and optional parallel markers 契約通過。 |  |
| REQ-TEMPLATES-186 | PASS | document | src/templates/skills/references/tasks-verifier-rubric.hbs 保留四 dimensions、framework-neutral shared partial、schema／receipt／bounded fields；刪 Purpose 的 prevents requirement gaps 與 optional marker WARN。skill-format rubric/schema/budget 與 candidate and rubric adaptation 契約通過。 |  |
| REQ-TEMPLATES-188 | PASS | document | src/templates/skills/references/tasks-format.hbs Bidirectional Contract Traceability 的 forward／backward 均涵蓋 quick proposal AC；src/templates/change/tasks.md.hbs:4 使用 CLI-selected planning input，不要求 quick 的 plan/delta。quick-input mutation 轉紅，既有 dynamic layering 指引保留。 |  |
| REQ-DSGN-001 | PASS | document | src/templates/skills/references/design-spec-format.hbs Guidelines 把 structure／intent 與 precise values 分工移到正文，取值依 platform adapter 且明列 HTML prototype；Visual Identity／Components／Responsive Strategy 格式未刪。design-measurement mutation 轉紅。 |  |
| REQ-TEMPLATES-182 | PASS | document | src/templates/skills/references/plan-verifier-rubric.hbs 保留五 dimensions、Reuse & Single-Source／Simpler Alternative、schema vocabulary 與 receipt；只刪 Purpose 的 eliminate confirmation bias 保證，共享 adaptation 仍在 partial。skill-format 的 rubric、schema、budget 與 adaptation 契約通過。 |  |
| REQ-TEMPLATES-192 | PASS | document | cascade-protocol.hbs 保留 scale paths、Per-Station Execution Loop 與 Station Transition Gates，circuit-breaker.hbs 保留停止条件，project-test-runner.hbs 保留 runner resolution；刪 Purpose 的 deterministic verifier／cost bound 及 repository-specific generator。route-owner-deletion／entry-owner-deletion mutations 證明 owner 局部載入要求被固定。 |  |
| REQ-TEMPLATES-203 | PASS | document | src/templates/skills/references/circuit-breaker.hbs Fix-Induced Defect Ratio 定義 non-dismissed 且 origin_round 晚於 loop first round 的比例，改稱 newly surfaced findings，明說不建立因果；review-format 的 regression pin／Origin／metrics 與 persistent failure protocol 保留。ratio mutation 轉紅。 |  |
| REQ-TEMPLATES-111 | PASS | document | src/templates/skills/references/feature-boundary-criteria.hbs Decision 1 保留三個 split signals 與 size soft signal，允許一個 logical feature 使用 mother file 與 registered story slices；Decision 2 read/query attribution 未變。feature-boundary mutation 轉紅。 |  |
| REQ-TEMPLATES-150 | PASS | document | src/templates/skills/references/metadata-format.hbs quality_log entry shape 刪 Each station appends one entry，仍保留 fixed keys、optional structured keys、canonical ordering、CLI writer／ChangeMetadataSchema authority。metadata-log mutation 轉紅。 |  |
| REQ-TEMPLATES-126 | PASS | document | src/templates/skills/references/archive-format.hbs §6 位於 Completion 與 Knowledge Update 之間，保留 grade／findings／quality_log、缺 source 誠實標記及 Source provenance；§6 與 Spec Archiving 不再把 history copy 說成唯一可版本控制紀錄。archive-record／archive-format-exclusive mutations 轉紅。 |  |
| REQ-DSGN-004 | PASS | document | src/templates/skills/references/adapter-pencil.hbs Setting Design Tokens:38 仍建議 set_variables 定義 tokens，刪 ensures consistency across all components；Design／Implement／Verify 工具表未變。本次驗證為文件契約，未聲稱重新實測外部 API；pencil-effect mutation 轉紅。 |  |
| REQ-TEMPLATES-157 | PASS | document | src/templates/skills/references/drift-report-format.hbs Key Check Interpretations 將 knowledge-health 摘要改為指向後文 freshness／coverage，未再簡化成 README git timestamp；Detailed health 欄位、Constitution rule shape／stations 與 metadata grading context 契約仍在。health-summary mutation 轉紅。 |  |
| REQ-TEMPLATES-127 | PASS | document | src/templates/skills/prospec-archive.hbs Phase 2、其 Gate 與 NEVER 均保留 Review & Verify summary 要求，缺 source 標 Unverified／no review round；NEVER 移除 sole durable／lives only 保證。archive-never-exclusive mutation 轉紅。 |  |
| REQ-TEMPLATES-159 | PASS | document | src/templates/skills/prospec-archive.hbs Phase 3 dry-run／Phase 3.7 finalize 維持 CLI owns mutations、兩類 refusal remedy、Entry Gate 與 artifact preservation；Phase 3.7 刪除 downstream gitignore／only record 假設。archive-finalize-exclusive mutation 轉紅。 |  |
<!-- prospec:evidence-end -->

<!-- prospec:evidence constitution -->
### constitution — PASS

**Summary:** 8 項 Constitution 規則全數 PASS；提交格式與提交後 CI parity 已核對。

8 個原規則的完整審核沿用第一輪獨立結果，本輪只補核兩個缺口及相關提交／language capture 事實；所有 declared machine checks 仍採 PASS。Knowledge gate 已在有效 committed range 成功，故 Pre-Merge CI Checks 由 not-adjudicated 改 PASS；未把原始 WARNING 或先前證據缺口抹除，第一輪 verify-grader-1-1.json 原檔保留。剩餘 knowledge-size 是既有壓力訊號，strict exit 可通過且本次兩項 token totals 均縮減，非本輪 Constitution 違反。
<!-- prospec:evidence-end -->

<!-- prospec:evidence design -->
### design — not-applicable

**Summary:** proposal UI Scope=none，本次無 UI layout 或互動實作。

proposal.md 的 UI Scope 明列 Scope: none；變更集中 skill/reference 文字與測試、generated copies、Knowledge/count。docs/index.html／docs/i18n.js 僅同步測試數字，沒有設計或互動改動，無 design-spec.md。
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->
