# Change Notes: reorder-stable-prefix-loading

## Before 快照（REQ-MEASURE-008）

- **before commit**: `650fc3859fa8f860fb440755a1353f0db9fe5532`（重排前 HEAD，晚於 harness 合併點 `ddc9dc4` ✓）
- 記錄時間：2026-06-11（重排實作開始前）

## 量測程序（有 API key 時執行）

**前置條件**：重排改動已 commit 至 `feat/token-measurement`，且 `git status --porcelain` 為空——
否則 checkout before 快照不會還原 working tree（before hash 即重排前 HEAD，dirty 檔案原樣保留），
before 報告會被重排後內容污染，且兩份報告 `git_commit` 相同，違反 REQ-MEASURE-008 AC2。

```
# before（checkout 重排前快照）
git checkout 650fc3859fa8f860fb440755a1353f0db9fe5532
pnpm measure:tokens --provider <p> --report measurement-report.before.json

# after（回到重排後 HEAD）
git checkout feat/token-measurement
pnpm measure:tokens --provider <p> --report measurement-report.after.json

# glossary 對照（同快照兩組，REQ-MEASURE-009）
pnpm measure:tokens --provider <p> --report measurement-report.no-glossary.json
pnpm measure:tokens --provider <p> --prospec-glossary --report measurement-report.with-glossary.json

# 檢視
prospec measure --report <each>
```

（檔名採 `measurement-report.*.json` 前綴以落入 `.gitignore` 的 `measurement-report*.json` pattern。）

約束：同 provider、同 model、同 corpus（sdd-tasks-v1）；對照記錄只引用報告數字、不設門檻；無改善亦如實記錄。
範圍限定：harness corpus 不含 skill 模板（`src/**/*.ts` + `prospec/**/*.md`），before/after 對照量的是 prospec 組裝管線整體，非模板 Startup Loading 重排本身；模板層 cache 效果屬部署端行為，不在本 harness 可觀測範圍（量級驗證需「跨任務部分前綴」量測模式，列為後續候選）。

## 量測狀態

- [ ] before 報告（pending：無 API key 環境，待補量；**預期與 after 無顯著差異**——重排不在量測範圍，對照僅驗證組裝管線無回歸）
- [ ] after 報告（pending）
- [ ] glossary 兩組對照（pending）

## entry config 檢查（REQ-TEMPLATES-082）

- 檢查日期：2026-06-11
- `entry.md.hbs` 全部變數：project_name、tech_stack.*、artifact_language、constitution_path、knowledge_base_path、skills（name/description/type/triggers/references）
- **全數於 `agent sync` 時解析，無 per-trigger 變動值**（無時間戳、無 change 狀態、無 session 值）
- Available Skills 區段僅隨 skill 集變動 → 判定 [STABLE]，零改動

