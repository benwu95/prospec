# Shipped Skill Claims 稽核：17 Skills 與 8 Partials

## 範圍與判準

本次逐檔讀取 `src/templates/skills/prospec-*.hbs` 全部 17 檔及同層 `_*.hbs` 全部 8 檔。先讀 L1 index、templates README 與 skill-authoring，再依 claim 所指 owner 讀 services／lib README 與必要 source。這是 plan 階段的靜態證據蒐集；未執行 workflow mutation、測試、source 修改、git 寫入或 metadata 修改。

依 `REQ-TEMPLATES-241`（`prospec/specs/features/agent-integration/us-448.md:30`）檢查三項：元件只聲明自己提供的保證；集合與條件跟隨實作 predicate；量詞與因果涵蓋整個聲明範圍。以下 finding 指向可觀察的錯誤路由、錯誤 gate 解讀或不成立的保證，不將單純文風列為問題。「未新增 finding」表示本次未找到足夠反證，並不等於所有自然語言都已機器驗證。

## Findings

### SK-01 — Archive 重述 classifier 時抹掉判定順序、proven-backfill 與 known 集合

- **位置**：`src/templates/skills/prospec-archive.hbs:37`、`:38`、`:162`、`:219`；同一派生說法見 `prospec-promote-backfill.hbs:59`。
- **現有 claim**：`scale: backfill` 即採 `related_modules + Feature→feature-map`；standard/full 的 prefix 命中 `req_prefixes` 就一定不是 module。
- **反證**：`src/lib/knowledge-sync.ts:170` 的 `classifyDeltaEntry` 先判 canonical ID，再於 `:180` 優先判 known module，`:181` 才查 feature prefix，`:183` 才查 proven backfill。feature 分支在 `:177` 明確與 known 取交集。`findUnsyncedModules` 於 `:250` 傳入 `isProvenBackfill(changeDir, metadata.scale)`，不是單看 scale。其最後 gate 集合再 union 原始 `related_modules`。
- **具體反例**：prefix 同時是已註冊 module 與 feature prefix 時，CLI 選 module；只設 backfill 但沒有 draft 時，CLI 不走 feature-slug fallback。現文會引導 agent 跟 CLI 判不同集合。
- **既有 governing REQ**：`REQ-LIB-097`（`sdd-workflow/us-37.md:127`）、`REQ-SERVICES-032`（`ai-knowledge/us-310.md:32`）；受影響模板需求為 `REQ-TEMPLATES-083`、`REQ-TEMPLATES-120`（`sdd-workflow/us-37.md:76,94`）與 `REQ-TEMPLATES-117`（`sdd-workflow/us-23.md:29`）。舊 `REQ-TEMPLATES-117/120` 的重述也比新的 classifier owner 寬，delta-spec 應更新其文字而不修改 predicate。
- **最小替換**：Entry Gate 保留「`metadata.related_modules` ∪ modules resolved by the shared delta-spec classifier」，指向 CLI refusal/report；Phase 4 只寫「Reuse the Entry Gate's resolved set」，保留 quick 的 skill diff-path 補充。若要說明 backfill，限定「proven backfill 的 feature-slug fallback」，不要把它寫成全 scale 規則。promote 只聲明保留 feature-first ID、routing header 與 traced `related_modules`，不要自行保證 archive 如何分類。

### SK-02 — 沒有 affected modules 不等於 Knowledge gate 通過

- **位置**：`src/templates/skills/prospec-archive.hbs:35`：「A change that touches no modules (planning/docs-only) passes this item.」
- **反證**：`src/lib/knowledge-sync.ts:224` 的 `hasKnowledgeSyncGap` 同時計入 `moduleMapUnreadable`、`malformedIds`、`unregistered` 與 `stale`。`:250–258` 即使 affected 集合最後為空，仍保留 module-map／非 canonical ID 的輸入 gap。feature-map 讀失敗也會拋錯，沒有 docs-only exemption。
- **具體反例**：delta-spec 只含 malformed ID、沒有 related module；affected 集合空，但 `malformedIds` 非空而拒絕。是否為文件變更不參與 predicate。
- **既有 governing REQ**：`REQ-LIB-097`、`REQ-LIB-071`（`sdd-workflow/us-6.md:157`）、`REQ-TEMPLATES-083`。
- **最小替換**：「An empty affected-module set alone does not establish a pass; follow the CLI's knowledge-sync verdict and any input-invalid refusal.」或直接刪除 docs-only 豁免句，前面的 refusal/remedy 已足夠。

### SK-03 — Archive 把 README 語意正確性說成 CLI 的拒絕保證

- **位置**：`src/templates/skills/prospec-archive.hbs:35`：「refuses … until each module's README reflects the change's final state」。
- **反證**：`src/lib/knowledge-sync.ts:350` 的 `isModuleCurrent` 只檢查有效 `last_verified`、README 存在及 source-commit currency；不讀 README prose 去判斷 REMOVED behavior 是否已移除。無 timestamp 時 `:358` 還有明確的容許分支。Skill 的 Phase 4 人工讀 README 才是語意判斷。
- **具體反例**：README 存在、stamp 新，但內容仍描述已移除行為，機器可通過；skill 必須另行擋下。原句會讓 agent 誤認 CLI 已替自己完成 semantic check。
- **既有 governing REQ**：`REQ-LIB-097` 的 `stale` 定義、`REQ-SERVICES-090`（`knowledge-management.md:41`）、`REQ-TEMPLATES-083`，以及共同 authoring rule `REQ-TEMPLATES-241`。
- **最小替換**：拆成兩個主詞：「The CLI refuses the knowledge-sync gaps it reports. This skill also confirms that affected READMEs describe the final behavior, including removal of removed behavior.」不增加新 gate，不改 stamping 邏輯。

### SK-04 — Knowledge update 缺少 bad-map refusal 的處理，manual mode 不能充當修復捷徑

- **位置**：`src/templates/skills/prospec-knowledge-update.hbs:35` Phase 1 與 `:180` Error Handling。
- **問題**：Phase 1 把 CLI 描述成能分類、補 skeleton、更新 index；Error Handling 只有 map 不存在與 missing delta-spec 改用 `--module`，沒有區分「map 存在但不可信」的 fail-closed 分支。
- **反證**：`src/services/knowledge-update.service.ts:404–410` 呼叫 `readKnownModules`；map 無法讀／解析／驗證或越出 knowledge root，會在分類及寫入前拒絕。`src/lib/knowledge-sync.ts:67–99` 定義原因與修復。另一方面 `executeForChange` 於 `knowledge-update.service.ts:606–609` 在任何 change 解析前直接走 manual mode；`:506–529` 用 supplied name 補 skeleton，沒有同一個 delta-mode guard，也沒有 diff attribution。
- **風險**：把 `--module` 誤當「讓 command 成功」的替代路徑，會跳過原本拒絕的分類證據；成功執行 manual mode 不代表 bad map 已修復。
- **既有 governing REQ**：`REQ-SERVICES-032`、`REQ-CLI-026`、`REQ-TEMPLATES-162`（`ai-knowledge/us-310.md:32,44,51`）、`REQ-LIB-097`。
- **最小替換**：Phase 1 加一條 refusal handling：「If change mode refuses an unreadable or invalid module map, repair the named input and rerun change mode; do not use `--module` to bypass that refusal.」Error Handling 增加相同情境、指向 Phase 1。保留合法 quick/manual refresh 的 `--module` 用途，不把 manual mode 描述成與 change mode 同等驗證。

### SK-05 — Verify 的 NEVER 仍把 persisted report 說成 machine authority

- **位置**：`src/templates/skills/prospec-verify.hbs:412`：「the CLI reads them from the report」。
- **反證**：`src/services/verify-record.service.ts:531–532` 呼叫 `assessCurrentDrift(cwd)` 取得當次 assessment。此處 report 是 live assessment 的結果，不是必須存在的 `prospec-report.json`。模板同檔 Record & Status Update 已明說 persisted report 只是 display artifact，因此 NEVER 的無限定表述會把 reader 拉回舊契約。
- **既有 governing REQ**：`REQ-CLI-029`（`sdd-workflow/us-29.md:54`）明確保證 absent/stale/legacy persisted report 不影響自取當前 facts；`REQ-TEMPLATES-241`。
- **最小替換**：「the CLI self-sources them from a live assessment」。Startup 仍可讀 report 呈現事實；不改 CLI authority、input refusal 或流程。

### SK-06 — Constitution substantive-empty 被擴張成 verify／Entry/Exit gates 全部 no-op

- **位置**：`src/templates/skills/prospec-explore.hbs:57`、`prospec-knowledge-generate.hbs:182–183`。
- **反證**：`src/lib/drift-checker.ts:1053–1090` 在只有 seeded rules 時回傳 warning，仍帶 `constitution.rules`；不是全域停用 gate。`src/services/verify-record.service.ts:337–354` 仍驗證 judgment set／grading context，`:531` 仍 live assessment；archive 的 `src/lib/knowledge-sync.ts:224` gap 判斷也完全不依 Constitution 是否有自訂規則。
- **具體反例**：空 Constitution 不會讓 absent review、invalid knowledge map 或缺漏輸入的拒絕消失。`knowledge-generate` 甚至寫成整個 `prospec-verify` 是 no-op，範圍更大。
- **既有 governing REQ**：`REQ-TEMPLATES-096`（`sdd-workflow/us-15.md:78`）只要求提醒自訂原則的意義與編輯方式；`REQ-CLI-029`、`REQ-LIB-071` 為仍生效的 gate owner。
- **最小替換**：「The Constitution has no project-authored principles to audit; add project-specific rules to `<constitution_path>`.」保留 advisory 與 edit pointer，刪除所有 gates no-op 推論。
- **範圍限制**：runtime `src/lib/drift-checker.ts:1082–1084` 也有同源 no-op 文案。依主工作 scope，本次只修 shipped templates 的推論，不修改 runtime／predicate；此處記錄為已知平行文案，不擴大寫入面。

### SK-07 — Promote 把 fidelity 當成 S/A 與可封存的充分條件

- **位置**：`src/templates/skills/prospec-promote-backfill.hbs:78`：「so a faithful draft reaches grade S/A → verified → archivable」。
- **反證**：`src/services/verify-record.service.ts:373–374` proven backfill 只排除指定 grade dimensions；Knowledge 維度未排除。`:686–700` 仍合併 warnings 並 `computeGrade`。即使 fidelity PASS，Knowledge FAIL 或超過 warning budget 都可能不是 S/A。即使達 S/A，archive 仍有 `src/lib/knowledge-sync.ts:224` 等獨立 gate。
- **既有 governing REQ**：`REQ-TEMPLATES-115/116/118`（`sdd-workflow/us-23.md:17,24,34`）、`REQ-CLI-029`、`REQ-LIB-071`。其中 `REQ-TEMPLATES-116` 另外明定真實 test failure 不能被背書為可放行；本次不藉此重寫 grade engine。
- **最小替換**：「Route the scaffold to `prospec-verify` for backfill spec-fidelity grading; the CLI determines the grade and archive eligibility remains subject to the archive gates.」刪掉 fidelity ⇒ S/A ⇒ archivable 的充分條件，不擴張 promote 的責任。

### SK-08 — Archive retired-row refusal 的因果超出 upsert 保證

- **位置**：`src/templates/skills/prospec-archive.hbs:186`：「a row whose status is retired is refused … because its root cause is gone」。
- **反證**：`src/lib/lessons-ledger.ts:151–156` 只依 `existing.status === 'retired'` 返回 unchanged；warning 還明說 pattern 可能再次活躍，可由人決定 un-retire。command 不驗證 root cause 已消失，不能把人工歷史判斷當成本次 refusal 的保證。
- **既有 governing REQ**：`REQ-CLI-030`（`feedback-promotion/us-1.md:92`）只保證 retired counters 不變；`REQ-TEMPLATES-071/174`（`feedback-promotion/us-3.md:33,44`）分別管 harvest 與人工 Sweep。
- **最小替換**：刪除「because its root cause is gone」。保留 refusal、unchanged、warning 與 human review/remedy；不必另寫長篇理由，也不修改 engine。

## 逐檔盤點

| 檔案（皆位於 `src/templates/skills/`） | 結果與本次核對重點 |
|---|---|
| `prospec-archive.hbs` | SK-01/02/03/08。核對 classifier、gap→reason、freshness predicate、retired-row branch；其 live assessment、nonfatal product sync 與 finalize 分工未新增 finding。 |
| `prospec-backfill-spec.hbs` | 未新增 finding。extraction 記錄行為、intent 不明標記、>50% 分母屬 judgment；validator 只稱 route/marker facts，沒有稱 CLI 判懂故事意圖。 |
| `prospec-design.hbs` | 未新增 finding。結構 validator 與 component/interaction judgment 明確分離；platform-dependent 操作有 adapter/fallback 條件。 |
| `prospec-explore.hbs` | SK-06。其餘探索三空間與 convergence 是 skill 自身程序，不冒充 deterministic verdict。 |
| `prospec-ff.hbs` | 未新增 finding。下游 stations 走各自契約、receipt 與人類 sign-off；多站 guarantee 有下游 references/CLI sink 主詞。 |
| `prospec-implement.hbs` | 未新增 finding。progress 計數交 CLI；fresh test refusal 指向 runner reference；commit 點與 quick exceptions 具明示範圍。 |
| `prospec-knowledge-generate.hbs` | SK-06。bootstrap map 明稱 draft；propose/confirm/write-back 及 raw-scan partial view 有限制語，未宣稱 heuristic 完整理解專案。 |
| `prospec-knowledge-update.hbs` | SK-04。現有 README content 不由 CLI 改寫、stamp-only 只需 stamp 的責任分界清楚；補足 fail-closed mode 邊界即可。 |
| `prospec-learn.hbs` | 未新增 finding。upsert mechanics、semantic key judgment、promotion human approval 分開；threshold 有 configured/default 範圍。退休是否成立屬 Sweep，不是 upsert 決定。 |
| `prospec-new-story.hbs` | 未新增 finding。draft-first／interactive 區分、freeze/amend writer、scale prediction 與 archive actual-diff recheck 有明確範圍。 |
| `prospec-plan.hbs` | 未新增 finding。candidate metrics 與選擇 judgment 分離；verifier report 是 sink 驗證 schema，不聲稱 CLI 做架構語意驗證。 |
| `prospec-promote-backfill.hbs` | SK-01 的重述點及 SK-07。scaffold validator claim 本身包含 artifact/scale/status/trust-zone 檢查，未把 source 語意 fidelity 描述為 validator 的 deterministic 判斷。 |
| `prospec-quickstart.hbs` | 未新增 finding。localization fill-missing 與確認後 write、knowledge-init 與 knowledge-generate 分工清楚。triggers/exclusions completeness 改善超出本次有實作反證的 claim 清單，未擴成新功能。 |
| `prospec-review.hbs` | 未新增 finding。最強 tier 是 routing 指引，runtime spawn failure 有 degradation；delegated evidence/merge/counts 與 reviewer existence judgment 分離。 |
| `prospec-tasks.hbs` | 未新增 finding。optional `[P]`/`~lines` 與必要 kind markers 分開；schema acceptance 與 task contract judgment 分開。 |
| `prospec-upgrade.hbs` | 未新增 finding。present/MISSING inventory 與 canonical/preserved-user-content markers 的分支有 owner；template 取得失敗不猜測。 |
| `prospec-verify.hbs` | SK-05。live authority、self-grading cap 與 backfill exemptions 大部分已有明確 owner；本次不重設 grade policy。 |
| `_cli-probe.hbs` | 未新增 finding。只規定 probe/version floor/STOP，不宣稱 probe 能驗證全部 command 行為。 |
| `_generated-notice.hbs` | 未新增 finding。產物 owner 指向 agent sync，沒有新增 gate 或條件。 |
| `_harness-capabilities.hbs` | 未新增 finding。registry 能力與 runtime spawn failure 分支明示，沒有把宣告等同 runtime 必定成功。 |
| `_knowledge-loading-rules.hbs` | 未新增 finding。L0 out-of-scope、per-project budgets 與 warning-only 效果分開；沒有把 source loading 層寫成 CLI 自動載入。 |
| `_language-policy.hbs` | 未新增 finding。以 Constitution 的 path policy 決定文件語言，technical identifiers 等例外明示。 |
| `_next-step-handoff.hbs` | 未新增 finding。status/lifecycle 與 terminal/non-advancing branches 有限定，不宣稱 status alone 足夠。 |
| `_output-summary-note.hbs` | 未新增 finding。要求 observable Success Criteria，未保證自然語言 self-assessment 等於機器 gate。 |
| `_verifier-rubric-base.hbs` | 未新增 finding。override 要 explicit rationale、quality_log；屬程序契約，沒有聲稱跳過任何 deterministic schema/refusal。 |

## 最小實作建議

先修 6 個有 finding 的 skill 檔：archive、knowledge-update、verify、explore、knowledge-generate、promote-backfill（SK-08 與 archive 共檔）。不為「未新增 finding」檔案造改動。classifier 的重複文案收斂至 CLI owner；若保留三處以上同義文字，依既有 canonical-claims 規則登記，不新增 parser 或 predicate。

測試應針對 bounded section 釘住責任與條件，並 mutation 驗證：刪掉 bad-map repair/no-bypass；換回 docs-only auto-pass；把 live assessment 換回 saved report；把 backfill fidelity 換回充分條件；把 empty Constitution 換回全域 no-op。現有測試若釘住舊 broad phrase，要改成 owner-aligned assertions，不能只放寬到任意 keyword。bundle、generated skills、UTF-8 baselines 仍由既有生成路徑更新；本報告未執行這些變更。
