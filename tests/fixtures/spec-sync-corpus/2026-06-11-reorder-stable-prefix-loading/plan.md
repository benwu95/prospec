# Implementation Plan: reorder-stable-prefix-loading

## Overview

13 個 skill 模板的 Startup Loading 動靜交錯（如 verify 模板把 5 個 change artifacts 排在 Constitution 之前），每次觸發都打破 provider 的 prompt cache 前綴。本 change 重排為靜態優先並標注 `[STABLE]/[DYNAMIC]`，以 Story A harness 量測 before/after 與 glossary 對照。

三個 Open Questions 的設計決議：(1) **glossary 對照**＝組裝層對照（方案 A）——harness 的 prospec 組裝加一個含/不含 `_glossary.md` 的變體開關（runner 旗標 + 報告分檔），量測 glossary 的 **input-token 成本面**；反事實去重收益歸因需人造對照組、誠實性不可保，列為 deliberate exclusion（未來選項），US-3 措辭限定於可量測範圍。(2) **Available Skills 判定 [STABLE]**——KV-Cache 在意跨請求前綴穩定性，該區段每專案固定、只在 agent sync 時變動；FR-004 縮為「檢查 entry 模板無 per-trigger 變動值 + 文件化動靜判準（動＝每次觸發變，靜＝僅 sync/knowledge 更新時變）」。(3) **before 快照**＝重排 commit 前的 HEAD hash 記入 change notes；無 API key 不阻塞模板交付，事後 `git checkout <before-hash>` 補量（該 hash 必須晚於 harness 合併點 `ddc9dc4`，本分支天然滿足）。

**排序準則（boundary 設計）**：`[STABLE]`＝skill 自身 references 格式規格、`{{constitution_path}}`、`_conventions.md`（僅 sync/治理變更時動）→ cache boundary → `[DYNAMIC]`＝`_index.md`（knowledge 更新時變，boundary 後第一位）、模組 README、metadata.yaml、前序 change artifacts（每 change 都不同）。標注為二元，無第三態。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| templates | 純資源 .hbs，經 renderTemplate() 消費 | 13 skill 模板 + entry.md.hbs | 無（leaf） |
| tests | 4 層測試金字塔 | contract 用真實 renderTemplate()、無 mock | all |
| scripts（層外） | 量測 runner，消費 lib/types | assembleProspec()、--provider/--budget 旗標 | lib, types |

### Existing Patterns (from _conventions.md / templates README)
- 模板 English-only（REQ-TEMPLATES-073）；變數 snake_case 須與 service context key 完全一致
- skill 模板變更須 `prospec agent sync` 重部署到 `.claude/skills/` 與 `.agents/skills/`
- contract tests 用真實 renderTemplate()——模板語法錯誤在此先爆
- **PB-001（playbook，直接適用）**：contract 斷言須 section-scoped（切到區段、驗區段內容、guard 非空）+ mutation-verified（刪除目標特徵確認測試轉紅）

### Architecture Constraints (from Constitution)
- 依賴方向不受影響（純模板/測試/scripts 變更，無 runtime code）
- TDD：contract order 斷言先紅、重排後綠
- 原子 commit：test → 模板重排 → 部署同步 → harness 變體，各自獨立

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| templates | High | 13 個 `skills/*.hbs` Startup Loading 重排 + `[STABLE]/[DYNAMIC]` 標注；`agent-configs/entry.md.hbs` 檢查（預期零改動，僅確認無 per-trigger 動態值） |
| tests | Medium | `skill-format.test.ts` 新增 order 斷言（每模板：標注完整、STABLE-before-DYNAMIC、集合不變）；既有 Startup Loading 相關斷言調整 |
| scripts（層外） | Low | `measure/assemble.ts` prospec 組裝加 glossary 變體開關；runner 加 `--prospec-glossary` 旗標與報告路徑區分 |
| docs | Low | README 增「cache-stable prefix ordering」小節（判準 + boundary 原理，供 Extension 開發者） |
| deployed skills | Medium | `prospec agent sync` 重新部署 `.claude/skills/` 與 `.agents/skills/`（13 SKILL.md + 鏡像） |

## Call Chain

```
模板交付鏈（US-1）
  skills/*.hbs（重排 + 標注）
  → lib/template.ts: renderTemplate()                       [既有，無修改]
  → agent-sync.service.ts: execute()                         [既有，無修改——僅執行重部署]
  → .claude/skills/*/SKILL.md + .agents/skills/*             [部署產物與模板 diff 乾淨]
  → tests/contract/skill-format.test.ts                      [order 斷言：section-scoped + mutation-verified]

量測對照鏈（US-2 / US-3，操作程序）
  before：git rev-parse HEAD（重排前）→ 記入 change notes
  → （有 key）checkout before-hash → pnpm measure:tokens --report before.json
  → checkout HEAD → pnpm measure:tokens --report after.json   [同 provider/model/corpus]
  → glossary 對照：--prospec-glossary 旗標 → 另存報告比對     [同快照兩組]
  → prospec measure --report <path> 逐份檢視；對照記錄寫入 change notes（數字僅引用報告）
```

## Implementation Steps

1. **排序準則文件化（docs 先行）**
   - README 增小節：`[STABLE]/[DYNAMIC]` 判準（動＝每次觸發變；靜＝僅 sync/治理變更時變）、cache boundary 原理、Available Skills 判定 STABLE 的理由
   - 此判準是後續所有重排與斷言的單一依據

2. **contract tests 先行（TDD 紅燈）**
   - `skill-format.test.ts` 新增逐模板斷言：(a) Startup Loading 區段內每個編號項帶 `[STABLE]` 或 `[DYNAMIC]`；(b) 最後一個 STABLE 項位於第一個 DYNAMIC 項之前；(c) 載入項 link/path 集合與重排前快照一致
   - 依 PB-001：切 Startup Loading 區段、guard 非空、完成後做 mutation 驗證（刪標注/換序確認轉紅）
   - 既有兩條 Startup Loading 引用斷言（feature-spec-format、design-spec）改為 section-scoped

3. **13 個模板重排 + 標注（綠燈）**
   - 依排序準則逐一重排；步驟描述中的交叉引用（如「parse User Stories」指向某項）同步改寫編號
   - 載入語意不變：不增刪項目、MANDATORY 標記保留
   - entry.md.hbs 檢查確認無 per-trigger 動態值（預期零改動）

4. **重部署與一致性驗證**
   - 執行 `prospec agent sync`；驗證 `.claude/skills/` 與 `.agents/skills/` 的 13 個 SKILL.md 與模板渲染產物 diff 乾淨
   - 全套測試重跑（641+ 維持綠）

5. **harness glossary 變體**
   - `assemble.ts`：prospec 組裝加選項——啟用時於 L0 之後附加 `_glossary.md`（位置依排序準則屬 STABLE 段尾）
   - runner 加 `--prospec-glossary` 旗標；啟用時報告預設另存（避免覆蓋主報告）；含旗標狀態記入報告（沿用既有 corpus/快照欄位，不改 types schema）

6. **before 快照記錄與量測程序**
   - 重排 commit 前：`git rev-parse HEAD` 記入 change notes（必晚於 `ddc9dc4`）
   - 有 key 時：before/after 各跑一次（同 provider/model）+ 同快照 glossary 兩組；對照記錄只引用報告數字、不設門檻
   - 無 key 時：程序與 hash 留檔，US-2/US-3 量測標記 pending，不阻塞 US-1 交付

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 重排破壞步驟間語意依賴（編號交叉引用失效） | Medium | Step 3 逐模板改寫交叉引用；contract 集合不變斷言 + 全套測試守底 |
| contract order 斷言寫成 false-green（PB-001 的教訓場景） | Medium | 斷言 section-scoped + 完成後 mutation 驗證（換序/刪標注必轉紅）；review 階段重點抽查 |
| deployed skills 與模板漂移（sync 漏跑或手改部署檔） | Medium | SC-007 以 render-vs-deployed diff 驗證；驗證步驟納入 tasks |
| glossary 變體改動 harness 失手影響 Story A 既有行為 | Low | 變體為 opt-in 旗標、預設關閉；既有 36 個 harness 相關測試守底；變體加最小單元測試 |
| before 快照選錯（早於 harness 合併點）導致無法補量 | Low | plan 明文硬約束（晚於 `ddc9dc4`）；hash 記錄為 tasks 的明確項目 |
| 無 API key 使 US-2/US-3 長期 pending | Medium | 交付不阻塞（Edge Case 已定）；pending 狀態記入 change notes 與 verify 報告，於有 key 時補量收口 |

## Knowledge Quality Gate

- Context mode: **Brownfield** — PASS
- Module Knowledge: templates / tests README 已載入（scripts 為層外，依 Story A plan 慣例處理） — PASS
- Technical Summary: 已合成 — PASS
- Feature Specs: 已檢視 `token-measurement.md`（US-2/US-3 的資料源契約，REQ-MEASURE-001~007）與 `agent-integration.md`（US-1 路由目標）、`product.md` — PASS
