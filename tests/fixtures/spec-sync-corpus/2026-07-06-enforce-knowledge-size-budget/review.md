# Review: enforce-knowledge-size-budget

**Rounds:** 1 / cap 3   **Status:** review-clean（0 unresolved critical；1 advisory major → verify WARN）
**Engine:** Mode B — 獨立 fresh-context reviewer（code-reviewer agent），與實作者上下文隔離

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| prospec/index.md:26 (auto-block)；prospec/ai-knowledge/modules/{types,lib,tests}/README.md；prospec/specs/features/drift-detection.md:199 | major | docs-claims / spec-sync | resolved（knowledge 部分）→ verify commit-prompt 已將 index.md auto-block + module-map + types/lib/services/templates/tests README 的「10→11」+ knowledge-size 描述同步；`pnpm counts` 同步 test 計數；drift-detection.md 由 archive spec-sync 收斂（delta-spec 已備 MODIFIED REQ-TYPES-052/034/REQ-TESTS-045）。 |

## Verified clean（0 critical）

獨立 reviewer 逐 lens 佐證，無 critical：
- **correctness/boundary**：`evaluateKnowledgeSize` 用 strict `>`（`≤` 不算超標，REQ-LIB-027 AC1），且 mutation-verified（1500→pass / 400+100 行→pass，翻 `>=` 會紅）；`countLines` 對 `''`/尾換行/無尾換行皆符 `wc -l`；honest-degrade 正確（缺 knowledgePath → skipped，非偽 PASS）。
- **security/containment**：所有讀取走 canonical realpath-contained readers（`readIndex`/`readModuleReadme`/`readContainedFile`）+ `isSafeResourceName` 雙重守衛；`resolveBasePaths` 回絕對路徑，source_path 推導與內容讀取指向同檔、無 cwd skew；無 ad-hoc 路徑。
- **spec-architecture**：依賴方向 `cli→services→lib→types` 全數合規（lib→lib / lib→types / services→lib / services→types，無逆向）；第 11 個 id 由 `Record<DriftCheckId, CheckOutcome>` 窮盡護欄鎖住；count 10→11 已於 schema 測試與空專案 skipped_count 斷言同步。
- **test-quality (PB-001)**：single-source 測試真的綁到 index.md 實際列文字（列缺失→null→斷言紅，無 silent pass），且斷言數字 === DEFAULT；retired-field 測試斷言 Zod strip 舊名（確認 rename 為替換非追加）。
- **parallel-site (PB-006/007)**：`l0_max`/`l1_per_module` 於 src 零殘留（rename 完整）；`knowledge-generate.hbs` 泛稱 token_budget 無需改；repo 自身 .prospec.yaml 無 token_budget 故不受影響。
- **docs-claims (PB-003)**：index.md 新註記為實作行為的嚴格子集，準確。

## Dropped（nits，依契約不報）
- `KnowledgeSizeItem.lines` 對 L1 item 計算但不 budget（L1 無行數檢查）——介面比 plan 的 `lines?`/`over_by` 草案更乾淨，成本可忽略。
- `available` gate 以 `knowledgePath`（ai-knowledge/ 目錄）為準，而 index.md 由 baseDir 量——有 index.md 但無 ai-knowledge/ 的專案會略過 L1 enforcement；合理的退化狀態處理，knowledge-health 已涵蓋。
