# Delta Spec: mechanize-review-gate

> REQ 路由：drift check 機制 → `drift-detection`；review/verify gate、provenance 欄位、playbook inline → `sdd-workflow`。

## ADDED

### REQ-TYPES-052: Drift Report review-provenance Check Id

**Feature:** drift-detection
**Story:** US-2

**Description:**
`DRIFT_CHECK_IDS` append `review-provenance`（additive-only；不動 `knowledge_health` 凍結契約）——共 **9** 個 frozen check id。新 id 進 tuple 後，`runChecks` 的 `Record<DriftCheckId, CheckOutcome>` 窮盡性成為編譯期護欄。

**Acceptance Criteria:**
1. `DRIFT_CHECK_IDS` 含 `review-provenance`，長度 9；`DriftReportSchema` 接受該 id
2. 未於 `runChecks` dispatch 對應 evaluator → 編譯失敗（型別窮盡）
3. `knowledge_health` 契約與其餘 8 id 不變（additive）

**Priority:** High

---

### REQ-TYPES-053: Change Metadata review_provenance Field

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`ChangeMetadataSchema` 新增 optional `review_provenance`（`digest: string`、`date: string`），作為 review baseline 的型別契約，與既有 `quality_log`（REQ-TYPES-022）並列。metadata.yaml 經 `parseYaml(doc.toJS())` lossless 讀取，persist 靠 round-trip，本欄位為型別契約。

**Acceptance Criteria:**
1. metadata 含 `review_provenance{digest,date}` 通過驗證；省略亦通過（向後相容）
2. `ChangeMetadata.review_provenance` 型別正確可讀
3. 既有省略此欄位的 change 不因新增而失效

**Priority:** High

---

### REQ-LIB-024: review-provenance Collector + Evaluator + computeChangeDigest

**Feature:** drift-detection
**Story:** US-2

**Description:**
`computeChangeDigest(cwd): string | null`——雜湊 `HEAD sha` + `git diff HEAD` + untracked（`ls-files --others --exclude-standard`）內容（`execFileSync`，比照 `gitLastCommit`）；pathspec 只涵蓋 code（`src/`、`tests/`）並排除工作流自身會動的檔案（`.prospec/`、`prospec-report.json`）；非 git 回 null。`collectReviewProvenance(cwd)`（I/O）——non-git/shallow → `{available:false, reason}`；否則列舉 `.prospec/changes/*/`，每 change 帶 `{name, source_path, status, scale, recorded_digest, current_digest}`（比照 `collectTaskStates`）。`evaluateReviewProvenance`（pure）——僅對 `status==implemented` 且 `scale!==backfill` 判定。

**Acceptance Criteria:**
1. WHEN change `implemented`/non-backfill 且無 `recorded_digest`，THEN fail finding「no review recorded」（`source_path`=change metadata、指向 `/prospec-review`）
2. WHEN `recorded_digest ≠ current_digest`（review 後改 code），THEN fail finding「review stale」
3. WHEN 相符，THEN 無 finding（pass）
4. WHEN `scale==backfill` 或 status 非 `implemented`，THEN 不 flag 該 change
5. WHEN non-git/shallow，THEN 該檢項 `skipped` + reason；evaluator I/O-free、findings codepoint-sort
6. WHEN 只有工作流檔案（`.prospec/`、`prospec-report.json`）變動（record/status 寫入），THEN digest 不變、不誤判 stale（pathspec 已排除）

**Priority:** High

---

### REQ-SERVICES-062: check.service 注入 + --record-review 寫入路徑

**Feature:** drift-detection
**Story:** US-1

**Description:**
`check.service` 將 `collectReviewProvenance(cwd)` 注入 `runChecks`。新增 `options.recordReview` 分支：`resolveChange` → `computeChangeDigest` → `atomicWrite` metadata `review_provenance{digest,date}`（沿用 `--json`/`--init-ci` 的 flag-gated 副作用慣例；純檢查路徑維持唯讀、確定性）。

**Acceptance Criteria:**
1. 無旗標時 report `structural.checks` 含 `review-provenance` 結果
2. WHEN `--record-review`，THEN 解析 active change、以 `computeChangeDigest` 寫入其 metadata `review_provenance`
3. WHEN 非 git（digest null），THEN record 誠實跳過（不寫入偽指紋、不 crash）

**Priority:** High

---

### REQ-CLI-012: prospec check --record-review 旗標

**Feature:** drift-detection
**Story:** US-1

**Description:**
`prospec check` 新增 `--record-review` 旗標，映射 `recordReview: true`，與 `--json`/`--strict`/`--init-ci` 並列；人讀輸出說明其已寫入 review baseline。

**Acceptance Criteria:**
1. `prospec check --record-review` 觸發 service 的 record 分支
2. 旗標缺席時行為與現行 `prospec check` 完全一致
3. `--record-review` 與 `--json` 可並用

**Priority:** Medium

---

### REQ-TEMPLATES-130: prospec-review 每輪記錄 provenance

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`prospec-review` 每輪完成（**含 review-clean、0 critical / 0 major**）都寫一筆 `skill: prospec-review` quality_log 條目，並於 loop 收斂後執行 `prospec check --record-review` 以 code 寫入 review baseline（graceful：不可用時明示、不靜默跳過）。

**Acceptance Criteria:**
1. WHEN review-clean 一輪完成，THEN metadata `quality_log` 含 prospec-review 條目（機器可解析）
2. WHEN loop 收斂，THEN 執行 `prospec check --record-review` 記錄 baseline；不可用時明示 fallback
3. review.md 既有累積表行為不變

**Priority:** High

---

### REQ-TEMPLATES-131: prospec-verify Entry Gate 阻斷缺席/stale review

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
`prospec-verify` Entry Gate 由「Recommended (non-blocking)」升為**阻斷**：non-backfill 變更讀 `prospec check` 的 `review-provenance` 檢項，缺席或 stale（FAIL）即擋、拒絕開跑並指向 `/prospec-review`；`scale: backfill` 維持現行 recommended-only 豁免。對應 NEVER 同步更新（不再宣稱 review 缺席不擋）。

**Acceptance Criteria:**
1. WHEN non-backfill 且 review-provenance FAIL（缺席/stale），THEN Entry Gate 阻擋、指向 `/prospec-review`
2. WHEN review-provenance PASS，THEN verify 正常開跑
3. WHEN `scale: backfill`，THEN 維持豁免（不因缺 review 而擋）
4. drift 引擎不可用時退回明示 fallback（不靜默放行）

**Priority:** High

---

### REQ-TEMPLATES-132: 殘餘 playbook 規則落回 skill gate

**Feature:** sdd-workflow
**Story:** US-3

**Description:**
將 #65 未涵蓋、且 template 缺席的殘餘 playbook 規則內聯進 authoring skill 決策點：PB-001 → `prospec-implement` NEVER + review test-quality lens；PB-003 → review docs-claims lens；PB-006 → 強化 review DRY lens 的 PB-006 子句；PB-007 → `prospec-implement` NEVER + review parallel-site lens。PB-002（freq 1，design-time）裁決維持 playbook。並將 #65 已修根因的 PB-004/PB-005 於 `_playbook.md`/`_lessons-ledger.md` 標記退役。

**Acceptance Criteria:**
1. PB-001/003/006/007 的守則字樣於各對應 template（implement/review/review-lenses-content）grep 可命中
2. PB-004、PB-005 於 `_playbook.md` 與 `_lessons-ledger.md` 標記 retired（理由指向 #65）
3. PB-002 的「維持 playbook」裁決於 Needs-Review List 明確記錄

**Priority:** Medium

---

### REQ-TESTS-042: review-provenance 引擎測試

**Feature:** drift-detection
**Story:** US-2

**Description:**
`evaluateReviewProvenance`（absent/stale/fresh/backfill/non-implemented/unavailable 六情境）、`computeChangeDigest`（temp git dir）、`collectReviewProvenance` 單元測試；`check.service` 服務測試驗注入後檢項入報告、`--record-review` 寫 metadata、`--strict` FAIL→exit 1。

**Acceptance Criteria:**
1. evaluator 六情境各有斷言；stale 情境改動被 review 檔後由 pass 轉 fail
2. `--record-review` 後 metadata 出現 `review_provenance`；未 record 時 non-backfill implemented change → fail
3. `scale: backfill` change → skipped/不影響 exit code；mutation-verified

**Priority:** High

---

### REQ-TESTS-043: gate 模板 contract 測試

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`skill-format.test.ts` 以 section-scoped + mutation-verified 釘住：prospec-review 每輪記錄 provenance 的步驟、prospec-verify Entry Gate 的阻斷字樣（非「does NOT block」）、PB-001/003/006/007 於對應 template 的 grep-hit。

**Acceptance Criteria:**
1. contract 斷言 section-scoped；移除任一目標字樣 → 轉紅
2. 負向斷言：verify Entry Gate 不再含「Absence does NOT block verify」的 non-backfill 放行語
3. PB grep-hit 斷言涵蓋 4 條殘餘規則

**Priority:** High

---
