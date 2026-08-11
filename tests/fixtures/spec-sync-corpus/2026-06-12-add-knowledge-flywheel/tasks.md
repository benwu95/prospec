# Tasks：add-knowledge-flywheel

> scale: full ｜ 純 Skill（無 Types/Lib/Services/CLI code）｜ kind 標記見 `references/tasks-format.md`（Task Kind Markers）
> 依賴序：`promotion-format.hbs`（ledger 格式單一源）先行 → 消費端 skill → 知識制品 → 測試 → 部署。
> TDD 紀律：Tests 群的 contract 斷言 red-first（先寫斷言見紅、再改 template 轉綠）。

## Templates

- [x] T1 `promotion-format.hbs`：Lessons Ledger 區 + Tiers 段改版控 `prospec/ai-knowledge/_lessons-ledger.md`（取代 `.prospec/lessons.md` gitignored 描述）[REQ-069/072] ~25 lines
- [x] T2 `promotion-format.hbs`：新增 harvest 語意作單一定義源 — deterministic key / idempotent upsert / frequency++ / tasks×kind manual-skip→`kind:playbook` / health 優先序 / explicit「pipeline 不自動寫 `_conventions.md`」[REQ-072/093/094/095] ~40 lines
- [x] T3 `prospec-learn.hbs`：三處 ledger 路徑（Startup Loading 4 / Collect / SC）改指版控 ledger + Entry Gate material = archive **OR** non-empty ledger [REQ-069/071] ~25 lines
- [x] T4 `prospec-learn.hbs`：Score 後新增 knowledge_health 優先序步驟（讀 `prospec-report.json` stale、convention-kind 教訓 impact∩stale 時提權+標註、缺報告退預設）[REQ-095] ~20 lines
- [x] T5 [P] `prospec-archive.hbs`：Phase 4.5「Suggest」→「Auto-Harvest Recurring Lessons」— non-fatal try/catch、掃 quality_log+review+tasks×kind、on-demand 讀 promotion-format（不重述表格）upsert ledger、idempotent、保留 `/prospec-learn` pointer [REQ-071/093/094] ~35 lines

## Knowledge Artifacts

- [x] T6 建立 `prospec/ai-knowledge/_lessons-ledger.md`（版控、表頭依 promotion-format）+ 一次性遷移現有 `.prospec/lessons.md` 既有 frequency 後退役舊路徑 [REQ-093] ~20 lines
- [x] T7 [P] `_playbook.md` header 引用改 `_lessons-ledger.md` + `_index.md` Conventions 登錄該 ledger（on-demand、非 L0）[REQ-093] ~10 lines

## Tests

- [x] T8 `skill-format.test.ts`：relocated-path 一致性（learn/promotion-format/_playbook 三處皆指版控 ledger、無殘留 `.prospec/lessons.md`；section-scoped）[REQ-025 AC1] ~40 lines
- [x] T9 `skill-format.test.ts`：Phase 4.5 non-fatal+idempotent 語意 + learn Entry Gate ledger-OR-archive + **negative：無自動寫 `_conventions.md`**（section-scoped）[REQ-025 AC1] ~45 lines
- [x] T10 [P] 合成 archived-change fixture 集 + well-formedness 測試（涵蓋 reb-skip / all-complete / no-kind 三情境；dogfood 與未來 helper 語料；不依賴本機真實 archive）[REQ-025 AC2] ~55 lines
- [x] T11 [M] dogfood：對 fixture/真實 change 執行 `/prospec-archive` Phase 4.5，確認 ledger upsert + 重跑 idempotent（LLM harvest 正確性的執行驗證，deliberate exclusion 非 vitest）[REQ-025 AC2] ~10 lines
- [x] T12 [V] mutation-verify 所有新 contract 斷言（刪/壞對應 template 行為應轉紅；PB-001）[REQ-025 AC3] ~15 lines

## Deploy & Verify

- [x] T13 [M] `prospec agent sync` 重部署 `.claude/skills/*` + 若 learn loading item-set 變更則 regenerate `tests/fixtures/startup-loading-baseline.json` ~5 lines
- [x] T14 [V] 跑全 `pnpm test` 確認 green（含重生後 baseline item-set/contiguity）[REQ-025 AC3] ~5 lines

## Summary

- **Total Tasks:** 14（code 10：T1-T10；`[M]` 2：T11/T13；`[V]` 2：T12/T14）
- **Parallelizable Tasks:** 3（T5、T7、T10）
- **Total Estimated Lines:** ~350 lines
