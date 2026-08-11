# preserve-agent-config-edits

## Background

`prospec agent sync` 透過 `agent-sync.service` 的 `generateEntryConfig` 對 `CLAUDE.md` / `AGENTS.md` 做無條件 `atomicWrite`，使用者手寫的自訂指示在每次 `agent sync`（以及呼叫它的 `quickstart`、`upgrade`）都被整檔覆蓋。`prospec init` 則對既有 `AGENTS.md` 一律 skip-if-exists（REQ-SETUP-018），既有內容既不被遷移、prospec 內容也寫不進去。AI Knowledge 的 `_index.md` 早已用 `prospec:auto` / `prospec:user` 區塊契約解決同類問題；本變更把同一契約套到 agent entry config，讓使用者編輯能跨指令存活。

## User Stories

### US-1: agent sync 保留使用者手寫內容 [P1]

As a 在 agent 設定檔維護自訂指示的開發者,
I want `prospec agent sync` 只重生由 prospec 管理的區塊、保留我手寫的部分,
So that `agent sync` / `quickstart` / `upgrade` 不再摧毀我的自訂內容。

**Acceptance Scenarios:**

- WHEN `agent sync` 寫入的 `CLAUDE.md` / `AGENTS.md` 不含 prospec 區塊標記且有既有內容, THEN 既有內容整段遷入 user 區塊、prospec 內容填入 auto 區塊，無任何內容遺失
- WHEN 目標檔已含 `auto`/`user` 區塊, THEN 只有 auto 區塊被重生，user 區塊逐位元保留
- WHEN `agent sync` 連續執行兩次, THEN 第二次輸出與第一次 byte-identical（idempotent）

**Independent Test:**
在臨時目錄放一份含手寫內容、無標記的 `CLAUDE.md`，跑 `agent sync` 後斷言原內容出現在 user 區塊、auto 區塊為 prospec entry config；再跑一次斷言 byte 不變。

### US-2: init 遷移既有 AGENTS.md 而非略過 [P1]

As a 在已有 `AGENTS.md` 的 brownfield 專案執行 `prospec init` 的開發者,
I want init 把既有內容遷入 user 區塊、把 prospec 內容寫進 auto 區塊,
So that 初始化不再對既有 `AGENTS.md` 無所作為，而是合併保留。

**Acceptance Scenarios:**

- WHEN init 執行且 `AGENTS.md` 已存在且為無標記內容, THEN 既有內容移入 user 區塊、prospec stub 填入 auto 區塊
- WHEN init 執行且 `AGENTS.md` 不存在, THEN 建立檔案，auto 區塊為 prospec stub、user 區塊為空 placeholder
- WHEN init 之後接著跑 `agent sync`（quickstart 流程）, THEN init 寫入/遷移的 user 區塊在 sync 後完整保留（auto 區塊被換成完整 entry config）

**Independent Test:**
在臨時目錄放一份既有 `AGENTS.md`，跑 init 斷言內容落在 user 區塊；另一臨時目錄無 `AGENTS.md`，跑 init 斷言 auto 含 stub、user 為空；接著跑 sync 斷言 user 區塊不變。

## Edge Cases

- 既有檔含 `auto-start/end` 標記但缺 user 標記（半損壞）：以「就地取代 auto 區塊、保留其餘一切」為準，不丟失內容
- 既有檔為空字串或僅空白：視為無既有內容，auto 填 prospec 內容、user 為空 placeholder
- trust-zone 檔（`CONSTITUTION.md` / `_conventions.md` / `_index.md`）不受影響，維持 blanket skip-if-exists（REQ-SETUP-018 對這些檔的行為不變）
- `upgrade` 重跑 `agent sync`：等同 US-1，user 區塊保留
- user 區塊內若含 prospec marker 字面字串：合併必須以穩健的區塊邊界辨識，不得誤判（見 Open Questions）

## Functional Requirements

- **FR-001**: `agent sync` 產生 entry config 時改採區塊合併：目標檔已有區塊則只重生 auto、保留 user
- **FR-002**: 目標檔無區塊但有既有內容時，`agent sync` 與 `init` 一律把既有內容整段遷入 user 區塊、prospec 內容寫入 auto 區塊，**不得捨棄既有內容**
- **FR-003**: `init` 對 `AGENTS.md` 改用上述合併行為（取代原本的 blanket skip-if-exists）；trust-zone 檔維持 skip-if-exists 不變
- **FR-004**: `entry.md.hbs` 與 `init/agents.md.hbs` 的模板輸出皆包覆於 `<!-- prospec:auto-start/end -->`，其後附空的 `<!-- prospec:user-start/end -->` 區塊
- **FR-005**: 重複執行 `agent sync`、以及 `init → agent sync` 皆產生 byte-identical 的穩定結果
- **FR-006**: 區塊合併邏輯實作為 lib 層純函式，由 services 呼叫，遵守 `cli → services → lib → types` 依賴方向

## Success Criteria

- **SC-001**: 對含手寫內容（無標記）的 `CLAUDE.md` 跑 `agent sync` 後，原內容 100% 落在 user 區塊內，auto 區塊為 prospec entry config
- **SC-002**: 對含自訂 user 區塊的檔跑 `agent sync` 兩次，user 區塊 byte 不變且兩次輸出 byte-identical
- **SC-003**: init 對既有 `AGENTS.md` 執行後既有內容在 user 區塊；對缺檔執行後 auto 為 stub、user 為空 placeholder
- **SC-004**: trust-zone 檔在本變更前後行為零差異（既有 init 相關測試仍綠）
- **SC-005**: 變更測試覆蓋率 ≥ 80%；lib 合併函式單元測試涵蓋三條路徑（有標記 / 無標記有內容 / 空）

## Related Modules

- **lib**: 新增 managed-doc 區塊合併純函式，沿用 `content-merger` 既有 marker 契約常數
- **services**: `init.service` 與 `agent-sync.service` 改走區塊合併寫入路徑
- **templates**: `agent-configs/entry.md.hbs` 與 `init/agents.md.hbs` 加入 `auto`/`user` 區塊標記

## Open Questions

- [ ] **NEEDS CLARIFICATION**: user 區塊內含 prospec marker 字面字串時的穩健解析策略（以最外層配對 / 就地 regex 取代 auto 區塊）—— 於 plan 階段定案
- [ ] **設計決策（已採）**: init 的 `AGENTS.md` auto 區塊保留輕量 stub，後續 `agent sync` 再換成完整 entry config（最小變更、行為一致）

## Constitution Check

- [x] 已對照 `prospec/CONSTITUTION.md`
- [x] Language Policy [MUST]：本提案以 Traditional Chinese (Taiwan) 撰寫，技術詞保留英文 → PASS
- [x] User Stories Follow INVEST [MUST]：兩則 P1 故事皆 Independent/Testable，各含 ≥ 3 個 WHEN/THEN → PASS
- [x] Test-Driven Development [MUST]：FR-005/SC-005 承諾 TDD 與 ≥ 80% 覆蓋 → PASS（承諾，implement 落實）
- [x] One-way Dependency Direction [SHOULD]：合併純函式置於 lib、由 services 呼叫，方向不變 → PASS
- [x] User-Facing Documentation Stays Current [SHOULD]：本變更改動 `init`/`agent sync` 對 agent 設定檔的寫入行為，implement 階段需評估 root `README.md` 是否需補述 → WARN（implement 處理）
