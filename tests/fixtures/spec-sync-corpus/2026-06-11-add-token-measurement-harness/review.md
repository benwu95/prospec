# Review: add-token-measurement-harness

**Rounds:** 5 / cap 5   **Status:** review-clean（cap 達到，0 未解 critical）

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| scripts/measure-tokens.ts:58 (sumUsages 空陣列 → TypeError，全 failed/aborted 時 crash 且不寫報告) | critical | correctness & edge cases | fixed（round 2 確認） |
| scripts/measure-tokens.ts:51 (--budget 非數字 → NaN，費用上限靜默失效) | critical | correctness / spend control | fixed（round 2 確認） |
| src/cli/formatters/measure-output.ts:39 (baseline cold vs prospec warm 不對稱比較卻同標 warm*) | critical | spec-architecture (REQ-005/006 誠實) | fixed — 改 warm-vs-warm（round 2 確認） |
| scripts/measure-tokens.ts:190 (spend 在 cold+warm 成對成功後才入帳；warm 失敗時 cold 實際費用漏計) | critical | correctness / spend control | fixed — 逐呼叫入帳（round 4 確認） |
| scripts/measure-tokens.ts:80 (`--report=` 空值存活至 atomicWrite，花完預算後 EISDIR 報廢全部結果) | critical | correctness / data integrity | fixed — parseArgs 拒空值（round 4 確認） |
| scripts/measure/assemble.ts:78 (full-dump 與檔案內容每 task × provider 重複讀取組裝) | major | efficiency | resolved — 中間修正輪 hoist 單次組裝 |
| scripts/measure/usage-map.ts:55 (Gemini thoughtsTokenCount 未抑制也未計入) | major | correctness (accounting) | resolved — thinkingBudget: 0 + 折入 output |
| src/types/measurement.ts:54 (skipped/failed 的 reason 不變式僅註解、schema 未 refine 強制) | major | maintainability | proposed → verify WARN（仍開放） |
| src/cli/formatters/measure-output.ts:58 (零量測 guard 連 spent_usd 一併隱藏，失敗也燒錢卻不顯示) | major | spec-architecture (誠實) | proposed → verify WARN |
| src/cli/formatters/measure-output.ts:56-63 (formatter 零 unit test——零任務 guard/aborted 標記/quiet 模式全無 mutation 抵抗) | major | 測試品質 | proposed → verify WARN |
| tests/e2e/cli.test.ts:512 (REQ-005 AC4「無門檻判定」無負向斷言釘住，僅活在註解) | major | 測試品質 | proposed → verify WARN |
| src/lib/token-accounting.ts:46 (outputCostUsd 為該模組唯一未測 export，直接餵預算中止邏輯) | major | 測試品質 | proposed → verify WARN |
| package.json + tsconfig (scripts/ 不在 lint 與 typecheck 範圍，型別錯誤要到燒錢執行才發現) | major | 維護性 | proposed → verify WARN |

## Round 1（full pass）/ Round 2（narrow）

- 3 critical 經獨立 verifier 確認後 auto-fix，warm-vs-warm 對稱化；security lens 無 critical；依賴方向乾淨。
- Round 2 附帶觀察「sumUsages 的 `...acc` spread 冗餘」**已撤回**——後續獨立驗證 REFUTED：spread 負責自 seed 攜帶 `provider` 欄位，非冗餘（一致性錨更正）。

## 中間修正輪（/code-review --fix，10 findings 全 CONFIRMED 後修 9 跳 1）

- 修復：naive-rag 內容計分、OpenAI 預設改 gpt-4.1-mini（128k 溢出）、跨任務 cache 污染（任務唯一前綴）、Gemini thinking、tsx devDep、parseArgs（=形式/未知旗標/重複 provider）、任務內預算檢查、pre-spend hoisting + 整份 schema 驗證、CRLF frontmatter + lib parseYaml、清理叢集（常數統一/envKeys 單源/雙語 README 4096 地板註記）。

## Round 3（full pass，審修正後的重寫碼）/ Round 4（narrow）

- 新增 2 critical（C1 spend 成對入帳漏計、C2 `--report=` 空值晚期失敗）經 verifier `[confirmed]` 後修復；缺父目錄子情境經查 `ensureDir` 自動建立，**不成立**，fix 相應簡化。
- 1 新 major（M1 零量測 guard 隱藏 spent_usd）→ proposed，轉 verify WARN。
- Round 4 確認 2/2 RESOLVED；`--report --budget` 邊界判定為可接受 nit（無資料損失、失敗可見）。

## Round 5（最終輪，鎖定低稽核表面：tests / corpus / formatter / 共用修改檔）

- **0 critical**——loop 於 cap（5/5）以 review-clean 收束。
- 4 新 major（proposed → verify WARN）：formatter 無 unit test、REQ-005 AC4 無負向斷言、`outputCostUsd` 未測、`scripts/` 在 lint/typecheck 閘門之外。前三條與 PB-001（contract 斷言須 mutation-verified）同脈絡，若跨 change 再現可餵 `/prospec-learn`。
- 驗證為乾淨：corpus 六模組覆蓋與 frontmatter 全合法、usage-map 測試非套套邏輯、formatter 對齊不受 ANSI 影響、`MeasurementReportInvalid`/preAction/註冊均符慣例。

## 每輪修復後驗證

- lint ✓ / typecheck ✓ / `pnpm test` 641/641 ✓（rounds 2、4 與中間修正輪各全套重跑）

## 誠實邊界觀察（非缺陷）

- claude-haiku-4-5 最小可 cache 前綴 4,096 tokens——已寫入雙語 README 誠實邊界。
- 任務唯一前綴對三種策略對稱地阻斷跨任務 cache 重用：對 prospec 偏保守、誠實，已記於 assemble.ts 模組註解。
