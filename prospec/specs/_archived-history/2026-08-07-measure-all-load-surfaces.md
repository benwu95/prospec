# measure-all-load-surfaces

> Archived 2026-08-07 · scale `standard` · commit `6798001`
> 對應 issue #142 提案 1；完整涵蓋 issue #135

## What Changed

`knowledge-size` 過去只量兩個載入面 —— `index.md` ＋ 四份 core convention（L1）與 module README／sub-module（L2），合計 20,796 tokens。真正支配載入成本的檔案完全沒有訊號：10 份 feature spec 共 144,691 tokens（`sdd-workflow.md` 單檔 48,422，是 L1 逐檔預算的 19 倍）、治理知識檔 24,902、部署的 18 份 SKILL.md 共 69,953。**唯一被保護的那一層，是最小的一塊。**

本變更把量測面擴到六個，各有自己的門檻：

| kind | 涵蓋 | shipped default | 推導 |
|---|---|---|---|
| `l1` | index.md ＋ core conventions | 1,800 | #64 校準 |
| `l2` | module README ＋ sub-module | 1,000／100 行 | #64 校準 |
| `spec` | `specs/features/**` ＋ `product.md` | 5,000 | 5×L2 —— 一站載入一兩份 spec 加自身指令，該與整個 L1 層同數量級 |
| `demand-knowledge` | load-on-demand conventions | 10,000 | issue #119 手動察覺壓縮點 ~17.7k 的六成，讓訊號先於人工發現 |
| `skill` | 已部署 `SKILL.md` | 5,000 | 同 spec |
| `reference` | 已部署 references | 2,500 | skill 的一半 —— 單一 phase 的按需載入 |

`skill`／`reference` 僅在 authoring mode（專案持有 `src/templates/skills/`）量測：純消費 prospec 的下游專案對這種 finding 無法行動，而「無法行動的 WARN」正是 issue #135 明文反對的。

核心機制是 `KNOWLEDGE_SIZE_RULES` —— 一張以 `satisfies` 對 `KnowledgeSizeKind` 窮盡的登記表，綁定 kind → 預算欄位、finding 標籤、**具名收斂路徑**。新增 kind 而忘記給門檻是編譯錯誤，不是靜默不檢查。

## Effect

`prospec check` 的 `knowledge-size` finding 由 2 增為 16：Feature Spec 6、skill 3、reference 4、demand-knowledge 1、L1 1、L2 1。其餘 14 個 check 判定不變。每則 finding 帶該載入面的收斂路徑，例如 ledger 那則直接指向 `/prospec-learn` 的 Staleness Sweep —— 這是 issue #135 的第一條驗收條件。

**本變更只讓問題現形，不改變任何既有行為。** 收斂手段（feature spec 的 slice 分割）是 issue #142 提案 2 的獨立變更。

## Review & Verify

**Verify grade A**（`status: verified`）。機器帳：1/5 task-completion PASS · 4/5 knowledge-health WARN · 5/5 test-provenance PASS。判斷帳：2/5 delta-spec compliance WARN（fresh context）· 3/5 Constitution PASS（7/7 規則逐條附證據）· 6 design not-applicable（`ui_scope: none`）。S 不可達的原因是 4/5 的機器 WARN；兩個 WARN 在 A 的預算內（≤2），無 FAIL。

**Review 七輪，26 個 critical 全部修復，25 個 major。** 契約硬上限為 5 輪，第 6、7 輪經使用者裁定超契約執行，各再抓到 2 個 critical。成因分佈：

| 輪 | critical | 成因 |
|---|---|---|
| 1 | 4 | 原始實作 |
| 2 | 4 | **全部**由 round 1 的修復引入 |
| 3 | 5 | 兩個由前輪修復、兩個規格未同步 |
| 4 | 6 | 一個真迴歸（需**退回** round 3 的修復）＋四個規格不同步 |
| 5 | 3 | 零新程式缺陷，全為規格／文件同步 |
| 6 | 2 | 皆為 round 5 修復的殘留 |
| 7 | 2 | 由 verify 2/5 的 FAIL 觸發 |

Finding 數直到第 4 輪都在上升，第 5 輪才首次零程式缺陷。

代表性的 critical：部署到每份 SKILL.md 的預算表對 feature spec 講了 5 倍錯的數字；`filterConventions` 漏傳 `additional_core_conventions`，使專案宣告為 L1 的檔案改吃 10,000 門檻（實測 `_playbook.md` 9,552 tokens 零 finding）；skill references 走訪會 throw，而 collector 是 `runChecks(...)` 的引數，一個目錄型別不對即讓全部 15 項 verdict 消失（於 parent commit 與本 commit 上實測對照）；`buildIndexTemplateContext` 從未注入預算，使每個 CLI 產生的 `index.md` 都渲染成 `≤  tokens per file`。

**verify 2/5 抓到六輪 review 全數漏掉的一類問題**：`src/templates/init/prospec.yaml.hbs` 沒有任何 production 消費者（`prospec init` 走 `writeConfig`，從不 render 它），因此 REQ-TEMPLATES-149 自 #64 起就在斷言一件不成立的事。review 問「哪裡可能錯」，該檔案內容完全正確；verify 對照契約問「這條 REQ 宣稱的行為實跑起來是否為真」，才會發現「沒有人讀它」。

一個經實測**拒絕**的 finding：審查者宣稱新的 key-set 相等測試只擋單向，實測反方向變異同樣變紅 —— 該 agent 的變異未落到檔案上。

## Deliberately Left

- `prospec-knowledge-generate` 5,092 > 5,000：修正那張假預算表必須讓表格多三列，而該 skill 原本已在 4,923 貼著上限。新增散文已壓到最短，剩餘 92 token 是修正假宣稱的必要代價。收斂手段（把 phase 專屬散文抽成 on-demand reference）屬 issue #142 §E 的獨立工作。
- 既有缺陷（parent commit 亦然，本變更範圍外）：`markdownRoots` 下的 EACCES 目錄會由 `collectMarkdownLinks` 的 `scanDirSync` 拖垮整個 `prospec check`；`specs/features` 為檔案時由 `collectReqDefinitions` 的裸 `readdirSync` 拖垮。本變更只硬化了 `collectKnowledgeSize` 自己擁有的形狀。
- `src/templates/init/prospec.yaml.hbs` 是死樣板（無 production 消費者）—— 已在 REQ-TEMPLATES-149 明載現況，修復屬獨立變更。

## Requirements

ADDED：REQ-TYPES-077（`KNOWLEDGE_SIZE_RULES` 登記表）、REQ-LIB-044（index.md 的 template context 帶 resolved budget）
MODIFIED：REQ-TYPES-061、REQ-LIB-027、REQ-LIB-028、REQ-SERVICES-065、REQ-TEMPLATES-149、REQ-TESTS-048、REQ-KNOW-013、REQ-KNOW-035、REQ-AGNT-035

Feature Specs：`drift-detection.md`、`ai-knowledge.md`、`agent-integration.md`

## Tasks

26/26（code 18／manual 5／verification 3）。閘門：`pnpm typecheck`、`pnpm lint`、3,289 tests、`pnpm counts:check` 全綠。

## Lessons（五個會讓綠燈說謊的陷阱，本輪各踩一次）

1. 改 `.hbs` 只跑 `pnpm bundle` 不跑 `pnpm build` → e2e spawn 的是舊 `dist`，全綠是假的。
2. 變異 harness 用了 vitest 4 已移除的 `--reporter=basic` → 整個 run 在載入 reporter 時失敗，7 個變異全報「0 killed」。**變異前必須 grep 斷言變異真的落地。**
3. `describe.each` 從被測的 `rule.tokenKey` 推導預期值＝恆真式 → 綁錯預算欄位時 2,373 個測試無一變紅。
4. `**Spec:**` 整段取代信任區 REQ body → 漏抄的 `WHEN/THEN` 永久消失且不報錯（round 4、5、6 各發生一次）。
5. 主 agent 在 subagent 執行期間 `pnpm build` → 污染其建置並害它逾時，還讓我誤把 82 個測試失敗歸因為「負載下 flaky」。
