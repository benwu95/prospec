# stop-clobbering-product-spec

## Background

`prospec archive` 的 `generateProductSpec` 是整個 archive 寫入策略的唯一異類：它從零組出 frontmatter、標題、Feature Map 後 `atomicWrite` 覆蓋**整個** `specs/product.md`，沒有讀取磁碟上任何一行既有內容。co-located 的 `syncFeatureMap` 是 bootstrap-once + no-clobber、feature spec 走 surgical merge（註解甚至強調 `NEVER blanks an authored body`），只有 product.md 整檔重生。

後果有兩層。第一層是**資料毀損**：下游 1.0.0 跑完 archive 後，手工維護的 `version: 1.65.0`、`feature_count: 34`、專案標題、`## Vision`、`## Target Users` 全數消失。第二層是**契約矛盾**：archive skill 隨身出貨的 `references/product-spec-format.md` 規定 7 節，生成器只產出 1 節，於是 skill Phase 3.6 的「confirm product.md was regenerated (per product-spec-format.md)」成為不可滿足的勾選項 —— agent 只能謊勾（prospec 自己四十幾次的實況）或手動補齊後下次被清掉（下游的實況）。

prospec 自己就是受害者：`3fffb94`（2026-06-19）把自己的 product.md 從 92 行砍成 16 行，之後沒人補回。這不是 1.0.0 的迴歸，是自 `c6f35d5` 起被 dogfood 正常化的長期缺陷。

## User Stories

### US-1: 手工內容在 archive 後原封不動 [P1]

As a 下游 prospec 使用者，
I want `prospec archive` 只更新 product.md 的 Feature Map 區段，
So that 我手寫的 frontmatter 欄位、Vision、Target Users 與自訂章節不會被無聲清掉。

**Acceptance Scenarios:**

- WHEN product.md 已存在且含 `## Feature Map`，THEN 只有 `## Feature Map` 到下一個 h2（或檔尾）之間的內容被替換，frontmatter 的 `version`／`feature_count`／任何自訂欄位與其餘章節逐 byte 不變（`last_updated` 為 prospec 擁有欄位，例外更新）
- WHEN 既有 Feature Map 項目帶人工撰寫的描述句，THEN 該描述句保留，只更新標題與連結
- WHEN product.md 已存在但沒有 `## Feature Map` 節，THEN 在檔尾附加該節，既有內容不動

**Independent Test:**
以一份含 `version`、`## Vision`、`## Target Users`、自訂節與帶描述句 Feature Map 的 product.md 跑 `generateProductSpec`，diff 只出現在 Feature Map 區段與 `last_updated`。

### US-2: 缺檔時 bootstrap 出符合自己規範的骨架 [P1]

As a 首次跑 archive 的專案，
I want 生成的 product.md 就符合 `product-spec-format` 所規定的節，
So that skill Phase 3.6 的檢查項是可滿足的，而不是逼 agent 謊勾。

**Acceptance Scenarios:**

- WHEN product.md 不存在，THEN bootstrap 出的檔案含格式規範要求的全部節：frontmatter（`product` / `version` / `last_updated`）、`# {Product} — {Tagline}`、`## Vision`、`## Target Users`、`## Feature Map`、`## Core User Stories Summary`、`## Product Principles`、`## Roadmap Overview`，未知內容以可辨識的 TBD 佔位
- WHEN 格式規範新增或刪除一節，THEN 契約測試在 bootstrap 產出未跟上時失敗
- WHEN 讀 `product-spec-format` 的 frontmatter 章節，THEN 明文寫出 prospec 只擁有 `product` 與 `last_updated`，`version`／`feature_count`／其餘鍵一律逐 byte 保留、由人維護

**Independent Test:**
契約測試從 `product-spec-format.hbs` 解析出要求的 h2 集合，與 bootstrap 產出的 h2 集合比對相等。

### US-3: dry-run 說得出它會動到什麼 [P2]

As a 執行 archive 預覽的人，
I want dry-run 區分 bootstrap 與 splice，
So that 我在事前就知道既有檔案會被動到哪一段，而不是事後 diff 才發現。

**Acceptance Scenarios:**

- WHEN product.md 不存在，THEN dry-run detail 說明這是 bootstrap 一份新骨架
- WHEN product.md 已存在，THEN dry-run detail 說明只會替換 `## Feature Map` 區段、其餘內容保留

**Independent Test:**
兩種磁碟狀態各跑一次 `--dry-run`，`planned` 中 product.md 的 detail 字串不同且各自點名 bootstrap／splice。

### US-4: feature 清單與 syncFeatureMap 同一組決定論規則 [P2]

As a 把決定論當賣點的 CLI，
I want product.md 的 feature 清單套用與 `syncFeatureMap` 相同的排序與過濾，
So that 兩個 index 不會對同一批 spec 給出不同答案，也不會因 `readdir` 順序產生跨平台假 diff。

**Acceptance Scenarios:**

- WHEN 掃描 `specs/features/`，THEN 清單經 `.sort()`，順序不隨檔案系統 `readdir` 變動
- WHEN 目錄含 `_archived-*.md` 或不安全 slug，THEN 以 `isArchivedSpec` / `isSafeResourceName` 排除，與 `syncFeatureMap` 的過濾一致

**Independent Test:**
以亂序建立、含一份 `status: active` 的 `_archived-*.md` 的目錄跑兩次生成，輸出相同且不含該 archived spec。

## Edge Cases

- product.md 存在但無 frontmatter：只做 Feature Map splice，不硬塞 frontmatter
- 既有 Feature Map 項目對應的 feature spec 已刪除或轉 deprecated：該項目連同描述句一併移除
- 新 feature 沒有人工描述句：以可辨識的 TBD 佔位寫入，不留空
- `## Feature Map` 之後沒有其他 h2：splice 到檔尾，保留檔尾換行慣例
- 內容含 h2 樣式的 fenced code block：區段邊界判定不得被程式碼區塊裡的 `## ` 行誤導
- product.md 讀取或寫入失敗：維持既有的 non-fatal 行為，不讓 archive 整體失敗

## Functional Requirements

- **FR-001**: `generateProductSpec` 對既有檔案改為 splice —— 只重寫 `## Feature Map` 區段，其餘 byte 保留（`last_updated` 例外更新）
- **FR-002**: Feature Map splice 逐項保留既有描述句，只更新標題與連結；已消失的 feature 移除，新 feature 以 TBD 描述附加
- **FR-003**: 缺檔時 bootstrap 出符合 `product-spec-format` 全部節的骨架
- **FR-004**: `product-spec-format` 明文寫出 frontmatter 所有權邊界（prospec 擁有 `product` / `last_updated`；`version`、`feature_count` 等其餘鍵由人維護、逐 byte 保留）
- **FR-005**: dry-run detail 依磁碟狀態區分 bootstrap 與 splice，並說出會動到既有檔案的哪一段
- **FR-006**: feature 清單套用 `.sort()` 與 `isArchivedSpec` / `isSafeResourceName`，與 `syncFeatureMap` 同一組規則
- **FR-007**: 契約測試比對「`product-spec-format.hbs` 要求的節」與「bootstrap 產出的節」，兩者不一致即失敗
- **FR-008**: 補回 prospec 自己 product.md 的 `version`、Vision、Target Users 與 Feature Map 描述句，並實測下一次 archive 不再吃掉

## Success Criteria

- **SC-001**: 對一份含手工 frontmatter 欄位與章節的 product.md 連跑兩次 archive，除 `last_updated` 與 Feature Map 區段外 diff 為空
- **SC-002**: bootstrap 產出的 h2 集合 == `product-spec-format.hbs` 規定的 h2 集合（由測試斷言，非人工核對）
- **SC-003**: `.claude/skills/prospec-archive/SKILL.md` Phase 3.6 的檢查項在真實執行下可誠實勾選
- **SC-004**: 本 repo 的 `prospec/specs/product.md` 補回 version / Vision / Target Users 後，再跑一次 archive dry-run 與實跑，這三者仍在

## Related Modules

- **services**: `archive.service.ts` 的 `generateProductSpec` 與 `execute()` 的 dry-run 規劃區塊
- **templates**: `skills/references/product-spec-format.hbs`（格式規範）、`skills/prospec-archive.hbs`（Phase 3.6 檢查項措辭）
- **tests**: 新增格式規範↔bootstrap 的契約測試，並補 splice／過濾／dry-run 的單元測試

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified —— 本變更為 services 內修改，依賴方向不變；測試先行（TDD）；change artifacts 以繁體中文撰寫、trust zone 與 commit message 維持英文

## UI Scope

**Scope:** none
