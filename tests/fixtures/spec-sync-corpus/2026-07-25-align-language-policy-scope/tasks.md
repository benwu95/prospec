# align-language-policy-scope — 任務清單

> TDD：每個實作任務前面緊接它的紅測任務（Constitution `[MUST]` TDD）。

## Types

- [x] T1 定義 `LanguageScope`（`language` / `nativePaths[]` / `englishPaths[]` / `namedExceptions[]`）於 `src/types/constitution.ts` ~15 lines

## Lib

- [x] T2 紅測 `tests/unit/lib/language-policy.test.ts`：搬移 `base_dir`／`knowledge.base_path` 後的實際路徑、三個集合內容、English 精簡形、`isSeededLanguagePolicyStale` 三情境 ~120 lines
- [x] T3 實作 `src/lib/language-policy.ts`：`resolveLanguageScope()` / `formatPathList()` / `isSeededLanguagePolicyStale()` ~90 lines
- [x] T4 紅測 `tests/unit/lib/constitution-rules.test.ts` 補 scope 斷言：母語集、英文集、具名例外、English 精簡單句 ~60 lines
- [x] T5 `languagePolicyRule(scope)` 改簽章並由 scope 渲染 description／check（路徑式 + 具名例外）~50 lines
- [x] T6 `src/lib/init-docs.ts` 的 `buildInitDocContexts` 改傳 scope（全 repo 唯一呼叫點）~10 lines

## Services

- [x] T7 紅測 `tests/unit/services/upgrade.service.test.ts`：`staleLanguagePolicy` 三情境（舊 seed／使用者已改寫／已新措辭）~60 lines
- [x] T8 `upgrade.service.ts` `buildReport` 增加 `staleLanguagePolicy`（讀檔在 service、判定委派 lib），維持不寫 `CONSTITUTION.md` ~30 lines
- [x] T9 `agent-sync.service.ts` 將 scope 注入 `templateContext`（與 init 同一 helper）~15 lines

## CLI

- [x] T10 `formatters/upgrade-output.ts` 輸出 stale 訊號行 + 對應單元測試 ~30 lines
- [x] T11 `formatters/init-output.ts` 語言措辭收斂（`Document language` → 明確範圍）+ 調整既有測試 ~10 lines

## Templates

- [x] T12 `agent-configs/entry.md.hbs` Language Policy 段改由變數渲染；具名例外不進 L0，只留指向 Constitution 的一句 ~15 lines
- [x] T13 `skills/prospec-upgrade.hbs` 新增舊措辭遷移步驟（偵測 → diff → 徵詢 → 僅改該區段），並補 Success Criteria／NEVER ~35 lines
- [x] T14 [P] `skills/references/promotion-format.hbs` 補 ledger `description` 欄語言例外宣告 ~10 lines
- [x] T15 [P] `references/config-example.yaml.hbs` 註解與新範圍複核同步 ~5 lines
- [x] T16 [M] 執行 `pnpm bundle` 重生 `src/lib/bundled-templates.ts` ~5 lines

## Tests

- [x] T17 跨檔一致性 contract test：同一 config 產生 `CONSTITUTION.md` 與 entry config，比對母語集／英文集字面相等（非英文）與 English 情境，section-scoped ~90 lines
- [x] T18 `tests/contract/skill-format.test.ts` 補 `prospec-upgrade` 新步驟與 `promotion-format` ledger 語言例外斷言 ~30 lines
- [x] T19 [V] mutation-verify T17／T18：移除任一側的範圍渲染或該步驟即應轉紅 ~10 lines

## Docs

- [x] T20 [P] `README.md`（341／679 措辭）與 `README.zh-TW.md`（650）雙語同步收斂 ~20 lines
- [x] T21 [P] 本 repo `prospec/CONSTITUTION.md` 條文修正：解除「archived summaries 母語」與「specs 英文」同句對撞、補具名例外 ~20 lines

## Gate

- [x] T22 [M] `pnpm counts` → `pnpm typecheck` → `pnpm test` 全綠 ~5 lines

## Summary

- **Total Tasks:** 22（code 19、`[M]` 2、`[V]` 1）
- **Parallelizable Tasks:** 4
- **Total Estimated Lines:** ~735 lines
