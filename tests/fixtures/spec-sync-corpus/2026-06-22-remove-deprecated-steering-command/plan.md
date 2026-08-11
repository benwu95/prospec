# Plan: remove-deprecated-steering-command

## Overview

`prospec steering` 是已 deprecated、自成一體的死碼：live 的 `knowledge init` 走獨立 service，不 import steering 任何模組，且 steering 是較舊、較弱的同一套掃描（兩參數 `detectTechStack`、無條件覆寫 module-map）。本變更刪除 steering 的指令/formatter/service/專屬模板與專屬測試，把指向 `prospec steering` 的提示字串改指 `prospec knowledge init`，並退役對應的 project-setup 規格與同步 AI Knowledge。

實作策略：依層序「先解註冊 → 刪源碼 → 改字串 → 修測試 → 退役規格 → 同步知識」。能力捨棄（architecture.md 生成 REQ-SETUP-009、.prospec.yaml 回寫 REQ-SETUP-008）已拍板接受，於 delta-spec REMOVED 的 Reason 明文記錄（依 Maintenance Rule 3，provenance 歸 Change History／delta-spec，不寫 inline）。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| cli | parse → execute → format | `createProgram()`、`registerSteeringCommand`(刪)、`parseDepth`(留) | services, types |
| services | execute() business logic | `steering.service.execute`(刪)、`knowledge`/`mcp` 提示字串 | types, lib |
| templates | Handlebars 資源 | `steering/architecture.md.hbs`(刪)、`steering/module-readme.hbs`→`knowledge/`(移)，`steering/` 目錄移除 | — |
| tests | 4 層測試守門 | steering 三專屬測試(刪)、index/cli-output/e2e/mcp 共享(修) | all |

### Existing Patterns (from _conventions.md)
- CLI 為薄層、僅委派 services；`parseDepth` 等共用 helper 單一來源
- `knowledge init` (`knowledge-init.service` + `raw-scan.service`) 為 steering 的 live 替代，產 raw-scan.md + module-map.yaml(only-if-absent) + skeleton
- 規格 REMOVED 走 deprecate-over-delete（archive 自動搬入 Deprecated Requirements）

### Architecture Constraints (from Constitution)
- 依賴方向 `cli → services → lib → types`，刪除不得引入反向/循環
- Language Policy：文件繁中、程式碼/commit 英文；commit 無 AI co-authorship
- TDD/coverage ≥ 80%：刪源碼與其測試同步，整體覆蓋率近中性

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| cli | High | 解除 index.ts steering 註冊；刪 command + formatter；parse-options 註解 |
| services | High | 刪 steering.service；knowledge/mcp 提示字串改指 knowledge init |
| templates | High | 移除 `steering/` 目錄：刪 architecture.md.hbs、`module-readme.hbs` 移至 `knowledge/`（+24 路徑字串）；改 proposal/feature-spec-format 模板 |
| tests | High | 刪三專屬測試；修 index/cli-output/e2e/mcp 共享斷言 |
| lib | Low | 僅 module-detector 註解（共用函式不動） |
| trust-zone(specs/knowledge) | High | 退役 REQ-SETUP-008/009/010 + US-004；同步 mcp-server/ai-knowledge/knowledge base |
| docs(README ×2) | Med | PB-004：`.hbs`/命令/服務/測試計數副本重新衍生同步（命令本身未文件化，無命令列義務）|

## Call Chain

移除的進入點（整條刪除）：
```
prospec steering [--dry-run --depth]
  → registerSteeringCommand.action()          [cli/commands/steering.ts]   (刪)
  → steering.service.execute()                 [services]                   (刪)
  → scanDir / detectModules / detectTechStack  [lib — 共用，保留]
  → writeConfig + render architecture.md.hbs   [能力捨棄 REQ-SETUP-008/009]
```
存續的替代鏈（不動，僅文件指向它）：
```
prospec knowledge init
  → knowledge-init.service.execute() → generateRawScan() + buildModuleMap()(only-if-absent)
```

## Implementation Steps

1. **解除註冊、刪源碼、移除 steering/ 模板目錄**
   - index.ts 移除 import(L14)+call(L87)；刪 command、formatter、steering.service
   - `git mv steering/module-readme.hbs → knowledge/module-readme.hbs`、刪 architecture.md.hbs、移除空的 `templates/steering/` 目錄；同步把 `renderTemplate('steering/module-readme.hbs')` 路徑字串改為 `knowledge/module-readme.hbs`（2 源碼 + 22 測試）

2. **提示字串改指 knowledge init**
   - knowledge.service:123、mcp.service:126/295、templates/change/proposal.md.hbs:24；同步更新引用 steering 的共用註解（parse-options:4、module-detector:211）

3. **修整測試**
   - 刪三專屬測試 + 三 cov-target 筆記；index.test(L37-40 mock + L140 陣列)、cli-output.test(L75 + describe)、e2e.test(L71 + describe)、mcp.service/mcp-server regex（與 step 2 lockstep）

4. **退役規格（project-setup.md，本變更 verify 成敗關鍵）**
   - 移除 US-004 + REQ-SETUP-008/009/010；frontmatter req_count 30→27、story_count 12→11；reword L15；改 US-006/REQ-SETUP-013 場景 L203/209-210 指向 knowledge init；移除 edge-case L402、SC-3 L415（其餘 SC 連號）；Deprecated Requirements 留 `_(None)_` 交 archive 自動填

5. **同步受影響規格與知識（manual in-place）**
   - REQ-MCP-006(mcp-server.md:55/146)、REQ-SERVICES-025(ai-knowledge.md:62) 直接改字（不走 delta MODIFIED——archive 的 MODIFIED merge 會塌成標題、毀掉 body）；_index/_glossary/module-map/各 module README 去 steering 引用與計數

6. **驗證**
   - `pnpm typecheck`+`pnpm test`+`pnpm build` 綠燈；`prospec check` drift 全綠；殘留 grep 歸零（live `prospec steering`、active REQ-SETUP-008/009/010）

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 搬移 module-readme.hbs 漏改路徑字串 | High | module-readme.hbs 是 live（knowledge.service:202 / knowledge-update:166 + 22 測試斷言）；以 `git mv` + 全量替換 `steering/module-readme.hbs`→`knowledge/module-readme.hbs`，typecheck/test 會抓出任何漏網的路徑 |
| 計數副本漂移（PB-004/PB-005） | Med | 刪 1 `.hbs`/1 命令/1 服務/3 測試檔 → `README.md`/`README.zh-TW.md`/`_index.md`/各 module README 的 `.hbs`/命令/服務/測試/目錄(7→6) 計數須在同 commit 重新衍生（測試數依 `pnpm test` 實跑），且每個被動到源碼的模組 README 都要觸及；drift 不查計數正確性，靠人工 re-derive |
| index.test L140 指令名陣列漏改 | Med | 與 L37-40 mock 同一任務綁定，兩處一起改，否則「registers all subcommands」FAIL |
| MCP regex 測試與字串不同步 | Med | step 2 與 step 3 的 mcp regex lockstep，同一 commit |
| 若把 REQ-MCP-006/025 列入 delta MODIFIED | High | archive MODIFIED 會塌成標題毀 body → 改為 implement 手動 in-place，delta 只放 REMOVED |
| verify spec-compliance 因 active REQ 無對應碼 FAIL | High | 退役 REQ-SETUP-008/009/010（已驗證全倉零引用，check 不 FAIL；退役後 verify 綠） |
| coverage 掉破 80% | Low | 刪高覆蓋 steering 三源檔同時刪其測試，分子分母同減、近中性；以 `pnpm test --coverage` 確認 |
