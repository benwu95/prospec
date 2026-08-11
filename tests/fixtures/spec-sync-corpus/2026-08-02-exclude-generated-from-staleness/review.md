# Review Findings: exclude-generated-from-staleness

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
| F-1 | src/lib/generated-artifacts.ts:19 | major | spec-architecture | proposed | `GENERATED_SOURCE_ARTIFACTS` 把 prospec 自身的建置產物路徑寫死進一個會在**每個使用者專案**執行的引擎（`prospec check` → `collectGitTimestamps`）。使用者專案若剛好有一個人寫的 `src/lib/bundled-templates.ts`，它的 staleness WARN 會被靜默吃掉，且無任何訊號 —— 正是本變更 AC 明令禁止的假綠形狀。影響面窄（staleness 恆 WARN 級、路徑碰撞機率低），故列 major 不列 critical。issue #121 已明示偏好具名常數（方案 1）而非檔頭標記偵測（方案 2），故不在本輪改設計；根治解是把清單移到 `.prospec.yaml`（例如 `knowledge.generated_artifacts`），shipped default 維持本清單。 |
| F-2 | tests/contract/generated-artifacts-single-source.test.ts:39 | major | test-quality | fixed | 契約測試原本只斷言產生者「提到」`BUNDLED_TEMPLATES_SOURCE`，沒有釘住它**實際寫入**的目標 —— 保留一個私有路徑變數並寫到別處仍會全綠。已改為 `expect(producer).toMatch(/writeFileSync\(\s*OUTPUT_FILE\s*,/)`。Mutation 已具名驗證：把 `fs.writeFileSync(OUTPUT_FILE, …)` 改成 `const target = OUTPUT_FILE; fs.writeFileSync(target, …)` → 該斷言轉紅（1 failed / 2 passed），還原後 3 passed。 |
