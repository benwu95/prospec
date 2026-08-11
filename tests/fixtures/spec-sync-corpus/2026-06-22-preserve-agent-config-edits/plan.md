# Implementation Plan: preserve-agent-config-edits

## Overview

`agent sync` 的 `generateEntryConfig` 目前對 `CLAUDE.md` / `AGENTS.md` 無條件 `atomicWrite`，每次 sync 都覆蓋使用者手寫內容；`init` 對既有 `AGENTS.md` 一律 skip-if-exists（REQ-SETUP-018），既不遷移也不更新。本變更把 `_index.md` 既有的 `prospec:auto` / `prospec:user` 區塊契約套到 agent entry config。

策略：在 `lib/content-merger.ts` 新增純函式 `mergeManagedDoc(generated, existing)`，集中三條合併路徑；`services/agent-sync.service` 與 `services/init.service` 改為「讀既有檔 → 合併 → `atomicWrite`」；`templates/agent-configs/entry.md.hbs` 與 `templates/init/agents.md.hbs` 把 prospec 內容包進 auto 區塊並附空 user 區塊。`quickstart`、`upgrade` 因呼叫 `agentSync` 自動受益，無需改動。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| lib | 共用純函式、檔案 I/O、marker 合併 | `mergeContent`, `atomicWrite`, marker 常數（`content-merger.ts`） | types |
| services | 業務邏輯 `execute()` | `agentSync.execute`, `init.execute`, `generateEntryConfig` | lib, types |
| templates | 純 Handlebars 資源 | `entry.md.hbs`, `init/agents.md.hbs` | — |

### Existing Patterns (from _conventions.md / module READMEs)

- 區塊就地取代既有做法：`knowledge-update.service` 用 `/<!-- prospec:auto-start -->[\s\S]*?<!-- prospec:auto-end -->/` + **function replacer** 取代 auto 區塊，避免 REQ 描述中的 `$&`/`` $` ``/`$$` 被當成取代樣式（lib/services 雙重 pitfall）。
- 合併契約集中於 `lib/content-merger.ts`，依賴 4 個 exact marker 常數（`AUTO_START`/`AUTO_END`/`USER_START`/`USER_END`）；marker 字串打錯會 silently fail（lib pitfall）→ 新函式必須重用同組常數。
- 既有檔讀取沿用 `fs.promises.readFile` + try/catch（`knowledge-update.service` 既有寫法），檔案不存在退為空字串。
- 一律 `atomicWrite()`（services pitfall：直接 `writeFileSync` 有半寫風險）。

### Architecture Constraints (from Constitution)

- One-way Dependency `cli → services → lib → types`：合併邏輯為 lib 純函式（無 I/O），由 services 讀寫；不得反向。
- TDD + 覆蓋率 ≥ 80%：先寫 RED 測試（合併三路徑 + sync/init round-trip + trust-zone 不退化）。
- Language Policy / Atomic Commits：文件 zh-TW、commit 英文且原子。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| lib | High | 新增 `mergeManagedDoc(generated, existing)` 純函式（`content-merger.ts`），重用既有 marker 常數 |
| services | High | `agent-sync.service.generateEntryConfig` 改走讀→merge→write；`init.service` 寫入迴圈將 `AGENTS.md` 特例化為 merge，trust-zone 維持 skip-if-exists |
| templates | Medium | `entry.md.hbs` 與 `init/agents.md.hbs` 包入 auto 區塊 + 附空 user 區塊 |
| cli | None | 入口不變（命令照舊呼叫同一 `execute()`） |
| tests | High | 新增 `mergeManagedDoc` 單元測試 + agent-sync/init 服務測試 + round-trip idempotency |

## Call Chain

```
prospec agent sync [--cli]
  → registerAgentCommand.action({cli})                          [cli, parse]
  → agentSync.execute({cli, cwd})                               [services, orchestration]
  → syncAgent(agentConfig, ctx, triggers, cwd)                  [services]
  → generateEntryConfig(agentConfig, ctx, cwd)                  [services]
      → renderTemplate('agent-configs/entry.md.hbs', ctx)       [lib]  → generated（含 auto+user 區塊）
      → readExisting(configFilePath)  // fs.readFile + try/catch [services]  → existing | ''
      → mergeManagedDoc(generated, existing)                    [lib, pure]  → merged
      → atomicWrite(configFilePath, merged)                     [lib]
```

```
prospec init
  → registerInitCommand.action(opts)                            [cli, parse]
  → init.execute({name, agents, language, cwd})                 [services]
  → render all artifacts to memory                              [services + lib renderTemplate]
  → write loop（per artifact）：                                 [services]
      ├─ label == 'AGENTS.md':
      │    existing = readExisting(path)                         [services]
      │    merged   = mergeManagedDoc(content, existing)         [lib, pure]
      │    atomicWrite(path, merged); push 'AGENTS.md'           [lib]
      └─ else（trust-zone / canonical docs）:
           if !fileExists(path): atomicWrite(path, content)     [lib]  // skip-if-exists 不變
  → writeConfig('.prospec.yaml')  LAST（完成標記）              [services/lib]
```

> 兩入口的新邏輯全在 services 呼叫 lib 純函式 + lib I/O；無業務邏輯滲入 cli、無跨層越級。`quickstart`(init→agentSync) / `upgrade`(agentSync) 沿用入口 1，無需改動。

## Implementation Steps

1. **lib：新增 `mergeManagedDoc(generated, existing)` 純函式**
   - 三路徑：①existing 含 `auto-start/end` → non-greedy regex + function replacer 就地取代 auto 區塊、保留其餘（含 user 區塊）；②existing 無標記但非空 → 把 existing 整段注入 generated 的 user 區塊內、auto 用 generated；③existing 空/不存在 → 回傳 generated 原樣。
   - 重用 `AUTO_START/AUTO_END/USER_START/USER_END` 常數；user 注入 = 置換 generated `USER_START`…`USER_END` 之間內容為既有內容。

2. **lib：先寫 RED 單元測試（`content-merger.test.ts`）**
   - 覆蓋三路徑、巢狀/重複 marker 邊界（user 區塊含 marker 字面字串不誤判）、`$&`/`$$` 安全、round-trip 兩次 byte-identical。

3. **templates：`entry.md.hbs` 與 `init/agents.md.hbs` 加入區塊標記**
   - 整段 prospec 內容包進 `<!-- prospec:auto-start -->`…`<!-- prospec:auto-end -->`，其後附 `<!-- prospec:user-start -->`（含 placeholder 註解）…`<!-- prospec:user-end -->`。marker 字串與常數逐字一致。

4. **services：`agent-sync.service.generateEntryConfig` 改走 merge**
   - render → 讀既有目標檔（try/catch→''）→ `mergeManagedDoc` → `atomicWrite`。回傳值不變（`configPath`）。

5. **services：`init.service` 寫入迴圈特例化 `AGENTS.md`**
   - artifact 迴圈中 `AGENTS.md` 改走 read→merge→write 並列入 `createdFiles`；其餘 trust-zone / canonical 檔維持 `if (!fileExists) atomicWrite`。`.prospec.yaml` 仍最後寫入。

6. **tests：服務層測試**
   - agent-sync：brownfield（無標記）遷移入 user、有標記只換 auto、兩次 byte-identical。
   - init：既有 `AGENTS.md` 內容入 user、缺檔則 auto=stub/user 空、trust-zone byte 不變（REQ-SETUP-018 既有 scenarios 續綠）、init→agentSync user 區塊保留。

7. **docs：root README + 既有測試對齊**
   - 評估 root `README.md` 是否需補述（Constitution SHOULD，解 story 階段 WARN）；更新受影響的既有測試斷言（init-output / agent-sync 服務測試）。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| `mergeManagedDoc` 邊界誤判（user 區塊含 marker 字面字串、巢狀/重複標記） | Medium | 採 `knowledge-update` 已驗證的 non-greedy regex + function replacer 就地取代；trade-off：相較 `mergeContent` 逐節重建，就地取代更忠於「只動 auto」且保留 user 區塊外的一切；Step 2 專測邊界 |
| init 把 `AGENTS.md` 移出 blanket skip，誤傷 trust-zone | High | 僅以 label `== 'AGENTS.md'` 特例化；trust-zone（CONSTITUTION/_conventions/_index/canonical docs）維持原 skip 迴圈；SC-004 以既有 REQ-SETUP-018 byte-不變 scenarios 把關（須續綠） |
| idempotency 破壞（重跑 sync 產生 diff） | Medium | 「已含區塊」走就地取代，相同輸入輸出穩定；Step 2/6 加 round-trip 兩次 byte-identical 斷言（SC-002） |
| `createdFiles` 語意變動（`AGENTS.md` 從「skip 不列」變「always merge 列入」） | Low | 明確定義：`AGENTS.md` 每次都是實際 merge 寫入故列入；同步更新 init-output 測試；trust-zone 仍只列實際新建者 |
| `mergeContent` 既有呼叫端受影響 | Low | 不修改 `mergeContent`（knowledge 流程語意需「無 user 區塊即捨棄」）；新函式獨立並存，零回歸 |
| User-facing 文件漂移（SHOULD WARN） | Low | Step 7 評估 README 補述；delta-spec 同步 REQ-AGNT-008 / REQ-SETUP-018 |

> **Constitution 層級檢查（Phase 6）**：上述 Call Chain 無越級——新邏輯落在 services→lib，I/O 在 lib，cli 不變，符合 `cli → services → lib → types`，無 layering 違規。
> **Knowledge Quality Gate（Phase 7）**：Context Mode = Brownfield（6 模組）PASS；相關模組 README 全讀 PASS；Technical Summary 已綜整 PASS；Feature Specs（agent-integration / project-setup）已查 PASS。
