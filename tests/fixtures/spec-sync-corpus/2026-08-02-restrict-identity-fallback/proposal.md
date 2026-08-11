# restrict-identity-fallback

## Background

`mergeFindings`（`src/lib/review-merge.ts`）的識別順序是「先查 id，查不到就退回 `(location, lens)`」。一個**全新**的 id 在既有表中必然查不到，於是 `??` 落到 location 比對：若該 `(location, lens)` 已有列，新發現就被併進去，覆蓋掉舊列的 summary 與 status，而且因為 `finding.id && !target.id` 為 false，新 id 直接被丟棄。REQ-CLI-028 明文寫「the CLI never infers identity from a location string」，實作在「id 是新的」這個情況下正好違反。issue #116 記錄了實際案例：`delegate-module-adjudication` 第四輪的 `F-8` 與 `NEW-4` 同指 `tests/contract/skill-format.test.ts:1313`、lens 皆為 `test-quality`，合併後只剩一列，稽核軌跡少一筆。

## User Stories

### US-1: 帶新 id 的發現一律開新列 [P1]

As a 執行 `/prospec-review` 的審查者,
I want 我在 findings JSON 裡指派的每個新 id 都在累積表中佔有自己的一列,
So that 兩個剛好指向同一行程式碼的不同發現不會塌成一列、稽核軌跡不會少掉一筆。

**Acceptance Scenarios:**

- WHEN 一輪 findings 帶著既有表查不到的 id，且其 `(location, lens)` 與某個**已有 id** 的列相同，THEN 新增一列，既有列的 summary / status / severity 原封不動
- WHEN 一輪 findings 重用既有列的 id（即使 location 已隨修補漂移），THEN 併入該列、severity 取最大值
- WHEN 既有列是 id 制度之前的手寫列（**無 id**），incoming 帶 id 且 `(location, lens)` 相同，THEN 併入該列並收養該 id（legacy 相容行為不變）

**Independent Test:**
以 issue #116 的最小重現餵 `mergeFindings`（既有 `F-8` vs incoming `NEW-4`，同 location、同 lens），斷言回傳兩列且兩個 id 都在。

### US-2: 同一輪的無 id 發現不再互相覆蓋 [P2]

As a 沿用無 id 舊格式的審查者,
I want 同一輪裡共用 `(location, lens)` 的兩個無 id 發現各自成列,
So that 「沒指派 id」只讓我失去跨輪追蹤能力，而不是讓本輪的第二筆發現整個消失。

**Acceptance Scenarios:**

- WHEN 同一輪有兩個無 id finding 共用 `(location, lens)`，且該鍵在本輪之前沒有對應列，THEN 產生兩列
- WHEN 同一輪有兩個無 id finding 共用 `(location, lens)`，且本輪之前已存在一列，THEN 第一筆併入該既有列、第二筆開新列
- WHEN 一輪只有一個無 id finding 且其 `(location, lens)` 對到既有列（不論該列有無 id），THEN 併入該列而非產生重複列

**Independent Test:**
對空表餵入兩個同 location、同 lens、皆無 id 的 finding，斷言回傳兩列且各自的 summary 都保留。

## Edge Cases

- **同輪重用同一個 id 兩次**：仍併入同一列 —— id 是明示的身分主張，最後一筆的 status / summary 勝出
- **id 命中的列與 `(location, lens)` 候選列不是同一列**（location 已漂移）：以 id 命中為準，候選列不被消耗，仍可供本輪其他 finding 認領
- **既有表中兩列共用 `(location, lens)`**：本次改變此行為 —— 舊實作只保留最後一列，新實作把同鍵的列依表序排隊、逐一取用（這是「同輪不塌列」與 replay idempotence 的前提）；對既有含重複鍵的 review.md 而言，第一筆無 id finding 現在對到的是第一列而非最後一列
- **incoming 無 id、候選列已有 id**：仍併入該列 —— 這是 REQ-CLI-028 明文的驗收情境，不因本次收緊而改變

## Functional Requirements

- **FR-001**: 帶 id 的 finding 只在「id 命中既有列」或「`(location, lens)` 候選列無 id（legacy 收養）」時併入，否則一律開新列
- **FR-002**: 無 id 的 finding 以 `(location, lens)` 對「本輪開始前就存在」的列比對；本輪新增的列不進入退回索引
- **FR-003**: 每個 pre-round 列在單輪內至多被認領一次（同鍵多列依表序取用）；本輪以 id 點名的列在 location 比對前先被保留
- **FR-004**: REQ-CLI-028 的識別規則文字更新為上述三條，並載明同輪無 id 的行為與理由
- **FR-005**: `references/review-format` 的 Identity 說明與新規則一致（無 id ≠ 可被任意併吞）

## Success Criteria

- **SC-001**: 新增單元測試覆蓋 FR-001 / FR-002 / FR-003 的每條路徑，`pnpm test` 全綠
- **SC-002**: mutation 驗證 —— 將識別條件改回 `??` 形式時，至少一個新測試轉紅（測試確實釘住行為，非恆真式）
- **SC-003**: 既有 14 個 review-merge 單元測試零修改通過
- **SC-004**: `pnpm typecheck`／`pnpm lint`／`pnpm test`／`pnpm counts:check` 全綠，`prospec check --strict` 相對於變更前無新增 FAIL

## Related Modules

- **lib**: `lib/review-merge.ts` 的 `mergeFindings` 是缺陷所在，也是唯一的行為修改點
- **templates**: `templates/skills/references/review-format.hbs` 描述 Identity 契約，須與新規則一致
- **tests**: `tests/unit/lib/review-merge.test.ts` 承載回歸防護與 mutation 驗證對象

## Open Questions

- 無 —— 兩個設計岔路（識別規則採「候選列有無 id」條件、同輪無 id 邊界一併處理）已在 Story 開始前由使用者裁決

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] TDD [MUST]：先寫 RED 測試（issue #116 最小重現）再改實作
- [x] Language Policy [MUST]：本變更工件為繁體中文；`**Spec:**` 區塊與 trust zone 用英文
- [x] Atomic Commits [MUST]：測試與實作一併提交，spec / reference 文字同屬本次修正
- [x] User-Facing Documentation [SHOULD]：`mergeFindings` 不是根 README 記載的使用者介面，無需更新

## UI Scope

**Scope:** none
