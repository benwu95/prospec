# Tasks: configurable-generated-artifacts

## Types

- [x] 在 `src/types/config.ts` 的 `ProspecConfigSchema` `knowledge` 物件中新增 `generated_artifacts: z.array(z.string()).optional().default([])` 欄位 (REQ-TYPES-082)

## Lib

- [x] 修改 `collectKnowledgeHealth` 簽名，新增 `generatedArtifacts: readonly string[]` 參數，取代 `import { GENERATED_SOURCE_ARTIFACTS }` (REQ-LIB-039)
- [x] 將 `gitLastCommit(cwd, entry.paths, GENERATED_SOURCE_ARTIFACTS)` 改為 `gitLastCommit(cwd, entry.paths, generatedArtifacts)` (REQ-LIB-039)
- [x] 從 `src/lib/generated-artifacts.ts` 刪除 `GENERATED_SOURCE_ARTIFACTS` export，保留 `BUNDLED_TEMPLATES_SOURCE` (REQ-LIB-039)
- [x] 從 `src/lib/drift-sources.ts` 移除 `import { GENERATED_SOURCE_ARTIFACTS }` (REQ-LIB-039)
- [x] 修改 `hasVerifyGrade` 簽名新增 `status: string` 參數 (REQ-LIB-025)
- [x] 實作 `hasVerifyGrade` 分流邏輯：`status === 'archived'` 保持 `.some()`；`verified` 改為 `.findLast()` 只看最新 `prospec-verify` 條目 (REQ-LIB-025)
- [x] 更新 `collectMetadataCompleteness` 中 `hasVerifyGrade` 的呼叫，傳入 `status` (REQ-LIB-025)

## Services

- [x] 在 `check.service` 中讀取 config 的 `knowledge.generated_artifacts`，傳遞給 `collectKnowledgeHealth` (REQ-LIB-039)

## Config

- [x] 在 `.prospec.yaml` 的 `knowledge` 區塊新增 `generated_artifacts: ['src/lib/bundled-templates.ts']` (dogfood，REQ-LIB-039)

## Tests

- [x] 修改 staleness exclusion 測試：空 config → `src/lib/bundled-templates.ts` 不再被排除（負向斷言）(REQ-TESTS-071)
- [x] 修改 staleness exclusion 測試：有 config → 設定路徑被排除，行為與現況一致（正向斷言）(REQ-TESTS-071)
- [x] 新增並排測試：config-driven exclusion 只作用於 `last_src_commit`，`computeChangeDigest` 仍涵蓋該檔 (REQ-TESTS-071)
- [x] 新增 `hasVerifyGrade` 測試：最新條目 grade B + 歷史 S，status `verified` → 回傳 false (REQ-TESTS-084)
- [x] 新增 `hasVerifyGrade` 測試：最新條目 grade B + 歷史 S，status `archived` → 回傳 true (REQ-TESTS-084)
- [x] 新增 `hasVerifyGrade` 測試：唯一條目 grade S，status `verified` → 回傳 true (REQ-TESTS-084)
- [x] 新增 `hasVerifyGrade` 測試：空 `quality_log` 或無 `prospec-verify` 條目 → 回傳 false (REQ-TESTS-084)
- [x] 更新 contract test `generated-artifacts-single-source.test.ts`：驗證 `BUNDLED_TEMPLATES_SOURCE` 仍存在且被 bundler 使用，`GENERATED_SOURCE_ARTIFACTS` 已移除 (REQ-LIB-039)
- [x] [V] 確認所有既有 staleness 測試通過（回歸驗證）
- [x] [M] 執行 `pnpm test:coverage` 確認覆蓋率 ≥ 80%（實測 statements 94.48% / branches 89.6% / functions 95.08% / lines 95.02%）

## Services (審查追加)

- [x] 將 `syncToFeatureSpecs` 的 ADDED 插入點從子字串比對改為行首標題錨定 `/^## Edge Cases[ \t]*$/m` (REQ-SERVICES-088)
- [x] 將 `moveReqToDeprecated` 的 `## Deprecated Requirements` 兩個插入點一併改為行首標題錨定（同型缺陷的平行站點，PB-007）(REQ-SERVICES-088)
- [x] 新增迴歸測試：標題前先以行內程式碼引用 `## Edge Cases` 的 spec，插入後該 bullet 不被剖開；退回子字串比對時轉紅 (REQ-SERVICES-088)
- [x] 新增迴歸測試：REMOVED 路徑的 `## Deprecated Requirements` 同樣不得命中行內引用；退回子字串比對時轉紅 (REQ-SERVICES-088)

## Archive 手動收斂（審查升交，使用者裁決：封存時一併手改）

- [x] [M] 封存時手改 `prospec/specs/features/drift-detection.md:542` 的 US-14 驗收情境：它仍斷言「a re-verify which does not reach S/A leaves both `status` and `metadata-completeness` green」，本變更反轉 `hasVerifyGrade` 後已為偽。US 層規格文字沒有畢業載體（archive 只改寫 REQ 區塊），故無法由 delta-spec 條目搆到，必須人工改。應與 REQ-TEMPLATES-171／173 的更正同一時點落地。

## Summary

- **Total Tasks:** 25
