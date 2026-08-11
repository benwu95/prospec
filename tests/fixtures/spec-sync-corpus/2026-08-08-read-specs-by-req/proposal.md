# read-specs-by-req

## Background

`/prospec-verify` 的 Startup Loading item 7 與 `/prospec-archive` 的 Phase 3.5 step 1 目前以**整檔**為單位讀 feature spec，但兩站真正需要的只有「本變更觸及的 REQ」。六份 spec 已超出 `spec_per_file` 5,000 預算（`sdd-workflow` 54,074、`drift-detection` 28,845、`agent-integration` 20,755、`ai-knowledge` 16,968、`project-setup` 16,009、`feedback-promotion` 6,501，合計 143,152 tokens），而這一層的成長維度是**已歸檔變更數**，與變更大小無關。

issue #142 提案 1 落地後，`knowledge-size` 已把這六份標為 WARN，但它印出的唯一處置建議是 slice 分割 —— 一個尚不存在的機制。本變更做的是三道保護中的「按需載入」：先立 REQ 粒度的讀取介面，讓佈局分割（提案 2）之後成為介面背後的內部變更。

## User Stories

### US-1: REQ 粒度的 spec 讀取入口 [P1]

As a 跑 verify／archive 站的 prospec 使用者，
I want 用 REQ id 或 story 編號取出 feature spec 的對應片段，
So that 站點不必把整份 spec 載入 context 才能判斷本變更觸及的行為。

**Acceptance Scenarios:**

- WHEN 執行 `prospec spec show sdd-workflow --req REQ-CHNG-001,REQ-CHNG-004`，THEN stdout 只輸出這兩條 REQ 的原文區塊，並標出各自所屬的 US 標題路徑
- WHEN 執行 `prospec spec show sdd-workflow --story US-1`，THEN 輸出該 story 的敘事、Acceptance Scenarios 與其下所有 REQ 區塊
- WHEN 指定的 REQ id 或 story 在該 spec 中不存在，THEN 明確報出哪些選擇器無命中並以非零 exit code 結束（不靜默回傳空輸出）
- WHEN 同時給 `--req` 與 `--story`，THEN 輸出兩者的聯集，同一條 REQ 不重複輸出

**Independent Test:**
對 `sdd-workflow` 取 16 條 REQ，用 `lib/token-accounting` 的估算器量輸出 tokens 並與整檔 54,074 對比；不需要 verify／archive 參與。

### US-2: 兩站的讀取契約改走窄入口 [P1]

As a 跑一輪 standard／full 變更的開發者，
I want verify 的 Startup Loading 與 archive 的 Phase 3.5 只讀被觸及的 REQ，
So that 一輪變更的 spec 讀取成本與變更大小成正比，而不與已歸檔的歷史總量成正比。

**Acceptance Scenarios:**

- WHEN `/prospec-verify` 進站且 `scale` 非 quick，THEN item 7 指示以本變更 delta-spec 的 REQ 清單呼叫窄入口，而非讀 `specs/features/` 整個目錄
- WHEN `/prospec-archive` 做 Phase 3.5 的 graduation 判斷，THEN 只讀 CLI 回報為 synced 的那些 REQ，且該判斷能單靠窄入口的輸出完成
- WHEN 部署後的 SKILL.md 受 skill-format 契約測試檢查，THEN 兩站的新讀取指示各有對應斷言（避免模板改了而契約沉默）

**Independent Test:**
對本變更自身跑 `prospec archive --dry-run`，確認 Phase 3.5 需要讀的 REQ 集合可完全由窄入口取得。

### US-3: REQ 索引只有一份實作 [P2]

As a 維護 prospec 的開發者，
I want drift 的 `req-references` collector 與窄讀入口共用同一份 REQ 索引，
So that spec 的 REQ 解析不會出現第二套實作而在未來各自漂移。

**Acceptance Scenarios:**

- WHEN `req-references` collector 需要列舉某份 spec 的 REQ id，THEN 它呼叫與窄入口相同的索引函式（建立在 `matchReqHeading` 之上的單一 indexer）
- WHEN REQ heading 的形狀被修改，THEN 只需改一處即可讓兩個消費者同時跟上，既有 `req-references` 測試維持通過
- WHEN spec 內出現重複的 REQ id，THEN 索引以明確錯誤回報，兩個消費者得到同一個判斷

**Independent Test:**
grep 全庫確認 REQ heading 列舉只有一處實作；對重複 id 的 fixture 斷言兩個消費者行為一致。

## Edge Cases

- 目標 feature spec 不存在：報出可用 feature 清單，非零 exit code
- REQ 位於 `## Deprecated Requirements` 區：仍可取出，輸出標記其已淘汰狀態
- `--story` 命中重複的 US 編號（`sdd-workflow` 歷史上出現過）：全部輸出並警告存在重複
- 命中的 REQ body 含 code fence：輸出不得破壞 fence 配對
- `scale: quick` 無 delta-spec：verify 本就跳過 spec 比對，新契約不得把窄入口變成該路徑的硬需求
- spec 之後被 slice 分割（提案 2）：入口的參數形狀不因檔案佈局改變而變

## Functional Requirements

- **FR-001**: 提供以 REQ id 為單位的 feature spec 片段讀取（`--req`，接受逗號分隔多值）
- **FR-002**: 提供以 story 為單位的讀取（`--story`），輸出含 story 敘事與其下所有 REQ
- **FR-003**: 未命中的選擇器以明確錯誤與非零 exit code 回報
- **FR-004**: 輸出為 stdout 的原文 markdown 片段，保留原始區塊內容與 fence 完整性，並標出所屬 US 路徑
- **FR-005**: MCP 的 `spec://feature/{name}` 支援同語意的 REQ／story 過濾
- **FR-006**: verify Startup Loading item 7 改為以本變更的 REQ 清單呼叫窄入口
- **FR-007**: archive Phase 3.5 的 graduation 判斷改為只讀 synced REQ
- **FR-008**: drift `req-references` collector 與窄入口共用單一 REQ 索引實作
- **FR-009**: 重複 REQ id 由索引以錯誤回報，兩個消費者行為一致

## Success Criteria

- **SC-001**: `prospec spec show sdd-workflow --req <16 條>` 的輸出 tokens（`lib/token-accounting`）低於整檔 54,074 的 10%
- **SC-002**: grep 全庫，REQ heading 列舉的實作只有一處
- **SC-003**: skill-format 契約測試對兩站的新讀取指示各有斷言，且刪掉指示會讓測試變紅（以 mutation 驗證，非只看綠燈）
- **SC-004**: `prospec check` 的 `req-references` 在本變更前後同為 PASS（行為不變，只換實作來源）
- **SC-005**: 新增程式碼有單元＋契約測試，`pnpm test` 全綠、coverage ≥ 80%
- **SC-006**: 除 archive graduation 追加的新 REQ 外，既有 REQ id 與 `prospec/specs/features/` 的檔案佈局零變動

## Related Modules

- **lib**: REQ 索引（建立在 `spec-headings.ts` 之上）與 `drift-sources.ts` 的 `req-references` collector
- **services**: 新的 spec 窄讀服務，以及 MCP resource 的過濾參數
- **cli**: `spec show` 命令與 formatter（薄層，無邏輯）
- **templates**: `prospec-verify.hbs`／`prospec-archive.hbs` 的讀取契約
- **tests**: 單元、契約（skill-format）、integration 三層
- **types**: 若窄讀結果需要跨層契約型別

## Open Questions

- [ ] **NEEDS CLARIFICATION**: `--change <name>` 自動從 delta-spec 推導 REQ 集合是否留到後續變更（本輪已決定先做正交的 `--req`／`--story`）
- [ ] **NEEDS CLARIFICATION**: 窄入口的片段輸出是否納入 `knowledge-size` 量測面（片段無檔案身分，逐檔預算可能不適用）

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [ ] 無違反項，但有四條落地約束：**One-way Dependency Direction** —— 索引住 `lib`、服務住 `services`、命令住 `cli`，不得反向；**Test-Driven Development** —— 測試先行且 coverage ≥ 80%；**User-Facing Documentation** —— 新增 CLI 命令須同步 `README.md` 與 `README.zh-TW.md`；**Factual Count Integrity** —— 新增測試與命令數須以 `pnpm counts` 重導，不得手改。

## UI Scope

**Scope:** none

## Notes

- issue #142 提案 4（進度列表 D）。使用者已裁定 B～E 全做，本輪先做 D：介面先於佈局，B（feature spec slice 分割）之後成為介面背後的內部變更。
