# Proposal: mechanize-review-gate

> 對應 GitHub issue #66 的 scope 1+2+4（gate 機器化）。scope 3（Constitution 收斂）拆為獨立變更。
> 依賴 issue #65（消滅 PB-004/005 根因）已合入 main（PR #69）。

## Background

Prospec 的品質閘門權重錯置：稽核顯示 verify 15 筆有紀錄評級全 S/A、0 FAIL（蓋章化訊號），而真正抓缺陷的 review（累計 ≥17 confirmed criticals）卻是**非阻斷建議**（`prospec-verify` Entry Gate 明載「Absence does NOT block verify」），並已被實際繞過（有變更整站跳過 review 仍過 verify）。同時，晉升迴路餵飽了 reviewer 卻沒餵到 implementer——高頻 playbook 規則（PB-001/003/006/007）從未落回任何 authoring skill 的決策點（在 17 個 skill template 中 grep 零命中），使預防成本永久轉嫁給 review/verify。來源：稽核報告 01-I1、04-F1/F3（`.tasks/chore/scan-by-fable5/`，2026-07-03）。

## User Stories

### US-1: review 留下機器可查的執行 provenance [P1]

身為一名維護 SDD 品質閘門的 prospec maintainer，
我想要每次 `/prospec-review` 執行都在 metadata 留下機器可查、且帶 staleness 判準的紀錄，
以便「review 是否跑過、是否仍反映當前 code」不再只能靠人眼推斷檔案存在性。

**Acceptance Scenarios:**

- WHEN `/prospec-review` 完成一輪（即使 review-clean、0 critical / 0 major），THEN `metadata.yaml` `quality_log` 必含一筆 `skill: prospec-review` 條目，機器可解析其執行事實
- WHEN review 完成，THEN 該 provenance 攜帶一個足以判定 staleness 的基準（review 當下 change 範圍的指紋），使後續能判斷 code 是否在 review 後又被改動
- WHEN review 完成後、change 的原始碼又被修改，THEN provenance 可被機器判定為 stale（不新鮮）

**Independent Test:**
對一個 `implemented` 變更跑 review-clean 後，parse metadata 確認有 prospec-review provenance；改動一個被 review 的原始碼檔後，機器判定轉為 stale。

### US-2: verify Entry Gate 阻斷缺席或 stale 的 review [P1]

身為一名為團隊把守 verify 閘門的 maintainer，
我想要 non-backfill 變更在 review 缺席或 stale 時，verify 拒絕開跑，
以便制度化的硬閘門與實際產生價值的閘門重合，蓋章式的 verify 不再能略過 review。

**Acceptance Scenarios:**

- WHEN non-backfill 變更執行 `/prospec-verify` 而無任何 review provenance，THEN Entry Gate 阻擋、拒絕開跑，並指示先跑 `/prospec-review`
- WHEN review provenance 存在但已 stale（review 後 code 有改動），THEN Entry Gate 阻擋、要求重跑 review
- WHEN review provenance 存在且新鮮，THEN verify 正常開跑
- WHEN 變更 `scale: backfill`，THEN 維持現行豁免邏輯（review 為建議、非阻斷），verify 不因缺 review 而擋
- WHEN 以 `prospec check` 執行，THEN 一個確定性、可測試的 `review-provenance` 檢項回報 pass / fail / skipped（backfill 或料源不可用 → skipped + 原因），機器可查

**Independent Test:**
對 non-backfill 變更在無 review／stale review 下跑 `prospec check --strict` 得 exit 1（review-provenance FAIL）；補跑 fresh review 後轉 PASS；`scale: backfill` 變更該檢項為 skipped、不影響 exit code。全部以單元／服務層測試覆蓋。

### US-3: 殘餘 playbook 規則落回 skill gate [P2]

身為一名依賴 skill 內聯守則的 prospec 維護者，
我想要 #65 未涵蓋、且仍在 template 缺席的高頻 playbook 規則落回相關 skill 的 Entry/Phase/NEVER gate，
以便教訓晉升後真正回寫到 agent 犯錯的決策點，而非只餵給 reviewer。

**Acceptance Scenarios:**

- WHEN 檢視 skill template，THEN 每條決定「落回 gate」的殘餘 playbook 規則（PB-001/003/006/007）在其對應 template 以 grep 可命中
- WHEN 檢視 `_playbook.md` 與 `_lessons-ledger.md`，THEN #65 已修根因的 PB-004、PB-005 被標記退役（不再是 active/promoted），避免重複計數與誤導
- WHEN 評估 PB-002，THEN 明確記錄「落回 gate」或「維持 playbook」的裁決與理由（不靜默略過）

**Independent Test:**
grep 對應 template 命中 PB-001/003/006/007 的守則字樣；檢視 ledger/playbook 確認 PB-004/005 退役註記與 PB-002 裁決。

## Edge Cases

- **commit boundary 在 verify S/A 之後**：review/verify 期間 code 尚未 commit（存於 working tree）——staleness 判準**不可**依賴 git commit 時間戳（那會全程指向 branch base，無法偵測 working-tree 的修復）；須以 change 範圍的內容指紋判定
- **非 git repo / shallow clone**：review-provenance 檢項降級為 skipped + 原因（比照 `knowledge-health`），永不偽裝 PASS；不採用 file mtime（專案已明訂 mtime 在 CI checkout 後失真、不參與判定）
- **舊變更無 review-provenance 欄位**：向後相容——non-backfill 視為「缺席」而阻擋並提示先跑 review，絕不 crash
- **provenance 存在但指紋無法計算**（如環境限制）：honest skip / WARN，不硬 crash、不偽 PASS
- **review 後只改了非原始碼（docs/註解）**：由 plan 明確界定 staleness 的檔案範圍（避免對純文件修改誤判 stale）

## Functional Requirements

- **FR-001**: `/prospec-review` 每輪完成（含 review-clean）都寫入一筆機器可查的 `prospec-review` `quality_log` 條目
- **FR-002**: review provenance 攜帶 staleness 判準（review 當下 change 範圍的內容指紋），可判定 review 後是否又改 code
- **FR-003**: 新增確定性 `review-provenance` drift check（collector 負責 I/O、pure evaluator 負責判定），wired 進 `prospec check`，並沿用 skipped-with-reason 的誠實邊界
- **FR-004**: review-provenance 為 scale-aware——`scale: backfill` 一律 skipped（豁免）
- **FR-005**: `/prospec-verify` Entry Gate 對 non-backfill 變更於 review 缺席或 stale 時阻斷開跑
- **FR-006**: PB-001 / PB-003 / PB-006 / PB-007 內聯進對應 skill template 的 Entry / Phase / NEVER gate（grep 可命中）
- **FR-007**: PB-004、PB-005 於 `_playbook.md` 與 `_lessons-ledger.md` 退役（bookkeeping，含退役理由指向 #65）
- **FR-008**: PB-002 的落回／保留裁決明確記錄

## Success Criteria

- **SC-001**: review-clean 一輪後，metadata `quality_log` 含可解析的 prospec-review provenance 條目
- **SC-002**: 無 review 或 stale 時，non-backfill 變更 `prospec check` 的 review-provenance = fail、`--strict` → exit 1，且有單元／服務層測試覆蓋
- **SC-003**: `scale: backfill` 變更該檢項 = skipped（帶原因），不影響 exit code
- **SC-004**: review 後修改被 review 的原始碼 → review-provenance 由 pass 轉 fail（stale），有測試覆蓋
- **SC-005**: `DRIFT_CHECK_IDS` 由 8 增為 9（append `review-provenance`，additive-only，不動 `knowledge_health` 凍結契約）
- **SC-006**: PB-001/003/006/007 各於對應 template grep 可命中；PB-004/005 於 ledger/playbook 標記退役
- **SC-007**: 全測試綠、coverage ≥ 80%

## Related Modules

- **types**: `DRIFT_CHECK_IDS` 追加 check id、drift-report schema，可能擴充 quality_log 條目的型別契約
- **lib**: `drift-sources` 新增 provenance collector（沿用 git 助手／可用性守衛）、`drift-checker` 新增 pure evaluator 與 dispatch
- **services**: `check.service` 注入新 collector、以 losslessly 讀取的 `scale` 做 backfill 豁免
- **templates**: `prospec-review`（always-record provenance）、`prospec-verify`（Entry Gate 阻斷）、`prospec-implement`/`prospec-plan`/`review-lenses-content`（PB inline）
- **tests**: evaluator / collector / check.service 與 skill-format contract 測試

## Open Questions

- [ ] **NEEDS CLARIFICATION**: staleness 指紋的精確定義與「誰計算、存哪裡」——候選：(a) 由 lib 函式對 `git diff <base>` 內容算指紋，review 完成時由一個 CLI stamp 寫入 metadata、check 時同一函式重算比對（最穩健，需極小 CLI 面）；(b) 指紋存 `review.md` 由 collector 解析（省 CLI 但解析較脆）；(c) 由 review agent 自行算並寫入（最省，但 agent 手算指紋易漂）。plan 拍板。
- [ ] **NEEDS CLARIFICATION**: staleness 涵蓋的檔案範圍（僅原始碼 vs 含測試／文件）與 base ref 的取得方式（merge-base）——plan 界定。
- [ ] **NEEDS CLARIFICATION**: PB-002（freq 1，design-time authoring rule）是否值得落回 `prospec-plan`，或維持 playbook——US-3 要求記錄裁決，傾向維持 playbook（低頻）。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- **[MUST] Language Policy** — PASS：本變更文件以 zh-TW 撰寫、code/識別字/commit 維持英文
- **[MUST] User Stories Follow INVEST** — PASS：三個 Story 各獨立可交付、可估、可測，帶 ≥2 WHEN/THEN 與 Independent Test
- **[MUST] Test-Driven Development** — PASS（承諾）：新 drift check 與 gate 行為以測試先行、coverage ≥ 80%（SC-002/004/007）
- **[SHOULD] One-way Dependency Direction** — PASS：collector/evaluator 落 lib、schema 落 types、注入落 services，維持 `cli → services → lib → types`
- **[SHOULD] User-Facing Documentation Stays Current** — 待評：`prospec check` 新增檢項屬使用者可見面，root README 計數／說明可能需更新（plan/implement 追蹤）
- 無違規；無需例外。

## UI Scope

**Scope:** none
