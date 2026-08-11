# Plan: configurable-generated-artifacts

## Overview

本變更解決兩個 `prospec check` 的契約面問題。第一，`GENERATED_SOURCE_ARTIFACTS` 寫死了 prospec 自身的建置路徑 `src/lib/bundled-templates.ts`，卻對所有跑 `prospec check` 的下游專案生效——prospec 的內部視角洩漏到消費者。修正方案是將生成物排除移入 `.prospec.yaml` 設定（`knowledge.generated_artifacts` glob 陣列，預設空），prospec 自己的 repo 在自己的設定宣告。第二，`hasVerifyGrade` 以 `.some()` 掃描全部 `quality_log`，問的是「歷史上有沒有拿過 S/A」而非「最新一次是不是 S/A」，導致 re-verify 得到 B/C/D 的變更仍假陽性通過——修正為只看最新一筆，但 `archived` 變更保持舊行為以避免翻紅。

兩條修正都改變 `prospec check` 對下游的判定結果，屬契約面變更，故在同一個 minor bump 一次出貨。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| types | Zod schemas, config schema | `ProspecConfigSchema`, `DriftReportSchema` | — |
| lib | Drift engine collectors/evaluators | `collectKnowledgeHealth`, `gitLastCommit`, `hasVerifyGrade`, `GENERATED_SOURCE_ARTIFACTS` | types |
| services | Orchestration | `check.service` (collector injection) | types, lib |
| tests | Coverage | staleness fixtures, `hasVerifyGrade` unit tests | all |

### Existing Patterns (from _conventions.md)
- ESM imports with explicit `.js` extensions
- Dependency direction: `cli → services → lib → types`
- `lib` utilities are pure/stateless; I/O via collector functions
- Config schema uses `.loose()` for reading, strict schemas (`satisfies`) for construction

### Architecture Constraints (from Constitution)
- One-way dependency direction (`cli → services → lib → types`)
- TDD workflow (RED → GREEN → REFACTOR)

### Relevant Playbook Lessons
- **PB-006**: Single-source constants — `BUNDLED_TEMPLATES_SOURCE` 的 single-source 設計要保留
- **PB-007**: Sweep parallel sites — 改動 `GENERATED_SOURCE_ARTIFACTS` 和 `hasVerifyGrade` 時須檢查所有消費者
- **PB-013**: Fingerprints feeding gates must fail closed — 設定讀取失敗時不得靜默跳過

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Medium | `ProspecConfigSchema` 擴充 `knowledge.generated_artifacts` 欄位（`z.array(z.string()).optional().default([])`) |
| lib | High | `collectKnowledgeHealth` 改從 config 讀取排除路徑；`hasVerifyGrade` 改為只看最新條目（`archived` 保持 `.some()`）；`generated-artifacts.ts` 保留 `BUNDLED_TEMPLATES_SOURCE`（建置常數），刪除 `GENERATED_SOURCE_ARTIFACTS`（check 設定取代） |
| services | Low | `check.service` 傳遞 config 的 `generated_artifacts` 給 collector |
| tests | High | 修改 staleness exclusion 測試改用 config-driven；新增 `hasVerifyGrade` 最新條目測試；更新 contract test |

## Call Chain

### US-1: Staleness exclusion (config-driven)

```
prospec check
  → check.service.execute(config)
  → collectKnowledgeHealth(cwd, moduleMap, config.knowledge?.generated_artifacts ?? [])
  → gitLastCommit(cwd, entry.paths, configuredExcludes)   [staleness: config-driven]
  → evaluateKnowledgeHealth(collected)                    [stale verdict unchanged]
```

### US-2: hasVerifyGrade (latest-entry)

```
prospec check
  → check.service.execute(config)
  → collectMetadataCompleteness(cwd)
  → hasVerifyGrade(quality_log, status)    [status drives archived exemption]
```

## Implementation Steps

1. **擴充 config schema (types)**
   - 在 `ProspecConfigSchema` 的 `knowledge` 物件中新增 `generated_artifacts: z.array(z.string()).optional().default([])`
   - 這是唯一的 schema 變更，`.loose()` 讀取確保向後相容

2. **重構 `collectKnowledgeHealth` 接受 config-driven excludes (lib)**
   - 簽名從 `(cwd, moduleMap)` 變為 `(cwd, moduleMap, generatedArtifacts: readonly string[])`
   - 以 `generatedArtifacts` 參數取代 `import { GENERATED_SOURCE_ARTIFACTS }`
   - `gitLastCommit` 呼叫不變，只是 excludes 來源改了
   - 不影響 `computeChangeDigest`（REQ-LIB-024 不變）

3. **簡化 `generated-artifacts.ts` (lib)**
   - 保留 `BUNDLED_TEMPLATES_SOURCE`（`scripts/bundle-templates.ts` 仍需要此編譯期常數）
   - 刪除 `GENERATED_SOURCE_ARTIFACTS`（check 設定取代了它的消費者）
   - REQ-LIB-039 的「建置常數」vs「check 設定」分離在此步驟實現

4. **修正 `hasVerifyGrade` (lib)**
   - 簽名從 `(quality_log)` 變為 `(quality_log, status)`
   - `status === 'archived'`：保持 `.some()` 語意（歷史有 S/A → true）
   - 其他 `GRADED_STATUSES`（`verified`）：改為 `.findLast()` 只看最新一筆 `prospec-verify` 條目
   - 保持 `.trim()` 和 legacy `result` fallback

5. **更新 service 層傳遞 config (services)**
   - `check.service` 讀取 config 的 `knowledge.generated_artifacts`，傳遞給 `collectKnowledgeHealth`
   - 確保不產生新的上層依賴

6. **更新 prospec 自身 `.prospec.yaml` (dogfood)**
   - 新增 `knowledge.generated_artifacts: ['src/lib/bundled-templates.ts']`
   - 這是 dogfood 證據：prospec 自己宣告自己的生成物

7. **更新測試 (tests)**
   - 修改 staleness exclusion tests: 改用 config-driven fixture（空 config → 不排除；有設定 → 排除）
   - 新增 `hasVerifyGrade` 測試：最新 B + 歷史 S → `verified` 回傳 false；`archived` 回傳 true
   - 更新 contract test `generated-artifacts-single-source.test.ts`：驗證 `BUNDLED_TEMPLATES_SOURCE` 仍存在且被 bundler 使用
   - 並排測試確認 staleness exclusion 和 digest boundary 不合併

8. **更新 delta-spec 和 REQ (spec)**
   - REQ-LIB-039 改寫：從「寫死一條路徑的 registry」改為「由專案設定宣告」
   - REQ-LIB-025 修改：`hasVerifyGrade` 改為最新條目判斷（`archived` 保持舊行為）
   - REQ-TESTS-071 修改：測試 config-driven exclusion

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 下游已存在同名 `src/lib/bundled-templates.ts` 被意外排除（目前現狀的 fail-open） | High | 空設定 default 消除此風險；負向斷言測試釘住 |
| `hasVerifyGrade` 的 `archived` 豁免在 re-archive 場景可能不足 | Low | 目前無 re-archive 路徑；如需支援，另開 issue |
| `scripts/bundle-templates.ts` 的輸出解析失效 | Medium | `BUNDLED_TEMPLATES_SOURCE` 保留不動；contract test 釘住 |
| config 讀取失敗導致排除靜默消失 | Medium | PB-013: fail-closed — 讀取失敗時 `generatedArtifacts` 為 `[]`（無排除），等同未設定而非靜默豁免 |
| `findLast` 在舊 Node 版本不可用 | Low | prospec 的 `engines` 已要求 Node 18+；`findLast` 自 ES2023 / Node 15.4 起可用 |
| 多個 `quality_log` 條目的時間排序依賴 array order | Medium | `quality_log` 是 append-only（CLI 寫入 `prospec change log` 和 `prospec verify record`），自然按時間順序；在 test 中明確驗證此假設 |

### Constitution Check (dependency/layering)
Call Chain 中所有路徑遵循 `cli → services → lib → types`，無上行依賴。config 從 CLI 層讀取並向下傳遞，符合單向依賴規則。
