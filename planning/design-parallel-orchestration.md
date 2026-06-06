# 技術設計：安全並行分區 + Orchestration Handoff

> 對應 `future-directions-2026-h2.md` 方向 2（並行/子代理感知 SDD），落地 **BL-027（安全並行分區）** + **BL-028（Orchestration Handoff）**。
>
> 戰略定位：Prospec 不做 harness/runtime，而是產出**任何並行 harness 都能安全消費的執行計劃**——攜帶 vendor harness 拿不到的 payload（spec REQ + 驗收條件 + 模組知識 + 由 module-map 算出的無衝突檔案保留）。
>
> 建立日期：2026-06-06 ｜ 適用版本：Prospec v0.1.7+

---

## 一、問題定義

2026 H1 並行/非同步代理的**唯一公認未解問題**：多代理並行修改同一 codebase 時的 merge-conflict 與依賴同步（arXiv 2603.21489）。vendor 的 harness（Opus 4.8 Dynamic Workflows、Antigravity Dynamic Subagents、Cursor `/multitask`、Devin Local）**執行很強，但不知道**：

1. 哪些 task 改到同一個檔案（write-write 衝突）。
2. 哪些 task 有依賴方向（A 改了 interface，B 依賴它）。
3. 每個 task 對應哪條 spec REQ、驗收條件是什麼、要遵循哪個模組的慣例。

Prospec 持有解這題所需的全部資訊：`module-map.yaml`（模組↔檔案、依賴方向）、`delta-spec`（REQ↔Feature）、Knowledge（模組慣例）。**缺的只是把這些連起來、算出安全並行分區、輸出成 harness 能吃的格式。**

### 現況缺口（Explore 確認）

| 資產 | 現況 | 缺口 |
|---|---|---|
| `module-map.yaml` | schema 已定義（`src/types/module-map.ts`），含 `paths[]` + `relationships.depends_on/used_by` | 檔案尚未生成；tasks/implement 沒用它 |
| `tasks.md` | `- [ ] [P] desc ~N lines`，分層 Types→Lib→Services→CLI→Tests；`[P]` 僅 UI 提示 | **無 task→files/modules/depends_on 結構化 metadata** |
| `delta-spec.md` | `REQ-{MODULE}-{NNN}`，ADDED/MODIFIED/REMOVED，記 Feature/Story | spec-centric，**不記每 REQ 影響的檔案** |
| `prospec-implement` | 上到下循序、layer-sequenced、**從不跳過**；`[P]` 不自動並行 | 無 orchestration / 分區 / 合併協定 |

---

## 二、BL-027：安全並行分區

### 2.1 安全的定義

兩個 task 可安全並行，**當且僅當**三條全部成立：

1. **無資料依賴**：彼此不在對方的 `blocked_by` 傳遞閉包內。
2. **無寫寫衝突**：兩者的檔案保留（write set）不重疊（`reserves(A) ∩ reserves(B) = ∅`）。
3. **無依賴方向違反**：若 A 改動模組 M 的對外 interface，則任何 `depends_on: M` 的模組之 task 必須排在 A 之後（由 `module-map` 的 `relationships.depends_on` 推導；與 Constitution 的 `cli → services → lib → types` 單向依賴一致）。

> 設計原則：**保守優先**。不確定就不並行——誤判導致並行代理撞檔的代價，遠高於少並行幾條 task。

### 2.2 演算法（兩層）

```
輸入：
  tasks[]      — 每個帶 { id, modules[], reserves[] (write paths), reads[], blocked_by[], kind }
  module_map   — modules[].relationships.depends_on（模組依賴 DAG）

第一層：依賴排序（correctness）→ 產生「波次 waves」
  1. 建 task DAG，邊來自三個來源：
     a. 顯式 blocked_by
     b. layer 順序（Types 在 import 它的 Lib 之前…）
     c. 模組依賴：改 M interface 的 task → 阻擋 depends_on(M) 模組的 task
  2. 拓撲排序 → 分波：無未完成前驅的 task 同屬一波

第二層：波內無衝突分組（conflict avoidance）→ 產生「並行 lane」
  3. 波內，兩 task 衝突 iff reserves 交集非空（write∩write）
     （read∩write 視為軟衝突，保守也視為衝突）
  4. 以衝突關係建圖，取「彼此無邊」的獨立集 → 每個獨立集 = 一條可並行 lane
  5. lane 內 task 仍循序（共享保留或被刻意綁在一起者）

輸出：waves[ lanes[ tasks[] ] ]
```

### 2.3 檔案保留（File Reservation）— 硬約束

- 每個 task 宣告 `reserves: [write paths]`（必填）與 `reads: [paths]`（選填）。
- harness **不得**並行執行兩個 reserve 重疊的 task。這是硬約束，不是建議。
- **路徑不可預測時**（如「新建一個檔案，名稱待定」）→ 保守保留**整個模組目錄**（`module_map.paths[]`）→ 強制同模組 task 序列化 → 安全但較少並行。
- **熱點檔案偵測**：被多個 task 保留的共享檔（`config.ts`、barrel `index.ts`）→ 標記為高競爭，序列化 + 警告使用者。
- **測試與源碼綁定**：實作 `src/services/x.ts` 與其鏡像測試 `tests/.../x.test.ts` 視為同一保留集，不拆到不同 lane。

### 2.4 metadata 來源 — 誰填、填在哪

關鍵設計取捨：**保持 `tasks.md` 人類優先、乾淨**（呼應 Fowler「審閱疲勞」批評與 Prospec progressive disclosure 原則）。結構化 metadata 不塞進 `tasks.md`，而是分離。

- **`prospec-tasks` skill 升級**：拆 task 時，AI 額外為每個 task 推導 `modules`（從它讀的模組 README）+ `reserves`（從 plan/delta-spec 的檔案）+ `blocked_by`。因為只有 AI 懂 plan 語意，這步必須由 skill 做。
- **`tasks.md` 只加最小 inline 標記**（人類可讀）：
  ```markdown
  - [ ] T3 實作 NotificationService.execute() ~60 lines [mod:services] [needs:T1,T2]
  ```
- **完整結構化資料寫進 sidecar**：`tasks.graph.yaml`（機器消費，人類不必讀）。
  ```yaml
  tasks:
    - id: T3
      desc: 實作 NotificationService.execute()
      kind: code          # code | manual | verification（對齊 OPT-B3）
      modules: [services]
      reserves: [src/services/notification.service.ts]
      reads: [src/types/notification.ts]
      blocked_by: [T1, T2]
      req: REQ-SERVICES-012   # 連回 delta-spec
      est_lines: 60
  ```

> 此分離讓 `tasks.md` 維持現有人類審閱體驗，重型機器結構獨立演化。`manual`/`verification` task（OPT-B3）不進並行 lane。

---

## 三、BL-028：Orchestration Handoff

### 3.1 產出物

`prospec orchestrate` 讀 `tasks.graph.yaml` + `module-map.yaml`，跑 §2.2 演算法，產出：

- **`orchestration.plan.yaml`**（通用、平台無關）— waves / lanes / reservations / 每 task 的 payload。
- **adapter 特定 handoff**（呼應 design-phase 的 platform-adapter 模式）。

每個 task 的 payload **攜帶 vendor harness 拿不到的東西**：

```yaml
- id: T3
  prompt_context:
    req: REQ-SERVICES-012
    acceptance:                         # 來自 delta-spec → 變成 per-task verify hook
      - WHEN 通知建立 THEN 寫入 notifications 表並回傳 id
    knowledge_ref: prospec/ai-knowledge/modules/services/README.md  # 該模組慣例
    conventions: [execute() pattern, atomicWrite()]
    reserves: [src/services/notification.service.ts]  # 無衝突檔案範圍
    verify_hook: 對照 acceptance 逐條檢查
```

### 3.2 三種 Adapter

#### Adapter A：Claude Code Dynamic Workflows（一級對接）

Prospec 產出可直接執行的 workflow 腳本，用其 `phase()` / `pipeline()` / `parallel()` / `agent({isolation:'worktree'})` primitive。worktree 隔離 = 並行寫入物理安全；pipeline = 波次無 barrier 流水。範例：

```javascript
export const meta = {
  name: 'prospec-implement-notification',
  description: 'Implement change "add-notification" across safe parallel lanes',
  phases: [{ title: 'Wave1' }, { title: 'Wave2' }, { title: 'Verify' }],
}

// Wave 1：T1, T2 無衝突 → 並行（各自 worktree，reserves 不重疊）
phase('Wave1')
const wave1 = await parallel([
  () => agent(implementPrompt('T1'), { label: 'T1:types', isolation: 'worktree' }),
  () => agent(implementPrompt('T2'), { label: 'T2:lib',   isolation: 'worktree' }),
])

// Wave 2：T3 依賴 T1,T2（blocked_by）→ 等 Wave1 merge 後才跑
phase('Wave2')
const wave2 = await agent(implementPrompt('T3'), { label: 'T3:services', isolation: 'worktree' })

// 合併後統一 verify（對齊方向 4：drift/verify）
phase('Verify')
await agent('Run prospec-verify 5+1 on the merged result against delta-spec REQs')

// implementPrompt(id) 注入 §3.1 的 payload：REQ + acceptance + knowledge_ref + reserves
```

> 此 session 本身即具備 Workflow 工具，格式對著真實 primitive 設計，非臆測。

#### Adapter B：通用並行批次（Antigravity / Cursor `/multitask` / Devin）

輸出純文字 wave/lane 描述 + 每 lane 一段 prompt（含 payload 與 `reserves` 作為明確約束），供任何「把 N 個獨立 task 分給 N 個 subagent」的 UI 消費。檔案保留以明示約束傳遞，補 vendor harness 的盲區。

#### Adapter C：循序 fallback（無並行 harness）

沿用既有 `prospec-implement`，但改為**按波次順序**執行（仍享受正確的依賴排序，只是不並行）。零外部依賴。

### 3.3 合併協定（攻擊 open problem 的核心）

Prospec 對「多代理 merge-conflict」這個公認未解問題的具體貢獻：

1. **物理隔離**：由 module-map 算出的無交集 `reserves` → 並行代理在不同 worktree 改不同檔，**物理上撞不到**。
2. **保守序列化**：路徑不可測 / 熱點檔 → 退回模組級保留 → 序列化，寧慢勿錯。
3. **確定性合併順序**：依 task DAG 拓撲序合併 lane（上游模組先合）。
4. **合併後 verify**：lane 合併後跑 prospec-verify 5+1（接方向 4），對照各 task 的 acceptance hook。

---

## 四、落地架構（對齊既有 src/ 分層 types→lib→services→cli）

| 層 | 新增/修改 | 職責 |
|---|---|---|
| **types** | `types/orchestration.ts` | `OrchestrationPlan`、`Wave`、`Lane`、`TaskNode`、`Reservation` 的 Zod schema |
| **lib** | `lib/partitioner.ts` | 純函式：tasks + module-map → waves/lanes（§2.2 演算法）。**確定性、可單元測試** |
| **services** | `orchestrate.service.ts` | `execute()`：讀 tasks.graph.yaml + module-map → 呼叫 partitioner → 寫 plan + adapter 輸出 |
| **cli** | `commands/orchestrate.ts` | `prospec orchestrate [--adapter workflow\|batch\|sequential]` |
| **skills** | `prospec-tasks.hbs` 升級 | 額外產出 `tasks.graph.yaml`（modules/reserves/blocked_by） |
| **skills** | 新 `prospec-orchestrate`（薄包裝，選做） | 跑 CLI + 解釋輸出 + 提議 handoff |

**Skills-First 取捨**：分區是**確定性圖計算** → 放 CLI（符合 backlog 職責矩陣：批次/確定性運算歸 CLI）。**語意推導**（task 改哪些檔）需 AI → 放 `prospec-tasks` skill。兩者分工乾淨。

---

## 五、邊界案例與緩解

| 案例 | 風險 | 緩解 |
|---|---|---|
| 預估檔案錯誤 | 並行代理仍撞檔 | 保守模組級保留 + worktree 隔離 → 在 merge 時以 git conflict 浮現，非靜默損壞 |
| 新檔案 / 路徑待定 | 無法保留精確路徑 | 保留整個模組目錄 → 序列化 |
| barrel / config 熱點檔 | 多 task 共改 | 偵測高競爭檔 → 序列化 + 警告 |
| 跨切面型別漣漪 | 一個型別改動波及多處 | 視為依賴邊 → 波次排序自然序列化 |
| `manual`/`verification` task | 非程式碼工作不可並行 | 由 `kind` 排除於 lane（依賴 OPT-B3） |
| module-map 不存在 | 無依賴資訊可算 | graceful：退回 layer 順序 + `[P]`/`blocked_by` 提示；建議先跑 knowledge-generate |

---

## 六、分階段建置

```
Step 1（基礎，無 UX 變化）
  - types/module-map.ts → 確保 prospec 自身產出 module-map.yaml（目前缺）
  - prospec-tasks skill 升級：產出 tasks.graph.yaml（modules/reserves/blocked_by/kind）
  - 對齊 OPT-B3（task 分類）+ OPT-B4（強制 REQ ID，讓 task↔REQ 可連）
  ⮑ 驗收：對既有 archived change 回溯產生正確的 tasks.graph.yaml

Step 2（核心演算法）
  - types/orchestration.ts + lib/partitioner.ts（純函式 + 單元測試）
  - orchestrate.service.ts + prospec orchestrate CLI
  - 輸出 orchestration.plan.yaml（通用格式）
  ⮑ 驗收：給定 tasks + module-map，產生正確 waves/lanes，保守性可驗（重疊 reserves 不同 lane）

Step 3（Adapter）
  - Adapter A：Dynamic Workflows 腳本產生器
  - Adapter B：通用批次描述
  - Adapter C：implement skill 改波次順序
  ⮑ 驗收：用 Adapter A 對一個多 task change 跑完整並行實作 + 合併 + verify（self-host）

Step 4（治理接合，接方向 4）
  - 合併後自動 prospec-verify 5+1
  - per-task acceptance hook 對照 delta-spec
```

---

## 七、與既有 backlog 的關係

- **取代 icebox**：BL-013（task DAG，被本設計的依賴排序層吸收升級）、BL-011（Party Mode，被合併協定取代——不再是「多 agent 各做各的」而是「由 plan 算好的無衝突分區」）、BL-007（Sprint，跨 change 的並行可後續以同套 partitioner 擴展）。
- **依賴**：OPT-B3（task 分類 code/manual/verification）、OPT-B4（強制 REQ ID）。建議併入 Step 1。
- **接合方向 4**：合併後 verify + per-task acceptance hook。
- **驗收（self-host）**：用本功能對 Prospec 自身一個多 task change 完成「規劃 → 安全並行分區 → Dynamic Workflows 並行實作 → 合併 → verify」完整循環。

### 建議新增/更新 BL 定義

```
BL-027 安全並行分區（Full）
  依賴：OPT-B3, OPT-B4, module-map.yaml 生成
  取代：BL-013
  驗收：partitioner 對重疊 reserves 必分不同 lane；module 依賴方向必反映在波次

BL-028 Orchestration Handoff（Full）
  依賴：BL-027
  取代：BL-011（Party Mode）
  驗收：三個 adapter 各跑通；Dynamic Workflows adapter 完成一次 self-host 並行循環
```
