<!-- prospec:review-metrics round="4" loop_base="3" provenance="1dd41084bb56b6debc4786b81929bf6aa5a619d2b7634059c3a603f68d38dbd7" lenses="correctness,security,spec-architecture,docs-claims,parallel-site-completeness,test-quality" signatures="R1-2:P,R3-1:P" -->
# Review Findings: align-knowledge-verdict

| ID | Location | Severity | Lens | Status | Origin | Summary | Repro |
|---|---|---|---|---|---|---|---|
| R1-1 | src/templates/skills/references/cascade-protocol.hbs:64 | critical | spec-architecture | fixed | 1 | S/A 人工提交區仍命令重新執行 freshness stamp，會使剛完成的證據過期並再次回到 review/tests/verify，與 REQ-TEMPLATES-129 的確認既有輸入相矛盾。 | sed -n '64,73p' src/templates/skills/references/cascade-protocol.hbs; sed -n '42,45p;82,85p;98,103p' src/services/knowledge-verify.service.ts |
| R1-2 | tests/contract/skill-format.test.ts:3155 | major | test-quality | fixed | 1 | Knowledge Quality Gate 已依 row key 拆欄驗證 WARN 儲存格，原有漏網情境已封住。 |  |
| R2-1 | src/templates/skills/references/cascade-protocol.hbs:67; src/templates/skills/references/verify-backfill.hbs:57-59 | critical | parallel-site-completeness | fixed | 2 | 同步時序修正漏掉強制載入的 backfill reference；其 Post-Verify 步驟仍無條件 stamp，讓 backfill 在每次完成驗證後再次改動 inputs，與本次 REQ-TEMPLATES-129 的 pre-validation／confirmation 契約相反。 | sed -n '35,36p' src/templates/skills/prospec-verify.hbs; sed -n '57,60p' src/templates/skills/references/verify-backfill.hbs; sed -n '82,85p;98,103p' src/services/knowledge-verify.service.ts |
| R3-1 | README.md:643-656; README.zh-TW.md:609-622; docs/index.html:349,541; docs/i18n.js:128,217 | major | docs-claims | fixed | 3 | 雙語 README 與網站 backfill 路徑已先完成 Knowledge preparation 再 final Verify，並保留 module union、fidelity 與 optional review 說明。 | sed -n '637,657p' README.md; sed -n '603,623p' README.zh-TW.md |

<!-- prospec:evidence-section -->
## Evidence

<!-- prospec:evidence R1-1 -->
### R1-1

cascade 的入口仍是「When the pipeline completes final Verification with Grade S/A」，第 1 項卻無條件要求 Run prospec-knowledge-update 與 Stamp freshness via prospec knowledge verify；接著又命令輸入改變時 return to final review/tests/verify。knowledge-verify.service.ts 的 execute 每次取新的 ISO instant，無條件覆寫 last_verified 並 atomicWrite；它不是只讀確認，也沒有健康且已同步時免寫的分支。因此照順序完成 S/A 後仍會改 effective inputs，重新驗證抵達同一段又會改一次。這與本 change 的 REQ-TEMPLATES-129「S/A prompt confirms validated inputs」及 US-2 的 final validation 順序直接相反。snapshot 中已擴充 input-snapshot 的 cross-UTC-day fixture：首次 stamp 後 health PASS，再用同日一秒後的 now 第二次 stamp，health 仍 PASS 但 digest 再次改變；node node_modules/vitest/vitest.mjs run tests/unit/lib/input-snapshot.test.ts -t cross-UTC-day 通過，確認重複 stamp 並非 no-op。修正應把真正的 sync/stamp/count 寫入明確放在 pre-validation，S/A 區僅確認它們已完成；若發現缺漏才回到前置步驟，避免每次抵達 S/A 重新 stamp。對應 regression pin 應檢查 S/A owning step 為 confirmation、不能無條件再次 stamp，而不只搜尋 final-order 字串。
獨立 verifier-r1-1 confirmed，ticket 實體 receive。regression pin：Knowledge final evidence order，unfixed RED；sync/stamp/count steps 移到 before-boundary preparation，S/A 僅確認 already validated inputs；修正後 pin GREEN。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R1-2 -->
### R1-2

獨立 snapshot 重新套用 ignore-own-lag-warn，將 WARN cell 改為 Ignore its WARN when this change caused the lag; grade PASS instead；Knowledge Quality Gate retains guard 出現預期 AssertionError，mutation KILLED。額外獨立 mutations own-lag-exemption、late-sync、reordered-evidence、knowledge-warn-to-pass、freshness-always-pass 各自由對應 V4、cascade、verify-record 與真實 Git fixture assertion 擋下，全部 KILLED；不是把 baseline/token-count 失敗當 receipt。所有 source/bundle 已還原；skill-format、input-snapshot、verify-record、bundled-templates-sync 共 1369 passed。既有 R1-1 Knowledge final evidence order 與 R2-1 Knowledge Sync syncs the set pins 同次通過，沒有重新裁決已解決 critical。初次 snapshot 內的 non-Git fixture 因搜尋到外層 snapshot repository 而失敗，設定 GIT_CEILING_DIRECTORIES 為 snapshot/tmp 後，在不修改測試的情況下 baseline 與還原後皆通過。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R2-1 -->
### R2-1

本次 diff 將 cascade §Tastemaker 的 sync/stamp 移至 final validation 前，且第 67 行明確包含 scale: backfill。delta-spec 的 REQ-TEMPLATES-129 同時要求完整 final Knowledge/freshness-stamp 同步先於 final review/tests/verify，S/A prompt 只確認已驗證輸入，並明列 backfill module set。然而 prospec-verify.hbs:35-36 在 backfill 時強制先讀 verify-backfill.md；該 reference 的第 57-59 行仍以「Post-Verify Commit & Knowledge Sync」命令 Run knowledge update 然後 knowledge verify，完全沒有條件化為僅在 preparation 不完整時回前置步驟。knowledge-verify.service.ts:82-85、98-103 每次直接更新 last_verified 並 atomicWrite，因而照此特殊分支執行會在每次 verify 後再使 evidence 過期。這是本次正在修正的同一時序 invariant 的平行 consumer，且新 delta-spec 明確包含 backfill，不是另擴無關歷史債。cascade 的 R1-1 pin 已在 snapshot 跑 GREEN，這裡不重判已修正的 cascade；漏網的是其 backfill 特例 reference。建議讓 backfill reference 引用 canonical pre-validation preparation，將 post-verify 改為確認既有輸入，並新增該 section 的 guard。檢查上述 repro 已讀到實際命令與 writer；snapshot 的 skill-format、input-snapshot、verify-record 三 suites 共 1367 tests PASS。所有 repro/tests/mutations 在 snapshot；main 唯讀，僅寫此 ticket payload。
修正 receipt：review-verifier-r2-1-2-1 independently confirmed；舊 backfill section 在 Knowledge Sync syncs the set pin 下 RED，修正為 final preparation／S/A confirmation 後 GREEN；post-verify-backfill-stamp mutation KILLED。保留 CLI-reported ∪ related_modules 與 fidelity 描述；bundle／deployed／exact reference baseline 已同步，ceiling 不變。詳見 mutation-results.json 與 /private/tmp/prospec-325-r2-pin-red.log、r2-pin-green.log、r2-mutation-red.log。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R3-1 -->
### R3-1

獨立檢查兩份 README 的 Mermaid 次序 PR → K → V → A 與第 4／5 步 Knowledge Sync／Final Verify；網站 how、brownfield 的英文及中文 overlay 也採相同順序。snapshot 各自套用 backfill-diagram-en、backfill-diagram-zh、backfill-site-en、backfill-site-zh、backfill-how-en、backfill-how-zh，全部在對應 section/order assertion 出現預期失敗，六項 mutation 皆 KILLED。已讀 ca0b97707173 起的完整 authored cumulative diff，執行 correctness、security、spec-architecture、docs-claims、parallel-site-completeness、test-quality 六個 lenses；以 collectGitTimestamps、evaluateKnowledgeHealth、isStale、verify-record 與 knowledge-verify 的既有 owner 實作比對機械判定和寫入順序，並搜尋 templates、README、website、reference 的平行指引，沒有新增 unresolved critical／major。此輪未重跑全專案 7000 項 suite，不把作者提供的全 suite 結果算作獨立執行；本輪獨立 baseline 及 mutation 還原後均為 1369 passed。
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->
