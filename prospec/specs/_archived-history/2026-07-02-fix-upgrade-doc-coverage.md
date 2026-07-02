# fix-upgrade-doc-coverage — Archive Summary

- **Archived**: 2026-07-02
- **Original Created**: 2026-07-02
- **Quality Grade**: S

## User Story

身為升級 prospec 版本的專案維護者，
我希望 `prospec upgrade` 的 report 列出 init 會建立的每份文件及其 present/missing 狀態（清單與 init 實作同源推導），且 `/prospec-upgrade` 據以逐檔 diff 更新、缺檔經同意後補建，
以便升級後不再殘留舊格式文件、也不再漏建新版本引入的文件（GitHub issue #48）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `INIT_DOC_REGISTRY`（root 判別 base/knowledge、canonical docs 推導）— init 文件單一事實來源 |
| services | High | init 清單改由 registry 推導；upgrade 新增唯讀 `buildDocsInventory`（`knowledge.base_path`-aware） |
| cli | Low | upgrade-output 新增固定行格式 `Docs inventory:` 區段（sanitizeTerminal） |
| templates | High | prospec-upgrade.hbs Step 2 改為 inventory-driven（無寫死清單、補建缺檔、版本錯位 fallback） |
| tests | Medium | init⇄registry 等式契約＋渲染性契約＋inventory 單元/整合/e2e（全 mutation-verified） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-038 | ADDED | Init-doc registry 單一事實來源（root 判別 + 範本對應） |
| REQ-SETUP-022 | ADDED | Upgrade report docs inventory（逐檔 present/MISSING、實際位置） |
| REQ-TESTS-036 | ADDED | init⇄registry 等式與範本渲染性漂移防護測試 |
| REQ-SERVICES-035 | MODIFIED | Upgrade orchestrator 增 `buildDocsInventory`（唯讀、不寫 curated doc 不變式維持） |
| REQ-SETUP-019 | MODIFIED | `prospec upgrade` report 另含 docs inventory 區段 |
| REQ-TEMPLATES-121 | MODIFIED | Skill Step 2 消費 report inventory 為唯一掃描範圍、補建缺檔 |

## Completion

- **Tasks**: 13/13 code（100%）；[M] 1/1、[V] 3/3 另計皆完成
- **Acceptance Criteria**: 5/5（SC-001~005 全數達成；全套 1,818 tests 綠、coverage 96.56%）

## Review & Verify

- `/prospec-review` 2 輪收斂 review-clean：1 critical（docs inventory 忽略 `knowledge.base_path` 覆寫）經獨立驗證確認後修復（RED→GREEN）；2 majors（registry 與 `USER_MANAGED_CONVENTION_DOCS` 未綁定、index context 魔法字串特判）proposed 待後續採納
- `/prospec-verify` Grade S：drift engine 8/8 pass、6/6 REQ 合規有據、Constitution 6/6 全審通過

## Knowledge Update

已於歸檔前同步（feature commit b97932b 內）：
- `prospec/ai-knowledge/modules/{types,services,cli,templates,tests}/README.md`
- `prospec/index.md`（模組描述與測試計數 76 檔／1,818 tests）
