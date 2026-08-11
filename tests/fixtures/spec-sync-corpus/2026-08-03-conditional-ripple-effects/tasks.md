## Templates

- [x] 修改 `src/templates/knowledge/module-readme.hbs`，將 `## Ripple Effects` 區塊加上 `{{#if relationships.used_by.length}}` 判斷，並移除原本無依賴時輸出的 fallback 文字 ~10 lines

## Tests

- [x] 修改 `tests/contract/knowledge-format.test.ts` 的現有測試，確保當有下游依賴時渲染 Ripple Effects ~10 lines
- [x] 在 `tests/contract/knowledge-format.test.ts` 新增測試案例，確保當下游依賴為空時，不渲染 Ripple Effects 標題 ~15 lines
- [x] [V] 執行單元測試確認合約行為如預期運作 ~5 lines

## Summary

- **Total Tasks:** 4
- **Parallelizable Tasks:** 0
- **Total Estimated Lines:** ~40 lines
