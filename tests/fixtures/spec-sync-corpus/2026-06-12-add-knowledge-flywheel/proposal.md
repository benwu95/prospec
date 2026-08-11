# Proposal：add-knowledge-flywheel

> Bundle 4 — Knowledge Flywheel｜scale: full｜reshape `feedback-promotion`

## Background

`feedback-promotion` 管線（BL-036）的料源（archived change 的 quality_log + review.md）與累積器（個人 ledger 的 frequency 計數器）目前都落在 gitignored 的 `.prospec/`。在使用者的 worktree 開發流程下，archived 產物與 ledger 會隨 worktree 切換/clone 一起消失（`add-scale-adapter` 的 archive 已實際遺失），導致晉升門檻 `frequency ≥ 3` 永遠湊不到——飛輪在現行儲存模型下無法累積。歸檔當下是 ephemeral 料源仍存在的唯一攔截點：必須在那一刻把萃取結果寫進版控、跨 worktree 存活的 ledger，飛輪才會真的轉。

## User Stories

### US-1: 歸檔即持久萃取（durable harvest）[P1]

身為一個以 worktree 開發的 SDD 維護者，
我想要一個 change 歸檔完成時，自動把它的 quality_log 與 review.md 重複模式萃取進一份版控、跨 worktree 存活的教訓 ledger，
以便飛輪的 frequency 不因 worktree 切換或 clone 而歸零，晉升判定真的有累積的料可用。

**Acceptance Scenarios:**

- WHEN 一個 verified change 完成歸檔，THEN 其 quality_log 的 WARN/FAIL 與 review.md 的重複 critical 被自動萃取並以確定性 key 寫入版控 ledger（含 frequency 與 source_changes），無需手動觸發 `/prospec-learn`
- WHEN 在新 worktree 或 clone 檢出後查看 ledger，THEN 既有教訓與 frequency 累積仍完整保留（不歸零）
- WHEN 同一類問題跨多個已歸檔 change 重複，THEN 對應 key 的 frequency 遞增，而非新增重複條目
- WHEN 對同一 change 重跑歸檔，THEN 萃取為 idempotent，source_changes 去重、frequency 不重複灌入

**Independent Test:** 對版控合成 archived-change fixture 跑歸檔萃取，斷言版控 ledger 的 key/frequency/source_changes；模擬重跑斷言 idempotent。

### US-2: manual task 系統性跳過萃取成 process lesson [P2]

身為一個 SDD 維護者，
我想要歸檔萃取時把「`[M]` manual task 跨 change 被系統性跳過」本身辨識成一條 process lesson，
以便流程性盲點（總是漏做手動步驟）也能進飛輪被晉升治理，而非只抓 code/spec 類問題。

**Acceptance Scenarios:**

- WHEN 跨多個已歸檔 change 的 tasks.md 顯示 `[M]` manual task 反覆未勾選，THEN 萃取一條 `kind: playbook` 的 process-lesson 條目記錄此系統性跳過模式
- WHEN 某 change 的 manual task 全數完成，THEN 不為其產生 skip process lesson
- WHEN 一個舊格式 change 的 tasks.md 缺少 kind 標記，THEN 安全略過 tasks×kind 萃取、不誤判也不報錯

**Independent Test:** fixture 含「manual task 反覆未完成」與「全完成」兩組 change，斷言只有前者產生 process lesson；含一組無 kind 標記 change，斷言被略過。

### US-3: knowledge_health 驅動人工審查優先序 [P2]

身為一個專案維護者，
我想要當一條 `convention`-kind 教訓影響的模組同時知識 stale 時，它在人工審查/晉升佇列上被提權並附「適合一併刷新知識」提示，
以便最該更新的知識優先被人處理；但寫入 `_conventions.md` 仍由人工執行，pipeline 不自動寫。

**Acceptance Scenarios:**

- WHEN 一條 `convention`-kind 教訓的 impact_modules 與 `knowledge_health` 報告的 stale 模組相交，THEN 該教訓在人工審查佇列被提權並標註「此模組知識同時 stale」
- WHEN 沒有 `knowledge_health` 報告可讀（未跑 `prospec check`），THEN 佇列退回預設排序、不阻斷
- WHEN 教訓經人工核可，THEN 仍由人工手動搬入 `_conventions.md`；pipeline 全程不自動寫入 `_conventions.md`

**Independent Test:** fixture 提供一份 stale 模組清單與一條 impact 相交的 convention 教訓，斷言佇列提權與標註；contract 以 negative assertion 斷言無自動寫 `_conventions.md` 的路徑。

## Edge Cases

- 本機 archive 已被 worktree 抹光、料源稀疏：萃取在現存 archive 上運作即可，frequency 從版控 ledger 既有值延續，不因缺 archive 而重算或歸零
- LLM 語意 key 配對非決定性：不宣稱「決定性飛輪」；key 一旦指定，後續計數/計分才確定性（沿用既有 reproducibility 條件）
- ledger 遷移期：既有 `.prospec/lessons.md`（本機現有一份）內容須遷入版控 ledger，不遺失既有 frequency
- 跨人偏好衝突 / 過期規則：沿用既有 Govern 待 review 清單，本 change 不改動其行為

## Functional Requirements

- **FR-001**: `/prospec-archive` Phase 4.5 由「僅建議 `/prospec-learn`」的被動指標，升級為歸檔完成即自動萃取該 change 的 quality_log + review.md 重複模式進教訓 ledger（reshape REQ-TEMPLATES-071）
- **FR-002**: 教訓 ledger 須版控、跨 worktree/clone 存活，取代現行 gitignored `.prospec/lessons.md`（reshape REQ-TEMPLATES-069/072；候選位置 `prospec/ai-knowledge/_lessons-ledger.md`，確切路徑交 plan）
- **FR-003**: 萃取以確定性 key 增量更新 frequency（不重算、不重複條目），對同一 change 重跑為 idempotent（source_changes 去重）
- **FR-004**: 萃取含 tasks×kind 維度——跨 change 反覆未完成的 `[M]` manual task 聚合成 `kind: playbook` process lesson；缺 kind 標記的舊 change 安全略過
- **FR-005**: `/prospec-learn` Collect 改讀同一份版控 ledger 為 carry-forward anchor；harvest + ledger 格式單一定義於 `promotion-format.md`，archive 與 learn 共用（不雙處複製）
- **FR-006**: 人工審查/晉升佇列依 `knowledge_health`（`prospec check` 報告的 stale 模組）對 `convention`-kind 教訓提權；缺報告時退回預設排序
- **FR-007**: pipeline 不自動寫 `_conventions.md`；convention 搬入仍為人工核可後的手動動作（維持 REQ-TEMPLATES-070 邊界）
- **FR-008**: 契約漣漪一致——`promotion-format.md`、`/prospec-learn` Startup Loading、`_playbook.md` header 三處對舊 `.prospec/lessons.md` 的引用同步改指版控 ledger

## Success Criteria

- **SC-001**: 一個 verified change 歸檔後無需手動跑 `/prospec-learn`，版控 ledger 即新增/遞增對應教訓條目（含 source_changes 與 frequency）
- **SC-002**: 新 worktree/clone 檢出後 ledger 既有 frequency 累積完整保留（非歸零），可由 git 歷史 diff 佐證
- **SC-003**: 跨 change 反覆未完成的 `[M]` manual task 產生至少一條 `kind: playbook` process lesson；manual task 全完成的 change 不產生此條
- **SC-004**: `convention`-kind 教訓在 impact_modules 與 stale 模組相交時於審查佇列提權；且 `_conventions.md` 在整個 pipeline 無自動寫入（negative 可被 contract test 斷言）
- **SC-005**: 存在 fixture-based 萃取測試——對版控合成 archived-change 集跑萃取，斷言 ledger key/frequency/tasks×kind/提權結果，不依賴本機現存真實 archive

## Related Modules

- **templates**: 改 `/prospec-archive` Phase 4.5 與 `/prospec-learn` Collect/Startup Loading 兩個 skill `.hbs` + `promotion-format.md` reference；版控 ledger 登錄 `_index.md` Conventions
- **tests**: 新增合成 archive fixture 集 + ledger-format/skill-format contract 斷言（含 negative：無自動寫 `_conventions.md`）
- 消費既有（不改）：types 的 `quality_log`（資料源）、#2 凍結的 tasks `kind` schema、#3 `prospec-report.json` 的 `knowledge_health`

## Open Questions

- [ ] **NEEDS CLARIFICATION**: 版控 ledger 確切檔名/位置（`prospec/ai-knowledge/_lessons-ledger.md` 候選）與是否登錄 `_index.md` Conventions 區 — 交 plan/delta-spec 定
- [ ] **NEEDS CLARIFICATION**: 既有 `.prospec/lessons.md`（本機現有 ~3.4KB 一份）遷移策略 — 一次性匯入既有 frequency vs 重新累積

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- **P1 文件繁中**: PASS — 本 proposal 繁中、技術詞英文
- **P2 Atomic commits**: PASS — 規劃拆 promotion-format 契約 / archive Phase 4.5 / learn Collect / fixtures+tests 原子提交，commit 不加 co-author
- **P3 INVEST**: PASS — 3 US 各自可獨立測試；依賴 #2(kind)/#3(knowledge_health) 皆已 merge → Independent；Testable 由 SC-005 fixture 保證（不依賴 ephemeral 真實 archive）
- **P4 TDD**: PASS — 純 Skill，test = contract/ledger-format 斷言 + fixture 萃取（比照 PB-001 section-scoped + negative assertion）
- **依賴方向 cli→services→lib→types**: PASS — 純 Skill（Architecture C）不觸發；未來若抽 `lib` helper 才需注意，本 change defer
- 注意：FR-002 改動 REQ-TEMPLATES-069/072 的「gitignored personal」假設 → 屬 MODIFIED，由 archive Phase 3.5 graduation 處理；FR-007 守住「不自動寫 `_conventions.md`」既有邊界

## UI Scope

**Scope:** none
