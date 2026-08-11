# exclude-generated-from-staleness

## Background

任何改到 shipped `.hbs` 的變更都會由 `pnpm bundle` 重生 `src/lib/bundled-templates.ts`。該生成檔位於 `src/lib`，於是 `knowledge-health` 以 git 時間戳判定 **lib 模組 stale** —— 即使 lib 的行為與其 README 描述完全未變。這是一個沒有正確處置方式的 WARN：為了刷時間戳而編輯 README 等於假造內容（違反 PB-005／PB-011），不編輯則 WARN 被下一個變更的 verify V4 繼承為 pre-existing。lessons ledger 鍵 `knowledge/generated-file-trips-module-stale` 已達 freq=3、impact_modules=2，裁決為**不晉升成團隊規則、改做機械解**（GitHub issue #121）。

## User Stories

### US-1: 生成檔不再觸發模組 staleness [P1]

As a developer who reads `prospec check` 的 knowledge-health 判定,
I want 模組的 `last_src_commit` 只計入**人寫的**原始碼、排除建置產物,
So that stale WARN 一律對應「有真實原始碼變動但知識未同步」，每一則都有據實的處置方式。

**Acceptance Scenarios:**

- WHEN 一個 commit 只重生 `src/lib/bundled-templates.ts`（無其他 lib 原始碼變動）, THEN `knowledge-health` 對 lib 回報 **not stale**
- WHEN 同一個模組另有真實原始碼變動而 README 未更新, THEN 仍照舊回報 **stale**（不得產生假綠）
- WHEN 一個 commit 同時動到生成檔與真實原始碼, THEN 該 commit 仍計入 `last_src_commit`
- WHEN 模組路徑下沒有任何生成檔, THEN 時間戳與變更前完全一致

**Independent Test:**
以 temp git fixture 建立兩個模組目錄，各自 commit 一次真實原始碼＋一次 README，再單獨 commit 一次生成檔；斷言只動生成檔的模組 `last_src_commit` 停在真實原始碼那次，另一個模組不受影響。

### US-2: 生成檔清單與其產生者單一來源 [P1]

As a maintainer who adds the next generated artifact,
I want 生成檔路徑由一個具名常數提供、產生者與消費者都從它推導,
So that 新增生成物時不會出現「產生者改了、staleness 排除清單沒改」的兩處手抄漂移。

**Acceptance Scenarios:**

- WHEN `scripts/bundle-templates.ts` 決定輸出路徑, THEN 它從共用常數推導，而非自行硬寫 `../src/lib/bundled-templates.ts`
- WHEN `collectGitTimestamps` 組出排除 pathspec, THEN 它從同一個常數推導
- WHEN 常數被改動, THEN 產生者的輸出位置與 staleness 排除同時跟著移動（契約測試釘住兩者同源）

**Independent Test:**
契約測試斷言 `scripts/bundle-templates.ts` 的輸出檔路徑等於常數解析後的絕對路徑，且該檔確實存在。

### US-3: digest 涵蓋範圍不受影響 [P1]

As a reviewer whose review/test provenance 依賴 change digest,
I want `computeChangeDigest` 對 `bundled-templates.ts` 的涵蓋維持不變,
So that 出貨程式碼的變動仍然使既有的 review／test 記錄失效，排除只作用在「模組知識是否過期」這一個判斷上。

**Acceptance Scenarios:**

- WHEN 只編輯 `src/lib/bundled-templates.ts`, THEN `computeChangeDigest` 的輸出改變
- WHEN 兩個判斷被並排測試, THEN 測試明確記錄「同一個檔案：進 digest、不進 staleness」

**Independent Test:**
同一個 temp git fixture 內，對 `bundled-templates.ts` 寫入新內容後比較 digest 前後值，並同時斷言該模組的 `last_src_commit` 未因這次寫入而前移。

## Edge Cases

- **生成檔尚未進版控**（新增但未 commit）：排除 pathspec 對 `git log` 無副作用，時間戳與變更前相同
- **模組路徑本身就是生成檔**：本專案不存在此形態；若日後出現，該模組的 `last_src_commit` 會變成 null，`isStale` 讀作 not stale —— 由 coverage 規則與 README 存在性另行把關，不在本變更範圍
- **git 不支援 `:(exclude)` pathspec magic**（git < 1.9）：`gitCapture` 失敗回 null，`gitLastCommit` 會把它折成 null，而 `isStale(null, …)` 判 not stale —— 全模組假綠。必須降級回**未排除**的查詢（變更前的吵雜但真實的答案），不得降級成 null
- **一個 commit 同時動生成檔與真實原始碼**：`git log` 的 pathspec 過濾以「有任一符合的檔案」為準，該 commit 仍被計入 —— 正確

## Functional Requirements

- **FR-001**: `collectGitTimestamps` 計算 `last_src_commit` 時，從模組路徑集合排除已知生成檔；`last_readme_commit`、`last_sub_module_commit` 不受影響
- **FR-002**: 已知生成檔以具名常數單一來源化；`scripts/bundle-templates.ts` 的輸出路徑由同一常數推導
- **FR-003**: 排除查詢失敗時降級回未排除的查詢，不得回 null（fail-open 假綠）
- **FR-004**: `computeChangeDigest` 的涵蓋範圍不變 —— 生成檔仍在 digest 內
- **FR-005**: 兩個方向各有測試（排除生效 / 真實變動仍 stale），並以 mutation 驗證

## Success Criteria

- **SC-001**: 在本 repo 實測，只重生 `bundled-templates.ts` 的 commit 之後 `prospec check` 對 lib 回報 not stale
- **SC-002**: 模組另有真實原始碼變動而 README 未更新時仍回報 stale（測試釘住）
- **SC-003**: 編輯 `bundled-templates.ts` 使 `computeChangeDigest` 輸出改變（測試釘住）
- **SC-004**: mutation 驗證：移除排除邏輯使 SC-001 方向的測試轉紅；把生成檔加進 digest 的排除清單使 SC-003 的測試轉紅
- **SC-005**: `pnpm test`、`pnpm typecheck`、`pnpm lint`、`prospec check --strict` 全綠

## Related Modules

- **lib**（keywords: `drift-sources`, `drift-checker`）: `collectGitTimestamps` 與 `computeChangeDigest` 都在 `src/lib/drift-sources.ts`；新的共用常數也落在此模組
- **tests**（keywords: `drift`, `unit`, `contract`）: 兩個方向的單元測試與同源契約測試
- **templates**（間接）: 生成檔 `bundled-templates.ts` 的內容來源是 `src/templates`，但本變更不改任何 `.hbs`

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — INVEST：三個 Story 各自可獨立交付與測試（US-1 行為、US-2 同源、US-3 反向界線）；TDD 由 tasks 排序保證；依賴方向 `scripts → lib → types` 不逆向

## UI Scope

**Scope:** none
