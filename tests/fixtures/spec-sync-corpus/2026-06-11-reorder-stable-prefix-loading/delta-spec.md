# Delta Spec: reorder-stable-prefix-loading

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)

## ADDED

### REQ-TEMPLATES-080: Startup Loading 靜態優先排序與標注

**Feature:** agent-integration
**Story:** US-1

**Description:**
13 個 skill 模板的 Startup Loading 重排為靜態優先：`[STABLE]`（references 格式規格、Constitution、_conventions——僅 sync/治理變更時動）→ cache boundary → `[DYNAMIC]`（_index、模組 README、metadata、前序 artifacts——每次觸發或每 change 變動）。每個載入項標注其中一種，無第三態。

**Acceptance Criteria:**
1. 13 個模板的 Startup Loading 每個編號項帶 `[STABLE]` 或 `[DYNAMIC]` 標注（grep 計數）
2. 每個模板內最後一個 STABLE 項位於第一個 DYNAMIC 項之前（contract test 驗證）
3. 文件含排序判準與 boundary 原理章節（動＝每次觸發變、靜＝僅 sync 時變；含 Available Skills 判定 STABLE 的理由）
4. contract order 斷言 section-scoped 且經 mutation 驗證（換序/刪標注必轉紅）

**Priority:** High

---

### REQ-TEMPLATES-081: 載入項集合不變性

**Feature:** agent-integration
**Story:** US-1

**Description:**
重排只改順序與標注，不增刪任何載入項、不改載入語意；步驟描述中的編號交叉引用同步修正；MANDATORY 標記保留。

**Acceptance Criteria:**
1. 每個模板重排前後的載入項 link/path 集合一致（contract test 比對）
2. 既有 MANDATORY 載入標記全數保留（grep 計數不變）
3. 全套既有測試維持綠燈

**Priority:** High

---

### REQ-TEMPLATES-082: entry config Layer 0 穩定性檢查與部署同步

**Feature:** agent-integration
**Story:** US-1

**Description:**
entry config（CLAUDE.md / AGENTS.md 模板）的 Layer 0 內容不含每次觸發變動的值；Available Skills 區段為每專案固定、判定 `[STABLE]`。重排後執行 `prospec agent sync`，13 個已部署 SKILL.md 與模板一致。

**Acceptance Criteria:**
1. entry.md.hbs 渲染產物中無 per-trigger 變動值（檢查記錄於 change notes）
2. `prospec agent sync` 後，部署的 SKILL.md 與模板渲染產物 diff 乾淨

**Priority:** Medium

---

### REQ-MEASURE-008: 重排效益的 before/after 對照程序

**Feature:** token-measurement
**Story:** US-2

**Description:**
以 Story A harness 在重排前後快照各量測一次（同 corpus、同 provider/model），產出快照識別可區分的兩份報告；before 快照 hash 於重排 commit 前記錄（必晚於 harness 合併點），無 API key 時程序與 hash 留檔、事後 checkout 補量。

**Acceptance Criteria:**
1. before 快照 commit hash 記錄於 change notes，且晚於 harness 合併 commit
2. （有 key 環境）before/after 兩份報告存在、git_commit 欄位不同、provider 與 model 相同
3. 對照記錄僅引用報告數字，無任何門檻判定；無改善亦如實呈現

**Priority:** High

---

### REQ-MEASURE-009: glossary 組裝變體與成本對照

**Feature:** token-measurement
**Story:** US-3

**Description:**
harness 的 prospec 組裝增加 opt-in 變體：啟用時於 STABLE 段尾附加 `_glossary.md`。runner 提供 `--prospec-glossary` 旗標，啟用時報告另存避免覆蓋。對照量測呈現 glossary 的 input-token 成本面；反事實去重收益歸因列為 deliberate exclusion（對照組無法誠實構造），措辭明示量測範圍。

**Acceptance Criteria:**
1. 變體預設關閉，既有量測行為與報告不受影響（既有 harness 測試全綠）
2. 啟用旗標時，prospec 組裝含 `_glossary.md` 且報告另存（兩組數字可區分比對）
3. 對照記錄明示條件（同 corpus、同快照、同 provider）與範圍限定（成本面，非反事實收益）

**Priority:** Medium

---

## MODIFIED

_No modifications in this change._

## REMOVED

_No removals in this change._
