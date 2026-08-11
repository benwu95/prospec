# Review: fix-init-clobber-add-upgrade

> 對抗式審查（mode A：4 個獨立 lens 並行 → 每筆 finding 由獨立 verifier 確認存在性）。
> Round 1。Reviewer engine: workflow（11 agents，4 lens + verifiers）。

## Findings

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| `prospec/ai-knowledge/modules/types/README.md:12,27` | major | spec-architecture | **fixed** — skill count 16→17、`excludeFromEntryConfig` 範例補 prospec-upgrade、新增 prospec-upgrade 條目 |
| `prospec/ai-knowledge/_index.md:14,15`（services/cli 列） | major | maintainability | **fixed** — services 14→15 服務/16→17 檔/行數、cli 12→13 指令/14→15 formatter/30→32 檔，補 `upgrade` 非 INIT_COMMANDS 說明 |
| `src/services/upgrade.service.ts` CANONICAL_DOCS vs `init.service.ts` conventionDocs | major | maintainability | **fixed** — 抽出單一來源 `types/canonical-docs.ts`（`CANONICAL_CONVENTION_DOCS`），init/upgrade 共用 |
| `src/lib/drift-sources.ts` readme-counts 偵測涵蓋範圍 | major | maintainability | **noted（advisory）** — readme-counts drift check 只驗 MCP resources/tools claim，不涵蓋 `_index.md` 模組表 `(N files)`/`N commands` 計數；pre-existing 工具缺口（非本變更引入），本變更靠人工 re-derive 維持正確；候選 backlog 項 |
| `detectMissingTriggers` vs agent-sync 缺觸發詞邏輯 | major→nit | maintainability | **rejected** — verifier 判定 overstated：兩處 empty-array 語義一致、當前零分歧；指控的「已分歧」證據誤指 synthesizeTriggers（第三函式）。DRY 觀察成立但非 major |

## Verification

- **Confirmed criticals: 0** — loop 立即收斂（review-clean）。
- **Confirmed majors: 4** — 3 fixed（concrete drop-in 計數修正 + DRY 抽取）、1 noted（advisory，pre-existing 工具缺口，過 verify 為 WARN）。
- **Rejected: 1** — 對抗式 verifier 正確降級一筆 overstated DRY finding（severity 灌水、證據誤植）。
- 每輪修正後 `pnpm test` 維持綠（1764 pass）；typecheck / lint / verify:skills(28) 全綠。

## Round 2 — iteration-2 複審（使用者澄清 2026-06-22）

獨立 fresh-context reviewer 複審 iter-2 delta 並逐條確認 4 項新需求：

| 需求 | 判定 | 證據 |
|------|------|------|
| `.prospec.yaml` `version` = prospec 版本 | **MET** | `types/config.ts:65` 無獨立 `prospec_version`；`init.service.ts:113` 種 `version: PROSPEC_VERSION` |
| CLI `prospec upgrade`：.prospec.yaml(version+format) + agent sync、不寫 doc | **MET** | `upgrade.service.ts` 無 renderTemplate/atomicWrite doc；`cli/index.ts` `upgrade` 不在 INIT_COMMANDS；unit/integration/e2e 斷言 doc byte 不變 |
| skill `prospec-upgrade`：scan init 檔 + 逐檔 diff + 同意 + 補譯 triggers + re-sync | **MET** | `prospec-upgrade.hbs` Step 1-3 + NEVER（無同意不寫）+ Output Contract |
| skill `prospec-knowledge-update`：格式落差徵詢同意 | **MET** | `prospec-knowledge-update.hbs` Phase 2.5 + NEVER bullet |

- layering 乾淨（upgrade.service 僅 import lib/types/sibling；cli/commands/upgrade 不 import lib；types/version leaf）。
- **1 major（已修）**：7 處 doc/comment 殘留舊設計宣稱（CLI「re-render canonical docs / 記錄 `prospec_version`」）——tests-invisible，已全部更正：`README.md`/`README.zh-TW.md` CLI 表、`_index.md` services+cli 列、`cli/commands/upgrade.ts`/`types/version.ts`/`types/canonical-docs.ts` 註解、`upgrade-flow.test.ts` 註解。複審後 drift 8/8、verify:skills 28/28、test 1760 全綠。

## Notes

- 三個 fixed majors 皆為本變更自身引入的 ripple（16→17 計數散落 / upgrade.service 複製 init 的 conventionDocs），屬 concrete、local、drop-in，已即修（PB-004/PB-005）。
- drift-checker 缺口（noted）為 prospec 自身既有工具限制，建議獨立 backlog 追蹤，不在本變更範圍內擴大。
