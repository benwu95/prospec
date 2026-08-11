# Proposal: add-dependency-knowledge（BL-034 依賴層知識）

## Background

`/prospec-plan` 與 `/prospec-implement` 在規劃／實作觸及第三方 library 時，並無任何機制取得該 library 的「當前正確用法」；agent 只能依賴可能過時的訓練記憶，外部 API 誤用因此可能漏過 verify／review。BL-034 提供一個 **optional、on-demand** 步驟：只在改到第三方 lib 時，向 Context7 MCP（若可用）查 usage snippet 並注入 plan 的 Technical Summary，查不到即靜默跳過。此能力定位為 provider-neutral（不綁特定 registry），且輸出視為不可信的參考資料。

## User Stories

### US-1: Plan 階段注入第三方 lib usage snippet [P1]

As a 執行 `/prospec-plan` 的 prospec 開發者,
I want 當本次變更觸及第三方 library 時，plan 能選擇性地從 Context7（若可用）拉取 usage 指引並注入 Technical Summary,
So that 後續實作以「當前正確的 API 用法」為基礎，降低外部 API 誤用。

**Acceptance Scenarios:**

- WHEN 變更觸及第三方 library 且 Context7 MCP 可用，THEN Phase 4 產出的 Technical Summary 含一段標示為 informational／untrusted 的 usage snippet
- WHEN 變更只動到專案內部模組（未觸及第三方 lib），THEN 不發出任何 Context7 查詢（scope guard）
- WHEN snippet 已注入，THEN 它僅為參考文字，不被執行、不成為任何 gate

**Independent Test:**
`grep` `src/templates/skills/prospec-plan.hbs` 與 `references/plan-format.hbs`，確認 Phase 4／Technical Summary 含「條件式（觸及第三方 lib）+ Context7（若可用）+ 注入 untrusted snippet」的指令段落。

### US-2: Implement 階段 on-demand 查詢（補 quick-scale 缺口）[P2]

As a 執行 `/prospec-implement` 的 prospec 開發者,
I want 當某個 task 觸及第三方 library 時（尤其 `scale: quick` 無 plan、無 Technical Summary），實作前能選擇性 on-demand 查 Context7,
So that quick 變更也能取得 usage 指引，不因跳過 plan 而完全失去依賴層知識。

**Acceptance Scenarios:**

- WHEN 某 task 觸及第三方 lib 且 Context7 可用，THEN 寫 code 前 agent 可 on-demand 查詢並參考 usage（lazy／per-task，不在 startup 批次載入）
- WHEN `scale: quick`（無 plan.md／Technical Summary），THEN implement 端的 hook 仍適用，作為唯一的依賴層知識來源
- WHEN task 未觸及第三方 lib，THEN 不發出查詢

**Independent Test:**
`grep` `src/templates/skills/prospec-implement.hbs`，確認 Phase 2／3 含對應的條件式 on-demand Context7 區塊，並明示 quick-scale 適用。

### US-3: Graceful degradation 與不可信輸出契約 [P1]

As a 不想讓工作流耦合外部服務的 prospec 開發者,
I want Context7 不可用或查無結果時，步驟靜默跳過並只留一行 informational 註記（不 WARN、不 FAIL、不 gate、不阻擋）,
So that 工作流永遠不依賴外部 registry 可用性，且不可信輸出不會污染品質判定。

**Acceptance Scenarios:**

- WHEN Context7 未設定／不可用，THEN 步驟靜默跳過，plan 的 Technical Summary／Knowledge Quality Gate 僅留一行 informational「Context7 未用，已略過」
- WHEN Context7 回傳空／不相關，THEN 視同 miss、跳過，不阻擋流程
- WHEN 任何 verify／review 執行，THEN 不存在以 Context7 結果為判準的 gate

**Independent Test:**
`grep` 確認 skill／reference 文字含 graceful（「if a Context7 MCP is available」「skip silently」）、informational 註記、且明示 untrusted／non-gating；並確認未新增 `[STABLE]` 標記、`tests/fixtures/startup-loading-baseline.json` 未變動。

## Edge Cases

- Context7 MCP 未在 harness 設定：靜默跳過 + 一行 informational 註記。
- Context7 回傳空或不相關內容：視同 miss、跳過。
- 變更僅觸及內部模組：不觸發查詢（避免燒 Context7 quota）。
- `scale: quick`（無 plan.md）：僅 implement 端 hook 生效。
- 同時觸及多個第三方 lib：per-lib lazy 查詢，不在 startup 批次載入。
- 目標 agent 無 Context7 工具：等同不可用，graceful 跳過。

## Functional Requirements

- **FR-001**: `prospec-plan` Phase 4 新增 optional on-demand 步驟——觸及第三方 lib 時查 Context7（若可用）並注入 Technical Summary。
- **FR-002**: `prospec-implement` Phase 2／3 新增 optional on-demand 步驟，per-task lazy；明示 quick-scale 為主要受益路徑。
- **FR-003**: 步驟僅在「觸及第三方 lib」時觸發（scope guard），內部變更不查詢。
- **FR-004**: Context7 不可用／查無結果 → 靜默跳過 + 一行 informational 註記（非 WARN／FAIL／gate／阻擋）。
- **FR-005**: 注入的 snippet 為不可信參考——不執行、不作 verify／review gate。
- **FR-006**: 步驟為 DYNAMIC／in-phase，永不進 `[STABLE]` Startup Loading 前綴（保 G4／KV-cache）。
- **FR-007**: 工具以能力／短名引用（"if a Context7 MCP is available"、resolve-library-id／query-docs 寫於 prose），不硬編 `mcp__…` 完整 id（provider-neutral）。
- **FR-008**: 純 Skill 變更（Architecture C）——僅改 `src/templates/skills/*.hbs`（含 references），以 `prospec agent sync` 重新生成；不加 lib／CLI code。

## Success Criteria

- **SC-001**: `prospec-plan.hbs` 與 rendered `SKILL.md` 在 Phase 4／Technical Summary 含條件式 Context7 注入步驟。
- **SC-002**: `prospec-implement.hbs` 含 Phase 2／3 條件式 on-demand Context7 區塊並標注 quick-scale。
- **SC-003**: `plan-format.hbs` Technical Summary 定義 snippet 與 informational 跳過註記的落點。
- **SC-004**: `grep` 可驗證 graceful／untrusted／non-gating／silent-skip + informational 註記之字樣存在。
- **SC-005**: `tests/contract/skill-format.test.ts` 新增契約斷言驗證上述步驟與字樣；測試綠、且 mutation 驗證（移除步驟即轉紅）。
- **SC-006**: 未新增 `[STABLE]` 標記；`tests/fixtures/startup-loading-baseline.json` 不變。
- **SC-007**: `pnpm verify:skills` 通過；完整測試套件全綠。

## Related Modules

- **templates**: 擁有 `src/templates/skills/*.hbs` 與 references（plan/implement skill 指令與 plan-format）——本變更主戰場（keywords: skills、references、stable-prefix、scale）。
- **tests**: 契約斷言落於 `tests/contract/skill-format.test.ts`（keywords: contract、skill-format）。

## Open Questions

- [x] silent-skip 與專案「絕不靜默 fallback」慣例的衝突 → 已決議：靜默跳過 + 一行 informational 註記（非 WARN／gate）。
- [x] scope（plan-only vs plan+implement）→ 已決議：plan + implement。
- [x] scale → 已決議：standard。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- **Principle 1（變更文件用繁中）**: PASS — proposal/plan/delta-spec/tasks 以繁中撰寫；`.hbs` 模板維持 English-only（REQ-TEMPLATES-073），符合規範非違反。
- **Principle 3（INVEST）**: PASS — 三條 Story 各自獨立可測、有 ≥2 WHEN/THEN。
- **Principle 4（TDD）**: PASS — 規劃 SC-005 契約斷言伴隨模板變更。
- **Principle 5（README 同步）[SHOULD]**: WARN（待 implement 釐清）— 若 root `README.md` 有記載 plan/implement 的 Technical Summary 行為面，需同批補一行；implement 時確認，缺漏由 verify Constitution 稽核記 WARN（非阻擋）。
- **Dependency direction**: PASS — `templates` 為 leaf，純 `.hbs`，無反向 import。

## UI Scope

**Scope:** none
