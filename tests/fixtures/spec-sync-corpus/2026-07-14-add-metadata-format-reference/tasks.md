# Tasks: add-metadata-format-reference

> TDD：Tests 先行（RED）→ Templates/Services（GREEN）→ 重生 → 驗證。
> 依賴方向 cli→services→lib→types 全程遵守；本變更無 types/cli 程式碼改動。

## Tests

- [x] T1 skill-contract：加斷言 `getSkillReferences('prospec-new-story')` 與 `('prospec-ff')` 皆含 `outputName: 'metadata-format.md'` 條目（RED）~15 lines
- [x] T2 skill-contract：加斷言 `prospec agent sync` 後 `.claude` 與 `.agents` 的 new-story/ff `references/metadata-format.md` 皆存在（RED；ff 檔數已由既有 `refCount` 衍生斷言覆蓋，本項為正向存在斷言）~20 lines
- [x] T3 skill-contract：加斷言 metadata-format reference 內容含 canonical 欄位順序與 `quality_log` 的「grade 非 result」規則關鍵字（釘住 REQ-TEMPLATES-150 AC1/AC3）~15 lines

## Templates

- [x] T4 撰寫 `src/templates/skills/references/metadata-format.hbs`：Purpose + 語意權威指標（`ChangeMetadataSchema`/`_status-lifecycle.md`/`metadata-completeness`）+ 序列化慣例（block、最小引號、ISO 8601、block sequence、值內無 markdown）+ 欄位表（必填/選用/型別/寫入階段）+ `quality_log` entry 形狀（`result` 恆 PASS/WARN/FAIL、verify grade 進 `grade` 欄）+ `review_provenance`/`introduced_by` + 跨階段 canonical 範例；結尾單一 trailing newline ~95 lines
- [x] T5 `prospec-new-story.hbs`：Startup Loading 加 `[STABLE] MANDATORY` 讀 metadata-format；Phase 3 scaffold 步驟引用它 ~6 lines
- [x] T6 `prospec-ff.hbs`：Phase 2 on-demand 附註加入 metadata-format（沿用精簡穩定前綴慣例，不 inline prose）~4 lines
- [x] T7 plan/tasks/implement/review/verify/archive `.hbs`：各在追加 `quality_log`/翻 `status`/寫 `grade` 的段落加一行「entry/欄位形狀見 `references/metadata-format.md`」~12 lines

## Services

- [x] T8 `agent-sync.service.ts` `getSkillReferences()`：為 `prospec-new-story` 與 `prospec-ff` 各加 `{ templateName: 'metadata-format.hbs', outputName: 'metadata-format.md', title: 'Metadata (metadata.yaml) Format' }` ~12 lines

## Lib (build 產物)

- [x] T9 [M] 執行 `pnpm bundle` 重生 `src/lib/bundled-templates.ts`，納入 `metadata-format.hbs` 字串 ~5 lines

## Regen

- [x] T10 [M] 執行 `prospec agent sync`（或 `pnpm ...` 對應指令）重生 `.claude/skills` 與 `.agents/skills`（含各 skill `references/metadata-format.md` 與更新後 SKILL.md）~5 lines

## Verification

- [x] T11 [V] `pnpm typecheck` 0 errors、`pnpm test` 全綠（T1–T3 轉 GREEN）、`pnpm lint` clean ~5 lines
- [x] T12 [V] mutation-verify（PB-001）：暫移除 map 其一條目確認 T1/T2 轉紅、還原後轉綠 ~5 lines
- [x] T13 [V] grep 確認 new-story/ff deployed SKILL.md 含 metadata-format 載入指示；比對 reference 欄位集與 `ChangeMetadataSchema` 一字對應（SC-002/SC-003）~5 lines

## Summary

- **Total Tasks:** 13（code 6、manual 2、verification 3、test 3 中 test 屬 code）
- **Code tasks（完成率分母）:** T1–T8（8）
- **Manual [M]:** T9, T10
- **Verification [V]:** T11, T12, T13
- **Total Estimated Lines:** ~204 lines
