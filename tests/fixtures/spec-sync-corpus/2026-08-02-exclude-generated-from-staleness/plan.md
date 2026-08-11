# Implementation Plan: exclude-generated-from-staleness

## Overview

`knowledge-health` 以 `git log -1 --format=%cI -- <module paths>` 求出 `last_src_commit`，路徑集合直接取自 `module-map.yaml`，因此模組目錄底下的**任何**檔案都算數 —— 包含 `pnpm bundle` 重生的 `src/lib/bundled-templates.ts`。結果是每個改 `.hbs` 的變更都把 lib 判成 stale，而唯一「修好」它的方式是假造 README 編輯（PB-005／PB-011 明文禁止）。

修法是把生成檔排除在**這一個**判斷之外，而不是當它不存在：`computeChangeDigest` 必須繼續涵蓋它（它是出貨程式碼，改了就該讓 review／test provenance 失效）。兩個判斷因此刻意分歧，並各以測試釘住。生成檔清單以一個零依賴的 lib 常數單一來源化，產生者 `scripts/bundle-templates.ts` 的輸出路徑也從它推導，杜絕「產生者改了、排除清單沒改」的兩處手抄。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| lib | 零 LLM drift 引擎：collectors（全部 I/O）＋純 evaluators | `collectGitTimestamps`, `computeChangeDigest`, `gitLastCommit`(private) | types |
| tests | 4 層測試套件；drift 引擎以 temp git fixture 驗證 | `tests/unit/lib/drift-sources.test.ts`, `tests/contract/*` | 全部 |

### Existing Patterns (from lib README / _conventions.md)

- 具名常數 → 衍生清單：`DIGEST_EXCLUDED_REPORTS` 由 `DRIFT_REPORT_FILENAME`／`ESCAPED_DEFECT_REPORT_FILENAME` 推導，「derived from the filename constants, never re-typed」
- collectors 只吐資料、evaluators 是純函式；source 不可得回 `{available:false, reason}` → `skipped`，絕不假綠
- `scripts/*` 可 import `lib`（lib README 已載明 `scripts/measure-tokens.ts` outside layering）

### Architecture Constraints (from Constitution)

- 依賴方向 `cli → services → lib → types`；新常數落在 lib 的葉節點檔，零 internal import
- TDD：每個方向先寫紅測試再實作；mutation 驗證取代「測試存在」的形式主義

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| lib | High | 新增 `generated-artifacts.ts`（常數）；`gitLastCommit` 加 `excludes` 參數＋失敗降級；`collectGitTimestamps` 只在 `last_src_commit` 傳入排除清單 |
| tests | Medium | 兩方向 staleness 單元測試、digest 涵蓋釘住、產生者同源契約測試 |
| —（`scripts/`，非 module） | Low | `bundle-templates.ts` 的輸出路徑改由常數推導 |

## Call Chain

```
prospec check
  → check.service.execute(cwd)
  → collectGitTimestamps(cwd, moduleMap, knowledgePath)                  [I/O collector]
      → gitLastCommit(cwd, entry.paths, GENERATED_SOURCE_ARTIFACTS)      [src：帶排除 pathspec]
          → gitCapture(['log','-1','--format=%cI','--',…paths,':(exclude)…'])
          → 失敗（null）→ 退回不帶排除的同一查詢                          [降級，不得回 null]
      → gitLastCommit(cwd, [readmeRel])                                  [README：無排除]
      → gitLastCommit(cwd, subModuleRels)                                [sub-module：無排除]
  → evaluateKnowledgeHealth(timestamps)                                  [pure]
      → isStale(last_src_commit, newerOf(readme, sub-module))

prospec check（另一條，本變更不得觸碰）
  → computeChangeDigest(cwd) → git diff HEAD + untracked（denylist 內無生成檔）

pnpm bundle
  → scripts/bundle.ts → bundleTemplates()
      → OUTPUT_FILE = resolve(repoRoot, BUNDLED_TEMPLATES_SOURCE)        [同一常數]
```

## Implementation Steps

1. **新增 `src/lib/generated-artifacts.ts`**
   - `BUNDLED_TEMPLATES_SOURCE = 'src/lib/bundled-templates.ts'`（repo-root 相對、posix）
   - `GENERATED_SOURCE_ARTIFACTS = [BUNDLED_TEMPLATES_SOURCE] as const` —— 由具名常數推導，不重打字串
   - 檔頭註解說明範圍：只作用於「模組知識是否過期」，明文寫出 digest 不適用

2. **`scripts/bundle-templates.ts` 改吃常數**
   - `export const OUTPUT_FILE = path.resolve(__dirname, '..', BUNDLED_TEMPLATES_SOURCE)`，`bundleTemplates()` 寫入它
   - 檔內不得再出現第二份 `bundled-templates.ts` 字面值

3. **`gitLastCommit` 加 `excludes` 參數（RED 先行）**
   - 帶排除時組 `:(exclude)<path>` pathspec；`gitCapture` 回 null（失敗，非空結果）→ 重跑不帶排除的查詢
   - 空字串（成功但無 commit）維持折成 null 的既有語意

4. **`collectGitTimestamps` 只在 `last_src_commit` 傳入 `GENERATED_SOURCE_ARTIFACTS`**
   - README／sub-module 兩個呼叫不變

5. **測試（每步先紅）**
   - 只動生成檔的 commit → `last_src_commit` 不前移；真實原始碼變動 → 仍前移（反向，防假綠）
   - 生成檔與真實原始碼在同一 commit → 仍計入
   - `computeChangeDigest` 因編輯生成檔而改變（與上一條並排，註解寫明兩個判斷範圍不同）
   - fault injection：排除查詢失敗時退回未排除答案，而非 null
   - 契約：`OUTPUT_FILE` 等於常數解析結果、檔案存在、產生者無第二份字面值

6. **Mutation 驗證**
   - 移除 `collectGitTimestamps` 的排除傳參 → 方向一測試轉紅
   - 把生成檔加進 `computeChangeDigest` 的 denylist → digest 測試轉紅

7. **收斂**
   - `pnpm counts`（新增 lib 檔案會動到 factual counts）、`pnpm lint`／`typecheck`／`test`
   - lib 模組 README 的 Key Files／Pitfalls 反映新常數與排除語意（知識同步在 verify commit 前）

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 排除 pathspec 讓 git 失敗，`last_src_commit` 變 null → `isStale` 讀作 not stale，全模組假綠 | High | 失敗降級回未排除查詢（吵雜但真實）；以 fault injection 測試釘住，不靠 git 版本假設 |
| 排除清單過寬，誤把真實原始碼排掉 | High | 清單只列具名生成檔；反向測試（真實變動仍 stale）＋ mutation |
| 順手把生成檔也排出 `computeChangeDigest`，出貨程式碼變動不再讓 review 失效 | High | 專屬 digest 測試 + mutation 從反方向釘住；兩個判斷的差異寫進註解與 spec |
| 新增 lib 檔案使知識庫 factual counts 失準 | Low | 實作後跑 `pnpm counts`；CI 的 `counts:check` 閘門會擋 |
