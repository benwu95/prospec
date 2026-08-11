# Review: document-drift-report-contract

**Rounds:** 2 / cap 3   **Status:** review-clean   **Mode:** B(單一 reviewer 多 lens,fresh context)

## Findings

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/templates/skills/references/drift-report-format.hbs:20 | nit | docs-claims | applied |

**0 critical / 0 major。** 獨立審查員回報零 critical、零 major。唯一 nit(reference 對 stdout 的括號描述略微過強)雖依 severity routing 可丟棄,但本變更目的即精確記載報告(PB-003 claim ⊆ implementation),故自願修正:`Findings:` 改為「when any exist」、coverage 行改為「when `knowledge_health` is present」、明列「never JSON」。修正後重跑 `pnpm test` 仍 91 files / 2135 全綠。

## Verified-safe(對抗式檢查通過 → 無 critical)

- **docs-claims / schema 忠實度(最高優先)**:`drift-report-format.hbs` 與 `DriftReportSchema` 完全吻合 —— top-level 欄位、`DRIFT_CHECK_IDS`(11 個 id 的數量與順序,`drift-report.ts:18-52`)、`checks[]{id,status,reason?}` + skipped-需-reason、`findings[]{check,severity,source_path,line?,detail}` + 「problems only」、`knowledge_health.modules[]{name,last_src_commit,last_readme_commit,stale}` + `coverage{documented,total}` + optionality。task-completion finding 帶 `source_path`+`line` 已於 `drift-checker.ts:204-205` 佐證。
- **stdout-vs-file 宣稱**:正確。`check.service.ts:147-151` 僅在 `--json` 下 `atomicWrite` 檔案;`check.ts:45` 恆呼叫 `formatCheckOutput`(人類可讀,`check-output.ts:28-93`),無任何 stdout-JSON 分支。
- **phantom-field 修正 / parallel-site completeness(PB-007/008)**:`src/`、`prospec/`、mirrors 全域已無「將 `knowledge_health.stale` 當真實欄位讀取」之處;四個授權站點(learn.hbs、promotion-format.hbs、feedback-promotion.md、新 reference)皆改為 `structural.knowledge_health.modules[]` 篩 `.stale`。獨立消費者 `prospec/specs/features/drift-detection.md:51` 本就描述正確、無需變更(reviewer 獨立確認)。
- **map 完整性 / dangling**:`drift-report-format` 恰註冊於 `prospec-verify`(agent-sync.service.ts:506-510)與 `prospec-learn`(560-563)—— 即唯二硬連結該 reference 的 skill。`promotion-format`(部署至 learn + archive)僅以**軟指向**提名,非 markdown 連結,故 archive(未收該 reference)不 dangling;已於部署後的 `.claude/skills/prospec-archive/references/promotion-format.md:70` 確認。
- **spec-architecture(quick 降級:無 delta-spec,REQ 比對 not-applicable)**:`feedback-promotion.md` REQ-TEMPLATES-095 已與修正後行為一致;services map 為純靜態資料,無 layering/dependency-direction 疑慮。
- **mirror 同步**:四處 `.claude`/`.agents` verify+learn 的 `drift-report-format.md` 與模板逐位元組一致;`bundled-templates.ts` 含新條目且重跑 `pnpm bundle` 無新漂移;部署 SKILL.md 帶修正後文字。

## Round 2 — PB-001 回歸 guard(解 verify Round-1 WARN)

新增 `tests/contract/skill-format.test.ts` 的 `describe('Drift report contract — schema fidelity + phantom-field guard (PB-001)')`(+ `DRIFT_CHECK_IDS` import + `REFERENCE_TEMPLATES` 補 drift-report-format smoke)。獨立 fresh-context reviewer(test-quality lens)回報 **0 critical / 0 major**,判定為真正 would-go-red 回歸測試;提 3 個 nit(matcher/scope 廣度),**全數採納**:

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| skill-format.test.ts fidelity 迴圈 | nit | test-quality(structure) | fixed — section-scope 到 id 枚舉區塊,擋重述 id 的 false-green |
| skill-format.test.ts 負向斷言 | nit | test-quality(negative) | fixed — 廣化為 `knowledge_health.stale`(含 dot-notation) |
| skill-format.test.ts positive 迴圈 | nit | test-quality(coverage) | fixed — 納入 prospec-verify |

**Mutation-verify(經 bundle render path,PB-001 要求):**
- 負向 guard:重新引入 phantom `knowledge_health.stale[]` → RED;dot-notation `knowledge_health.stale` → RED(廣化後)。
- fidelity:新增未記載的 check id → RED;從枚舉移除**被重述的** `knowledge-health` → RED(section-scope 後,舊全文版會 false-green)。
- positive:learn/promotion/verify 的 `modules[]` 引用被破壞 → RED。

## Loop

- Round 1:reviewer(fresh context)全 lens 掃描整個 change diff → 0 critical / 0 major → review-clean。自願修 1 nit(reference stdout 描述精確化)。
- Round 2:補 PB-001 回歸 guard(解 verify WARN);獨立 test-quality review 0/0,3 nit 全採納並 mutation-verify。
- 全程 `pnpm test` 綠(最終 2140 passed);兩輪皆 review-clean,無 fix loop 需求。
