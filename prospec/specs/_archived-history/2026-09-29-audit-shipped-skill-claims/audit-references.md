# References 與 change templates 宣稱盤點

盤點範圍：`src/templates/skills/references/*.hbs` 全部 31 檔，以及 `src/templates/change/*.hbs` 全部 5 檔。這是 plan 階段的唯讀證據；尚未修改模板、程式、tests 或 metadata，亦未宣稱已完成 mutation 驗證。

所有項目均檢視 component ownership、條件／集合、量詞／因果；下表「無新增宣稱缺陷」表示本次未找到可由 repository 證據成立的矛盾，並非對外部工具版本或模型可靠性背書。`Purpose`／`Reference Information` 的移除是使用者授權的獨立精簡，不將每個 boilerplate 刪除都當成缺陷。

## 可重現的缺陷與最小修正

| 編號 | 宣稱／位置 | 程式或現行契約證據 | 最小修正與治理 REQ |
|---|---|---|---|
| R1 | `verify-backfill.hbs` Post-Verify：從 feature-slug REQ 字形直接判斷「it mints no module」；`delta-spec-format.hbs` 與 `change/delta-spec.md.hbs` 用 archive 主詞聲稱從 related_modules/feature-map 衍生 modules | `src/lib/knowledge-sync.ts:170` `classifyDeltaEntry` 先在 180 判定已知 module，再在 181 判定任一 feature 的 declared prefix，最後 183 才進 proven-backfill fallback；184–188 才由 Feature header 映射。`src/services/knowledge-update.service.ts:413` 使用此共同分類。`src/services/archive.service.ts:1513` 使用共同 knowledge-sync gate，而非模板描述的 backfill 專屬另一路分類 | 刪掉字形判斷／別的 component 的決策邊界；指令 follow CLI 回報，保留既有 `canonical_claims.backfill_sync_modules`；delta 兩處只保留 feature-first 命名與 Feature 的 spec landing routing。治理：REQ-LIB-097、REQ-TEMPLATES-117、REQ-TEMPLATES-119、REQ-TEMPLATES-129、REQ-TEMPLATES-215；MODIFIED 文字須保留原有 routing／light-scale 義務 |
| R2 | `verify-backfill.hbs`：「S/A grade certifies ... 100% faithful」 | `src/lib/verify-grade.ts:19` A 可有 2 個 WARN；49–73 `computeGrade` 也容許 not-adjudicated 並以 in-session 封頂 A。reference 自己的 Baseline Gap 段也承認 A 可帶 baseline gap。這不是 100% 證明 | 刪除 certification 句，或只說記錄 spec-to-code judgments 與 limitations，沿用 CLI grade。治理：REQ-TEMPLATES-115、REQ-TEMPLATES-215、REQ-TEMPLATES-235；不可為了保住句子修改評分器 |
| R3 | `tasks-format.hbs` Purpose：「each carrying its [M]/[V] kind marker (required)」 | `src/lib/task-markers.ts:24` `parseTaskLine` 將沒有 marker 的 task 判為 code；正文 §4 已明定 code unmarked | 直接刪 Purpose，保留 §4 單一定義。治理：REQ-TEMPLATES-086、REQ-TEMPLATES-136、REQ-TEMPLATES-219 |
| R4 | `tasks-verifier-rubric.hbs` WARN 範例包含「missing optional [P] markers」 | `tasks-format.hbs` §3 明定 no skill/service consumes `[P]`、never gate；REQ-TEMPLATES-136 明定 optional。缺少 optional 欄位不能自己構成品質警告 | 刪該 WARN 範例，保留真實 sizing advisory；局部契約驗證 optional markers 不觸發 verdict。治理：REQ-TEMPLATES-136、REQ-TEMPLATES-186 |
| R5 | `change/tasks.md.hbs:4` 無條件列 `plan.md, delta-spec.md` 為 prerequisites；`tasks-format.hbs` Backward Plan Traceability 無條件對 plan.md | `src/services/change-tasks.service.ts:78` quick 實際讀 proposal，且 130 對 quick 使用同一個模板；`src/types/change.ts` forbiddenArtifacts 的 quick 集合禁止 plan/delta。tasks-verifier-rubric 已提供 proposal fallback | scaffold 不另複製 scale predicate，改指向 CLI 選定的 input／current change artifacts；reference backward trace 明示 quick 對 proposal。治理：REQ-TEMPLATES-085、REQ-TEMPLATES-188、REQ-SERVICES-076 |
| R6 | `design-spec-format.hbs` Purpose 的 precise values 一律「via MCP」 | `adapter-html.hbs` 使用本機 HTML/CSS；`src/templates/skills/prospec-design.hbs` 支援 html，`REQ-DSGN-008` 明定零 MCP dependency | 移出 Purpose 時保留 intent／measurement 分工，改為依平台 adapter 取得精確值（design tool 或 HTML prototype）；不可遺失必要指引。治理：REQ-DSGN-001、REQ-DSGN-008、REQ-DSGN-009 |
| R7 | `plan-verifier-rubric.hbs` Purpose「eliminates single-pass confirmation bias」；tasks counterpart「prevents requirement gaps ...」 | `src/types/station.ts` PlanningVerifierReport schemas 驗證輸入形狀與枚舉，`src/services/change-log.service.ts` 記錄 verdict；實際判斷由 agent 提供，shared rubric 有 Break-Glass 與 in-session degradation，沒有消除 bias／必然阻止漏項的機制 | 刪 Purpose 的可靠性保證；保留 rubric 的審查範圍、dimensional checks、schema／receipt。框架中立原則已有 shared `_verifier-rubric-base`，勿再搬一份造成重複。治理：REQ-TEMPLATES-182、REQ-TEMPLATES-186、REQ-TEMPLATES-219、REQ-TEMPLATES-241 |
| R8 | `circuit-breaker.hbs` ratio > 0.5 ⇒「fix attempts are generating defects faster than resolving them」；括號把所有較晚發現的 findings 當修補造成 | `src/lib/review-circuit-breaker.ts:46` 只算 non-dismissed 中 origin_round > baseRound 的比例，59 回傳比值；未測 causal origin 或 defects resolved rate。晚發現的既存問題也符合 predicate | 保留公式與 CLI escalation，刪「generating ... faster」及確定因果括號，改為 newly surfaced findings 的觀測值。治理：REQ-TEMPLATES-192、REQ-TEMPLATES-203、REQ-LIB-063；無需更動 breaker |
| R9 | `feature-boundary-criteria.hbs`：「one slug / one file ... do not invent a third structural layer」 | `feature-spec-format.hbs` File Length 明定 `## Slices`；`src/lib/knowledge-reader.ts` `loadFeatureSpecContent` 支援 mother+registered slice。此句會阻止受支持的同一 feature 分片 | 保留 one logical feature slug／以 behavior 決定 sibling；明示 storage 可用 per-story slices，避免將 physical file 當 feature boundary。治理：REQ-TEMPLATES-111，spec-slicing 實作契約由 `knowledge-reader` 對應 REQ 治理 |
| R10 | `metadata-format.hbs` quality_log：「Each station appends one entry」 | `src/services/change-log.service.ts` 可重複 append，同站有 verifier、signoff、exit 等條目；review 又由 `src/lib/review-merge.ts`／round-keyed quality-log owner upsert，非每站恰一列。模板下面的範例自己列兩個 plan entry | 改為描述 quality_log entry 的 shape，刪 one-per-station 的量詞。治理：REQ-TEMPLATES-150、REQ-TEMPLATES-157、REQ-LIB-081 |

## 31 份 references 逐檔處置

表中路徑均以 `src/templates/skills/references/` 為根。P = 刪除 Purpose；R = 刪除 Reference Information；「保留」指原區塊中的必要資訊必須在相關正文仍可讀取。

| 檔案 | 宣稱結果／處置 | 精簡時必須保留的內容、程式證據與 governing REQ |
|---|---|---|
| `adapter-figma.hbs` | 無新增宣稱缺陷；無 P/R | 描述 adapter 的操作方式，不宣稱 CLI 驗證 UI；保留需求與三階段工具讀取。REQ-DSGN-006；registry `src/types/station-references.ts` 的 design adapter 部署。外部 MCP 工具名稱未在本次聲稱重新實測 |
| `adapter-html.hbs` | 無新增宣稱缺陷；無 P/R | filesystem-only prototype 是 R6 的反例；精確 CSS/HTML source 不能在精簡其他文件時被 MCP 通則覆蓋。REQ-DSGN-008 |
| `adapter-pencil.hbs` | 無新增 CLI 宣稱缺陷；無 P/R | `set_variables`「ensures consistency across all components」是 adapter authoring 意圖，未查得本 repo 可保證全部 component 綁定；可最小刪此因果句，不改 MCP 操作表。REQ-DSGN-004；外部 API 版本未實測，不冒稱 code-backed guarantee |
| `adapter-penpot.hbs` | 無新增宣稱缺陷；無 P/R | API/MCP design source 與 implementation/verify 指引一致，無 prospec machine guarantee。REQ-DSGN-007 |
| `archive-format.hbs` | P/R；主流程宣稱未見新矛盾 | Issue 單行 normalization、optional Plan Decision verbatim、Review & Verify evidence、history destination 都留在正文；`archive.service.ts` summary generation/history copy 與 `REQ-TEMPLATES-126`、REQ-TEMPLATES-237、REQ-TESTS-033。`only per-change record in version control` 對自行 track .prospec 的 downstream 不一定成立，可直接刪 only，不需新替代解釋 |
| `candidate-evaluation.hbs` | P/R；mechanical metrics 與 judgment 已分開，無新增缺陷 | Purpose 的語言／架構中立、由 manifest／L2／conventions 決定需移入 Candidate Generation。schema authority／Selection Paths 已在正文；`src/lib/plan-candidates.ts` 與 `src/types/station.ts`，REQ-TEMPLATES-184、REQ-TEMPLATES-236、REQ-TYPES-107 |
| `cascade-protocol.hbs` | P/R；維持現有 canonical sync phrases；刪去 `e.g. pnpm counts` | 刪 Purpose 的 Type III／deterministic verifier 修辭；LOAD/ENTRY/GATE/NEXT、human sign-off／commit 邊界已在正文。`pnpm counts` 是本 repo 的 generator，shipped consumer 應讀專案實際宣告，保留有 generator 則執行、否則從 source 重算的通用指引。`src/lib/status-router.ts` 是 route owner；REQ-TEMPLATES-192、REQ-TEMPLATES-195、REQ-TEMPLATES-217、REQ-TEMPLATES-236、REQ-TEMPLATES-241。不得藉精簡再次硬編一套路由 |
| `circuit-breaker.hbs` | P/R；R8 | 保留 threshold、observed failure identity、breaker reason 與 escalation；`review-circuit-breaker.ts`、`src/types/cascade.ts`。Purpose cost bound 並非 token monetary cap，刪即收斂，不另建成本保證。REQ-TEMPLATES-192、REQ-TEMPLATES-203、REQ-TEMPLATES-234 |
| `debug-recovery-format.hbs` | R；無新增宣稱缺陷 | Attribution 的 upstream URL、commit、MIT 全文必留；移除的 THIRD-PARTY-NOTICES pointer 不得成為下游必備檔，standalone license 已完整。Load point 已在 introduction。REQ-TEMPLATES-208、REQ-TEMPLATES-210 |
| `delegated-evidence-format.hbs` | R；已區分 untrusted payload 與 trusted readback，無新增缺陷 | payload commands、artifact paths 已在正文，保留 schema projections/ceilings/markers/physical receipt；`src/types/station.ts`、`src/lib/delegated-evidence.ts`、`review-merge.ts`。REQ-TEMPLATES-180、REQ-TEMPLATES-181、REQ-TYPES-081、REQ-LIB-049 |
| `delegation-protocol.hbs` | R；無新增缺陷 | 單一定義、detection/preservation limits、human mutation handoff 必留；把 ticket/payload/checkpoint `.prospec/changes/{name}/{{delegation_dir}}/` 放 Ticketed delegation 首段，commands 已列各步。`src/lib/delegation.ts`／`src/lib/repo-state.ts`／`src/types/delegation.ts`；REQ-TEMPLATES-238、REQ-TEMPLATES-239 |
| `delta-spec-format.hbs` | P/R；R1 | 保留 Claim writing 四條、Spec whole-body、Dropped、unknown-label refusal、Feature/Story routing；刪 backfill 段替 knowledge classifier 下定義的尾句。`knowledge-sync.ts:170`；`archive.service.ts` spec-sync；REQ-TEMPLATES-119、REQ-TEMPLATES-166、REQ-TEMPLATES-241 |
| `design-spec-format.hbs` | P；R6 | intent vs precision 的操作規則移到 Guidelines，支援 adapter 對應來源；無 R。REQ-DSGN-001/008/009 |
| `drift-report-format.hbs` | R；shape authority／skip 非 PASS 規則已在正文，無新增缺陷 | `DriftReportSchema`、DRIFT_CHECK_IDS、check --json 寫檔與 stdout 人類摘要保留。`src/types/drift-report.ts`、`src/lib/drift-checker.ts`；REQ-TEMPLATES-092、REQ-TEMPLATES-157。Key Check Interpretations 的早期 knowledge timestamp 摘要應以後面 `last_verified` UTC-day 權威段為準，最小可刪摘要中的 git-timestamp 判斷複製 |
| `feature-boundary-criteria.hbs` | R；R9 | 保留三個 binding split signals、NC 人審、soft size signals、read/query domain ownership；不搬出新 Feature Spec skeleton。REQ-TEMPLATES-111 |
| `feature-spec-format.hbs` | P/R；主要 landing／retirement 宣稱已區分工具行為，無新增缺陷 | feature path 已在 intro；product path 可刪，無獨立操作。保留 slices 與 size guidance。`knowledge-reader.ts`、`spec-headings.ts`、`archive.service.ts`。token 數字 5000 是 default 不是所有專案 operative ceiling，若納入修正應使用已有 render budget context；不可發明第二個 resolver |
| `implementation-guide.hbs` | R；無新增必要修正 | constitution-owned TDD、CLI checkbox、project own runner 與 deferred commit 邊界在正文。`change-progress.service.ts`、`task-markers.ts`；REQ-TEMPLATES-212。`[P] can execute simultaneously` 是人類可並行的語義，不必僅因 implement 自動循序而改寫它 |
| `interaction-spec-format.hbs` | P；無新增缺陷 | draft DSL、platform-neutral behavior、states/transitions/flows 的資訊保留到 intro／Guidelines（draft 說明正文已存在）。REQ-DSGN-002；`artifact-validators.ts` design validator 只查 structure，不將 DSL 當 machine grammar |
| `metadata-format.hbs` | R；R10 | schema authority、status-lifecycle authority 在 intro 已有；issue normalization、schema enums/optional fields、context attribution、signoff 已在正文。`src/types/change.ts`、`src/lib/change-metadata.ts`、`change-log.service.ts`；REQ-TEMPLATES-150、REQ-TEMPLATES-157 |
| `plan-format.hbs` | P/R；無新增缺陷 | brownfield/greenfield、Call Chain、conditional flow diagram、reuse owner、Simpler Alternative 留正文。`change-plan.service.ts` scaffold 不是 semantic author；REQ-TEMPLATES-044、REQ-TEMPLATES-087、REQ-TEMPLATES-125、REQ-TEMPLATES-200。120-line 係 skill authoring 指引，不宣稱 CLI enforce |
| `plan-verifier-rubric.hbs` | P + shared partial R；R7 | 5 dimensions/schema/receipt 保留；框架中立原則只保留 shared partial 的一份。`PlanVerifierReportSchema`／change log sink；REQ-TEMPLATES-182、REQ-TEMPLATES-219 |
| `product-spec-format.hbs` | P/R；無新增缺陷 | exact Feature Map ownership、refusal kinds、bootstrap frontmatter boundary 已在正文。`archive.service.ts:1263` bootstrapProductSpec、1314 generateProductSpec；REQ-TEMPLATES-175、REQ-TESTS-075。只刪「2 minutes」Purpose 的讀速修辭，不變造 writer contract |
| `project-test-runner.hbs` | P/R；無新增缺陷 | config/manager/ecosystem hierarchy、honest fallback、snapshot scope/limitations、Constitution/commit rules 已在正文。`src/lib/test-runner.ts`、test-command resolver（由 check.service 呼叫）；REQ-TEMPLATES-192、REQ-TEMPLATES-234 |
| `promotion-format.hbs` | R；無新增必要缺陷 | 三個 tier 已分別有章節，刪 footer 不會失去 approval；保留 cleanup 的 per-entry approval、ledger retirement、harvest 非 promotion、original correction language。`src/lib/lessons-ledger.ts` 與 learn services；feedback-promotion Feature Spec 治理，必須保留 sweep/approval requirements |
| `proposal-format.hbs` | P/R；無新增缺陷 | INVEST expanded acronym 可移到 User Stories 首句，或保留既有 INVEST 指引即可；freeze/amend、assumptions、UI Scope 規則留正文。`change-story.service.ts`、`acceptance-baseline.ts`；REQ-TEMPLATES-030、REQ-TEMPLATES-032、REQ-TEMPLATES-190。`status.service.ts:300` 清楚區分 explicit UI routing 與 design skill missing-scope confirmation，現文未將兩者混同 |
| `review-format.hbs` | P/R；無新增缺陷 | severity、auto-fix boundary、evidence/identity/round metrics 已在正文；`review-merge.ts:172` identity two-pass、226 severityMax；REQ-TEMPLATES-067、REQ-TEMPLATES-203。repro inspection 與 regression-pin 要求是兩件事，不刪掉 pin |
| `review-lenses-content.hbs` | R；無新增必要缺陷 | Attribution upstream/commit/MIT 全文、severity owner、conditional loading 已在正文；保留 Docs-Claims 三規則、test-quality frozen row set。REQ-TEMPLATES-084、REQ-TEMPLATES-210、REQ-TEMPLATES-241；既有 lens criterion 不是聲称 machine guard，不以文風理由改表 |
| `spec-graduation.hbs` | 無 P/R；無新增缺陷 | 五 worklists、各 refusal remedy、struck-only history／active replacement、REQ-scoped reread 均具體。`archive.service.ts`、`src/lib/archive-spec-body.ts`；REQ-TEMPLATES-216、REQ-TEMPLATES-177、REQ-SERVICES-081、REQ-SERVICES-096 |
| `tasks-format.hbs` | P/R；R3/R5 | §4 kind frozen definition、optional P/estimate、quick forward/backward trace 保留；`task-markers.ts`、`change-tasks.service.ts`；REQ-TEMPLATES-086、REQ-TEMPLATES-136、REQ-TEMPLATES-188 |
| `tasks-verifier-rubric.hbs` | P + shared partial R；R4/R7 | 4 dimensions/schema/receipt、framework-neutral shared principle 保留；移除 optional P 缺少即 WARN 的範例。`TasksVerifierReportSchema`／change log sink；REQ-TEMPLATES-186、REQ-TEMPLATES-219 |
| `verify-backfill.hbs` | R；R1/R2 | proven-backfill file check、per-REQ fidelity、baseline limitations、real failures、canonical sync set 保留。`verify-record.service.ts:368` proven branch、`verify-grade.ts:49`；REQ-TEMPLATES-115、REQ-TEMPLATES-116、REQ-TEMPLATES-129、REQ-TEMPLATES-215 |

## 5 份 change templates 逐檔處置

| 檔案（`src/templates/change/`） | 結果／最小處置 | 證據與治理 |
|---|---|---|
| `auto-draft-proposal.md.hbs` | 無新增宣稱缺陷；保留 machine draft disclosure、unattributed finding 的確認與 CLI related-modules correction | `auto-draft.service.ts` 以 drift findings 輸入 scaffold；文字明說 only findings authoritative，未將 placeholder scenario 當完成結果。REQ-CLI-040、REQ-CLI-060 |
| `delta-spec.md.hbs` | R1：保留 feature-first REQ-id 與 Feature routing，刪 archive 代 knowledge classifier 宣稱 module derivation | `knowledge-sync.ts:170` precedence 與 `archive.service.ts:1513` shared gate；REQ-TEMPLATES-119 |
| `plan.md.hbs` | 無新增宣稱缺陷；純 scaffold placeholders，未保證 semantic completeness | `change-plan.service.ts` renders scaffold，agent 依 plan-format 完成；REQ-AGNT-012、REQ-TEMPLATES-161。不因 skeleton 缺選填 section 任意擴充 |
| `proposal.md.hbs` | 無新增宣稱缺陷；未命中 module 的補充操作是提示，未聲稱 init 保證自動命中 | `change-story.service.ts` related module matching／rendering；REQ-AGNT-012、REQ-TEMPLATES-161 |
| `tasks.md.hbs` | R5：無條件 prerequisites 與 quick CLI 相矛盾；改 CLI-selected input 的中性說明 | `change-tasks.service.ts:78,130`；REQ-TEMPLATES-085、REQ-SERVICES-076。marker 說明 cite tasks-format，勿建立另一份 kind schema |

## 刪節不應遺失的必要內容

1. `candidate-evaluation` Purpose 的 project-specific manifest/L2/convention adaptation 移到 Candidate Generation；兩個 rubric 使用既有 shared principle，避免再搬一份。
2. `design-spec-format` intent vs exact-values 規則移到 Guidelines，source 遵循 adapter，保留 HTML。
3. `interaction-spec-format` draft DSL 性質留在 intro／Guidelines；不可讓删 Purpose 被理解為 DSL 已穩定。
4. `delegation-protocol` footer 的 ticket/payload/checkpoint directory 移到 ticket flow；這是唯一需搬移的具體操作 path。
5. `debug-recovery-format` 與 `review-lenses-content` Attribution／MIT 全文、upstream commit 保留；它們是獨立章節，不能被泛用「從 Reference Information 往前刪」腳本吞掉。
6. 兩個 rubric 渲染的 Reference Information 來自 `src/templates/skills/_verifier-rubric-base.hbs:21`；只掃 31 原檔會漏掉。shared Break-Glass／Language Policy／framework-neutral principle 均不可刪。
7. 其他 footer 的 project/knowledge/constitution 資料皆已有 intro／rule-local authority，毋須搬到另一個相同大小 metadata 段落。

## 三處以上重述／registry 處置

| 規則族 | 消費站點 | 處置 |
|---|---|---|
| backfill module derivation／不 mint module | `verify-backfill`、`delta-spec-format`、`change/delta-spec.md`、`cascade-protocol` 與 skill siblings | 多於三處。優先刪除不必要分類宣稱；實際同步集合已有 `canonical_claims.backfill_sync_modules`，沿用並由 main audit 登記各修正站點。若仍需要分類／refusal 指引，新增一個 CLI-output-following phrase 並登記全部 bounded sites，勿單獨改例外句 |
| general knowledge sync modules | `cascade-protocol` + verify/archive/implement 等 | 已有 `canonical_claims.knowledge_sync_modules`，本次不另建相同 owner |
| kind `[M]/[V]` / unmarked code | `tasks-format`、tasks rubric、change/tasks top+notes、skills | frozen definition 在 tasks-format；修正 R3 後保留精簡 cite，不新增第二套 grammar 或同義 registry。若保留 3+ 個完整定義，才需 registry；最小方案是刪重述 |
| architecture-neutral verifier principle | candidate Purpose、plan Purpose、tasks Purpose、shared partial | 刪兩個 rubric Purpose 後 only candidate-specific adaptation + 一個 shared template owner；生成兩個 copies 不算兩個作者來源，無需再加 registry |
| Spec whole-body／struck-only／Dropped | delta-spec-format、spec-graduation、feature-spec-format 的 landing 警告 | 各 section 回答不同操作（author、graduate、hand-authored format）；完整 whole-body 定義未在三份全文重述。保留現有 scoped contract；勿為達 registry 數量額外擴寫 |

## 驗證建議

以實際 directory enumeration 渲染 31 references，驗證 h2 set 不含兩標題，且集合非空並與來源集合一致。必要保留內容採 bounded section assertion；不能只禁止幾個單字。現有 `tests/contract/skill-format.test.ts:657` 以 Reference Information 當 section 終點，移除時改下一個真實 heading 或 EOF 並 assert non-empty。新 claims 的每個 class 至少一個具體 mutation（錯置分類、回填 100% guarantee、quick prerequisite、optional P WARN、丟失 adapter rule／license）需先 bundle 再證明轉紅；不可只用測試自身的 synthetic string fixture 宣稱 source mutation 已做。
