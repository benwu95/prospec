# audit-shipped-skill-claims — 封存摘要

- **Archived**: 2026-09-29
- **Original Created**: 2026-09-29
- **Quality Grade**: S
- **Issue**: #316

## User Story

維護者需要出貨的 Skills 宣稱符合實際 CLI／Skill 責任；使用者需要精簡 reference 的重複區塊，同時保留必要操作與授權資訊。

## Affected Modules

| Module | 影響 |
|---|---|
| templates | 61 檔盤點；修正分類、gate、grade 與因果宣稱；31 references 不再含兩個冗餘 h2 |
| types | archive Entry Gate／Phase 4 沿用既有 canonical backfill phrase，新增兩個 bounded sites |
| tests | section-scoped contracts、必要內容保留、routing owner 邊界及精確 token baseline |
| lib | 重新生成 bundled templates；CLI 判定邏輯不變 |

## Requirements

| REQ ID | Status | 說明 |
|---|---|---|
| REQ-TEMPLATES-117 | MODIFIED | archive accepts backfill + module-derivation switch + Phase 3.5 graduate |
| REQ-TEMPLATES-083 | MODIFIED | Archive Knowledge Sync Entry Gate (backstop) |
| REQ-TEMPLATES-118 | MODIFIED | /prospec-promote-backfill skill (lightweight scaffold) |
| REQ-TEMPLATES-162 | MODIFIED | knowledge-update Skill Delegates the Mechanical Half |
| REQ-TEMPLATES-221 | MODIFIED | Self-Contained Skill Reference Templates Without Dangling Pointers |
| REQ-TEMPLATES-143 | MODIFIED | Boilerplate Partials Single Source |
| REQ-TEMPLATES-120 | MODIFIED | Archive Entry Gate standard/full Feature-Prefix Fallback |
| REQ-TYPES-109 | MODIFIED | Bilingual canonical phrase and consumption-site registry |
| REQ-TESTS-129 | MODIFIED | Per-site phrase contracts and mutation evidence |
| REQ-TEMPLATES-096 | MODIFIED | Constitution Substantive-Emptiness Prompt |
| REQ-TEMPLATES-153 | MODIFIED | [Verify dimension adjudication split + two-ledger grade] |
| REQ-TEMPLATES-071 | MODIFIED | Governance + Progressive Playbook Loading |
| REQ-TEMPLATES-115 | MODIFIED | verify scale: backfill spec-fidelity scoring contract |
| REQ-TEMPLATES-119 | MODIFIED | lifecycle/scale doc records the backfill entry |
| REQ-TEMPLATES-129 | MODIFIED | Verify S/A Commit-Prompt Knowledge Sync (prevention point) |
| REQ-TEMPLATES-136 | MODIFIED | `[P]`/`~lines` downgraded to optional |
| REQ-TEMPLATES-186 | MODIFIED | Task Architecture & Contract Verifier Rubric Reference |
| REQ-TEMPLATES-188 | MODIFIED | tasks-format.hbs Bidirectional Contract & Verifier Self-Check Enhancement |
| REQ-DSGN-001 | MODIFIED | Design Spec Format |
| REQ-TEMPLATES-182 | MODIFIED | Plan Architecture Verifier Rubric Reference |
| REQ-TEMPLATES-192 | MODIFIED | Cascade Protocol, Circuit Breaker, and Project Test Runner References |
| REQ-TEMPLATES-203 | MODIFIED | Review Format Reference and Circuit Breaker Reference Updates |
| REQ-TEMPLATES-111 | MODIFIED | feature boundary criteria reference (externalized + soft-signal reconciliation) |
| REQ-TEMPLATES-150 | MODIFIED | metadata.yaml Format Reference |
| REQ-TEMPLATES-126 | MODIFIED | Archive Summary Review & Verify Section |
| REQ-DSGN-004 | MODIFIED | Platform Adapter -- pencil.dev |
| REQ-TEMPLATES-157 | MODIFIED | metadata-format reference documents the grading-context fields |
| REQ-TEMPLATES-127 | MODIFIED | Archive Phase 2 Writes the Review & Verify Section |
| REQ-TEMPLATES-159 | MODIFIED | archive skill delegates deterministic mutations to the CLI |

## Completion

- **Tasks**: 13/13 code tasks；3/3 verification reminders。
- **Acceptance Criteria**: 6/6 scenarios；29/29 REQ。
- reference tokens：50,854 → 48,170（減少 2,684）；mandatory startup：88,515 → 87,408（減少 1,107）；ceilings 51,089／88,535 不變。
- **Audit**: 逐檔盤點 17 skills、8 partials、31 references、5 change templates，共 61 檔；修正 classifier／grade／gate 的錯誤宣稱、補拒收修復操作，刪除冗餘 h2，保留必要 adapter／DSL／delegation 正文及兩份 MIT license。

## Review & Verify

- **Review**: 2 輪；0 critical、2 major 均 fixed。R1-ARCHIVE-EXCLUSIVE-RECORD 修正三個平行唯一紀錄宣稱；R1-ROUTE-OWNER-FALSE-GREEN 改為 bounded owner 檢查，刪除 route／entry owner 的實際變異均轉紅。
- **Verify**: 最終 S；task／delta-spec／constitution／knowledge／tests 全部 PASS，design not-applicable；29/29 REQ、8/8 Constitution。
- **Tests**: 267 files；6,860 passed／4 skipped；statement 96.49%、branch 90.82%、function 98.67%、line 97.59%；35 個 source→bundle mutations 全數 killed。
- **CI parity**: build、typecheck、lint、coverage、counts:check、agents:check、提交後 knowledge:check、strict check 通過；strict 22 checks、0 FAIL、1 WARN（既有 Knowledge 大小壓力）。
- **Quality Log**: plan 兩次 FLAWS（漏列 governing REQ、Spec foreign-label／矛盾舊正文）已修正後 PASS；review R1 兩個 majors 於 R2 修正；verify 首次 A 的兩個 WARN 均為尚待提交後 Knowledge gate，補齊有效結果後獨立複驗為 S。中途錯寫的 review warning 說明已另筆 quality_log 澄清。
- **Source**: 2026-10-04 由既有封存摘要、review.md、verify.md、61 檔 audit、35 筆 mutation 及 token comparison 整理，並核對 archive metadata 的 quality_log；原始檔可由 Git `8e13d6c8c851` 的同名 history 資料夾追溯。

## Knowledge 與限制

- templates／tests／types／lib README 及相關子模組已更新，四個 module freshness 已由 CLI 確認。
- runtime 的 Constitution no-op 文案仍保留，這次只修模板宣稱；外部 design adapter API 未重新實測。
- CLI archive preview 未回報 blocking worklist；6 組被替換 WHEN bullets 皆有 intentional Dropped 宣告，封存後逐項核對。
