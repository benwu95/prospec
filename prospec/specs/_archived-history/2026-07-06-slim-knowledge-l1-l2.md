# slim-knowledge-l1-l2 — Archive Summary

- **Archived**: 2026-07-06
- **Original Created**: 2026-07-06T05:06:54Z
- **Quality Grade**: S

## User Story

As a 使用 prospec 知識庫的開發者／AI agent，
I want L1/L2 知識瘦身（index.md 的 Description 僅供路由、模組 README 落在預算內），且 knowledge-size 的預算誠實校準，
So that L1 維持精簡的路由器、L2 維持可掃視的地圖，而 WARN 棘輪只在真正的膨脹回長時才觸發。

（GitHub issue #64，scope 1 ＋ 3；scope 2 —— 拆分 `sdd-workflow.md` —— 已 descope，因為它與 living-spec 的「一功能一檔」模型不相容，也不在 knowledge-size 檢查的範圍內。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`：`l1_per_file` 1500→1800、`l2_per_module` 400→1000（僅數值；schema／warn 分類／單一來源角色不變） |
| lib | None (logic) | knowledge-size 的 collector/評估器未變 —— 只有它們讀取的 DEFAULT 搬了家 |
| services | None (logic) | knowledge/knowledge-update/index-table 未變 —— 只有它們渲染的資料瘦身了 |
| templates | Medium | 出貨的 `init/{prospec.yaml seed, status-lifecycle, module-readme-conventions}`（status-lifecycle 縮減至 1750）＋ `skills/{_knowledge-loading-rules, prospec-knowledge-generate}` 對齊 per-file 1800/1000 的預算；`.claude`／`.agents` skill 重新生成 |
| tests | Medium | config 單一來源的 DEFAULT 斷言 ＋ 超預算 README fixture 更新為新預算 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-037 | ADDED | `index.md` 的 Description 欄僅供路由；單一來源為 `module-map.yaml` 的 `description`；不與 L2 重複 |
| REQ-TYPES-061 | MODIFIED | `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` `l1_per_file` 1500→1800、`l2_per_module` 400→1000（經驗校準；init seed 兩者同步） |
| REQ-KNOW-013 | MODIFIED | L1 宣告為**每檔** ≤1,800 tokens（原為 ≤1,500「總計」）；L2 每模組 ≤1,000 tokens —— 語意對齊 per-file 模型 |
| REQ-KNOW-011 | MODIFIED | 模組 README 的 token 預算 ≤400 → ≤1,000（行數預算 100 不變） |

## Completion

- **Tasks**: 11/11 code tasks（100%）；8 個 `[V]` 驗證任務完成；1 個條件式任務（T20 `_status-lifecycle` 縮減）完成
- **Acceptance Criteria**: 3 個 User Story 全數達成 —— index.md 3239→1704 tok（≤1800）；6 份模組 README 全部 ≤1000 tok / ≤100 行；`knowledge-size` 完全 PASS；其餘 10 項 drift 檢查全綠

## Review & Verify

- **Review**: 1 輪、0 critical / 2 major（皆已修）—— M1（已修）：`types/README.md` 把 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`／`TokenBudgetSchema` 歸在 `drift-report.ts` 那一列 → 移到真正的歸屬地 `config.ts`。M2（已修）：proposal 的 US-3/FR-005/SC-002 在 L2→1000 轉向後仍寫 ≤400 → 已回填為 ≤1000。獨立 verifier 確認所有決定論不變式（count anchor、單一來源、雙份副本一致性、相依方向）。
- **Verify**: Grade S —— 1/5 PASS、2/5 PASS（REQ-KNOW-037/TYPES-061/KNOW-013/KNOW-011）、3/5 Constitution 全部 MUST/SHOULD PASS、4/5 knowledge-health 6/6 0 stale、5/5 PASS（2079 個測試）；6 N/A（ui_scope none）。0 WARN、0 FAIL。`prospec check` 11/11 PASS。
- **Quality Log**: new-story/plan/tasks/implement/review/verify 全程無 WARN/FAIL。

## Knowledge Update

已在 verify S/A commit 提示同步（併入 feat `a50aaa3`）：6 份模組 README 全部改寫為自足的精簡地圖並落在 1000-tok 預算內；`index.md` ＋ `module-map.yaml` 的描述瘦身為僅供路由；`_glossary.md` / `_status-lifecycle.md`（縮減至 1791）/ `_module-readme-conventions.md` 的預算措辭；`pnpm counts:check` 同步；`README.md` 記載 `knowledge.token_budget` 覆寫方式。任何 README 皆未引用未畢業的 REQ id。
