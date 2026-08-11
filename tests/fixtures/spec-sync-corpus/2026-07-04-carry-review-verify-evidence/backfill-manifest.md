# Backfill Recovery Manifest — carry-review-verify-evidence

回填前帶 `## Review & Verify` 節：4 筆；回填後：54 筆（本輪 best-effort 回填 50 筆）。

分級小計：rich 35、grade-only 14、not-recoverable 1。

證據來源鐵律：僅取自 (1) 摘要檔自身內文，(2) `prospec/ai-knowledge/_lessons-ledger.md`（以去日期前綴的變更名比對 `source_changes`）。缺該資訊即據實記「不可回收（bundle 已失）」或「無 review 輪（pre-review-loop era）」，不填空想值。

| 條目 | grade | review 明細來源 | 分級 |
|------|-------|----------------|------|
| prospec-mvp-cli | A (shipped) | pre-review-loop | grade-only |
| mvp-initial | A (Good) | pre-review-loop | grade-only |
| add-knowledge-update | A (Good) | pre-review-loop | grade-only |
| add-archive-system | A (Good) | pre-review-loop | grade-only |
| configure-base-dir | A (Good) | pre-review-loop | grade-only |
| knowledge-redesign | A (Good) | pre-review-loop | grade-only |
| redesign-spec-system | A (Good) | pre-review-loop | grade-only |
| refactor-skill-token-efficiency | A (Good) | pre-review-loop | grade-only |
| skill-autonomy | A (Good) | pre-review-loop | grade-only |
| add-design-phase | A (Good) | pre-review-loop | grade-only |
| enhance-knowledge-sdd-pipeline | A (Good) | pre-review-loop | grade-only |
| remove-skill-language-directives | A (Good) | pre-review-loop | grade-only |
| archived-capabilities | A (shipped) | pre-review-loop | grade-only |
| optimize-ai-knowledge | A (Good) | pre-review-loop | grade-only |
| add-output-contract | A | summary內文 | rich |
| make-constitution-executable | A | summary內文 | rich |
| add-init-language-policy | A | summary內文 | rich |
| add-token-measurement-harness | A | summary+ledger | rich |
| reorder-stable-prefix-loading | A | summary內文 | rich |
| add-knowledge-flywheel | A (verified) | summary+ledger | rich |
| add-scale-adapter | A | summary內文 | rich |
| add-mcp-server | S | summary+ledger | rich |
| enhance-skill-instructions | S | summary+ledger | rich |
| group-index-by-category | S | summary內文 | rich |
| centralize-index-column-schema | S | summary內文 | rich |
| fix-archive-sibling-reference | A | summary內文 | rich |
| vendor-engineering-heuristics | S | summary+ledger | rich |
| add-dependency-knowledge | S | summary內文 | rich |
| add-quickstart-command | A (Ready to deploy) | summary內文 | rich |
| complete-capability-to-feature-migration | S | summary內文 | rich |
| add-knowledge-refresh-command | A | summary內文 | rich |
| add-reverse-spec-extraction | A (Ready to deploy) | summary+ledger | rich |
| collapse-knowledge-refresh-into-init-flag | A (verified) | summary內文 | rich |
| raw-scan-c-cpp-swift | A | summary+ledger | rich |
| raw-scan-multi-language | A | summary+ledger | rich |
| extract-backfill-spec-skill | A | summary+ledger | rich |
| add-feature-map | S | summary+ledger | rich |
| backfill-promotion-path | A (re-verified) | summary+ledger | rich |
| converge-archive-summaries | S | summary+ledger | rich |
| feature-first-backfill | S | summary內文 | rich |
| harden-feature-prefixed-req-sync | A | summary+ledger | rich |
| mcp-spec-entry-resources | S | summary內文 | rich |
| fix-init-clobber-add-upgrade | A | summary+ledger | rich |
| preserve-agent-config-edits | S | summary+ledger | rich |
| remove-deprecated-steering-command | A | summary+ledger | rich |
| upgrade-config-nudges | S | summary內文 | rich |
| implement-hierarchical-index | (無 grade 欄) | not-recoverable | not-recoverable |
| add-init-project-readme | S | summary內文 | rich |
| migrate-skill-contract-to-vitest | S | summary+ledger | rich |
| upgrade-create-missing-docs | S | summary內文 | rich |

## 用 ledger 補明細的條目（summary+ledger，17 筆）

以下條目的 review critical/major 明細或 verify 訊號，摘要內文不足、由 `_lessons-ledger.md` 對應變更名補齊：

- **add-token-measurement-harness** — measure/spend-accounting-failure-paths：5 criticals 中 4 個同源於「成功路徑才入帳」金流失敗路徑。
- **add-knowledge-flywheel** — refactor/relocation-reference-sweep-completeness：4 majors 同源於遷移引用掃描不完整。
- **add-mcp-server** — test/structural-false-green + security/invariant-misses-parallel-consumers：4 criticals（Round 4-5 的 3 個根因「不變式漏套平行消費路徑」）。
- **enhance-skill-instructions** — fix/rework-misses-parallel-site：round-2 揪出 entry-config session-detection 舊 status-only lookup。
- **vendor-engineering-heuristics** — docs/duplicated-count-drift 第四度：模板 inventory 漏更（1 review major）。
- **add-reverse-spec-extraction** — spec/reverse-extraction-fabricates-and-undercovers：dogfood 證捏造/漏覆蓋兩失效模式。
- **raw-scan-c-cpp-swift** — raw-scan/techstack-deps-language-ordering：C-family 語言/deps 閘不對稱以 `hasCFamilySource` gate 修。
- **raw-scan-multi-language** — raw-scan/techstack-deps-language-ordering：Ruby+PHP polyglot Tech Stack/deps 不一致（Gemfile→[] 短路修）。
- **extract-backfill-spec-skill** — docs/duplicated-count-drift 第 8 度：README「14 Skill templates」subline 漏更（1 major）。
- **add-feature-map** — PB-004（count-drift lens 預先攔下、verify 0 WARN）+ PB-005；摘要內文僅 task 計數。
- **backfill-promotion-path** — security/self-attested-marker-needs-provenance（C2 critical）+ design/hollow-artifact-to-pass-gate。
- **converge-archive-summaries** — PB-004（+1 contract test、verify 補正計數）+ PB-005；摘要內文僅 task 計數。
- **harden-feature-prefixed-req-sync** — refactor/duplicated-helper-parallel-sites（PB-006）：3 advisory majors 同源。
- **fix-init-clobber-add-upgrade** — docs/measurement-attribution-overclaim 第 8 度：iter-2 review 揪出 7 處 doc/comment 舊宣稱。
- **preserve-agent-config-edits** — refactor/duplicated-helper-parallel-sites（PB-006）：2 review majors 於 refactor commit 反向修復。
- **remove-deprecated-steering-command** — docs/duplicated-count-drift 第 15 度：services 計數 −1 誤套，review 獨立 re-derive 校正。

（migrate-skill-contract-to-vitest 亦引用 PB-004 第 18 度作 review nit 佐證，歸為 summary+ledger。）

## 分級判準

- **rich** = 回收到實際 review/verify 明細（review critical/major 計數、review-clean 結論、或 verify 維度/測試/drift 數字），來源為摘要內文或 ledger。
- **grade-only** = 只有 grade（＋task/AC 完成度），無 review 輪、無 verify 維度稽核。本輪 14 筆皆為 2026-02 / 2026-03 pre-review-loop era（對抗式 review-fix loop 導入前）。
- **not-recoverable** = 連 grade 都無。僅 implement-hierarchical-index（無 `Quality Grade` 欄，Verify 記「Grade 未記錄」）。
