# prompt-trust-zone-language-at-init — Archive Summary

- **Archived**: 2026-09-03
- **Original Created**: 2026-09-03
- **Quality Grade**: S
- **Issue**: #257

## User Story

As a 非英文母語的專案擁有者,
I want `prospec init` 在我選了非英文的 `artifact_language` 之後，追問一題信任區語言（預設與 `artifact_language` 相同），並以 `--trust-zone-language` flag 提供非互動路徑（`prospec quickstart` 透傳）,
So that Constitution、entry config 與後續生成的 AI Knowledge 從第 0 步就用對語言，不必事後走 drift → upgrade → 重生的返工。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | Medium | `init.service.ts` 新增 6c 條件式追問、`trust_zone_language` 寫入與 `InitResult.trustZoneLanguage`；`quickstart.service.ts` 透傳 `trustZoneLanguage` |
| cli | Low | `init`/`quickstart` 新增 `--trust-zone-language`；`init-output` Document language 行印實際信任區語言 |
| templates | Low | `config-example.yaml.hbs` 的 `trust_zone_language` 註解補追問說明（bundle 落 lib） |
| tests | Medium | init/quickstart service、init-output 單元、e2e cli-basics、language-policy-scope contract 調整 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-CLI-051 | ADDED | init 輸出印出解析後的信任區語言 |
| REQ-SETUP-015 | MODIFIED | init 語言選擇擴為雙軸：條件式追問、`--trust-zone-language`、CI 預設 English、一律寫入 config |
| REQ-SETUP-017 | MODIFIED | quickstart 透傳 `--trust-zone-language` |

## Completion

- **Tasks**: 13/13 (100%)；`[M]` 2、`[V]` 2 皆已勾
- **Acceptance Criteria**: 14/14（US-1 五條、US-2 五條、US-3 四條）

## Review & Verify

- **Review**: 3 round(s), 0 critical / 3 major（皆 fixed）— F-1 services README 對 flag 的敘述不符實作、F-2 language-policy-scope explicit 變體未自證 yaml 含鍵、F-4 templates/tests 模組 `last_verified` 未重戳；另 1 minor F-3 help/README 追問條件寫錯（fixed）
- **Verify**: Grade S，machine 1/5·4/5·5/5 PASS、judgment 2/5·3/5 PASS（fresh-subagent）、6 not-applicable；`pnpm test` exit 0（189 files / 4726 tests，coverage 96.67%）
- **Quality Log**: prospec-plan WARN（Architecture Verifier 六條漣漪提醒，全吸收進 plan）、prospec-tasks WARN（Task Verifier 標示修正兩條已修）、prospec-review WARN×2（F-1/F-2、F-4，後續輪 fixed）→ PASS

## Knowledge Update

- `prospec/ai-knowledge/modules/services/README.md` 已於 feature commit 更新（init 行雙語言軸敘述）；cli/lib/services/templates/tests 皆已 `prospec knowledge verify`
