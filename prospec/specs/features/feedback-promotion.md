---
feature: feedback-promotion
status: active
last_updated: 2026-06-12
story_count: 4
req_count: 10
---

# Feedback Promotion Pipeline

## Who & Why

**服務對象**：使用 Prospec 的開發者與專案維護者，希望團隊「越用越聰明」——session 回饋能沉澱為共享經驗。

**解決問題**：session 中的糾正、verify 反覆 FAIL、review 重複 critical 目前不會回流成持久規則（`.tasks/lessons.md` 只是個人筆記、不進 Constitution/conventions）。每個新 session 與新人從同一基礎重來，目標 G6 在現況為 absent。業界（Claude memory、Cursor Team Rules、AGENTS.md）能做「糾正→規則」，但都缺「一條回饋值不值得升級為團隊共享規則」的**可審計決策步驟**。

**為什麼重要**：Prospec 用其結構化資產（archive 跨 change 統計、module-map 影響範圍、Constitution 作門檻）做出差異化——把晉升判定變成**明文、可重現、版控留痕**的流程，而非黑箱啟發式。這是 G6「越用越聰明」的正面設計。

---

## US-1: 自動蒐集 session 回饋成個人教訓 [P1]

身為一個團隊開發者，
我想要 Prospec 把 session 糾正與反覆出現的問題自動匯整成個人教訓清單，
以便不必手動記錄，且這些教訓成為後續判斷的素材。

**Acceptance Scenarios:**
- WHEN 一次 verify 對同一類問題反覆 FAIL THEN 記入版控教訓 ledger 並標來源 change 與出現次數
- WHEN 一個 change 歸檔 THEN archive Phase 4.5 自動把其 quality_log + review.md + tasks×kind 萃取進版控 ledger（跨 worktree/clone 存活，無需手動觸發 `/prospec-learn`）
- WHEN 教訓尚未跨多次變更累積 THEN 不主動建議升級（避免早期雜訊）

#### REQ-TYPES-024: Register prospec-learn Skill
`SKILL_DEFINITIONS` 新增第 13 skill `prospec-learn`（type `Lifecycle`、hasReferences）；`agent-sync` 的 `getSkillReferences` referenceMap 加 `prospec-learn → promotion-format`。無新 metadata schema、無 lib/cli code（蒐集源復用 quality_log/review.md）。
- WHEN `prospec agent sync`, THEN deployed 含 `prospec-learn/SKILL.md` + `references/promotion-format.md`
- WHEN registered, THEN `SKILL_DEFINITIONS` 為 13 skill

#### REQ-TEMPLATES-093: Version-Controlled Lessons Ledger
教訓 ledger 落版控 `prospec/ai-knowledge/_lessons-ledger.md`（取代 gitignored `.prospec/lessons.md`），登錄 `_index.md` Conventions（on-demand、非 L0）；首版一次性遷移既有 frequency。
- WHEN 在新 worktree/clone 檢出, THEN ledger 既有 frequency 累積完整保留（git 可 diff）
- WHEN 遷移, THEN 既有計數不歸零、舊路徑退役

#### REQ-TEMPLATES-094: tasks×kind Manual-Skip Harvest
archive Phase 4.5 交叉 `tasks.md` 完成狀態 × kind：跨 change 反覆未勾選的 `[M]` manual task 萃取成 `kind: playbook` process lesson；缺 kind 標記的舊 change 安全略過。
- WHEN `[M]` task 跨多 change 反覆未完成, THEN 產生 process lesson
- WHEN manual task 全完成或無 kind 標記, THEN 不產生/安全略過

---

## US-2: 可審計的晉升判定（核心差異化）[P1]

身為一個專案維護者，
我想要 Prospec 用明文、可重現的準則判斷一條教訓值不值得升級為團隊共享規則，而非黑箱啟發式，
以便升級決策可被檢視、可被信任、跨人一致。

**Acceptance Scenarios:**
- WHEN 教訓的跨變更頻次達門檻且影響模組數（查 module-map）達標 THEN 標「建議升級」並列判定依據（頻次／影響範圍／是否屬 Constitution 範疇）
- WHEN 教訓僅出現一次或影響極小 THEN 維持個人層、不建議升級
- WHEN 升級判定產生結果 THEN 每個建議附可追溯計分明細（非僅一個「應升級」結論）

#### REQ-TEMPLATES-069: Collect + Auditable Deterministic Scoring
`prospec-learn` Collect + Score：掃 archived changes 的 quality_log/review.md + 既有 ledger，依**確定性 key** 萃取/配對、增量更新 frequency/impact_modules/scope/source（落版控 `prospec/ai-knowledge/_lessons-ledger.md`，跨 worktree/clone 存活；由 `/prospec-archive` Phase 4.5 自動進料）；Score 套**明文數值規則**標「建議升級」附計分明細。
- WHEN 同類問題跨變更反覆, THEN 記入 ledger 帶 source 與 frequency
- WHEN 頻次與影響模組達門檻, THEN 標「建議升級」+ 計分明細；同 ledger ⇒ 同輸出（規則明文 + keyed ledger，非黑箱）
- WHEN 僅一次或影響極小, THEN 維持個人層

#### REQ-TEMPLATES-072: Promotion Format Reference
`references/promotion-format.md`：明文晉升規則（預設 freq≥3 / impact_modules≥2，可由 `.prospec.yaml` 覆寫）+ 版控 ledger（`_lessons-ledger.md`）/ playbook entry / 核可記錄 / TTL 結構，並**單一定義 Harvest（archive Phase 4.5 進料）與 Review-Queue Prioritization 規則**。規則明文化＝可重現/可審計的根據（reproducibility 條件於穩定 ledger key）。
- WHEN referenced, THEN 含明文數值門檻 + `.prospec.yaml` 可設定 + 結構定義 + Harvest/Review-Queue Prioritization 單一定義
- WHEN 與既有 Constitution 規則重複, THEN 建議「強化既有」而非新增

#### REQ-TESTS-024: Pipeline Contract Tests
contract 驗證 skill 數 13；`prospec-learn` 四 phase（section-scoped）+ 明文數值規則 + 人工核可閘門 + Output Contract + Entry/Exit gates；plan/implement 含 playbook 載入文字；promotion-format 渲染。
- WHEN contract runs, THEN 斷言 section-scoped；移除任一 phase 或核可閘門 → 轉紅

#### REQ-TEMPLATES-095: knowledge_health Review-Queue Prioritization
`prospec-learn` Score 後讀 `prospec-report.json` `knowledge_health.stale[]`：`convention`-kind 教訓 impact_modules ∩ stale 時於人工審查佇列提權+標註；pipeline 全程不自動寫 `_conventions.md`。
- WHEN convention 教訓 impact ∩ stale ≠ ∅, THEN 佇列提權+標註
- WHEN 無報告, THEN 退預設排序（不阻斷）；`_conventions.md` 永不自動寫

#### REQ-TESTS-025: Flywheel Contract + Fixture Corpus
`skill-format.test.ts` flywheel block（relocated-path、Phase 4.5 non-fatal/idempotent、Entry Gate ledger-OR-archive、negative 無自動寫 `_conventions.md`，section-scoped）+ 版控合成 archive fixture 集（recurrence / all-complete 情境）。harvest 輸出為 LLM 步，dogfood 驗證、非 vitest。
- WHEN contract runs, THEN 斷言 section-scoped；mutation 移除對應行為 → 轉紅
- WHEN fixture corpus, THEN well-formed + 情境可辨（不依賴真實 archive）

---

## US-3: 三層晉升與人工核可閘門 [P1]

身為一個專案維護者，
我想要教訓只有經人工核可才會從個人層升級到團隊共享層或 Constitution 規則，且全程版控留痕，
以便共享規則的變更可被審查、可被 diff、可被回溯到來源。

**Acceptance Scenarios:**
- WHEN 教訓被建議升級到 playbook/Constitution THEN 必須顯式人工核可才寫入，且記來源 change／判定準則／核可者
- WHEN 升級為 Constitution/conventions 規則 THEN 進入版控、可被後續 verify 引用
- WHEN 使用者拒絕某項升級 THEN 教訓留在個人層、記已否決、不重複建議

#### REQ-TEMPLATES-070: Human-Gated Promotion (kind-labelled)
個人 ledger → 團隊 `_playbook.md`（L1、TTL 治理）→ Constitution。`kind` 為標籤：`constitution`（硬規則）→ `CONSTITUTION.md` 的 `ConstitutionRule`（BL-031 形態）；其餘（`convention`/`playbook`）→ `_playbook.md` 單一治理團隊層。`convention` 標籤供人工日後**手動**搬進 `_conventions.md` `prospec:user` 區——pipeline **不自動寫** `_conventions.md`（L0 always-loaded、無 TTL 治理）。寫入 `_playbook`/Constitution **必經顯式人工核可**，版控留 source/準則/kind/核可者；否決則記錄不再擾。
- WHEN 建議升級, THEN 依 kind（`constitution`→Constitution；其餘→`_playbook.md`）路由，且必須顯式人工核可才寫入
- WHEN 升級為 Constitution 規則, THEN 進版控、可被 verify 引用（ConstitutionRule 形態）
- WHEN 使用者否決, THEN 留個人層 + 記已否決

---

## US-4: 共享規則治理與 Entry 載入 [P2]

身為一個新加入成員，
我想要載入工作時自動取得相關的團隊共享教訓，且過期或衝突的規則會被定期清理，
以便直接受益於團隊累積的經驗，且不被陳舊或矛盾的規則誤導。

**Acceptance Scenarios:**
- WHEN 開始規劃或實作一個變更 THEN 與該變更相關的 playbook 教訓被載入為參考（漸進揭露，避免 context 膨脹）
- WHEN 一條共享規則逾 TTL 或與另一條衝突 THEN 出現在「待 review 清單」供人工淘汰
- WHEN 共享規則被淘汰 THEN 版控記錄淘汰原因與時間

#### REQ-TEMPLATES-071: Governance + Progressive Playbook Loading
Govern：共享規則帶 TTL 與來源；過期/衝突 → 待 review 清單，淘汰於版控留原因。建 `_playbook.md`（版控）並登錄 `_index.md` Conventions；plan/implement Startup 載入**相關** playbook（漸進揭露）；archive Phase 4.5 **歸檔即自動萃取進版控 ledger（non-fatal/idempotent）**，learn Entry Gate「有料」= archived change 存在 **OR** 非空 ledger（避免新 worktree false-block）。
- WHEN 規劃/實作一變更, THEN 相關 playbook 教訓被載入（漸進揭露、非全載、`if present` 防呆）
- WHEN 共享規則逾 TTL 或衝突, THEN 入待 review 清單；淘汰於版控留原因
- WHEN `_playbook.md` 登錄 `_index.md` Conventions, THEN skill 按需載入（L1，不入 L0）

---

## Edge Cases

- 早期專案變更數少、無足夠樣本：不產生升級建議，僅累積個人教訓
- 跨人偏好衝突（兩位開發者相反回饋）：判定層標衝突、交人工裁決，不自動選邊
- 教訓與既有 Constitution 規則重複：偵測重複，建議「強化既有」而非新增
- 升級寫入失敗：不靜默；保留待升級佇列並回報

## Success Criteria

- **SC-1**: 一條跨多次變更重複的教訓可走完「蒐集 → 判定建議 → 人工核可 → 寫入共享規則 → verify 可引用」完整循環
- **SC-2**: 升級判定對相同 ledger 產生相同輸出，每個建議附可追溯計分明細（非黑箱；reproducibility 條件於穩定 ledger key）
- **SC-3**: 所有共享層/Constitution 升級皆有版控 diff 記來源 change 與核可者
- **SC-4**: 過期或衝突的共享規則 100% 進入待 review 清單，不靜默沿用

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories 與 REQs 直接取代既有版本
2. **Functional Grouping**: 新需求插入對應 User Story 之下
3. **No Inline Provenance**: 歷史歸屬只在 Change History 表
4. **Deprecation over Deletion**: 移除的需求移至 Deprecated 區段

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|--------------|
| 2026-06-08 | add-feedback-promotion-pipeline | 建立 G6 回饋晉升管線：蒐集→可審計判定→人工核可三層晉升→治理 | US-1~4; REQ-TYPES-024, REQ-TEMPLATES-069/070/071/072, REQ-TESTS-024 |
| 2026-06-12 | add-knowledge-flywheel | ledger 版控化（跨 worktree 存活）+ archive Phase 4.5 自動萃取 + tasks×kind 進料 + knowledge_health 審查優先序 | US-1/2/4 reshaped; MODIFIED REQ-TEMPLATES-069/071/072; ADDED REQ-TEMPLATES-093/094/095, REQ-TESTS-025 |
