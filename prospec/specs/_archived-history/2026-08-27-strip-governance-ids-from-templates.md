# strip-governance-ids-from-templates — Archive Summary

- **Archived**: 2026-08-27
- **Original Created**: 2026-08-27T05:15:10.514Z
- **Quality Grade**: S

## User Story

作為採用 prospec skill 模板的下游專案 executor，
我要渲染出的 SKILL.md 與 references 只用規則本身的文字說話，不引用 prospec 自己的 BL／PB／issue／模組 REQ id，
以便每個指令都能自足理解，不會被導向我專案裡不存在的治理文件。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 15 份出貨模板去識別字：`BL-019/031/040/043`、`PB-001/003/006/007`（含三個 lens 段落標題）、`issue #107`（含 `metadata-format` 跨行一處）、prospec 模組 REQ 範例改泛用（auth／api／user-profile）；`prospec-review` lens 觸發詞鏡射 |
| tests | Medium | `skill-format.test.ts`：7 處依賴 `(PB-xxx)` 標題／`PB-` 字串的斷言改為規則語句；新增逐模板負向守衛（45 個出貨模板＋登記表推導的集合大小）；正則涵蓋跨行 `issue #n`、`(#n)`、REQ 通配 |
| lib | Low | `bundled-templates.ts` 由 `pnpm bundle` 再生 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-132 | MODIFIED | inlined 規則改以規則文字 grep-hittable；出貨模板不含 playbook id，`Landing:` 標記才是回連 `_playbook.md` 的機制（quick：由 proposal `## Spec Impact` 手動畢業） |
| REQ-TESTS-043 | MODIFIED | 契約測試改釘規則文字的 grep-hit，新增逐模板負向守衛 bullet |
| US-24 story line | MODIFIED | acceptance scenario 同步改為規則文字 grep-hittable、模板不含 playbook id |

## Completion

- **Tasks**: 5/5 code (100%)，3/3 `[M]`/`[V]`（不計入）
- **Acceptance Criteria**: US-1 三個 scenario 全數達成；Entry Gate quick spec-impact check 以 `## Spec Impact` 通過

## Review & Verify

- **Review**: 3 rounds（mode B fresh-subagent）— round 1：3 critical（S-1 刪 BL-043 留下懸空 `()`；S-2 信任區 REQ-TEMPLATES-132／REQ-TESTS-043 釘住 PB id、proposal 假設有誤；S-3 `metadata-format` 跨行 `issue #107` 漏掉且守衛正則吃不到）＋3 major（REQ 通配、正則假陰性、README 過度宣稱）＋1 minor；全數修復並以四個正則變異驗證轉紅；round 2 narrow 確認 7/7 fixed＋新增 minor S-11（US-24 story 行）併入 Spec Impact；round 3 為 Language Policy 重錄（Summary／Evidence 改繁中）。
- **Verify**: Grade **S** — machine 1/5·4/5·5/5 PASS；judgment 3/5 constitution round 1 **FAIL**（review.md 英文 prose 違反 Language Policy [MUST]）→ 重錄後 round 2 PASS 8/8（graded_by: fresh-subagent）；2/5 not-applicable（quick）、6 design not-applicable；`test-provenance` `pnpm test` exit 0（4220 passed / 4 skipped）。
- **Quality Log**: `prospec-review` WARN → PASS → PASS（三輪）、`prospec-verify` PASS（grade S）；pre-existing `knowledge-size`／`artifact-language` WARN 如實揭露。

## Knowledge Update

- `prospec/ai-knowledge/modules/templates/README.md` Pitfall：shipped 模板不得引用本 repo 治理 id，守衛掃描範圍與例外（泛用範例、`PB-{NNN}` 格式記號）
- `module-map.yaml` last_verified 已 stamp（templates／tests／lib——lib 因 bundle 再生被牽連，commit 後 `knowledge:check` 3 模組確認）
