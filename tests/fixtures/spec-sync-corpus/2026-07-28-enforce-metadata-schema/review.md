# Review: enforce-metadata-schema

**Rounds:** 4 / cap 3（最多 5，因使用者要求「全修 majors」而續跑）　**Status:** review-clean（0 unresolved critical，0 unresolved major）

收斂路徑：round-1 找到 1 critical + 5 majors；round-2 確認 critical 已修，並抓到 8 處文件不一致（含 1 處由 round-1 修正自身引入）；使用者要求全修 majors 後，round-3 判定 5 個 majors 全部 FIXED、無新 critical，另抓到 4 個新 majors（其中 3 個由那些修正引入），亦全數修畢。

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| `delta-spec.md:80`（REQ-TESTS-055 Description） | critical | spec-architecture | fixed（R1） |
| `delta-spec.md:82`（偏離記錄算術） | critical（衍生） | docs-claims | fixed（R2，修正引入） |
| `proposal.md:52`（US-3 live-scan 驗收） | critical（同類） | spec-architecture | fixed（R2） |
| `change-story.service.ts:104-106`（重複剝除器） | major | spec-architecture (PB-006) | fixed（R3） |
| `change-metadata.ts:39,57`（回傳剝除後投影） | major | data integrity (PB-003) | fixed（R3） |
| `types/change.ts:57-59,88-91`（陳舊註解） | major | docs-claims (PB-003) | fixed（R3） |
| `check.service.ts:197`（受不受支援的敘事矛盾） | major | correctness / spec-architecture | fixed（R3） |
| `prospec-verify.hbs:210`（omit not-applicable） | major | spec-architecture / docs-claims | fixed（R3） |
| `knowledge-reader.ts:31-34`（孤兒 JSDoc） | major | correctness | fixed（R4，修正引入） |
| `types/change.ts:115`（`.loose()` 關掉 excess-property 檢查） | major | type safety | fixed（R4，修正引入） |
| `types/change.ts:44,85-89`（loose 僅頂層，AC 過度宣稱） | major | docs-claims (PB-003) | fixed（R4，修正引入） |
| `prospec-verify.hbs:251`（Self-Check 仍寫三態） | major | PB-007 平行站點 | fixed（R4） |
| `change-story.service.ts:81-85`（spread 不受 excess-property 檢查） | major | correctness of fix | fixed（R5，修正實效落差） |
| `prospec-verify.hbs:140,155,195`（非 scale 跳過路徑未規範） | major | consistency | fixed（R5） |

---

## Critical（已修）

### `delta-spec.md:80` — REQ-TESTS-055 Description 記載了不存在的測試

**判定**：independent verifier `[confirmed]`。

REQ-TESTS-055 的 Description 為規範性語句（「回溯測試**需**掃描真實 `.prospec/archive/` 目錄，**因此**使用真實 temp dir 而非 memfs」），指定了一個具體機制並否定了實際採用的機制；但 shipped test 全程 memfs、無任何測試枚舉真實 archive 目錄（`grep -rn "\.prospec/archive" tests/` 六個命中皆為註解或政策路徑字串）。AC4 已在 implement 期改寫為實際行為，Description 漏改——同一 REQ 內部矛盾。

**為何是 critical 而非文件 nit**：`/prospec-archive` 會把 delta-spec REQ 逐字畢業進 `prospec/specs/features/**`（英文信任區），這段不實敘述會成為永久規格。

**修法**：Description 改為描述實際形狀，並補上與 REQ-SERVICES-067 同格式的 dated 偏離記錄，說明回溯掃描是一次性診斷（43 筆：29 通過／14 失敗），且**不宜**當常駐測試——綁定 gitignored 的本機 archive 內容會因他人機器的歷史資料而紅，對契約無鑑別力。

**平行站點**：verifier 另指出 `plan.md:67` 與 `proposal.md:88` 帶同一句陳舊敘述，一併修正；複查再抓到 `plan.md:41` 的「五處讀寫點」陳舊計數。

---

## Round 2（窄幅複審）

判定：**Q1 RESOLVED ／ Q2 INCOMPLETE ／ Q3 NEW-ISSUE** → 修正後 review-clean。

### Q3（最重要）：round-1 的修正自己引入了一個不成立的算術

我在偏離記錄寫「43 筆：29 通過、14 失敗……**14 筆失敗中**，1 類是契約自身缺陷」。這在算術上不可能——被 `DIMENSION_RESULTS` 救回的那筆（`2026-07-06-include-tests-in-typecheck`）修正後屬於 29 個 pass，不可能同時是 14 個 fail 之一；若它真在 14 之內，pass 應為 28 而非 29。複審者重跑掃描獨立確認。

正確敘述（已改）：首掃 **28 通過／15 失敗** → 修契約缺陷後該筆轉綠 → **29 通過／14 失敗，剩下 14 筆全屬歷史資料缺陷**。這與我自己 implement 期兩次掃描的輸出一致（先 15 fail、後 14 fail），是撰寫偏離記錄時的疏漏。

### Q2：修正未掃全平行站點（8 處）

`proposal.md:52` 的 US-3 驗收情境仍寫「既有 archive 全數逐一驗證 THEN 全數通過」——與原 critical 同類（程式碼牴觸的 live-scan 準則），複審者明指應在 verify 前修掉而非當 WARN 帶過。其餘為 `plan.md` 的「五個呼叫點」計數（2 處）、archive 仍列為遷移範圍（1 處）、「由測試回溯確認／修資料」原則（2 處）、tests 模組描述（1 處），以及 `proposal.md` 的 archive lossy 敘述（1 處）。全數已修，並順帶結案 Open Questions 與一則已定案的 Edge Case。

### 教訓

critical 的修正本身也要走同一套平行站點紀律（PB-007）。我只修了 verifier 點名的三個檔案中的三行，沒有對「同一句陳舊敘述還出現在哪裡」做完整 grep——結果留下 8 處，其中一處還是新寫錯的。

---

## Round 3–4（全修 majors 後的複審與收尾）

Round-3 判定五個 majors 全部 FIXED、無新 critical，但抓到 4 個新 majors——**其中 3 個是那些修正自己引入的**。這是本次 review 最有價值的一輪：

- **孤兒 JSDoc**：抽 `stripCellEmphasis` 時把函式插進了 `isSafeResourceName`（path-traversal 防護）的 JSDoc 與宣告之間，使該安全防護的 REQ-MCP-002 AC4 追溯註解懸空。已把函式移到防護之後。
- **`.loose()` 反噬型別安全**：zod 的 `.loose()` 會為推導型別加索引簽章，於是 `const m: ChangeMetadata = { ..., scal: 'quick' }` 編譯期與執行期**雙雙放行**——比修正前更糟。改為保留 `NewChangeMetadataSchema` 嚴格視圖給建構端（`change-story`），並以 `@ts-expect-error` 守衛釘住（mutation 驗證：退化後該指令變成未使用，typecheck 轉紅）。
- **`.loose()` 只作用於頂層**：巢狀的 `quality_log[]`／`review_provenance`／`dimensions[]` 仍會剝除未建模鍵，所以我寫的「解析視圖不與磁碟分歧」是過度宣稱。改用 `z.looseObject` 讓三層巢狀 schema 一致，並補測試釘住；`warnings` 的 `.default([])` 保留但明載為「只增不減」的刻意例外。
- **PB-007 平行站點再度漏網**：修了 `prospec-verify.hbs:210` 卻漏掉同檔 251 行的 Self-Check「each dimension graded PASS/WARN/FAIL」，那行正好會重新引入「未檢查的維度讀起來像通過」。已修並重新 `pnpm bundle` + agent sync。

## Round 5（最終）

Round-4 判定四項全 FIXED、review-clean、無 critical，但再抓到兩個 major：

- **`satisfies` 之前的嚴格型別在該站點形同虛設**：TypeScript 的 excess-property 檢查**不適用於 spread 成員**，而 `change-story` 的兩個選填鍵（`related_modules`／`description`）恰好全走條件式 spread——也就是我的 N2 修正唯一能保護的兩個鍵，正好是它保護不到的。必填鍵的錯字本來就會被 missing-property 攔下，所以修正實際上零收益，而 AC7 宣稱「建構端錯字編譯期即攔」是過頭的。改用 `satisfies Partial<NewChangeMetadata>` 標註每個 spread 主體（不能改寫成 `description: undefined`——`stringifyYaml` 會輸出 `null`，改變落盤格式）。mutation 驗證：在 spread 裡打錯字現在會噴 TS2561。
- **`not-applicable` 規則只涵蓋 scale 一種跳過原因**：模板另有兩條非 scale 的跳過路徑（`ui_scope: none` 跳維度 6、無 Knowledge 模組跳 4/5），對這兩者該記 `not-applicable` 還是省略完全沒規範，兩次 verify 可能寫出不同的 `dimensions`。已把模板與 reference 的措辭擴及所有跳過原因。

### 累積教訓（建議餵給 `/prospec-learn`）

**PB-007 型失誤在本次 review 出現四次**：實作期漏掃 index.md Module 欄的第二個 consumer；R2 修 critical 時漏掃同一句陳舊敘述的其他出現處；R3 修模板時漏掃同檔第二處三態宣告；R5 的 spread 落差則是同一模式的變形——套用了不變量，卻沒驗證它在**每個實際入口**都真的生效。共同根因是「修了被點名的那一處，沒回頭問這個不變量還在哪裡出現、以及它在那裡是否真的成立」。

**第二個模式：修正本身需要與原始程式碼同等的審查強度。** 九個 major 裡有四個（孤兒 JSDoc、`.loose()` 反噬型別安全、`.loose()` 只及頂層、spread 落差）是修正引入的，另有一個 critical 衍生錯誤（偏離記錄的算術）同樣如此。若 review 在 round 2 就收手，這五個都會進到 verify。

---

## Majors（全部已修，原始記錄保留）

### 1. `change-story.service.ts:104-106` — 與 `lib` 既有剝除邏輯重複且字元集分歧（PB-006）

`src/lib/knowledge-reader.ts:198` 的 `parseIndexModules` 早已剝除 index.md Module 欄（`raw.replace(/\*\*/g, '').trim()`），新增的 `stripMarkdownEmphasis` 是第二份實作，且字元集更寬（`[*`~]`）。今日 index.md 只用 `**`，兩者結果一致，故無現行 bug；但這是 PB-006 要防的漂移風險，方向還是 services 手抄 lib。**已獨立讀碼確認屬實。**

建議修法：把剝除函式提到 `lib` 匯出一次，兩處共用。

### 2. `change-metadata.ts:39,57` — `readChangeMetadata` 回傳的是 zod 剝除後的投影

`assertValidChangeMetadata` 回傳 `parsed.data`，會剝掉未知欄位並注入 `warnings: []` 預設；但模組標頭宣稱「Validation is a gate, never a rewrite」。現行四個呼叫點都不做 read-modify-write，故無現行資料損失；但 `readChangeMetadata` 與 `writeChangeMetadataObject` 並列匯出，下一個作者的直覺組合會靜默丟失 `archived_at` 等欄位。

建議修法：`ChangeMetadataSchema` 加 `.passthrough()` 並補一條 `metadata.custom_field` 的正向斷言；或明確在 JSDoc 標註 `metadata` 是投影、`doc` 才是忠實視圖。

### 3. `types/change.ts:57-59,88-91` — 註解仍宣稱「read time 不驗證」

proposal 引為動機的那句註解仍在檔案裡，現在陳述與程式碼相反。下一個作者可能據此再寫一個 cast 站點，重新引入本變更移除的問題。

### 4. `check.service.ts:197` — 敘事矛盾：缺 `created_at` 究竟受不受支援

`--record-review` 現在會對缺 `created_at` 的 metadata 拋錯（既有 fixture 必須補欄位才綠，即為佐證），但 `archive.service.ts` 新增註解說該狀態「supported by design」。行為改變本身符合 US-1，但兩處敘述不能並存。

建議修法：保留嚴格行為，把 REQ-SERVICES-067 AC2 改為明確載明四個遷移站點現在會拒絕 pre-schema 紀錄，archive 措辭改為「終端站必須吸收前站現在會拒絕的紀錄」。

### 5. `prospec-verify.hbs:210` — 模板與 REQ-TYPES-064 的理由互斥

模板字面寫「omit a `not-applicable` dimension」，而 REQ-TYPES-064 以「verify 明文強制該值」為放寬 schema 的依據。schema 放寬本身正確（真實 archived 紀錄確有此值，見 `2026-07-06-include-tests-in-typecheck`），但引用的依據不準確。**已獨立讀碼確認屬實。**

建議修法：模板改為 `PASS`/`WARN`/`FAIL`/`not-applicable` 並註明「never omitted, never PASS」，`pnpm bundle` + agent sync 後重生；REQ 的理由改引 archived 紀錄為證。

---

## 未列入（reviewer 明確回報乾淨）

四個遷移站點皆在 `readChangeMetadata` 前以 `fs.existsSync` 守缺檔；無站點在 `doc.set` 後重讀 `metadata`；`change-story` 物件字面的鍵序符合 metadata-format 的 canonical order；`stripMarkdownEmphasis` 的字元集與 `BareModuleNameSchema` 的拒絕集一致，producer 無法產出自身 schema 拒絕的值；`related_modules` 的 PB-007 掃描只有 `knowledge-update.service.ts:399-417` 一個真實下游消費端，本變更修好而非弄壞它；被移除的匯入皆為真孤兒。
