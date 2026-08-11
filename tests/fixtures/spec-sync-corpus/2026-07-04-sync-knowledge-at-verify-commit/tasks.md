# Tasks: sync-knowledge-at-verify-commit

> `scale: standard`。純範本／文件／測試變更，層級 Templates → Tests → Docs。TDD：契約斷言先寫、mutation-verify 轉紅。delta-spec：ADD REQ-TEMPLATES-129、MODIFY REQ-CHNG-004 + REQ-TEMPLATES-045。

## Templates

- [x] `src/templates/skills/prospec-verify.hbs`：`**Commit prompt (S/A only)**` 段於「prompt the user to commit」前插入 3 步（1. `/prospec-knowledge-update` 只更描述、不引用未畢業 REQ；2. 重導事實計數，**通用措辭不硬編 `pnpm counts`**〔「this repo's generator is named in its contributor docs」〕；3. 折入同一 atomic commit）＋「只在 S/A 故不 re-stale」＋ archive backstop。更新其後 blockquote 與 V4 平行站點（L104/119/121/222）指向 commit prompt（PB-007 sweep）（REQ-TEMPLATES-129）
- [x] `src/templates/init/status-lifecycle.md.hbs` §What each gate checks + line 24/31：AI Knowledge 預防點＝verify S/A commit prompt、更正 re-stale 理由、Entry Gate＝backstop、移除 single-mandatory；Feature Specs bullet 不變（REQ-CHNG-004）
- [x] `prospec/ai-knowledge/_status-lifecycle.md`（canonical）：逐字相同編輯（dual-copy diff 驗證 IDENTICAL）
- [x] `src/templates/skills/prospec-archive.hbs` Entry Gate + Activation：措辭 → backstop that re-confirms；**保留** FAIL-if-not-synced 與 quick/backfill 推導不動
- [x] [M] `prospec agent sync`：重生成 `.claude/skills/` + `.agents/skills/` 的 prospec-verify/prospec-archive SKILL.md（版控，一致）

## Tests

- [x] `tests/contract/skill-format.test.ts` 新 describe：verify commit-prompt 含 3 步＋「into the feature commit」＋backstop＋「not-yet-graduated REQ ids」；**負向** shipped 範本不含 `pnpm counts`（section-scoped）
- [x] `tests/contract/skill-format.test.ts`：archive Entry Gate backstop **且仍含 FAIL**；負向不再有「single mandatory」
- [x] 跨檔一致性斷言：canonical ⇄ 範本 §What each gate checks 逐字相等 + 新框架 token 存在
- [x] 更新既有 2 契約斷言（釘舊行為者）：「status-lifecycle checkpoint」與「verify no longer grades」改釘新契約（backstop / commit-prompt）
- [x] [V] mutation-verify：破壞 archive backstop（改回 single-mandatory）與 dual-copy 一致性 → 對應斷言轉紅、還原後綠

## Docs

- [x] `README.md` + `README.zh-TW.md`「Why Prospec?」`Knowledge becomes stale` 列更正為「verify S/A commit prompt 折入 Knowledge Update、archive Entry Gate 為 backstop」（本 repo 計數生成器 `pnpm counts` 已於 README 開發段記載，part a）
- [ ] [M] dogfood（延至 verify→commit 邊界，符合新工作流）：本變更改 templates/tests source，於 commit prompt 同步 templates/tests 模組 README ＋跑 `pnpm counts`（+5 contract tests：1929→1934）折入同一 commit；archive 前 `prospec check` 0 stale 佐證

## Summary

- **Total Tasks:** 11（code 7、[M] 2、[V] 1；其中 Docs code 1）
- **Parallelizable Tasks:** 0（範本各改動彼此相關、測試依範本；順序執行）
- **Total Estimated Lines:** ~210 lines
