# Tasks: enforce-sub-module-budget

**Input**: Design documents from `.prospec/changes/enforce-sub-module-budget/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

> **TDD 執行順序**：T1–T5 的每個實作任務，先讓對應的 RED 測試（T6–T11）失敗再實作；測試與實作可落在同一個 commit（Constitution 允許 test 伴隨 feat）。

---

## Types

- [x] T1 `types/drift-report.ts`：`knowledge_health.modules[]` 加 optional `last_sub_module_commit`（additive，既有鍵序不動） ~12 lines

## Lib

- [x] T2 `collectKnowledgeSize`：改為列舉 `modules/<name>/` 下每個 `.md`，README 走 `readModuleReadme`、sub-module 走 `readContainedFile`，kind 維持 `l2` ~35 lines
- [x] T3 `collectKnowledgeSize`：略過子目錄、非 `.md`、`isSafeResourceName` 拒絕的名稱；`source_path` posix 正規化 ~15 lines
- [x] T4 `collectKnowledgeHealth`：取每個 sub-module 的 `gitLastCommit`，最新者寫入 `last_sub_module_commit` ~25 lines
- [x] T5 `evaluateKnowledgeHealth`：stale 改比 `last_src_commit` 與 `max(last_readme_commit, last_sub_module_commit)` ~15 lines

## Tests

- [x] T6 RED knowledge-size：README ＋ 超預算 sub-module → 兩筆 `l2` item、恰一筆 finding 指名該檔 ~40 lines
- [x] T7 [P] RED knowledge-size：README-only 目錄的 items 與變更前一致（零差異回歸） ~25 lines
- [x] T8 [P] RED knowledge-size：子目錄／非 `.md`／不安全名稱三種項目皆略過且不拋錯 ~35 lines
- [x] T9 RED knowledge-health：三段 commit fixture（src → README → 只改 sub-module）→ 不 stale ~45 lines
- [x] T10 [P] RED knowledge-health：模組無 sub-module 時新欄位缺席、判定與現況相同 ~20 lines
- [x] T11 `drift-report` 契約測試：`knowledge_health` 欄位集合含新的 optional 欄位，既有鍵序不變 ~15 lines

## Templates

- [x] T12 `init/module-readme-conventions.md.hbs`：sub-module 預算改為明示由 `prospec check knowledge-size` 以同一 `l2_per_module` / `readme_max_lines` 機器強制 ~8 lines
- [x] T13 [M] `pnpm bundle` 後由 source 執行 `npx tsx src/cli/index.ts agent sync` 重新部署 ~2 lines

## Knowledge（信任區，英文撰寫）

- [x] T14 抽出 `prospec/ai-knowledge/modules/templates/skill-authoring.md`：Recipe-First 結構，承接 skill 撰寫／部署契約 ~70 lines
- [x] T15 templates README：刪去已搬移條目，於 auto block 內新增 `## Sub-Modules` 連結 ~15 lines
- [x] T16 正典 `prospec/ai-knowledge/_module-readme-conventions.md`：與 T12 同步措辭（雙份副本規則） ~8 lines
- [x] T17 `prospec/index.md` L2 列：註明預算同樣適用於 README 連結的 sub-module（routing-only，不加細節） ~5 lines

## Verification

- [x] T18 [V] mutation-verify T6–T11 的新斷言（每個突變點記錄 killed/survived） ~10 lines
- [x] T19 [M] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm counts:check` 全綠 ~2 lines
- [x] T20 [V] 由 source CLI 跑 `prospec check` 14/14 0 warn；並以「蓄意讓 sub-module 超標 → `knowledge-size` 對該檔發 warn」作為端到端觀測點 ~5 lines
- [x] T21 [V] SC-004 雙向 grep：被搬移的規則字串在 README 0 命中、在 sub-module 各 1 命中 ~5 lines
- [x] T22 [V] SC-003 量測：templates README ≤1500 tokens、`skill-authoring.md` ≤1800 tokens（`estimateTokens` 同式） ~5 lines

## Review Round 1 Remediation

- [x] T23 `moduleKnowledgeFiles` 改以 `!e.isDirectory()` 收候選，symlink 交由 canonical reader 的 realpath containment 把關；補 symlink README 回歸測試與排序決定論測試 ~45 lines
- [x] T24 `drift-report-format.hbs` 補 `last_sub_module_commit` 與「documented 模組可重現／無 README 由 coverage 規則裁決」說明；重新 bundle ＋ agent sync ~12 lines
- [x] T25 `skill-format` 契約新增 guard：`knowledge_health` 的鍵集合由 `KnowledgeHealthModuleSchema.shape` 推導比對，section-scoped ~15 lines
- [x] T26 收斂可重現性措辭（schema 註解、REQ-TYPES-073／REQ-LIB-015 的 `**Spec:**`）＋ delta-spec 新增「Phase 3.5 手動收斂清單」四條 US 層敘述 ~40 lines
- [x] T27 templates README：`## Sub-Modules` 移至固定節次序末、dual-copy 措辭改為據實（僅 status-lifecycle 有機器比對）；skill-authoring.md `Depends on` 改為與 `module-map.yaml` 的 `depends_on: []` 一致 ~12 lines
- [x] T28 [V] mutation-verify T23–T25 的新斷言（含「契約測試讀 bundle 而非磁碟 `.hbs`」這一層） ~10 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 28（含 review round 1 的 6 項） |
| Code tasks | 21 |
| Manual `[M]` / Verification `[V]` | 2 / 5 |
| Parallelizable | 3 |
| Estimated lines | ~551 lines |

---

## Notes

- REQ 於 `/prospec-archive` Phase 3.5 才畢業：本階段不得直接改寫 `prospec/specs/features/` 的 REQ 本文，REQ-KNOW-016 的校正由 delta-spec 的 `**Spec:**` 區塊落地
- T14/T15 的搬移以「規則的主體」為準：subject 是 skill 撰寫／部署契約者移出，模板渲染機制與非 skill 模板留在 README
- T12/T16 是同一段文字的兩份副本，必須同時改；漏改一邊由契約測試抓出
- **偏差記錄（T20 / 提案 SC-002）**：`prospec-report.json` 沒有 `knowledge_size` 區塊——size 只產生 findings，items 不入報告（`knowledge_health` 才有結構化區塊）。原訂「JSON 含 `knowledge_size.items`」無法成立，改以 finding 為端到端觀測點，SC-002 同步修正
- **範圍擴充（已入 delta-spec）**：`_knowledge-loading-rules.hbs` 與 `prospec/index.md` 的 L2 列是同一句話的平行站點（PB-007），一併更新並新增 MODIFIED REQ-KNOW-013
- `npx prospec` 解析到的是已安裝的 1.0.0 執行檔，不含本變更；驗證一律用 `npx tsx src/cli/index.ts`
