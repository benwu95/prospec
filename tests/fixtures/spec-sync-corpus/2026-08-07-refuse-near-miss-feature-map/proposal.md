# refuse-near-miss-feature-map

## Background

下游專案首次執行 `prospec archive` 時，product.md 檔尾多出一整節機器所有的 `## Feature Map`，34 個 feature 全帶 TBD 佔位。原因是該專案早已手寫一節 `## Feature Map (34 active)`（依教學流程分組的策展導覽），而 `findSectionRange`（`src/services/archive.service.ts:530`）以標題文字「精確相等」比對 `Feature Map`，`(34 active)` 對不上，於是 `spliceProductSpec` 走 `range === null` 的 append 分支。結果同一份文件有兩份 feature map 並存，且 archive skill Phase 3.6 的檢查項（「Feature Map 列出每個 active Feature Spec」）在 append 出來的那份上會通過，人工把關攔不住。

同時暴露第二個缺口：`generateProductSpec` 現有的 unclosed-fence 拒絕（`:777`）在**實跑時毫無輸出** —— 只有 `--dry-run` 會用 `action: 'skip'` 預告。拒絕若不回報，就只是把「靜默寫錯」換成「靜默不寫」。

## User Stories

### US-1: 近似標題觸發拒絕而非 append [P1]

As a 在既有 product.md 上首次導入 prospec 的下游維護者，
I want sync 在偵測到「近似 Feature Map 標題」時拒絕動作並指名該標題，
So that 我的文件不會多出第二份 feature map，而是收到一則可據以改名的指示。

**Acceptance Scenarios:**

- WHEN product.md 沒有精確的 `## Feature Map` 標題，但存在一個正規化後等於 `feature map` 的 top-level 標題（如 `## Feature Map (34 active)`），THEN sync 拒絕寫入，檔案一個 byte 都不變（含 frontmatter `last_updated`）
- WHEN 上述拒絕發生於 `--dry-run`，THEN planned 清單出現一筆 `action: 'skip'`，target 為 product.md，detail 指名該近似標題與補救方式，且不出現任何針對 product.md 的 `write`
- WHEN product.md 存在精確的 `## Feature Map` 標題，THEN 即使檔內另有近似標題也照常 splice（近似標題是作者自己的區段，非機器所有）
- WHEN 標題正規化後不等於 `feature map`（如 `## Feature Map Rationale`），THEN 不視為近似，維持現行 append 行為
- WHEN 同一份 product.md 反覆執行 archive，THEN 拒絕是冪等的 —— 每次皆不寫入、每次皆回報同一則原因

**Independent Test:**
以 `## Feature Map (34 active)` 的 fixture 跑實跑 archive，斷言檔案 byte-identical 且無第二個 `## Feature Map`；再跑 `--dry-run`，斷言恰有一筆 `skip`、無 product.md 的 `write`。

### US-2: 實跑的拒絕會被回報 [P1]

As a 執行 `prospec archive` 的維護者，
I want 任何「sync 決定不寫 product.md」的判斷都在實跑輸出裡現形，
So that 我不會誤以為 Feature Map 已同步，而能當場知道要修哪個標題或哪道未閉合的 code fence。

**Acceptance Scenarios:**

- WHEN 實跑因近似標題而拒絕，THEN archive 結果帶出該拒絕（原因＋涉及的標題），CLI 以警示行輸出到 stderr
- WHEN 實跑因 unclosed code fence 而拒絕，THEN 走同一條回報通道，不再靜默
- WHEN 加上 `--quiet`，THEN 拒絕訊息仍然輸出（與既有 `refusedReconciliations` 的 stderr 行為一致）
- WHEN sync 正常完成，THEN 不產生任何拒絕輸出

**Independent Test:**
以近似標題 fixture 與 unclosed-fence fixture 各跑一次實跑 + `--quiet`，斷言 stderr 各含一則具名拒絕；正常 fixture 斷言 stderr 無拒絕行。

## Edge Cases

- 近似標題寫成 setext 形式（`Feature Map (34 active)` 上方接 `---` 底線）：`topLevelHeadings` 已涵蓋 setext，一併偵測
- 近似標題出現在 fenced code block 內：不是標題，不觸發拒絕（沿用 `withoutFencedBlocks` 遮罩）
- 近似標題出現在 YAML frontmatter 內（`#` 開頭是 YAML 註解）：不是標題，不觸發拒絕（沿用 `frontmatterEnd` 遮罩）
- product.md 不存在：走 bootstrap，不做近似偵測（沒有作者內容可保護）
- unclosed fence 與近似標題同時存在：fence 拒絕優先（文件在兩個方向都不可解析），只報 fence 一則
- 檔內有多個近似標題：拒絕一次，訊息指名第一個並標示總數
- 近似標題與精確標題同時存在：精確標題勝出，正常 splice，不拒絕

## Functional Requirements

- **FR-001**: 定義可列舉的近似正規化規則 —— case-fold、去除開頭序號（`4. ` / `4) `）、去除結尾冒號、去除單一結尾的括號或方括號後綴，結果等於 `feature map` 即為近似
- **FR-002**: 僅在「檔案存在且無精確 `## Feature Map`」時才做近似偵測；偵測命中即拒絕，不改以寬鬆比對接管該節
- **FR-003**: 拒絕時實跑不寫入任何 byte，包含 frontmatter `last_updated` 的刷新
- **FR-004**: dry-run 以既有 `action: 'skip'` 形狀預告該拒絕，detail 指名標題與補救方式
- **FR-005**: `generateProductSpec` 的拒絕結果向上傳遞至 archive 結果，實跑由 CLI formatter 輸出到 stderr 且不被 `--quiet` 吞掉
- **FR-006**: 既有的 unclosed-fence 拒絕改走同一條回報通道
- **FR-007**: `references/product-spec-format.hbs` 補述近似標題的拒絕規則與補救方式（把策展內容獨立成節）；archive skill Phase 3.6 的檢查項納入兩問 —— 「sync 未被拒絕」與「作者區段是否已有換名的等價 feature map」（後者是詞法規則抓不到的語意層，由 agent 承擔）

## Success Criteria

- **SC-001**: 以 `## Feature Map (34 active)` fixture 實跑 archive 後，product.md byte-identical，且全檔只有一個 `Feature Map` 標題（即作者原本那個）
- **SC-002**: 同一 fixture 的 `--dry-run` 輸出恰含一筆 product.md 的 `skip`、零筆 `write`
- **SC-003**: `## Feature Map Rationale` fixture 的行為與變更前完全一致（無偽拒絕）
- **SC-004**: 近似標題與 unclosed-fence 兩種 fixture 在 `--quiet` 實跑下，stderr 各含一則具名拒絕訊息
- **SC-005**: `pnpm test` 全綠、覆蓋率 ≥ 80%、`pnpm counts:check` 通過

## Related Modules

- **services**: `archive.service.ts` —— 近似偵測、拒絕守衛、拒絕結果上傳（`spliceProductSpec` / `generateProductSpec` / `ArchiveResult`）
- **cli**: `formatters/archive-output.ts` —— 實跑拒絕的 stderr 輸出，比照 `refusedReconciliations` 的既有形狀
- **templates**: `references/product-spec-format.hbs` 補述拒絕規則；`skills/prospec-archive.hbs` Phase 3.6 檢查項
- **tests**: `unit/services/archive.service.test.ts` 的 splice 測試群、CLI formatter 測試、近似標題的正規化列舉測試

## Open Questions

- 無 —— 缺陷有明確重現路徑與既有處理範式（unclosed fence 的拒絕形狀、`refusedReconciliations` 的 stderr 通道），設計選項在 plan 階段收斂

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified：TDD（先寫 fixture 測試再改行為）、Atomic Commits（services+cli 行為與 templates 文件可分為兩個 commit）、Dependency Direction（cli → services 單向，無反向 import）、Language Policy（本檔為變更工件用繁中；delta-spec 的 `**Spec:**` 區塊與 templates 產出維持英文）

## UI Scope

**Scope:** none
