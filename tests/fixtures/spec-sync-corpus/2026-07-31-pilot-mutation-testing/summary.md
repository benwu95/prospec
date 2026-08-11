# pilot-mutation-testing — Archive Summary

- **Archived**: 2026-07-31
- **Original Created**: 2026-07-31
- **Quality Grade**: A

## User Story

US-1：作為想確認某個模組的測試是否真的有效的維護者，我要一個可直接執行的 mutation testing 設定且其成本以實測數據標示，以便在值得的時候拿到「作者想不到的變異」這種只有工具給得起的訊號，而不誤以為它適合每次變更都跑。

US-2：作為依賴 review 判斷測試品質的開發者，我要「宣稱做過 mutation 驗證者須列出實際套用的變異」成為 finding 的內容規則，讓「誰挑的變異、挑了什麼」從不可見的作者自述變成可稽核的內容。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Medium | `review-format` finding 格式新增「列出變異」規則（主體＝reviewer 產出）；`review-lenses-content` 準則表新增「空洞通過」列（主體＝變更）與具名路標 |
| tests | Medium | 準則列集合的版控基準比對、路標指涉正確性、列舉 workflow 目錄的非閘門斷言 |
| （根目錄） | Medium | `stryker.config.json`、`pnpm mutate` 腳本、兩個 devDependency、`.gitignore` 兩條 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-169 | ADDED | 變異申報為 finding 內容規則；空洞通過為準則表條目 |
| REQ-TESTS-066 | ADDED | Stryker 以隨選稽核出貨，非閘門由列舉式契約測試釘住 |

## Completion

- **Tasks**: 7/7 code tasks（100%）；`[M]` 2、`[V]` 2 皆已完成
- **Acceptance Criteria**: US-1 3/3、US-2 3/3；2/5 獨立評分者逐 AC 附 `file:line` 或實跑輸出

## Review & Verify

- **Review**: **3 輪**、18 筆 findings（5 critical、11 major、2 minor），全數解決。
  核心事實：**同一個因果宣稱錯了三次，三次都是同一個根因——沒讀工具自己印出來的東西**。
  r1 揪出四個 critical，其中最嚴重者是文件記載的入口 `pnpm mutate -- <path>` 從未成功執行過（pnpm 11 原樣傳遞 `--`，commander 報 `too many arguments`），而 T11 `[V]` 已勾選宣稱驗過——當時驗的是底層 `npx stryker run`，不是文件寫的那個。成本四個數字亦全錯（取自加上 `coverageAnalysis: perTest` **之前**的 spike，改了設定卻沒重測，tests-per-mutant 誤差六倍）。
  r2 判定「修正本身」再現同族缺陷：取代版宣稱「驅動因子是 mutant 密度，不是測試觸及廣度」，而產生那些數字的同一次執行就印了 `Detected 26 static mutants (46% of total) ... enable "ignoreStatic"`；dry-run 更直接否定之（date-utils 57 個測試／net 0.08s vs task-markers 416 個／net 54.2s）。r2 另揪出兩處 **PB-007 漏站**——r1 只修 finding 點名的檔案，`tasks.md` 兩處舊數字與五個規劃站點的舊設計全部存活；成因是 `grep -rn` 在本 shell 靜默漏掉 CJK 行（回報「沒找到」而非「讀不了」），已改用 locale-safe 掃描。
  r3（由 2/5 評分者發現）第三次修正逾時機制：`timeoutMS` 不是上限，實為 `timeoutFactor(1.5) × netTime + timeoutMS + overhead ≈ 144s`（`mutant-test-planner.js:124`，static mutant 的 netTime 為整個未收斂套件），正常執行僅在其 38%。以 JSON reporter 取得逐 mutant 資料收束：11 個逾時全為兩個模組層級常數上的 Regex mutant，且每一個都**放寬**匹配範圍。
- **Verify**: Grade **A**。Machine ledger 1/5 PASS · 4/5 WARN（templates README 已於工作樹同步且與原始碼同一 commit 落地，check 比對的是已提交時間戳）· 5/5 PASS。Judgment ledger 2/5 **WARN**（fresh context，逐 AC 附證據並自行重跑每個可量測宣稱，數字多數逐位相符；唯一失分為逾時機制錯誤，已於評分後修正但**不重新評分**——避免形成「改到 PASS 為止」，那正是雙裁決者分工要防的）· 3/5 PASS（6/6 條 Constitution 規則）· 維度 6 not-applicable（`ui_scope: none`）。
- **Quality Log**: review r1 WARN、r2 PASS、r3 PASS；verify grade A、2 筆 WARN。

## Knowledge Update

已同步：`prospec/ai-knowledge/modules/{templates,tests}/README.md`。

## Notes

- **出貨的與刻意不出貨的**：`--ignoreStatic` 實測快 8.6 倍（549s→63.8s）但**未**寫入設定預設值——它讓 26 個 mutant 未受測且回報為存活、score 從 89.47 砍到 45.61，等於把「昂貴但有測」換成「便宜且假裝測過」，正是本變更反對的東西。以文件記載其槓桿與代價，是否另立 `mutate:fast` script 列為後續。
- **釘住「不做某事」的決定**：非閘門若只寫在文件裡，日後任何人都能在 workflow 加一步而無人察覺。契約測試改為**列舉** `.github/workflows/` 全部檔案（r1 原只點名 `prospec-check.yml`，而 `ci.yml` 才是真正的閘門——變異證實插入步驟後測試仍全綠）。數量斷言 `>= 3` 亦移除：它是對合法整併的絆索而非空洞守衛，真正的守衛是具名 `toContain('ci.yml')`。
- **守衛要釘不變量，不要釘措辭**：AC1 原以負向 grep `/names? the mutations/` 擋住被禁止的列，reviewer 僅將該詞改為 `list the mutations` 即全綠、缺陷完全復原。改為對準則列集合做版控基準比對——這正是該表**自己第二列**開的處方（item-set vs a version-controlled baseline）。
- **規則的主體決定它住在哪裡**：「列出變異」的主體是 reviewer 自己的產出，而 critical/major 依定義是對**變更**提出的 finding 的權重——放進準則表會得到一個填不出去的嚴重度。移入 `review-format` 的 finding 內容規則後才有施力點。路標亦須**具名**指涉（`the **mutation-verified** criterion`），位置式的「the row above」會隨增列無聲漂移。
- **`.gitignore` 兩條都是修正而非整理**：`.stryker-tmp/`（sandbox 為整個 repo 副本，實測 1,902 檔）與 `reports/`（json/html reporter 輸出）——`computeChangeDigest` 以 `git ls-files --others --exclude-standard` 列舉並讀取每個未追蹤檔案，不加則跑一次 mutation 就讓 review/test provenance 假紅，由一個沒碰任何原始碼的工具造成。後者是前者的同族漏站，改用 json reporter 時當場浮現。
- **畢業時的收斂**：`**Spec:**` 原含機器專屬的絕對耗時（9m09s／63.8s），2/5 指出在別台機器無法重現（該評分者實測 8m18s／60s）。畢業時改為比例＋「須註明量測機器、不得作為可攜絕對值」，絕對數字留在變更工件作為證據。
- **自我 dogfood 的諷刺**：本變更新增的「空洞通過」準則，第一個受害者是我自己的 mutation 驗證腳本——它的 grep 沒對到 vitest 輸出格式，九個變異全部產出空白，而「無輸出」看起來就像正常。
