# enforce-sub-module-budget — Archive Summary

- **Archived**: 2026-07-31
- **Original Created**: 2026-07-31
- **Quality Grade**: S
- **Scale**: standard · **Commit**: e0965f4（分支 `feat/extract-knowledge-sub-modules`）

## User Story

As a 維護 prospec 知識庫的擁有者與每個讀 L2 的 AI agent，
I want `knowledge-size` 對 `modules/<name>/` 下每個 sub-module `.md` 套用與 README 相同的預算，且 staleness 以 README 與 sub-module 的最新 commit 為準，
So that 抽取 sub-module 是真的把知識切小，而不是把它移出 gate 視線——並以 templates（1797/1800，PB-011 第三度）的第一次真實抽取自我 dogfood。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `moduleKnowledgeFiles` 單一 helper（size 與 staleness 共用目錄走訪）；`collectKnowledgeSize` L2 改為列舉每個 `.md`；`collectGitTimestamps` 取 sub-module 最新 commit；`evaluateKnowledgeHealth` 比最新知識 commit；finding 文案 L2 README→L2 file |
| types | Low | `knowledge_health.modules[]` 新增 additive optional `last_sub_module_commit`（缺席而非 null-filled）；`KnowledgeSizeBudget` 註解改為 per module file |
| tests | Medium | 14 個新測試：collector 六情境（超預算 sub-module、README-only 零差異、symlink 仍量測、目錄名為 README.md、次序、三種略過）＋ evaluator 五種 ＋ schema 兩種 ＋ 由 Zod shape 推導的報告形狀契約 guard |
| know (feature: ai-knowledge) | Medium | 抽出 `modules/templates/skill-authoring.md`（README 1797→968 tokens）；conventions 雙份副本、`_knowledge-loading-rules.hbs`、`drift-report-format.hbs`、`prospec/index.md` L2 列同步 |
| docs（根目錄，非模組） | Low | README.md／README.zh-TW.md 的 check 敘述與預算註解 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-073 | ADDED | `knowledge_health` 的 additive optional sub-module 時間戳 |
| REQ-TESTS-067 | ADDED | sub-module 量測與 staleness 覆蓋（含四條略過路徑與零差異回歸） |
| REQ-LIB-027 | MODIFIED | knowledge-size L2 由單一 README 改為模組目錄下每個 `.md`，symlink 為候選 |
| REQ-LIB-015 | MODIFIED | staleness 比最新知識 commit；無 README 由 coverage 規則裁決 |
| REQ-KNOW-016 | MODIFIED | sub-module 抽取的預算改引用解析值，並明示由 knowledge-size 機器強制 |
| REQ-KNOW-013 | MODIFIED | L0–L3 載入策略的 L2 層納入連結的 sub-module |

## Completion

- **Tasks**: 21/21 code tasks（100%）；`[M]` 2、`[V]` 5 全數完成（含三輪 mutation-verify）
- **Acceptance Criteria**: US-1 4/4、US-2 4/4、US-3 3/3；SC-001~005 全達成（SC-002 依實測修正——報告無 `knowledge_size` 區塊，改以 finding 為端到端觀測點）

## Review & Verify

- **Review**: **3 輪**、19 筆 findings（4 critical / 15 major），每輪由不同 lens 的獨立 fresh-context 代理執行。3 個 critical 已修：symlink README 因 `e.isFile()` 過濾整檔退出量測（budget gate fail open，違反 REQ-LIB-027 的零差異 AC）、出貨的 `drift-report-format` 正典漏列新欄位使 REQ-TYPES-073 的可重現性在 agent 實際查的文件上不成立、無 README 模組的 `stale` 與報告欄位重算相反。12 個 major 已修（兩個突變存活的測試缺口、`## Sub-Modules` 違反固定節次序、sub-module `Depends on` 與 module-map 矛盾、README／`types/config.ts` 預算敘述失同步、契約 guard 少一層 indirection、事實計數失同步）。**核心事實**：20 個突變殺 18；兩個存活者——契約測試讀 bundled templates 而非磁碟 `.hbs`（第一次 mutation-verify 是假綠）、schema 拒絕 null 無測試把關——皆補斷言後轉為 killed。
- **Verify**: Grade **S**。Machine ledger 1/5·4/5·5/5 全 PASS（`task-completion`；`knowledge-health` 0 stale、6/6 覆蓋；`test-provenance` `pnpm test` exit 0）。Judgment ledger 2/5 PASS（fresh context 重評，六個 REQ 的 21 條 WHEN/THEN 逐條對照程式與實跑）、3/5 PASS（6/6 條 Constitution，覆蓋率實測 Lines 94.77%／Branches 89.8%）、維度 6 not-applicable。`prospec check` 14/14 0 warn；測試 2,919（2,915 passed / 4 平台性 skip）。
- **Quality Log**: review 第 1 輪 WARN（US 層收斂清單 ＋ 既存 EISDIR 缺陷），第 2、3 輪 PASS；verify PASS、grade S、無 budget-counted WARN。

## Notes

- **抽取成效**：templates README 1797→968 tokens（回復 829 token 餘裕），`skill-authoring.md` 1260/1800；六個模組 README 全在預算內。全 repo 首次 sub-module 抽取，`## Sub-Modules` 依正典固定節次序置於末。
- **Phase 3.5 手動收斂**：8 條 US 層敘述（`drift-detection.md:46/:50/:51/:207/:212`、`ai-knowledge.md:264/:267/:533`）為 `**Spec:**` 無法觸達之處，已於畢業時逐條收斂。CLI 回報的 2 筆 dropped behavior（REQ-KNOW-016 的 ≤400、REQ-KNOW-013 未含 sub-module 的 L2 敘述）確認為刻意取代。
- **未修的既存缺陷（非本變更引入）**：README 若為指向目錄的 symlink，`readTextIfExists` 的 `readFileSync` 未包 try/catch，EISDIR 會中止整個 check run；本變更的目錄 guard 讓自家走訪不會踩到並有專屬測試釘住，根治建議另開變更。

## Knowledge Update

已於 verify S/A commit 提示同步並折進 e0965f4：`prospec/ai-knowledge/modules/{lib,types,tests,templates}/README.md`＋新的 `modules/templates/skill-authoring.md`；計數由 `pnpm counts` 重導。
