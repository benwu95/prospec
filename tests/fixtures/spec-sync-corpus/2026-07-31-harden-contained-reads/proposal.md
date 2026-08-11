# harden-contained-reads

## Background

同一條「realpath-contained read」不變式在 repo 裡有兩份實作，而只有一份包了讀取失敗的 try/catch：
`drift-sources` 的 `readContainedFile` 明文寫著「exists but cannot be read（EISDIR / EACCES / too
large）視為不存在，否則 throw 會殺掉整個 check run」；`knowledge-reader` 的 `readTextIfExists`
（`src/lib/knowledge-reader.ts:344`）沒有。實測後果：`modules/<name>/README.md` 若是指向**知識樹內部**
目錄的 symlink，containment 會放行（realpath 仍在樹內），`readFileSync` 拋 EISDIR 並中止整個
collector——`prospec check` 整場失敗而非回報一筆誠實的缺席。此缺陷在 HEAD 即存在，由
enforce-sub-module-budget 的 review 以 F-14 提出並刻意留作獨立變更。

## User Stories

### US-1: 讀不到的知識檔讀作缺席，而非讓 check 整場掛掉 [P1]

As a 在自己 repo 上跑 `prospec check` 的維護者，
I want 一個存在但讀不到的知識檔（指向目錄的 symlink、權限被撤、過大）被讀作「不存在」，
So that 單一個病態檔案只讓那一筆量測缺席，而不是讓整個 drift check 拋錯中止。

**Acceptance Scenarios:**

- WHEN `modules/<name>/README.md` 是指向知識樹內部目錄的 symlink，THEN `collectKnowledgeSize` 不拋錯，該模組不產生 l2 item，其餘模組照常量測
- WHEN 同一路徑指向樹外，THEN 維持既有行為：containment 先攔下並回 null（絕不吐內容）
- WHEN 檔案存在且可讀，THEN 內容與行為與現況逐位元相同
- WHEN `module-map.yaml`／`feature-map.yaml` 存在但讀不到，THEN **loud**：拋 `ModuleDetectionError`，因為那份檔案的缺席會讓 Constitution fallback ruleset 靜默接管 dependency-direction；同檔案的 raw 內容讀取（`readModuleMapRaw`）維持 graceful，它只供文字、不挑 ruleset。schema 無效仍由 parser 拋（loud 不變）

**Independent Test:**
以暫存目錄建立 `prospec/ai-knowledge/modules/lib/README.md` → 指向 `ai-knowledge/_shared/`（目錄）的
symlink，直接呼叫 `collectKnowledgeSize`，斷言不拋錯且 l2 items 為空。

### US-2: 兩份實作收斂為單一 helper [P2]

As a 下一個要碰 contained read 的開發者，
I want containment ＋ 讀取失敗處理只有一份實作，由 `knowledge-reader` 這個 leaf 匯出，
So that 兩份實作不會再一次分岔——這次的缺陷正是分岔本身（PB-006）。

**Acceptance Scenarios:**

- WHEN 檢視 `drift-sources` 的 `readContainedFile`，THEN 它委派給 `knowledge-reader` 匯出的單一 helper，不自帶第二份 containment 或 try/catch
- WHEN 兩個呼叫端各自跑既有測試，THEN 行為不變（drift-sources 對 cwd 為根、knowledge-reader 對知識樹為根）
- WHEN 相依方向被檢查，THEN 維持 `drift-sources → knowledge-reader`（lib→lib 單向，不新增反向邊）

**Independent Test:**
`grep` 確認 `readFileSync` 在 lib 的 contained-read 路徑上只出現在該 helper 內；`import-direction` 檢查通過。

## Edge Cases

- 懸空 symlink：`existsSync` 為 false，維持回 null（早於 realpath）
- 指向樹外的 symlink：containment 攔下，回 null——安全語意不因本修正放寬
- `EACCES`／過大檔案：與 EISDIR 同路徑處理（讀作缺席）
- schema 無效的 `module-map.yaml`：仍由 `parseYaml`／zod 拋出，`invalid→loud` 不被弱化
- Windows：無 POSIX 權限撤銷語意，權限類 fixture 以 `process.platform` 閘控（PB-010 家族）

## Functional Requirements

- **FR-001**: `readTextIfExists` 的 `readFileSync` 包 try/catch，失敗回 `null`，並以註解說明理由（與 `readContainedFile` 同一句）
- **FR-002**: containment ＋ 讀取失敗處理收斂為 `knowledge-reader` 匯出的單一 helper；`drift-sources.readContainedFile` 改為薄適配器
- **FR-003**: REQ-MCP-006 的 read layer 契約補上第三格「存在但讀不到 → graceful missing」，且不弱化 `invalid→loud`
- **FR-004**: 新增回歸測試：contained 目錄 symlink 不拋錯、樹外 symlink 仍回 null、可讀檔案行為不變

## Success Criteria

- **SC-001**: US-1 四個場景各有測試，新斷言經 mutation-verify（移除 try/catch → 轉紅）
- **SC-002**: `pnpm test` / `typecheck` / `lint` 全綠；`prospec check` 14/14 0 warn
- **SC-003**: `grep -c readFileSync` 在 `knowledge-reader.ts` 的 contained-read 路徑為 1，`drift-sources.ts` 的 `readContainedFile` 內為 0
- **SC-004**: `pnpm counts:check` 同步

## Related Modules

- **lib**: `knowledge-reader.ts`（helper 本體）與 `drift-sources.ts`（改為委派）
- **tests**: contained-read 的回歸與委派斷言

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — 變更工件繁中、信任區與 commit message 英文；測試先行；`drift-sources → knowledge-reader` 維持 lib→lib 單向；root README 未記載此內部讀取層，README-current 不觸發

## UI Scope

**Scope:** none
