# align-language-policy-scope — Archive Summary

- **Archived**: 2026-07-25
- **Original Created**: 2026-07-25
- **Quality Grade**: A

## User Story

身為以非英文為母語、用 `prospec init`／`quickstart` 開新專案的擁有者，我想要 `CONSTITUTION.md` 與 `CLAUDE.md`/`AGENTS.md` 的語言範圍由同一組解析資料產生（US-1）、條文以路徑表述並明列豁免區內的合法母語例外（US-2）、既有專案能被 `/prospec-upgrade` 引導遷移舊措辭（US-3），且三份 feature spec 與雙語 README 對語言範圍只有一個說法（US-4）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | 新增 `language-policy.ts`（語言範圍單一來源 + 舊措辭偵測 + entry context）；`languagePolicyRule` 改吃 `LanguageScope`；`init-docs` 注入 entry keys |
| templates | High | `entry.md.hbs` 由 context 渲染範圍；`prospec-upgrade` Step 2.5 遷移步驟；`_language-policy.hbs` 改路徑式；`promotion-format`／`config-example` 措辭 |
| services | Medium | `agent-sync` 注入 scope；`upgrade` 報告 stale 訊號與渲染後條文（best-effort 讀檔） |
| cli | Low | `init-output` 語言措辭；`upgrade-output` 輸出訊號與條文區塊 |
| types | Low | `LanguageScope` 契約 |
| tests | High | 跨檔一致性 contract test、bundle↔templates 同步 guard、scope／邊界／接線斷言（4 項 mutation 實證） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-063 | ADDED | `LanguageScope` 契約（母語集／英文集／具名例外） |
| REQ-LIB-030 | ADDED | 語言範圍單一來源 + `entryLanguageContext` + 舊措辭偵測 |
| REQ-TEMPLATES-151 | ADDED | entry config 由 context 渲染範圍（兩個 render site 皆須供 key） |
| REQ-TEMPLATES-152 | ADDED | `/prospec-upgrade` Step 2.5 舊措辭遷移（取自 report 區塊） |
| REQ-TESTS-054 | ADDED | 語言範圍跨檔一致性測試（mutation-verified） |
| REQ-LIB-013 | MODIFIED | 條文改路徑式、由 scope 渲染、英文專案精簡單句 |
| REQ-AGNT-020 | MODIFIED | entry config 語言宣告改渲染共用 scope |
| REQ-TEMPLATES-141 | MODIFIED | 豁免改由產生器輸出；`_archived-history` 歸母語；具名例外四項 |
| REQ-SETUP-019 | MODIFIED | upgrade 報告新增 stale 訊號 + 渲染後條文；仍不寫 `CONSTITUTION.md` |
| REQ-SERVICES-035 | MODIFIED | `buildReport` 帶兩個新欄位；讀檔 best-effort、英文 seed 短路 |
| REQ-TEMPLATES-072 | MODIFIED | ledger `description`／`status` 欄語言例外寫入範本 |
| REQ-TEMPLATES-121 | MODIFIED | upgrade skill 步驟集 + NEVER 例外 + 引用共用 partial |
| REQ-SKILL-012 | MODIFIED | 共用 partial 改為「按文件路徑」指派語言 |

## Completion

- **Tasks**: 19/19 code (100%)；`[M]` 2、`[V]` 1 另計
- **Acceptance Criteria**: 5 SC 全數達成（SC-001~005）；delta-spec 13 條 REQ 的 AC 皆有 file:line 或測試證據

## Review & Verify

- **Review**: 2 round(s), 8 critical / 12 major — review-clean。criticals 全修：init render site 缺 scope context（init 單獨執行寫出空括號，claude-only 專案永久留存）、Step 2.5 取條文為死路（`print-template` 回傳未渲染範本，條文只存在於 render 期）、ledger `status` 欄與 header 宣稱不符、兩處守門斷言假綠（`find(...)!` 使 `not.toContain(undefined)` 恆過／只比字面 glob 讓 prose 形式溜過）、`specs/product.md` 兩區皆未涵蓋、REQ-TEMPLATES-121 未宣告、round-2 新增：英文短路吞掉切換語言後的訊號。6 major 提案轉 verify WARN、1 項（ledger status enum 破口）升呈人工。
- **Verify**: Grade A（Ready to deploy）；1/5 PASS、2/5 PASS、3/5 PASS、4/5 WARN、5/5 PASS（6 N/A ui_scope none）；tests 2191/2191、typecheck／lint 0、counts in sync。
- **Quality Log**: 3 項 WARN —— TDD 順序（T8 與 round-2 修正先實作後補測試，事後 mutation 驗證）＋ coverage 無 provider 無法機器量測；knowledge-size 4 個 L2 README 超線 7-46 tokens（原本已壓在上緣）；`review-provenance` 在 verify 契約要求的知識同步後必然 stale（digest 涵蓋 `prospec/ai-knowledge/**`），commit 後已重錄基線。

## Knowledge Update

Synced at the verify S/A commit (folded into feature commit c98f071):
- `prospec/ai-knowledge/modules/{lib,types,services,templates,tests,cli}/README.md` — language-policy 單一來源與 posix.join、`LanguageScope`、agent-sync／upgrade 行為、partial 路徑式、新測試檔、`upgrade-output` label 解析契約
- `prospec/index.md` — lib／types keywords 補 language-policy／language-scope
