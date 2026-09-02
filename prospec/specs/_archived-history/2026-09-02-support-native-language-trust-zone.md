# support-native-language-trust-zone — Archive Summary

- **Archived**: 2026-09-02
- **Original Created**: 2026-09-02
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/251

## User Story

As a 母語 trust zone 的下游專案維護者,
I want 在 `.prospec.yaml` 設定 trust-zone 語言、並讓 Constitution seed 與 entry config 一律渲染 resolved 語言,
So that `CLAUDE.md`/`AGENTS.md` 與 Constitution 描述同一狀態，不再出現「always remains in English」的硬編碼矛盾，且分歧時由 `prospec check` 報出。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `trust_zone_language` config 欄位；`LanguageScope` 改為 `trustZoneLanguage`/`trustZonePaths`/`trustZoneExceptions`；`DRIFT_CHECK_IDS` 第 21 個 id `language-policy-drift` |
| lib | High | `resolveTrustZoneLanguage`/`sameLanguage`；scope 一般化與 6 個 entry keys；`compareLanguagePolicy`/`isLanguagePolicyStale` 單一比對；三形態 `languagePolicyRule`；新 collector/evaluator；`ruleFieldLabel`/`collapseWhitespace` 共用 helper |
| services | Low | `check.service` 以同一 scope 接新 collector；`upgrade.service` 改用新 predicate；`auto-draft` scale 表補 id |
| cli | Low | upgrade 訊號句改述三種成因；init 輸出去英文 trust zone 字面 |
| templates | Medium | `entry.md.hbs` 三分支；partial／spec-graduation／delta-spec-format／prospec-archive／prospec-upgrade／promotion-format／drift-report-format／config-example 去硬編碼 |
| tests | Medium | 預設 byte-identity pin、三形態渲染、六 verdict、collector/evaluator、母語 trust zone 負向守衛、registry 21 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-094 | ADDED | `language-policy-drift` drift check id（WARN-only） |
| REQ-LIB-074 | ADDED | Language Policy drift collector/evaluator 與共用 `compareLanguagePolicy` |
| REQ-SERVICES-106 | ADDED | check.service 以 resolved scope 接線 collector |
| REQ-TESTS-111 | ADDED | 母語 trust zone 覆蓋與預設 byte-identity pin |
| REQ-TYPES-025 | MODIFIED | config schema 加 `trust_zone_language` |
| REQ-TYPES-063 | MODIFIED | `LanguageScope` 雙 zone 語言契約 |
| REQ-LIB-013 | MODIFIED | Language Policy rule 三形態渲染 |
| REQ-LIB-030 | MODIFIED | scope 單一來源＋`isLanguagePolicyStale` |
| REQ-TEMPLATES-151 | MODIFIED | entry config 以六 keys 渲染三分支 |
| REQ-AGNT-020 | MODIFIED | entry 宣告渲染 trust-zone 語言 |
| REQ-SKILL-012 | MODIFIED | Skill partial／reference 以注入 trust-zone 語言表述 |
| REQ-TEMPLATES-141 | MODIFIED | trust-zone 豁免以 resolved 語言陳述 |
| REQ-TEMPLATES-121 | MODIFIED | prospec-upgrade Skill 文字對齊放寬後的 stale 語意 |
| REQ-TEMPLATES-152 | MODIFIED | Step 2.5 三種觸發成因 |
| REQ-TEMPLATES-166 | MODIFIED | landing block 語言跟隨 trust-zone 語言 |

## Completion

- **Tasks**: 22/22 (100%)（另 2 [M]、2 [V] 皆完成）
- **Acceptance Criteria**: 6/6（issue AC-1～AC-6）

## Review & Verify

- **Review**: 4 round(s)（Mode A 三組 fresh reviewer ＋ 三輪 fresh 複審），2 critical / 11 major / 8 minor，21 列全部 fixed —— critical R3-1（upgrade 訊號句寫死單一成因）與 R4-1（round-1 拼字統一修復讓小寫 `english` 洩入 trust zone 預設）皆經獨立 verifier 確認、pin 先紅後綠再修
- **Verify**: Grade S（兩次，第二次為修完全部 minor 後重驗），2/5 delta-spec PASS、3/5 Constitution 8/8 PASS（fresh subagent）、1/5・4/5・5/5 machine PASS、design not-applicable；`pnpm test` 189 files 全綠、`prospec check` 21/21 0 fail（1 warn 為既有 knowledge-size 壓力訊號）
- **Quality Log**: prospec-ff WARN ×2（Architecture Verifier 補 SCALE_BY_CHECK／fixture／REQ-TEMPLATES-121·152；Task Verifier 補 services 測試任務）、prospec-review WARN ×3（round 1–3 收斂過程）→ PASS ×1、prospec-verify PASS S ×2

## Knowledge Update

已於 verify S 前同步並戳記：`prospec/ai-knowledge/modules/{types,lib,services,cli,templates,tests}/README.md`、`lib/drift-engine.md`、`types/frozen-registries.md`。設計裁決：`language-policy-drift` 定 WARN 而非 FAIL（FAIL 會讓已改寫條文的既有專案 CI day-one 紅燈＝強制遷移）；預設 config 輸出 byte-identical 為硬約束。
