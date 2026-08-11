# unify-line-splitting

## Background

本 repo 有一族缺陷：`$` 錨定的 per-line regex 配上 `split('\n')` 的行來源 —— `\r` 在 JS regex 裡是 line terminator，`.` 吃不到它，不帶 `m` 旗標的 `$` 只錨定字串結尾，於是 CRLF checkout 下整條 pattern 不命中。issue #138 在 `readSpecCounters` 修掉一站，PR #143 在 `withoutFencedBlocks` 修掉另一站，但**家族掃描沒做**（issue #140 原驗收條件第 5 項）。

實測還有兩個活的缺陷：`src/lib/task-markers.ts:17` 的 `CHECKBOX` 在 CRLF 下對整份 tasks.md 回答「沒有任務」（四個呼叫端一致地錯：drift 引擎、`prospec status`、change-progress、archive task stats），`src/lib/lessons-ledger.ts:266` 的 heading regex 讓 `expiredPlaybookEntries` 永遠回傳空陣列（`/prospec-learn` 的 Staleness Sweep 恆報「無條目到期」）。Windows checkout 拿到的就是 CRLF（Git for Windows 安裝程式設 `core.autocrlf=true`；git 自己的內建預設是 `false`），而本 repo 無 `.gitattributes` 把行尾扳回 LF。

兩個測試檔（`task-markers.test.ts`、`lessons-ledger.test.ts`）的 `\r` 斷言數皆為 0，issue #101 的 windows-smoke job 也刻意收窄成兩個單元測試檔，所以這一族至今沒有任何自動化在看。

## User Stories

### US-1: tasks.md 的任務解析與行尾無關 [P1]

As a 在 Windows（或任何 CRLF checkout）上跑 prospec 的使用者，
I want `tasks.md` 的每一行任務都被解析出來，不因行尾是 CRLF 而消失，
So that `prospec status` 的路由、drift 引擎的 task facts、archive 的 task stats 不會一致地把「有任務」讀成「沒有任務」。

**Acceptance Scenarios:**

- WHEN 同一份 tasks.md 分別以 LF 與 CRLF 餵入 `parseTaskLine`，THEN 兩者解析出的任務數、`checked` 與 `kind` 逐項相等
- WHEN CRLF 的 tasks.md 經 `prospec status` 讀取，THEN code task 數與 LF 版相同（不再是 0）
- WHEN CRLF 的 tasks.md 經 archive 的 task stats 統計，THEN completed/total 與 LF 版相同
- WHEN 行中間（非行尾）含 `\r`，THEN primitive 只剝行尾那一個、該字元原樣保留；task 文法對這種行的判定不因本變更改變

**Independent Test:** 對 `parseTaskLine` 與其四個呼叫端各下一組 LF／CRLF 差分斷言，同一份內容兩種行尾結果必須相等。

### US-2: playbook TTL sweep 在 CRLF 下仍報出到期條目 [P1]

As a 執行 `/prospec-learn` 的維護者，
I want `expiredPlaybookEntries` 在 CRLF 的 `_playbook.md` 上照樣列出 TTL 到期的條目，
So that Staleness Sweep 的「無條目到期」是事實，而不是 heading regex 不命中造成的靜默 fail-open。

**Acceptance Scenarios:**

- WHEN 同一份 playbook 內容分別以 LF 與 CRLF 餵入 `expiredPlaybookEntries`，THEN 回傳的到期清單（條目名稱與 review-by 日期）逐項相等
- WHEN CRLF 的 playbook 條目帶 `- **RETIRED …**` 標記，THEN 它仍被排除在到期清單外（既有語意不因行尾改變）
- WHEN CRLF 的 playbook 條目帶 `- **Retired …, UN-RETIRED …**`，THEN 它仍被視為活條目並參與 TTL 判斷

**Independent Test:** 以同一份 fixture 的兩種行尾呼叫 `expiredPlaybookEntries`，比對回傳陣列。

### US-3: 行尾容忍收斂成單一具名 primitive [P1]

As a 日後在此 repo 新增 per-line 解析的開發者，
I want 一個具名的 primitive（比對前剝掉行尾 `\r`，回傳的原行不變）作為這條規則的唯一實作，
So that 我寫的 `$` 錨定 pattern 不需要各自記得補 `\r?` —— 那是目前的做法，而每一次都是一次擲骰。

**Acceptance Scenarios:**

- WHEN per-line 比對需要移除行尾 `\r`，THEN 它呼叫該 primitive，而不是各自再寫一次那個剝除（`src/` 原有 6 份剝除表達式散在 4 個檔案、共 11 個呼叫點，全部收斂）；反之，本身已容忍（自己的 `\r?`／字元類，或上游 `.trim()`）、把 `\r` 擷取起來回寫、`m` 旗標下的多行 pattern、以及只供比對的整檔 `\r\n`→`\n` 正規化，都不需要自己的實作，不在此規則範圍內
- WHEN `src/` 現有的 `split('\n')` 站點被逐一裁決，THEN 每一處都在 plan 的裁決表裡有歸類與理由，包含「不得改動」的位元組保真站點
- WHEN 把該 primitive 的 `\r` 剝除拿掉（mutation），THEN US-1／US-2 的差分斷言轉紅

**Independent Test:** `rg "split\('\\\\n'\)" src/` 的 46 個命中，扣掉 `src/lib/text-lines.ts` 檔頭註解裡引用該表達式的那一個，其餘 45 個都落在 plan 裁決表的某一類，且該表與實際碼一致。

## Edge Cases

- **混合行尾**（同一份檔案部分 CRLF、部分 LF）：逐行判斷，每行各自剝掉自己的 `\r`；不做全檔行尾偵測
- **lone `\r`（舊 Mac 行尾）**：明確不支援 —— `split` 不以 `\r` 斷行，整檔會被視為一行，與現況相同（不在本變更範圍）
- **行中間的 `\r`**：只剝行尾那一個，行內的 `\r` 原樣保留（避免改動任務文字或條目名稱的內容）
- **空檔／只有空行**：解析結果為空，與 LF 版一致，不得拋錯
- **`\r` 出現在 fenced block 內**：`withoutFencedBlocks` 既有語意是「遮罩後回傳原行（含 `\r`）」，本變更不改它，只保證下游拿到的行來源已剝 `\r`

## Functional Requirements

- **FR-001**: 提供一個具名的 primitive，剝掉單行尾端的 `\r`，作為「per-line 比對前先剝 `\r`」這條規則的唯一實作
- **FR-002**: `parseTaskLine` 對 CRLF 行的解析結果與 LF 行相同（含 `checked`、`kind`、`text`）
- **FR-003**: 修復落在 `parseTaskLine` 內部，四個呼叫端（`drift-sources`、`status.service`、`change-progress.service`、`archive.service`）無須改動即繼承；行來源仍餵原行，任何回寫路徑不得改寫既有行尾
- **FR-004**: `expiredPlaybookEntries` 對 CRLF 的 playbook 回傳與 LF 相同的到期清單，且 RETIRED／UN-RETIRED 語意不變
- **FR-005**: `src/` 現有的 `split('\n')` 站點逐一裁決並分類（改走 primitive／位元組保真不得改動／本就容忍／不做比對），裁決表落在 plan.md
- **FR-006**: 上述行為以 LF／CRLF 差分測試釘住，並以 mutation 驗證（拿掉 `\r` 容忍必須轉紅）

## Success Criteria

- **SC-001**: `parseTaskLine`／`expiredPlaybookEntries` 的 LF/CRLF 差分測試存在且通過；把 helper 的 `\r` 剝除拿掉後，這些測試轉紅（mutation 實測記錄在 verify）
- **SC-002**: 一份 CRLF 的變更工件跑 `prospec status`／`prospec check`，結論與 LF 版一致（端到端）
- **SC-003**: plan.md 的裁決表涵蓋 `src/` 全部 `split('\n')` 命中（撰寫時為 45 處）並逐一分類，無遺漏且與實際碼一致
- **SC-005**: CRLF 的 tasks.md 經 `prospec change progress --complete` 後，除被勾選的那一行外每一行的行尾位元組不變（回寫不得把 CRLF 洗成 LF）
- **SC-004**: `pnpm lint`／`typecheck`／`test:coverage`／`counts:check`／`agents:check`／`prospec check --strict` 全數 exit 0

## Related Modules

- **lib**: `task-markers.ts`、`lessons-ledger.ts` 的缺陷本體，以及新 helper 的落點（`prospec/index.md` 關鍵字 `task-markers`、`lessons-ledger`、`markdown-table`）
- **services**: `status.service.ts`、`change-progress.service.ts`、`archive.service.ts` 的行來源
- **tests**: 差分斷言、契約測試與 mutation 驗證的落點

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] TDD：先寫 CRLF 差分測試（RED），再改 helper（GREEN）
- [x] Language Policy：變更工件繁中、`**Spec:**` 與程式碼／commit 英文
- [x] Dependency direction：helper 落在 `lib`，`services` 單向引用，無上引
- [x] No violations identified

## UI Scope

**Scope:** none
