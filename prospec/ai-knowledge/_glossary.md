# Prospec Glossary

> 跨 Skill 共享的核心概念定義（單一真相，避免每個 Skill 各自重複解釋）。
> 載入時機：L1（按需）。Skill 引用此處而非重述定義。

| 術語 | 定義 |
|------|------|
| **Constitution** | 專案不可違反的原則集，存於 `CONSTITUTION.md`。每個 Skill 啟動時載入作為架構與品質約束。 |
| **Knowledge Engine** | AI Knowledge 的分層 Progressive Disclosure 系統（L0/L1/L2）+ 隨 archive 持續更新的正回饋循環。 |
| **Progressive Disclosure（L0-L3）** | L0=`AGENTS.md`/`CLAUDE.md`（agent config 自動注入，~500 tokens）；L1=`prospec/index.md`+Core Conventions（任務開始時主動讀取，≤1,800 tokens/檔）；L2=`modules/{name}/README.md`+Demand Conventions+Feature Specs（按關鍵字命中載入，≤1,000 tokens/模組）；L3=原始碼（按需）。原則：低層不重複高層資訊。 |
| **Proposal** | `proposal.md` — 使用者意圖（Why + What）。INVEST User Stories + Acceptance Scenarios + Edge Cases + Success Criteria。由 `/prospec-new-story` 產生。 |
| **Delta Spec** | `delta-spec.md` — 技術規格（How）。記錄 ADDED/MODIFIED/REMOVED requirements，每條帶 `REQ-{MODULE}-{NUMBER}` ID + Feature/Story 路由。由 `/prospec-plan` 產生。 |
| **REQ ID** | requirement 的穩定錨點，格式 `REQ-{MODULE}-{NUMBER}`。verify 以此逐項比對，archive 以此推導受影響模組。 |
| **Feature Spec** | `specs/features/*.md` — 活的行為規格（系統「應該做什麼」），以 User Story 為核心單位。archive 是其唯一寫入點（sole writer）。為 spec source of truth 的活層。 |
| **Product Spec** | `specs/product.md` — PRD 入口，由 archive 從 Feature Specs 自動再生。 |
| **Module Map** | `module-map.yaml` — 模組↔檔案路徑 + 依賴方向（`depends_on`/`used_by`）。供依賴方向驗證與影響範圍判定。 |
| **Recipe-First** | 模組 README 格式：Modification Guide / Ripple Effects / Pitfalls 優先於 API Reference——告訴 agent「怎麼改」而非只列「有什麼」。 |
| **Archive** | `/prospec-archive` — 變更收尾：Entry Gate 強制 knowledge 同步 → 歸檔 artifacts → 同步 Feature Spec（Phase 3.5）→ 再生 Product Spec（Phase 3.6）→ knowledge 同步複核（Phase 4）。 |
| **Brownfield / Greenfield Mode** | `/prospec-plan` 依 Knowledge 成熟度自動切換：Brownfield（有 Knowledge）從中合成 Technical Summary；Greenfield（無 Knowledge）補償性掃描技術棧/結構。 |
| **Scale**（規劃中, BL-004） | 變更複雜度等級 Quick/Standard/Full，決定流程深度與產出長度上限。回應「審閱疲勞」。 |
| **Output Contract**（規劃中, BL-019） | 每個 Skill 的 Success Criteria + Failure Conditions + 結束時的達成摘要，供自我評估與下游晉升判定。 |
