# Review Findings: land-memory-only-knowledge

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
| F-1 | CONTRIBUTING.md:194 | major | docs-claims | fixed | 兩 commit 模式的第二個 commit 訊息樣板與實況相左（`docs(archive):` 於 2026-07-25 後停用）。已改為不宣稱 subject 形狀，改列舉其易變性並要求以 `git log` 為準。 |
| F-2 | CONTRIBUTING.md:203 | major | docs-claims | fixed | commit 訊息規則的交叉指向不完備（`_conventions.md` 只含四條中的兩條）。已改指 `CONSTITUTION.md` 的 `[MUST] Atomic Commits by Feature` Verify 段為規則來源。 |
| F-3 | CONTRIBUTING.md:210 | major | docs-claims | fixed | 「PR body 繁中」的理由越界引用 `[MUST] Language Policy`（該規則以 repo 路徑集合定義，PR body 不是路徑）。已改述為 house convention 並明確否定該推導。 |
| F-4 | prospec/ai-knowledge/modules/cli/README.md:50 | major | docs-claims | fixed | 「each mismatch is rejected by commander, not coerced」只對 1/3 成立，且 `learn upsert` 多帶 `status` 實為靜默剝除。已逐項改寫並補上 non-strict schema 的剝除行為。 |
| F-5 | prospec/ai-knowledge/modules/cli/README.md:50 | major | docs-claims | fixed | F-4 的修復把「rejected by commander」換成同樣不成立的全稱句「each mismatch surfaces at a DIFFERENT layer」——`learn upsert` 的 `PrerequisiteError` 與 `change story` 的 `AlreadyExistsError` 同屬 service 層，該句被自己後半的 `service layer too` 當場推翻。已弱化為為真的敘述。 |
| F-6 | CONTRIBUTING.md:199 | major | docs-claims | fixed | F-1 的修復寫的「currently phrased `docs(spec): graduate <subject> requirements`」在 git log 上已再度過期（9cb7d97 `chore: archive ...`、8002145 `docs(specs): archive ...`），等於用新的過期宣稱取代舊的。實測六週內用過四種形狀，已改為不再宣稱形狀本身。 |
| F-7 | CONTRIBUTING.md:208 | major | docs-claims | fixed | F-2 的修復寫的「_conventions.md restates only a two-rule subset — read the Constitution, not that one」屬過度宣稱：該檔 prefix 清單含 `perf:`/`ci:` 而 Constitution 的 Verify 括號清單沒有（repo 實際用過 5 筆 `ci:`），在 prefix 詞彙上是 superset。已改為不排序兩來源並指明完整 prefix 清單所在。 |
| F-8 | CONTRIBUTING.md:206 | major | docs-claims | fixed | 「A periodic `/prospec-learn` round lands its own separate `docs(knowledge): …` commit」是對易變事實的全稱斷言（實測用過 `docs(knowledge):`／`docs(learn):`／`docs:` 等多種前綴、無機制規定），且與緊鄰上一句剛承認 archive subject line「not standardised」自相矛盾。經人工裁決整句刪除——移除宣稱而非弱化，且該句本就超出「一個變更落成哪些 commit」的節範圍。 |
