# enforce-counts-in-ci

## Background

`pnpm counts:check` 存在且會以 exit 1 回報落後的事實計數，但**它不在任何一個 workflow 裡**（`ci.yml`／`prospec-check.yml`／`release.yml` 皆無），drift engine 依設計也不查計數正確性。於是「生成器存在」被當成「計數受保護」：REQ-TESTS-059 的驗收情境已白紙黑字寫著「`pnpm counts:check` passes」，實際上沒有任何機制在任何時刻執行它。

帳本鍵 `docs/duplicated-count-drift` 累計 freq=22、橫跨 6 個模組，並在被標記 retired 之後於 `restrict-identity-fallback` 再次復發（review 第三輪才抓到：修復輪新增測試後未重跑 `pnpm counts`，五個檔案的計數同時落後）。退役理由「生成器已涵蓋」只有在有人跑它時才成立。

直接把 `counts:check` 加進 CI 還有第二個問題：它內部是靠 `vitest run --reporter=json` 取得每層測試數，等於整套測試在同一個 job 裡跑兩遍。因此本變更同時處理根因 —— 讓它改吃 `test:coverage` 已經產出的報告。

## User Stories

### US-1: 計數落後在 PR 就被擋下 [P1]

As a 送出 PR 的貢獻者,
I want CI 在計數落後時直接讓 job 轉紅,
So that 我不必仰賴記憶在最後一次改測試之後手動重跑生成器，而落後的數字也不會進到 main。

**Acceptance Scenarios:**

- WHEN 一個 PR 新增或刪除任何被計數的檔案類別（測試、`.hbs`、reference、skill）卻未重跑 `pnpm counts`，THEN CI 的 `test` job 轉紅並在輸出中列出每一處落後的計數
- WHEN 計數與來源一致，THEN 該步驟以 exit 0 通過且不改動任何檔案（`--check` 模式唯讀）
- WHEN 該步驟以 `--from` 讀取 `test:coverage` 剛寫出的 JSON 報告，THEN 閘門不再重跑一次套件，CI 時間相對於變更前不增加

**Independent Test:**
在本地把 README 的某個測試總數改成錯誤值後跑 `pnpm counts:check --from vitest-report.json`，確認 exit 1 且輸出點名該檔案與該計數；還原後 exit 0。另以不存在的路徑餵 `--from`，確認回報 unavailable 並 exit 1（fail closed）。

### US-2: 閘門枚舉不會靜默漂移 [P2]

As a 之後要改 `ci.yml` 的維護者,
I want 一個契約斷言釘住「CI 必須跑哪些品質閘門」,
So that 有人重排或刪掉某一步時測試會轉紅，而不是靜默失去一道防線 —— 這正是 counts:check 從未被接上的失敗形狀。

**Acceptance Scenarios:**

- WHEN `ci.yml` 的 `test` job 少了 `counts:check`（或 lint／typecheck／build／test:coverage 任一），THEN 契約斷言轉紅並指名缺少的那一步
- WHEN 新增一個品質閘門步驟到 `test` job，THEN 斷言的 baseline 集合必須被一併更新才會綠（封閉集合，非只檢查包含）

**Independent Test:**
從 `ci.yml` 刪掉 `pnpm run counts:check` 那一行後跑該契約測試，確認轉紅；還原後轉綠。

## Edge Cases

- **`counts:check` 需要測試數才能比對**：`--from` 讓它吃既有報告；**刻意不做隱式尋找**（沒有 `--from` 就照舊自己跑），因為殘留的舊報告會把「量測」變成「常數」
- **報告不存在或讀不出來**：回報 unavailable 並讓 `--check` exit 1 —— 閘門絕不在未驗證的計數上通過
- **`windows-smoke` job 不加此步**：計數與平台無關，重複執行只增加 Windows runner 時間
- **契約斷言必須讀真實 `ci.yml`**：不是讀 `init/prospec-check.yml.hbs`（那是出貨給下游專案的模板，與本 repo 的閘門是兩回事）

## Functional Requirements

- **FR-001**: `test:coverage` 額外寫出 vitest JSON 報告；`.github/workflows/ci.yml` 的 `test` job 於其後執行 `pnpm run counts:check --from vitest-report.json`
- **FR-002**: 契約斷言以真正的 YAML 解析比對 `test` job 的**完整步驟清單**（含 `uses:` 動作、去版號；依序、封閉集合），另加三條：多行腳本不得內含套件管理器呼叫、閘門不得被中和（顯式 no-op 不誤紅）、`--from` 路徑須等於 `test:coverage` 寫出且真的會產出的路徑
- **FR-003**: `scripts/sync-counts.ts` 新增 `--from <file>`：讀既有報告、無隱式尋找、讀不到即 skip（`--check` 因 skip 而 exit 1）；**改寫模式拒絕 `--from`**（exit 1、不寫任何檔案）—— 沒有辦法證明一份被指名的報告是新的
- **FR-004**: 新增 REQ-TESTS-070 記載此機器強制；MODIFIED REQ-TESTS-059 的相關 bullet 指向它，讓「counts:check passes」不再是無執行者的宣稱
- **FR-005**: 貢獻者文件（CONTRIBUTING.md）與雙語 README 載明此指令與其 CI 角色

## Success Criteria

- **SC-001**: 13 個 mutation 各自轉紅（刪步驟／前移／`pnpm exec` 拼法／`uses:` 動作／`|| true`／`continue-on-error: true`／`if: false`／block scalar 內行首與**縮排**的套件管理器各一／windows-smoke 加 counts 步驟（單行、block 各一）／`test:coverage` 拿掉 `--reporter=json`／install 閘門被 continue-on-error 中和），6 個 false-red 防護維持綠（windows-smoke 的 counts 註解／動作版號升級／`continue-on-error: false`／`if: success()`／block scalar 內的 shell 註解與引號字串各一），控制組全綠
- **SC-002**: `pnpm typecheck`／`pnpm lint`／`pnpm test`／`pnpm counts:check` 全綠，`prospec check --strict` 無新增 FAIL
- **SC-003**: PR 的 CI `test` job 實際跑出 `counts:check` 步驟並通過（外部證據，於 PR 開啟後確認）

## Related Modules

- **tests**: 契約斷言的所在地（`tests/contract/ci-workflow.test.ts`）
- （非模組）`scripts/sync-counts.ts`：新增 `--from`；`.github/workflows/ci.yml`、`package.json`、`.gitignore`、雙語 README、CONTRIBUTING.md

## Open Questions

- 無 —— REQ 路由（ADDED 到 sdd-workflow）與變更名稱已由使用者裁決

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] TDD [MUST]：先寫會紅的契約斷言（此時 `ci.yml` 尚無該步驟）再改 workflow
- [x] Language Policy [MUST]：工件繁中；`**Spec:**` 與 workflow／測試內容英文
- [x] Atomic Commits [MUST]：workflow、測試、spec 同屬一個關注點
- [x] User-Facing Documentation [SHOULD]：`counts:check` 的用法在雙語 README 與 CONTRIBUTING.md 皆有記載，本變更改了它的呼叫方式與 CI 角色，三處同步更新

## UI Scope

**Scope:** none
