# Tasks：移除 archive.service 自動 knowledge-update 死碼

## Services

- [x] 移除 `archive.service.execute()` 的 auto knowledge-update 區塊（`knowledgeUpdated`/`knowledgeWarnings` 變數、`executeKnowledgeUpdate` 迴圈與前導註解）~25 lines
- [x] 移除 `execute()` 同段 raw-scan refresh 區塊（`rawScanRefreshed` 變數、`generateRawScan` 呼叫與註解）~12 lines
- [x] 從 `ArchiveResult` 型別與 return object 移除 `knowledgeUpdated`/`knowledgeWarnings`/`rawScanRefreshed`（含 JSDoc）；併同清除 orphan `ArchivedChange.scale`/`relatedModules` ~8 lines
- [x] 移除 orphan import：`executeKnowledgeUpdate`、`generateRawScan` ~2 lines

## Templates

- [x] 修正 `prospec-archive.hbs`：移除反向宣稱 blockquote、raw-scan safety-net 交叉引用、「mirrors the raw-scan refresh below」；保留仍為真的 `syncFeatureMap` safety-net 描述 ~10 lines
- [x] [M] 以 `prospec agent sync` 重生 `.claude/` + `.agents/` prospec-archive SKILL.md（不手動雙改 `.hbs`/SKILL.md）~5 lines

## Tests

- [x] 移除 `archive.service.test.ts` 中 raw-scan.service / knowledge-update.service 的 `vi.mock` 與對應 import（改為極簡 spy 供非呼叫斷言）~25 lines
- [x] 移除失效測試案例：raw-scan refresh 三案、knowledge-update forwarding/backfill-skip/warnings/no-delta-spec，config-less 案改為不含 knowledge-update 斷言 ~90 lines
- [x] 新增 regression 測試（archive.service.test + skill-format contract）：`execute()` 歸檔後 `executeKnowledgeUpdate`/`generateRawScan` 皆未被呼叫、`ArchiveResult` 不含三欄位；SKILL.md 無反向宣稱 ~35 lines
- [x] [V] 確認 `upgrade-output` / `knowledge-update.service` / `upgrade.service` 測試各自的 `rawScanRefreshed`（屬 upgrade，非 archive）未被波及

## Verification

- [x] [V] `pnpm typecheck` 全綠（`ArchiveResult` 消費端編譯通過）
- [x] [V] `pnpm test` 全綠（1985 tests）
- [x] [V] `pnpm lint` 全綠；`pnpm counts` 同步事實計數後 `pnpm counts:check` 綠
- [x] [V] grep 生成的 `SKILL.md` 無 archive-service auto knowledge-update / raw-scan safety-net 宣稱；根 `README.md` 無需同步（安全網描述屬 upgrade skill）

## Summary

- **Total Tasks:** 14（code 7、[M] 1、[V] 6）
