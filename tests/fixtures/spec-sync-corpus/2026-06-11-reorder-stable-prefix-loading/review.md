# Review: reorder-stable-prefix-loading

**Rounds:** 4 / cap 5   **Status:** review-clean

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/templates/skills/prospec-plan.hbs:23（重排腳本把「Do NOT」段落錯置於清單中間——CommonMark 下 item 4-8 淪為段落延續行，且違反 REQ-081「僅順序變更」） | critical | correctness / spec-architecture | fixed — 段落歸位 + 新增 13 條 contiguity 斷言防回歸（mutation 驗證轉紅）；agent sync 已重部署 |
| README.md:300（「_index.md 為 boundary 後第一位」與 3/13 模板實況不符；plan/knowledge-update 的 DYNAMIC 段首是 change artifacts） | major | spec-architecture（文件/實作一致性 + 次級 cache 排序機會） | proposed → verify WARN（建議採選項 a：plan 與 knowledge-update 把 _index 移至 DYNAMIC 段首，cache 最優且讓文件為真；knowledge-generate 因 raw-scan 守門豁免） |
| tests/contract/skill-format.test.ts:1240（itemKey 只取第一個 backtick——review 合併項尾部與 ff 子彈點刪除不會被集合斷言抓到） | major | maintainability（false-green） | proposed → verify WARN（建議 key 改為全部 backtick join + 重建 fixture） |
| notes.md:13-21（runbook 四條 `pnpm measure:tokens -- --provider` 指令——pnpm 轉發字面 `--`，parseArgs 視為未知選項 exit 1，照抄必死） | critical | runbook 程序正確性 | fixed — parseArgs 容忍裸 `--`（雙形式相容）+ runbook/docstring 指令修正；實證驗證 |
| notes.md:11-17（runbook 缺「先 commit」前置——before hash 即 dirty HEAD，checkout 為 no-op，before 被污染且兩報告 git_commit 相同違反 REQ-008 AC2；檔名不落 gitignore pattern） | critical | runbook 程序正確性 / REQ 矛盾 | fixed — 前置條件明文 + 檔名改 `measurement-report.*.json`；verifier 確認後修復 |
| README.md:307 / README.zh-TW.md:289（「效益由量測證明」過度宣稱——harness corpus 不含 `.hbs`，且 assembleProspec 順序重排前後不變，before/after 物理上量不到模板重排本身） | major | spec-aware（量測歸因） | resolved — 人工核可後套用 deliberate-exclusion 措辭（雙語 README + notes.md 範圍限定 + 量測狀態預期註記） |

## Round 1（full pass，mode B：correctness / security / spec-architecture / maintainability）

- 1 critical 經獨立 verifier 三項主張逐一 `[confirmed]`（含 HEAD 對照與「現行套件對此缺陷全綠」的 false-green 實證）後修復。
- 語意稽核全數乾淨：13 模板重新編號正確、子清單附著正確、無 stale 編號引用（knowledge-generate 的「Step 4」指向 Core Workflow 標題非載入清單）、raw-scan 守門語意保留、分類與判準一致（.prospec.yaml 一律 DYNAMIC、review 合併項因動態半部正確歸 DYNAMIC）、glossary 插入位置符合「STABLE 段尾」、`--prospec-glossary` 報告路徑推導安全。

## Round 2（收斂確認）

- 修復後 contract 318/318、全套 **711/711 綠**；agent sync 重部署完成。
- 收斂證據採確定性 mutation 循環取代 LLM narrow pass：重現原缺陷（段落插入清單中）→ contiguity 斷言轉紅 → 還原 → 綠。該缺陷類別已由測試永久看守。

## 每輪修復後驗證

- lint ✓ / typecheck ✓ / `pnpm test` 711/711 ✓

## Round 3（final full pass，鎖定低稽核面：runbook / 雙語 README / contiguity 斷言品質 / fixture / 旗標邊角）/ Round 4（實證收斂）

- 2 新 critical（皆在量測 runbook）經 verifier 逐項 `[confirmed]`（含 pnpm `--` 轉發實測）後修復；Round 4 以實證收斂——原失敗指令現正確執行至 no-key 邏輯、711/711 綠。
- 1 新 major：harness 物理上量不到模板重排（corpus 無 `.hbs`、assembleProspec 順序未變）——README「效益由量測證明」過度宣稱 → verify WARN。
- 正面確認：`ddc9dc4` 確為 before 快照 ancestor（補量可行）、contiguity 斷言無 false-green/false-red 路徑、雙語 README 等價、fixture 跨平台健全、glossary 旗標全邊角正確、13 個部署端 SKILL.md 標注同步。

## 跨 change 觀察（餵 /prospec-learn 的素材）

- 「contract 斷言 false-green」第三度出現（Story A round-5 兩條 + 本次 critical 的未被抓 + itemKey major）——與 PB-001 同根因，頻次已達晉升門檻，建議 `/prospec-learn` 評估升級 PB-001 的適用範圍（從「斷言要 section-scoped」擴至「斷言要覆蓋結構完整性，不只內容存在性」）。
- **後續 story 候選：跨任務部分前綴量測模式**——現行 cold/warm 為 identical 重送，順序不影響結果，量不到重排的真實效益；新模式對同一 skill 以兩個不同任務的動態內容連送，量第二次的 cache_read，重排前後各跑一組即得直接效益。同一模式可把 glossary 對照從成本面升級到收益面。corpus 需擴充模板組裝來源（entry config + SKILL.md + Startup Loading 序列）。約 standard 規模，沿用既有 adapters/accounting。
