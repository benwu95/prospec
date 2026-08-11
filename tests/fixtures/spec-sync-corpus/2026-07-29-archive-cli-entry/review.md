# Review: archive-cli-entry

**Rounds:** 2 / cap 3   **Status:** review-clean

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/services/archive.service.ts:632（dry-run feature-map 預測守門與 real run `ensureDir` 觸發條件漂移——all-unsafe-slug delta-spec 下 real run 建目錄並 bootstrap feature-map，dry-run 不預測） | critical | parallel-site (PB-007) / correctness | fixed（round 2 verifier RESOLVED） |
| src/services/archive.service.ts:470（unparseable metadata 落入 notFound 而非 refused） | major | correctness | fixed（人工核可全修） |
| src/cli/formatters/archive-output.ts:44（skipped 走 stdout 且 --quiet 下靜默，卻驅動 exit 1） | major | spec-architecture（errors→stderr） | fixed（人工核可全修） |
| src/templates/skills/prospec-archive.hbs（Error Handling「reports the error」高於實作） | major | docs-claims (PB-003) | fixed（新增 `skippedReasons` 讓宣稱回到 claim ⊆ implementation） |
| tests/unit/services/archive-dry-run.service.test.ts:48（snapshotDir 偵測不到空目錄建立） | major | test-quality (PB-001) | fixed（快照納入目錄項；mutation-verify 轉紅確認） |
| tests/unit/services/archive-dry-run.service.test.ts:92（等價測試只驗 dry ⊆ real 單向） | major | test-quality (PB-001) | fixed（補 real ⊆ dry 反向斷言） |

## Round 1（fresh-context mode B，7 lenses）

- 發現 1 critical + 5 majors；security 與 maintainability lens clean
- F1 經獨立 verifier 五環因果鏈 `[confirmed]`：`extractFeatureRoutes` 接受任意非空 slug → `isSafeResourceName` 擋下 → real run `ensureDir` 在 filter 之前 → 目錄存在使 `syncFeatureMap` 無條件 bootstrap → dry-run 探測兩個析取項皆 false

## Round 2（narrow pass）

- F1 修法：抽出 `readFeatureRoutes` 單一來源 helper，dry-run 以「real run 的觸發條件（routes 存在）」設 `specSyncWouldTouchFeaturesDir`，取代結果導向的 `specFiles.length > 0`；real-run 路徑與 main 逐字等價
- Verifier 驗證七情境（unsafe slug／safe slug／零 routes／dir 已存在／no-clobber／多變更 sticky flag／throw 不對稱分析）全數 Match，判定 **RESOLVED**，無新 critical
- 凍結測試 mutation reasoning：舊 probe 下必紅

## Majors 修復（人工核可「全修」）

- F2：names loop 對「目錄存在但 metadata 不可解析」回報 refused(status: unknown)＋凍結測試
- F3/F4：skipped 改走 stderr（quiet 下可見）、`ArchiveResult.skippedReasons` 攜帶真實錯誤（WriteError message），模板宣稱回歸事實
- F5：snapshotDir 記錄目錄項（mutation-verify：移除 ensureDir 守門轉紅）
- F6：等價測試補反向（real 寫入的每一路徑須為 planned 目標、其父目錄、或 archive move 目的地內容）

修復後全套：`pnpm test` 2525 passed／typecheck／lint 全綠。
