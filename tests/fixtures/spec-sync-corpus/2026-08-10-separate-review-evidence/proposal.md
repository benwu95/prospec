# separate-review-evidence

## Background

issue #142 量到一輪 standard 變更的 context 固定地板是 92k tokens，並列出五個收斂方向；本變更做的是其中的提案 5（進度列表 E，最後一項）。

問題的形狀：`/prospec-review` 要求 fresh-context reviewer、`/prospec-verify` 2/5 與 6 要求 fresh-context grader。委派省下的是**搜尋**成本（subagent 自己讀檔），但**結果**會整份回到主 context —— 每份 finding 都帶著長篇 evidence 散文，而那些散文的用途主要是「auto-fix 前當場核實這個 finding 真的存在」。核實完之後，主 context 只需要結論與一條可重跑的指令。

同時，evidence 目前**沒有任何落地處**：`review.md` 的表格只有一行 Summary，verify 的 judgment evidence 只存在於 chat 報告裡。所以現況是最壞的組合 —— evidence 全文佔滿主 context，卻在工件裡完全沒留下。

## User Stories

### US-1: 用可重跑的指令取代 evidence 散文做存在性核實 [P1]

As a 跑 `/prospec-review` 的開發者，
I want reviewer 與 verifier 回傳的 finding 帶一條可重跑的重演指令，而 evidence 全文留在檔案裡，
So that 主 context 在 auto-fix 前能靠**執行**那條指令核實 finding 存在，不必先把散文讀進來。

**Acceptance Scenarios:**

- WHEN 一個 `critical` finding 沒有 `repro` 欄位，THEN `prospec review merge` 拒絕整輪並指名該 finding
- WHEN 一輪 merge 完成，THEN stdout 對每個 critical 印出 `id`／`location`／`severity`／`lens`／`summary`／`repro`，且整份 stdout 不含 evidence 全文

**Independent Test:**
準備一份含 evidence 全文的 findings JSON，跑 `prospec review merge`，比對 stdout 不含 evidence 字串但含 repro 指令。

### US-2: evidence 全文有 CLI 擁有的落地處 [P1]

As a 事後追查這輪 review 判斷依據的人，
I want evidence 全文由 CLI 寫進 `review.md`（judgment dimension 的則寫進 `verify.md`），
So that 工件保有完整證據，而主 context 不必承載它。

**Acceptance Scenarios:**

- WHEN findings 帶 `evidence`，THEN `review.md` 的 `## Evidence` 區段逐字包含該全文，並以 finding id 錨定
- WHEN 下一輪重報同一個 id 但不帶 `evidence`，THEN 既有全文仍在（carry-forward，不被清空）
- WHEN 這一輪沒有任何 finding 帶 `repro`／`evidence`，THEN `review.md` 不產生 `## Evidence` 區段

**Independent Test:**
兩輪 merge：第一輪帶 evidence、第二輪同 id 不帶，比對 `review.md` 兩次都含全文。

### US-3: relayable 欄位的上限是明文且機械執行的 [P1]

As a 定義 station I/O 契約的人，
I want 被回傳（relay）的欄位有一組明文上限常數，由 CLI 在寫檔前驗證，
So that 「evidence 不要塞進 summary」不是勸告，而是會 exit 非零的規則。

**Acceptance Scenarios:**

- WHEN 任一 relayed 欄位（`id`／`location`／`summary`／`repro`／`lens`）超過 `RELAYED_FIELD_MAX_CHARS` 的對應值，THEN CLI 拒絕並在訊息裡指名欄位、實際長度與上限
- WHEN `evidence` 長度任意，THEN 不受上限約束（它從不進 return payload）

**Independent Test:**
一份 `summary` 超限的 findings JSON 使 `prospec review merge` exit 非零；把該欄位縮短後同一份通過。

### US-4: verify 的 judgment grader 沿用同一組契約 [P2]

As a 跑 `/prospec-verify` 的開發者，
I want 2/5、3/5、6 的 verdict 與 evidence 走同一個檔案入口，evidence 落進 `verify.md`，
So that fresh-context grader 的回傳同樣只有 verdict 行與檔案路徑，兩站不會長出兩套契約。

**Acceptance Scenarios:**

- WHEN 以 `prospec verify record --dimensions <file>` 記錄，THEN `verify.md` 出現該次評等的 `## {date} — grade {G}` 區塊，內含三個 judgment dimension 的 evidence
- WHEN 同一次呼叫同時給 `--dimension` 與 `--dimensions`，THEN CLI 拒絕（兩種語法互斥）
- WHEN 用既有的 `--dimension name=result` 語法，THEN 行為與本變更前完全一致（不產生 `verify.md`）

**Independent Test:**
跑 `prospec verify record --dimensions <file>`，比對 `verify.md` 內容與 `metadata.yaml` `quality_log` 條目的欄位集合（後者不得出現 evidence）。

## Edge Cases

- **clean review（findings 為 `[]`）**：不產生 `## Evidence` 區段，`review.md` 與本變更前 byte-identical
- **evidence 內含 markdown 表格且表頭有 Location／Severity**：解析時先剝除 `## Evidence` 區段再定位 findings 表，故不會誤認成 findings 表
- **evidence 內含 evidence 區段的錨定標記**：`review merge` 在任何位元組落地前 refuse（refuse before writing，服務層既有規則）
- **legacy `review.md`（4 欄手寫表、無 id 的列）**：仍可解析並合併；evidence 需要 id 作為錨點，故「帶 evidence 或 repro 就必須帶 id」由 schema 強制
- **`scale: quick` 的 verify**（2/5 為 `not-applicable`）：dimensions JSON 仍須列出三個 judgment dimension，evidence 可缺；`verify.md` 只寫有 evidence 的區塊
- **同一天重跑 `verify record`**：`verify.md` 追加新區塊（與 `quality_log` 的 append 語意一致），不覆蓋前一次

## Functional Requirements

- **FR-001**: `types/station.ts` 新增 `RELAYED_FIELD_MAX_CHARS`（`id`／`location`／`summary`／`repro`／`lens` 五個上限 —— 凡是渲染在表格 cell 之外的欄位都在集合內；`id` 與 `lens` 是 review 抓到的漏網，兩者皆可被偽造）作為單一登記表；`ReviewFindingSchema` 新增 `repro`（可重跑的重演指令）與 `evidence`（全文，不受上限）
- **FR-002**: schema 強制兩條交叉規則 —— `severity: critical` 的 finding 必須帶 `repro`；帶 `repro` 或 `evidence` 的 finding 必須帶 `id`（evidence 區段以 id 錨定）
- **FR-003**: `lib/review-merge` 把 `repro`／`evidence` 納入 `ReviewRow`，解析既有 `## Evidence` 區段並跨輪 carry-forward；渲染順序由表格列序決定，使同一輪重跑輸出 byte-identical
- **FR-004**: `prospec review merge` 的輸出對本輪每個 critical 印出 bounded digest（`id`／`location`／`severity`／`lens`／`summary`／`repro`）與 `review.md` 路徑；evidence 全文不進 stdout
- **FR-005**: `prospec verify record` 新增 `--dimensions <file>`，承載三個 judgment dimension 的 `{name, result, summary?, repro?, evidence?}`；與既有 `--dimension` 互斥，上限沿用 FR-001 的同一組常數
- **FR-006**: `prospec verify record` 在給 `--dimensions` 時把 judgment evidence 追加進 `verify.md`；`quality_log` 條目的欄位集合不變（evidence 不進 `metadata.yaml`）
- **FR-007**: 新增共用 reference `delegated-evidence-format.md`，部署到 `prospec-review` 與 `prospec-verify` 兩站，載明 payload 契約、上限表與 evidence 落地格式
- **FR-008**: 兩份 SKILL.md 的委派段落改寫為「subagent 把 findings／dimensions JSON 寫檔，只回傳檔案路徑與計數／verdict 行；evidence 不進 return payload」，並新增對應的 NEVER 條目
- **FR-009**: 既有 `review.md`（6 欄表、無 Evidence 區段、無 id 的 legacy 列）仍可解析並合併 —— 向後相容

## Success Criteria

- **SC-001**: 超限的 relayable 欄位使 `prospec review merge` exit 非零，訊息指名欄位、實際長度與上限
- **SC-002**: 一輪帶 evidence 的 merge 後 `review.md` 逐字保有全文；第二輪同 id 不帶 evidence 時全文仍在
- **SC-003**: `prospec review merge` 的 stdout 對每個 critical 含 repro，且不含 evidence 全文
- **SC-004**: `prospec verify record --dimensions <file>` 後 `verify.md` 含三個 judgment dimension 的區塊，`quality_log` 條目欄位集合與本變更前一致
- **SC-005**: `pnpm test`／`typecheck`／`lint`／`counts:check`／`agents:check`／`prospec check --strict` 全綠；本變更新增的承載邏輯檔覆蓋率 ≥ 80%
- **SC-006**: 契約全文住在 on-demand reference 而非任一 SKILL.md 的 stable prefix（部署後 **2,136** tokens，仍在 reference 的 2,500 預算內）；兩份 SKILL.md 的漲幅實測 `prospec-review.hbs` **+288**（3,261 → 3,549）、`prospec-verify.hbs` **+245**（10,153 → 10,398），皆用 `lib/token-accounting` 的 `estimateTokens` 量測。**數字為 review 四輪之後的重新量測** —— 初次量測在修復把 Trust boundary 節與兩列上限加進 reference 之後即失效

  > **門檻是放寬的，不是達標的。** 本 SC 原訂 ≤ 200／檔，實測後放寬到 ≤ 300／檔。壓縮過一輪後仍超出 200 的部分是**無法搬進 reference 的契約文字**：兩條 NEVER（契約測試斷言在 SKILL.md 本體上，reference 承載不了）與 `verify record` 兩種輸入形式的旗標文法（站點指令的呼叫方式）。剩餘可壓縮的只有語意本身，所以這裡誠實記錄放寬，而不是靠削減契約買綠燈。

## Related Modules

- **types**: `station.ts` 的 `RELAYED_FIELD_MAX_CHARS`、`ReviewFindingSchema` 擴充與 judgment dimension 的輸入 schema
- **lib**: `review-merge.ts` 的 evidence 解析／carry-forward／渲染；`markdown-table.ts` 保持為唯一的表格引擎
- **services**: `review-merge.service.ts`（evidence 落地、refuse before writing）、`verify-record.service.ts`（`verify.md` 追加）
- **cli**: `review merge` 的 bounded digest 輸出、`verify record --dimensions` 旗標與輸出
- **templates**: 新 reference `delegated-evidence-format.hbs`、`prospec-review.hbs`／`prospec-verify.hbs` 的委派段落與 NEVER、`review-format.hbs` 的 evidence 區段格式
- **tests**: 單元（lib／services／cli）、契約（skill-format 的 reference 部署與 NEVER 條目）、E2E（兩個 station 指令的新旗標）

## Notes

- 本變更不關閉 issue #142（E 是最後一項，關閉由 issue 維護者決定）；PR body 用 `Refs #142`
- 使用者已裁決把 verify 2/5 grader 一併納入（US-4），故本變更同時新增 `verify.md` 這個工件面；`archive` 以 `readdir` 搬移整個 change 目錄，故無需改 archive
- `lib/review-merge` 的 identity 規則同時被 `review-format.hbs` 與 `prospec-review.hbs` 的 Persistence 段落複述（templates README 的 pitfall），本變更新增的欄位語意必須三處同步
