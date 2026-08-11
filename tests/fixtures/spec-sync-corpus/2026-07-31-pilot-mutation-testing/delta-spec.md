# Delta Spec: pilot-mutation-testing

> REQ ID format: `REQ-{MODULE}-{NUMBER}`
> 本檔的 `**Spec:**` 區塊會被 CLI 逐字落地到 Feature Spec 的 body，因此以信任區語言（英文）撰寫且必須陳述**變更後的完整需求**（非本次差異）；敘述性欄位為變更工件語言（繁中）。

## ADDED

### REQ-TEMPLATES-169: mutation claims are named in the finding; vacuous passes are a lens criterion

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
兩處各就其位。「宣稱做過 mutation 驗證者須列出實際套用的變異與其結果」寫入 `review-format` 的 finding 內容規則——它的主體是 **reviewer 自己的產出**，而 critical/major 依定義是對**變更**提出的 finding 的嚴重度，放進準則表會得到一個填不出去的嚴重度。理由不變：不可稽核的驗證與沒有驗證無法區分，`test/structural-false-green` 復發 18 次的結構性原因是變異由寫斷言的同一個人挑選。準則表則新增一列主體確為變更的「斷言可空洞通過」（major）——本 session 反覆踩到的真實形狀。

**Acceptance Criteria:**
1. `review-format` 的 review.md Format 節含「列出變異」的 finding 內容規則，且該規則**不**同時以帶嚴重度的列存在於準則表
2. 準則表含「空洞通過」一列，嚴重度 major，且陳述其機制（切片／集合可為空而斷言仍成立）
3. 準則表留有指向 `review-format.md` 的路標
4. 兩處各自被 section-scoped 契約測試釘住

**Spec:**
A review finding that claims mutation verification NAMES the mutations actually applied and whether each turned the test red. This is a finding-content rule in the review.md format, not a criterion applied to the change: an unnamed mutation set is indistinguishable from none, and the recurring false-green failure is not that verification is skipped but that the mutations are chosen by whoever wrote the assertion, so making the choice visible is what changes the default. Separately, the test-quality lens rates a **vacuous pass** — an assertion whose slice, glob, or collection can be empty while the expectation still holds — as `major`, the same weight as an unmutated assertion class, because a mutation that makes extraction return nothing satisfies such a test.
- WHEN a finding reports mutation verification, THEN it names the mutations applied and whether each turned the test red
- WHEN an assertion holds over an empty slice or collection, THEN the test-quality lens rates it `major`
- WHEN the mutation-naming rule is stated, THEN it sits in the finding format rather than the criteria table, and the table points to it

**Priority:** High

---

### REQ-TESTS-066: Mutation testing ships as an on-demand audit, pinned as a non-gate

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
Stryker 以隨選深度稽核工具出貨：設定檔明確宣告 `plugins`（pnpm 嚴格佈局的必要條件）、`pnpm mutate` 接受路徑參數（必填），成本以**實測數據**標示。刻意不進 CI、不做閘門——實測顯示成本是兩個因子的**乘積**，任一項單獨都無法預測：有多少 mutant 是 **static**（`task-markers` 57 個中 26 個，位於模組層級的 regex 常數，使模組必須重載而 `coverageAnalysis` 無法收斂），乘以**該模組依賴套件的執行時間**（一次未收斂執行的代價）。`date-utils` 2 個 mutant／依賴套件 57 個測試（net 0.08 秒）＝ 4 秒；`task-markers` 57 個 mutant／依賴套件 416 個測試（net 54.2 秒）＝ 9 分 09 秒。`--ignoreStatic` 可將後者壓到 63.8 秒（8.6 倍），代價是那 26 個 mutant 未被測試且回報為存活（score 89.47→45.61）。以分鐘計的成本做成每次變更的關卡必然被跳過。契約測試**列舉** `.github/workflows/` 全部檔案確認無此步驟，使「非閘門」成為可驗證的設計決定而非口頭承諾。

**Acceptance Criteria:**
1. `pnpm mutate <path>` 可執行並產出 mutation score 與存活 mutant 清單（以**文件記載的形式**實際執行過，非僅底層工具可跑）
2. 設定與文件以實測數字標示成本，並指名驅動因子為 **static mutant 數 × 依賴套件執行時間**的乘積（附兩個對照數據點、`--ignoreStatic` 的實測槓桿與其代價），不使用含糊措辭；不得引用不穩定的 `tests per mutant`
3. CI workflow **全部**檔案皆不含 mutation 步驟，且此事由列舉目錄的契約測試釘住
4. 文件明示存活 mutant 需人工判讀等價性，不宣稱存活即缺陷

**Spec:**
Mutation testing ships as an on-demand deep audit, never as a gate. `pnpm mutate <path>` runs Stryker over that path — a path is required — and reports the mutation score with its surviving mutants; the config declares its runner plugin explicitly, which pnpm's strict layout requires, and defaults `mutate` to the measured reference module so a bare run stays bounded. Its cost is documented as measured figures with the driver named as a PRODUCT of two factors, neither of which predicts it alone: the number of STATIC mutants (those in module-level code, which force a module reload so per-test coverage analysis cannot narrow them) times the runtime of the module's DEPENDENT SUITE (what one un-narrowed run costs). Measured: 2 mutants over a 57-test suite (net 0.08s) takes 4s, against 57 mutants — 26 of them static — over a 416-test suite (net 54.2s) taking 9m09s; disabling static mutants takes the latter to 63.8s, 8.6x faster, at the cost of leaving those 26 untested and reported as survived, so the score falls from 89.47 to 45.61. Timeouts arise from the same product, and Stryker scores a timeout as killed, so scores are not comparable across machines. A contract assertion enumerates every file under `.github/workflows/` and fails if any carries a mutation step. Surviving mutants are a signal to read, not a defect list: equivalence is a human judgment the tool cannot make.
- WHEN `pnpm mutate` is run against a path, THEN it reports that path's mutation score and surviving mutants
- WHEN the cost is described anywhere, THEN it is measured figures naming the driver as static-mutant count times dependent-suite runtime, never a vague warning and never resting on the unstable tests-per-mutant figure
- WHEN any file under the CI workflow directory is generated or present, THEN it carries no mutation step, and a contract assertion enumerating that directory fails if one appears
- WHEN surviving mutants are reported, THEN the documentation states that equivalence is a human judgment

**Priority:** Medium

---

## MODIFIED

_無修改項目：本變更只新增 lens 條目與根層工具設定，既有需求行為未變動。_

## REMOVED

_本變更無移除項目。_
