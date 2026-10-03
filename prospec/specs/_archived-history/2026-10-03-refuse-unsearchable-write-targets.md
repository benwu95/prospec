# refuse-unsearchable-write-targets — Archive Summary

- **Archived**: 2026-10-03
- **Original Created**: 2026-10-03T03:42:37.743Z
- **Quality Grade**: S
- **Issue**: #337

## User Story

身為下游專案中執行 `prospec knowledge update` 的開發者，
我希望知識目錄裡有我無權進入（search）的目錄時，指令在寫任何檔案之前就拒絕，並且點名那個目錄，
這樣我就不會留下寫了一半的知識庫，也知道要修哪個目錄的權限。

（US-2，P1：身為 prospec 維護者，我希望 `markModuleDeprecated` 寫入 root 內 symlink 目標檔的行為有測試保護。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Medium | `knowledge-reader.ts` 的 `resolveContainedTarget` 改以 `statSync` 錯誤碼分流：目標本身是 symlink 且錯誤碼非 `ENOENT` → `unobservable`（在該 link）；錯誤碼不在 `ENOENT`／`ENOTDIR`／`ENAMETOOLONG` → `unobservable`（最近可 `lstat` 的項目）；其餘交由祖先 walk，新增 `unreachableBelow` 判定最近存在祖先非目錄（`ENOTDIR`）或其下缺少的名稱超過 255 bytes（`ENAMETOOLONG`），各平台結果一致。`ContainedTarget` 新增 `{ reason: 'unobservable', code, blockedAt }` |
| services | Low | `knowledge-update.service.ts` 的 `containedTarget()` 在第一個分支處理 `unobservable`，訊息點名 `blockedAt` 與錯誤碼，remedy 為單一通用句「fix <blockedAt> so <label> resolves」 |
| tests | Medium | resolver real-fs 測試（search 權限、root 上層、非目錄元件、symlink 迴圈、link 穿過一般檔案、名稱 256／255 bytes、CJK 位元組、PATH_MAX）；新增 `tests/unit/services/knowledge-update.realfs.test.ts`（delta／manual 兩種模式寫入前拒絕、檔案樹不變、suggestion 點名 `blockedAt`）；`markModuleDeprecated` write-through memfs pin；6,950 → 6,975 tests |
| knowledge | Low | services／lib README 各一個子句；`pnpm counts` 同步測試計數；`services`、`lib`、`tests` 蓋章 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-023 | MODIFIED | 刪除「search permission … reads as absent」限制句，改為：目標路徑（含路徑上 symlink 的目標路徑）因「項目不存在」以外的原因無法解析時，寫入前以 `PrerequisiteError` 拒絕；兩條「建立」bullet 改為「無任何拒絕條件適用時」（Dropped 列出原文）；新增 search 權限、非目錄元件、symlink 迴圈、link 穿過一般檔案、名稱超過 255 bytes 五條 bullet |

## Completion

- **Tasks**: 11/11 code tasks（100%）；[V] 7/7（T10 standing gates 於 feature commit `ed579a58` 後重跑 `knowledge:check` 通過）
- **Acceptance Criteria**: 6/6 凍結情境（三次 verify 的 2/5 皆無 scenario_findings）

## Review & Verify

- **Review**: 4 個 loop、8 次 merge（CLI 的 origin round 編號到 7；fresh-subagent），累計 0 critical／1 major／10 minor，全數 fixed。R1-1（major）：`ELOOP` 豁免讓最後一段為 symlink 迴圈的目標通過預檢、在其他寫入後才失敗；開發者選擇拿掉豁免（只有 `ENOENT` 算不存在）。開發者選擇修正 minor 後，R1-2（Windows `ENOTDIR`）、R2-1（名稱過長在 mkdir 後才失敗）、R2-2（措辭）的修正又陸續帶出 R4-1（`ENOTDIR` 改走 walk 後，最後一段 link 穿過一般檔案被放行）、R5-1（依錯誤碼挑 remedy 對 link 指錯對象）、R6-1／R7-1／R7-2（Spec 措辭）。開發者詢問是否重新 explore；診斷為主規則已收斂，連鎖來自在 userland 模擬 OS 路徑解析；開發者選擇以刪除宣稱收斂（單一通用 remedy、Spec 不再宣稱點名哪個項目）。教訓記入 `.tasks/lessons.md`（2026-10-03）。
- **Verify**: Grade S（三次：首次、Knowledge 同步後、修正 minor 後）——1/5、4/5、5/5 machine PASS；2/5（1/1 REQ executable PASS、6 情境無偏差）、3/5（8 原則）fresh-subagent PASS；6 not-applicable；`pnpm test` exit 0。
- **Quality Log**: plan verifier WARN（5 條，全數套用：link 指向不可 search 目錄時 `lstat` 成功須改用 `stat`、分支順序造成 TS2339、兩條既有 bullet 須收窄等）；tasks verifier WARN（7 條，全數套用：T4 只比對 label 字串為空斷言、fixture 未登記 lib、快照遇 `EACCES` 會丟錯等）；review round 1 WARN（R1-1 待決），其餘各輪 PASS。另有一筆多出的 `prospec-review` PASS close：最終 review merge 因測試紀錄過期被拒，指令以 `| tail` 串接遮蔽了 exit code，`change log` 仍寫入；之後已依序重跑 merge／close／record-review。
- **Incident**: review round 2 的子代理因 zsh noclobber 誤跑舊的 mutation 腳本，`cd` 失敗後在主工作樹套用 4 個 mutation 並自行還原；ticket 收件比對內容 facet 一致，原始碼差異經人工比對無殘留。之後的委派 brief 都要求 `cd <snapshot> || exit 1` 與新命名的腳本。
- **Mutation**: 每個新分支都先備份，以 `diff`／grep 確認 mutation 已套用，再以 `cp` 還原並 `cmp` 驗證：預檢分流移除、`ELOOP` 豁免回復、service 分支移除、`markModuleDeprecated` 改回原路徑、isDirectory 檢查移除、名稱長度檢查移除、`>` 改 `>=`、PATH_MAX fallback 移除、`Buffer.byteLength` 改 `name.length`、目標 link 判斷移除、remedy 改點名 label，全數 killed。

## Knowledge Update

- `prospec/ai-knowledge/modules/services/README.md`、`modules/lib/README.md`、`modules/tests/README.md`、`module-map.yaml`、`prospec/index.md` 已在 feature commit 同步。
- 釋出時須在 release notes 揭露：知識目錄有無法查找的目錄或壞掉的 link 時，`knowledge update` 改為在任何寫入前拒絕。
- 若要徹底關閉「寫一半」這類缺陷：可另開 issue 探索交易式多檔寫入（暫存後一次 rename、失敗回滾）。
