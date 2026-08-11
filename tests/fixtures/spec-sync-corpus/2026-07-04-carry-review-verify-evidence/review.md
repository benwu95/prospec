# Review: carry-review-verify-evidence

**Rounds:** 1 / cap 3   **Status:** review-clean

> 獨立 fresh-context reviewer（Mode B，多 lens）審整個 committed diff（src/templates、tests、_lessons-ledger、_archived-history×50）；生成物（.claude/.agents）排除。0 critical / 0 major，2 nits 已修。

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| tests/contract/skill-format.test.ts:2637-2680（5 斷言） | (clean) | correctness / PB-001 | 非假綠——`sectionOf('### 6. Review & Verify')` 在 fenced 行首 `## ` 截斷，但 6 個目標 token 皆落在 intro 散文（截斷點前），mutation（never fabricate→XXXX）實測轉紅 |
| src/templates/skills/references/archive-format.hbs:82-100 | (pass) | spec-architecture (REQ-TEMPLATES-126) | §6 置於 Completion↔Knowledge Update；三類內容＋no-fabrication 守則＋Source 慣例；`{date}-{name}` single-brace 字面正確 |
| src/templates/skills/prospec-archive.hbs:63-64,68,181 | (pass) | spec-architecture (REQ-TEMPLATES-127) | Phase 2 step 5 寫入＋step 6 MUST＋Phase 2 Gate 項＋NEVER 全到位 |
| src/templates/skills/references/promotion-format.hbs:61 | (pass) | spec-architecture / ripple (REQ-TEMPLATES-128, REQ-AGNT-015) | 單一來源證據指標 render 進 learn＋archive 兩份；agent sync 已重生且一致；無 import 變更→依賴方向 not-applicable |
| prospec/specs/_archived-history/*.md（50 筆回填） | (pass) | security / 防捏造 | 只寫 drift-excluded `_archived-history/`、未觸 trust zone、純附加；53 筆 grade=既有 Quality Grade 欄、1 筆誠實 not-recoverable；criticals/majors 皆可溯源 body/ledger |
| _archived-history/2026-06-11-add-token-measurement-harness.md:44 | nit | 防捏造（精確度） | 「criticals 同源於金流失敗路徑」過度概化（ledger 僅歸 4/5）→ **fixed**：改「其中 4 個 critical 同源於」 |
| _archived-history/2026-06-13-add-mcp-server.md:45 | nit | 防捏造（精確度） | 「4 criticals 共同根因不變式」過度概化（body 僅 Round 4-5 的 3 個）→ **fixed**：根因 scope 至 Round 4-5 的 3 個 |
| _lessons-ledger.md:12 | (pass) | SC-003 | `.prospec/archive/` 唯一命中為反面指引（勿用 bundle 當證據），非證據引用；playbook 零命中 |
| DRY：Review & Verify 三形態 | (pass) | maintainability | live 3-bullet / backfill 4-bullet(+Source) / legacy 2-bullet 為 archive-format §6 文件化的刻意分化，非漂移 |

## Notes（pre-archive 待辦，非 review finding）

- **知識同步（PB-004/005）**：本輪 +5 測試（1860→1865、contract 575→580）且動 templates/tests 模組 source → archive 前需重導 README/`README.zh-TW`/`_index`/tests README 計數並 bump 兩模組 README。archive Entry Gate 的 drift 檢查會硬性要求（deterministic）。
- **manifest 子計數**（gitignored working doc，出 committed scope）：summary+ledger 標題 15→17 已校正、兩 bullet 措辭對齊。
