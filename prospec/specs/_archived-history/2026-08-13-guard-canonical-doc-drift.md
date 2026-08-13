# guard-canonical-doc-drift — Archive Summary

- **Archived**: 2026-08-13
- **Original Created**: 2026-08-12
- **Quality Grade**: A

## User Story

作為維護 prospec 專案並升級 CLI 的開發者，我要 canonical／無 authored content 的檔（in-project README 與兩個 canonical convention 檔 `_status-lifecycle.md`、`_module-readme-conventions.md`）與已裝版本的模板保持同步——由 deterministic drift check 偵測、由 `/prospec-upgrade` 在 consent 下整份取代——讓其 shipped narrative 不再跨版本靜默漂移。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `DRIFT_CHECK_IDS` 新增 `canonical-doc-drift`；`INIT_DOC_REGISTRY` 加 `canonical` 分類與 `CANONICAL_INIT_DOCS`；`DocInventoryEntry.canonical` |
| lib | High | 新 `collectCanonicalDocDrift`（drift-sources）＋ `evaluateCanonicalDocDrift`（drift-checker），重用 init-docs 重繪路徑 |
| services | Medium | `check.service` 接線新 source；`upgrade.service` `buildDocsInventory` 填 canonical 旗標 |
| cli | Low | `upgrade-output` 於 docs inventory 顯示 `[canonical]` marker |
| templates | Medium | `prospec-upgrade.hbs` Step 2 canonical/user-managed 分支；`drift-report-format` reference；README 模板加 Installation 段 |
| tests | High | 新 check／canonical 分類／inventory 旗標／marker 的 unit＋contract 測試 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-052 | ADDED | canonical-doc-drift 檢查：present canonical 檔與模板重繪內容分歧則 WARN（正規化行尾＋尾端換行、缺檔略過、collector 不 throw） |
| REQ-SERVICES-089 | ADDED | `prospec upgrade` docs inventory 由 `INIT_DOC_REGISTRY` 標示 canonical（與 check 同一真源） |
| REQ-TEMPLATES-121 | MODIFIED | `/prospec-upgrade` Step 2 依 canonical marker 分支：canonical 整份 diff／覆蓋、user-managed 格式-only |

## Completion

- **Tasks**: 24/24 (100%)
- **Acceptance Criteria**: US-1 / US-2 全數滿足

## Review & Verify

- **Review**: 3 個實質輪次＋lint＋flaky 收尾，共 **8 critical / 2 major，全數解決**。要點：`collectSpecCounters` 被誤植恆真短路而靜默停用**無關**的 spec-counters check（6 測試轉紅）；`| tail` 遮蔽 exit code 造成的假綠；正規化漏尾端換行；collector 裸 `readFileSync` 會 throw；typecheck 紅（fixture 缺 canonical）；實作階段把 REQ-LIB-052 早畢業進信任區且 body 與 delta-spec 不一致；README 模板 scope-creep 造成自家 `prospec/README.md` self-drift。
- **Verify**: Grade **A**。Machine ledger：1/5 task-completion PASS · 4/5 knowledge-health WARN（templates git-timestamp，commit 後已消）· 5/5 test-provenance PASS。Judgment ledger：2/5 delta-spec PASS（fresh context）· 3/5 constitution PASS（8/8 rules）· 6 design not-applicable。測試套件全綠（3783 passed）。
- **Quality Log**: verify PASS(A)；review WARN×1（round 2 未解 critical）→ PASS×4（收斂／lint／flaky）；verify WARN×1（4/5 knowledge-health，commit 同步後解決）。無 FAIL。

## Knowledge Update

已於 verify commit-prompt 同步：
- `prospec/ai-knowledge/modules/lib/drift-engine.md`（canonical-doc-drift never-throw pitfall＋check 計數）
- `prospec/ai-knowledge/modules/services/README.md`（upgrade canonical marker）
- `prospec/ai-knowledge/modules/templates/skill-authoring.md`（prospec-upgrade 分支）
