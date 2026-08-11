# Plan: sync-knowledge-at-verify-commit

## Overview

消除 PB-005（freq 17）的結構性根因：知識同步（module README）與事實計數重導從「archive Entry Gate（commit 之後）」前移至「`/prospec-verify` 達 S/A 後的 commit prompt（commit 之前）」，使 feat commit 落地當下 Knowledge 已同步、`knowledge-health` 不再必然 stale。archive Entry Gate 降為 backstop——仍保留 knowledge-not-synced → FAIL 的硬檢查（defense in depth），但預防已在 verify commit。

純**指令／範本／文件／測試**變更，無程式碼。核心是四處措辭的一致修改：`prospec-verify.hbs`（commit prompt 新增同步步驟）、`prospec-archive.hbs`（Entry Gate → backstop）、`_status-lifecycle.md` §What each gate checks（AI Knowledge 預防點改 verify commit、更正 re-stale 反對理由；Feature Specs 仍 archive graduate 不變）canonical 與 `init/status-lifecycle.md.hbs` 範本**雙份逐字一致**（現況已一致），加 section-scoped + mutation-verified 契約斷言鎖住。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key surface | Dependencies |
|--------|--------------------|-------------|--------------|
| templates | Handlebars skill/doc 範本（純資源） | `skills/prospec-verify.hbs`, `skills/prospec-archive.hbs`, `init/status-lifecycle.md.hbs` | — |
| tests | 4 層測試守衛 | `contract/skill-format.test.ts`（+ knowledge-format 若涵蓋 lifecycle doc） | all |

### Existing Patterns (from _conventions.md + playbook)
- **指令散文重述加一致性守衛**（`test/consistency-guard-over-extraction`）：同一 gate 語意刻意重述於 canonical `_status-lifecycle.md` 與 `init/status-lifecycle.md.hbs` 兩份時，不抽 partial，改加 section-scoped 跨檔一致性契約斷言釘同一組 token（mutation-verified），保留兩形態又擋漂移。
- **PB-005 家族**：本變更把「同 commit touch README」從 playbook 散文機制化進 skill 步驟（原本預防只散落 playbook）。
- **契約斷言三要件（PB-001）**：section-scoped + 結構/負向斷言 + mutation-verify。

### Architecture Constraints (from Constitution)
- 純範本／文件變更，無 `cli→services→lib→types` 相依影響。
- TDD：契約斷言先寫、mutation-verify 轉紅。
- 生命週期單一真實來源＝`_status-lifecycle.md`（REQ-CHNG-004）——canonical 與 shipped 範本須同步。

## Affected Modules
| Module | Impact | Changes |
|--------|--------|---------|
| templates | High | verify.hbs commit-prompt 新增知識同步＋計數重導步驟（通用措辭）；archive.hbs Entry Gate → backstop（保留 FAIL）；status-lifecycle 範本 §What each gate checks 更正 |
| tests | Medium | skill-format 契約斷言：新 commit-prompt 步驟、lifecycle backstop 措辭、canonical↔範本一致性、archive 仍 FAIL-if-not-synced（section-scoped + mutation-verified） |
| (knowledge doc) | — | prospec 自身 canonical `prospec/ai-knowledge/_status-lifecycle.md` 與範本同步編輯（非 code 模組） |

## Instruction Flow (no code call chain — pure template/doc change)

```
/prospec-verify grades 5+1 → 達 S/A → set status: verified
  → [NEW] Commit-prep step: 對受影響模組跑 /prospec-knowledge-update（只更描述、不引用本變更未畢業 REQ id）
                            + 重導事實計數（有生成器則跑，prospec: `pnpm counts`；否則從來源重導）
                            → 把 README/計數變更折入同一 atomic commit
  → prompt user to commit（既有；現在 commit 已含同步後的 Knowledge）
  → /prospec-archive Entry Gate = BACKSTOP：re-confirm 同步仍成立；未同步仍 FAIL（防護不移除）
```

- Call Chain（程式碼分層）：**N/A** — 無程式碼進入點、無 I/O 層；Constitution 相依方向檢查不適用。

## Implementation Steps

1. **verify.hbs commit prompt** — 在 `**Commit prompt (S/A only)**` 段，於「prompt the user to commit」前插入一個知識同步＋計數重導 sub-step；措辭通用（計數生成器有則跑、否則從來源重導）；明示折入同一 atomic commit；明示只在 S/A（最後可改 code 的 gate）故不 re-stale。同步更新其後 blockquote（module-README Knowledge 於 commit prompt 同步；Feature Spec 仍 archive Phase 3.5 graduate）。
2. **_status-lifecycle.md §What each gate checks（canonical + 範本雙份）** — AI Knowledge bullet 改：預防點＝verify S/A commit prompt、更正「fixes after verify would re-stale」理由（S/A 後無 code 修復）、archive Entry Gate 為 backstop；移除「single mandatory knowledge-sync checkpoint」絕對語；Feature Specs bullet 不變（deadlock 避免）。line 24/31 的 Entry Gate 描述一併對齊。兩份逐字相同。
3. **prospec-archive.hbs Entry Gate** — 措辭從「single mandatory knowledge-sync checkpoint」改為「backstop that re-confirms the verify-commit sync held」；**保留** knowledge-not-synced → FAIL 的硬檢查與 quick/backfill 模組推導邏輯不動。
4. **契約測試（skill-format.test.ts）** — 新增 section-scoped 斷言：verify commit-prompt 含同步步驟且措辭通用（負向：不得硬編 `pnpm counts`）、archive Entry Gate 為 backstop 且仍含 FAIL、canonical↔範本 §What each gate checks 一致（跨檔 token 集合）；逐一 mutation-verify 轉紅。
5. **dogfood** — 本變更改 templates/tests source，依新 commit-prompt 於同 commit 同步 READMEs（templates/tests）＋跑 `pnpm counts`；archive 前 `prospec check` knowledge-health 0 stale 佐證前移生效。

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| canonical `_status-lifecycle.md` 與 shipped 範本漂移 | High | 現況已逐字一致；同步編輯兩份 + 跨檔一致性契約斷言（token 集合）鎖住，改壞轉紅（`test/consistency-guard-over-extraction`）|
| commit-prompt 知識同步把 `req-references` dangling 視窗前移 | Medium | 指引明示：README 只更描述、**不引用本變更未畢業 REQ id**（沿用 `knowledge/req-citation-precedes-graduation` freq-2 處置）；REQ 於 archive Phase 3.5 graduate |
| Entry Gate 降級被誤讀為「移除防護」 | Medium | 措辭保留 knowledge-not-synced → FAIL；契約斷言明釘 backstop 仍 FAIL；plan/spec 皆載明 defense in depth |
| 措辭硬編特定命令、對通用專案失效 | Low | commit-prompt 用通用措辭 + 負向契約斷言（不得出現 `pnpm counts` 字面）；prospec repo 於自身文件另註以 `pnpm counts` 滿足 |
| verify 4/5 評級與新 commit-prompt 混淆 | Low | 4/5 評級行為不變（仍 informational、不 gate）；新步驟在評級之後、commit 之前——plan/spec 明分兩軸 |

> Knowledge Quality Gate：Brownfield 已辨識；templates/tests README + sdd-workflow/ai-knowledge feature spec 已載入；Technical Summary 已綜整；Feature Specs 已檢視（REQ-CHNG-004 / REQ-TEMPLATES-045 / 045 dual-copy 確認）。全 PASS。
