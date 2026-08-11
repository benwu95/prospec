# Plan：add-knowledge-flywheel

> scale: full ｜ 純 Skill（Architecture C，零 src code-module 變更）｜ reshape `feedback-promotion`

## Overview

`feedback-promotion` 飛輪的料源（archived change 的 `quality_log`/`review.md`）與累積器（個人 ledger 的 frequency 計數器）都落在 gitignored 的 `.prospec/`。worktree 開發流程會連同 archive 一起抹除（`add-scale-adapter` 已實際遺失），使 `frequency≥3` 晉升門檻永遠湊不到——飛輪無法累積。本 plan 把累積器搬到版控的 `prospec/ai-knowledge/_lessons-ledger.md`，並把 `/prospec-archive` 的被動 Phase 4.5 升級為**歸檔即自動萃取**（料源仍活著的唯一攔截點），讓累積成為真實。

實作策略：**只改三個 `.hbs` source template + 三個 project 知識檔 + 契約測試**，不開任何 lib/CLI/service code（依 BL-036/037 的 Architecture C 判例；若未來 archive 規模成長到 LLM 聚合不可靠，再抽 `lib/lesson-harvester.ts` 純函式——非首版範圍）。`promotion-format.hbs` 作為 ledger 格式的**單一定義源**，archive 與 learn 共用，避免雙處複製（templates pitfall：frozen 表格不得在他處重述）。人工核可閘門維持在 `ledger → _playbook.md/Constitution`：版控的是**累積器**（計數器/候選），不是已核可的共享規則，approval 邊界不變。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| templates | Handlebars skill/reference source；`agent sync` 渲染→部署 `.claude/skills/*` | `renderTemplate()`（消費端） | None（純資源） |
| tests | 4-layer 測試；contract 用真實 `renderTemplate()` 驗證部署格式 | `vitest run` | all |

### Existing Patterns (from _conventions.md / READMEs)
- **Source-vs-deployed**：真值在 `src/templates/skills/*.hbs`，`prospec agent sync` 渲染部署；referenceMap 在 `agent-sync.service.ts`（本 change **刻意不碰**以維持零 code）。
- **Non-fatal archive 副流程**：Feature Spec Sync / Product Regen / knowledge-update 皆 try/catch 不阻斷主流程（`_conventions.md` 錯誤處理）；Phase 4.5 auto-harvest 沿用此模式。
- **PB-001**：contract 斷言須 section-scoped + structure-aware + mutation-verified，含 negative assertion。
- **PB-002**：改動 artifact 存在性/位置時，逐 lifecycle station 審 false-block/false-pass，Call Chain 一站一條。
- **PB-003**：文件宣稱 ⊆ 實作；未做的事用 deliberate-exclusion 措辭。
- **frozen 表格單一源**：ledger 格式只定義於 `promotion-format.hbs`，他處引用不重述（比照 tasks-format kind 表）。

### Architecture Constraints (from Constitution)
- 依賴方向 `cli→services→lib→types`：本 change 無 src code-module 變更，不觸發；Call Chain 為 skill-phase 資料流、非 code 層。
- TDD（P4）：contract/fixture 測試 red-first，逐斷言 mutation-verify。
- 文件繁中（P1）、atomic commits 無 co-author（P2）。

## Affected Modules
| Module | Impact | Changes |
|--------|--------|---------|
| templates | High | `prospec-learn.hbs`（ledger 路徑×4 + Entry Gate 放寬 + health 優先序步驟）、`prospec-archive.hbs`（Phase 4.5 改寫為 auto-harvest）、`references/promotion-format.hbs`（ledger 位置/tiers/harvest 語意單一源） |
| tests | High | `contract/skill-format.test.ts` 新斷言 + 合成 archive fixture 集 + mutation-verify |
| （知識檔，非 code module） | Medium | `_playbook.md` header、`_index.md` Conventions 登錄、新增 `prospec/ai-knowledge/_lessons-ledger.md`（含一次性遷移現有 `.prospec/lessons.md`） |

## Call Chain

> 純 Skill：以 skill-phase 資料流呈現。觸及 ledger 的 station 僅 archive 與 learn（PB-002 逐站審見 Risk）。

**EP-1：`/prospec-archive` Phase 4.5（auto-harvest，NEW）**
```
/prospec-archive  (status: verified change)
  → Phase 4  knowledge-sync re-check                         [既有 gate，不變]
  → Phase 4.5  auto-harvest  (try/catch；失敗→log+continue，archive 仍成功)
      → read archived metadata.yaml.quality_log  (WARN/FAIL)        [料源]
      → read review.md recurring criticals                          [料源]
      → read tasks.md × kind markers → manual-skip pattern          [料源，#2 凍結 schema；缺標記→安全略過]
      → assign deterministic key   (LLM 語意步，非決定性，已載明)
      → upsert prospec/ai-knowledge/_lessons-ledger.md              [版控；idempotent，source 去重，frequency++]
  → pointer：仍建議 `/prospec-learn` 做 Score/Promote
```

**EP-2：`/prospec-learn` Collect/Score（durable ledger + health 優先序）**
```
/prospec-learn
  → Entry Gate  material = (archived change) OR (non-empty _lessons-ledger.md)   [MODIFIED：false-block 修正]
  → Startup Loading 4  read prospec/ai-knowledge/_lessons-ledger.md              [MODIFIED 路徑]
  → Collect  refresh ledger（carry-forward anchor；不 re-scan 重算 frequency）
  → Score    freq≥3 ∧ modules≥2 → suggest-promote（+ 可審計計分明細）
  → read prospec-report.json.knowledge_health.stale[]    [#3 OPT-A2：convention-kind 教訓於 impact∩stale 時提權+標註]
  → Promote（人工核可）ledger → _playbook.md / Constitution
  → convention 搬入 _conventions.md = 人工動作，pipeline 不自動寫                 [negative，可斷言]
```

## Implementation Steps

1. **`promotion-format.hbs`（單一定義源）** — REQ-TEMPLATES-072
   - Lessons Ledger 區與 Tiers 段：`.prospec/lessons.md`(gitignored) → `prospec/ai-knowledge/_lessons-ledger.md`(版控)
   - 新增 harvest 語意：deterministic key、idempotent upsert、frequency++、tasks×kind manual-skip → `kind: playbook`、health 優先序、**explicit「pipeline 不自動寫 `_conventions.md`」**
2. **`prospec-learn.hbs`** — REQ-TEMPLATES-069/071/095
   - Startup Loading 4、Collect、SC 三處 ledger 路徑改指版控 ledger；Entry Gate material = archive **OR** non-empty ledger
   - Score 後新增 knowledge_health 優先序步驟（讀 `prospec-report.json` stale、提權、標註；缺報告→預設排序不阻斷）
3. **`prospec-archive.hbs` Phase 4.5** — REQ-TEMPLATES-071/093/094
   - 「Suggest Feedback Collection」→「Auto-Harvest Recurring Lessons」：non-fatal try/catch、掃 quality_log+review+tasks×kind、依 promotion-format（**on-demand 讀取、不重述表格**）upsert ledger、idempotent；保留 `/prospec-learn` pointer
4. **Project 知識檔** — REQ-TEMPLATES-093
   - `_playbook.md` header 引用改 `_lessons-ledger.md`；`_index.md` Conventions 登錄 `_lessons-ledger.md`（on-demand、非 L0）；建立 ledger 檔並一次性遷移現有 `.prospec/lessons.md` 既有 frequency
5. **Tests（TDD red-first）** — REQ-TESTS-025
   - `skill-format.test.ts`：relocated-path 一致性（三檔無殘留 `.prospec/lessons.md`）、Phase 4.5 non-fatal/idempotent 措辭（section-scoped）、Entry Gate ledger-OR-archive、**negative：無自動寫 `_conventions.md`**；新增合成 archive fixture 集斷言 key/frequency/tasks×kind/提權；逐斷言 mutation-verify
6. **Deploy + baseline** `[M]`/`[V]`
   - `prospec agent sync` 重部署 `.claude/skills/*`；若 learn loading item-set keyed on text，regenerate `startup-loading-baseline.json` 並過 contiguity/item-set 斷言

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 料源稀疏（worktree 抹光 archive）無法以真實 archive 驗收 | High | 版控合成 archive fixture 集（SC-005）；durability 測試以「ledger 為版控檔、git 可 diff」佐證跨 worktree 存活，不依賴真實 archive。Trade-off：fixture 可能偏離真實 archive 形狀 → fixture 最小化並鎖 schema |
| 未核可 raw signal 進 git（ledger 被 commit）疑似繞過核可邊界 | Medium | ledger 是**累積器**（計數器/候選），approval 閘門仍在 ledger→playbook/Constitution；於 promotion-format 明寫此邊界。Trade-off：git 歷史多 mechanical `docs(lessons):` commit vs 持久性 → 取持久性 |
| archive 跨引用 learn 的 promotion-format 路徑脆弱 | Medium | Phase 4.5 **on-demand** 讀 canonical promotion-format、**不重述** ledger 表格（templates pitfall）。Trade-off：另案是把 promotion-format 複製進 archive/references（需改 `agent-sync.service.ts` = code，破壞 Architecture C）→ 取 template-only；robustness 升級留後話 |
| learn Entry Gate false-block（PB-002）：archive 被抹、ledger 有料卻拒跑 | High | REQ-TEMPLATES-071 放寬 material = archive **OR** non-empty ledger（Call Chain EP-2 已釘） |
| baseline 未重生 → learn loading 變更 false-green（PB-002 false-pass） | Medium | 重生 `startup-loading-baseline.json` + item-set/contiguity 結構斷言（PB-001 structure-aware） |
| 過度宣稱「自動/決定性飛輪」（PB-003） | Medium | deliberate-exclusion 措辭：auto-harvest + auto-score-**suggest** 為自動，**promotion 仍人工核可**；key 配對為 LLM（非決定性）；health 驅動**優先序非寫入** |

### Constitution Check（Phase 6）
- **依賴方向/layering**：PASS — 無 src code-module 變更；刻意不碰 `agent-sync.service.ts` referenceMap 以維持「零 services code」；Call Chain 為資料流非 code 層，無越層。
- **P4 TDD**：PASS — contract/fixture red-first + mutation-verify（PB-001）。
- **P3 INVEST**：PASS — 3 US 各以 fixture 獨立可測；依賴 #2/#3 已 merge。
- **P1/P2**：PASS — 文件繁中；commits 原子、無 co-author（promotion-format / learn / archive / 知識檔 / tests / sync 分提交）。

### Knowledge Quality Gate（Phase 7）
- Context mode：**Brownfield**（6 模組 README）。Module Knowledge：templates + tests README 已載。Technical Summary：已綜合。Feature Specs：`feedback-promotion.md` 已審（reshape 來源）。全 PASS。
