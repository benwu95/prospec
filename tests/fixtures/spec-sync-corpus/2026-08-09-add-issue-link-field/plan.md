# add-issue-link-field — Implementation Plan

## Overview

「每 issue 一變更一 PR、PR body 結尾 `Closes #NN`」這條慣例目前沒有工件承載，只活在人與特定 harness 的記憶裡。本變更給它一條機械登記線：`ChangeMetadata` 新增 optional `issue`，由 `prospec change story --issue` 寫入，並在 `prospec status` 與 archive summary 兩個讀取面帶出。

實作策略完全比照 `introduced_by`（issue #61 的先例）：optional、形態自由、純登記——不校驗格式、不呼叫任何 forge API、不進 `REQUIRED_METADATA_FIELDS`、不新增 drift check。因此每一層的改動都是**加法**：schema 加一個 `.optional()`、`change story` 加一個旗標、兩個顯示面各加一條「有值才印」的分支。慣例的「為什麼」則由文件承載——`CONTRIBUTING.md` 補完 house convention 並具名指向 reference，reference 反向只交還給「專案自身的 contributor docs」（出貨模板不得點名本 repo 的檔案）；新增 `submit-pr` maintainer skill（比照 `release`，不是出貨 skill、無 `.hbs`、`.claude`／`.agents` 雙份手動維護）。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| types | Zod schemas 與凍結登記表 | `ChangeMetadataSchema`、`ChangeRoute`／`ChangeRouteFacts` | zod only |
| lib | 純工具與 I/O-free 引擎 | `routeChange`、`writeChangeMetadataObject` | types |
| services | 每指令一個 `execute()` | `change-story`、`status`、`archive.generateSummary` | lib, types |
| cli | Commander 薄層 | `registerChangeCommand`、`formatStatusOutput` | services, types |
| templates | Handlebars 資源 | `references/metadata-format.hbs`、`references/archive-format.hbs` | none |
| tests | 4 層 Vitest | unit／contract／e2e | 全部 |

### Existing Patterns (from _conventions.md)

- **metadata.yaml 是 CLI-written／skill-read**：組出物件後由 `writeChangeMetadataObject` 序列化，欄位順序取自物件自身的 key order（`metadata-format` reference 是該順序的權威文件）
- **缺席 vs 空值**：以條件展開（conditional spread）把不存在的鍵留在 YAML 之外；寫 `undefined` 會序列化成 `null`
- **`satisfies Partial<NewChangeMetadata>`**：每個展開體都要標，否則 TypeScript 不對展開成員做多餘屬性檢查，打錯的鍵會一路寫到磁碟
- **formatter 一律過 `sanitizeTerminal()`**：任何自由文字（含使用者給的 issue 參照）在 stdout 前必須消毒

### Architecture Constraints (from Constitution)

- 依賴單向 `cli → services → lib → types`——`issue` 由 types 定義、lib 傳遞、services 寫入／蒐集、cli 印出
- TDD：測試先行或同 commit
- Language Policy：本檔繁中；程式碼、`.hbs`、`CONTRIBUTING.md`、`submit-pr` skill 皆英文
- User-Facing Documentation：`change story` 旗標表列在兩份 root README，需同步

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Medium | `ChangeMetadataShape.issue`；`ChangeRouteFacts`／`ChangeRoute` 帶 optional `issue` |
| lib | Low | `routeChange` 在 `base` 以條件展開原樣傳遞 `issue` |
| services | Medium | `change-story` 寫入；`status` 蒐集；`archive.generateSummary` 輸出 Issue 列 |
| cli | Medium | `change story --issue <ref>` 旗標；`status-output` 印 `issue:` 行 |
| templates | Medium | `metadata-format.hbs`（欄位順序＋表列＋引號化與不校驗立場）、`archive-format.hbs`（Change Overview） |
| tests | High | unit（schema／router／三個 service／formatter）＋ contract（reference 渲染）＋ e2e（真 CLI 給／不給旗標） |

## Call Chain

```
prospec change story <name> --issue "#131"
  → registerChangeCommand.action(name, options)              [cli：解析旗標]
  → change-story.service.execute({ name, issue })            [services：組 metadata 物件]
  → writeChangeMetadataObject(path, metadata)                [lib：yaml 序列化，key order = 物件順序]

prospec status
  → status.service.execute()                                 [services：掃描 .prospec/changes]
  → readChangeMetadata(metadataPath, name)                   [lib：schema-enforced 讀取]
  → collectFacts(...) → { …, issue }                         [services：蒐集顯示欄位]
  → routeChange(facts) → ChangeRoute{ …, issue }             [lib：純函式原樣傳遞]
  → formatStatusOutput(report)                               [cli：有值才印，過 sanitizeTerminal]

prospec archive <name>
  → archive.service.generateSummary(dir, name, createdDate)  [services：讀 metadata.yaml → Change Overview]
```

## Implementation Steps

1. **types 層（測試先行）**
   - `ChangeMetadataShape` 於 `introduced_by` 之後加 `issue: z.string().optional()`，doc comment 說明語意與 `introduced_by` 的分野（外部追蹤項 vs 肇因變更）並標明不校驗
   - `ChangeRouteFacts`／`ChangeRoute` 各加 `issue?: string`
   - 單元測試：有／無欄位皆通過 schema；`REQUIRED_METADATA_FIELDS` 未變（既有斷言保護）

2. **lib 層**
   - `status-router.ts` 的 `base` 加 `...(facts.issue !== undefined ? { issue: facts.issue } : {})`——絕不寫成 `issue: facts.issue`，`satisfies` 下 optional 鍵帶 `undefined` 會讓「缺席」與「存在但空」無法區分
   - 單元測試：facts 有 issue → route 帶出；無 → `ChangeRoute` 不含該鍵

3. **services 層**
   - `change-story.service`：`ChangeStoryOptions.issue`；以條件展開 `satisfies Partial<NewChangeMetadata>` 寫入；空白字串視同未給（`trim()` 為空則不寫）
   - `status.service.collectFacts`：把 `metadata.issue` 併入 facts（同樣條件展開）
   - `archive.service.generateSummary`：讀出 `meta.issue`，有值才在 Quality Grade 之後插 `- **Issue**: <ref>` 一列
   - 單元測試：三條路徑各測「有／無」兩態

4. **cli 層**
   - `change-story.ts` 加 `.option('--issue <ref>', ...)`；action 以條件展開傳入 service
   - `status-output.ts` 在 status 行之後、next 行之前印 `issue:`（有值才印，過 `sanitizeTerminal`）
   - formatter 單元測試 + `tests/e2e/cli.test.ts` 兩個案例（給旗標→YAML 有鍵且 status 印出；不給→YAML 無 `issue:` 字樣）

5. **templates 層（reference 文件）**
   - `metadata-format.hbs`：canonical field order 追加 `issue`；欄位表加一列（寫入者 `prospec change story --issue`）；補一段說明形態自由、不校驗、以 `#` 開頭時 YAML 必然引號化，並把慣例交還給專案自身的 contributor docs——**不得點名 `CONTRIBUTING.md`**（出貨模板不得斷言 THIS repo 的事實）
   - `archive-format.hbs`：Change Overview 加 `- **Issue**: {ref}`（optional，缺則省略）
   - contract 測試：section-scoped 斷言 + mutation-verify（對 **bundle** 下手，因為 `renderTemplate` 先讀 `bundled-templates.ts`）
   - 收尾：`pnpm bundle` → `npx tsx src/cli/index.ts agent sync`（用 source CLI，安裝版會部署舊模板）

6. **文件與 maintainer skill**
   - 兩份 root README 的 `change story` 旗標表加 `[--issue <ref>]`
   - `CONTRIBUTING.md` 的 Submit a Pull Request 補完：兩 commit 模式，並指向 `metadata.yaml` 的 `issue` 欄位（機械登記）
   - 新增 `.claude/skills/submit-pr/SKILL.md` 與 `.agents/skills/submit-pr/SKILL.md`（內容互為鏡像，唯一允許差異是 entry config 名稱），`.gitignore` 各加一條 `!` 例外

7. **收斂**
   - `pnpm counts`（新增測試改變測試數）→ `pnpm test`／`typecheck`／`lint`／`prospec check`

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| optional 鍵寫成空字串或 `null`，讓「缺席」不可分辨 | High | 每處都用條件展開；e2e 直接 grep 產出的 YAML 不含 `issue` |
| `#131` 未被引號化 → 回讀成 YAML 註解、整個值消失 | High | 由 `stringifyYaml` 負責；加一個 round-trip 測試把 `#` 開頭值寫入再讀回 |
| 只改 `src/templates` 未 `pnpm bundle` → contract 測試假綠、部署舊模板 | Medium | 步驟 5 明列 bundle + source CLI sync；contract mutation-verify 對 bundle 下手 |
| `.claude`／`.agents` 雙份 skill 單邊編輯（`release` 已發生過） | Medium | 同 commit 寫兩份；以 `git check-ignore` 驗證兩條路徑都進版控 |
| 既有變更／已封存 metadata 因新欄位轉紅 | High | 欄位不進 `REQUIRED_METADATA_FIELDS`；跑 `prospec check` 比對 `metadata-completeness` 判定不變 |
| 本變更自己無法用新旗標登記 issue #131 | Low | 已知限制，記在 proposal Edge Cases；不為此加 setter 指令（超出 issue 範圍） |

## Notes

- US-3（`CONTRIBUTING.md` + `submit-pr` skill）**沒有 REQ 載體**：`release` maintainer skill 與 `CONTRIBUTING.md` 在 `prospec/specs/features/` 皆無 REQ 覆蓋，本輪沿用該先例，不為 repo 自用文件造 REQ
