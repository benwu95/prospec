# Review: harden-verify-adjudication

**Rounds:** 2 / cap 3   **Status:** review-clean
**Mode:** A（5 並行 lens：correctness／security-data-integrity／spec-architecture／test-quality／docs-claims＋parallel-site）；每個 critical 經獨立存在性驗證後才修

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| tests/e2e/cli.test.ts:725 | critical | spec-architecture | fixed（fixture 補 git repo；stale-dist 假綠以 fresh build 重現後根治） |
| src/lib/drift-sources.ts:1286 (hasVerifyGrade) | critical | docs-claims/parallel-site（correctness 亦報 major） | fixed（skill/grade/result trim；RED 測試先行） |
| src/types/drift-report.ts:37 | critical | docs-claims | fixed（review-provenance 註解改 draft-gated 措辭） |
| src/services/check.service.ts:322 (timeout_ms 無測試) | major | test-quality | fixed in-round（runner 層 timeout_ms 釘住 ×3 路徑） |
| tests/unit/lib/drift-sources-git-capture.test.ts（缺 house timeout） | major | spec-architecture | fixed in-round（vi.setConfig 30s） |
| prospec/ai-knowledge/modules/lib/README.md:55 | major | spec-architecture (PB-003) | fixed in-round（collector-skip 舊敘述改為 enumerate＋recorded-red-FAILs） |
| src/templates/skills/prospec-verify.hbs:233（5/5 skip bullet 無例外註記） | major | docs-claims | fixed in-round（補 recorded-non-zero-exit-still-FAILs 例外句；已 bundle＋sync） |
| src/lib/drift-sources.ts:1036（digest-null 仍抑制已記錄紅燈—同型高一層） | major | security＋correctness | proposed → verify WARN（設計決策：delta-spec 明訂 digest-null 為 source-level unavailable；後續 issue） |
| src/lib/markdown-fences.ts:24（container-blind：list 內 ≥4 空格合法 fence 不再 blank） | major | security＋correctness | proposed → verify WARN（latent、false-positive 方向；repo 現況零命中） |
| src/lib/drift-checker.ts:495（digest-less 紅燈紀錄不 outrank unresolvable command） | major | correctness | proposed → verify WARN（手改 metadata 邊角；--record-tests 恆寫 digest＋exit 成對） |
| src/lib/drift-sources.ts:877 (gitLastCommit) ＋ drift-checker.ts:637 (isStale) | major | docs-claims/parallel-site | proposed → verify WARN（capture 失敗與「無 commit」同折疊為 fresh；預存在） |
| src/lib/drift-sources.ts:934（head null → '' 無 in-code 佐證） | major | docs-claims/parallel-site | proposed → verify WARN（現況 dead-safe：rev-parse 失敗蘊含 diff 失敗已 early-return） |
| tests/contract/skill-format.test.ts:3486（預算 regex 對改寫措辭裸述盲視） | major | test-quality | proposed → verify WARN（本輪修的缺陷類已覆蓋；改寫盲視為殘留） |

## Round 1（5 lens 併發）

- criticals 3／3 全數獨立確認存在後修復：e2e 假綠由 spec-architecture lens 以 fresh build 實測重現（1 failed @ :725），我再親跑確認；hasVerifyGrade 與 registry 註解由兩個 lens 交叉指認、逐行讀碼確認。
- test-quality lens 對新增契約測試做了五種 mutation 模擬，全數轉紅——PB-001 合格。
- 修復後全套件（fresh dist）2,499 passed＋1 skipped 綠；`pnpm counts` 重導（2,500）。

## Round 2（窄審）

- 3/3 critical RESOLVED（各有 revert 即紅的測試釘住）、4 個 in-round major 修復無回歸、無新 critical。
- 誠實保留兩點：e2e 的 gitInitFixture 繼承 host 全域 git config（gpgsign/hooksPath 極端環境可能失敗——環境脆弱性非缺陷）；timeout_ms 釘住在 runner 層——service 現不傳自訂 timeout，故 revert service 端字串今天行為等價、不會被抓，待 timeout 可配置時該 pin 才承重。

## Round 3（doc-only 揭露，非完整輪）

- verify 3/5 稽核抓到 root README:651 的同族漏掃平行位置（`--record-tests` 表格宣稱各情境一律 `skipped`——已記錄紅燈時實為 FAIL）；修 README.md＋README.zh-TW.md 鏡像、services README 補 re-merge 行為一句。**零程式碼變更**，故不構成新 review 輪；兩個 provenance 基線於編輯後重蓋。

## 值得晉升觀察（feeds /prospec-learn）

- stale-dist e2e 假綠：`pnpm test` 不自動 build（無 pretest hook），改動 lib 後 e2e 對舊 dist 跑——「跑全套件前先 build」的教訓已在 tests README pitfalls 記載，但 gate 層面無防護；本輪即中招（SC-007 曾以 stale dist 宣稱全綠）。
- 「修 A 消費者、漏同資料源的 B 消費者」（hasVerifyGrade）：PB-007 第 7 度，於同一變更內再現。
