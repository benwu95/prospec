# slice-constitution-and-playbook — Archive Summary

- **Archived**: 2026-09-27
- **Original Created**: 2026-09-27T08:32:38.036Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/283
- **Plan Decision**: hybrid (graded_by: in-session)

## User Story

As a 執行 SDD 站的 agent,
I want 以 `prospec constitution show --station <s>` 取得本站需要的 Constitution 切片、以 `prospec learn playbook --modules <m,…>` 取得 playbook 目錄與命中條目的正文,
So that new-story／plan／tasks／review 四站不再每站讀整份 Constitution、plan／implement 不再讀整份 playbook 後才過濾，而切片永遠不比全文差（fail-open）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `ConstitutionRuleEntrySchema.stations`、`ConstitutionRule.stations`、`formatVerifyHint`、`normalizeStationName` 移入 `status.ts`、help registry 7→9 |
| lib | High | parser 解析 `stations:` 子句；新 `constitution-slice.ts` 純引擎；`lessons-ledger.ts` 的 `splitPlaybookBlocks`／`parsePlaybookEntries`／`selectPlaybookEntries`；drift-checker 站名 WARN；種子 `stations: all` |
| services | Medium | 新 `constitution-show.service.ts`；`learn.service.ts` 加 `executePlaybook`（不可讀／逃逸明確拒絕） |
| cli | Medium | 新 `constitution show` 命令與 formatter（stdout 原樣、stderr WARN／included／tokens）；`learn playbook` 子命令；upgrade formatter 共用 Verify 行渲染 |
| templates | Medium | 四站 Startup Loading 換切片指令、plan 第 4 項 `spec show --story`、plan／implement playbook 目錄；drift-report-format、promotion-format、init Constitution 模板 |
| tests | High | parser／slice／ledger／service／formatter unit、e2e fail-open 位元組相等、契約（逐規則×站別成員、24/24 playbook、五站負向守衛）、三份 baseline 重生 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-093 | ADDED | Constitution station slice engine（逐規則 fail-open） |
| REQ-LIB-094 | ADDED | Playbook catalog engine（單一區塊定義） |
| REQ-LIB-095 | ADDED | Seeded Language Policy rule declares every station |
| REQ-SERVICES-122 | ADDED | `constitution show` service |
| REQ-SERVICES-123 | ADDED | `learn playbook` service |
| REQ-CLI-058 | ADDED | `prospec constitution show --station <s> \| --rule <name>` |
| REQ-CLI-059 | ADDED | `prospec learn playbook --modules <m,…> \| --id <PB-NNN>` |
| REQ-TEMPLATES-240 | ADDED | Station Startup Loading runs the slice commands |
| REQ-TESTS-127 | ADDED | Slice, catalog and Startup Loading contracts |
| REQ-LIB-032 | MODIFIED | parser 加 `stations:` 子句與 evaluator WARN |
| REQ-TYPES-065 | MODIFIED | `rules[]` 加 `stations` |
| REQ-TYPES-021 | MODIFIED | `ConstitutionRule.stations?` |
| REQ-TEMPLATES-033 | MODIFIED | plan Feature Spec 改按 story 讀 |
| REQ-TEMPLATES-071 | MODIFIED | plan／implement 改用 playbook 目錄指令 |
| REQ-TEMPLATES-072 | MODIFIED | promotion-format 的 modules 清單為必填可解析欄位 |
| REQ-TYPES-098 | MODIFIED | help registry 七→九 |
| REQ-CLI-054 | MODIFIED | 兩個新命令掛 registry help |
| REQ-TEMPLATES-157 | MODIFIED | drift-report-format 記錄 `stations` 與宣告文法 |

## Completion

- **Tasks**: 27/27 code（100%）；`[M]` 1、`[V]` 2 皆完成
- **Acceptance Criteria**: 20/21 凍結情境滿足；US-4.2 為 WARN（feature 來源改為 `feature-map.yaml`，機制與凍結字面不同、意圖滿足）

## Review & Verify

- **Review**: 2 round(s), 0 critical / 10 major — round 1 四個持票 lens（attempt 1 撞 harness 429 全數 `--spawn-failed` 後重派）0 critical／9 major／16 minor，全修（含 minor）並各附 killing mutation；round 2 fresh 全 lens reviewer 0 critical／1 major（cli README 計數）／2 minor，全修；`--record-review --graded-by fresh-subagent`
- **Verify**: Grade A, 1/5 PASS · 2/5 WARN（18/18 REQ PASS、1 scenario WARN）· 3/5 PASS（8/8 規則）· 4/5 PASS · 5/5 PASS · 6 not-applicable; `pnpm test` exit 0（259 檔、6,583 passed、4 skipped）
- **Quality Log**: new-story WARN（INVEST advisory：US-4 最不 Small）；plan verifier WARN 13 條、tasks verifier WARN 9 條（皆已回寫）；prospec-delegation WARN ×4（429 spawn failures）；review round 1 WARN（9 major 提案）、round 2 PASS；verify PASS A（1 WARN：US-4.2）

## Knowledge Update

六模組（types／lib／services／cli／templates／tests）README 已於 feature commit 前同步並 `knowledge verify`；`MINIMUM_CLI_VERSION` 未抬升，列為發版義務。
