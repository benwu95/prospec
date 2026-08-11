# Proposal: sync-knowledge-at-verify-commit

> issue #65 part b（工具先行後的第二步）。part a（`generate-factual-counts`，`pnpm counts` 計數生成工具）已 archived；本變更消費它，把計數重導與知識同步一起前移。

## Background

PB-005（`archive/knowledge-sync-touched-module-readme`，freq **17**）的結構性根因：commit boundary（`/prospec-verify` 達 S/A）**先於**生命週期唯一強制知識同步檢查點（`/prospec-archive` Entry Gate）。順序是「改 code → verify S/A → commit → archive 時才同步 README」；drift `knowledge-health` 以 git commit 時間戳判 stale，於是 feat commit 落地當下**必然**把所有被改模組打成 stale，再由 archive 的 graduation commit 補救（全史 ~21% 是這類尾巴 commit）。`_status-lifecycle.md` 反對提前同步的理由是「verify 後的修復會 re-stale」——但 S/A 是最後一個可要求改 code 的 gate（verify 自述），commit boundary 之後已無 code 修復，故在 **commit prompt 時點**同步不會 re-stale，該反對理由在此時點不成立。本變更把知識同步＋計數重導前移為 verify S/A commit prompt 的一部分，archive Entry Gate 降為 backstop。

## User Stories

### US-1: verify S/A commit prompt 折入知識同步與計數重導 [P1]

身為一名跑 `/prospec-verify` 並在 S/A 後 commit 的開發者，
我想要 commit prompt 在提交前先指示我同步受影響模組的 Knowledge（`/prospec-knowledge-update`）並重導事實計數，折入同一個 atomic feat commit，
以便 commit 落地當下 Knowledge 已同步、`knowledge-health` 不再必然把被改模組打成 stale。

**Acceptance Scenarios:**

- WHEN `/prospec-verify` 達 S/A 並設 `verified`，THEN commit prompt 在「提示 commit」前先列出一個知識同步步驟：對受影響模組跑 `/prospec-knowledge-update`、重導事實計數，並將 README/計數變更折入同一 atomic commit
- WHEN 專案有事實計數生成器（prospec repo 為 `pnpm counts`），THEN 指引執行之；WHEN 沒有，THEN 指引從來源重導——**措辭通用、不硬編特定命令**
- WHEN commit prompt 觸發，THEN 僅在 S/A（最後可改 code 的 gate）之後——故同步時點後無 code 修復、不會 re-stale

**Independent Test:**
讀渲染後的 `prospec-verify` SKILL：commit prompt 段在提交指示前含知識同步＋計數重導步驟，且措辭通用（不寫死 `pnpm counts`）。

### US-2: archive Entry Gate 降為 backstop、生命週期理由更新 [P1]

身為一名維護生命週期契約一致性的維護者，
我想要 `_status-lifecycle.md` 與 `/prospec-archive` 不再宣稱 Entry Gate 是「唯一強制知識同步檢查點」，而是描述 verify-commit 為預防、archive Entry Gate 為 backstop（仍複核、仍 FAIL-if-not-synced），
以便制度化的預防點與實際發生點一致，且防護不被移除（defense in depth）。

**Acceptance Scenarios:**

- WHEN 讀 `_status-lifecycle.md` §What each gate checks，THEN 知識同步的預防點是 verify S/A commit prompt；「提前同步會 re-stale」的反對理由被更正（commit boundary 後無 code 修復）；archive Entry Gate 描述為 backstop
- WHEN 讀 `/prospec-archive` Entry Gate，THEN 措辭為「re-confirm the verify-commit sync held」的 backstop，**仍保留** knowledge-not-synced → FAIL 的硬檢查
- WHEN canonical `_status-lifecycle.md` 與 shipped `init/status-lifecycle.md.hbs` 範本比對，THEN 兩份措辭一致（dual-copy 不漂移）

**Independent Test:**
grep `_status-lifecycle.md`（canonical + 範本）與 `prospec-archive` SKILL：無「single mandatory knowledge-sync checkpoint」宣稱、有 backstop 描述、archive 仍保留 FAIL-if-not-synced。

## Edge Cases

- **verify 評 B/C/D**：commit prompt 只在 S/A 觸發，B/C/D 需修完重 verify——故同步只發生在「無更多 code 修復」的時點，不 re-stale。
- **通用專案無計數生成器**：commit prompt 措辭 fallback 為「從來源重導計數」，不強制工具存在。
- **knowledge-update 引用未畢業 REQ**：commit-prompt 同步 module README 時若引用本變更的新 REQ id，會在 feat commit → archive graduate 之間造成 transient `req-references` dangling（既有 `knowledge/req-citation-precedes-graduation`，freq 2）。前移同步可能把此視窗也前移——指引須避免在 README 引用未畢業 REQ（只更新描述），archive Phase 3.5 graduate 為補網。
- **archive Entry Gate 仍須攔漏**：若開發者跳過 commit-prompt 同步，backstop 仍 FAIL——防護不因降級而消失。

## Functional Requirements

- **FR-001**: `prospec-verify` skill 範本在達 S/A、設 `verified` 後、commit 提示前，新增知識同步步驟：對受影響模組跑 `/prospec-knowledge-update`＋重導事實計數，折入同一 atomic commit。
- **FR-002**: 該步驟措辭通用（「若有計數生成器則執行、否則從來源重導」），不硬編 `pnpm counts`；prospec repo 以 `pnpm counts` 滿足。
- **FR-003**: `_status-lifecycle.md`（canonical + `init/status-lifecycle.md.hbs` 範本）§What each gate checks 更正：知識同步預防點為 verify commit prompt、更正 re-stale 反對理由、archive Entry Gate 描述為 backstop；兩份一致。
- **FR-004**: `prospec-archive` skill Entry Gate 措辭改為 backstop（re-confirm），**保留** knowledge-not-synced → FAIL 的硬檢查（defense in depth）。
- **FR-005**: verify 4/5 的**評級**行為不變（仍 informational、不 gate 本變更 knowledge lag）——本變更改的是 commit-prompt 行為，非評級軸，避免與 REQ-TEMPLATES-034/045 衝突。
- **FR-006**: 契約測試（`skill-format.test.ts` 等）以 section-scoped＋負向＋mutation-verified 斷言釘住：新 commit-prompt 步驟、lifecycle 措辭、archive backstop 措辭、dual-copy 一致性。

## Success Criteria

- **SC-001**: 渲染後 `prospec-verify` SKILL 的 commit-prompt 段，在提交指示前含知識同步＋計數重導步驟，措辭通用。
- **SC-002**: `_status-lifecycle.md`（canonical + 範本）不再有「single mandatory knowledge-sync checkpoint」宣稱；含 verify-commit 預防 + archive backstop 描述；兩份一致。
- **SC-003**: `prospec-archive` Entry Gate 措辭為 backstop 且仍保留 FAIL-if-not-synced。
- **SC-004**: 契約測試 section-scoped + mutation-verified 覆蓋 SC-001~003，改壞任一即紅。
- **SC-005**: dogfood——本變更（改 templates/tests source）走 verify→commit 後，依新 commit-prompt 同步，post-commit `prospec check` knowledge-health 0 stale。

## Related Modules

- **templates**: `src/templates/skills/prospec-verify.hbs`（commit prompt 步驟）、`prospec-archive.hbs`（Entry Gate → backstop 措辭）、`init/status-lifecycle.md.hbs`（gate 理由）；prospec 自身 canonical `prospec/ai-knowledge/_status-lifecycle.md` 亦同步。
- **tests**: `tests/contract/skill-format.test.ts`（及相關）——section-scoped + mutation-verified 契約斷言。

## Open Questions

- [ ] **NEEDS CLARIFICATION**: commit-prompt 的 knowledge-update 是否會把 `req-references` dangling 視窗前移？傾向：README 同步只更描述、不引用未畢業 REQ id，transient 視窗由 archive graduate 補網（沿用既有 freq-2 lesson 的處置）。留待 plan 定案。
- [ ] **NEEDS CLARIFICATION**: canonical `_status-lifecycle.md` 與 shipped 範本是否已存在既有措辭漂移？plan/implement 時 diff 兩份、一次校齊，並以一致性契約斷言鎖住（對齊 `test/consistency-guard-over-extraction`）。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- **[MUST] Language Policy** — PASS：proposal 繁中；skill/範本內容維持既有英文；commit 訊息英文。
- **[MUST] Test-Driven Development** — PASS（意圖）：契約斷言先寫（section-scoped + mutation-verified），改壞轉紅。
- **[MUST] Atomic Commits by Feature** — PASS（意圖）：單一功能（知識同步前移），單一 atomic commit；本變更正是強化「同 commit 折入知識同步」。
- **[SHOULD] User-Facing Documentation Stays Current** — 注意：本變更改 skill 指令行為，屬 workflow 面；README 若描述生命週期 gate 語意需同步（plan 檢查）。
- **[SHOULD] One-way Dependency Direction** — N/A（純範本／文件／測試變更，無程式碼相依方向影響）。

## UI Scope

**Scope:** none
