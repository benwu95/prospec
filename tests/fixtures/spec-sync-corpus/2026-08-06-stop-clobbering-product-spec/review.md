# Review Findings: stop-clobbering-product-spec

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
| F-1 | src/services/archive.service.ts:494 | critical | security | fixed | CRLF 的 product.md 讓條目標題比對全數落空，人工描述句被換成 TBD、last_updated 也不刷新；splice 現改為以 LF 處理並在寫出時還原原檔換行風格。 |
| F-2 | src/services/archive.service.ts:455 | critical | security | fixed | 掃描來源缺席被當成「沒有任何 feature」，整段人工 Feature Map 被覆寫成 placeholder；現比照 syncFeatureMap，features 目錄不存在時完全不改寫既有檔案，並同步修正 parseFeatureSpecFrontmatter 的 CRLF 解析。 |
| F-3 | src/services/archive.service.ts:509 | critical | security | fixed | FEATURE_LINK_RE 未錨定尾端，任何以連結開頭的交叉引用句整行被當作機器連結吃掉且綁錯 slug；正則已雙端錨定。 |
| F-4 | src/services/archive.service.ts:474 | major | correctness | fixed | 未關閉的 fence 遮蔽全文尾端，使 `## Feature Map` 找不到而每跑一次就在檔尾追加一段，檔案無上限成長；新增 lib 的 hasUnclosedFence，遮蔽不可信時降級讀原始行。 |
| F-5 | src/templates/skills/references/product-spec-format.hbs:15 | major | docs-claims | fixed | `## Feature Map` 區段內非條目的人工引言／表格會被靜默刪除，格式規範未告知；已在 Generation Mode 明文標示整段為機器擁有、只有 per-entry 描述會被保留。 |
| F-6 | src/services/archive.service.ts:444 | major | correctness | fixed | `./features/`、帶 link title、ASCII `->` 等人工連結寫法比對不到，導致條目出現兩行重複連結；正則已容納這些形式。 |
| F-7 | tests/unit/services/archive.service.test.ts:1189 | major | test-quality | fixed | 排序斷言是 false green（memfs readdir 本就字典序，刪掉 .sort() 全綠）；改以 mock 打亂的 readdir 結果驅動，mutation 刪除 .sort() 後轉紅。 |
| F-8 | src/services/archive.service.ts:457 | major | test-quality | proposed | filter chain 中 `!isArchivedSpec(f)` 是死條件（`_archived` 開頭必先被 isSafeResourceName 擋下），與 syncFeatureMap 同源；保留作為結構對稱與 ARCHIVED_PREFIX 變更時的防線，但測試不再宣稱有釘住它。 |
| F-9 | src/services/archive.service.ts:545 | major | test-quality | fixed | refreshLastUpdated 的兩條規則（只在 frontmatter 區塊內刷新、鍵不存在不補寫）皆無測試，兩個 mutation 全綠；已補上兩個對應測試。 |
| F-10 | src/services/archive.service.ts:909 | major | test-quality | fixed | 「讀寫失敗維持 non-fatal」無覆蓋，而 splice 新增了讀取既有 product.md 這個 throw 點；已補 execute() 在 product.md 不可讀時仍完成封存的測試。 |
| F-11 | src/services/archive.service.ts:527 | major | test-quality | fixed | renderFeatureMap 的 byTitle 後備比對從未被測試走到，刪掉全綠；已補「條目完全沒有連結行時仍以標題保住描述」的測試。 |
| F-12 | src/services/archive.service.ts:494 | major | test-quality | fixed | parseFeatureMapEntries 內兩處 fence-masking 無測試（改讀 raw 行皆全綠）；已補 fenced 範例含 `###` 與連結時不得切錯條目、不得綁錯 slug 的測試。 |
| F-13 | tests/contract/skill-format.test.ts:604 | major | test-quality | fixed | frontmatter 所有權斷言空洞（一句話即可滿足，實測整段換成單句仍全綠）；改為逐鍵具名＋bootstrap/refresh 分工＋否定斷言。 |
| F-14 | src/templates/skills/references/product-spec-format.hbs:15 | major | test-quality | fixed | REQ-SPEC-011 的「Feature Map 是唯一 machine-owned region」零契約覆蓋，整段 Generation Mode 可回退成舊措辭而全綠；已補 section-scoped 正負斷言。 |
| F-15 | src/services/archive.service.ts:457 | major | maintainability | fixed | scanActiveFeatures 把 syncFeatureMap 的掃描 filter chain 逐字手抄（PB-006）；已抽出單一 listFeatureSpecFiles helper 供兩者共用。 |
| F-16 | src/services/archive.service.ts:623 | critical | spec-architecture | fixed | bootstrap 寫出 `version: TBD`，卻同時在自己出貨的規範與 delta-spec 宣稱 version「永不生成」，程式與契約自相矛盾；已改為明述 bootstrap 種下 TBD 佔位、其後只再寫 last_updated。 |
| F-17 | prospec/ai-knowledge/_glossary.md:15 | major | docs-claims | fixed | 信任區 _glossary.md 兩處仍寫 product.md「由 archive 自動再生」與 Phase 3.6「再生 Product Spec」；已改為 Feature Map 同步的正確敘述。 |
| F-18 | prospec/specs/features/sdd-workflow.md:330 | major | docs-claims | fixed | REQ-CLI-024 的 WHEN/THEN 仍寫 `product.md regeneration` 且不在 MODIFIED 清單中、無畢業載體；已補上 REQ-CLI-024 MODIFIED 條目（原 body 逐字保留，只改該句）。 |
| F-19 | prospec/specs/features/sdd-workflow.md:288 | major | docs-claims | fixed | US-6 的 acceptance scenario 仍寫 auto-regenerate 且 US 層文字無畢業載體；已於本變更手動收斂。 |
| F-20 | src/lib/markdown-fences.ts:66 | major | spec-architecture | fixed | 新增的公開匯出 hasUnclosedFence 無任何測試，違反 Constitution「Every public function ships with tests」；已補 markdown-fences 的三組測試並新增 REQ-LIB-043。 |
| F-21 | prospec/ai-knowledge/modules/lib/README.md:51 | major | parallel-site | fixed | lib 實際受影響但不在 plan/delta-spec 的模組清單中，README 對 markdown-fences 的匯出列舉就此過時；已補 REQ-LIB-043、plan 模組表與 README 敘述。 |
| F-22 | src/services/archive.service.ts:588 | critical | correctness | fixed | round-2 的 CRLF 修復以 `content.includes('\r\n')` 當全檔判準再整檔轉換，混合換行的檔案每一行都被改寫（違反 AC1）；改為以 raw 行＋`\r`-stripped probe 比對，未被 splice 的行逐 byte 保留自己的行尾。mutation：移除 per-line 保留 → 轉紅。 |
| F-23 | src/services/archive.service.ts:503 | critical | correctness | fixed | setext 形式的 h2（文字下方 `------`）不被當作區段邊界，Feature Map 區段一路吃到 EOF，最後一個 feature deprecated 時把其後所有作者章節整段刪除；新增 topLevelHeadings 同時辨識 ATX 與 setext。mutation：停用 setext 分支 → 轉紅。 |
| F-24 | src/services/archive.service.ts:462 | major | correctness | fixed | round-2 對未關閉 fence 的「退回 raw lines」讓 fence 內的 `## ` 變成區段終止點，產生重複 link 與孤兒 fence opener；改為偵測到未關閉 fence 即完全不寫，並在 dry-run 以 `skip` 揭露。 |
| F-25 | src/services/archive.service.ts:500 | major | correctness | fixed | 標題以精確字串比對，`##  Feature Map`、`## Feature Map ##`、前導縮排等合法 ATX 寫法皆認不出而在檔尾長出第二個區段且永久固化；ATX 比對改為 CommonMark 容忍式。mutation：還原精確比對 → 轉紅。 |
| F-26 | src/services/archive.service.ts:452 | major | docs-claims | fixed | link title 只容忍雙引號，CommonMark 另兩種（單引號、括號）不被辨識而產生永久重複連結，與 JSDoc/delta-spec 宣稱不符；正則已納入三種分隔符並補測試。 |
| F-27 | src/lib/markdown-fences.ts:77 | critical | correctness | fixed | `scanFences` 的 regex 因 `.` 不匹配 `\r` 而看不見 CRLF 檔的 fence，使未關閉 fence 的拒寫在 CRLF 檔完全失效、每跑一次就追加一個重複區段；改為以 `\r`-stripped 視圖比對、仍回傳原行，一併修好所有 withoutFencedBlocks 呼叫端。mutation：還原為比對原行 → 轉紅。 |
| F-28 | src/services/archive.service.ts:616 | critical | correctness | fixed | 區段搜尋從第 0 行開始，YAML frontmatter 內若出現 `## Feature Map` 便成為 splice 目標，導致作者的 frontmatter 鍵被刪、YAML 損毀、真正的區段從未同步；新增 frontmatterEnd 遮蔽，掃描只從 frontmatter 之後開始。mutation：把 bodyStart 改回 0 → 轉紅。 |
| F-29 | src/services/archive.service.ts:619 | critical | correctness | fixed | `refreshLastUpdated` 以原始 probe 取索引卻寫入已 splice 的陣列，索引可能錯位甚至越界，把日期灌進文件本文；改為在 splice 前先刷新，索引恆對齊。註記：加上 F-28 的 frontmatter 遮蔽後，此順序調整已無可觀測差異（mutation 還原順序仍全綠），保留為結構性保險而非有測試釘住的行為。 |
| F-30 | src/services/archive.service.ts:498 | major | correctness | fixed | ATX regex 要求 `#` 後必須有空白，CommonMark 合法的空標題 `##`／`#` 因此不被視為邊界，其後整段作者內容被吞進機器區並靜默刪除；標題文字改為可選。mutation：還原必填空白 → 轉紅。 |
| F-31 | src/services/archive.service.ts:501 | critical | correctness | fixed | round-4 讓 ATX 標題文字變 optional 後，`###`／`####` 等純 hash 行被判為 h1/h2 邊界，導致條目被分隔線切開、下方條目的人工描述句遺失；ATX 比對改為 CommonMark 規則（marker 後須為空白或行尾）。mutation：還原 optional-text 版本 → 轉紅。 |
| F-32 | src/services/archive.service.ts:619 | critical | correctness | fixed | round-4 的 frontmatter 偵測以精確 `---` 比對，closer 帶尾隨空白時會鎖到 body 裡的 `---`，把真正的 `## Feature Map` 遮掉並在檔尾長出第二個區段；改以 `/^-{3,}\s*$/` 比對 closer。mutation：還原精確比對 → 轉紅。 |
| F-33 | src/services/archive.service.ts:624 | critical | correctness | fixed | 以 `---` 分隔線開頭的文件被誤判為 frontmatter，body 中以 `last_updated:` 起首的人工句子被改寫成今天日期；改為僅當該區塊讀起來像 YAML（允許 `#` 註解、需有 key 行、不得有純散文行）才視為 frontmatter。mutation：移除該檢查 → 轉紅。 |
| F-34 | src/services/archive.service.ts:1665 | major | correctness | fixed | `parseFeatureSpecFrontmatter` 的 `\s*` 會跨越換行，`feature:` 無值時靜默擷取下一行內容並當成 feature 名稱（實測產生 `### status: active` 這種垃圾標題）；改為只吃水平空白並允許空值。mutation：還原跨行比對 → 轉紅。 |
| F-35 | src/services/archive.service.ts:487 | major | correctness | fixed | feature 名稱為空時會渲染出裸的 `### `，下一次執行會把它讀成標題而改用 append，檔案無上限成長；改為回退使用 slug。mutation：移除回退 → 轉紅。 |
| F-36 | src/services/archive.service.ts:822 | major | maintainability | fixed | `listFeatureSpecFiles` 的 JSDoc 宣稱 filter 規則只有一份，但 `syncFeatureMap` 仍留著逐字複製的同一條 chain —— 兩個索引一致是巧合而非構造保證（PB-006 / PB-003）；已改為呼叫同一個 helper，獨立複審確認 predicate、slug 字串與 `.sort()` 完全等價。 |
| F-37 | .prospec/changes/stop-clobbering-product-spec/delta-spec.md:47 | major | docs-claims | fixed | REQ-TEMPLATES-175 的 Spec 點名「Output Contract checkbox」，但該區塊根本沒有 product.md 勾選項（實際在 Phase 3.6 Gate）；此段會逐字落進信任區，已改名為 Phase 3.6 Gate checkbox。 |
| F-38 | src/templates/skills/prospec-archive.hbs:118 | major | docs-claims | fixed | Phase 3.6 檢查項與 Gate 皆宣稱區段外內容「unchanged／preserved」，卻未提實際會刷新的 frontmatter `last_updated`，使勾選需要額外判斷；兩處均補上該例外。 |
| F-39 | .prospec/changes/stop-clobbering-product-spec/tasks.md:37 | major | docs-claims | fixed | tasks.md T16 仍留著同一個不存在的工件名稱「Output Contract checkbox」，且 tasks.md 會被 archive 成永久記錄；已一併更正。 |
