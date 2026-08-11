# fix-cli-first-regressions — Archive Summary

- **Archived**: 2026-07-30
- **Original Created**: 2026-07-30
- **Quality Grade**: A

## User Story

restore-cli-first（issue #107）把確定性工作交給 CLI 後衍生三個缺陷，共同成因是「CLI 接手機械步驟時，沒把原先靠人補齊的資訊納入輸入契約」：

- **US-1**（維護 Feature Spec 的開發者）：archive 的機械 spec-sync 合併 REQ 時要保住既有行為敘述，信任區才不會因為畢業一次就永久掉字
- **US-2**（維護知識庫的開發者）：`pnpm counts` 要同時維護來源（`module-map.yaml`）與生成檔，`prospec knowledge update` 重生才不會回退計數
- **US-3**（維護原始碼的開發者）：移除失去 runtime consumer 的 `knowledge generate` 引擎，並把它覆蓋的 REQ 改述到真正宿主
- **US-4**（專案擁有者）：三筆 bug 紀錄從已凍結的 `planning/backlog.md` 移出，改由變更工件承載

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | `archive.service`：REQ body 擷取＋非破壞性合併＋`pendingConvergence` 回報；刪除 `knowledge.service.ts` |
| cli | Medium | archive formatter 新增 warning-class 畢業工作清單；刪 `knowledge-output.ts`；`knowledge-generate.ts`→`knowledge.ts` |
| lib | Medium | `language-policy`／`constitution-rules` 生成反向語言例外（`englishExceptions`） |
| types | Low | `LanguageScope` 增 `englishExceptions` |
| templates | Medium | delta-spec-format 定義 `**Spec:**` 落地契約；archive skill 以 worklist 起始畢業；feature-spec-format 標籤選用化；entry config 雙向例外 |
| tests | High | 5 個新測試檔（spec-body、yaml-field、own-knowledge-sync、debt ledger、counts fixture 擴充） |
| scripts/counts（repo-internal） | High | YAML 欄位級 occurrence＋node-range 改寫器；registry 納入 module-map twin |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-072 | ADDED | Non-destructive Feature-Spec REQ merge（`**Spec:**` 落地／保留＋回報） |
| REQ-TEMPLATES-166 | ADDED | delta-spec `**Spec:**` landing-block 契約（含語言與邊界規則） |
| REQ-TESTS-060 | ADDED | spec-sync body 保留測試＋body-less REQ debt ledger |
| REQ-TESTS-061 | ADDED | index-vs-module-map regeneration guard |
| REQ-CLI-024 | MODIFIED | archive 指令輸出新增畢業工作清單情境 |
| REQ-TYPES-063 | MODIFIED | `LanguageScope` 增 `englishExceptions` |
| REQ-LIB-030 | MODIFIED | 語言範圍單一來源同時解析反向例外 |
| REQ-LIB-013 | MODIFIED | 生成的 Language Policy 規則渲染反向例外子句 |
| REQ-TEMPLATES-141 | MODIFIED | 信任區豁免補述反向例外 |
| REQ-KNOW-004 | MODIFIED | README 內容宿主改為 `/prospec-knowledge-generate`＋create-only skeleton |
| REQ-KNOW-005 | MODIFIED | index 重生宿主改為 `prospec knowledge update` |
| REQ-KNOW-012 | MODIFIED | Rationale 由 skill 推斷寫入 module-map（單一來源） |
| REQ-KNOW-019 | MODIFIED | category 推斷宿主改為 skill |
| REQ-KNOW-034 | MODIFIED | root index 產生者改述 |
| REQ-KNOW-006 | REMOVED | Dry-run Preview Mode——綁在已移除的 `knowledge generate --dry-run`，無宿主 |

## Completion

- **Tasks**: 19/19 code tasks (100%)；3/3 `[M]`/`[V]`（不計入完成率）
- **Acceptance Criteria**: SC-001~SC-004、SC-006 由獨立評分者逐條實測；SC-005 由 machine `test-provenance`（`pnpm test` exit 0）與 `pnpm test:coverage`（statements 94.24%）證實

## Review & Verify

- **Review**: 3 round(s)，2 critical / 17 major — 全數修復。兩個 critical 皆由多個獨立鏡頭指認、並由獨立 verifier 實測復現後才動手：`extractDeltaBlock` 缺 heading 終止（`**Spec:**` 後的 heading 會被吞進信任區，且注入的 h2 之後成為就地取代的停止邊界→後續 sync 永遠清不掉）、`landingBody` 的 Description/AC fallback 未限定 ADDED（MODIFIED 只帶 Description 時會用規劃敘述覆蓋既有 body 且不回報）。major 含 Language Policy 自我矛盾（生成規則缺反向例外→verify 會把自己要求的英文判 FAIL）、REMOVED REQ 的 active section 未進 worklist、四項測試真空（field-skip guard／Phase 3.5 slice 過寬／`$`-replacer 未觸及／module 數未斷言非零）
- **Verify**: Grade A — machine：1/5 task-completion PASS、4/5 knowledge-health WARN、5/5 test-provenance PASS（`pnpm test` exit 0，2807 passed／1 skipped）；judgment：2/5 WARN（15 REQ 中 14 PASS，唯一 WARN 為 `getModuleInfos` 幽靈符號，評分後已修）、3/5 PASS（6/6 條規則逐條證據）、6 not-applicable（`ui_scope: none`）
- **Quality Log**: 5 筆 — new-story WARN（US-3 的 INVEST Small 邊界，事後證實 REQ 面確實擴大到 Language Policy）；review 第一輪 WARN、第二／三輪 PASS；verify PASS 帶 2 WARN（2/5 判斷面、4/5 git 時間戳落差，已於同一 feature commit 消解）

## Knowledge Update

已於 verify S/A commit 同步：`services`／`cli`／`templates`／`tests`／`lib`／`types` 六個模組 README＋`prospec/index.md`＋`module-map.yaml`（來源與生成檔同步，正是 US-2 guard test 要求的狀態）。
