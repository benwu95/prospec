# Tasks: document-drift-report-contract

> `scale: quick` — 無 plan.md/delta-spec.md,proposal.md 為 spec 來源。範圍於實作站經 PB-008 掃描擴為 templates + services:reference 散布是 `agent-sync.service.ts` 手維護的靜態 map,且 phantom field 另有一處在 Feature Spec。無新 public function,以既有契約測試(bundle-sync / skill-generation 推導 / counts)+ grep 驗收把關。

## Templates

- [x] T1 新增 `src/templates/skills/references/drift-report-format.hbs` — 單一來源記載 `prospec-report.json` 結構:top-level、`structural.checks[]`(以 id 為鍵,列 DRIFT_CHECK_IDS)、`structural.findings[]`、`structural.knowledge_health.modules[].stale` + `coverage`(明示無頂層 `stale[]`)、`semantic`、`summary`;明示 `--json` 只寫檔案、stdout 為格式化文字。英文 ~60 lines
- [x] T2 `src/templates/skills/prospec-verify.hbs` — 於讀取報告各處(Startup Loading item 9、4/5)硬連結 `references/drift-report-format.md`,並點明 stdout 是文字、JSON 在檔案(保留契約測試 pin 的 `knowledge_health`/`git-timestamp staleness` token) ~15 lines
- [x] T3 `src/templates/skills/prospec-learn.hbs`(~L50)— `knowledge_health.stale[]` → `structural.knowledge_health.modules[]` 篩 `.stale`;硬連結 `references/drift-report-format.md`(learn 有部署) ~3 lines
- [x] T4 `src/templates/skills/references/promotion-format.hbs`(~L70)— 同欄位修正;**軟指向**(僅提名,不放 markdown 連結,因與 prospec-archive 共用會 dangling) ~3 lines

## Specs (trust-zone knowledge)

- [x] T5 `prospec/specs/features/feedback-promotion.md`(~L81)— Feature Spec 內同一 phantom field 修正(軟指向);維持既有語言 ~2 lines

## Services

- [x] T6 `src/services/agent-sync.service.ts` `getSkillReferences` — 在 `prospec-verify` 與 `prospec-learn` 兩個 entry 加註 `drift-report-format`,使 reference 部署到兩 skill(避 dangling) ~12 lines

## Lib (generated)

- [x] T7 [M] `pnpm bundle` 重生 `src/lib/bundled-templates.ts`(64 templates)

## Docs / Counts

- [x] T8 [M] `pnpm counts` 重導計數(`templates.hbs.references` 20→21、`templates.hbs.total` 63→64;README.md/README.zh-TW.md/index.md/templates README 同步)

## Verification

- [x] T9 [V] `grep -rn 'knowledge_health\.stale\[' src/ prospec/` 零命中(SC-002;reference 改寫為「no top-level `stale[]`」避免自命中)
- [x] T10 [V] `bundled-templates.ts` 含 `drift-report-format.hbs` 鍵,learn/promotion 兩處已改 `modules[]` 篩 `.stale`(SC-003)
- [x] T11 [M] `pnpm typecheck && pnpm test` — 91 files / 2135 tests 全綠(含 skill-format 4/5、skill-generation 推導、counts 契約)
- [x] T12 [M] dogfood 同步 `npx tsx src/cli/index.ts agent sync`(96 files / 30 refs);drift-report-format 部署到 verify+learn(未到 archive,軟指向正確);CLAUDE.md/AGENTS.md 無 churn;diff 範圍乾淨

## Summary

- **Total Tasks:** 12
- **Code Tasks:** 6 (T1–T6) — 全完成
- **Manual/Verification:** 6 (T7/T8/T11/T12 = [M];T9/T10 = [V]) — 全完成
- **Total Estimated Lines:** ~95 lines(模板/文件/services map)
