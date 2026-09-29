# add-canonical-claims — Archive Summary

- **Archived**: 2026-09-29
- **Original Created**: 2026-09-29
- **Quality Grade**: S
- **Plan Decision**: option-a (graded_by: in-session)
- **Issue**: https://github.com/benwu95/prospec/issues/315

## User Story

作為維護 Prospec 規格與文件的開發者，希望撰寫時能依循元件範圍、實作判準及量詞／理由三條紀律，並讓跨 CLI、模板與雙語文件重述的規則沿用 canonical 用語，避免反覆意譯造成偏差。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | 雙語 canonical phrases 與 bounded site registry |
| lib | Medium | runtime 訊息引用及 init／upgrade 共用 context 注入 |
| services | Medium | agent sync 注入 registry |
| templates | High | 撰寫規則、Docs-Claims lens 與同步集合用語 |
| tests | High | 逐站 pin、獨立 inventory、真實生成與 mutation contracts |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-109 | ADDED | 雙語用語與站點 registry |
| REQ-SERVICES-125 | ADDED | 生成入口注入 canonical 文字 |
| REQ-TEMPLATES-241 | ADDED | 三條宣稱撰寫紀律 |
| REQ-TESTS-129 | ADDED | 逐站用語 pin 與 mutation 證據 |
| REQ-TEMPLATES-084 | MODIFIED | Docs-Claims 撰寫檢查 |
| REQ-TEMPLATES-166 | MODIFIED | Spec 區塊撰寫紀律 |
| REQ-TEMPLATES-129 | MODIFIED | prevention point 一般／backfill canonical 集合 |
| REQ-TEMPLATES-162 | MODIFIED | Knowledge update canonical 集合 |
| REQ-LIB-097 | MODIFIED | related_modules halt canonical 條件 |

## Completion

- **Tasks**: 14/14 code tasks；3/3 verification tasks。
- **Acceptance Criteria**: 5/5 frozen scenarios；9/9 REQs。
- CLI predicates、remediation 與 route codes 維持原行為。
- mandatory-context 88,527 ≤ 88,535；references 50,901 ≤ 51,089，既有 ceiling anchors 未提高。

## Review & Verify

- **Review**: 3 輪，0 critical／2 major，皆已修復；0 unresolved。R1-1 為固定終點切片漏掉新 sibling heading；R2-1 為合法縮排／tab 標題變體，已擴充至 Setext 與上層標題。移除 guard 得到 3 個失敗，實體模板搬移並 bundle 得到 2 個失敗，還原後全綠。
- **Verify**: Grade S；machine task-completion／knowledge／tests PASS，fresh-context delta-spec-compliance／constitution PASS，design not-applicable。266 files、6,762 passed、4 skipped；coverage statements 96.48%、branches 90.83%、functions 98.67%、lines 97.58%。
- **Quality Log**: plan 首輪 FLAWS 修正 router 平行站點遺漏、ignored active-change 依賴及重量盤點；第二輪 PASS。Tasks verifier PASS。Review 前兩輪 WARN 已由第三輪 PASS 收斂。Verify PASS。
- **Mutation**: 11 個實體模板變異逐次 bundle 後全部 killed；7 個待卒業 Spec 變異 killed；逐站 deletion／paraphrase／relocation 與 descriptor deletion 納入常態 contract。Archive 補齊已卒業 Spec 固定站點及 mutations。

## Knowledge Update

五模組 README／相關 sub-modules 已更新並由 CLI 蓋章；feature commit 後 `knowledge:check` 確認 5/5 source-touched modules。計數由 `pnpm counts` 量測同步，agent 生成檔一致。Strict drift 為 0 fail，保留既有 knowledge-size WARN。

## Scope

不納入 #316／#317／#318 的全域文件盤點。四個既有 skipped tests 保持原狀。Feature Spec 用語及固定站點的 archive 後續依本次 plan 完成，常態測試不依賴 ignored `.prospec`。

## Post-Archive Validation

- 7 個正式 Feature Spec 站點加入 registry 與獨立 inventory；常態 canonical contracts 共 64 項，全數通過，包含逐站 deletion／paraphrase／relocation 與 descriptor deletion。先加入 inventory 時，缺少 descriptor 的 RED 已確認。
- 不含 `.prospec` 的獨立 tracked-files checkout：64/64 contracts PASS。
- 最終完整測試及 coverage：266 files、6,776 passed、4 skipped；statements 96.48%、branches 90.83%、functions 98.67%、lines 97.58%。
- Build、typecheck、lint、144 份生成檔一致性、Knowledge gate、事實計數與 strict drift 通過；strict 為 22 checks、0 fail、1 warn（既有 knowledge-size）。
- Knowledge 確認：types 1、services 1、templates 5、tests 1、lib 1 個 REQ，合計 9；raw-scan 已刷新。Product Feature Map 無 declined sync，既有 feature-map 保持不變。
- Harvest 累積 4 條 lesson，未晉升；review 邊界修復已由常態 section contracts 覆蓋。
