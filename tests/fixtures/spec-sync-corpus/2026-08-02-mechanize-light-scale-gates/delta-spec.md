# Delta Spec: mechanize-light-scale-gates

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-TYPES-074: Light-Scale Forbidden-Artifact Registry

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
把「哪個 scale 的契約禁止哪些變更工件」從散文抽成 `types/change.ts` 的凍結登記表，成為兩個 station service 與契約測試共用的唯一來源。

**Acceptance Criteria:**
1. 登記表涵蓋全部四個 `CHANGE_SCALES` 值，缺一個就編譯失敗
2. `quick` → `plan.md`/`delta-spec.md`；`backfill` → `plan.md`/`tasks.md`；`standard`/`full` → 空集合
3. 未標示 `scale` 讀作 `standard`（空集合），既有變更零回歸

**Spec:**
`types/change.ts` exports `SCALE_FORBIDDEN_ARTIFACTS` — a frozen registry naming, per `CHANGE_SCALES` value, the change artifacts that scale's contract forbids — plus `forbiddenArtifacts(scale)`, which reads an absent scale as `standard`. It is the single source the plan/tasks stations and the lifecycle contract test both consume, so the contract cannot be honoured at one station and not another.
- WHEN the scale is `quick`, THEN the forbidden set is `plan.md` and `delta-spec.md`
- WHEN the scale is `backfill`, THEN the forbidden set is `plan.md` and `tasks.md`
- WHEN the scale is `standard`, `full`, or absent, THEN the forbidden set is empty
- WHEN the scale string is unknown or an inherited object key, THEN it reads as `standard` rather than yielding a non-array member
- WHEN a new value is appended to `CHANGE_SCALES` without a registry entry, THEN the build fails rather than defaulting the new scale to "forbids nothing"
- WHEN any station or engine needs the per-scale artifact contract, THEN it consumes this registry rather than re-testing a scale name — the plan and tasks stations, the `promote-scaffold` validator, and the `status` router all read it, so one contract has exactly one encoding

**Priority:** High

---

### REQ-SERVICES-076: Plan and Tasks Stations Honour the Forbidden-Artifact Registry

**Feature:** sdd-workflow
**Story:** US-1, US-2

**Description:**
兩個 station service 一律以登記表判斷該不該產出工件，取代「有沒有 plan.md」這個代理條件；拒絕發生在任何寫入之前。

**Acceptance Criteria:**
1. `scale: quick` 執行 `change tasks` 產出 tasks.md 並推進 `story → tasks`，不產生 plan.md／delta-spec.md
2. `scale: backfill` 在兩站都被拒絕，訊息各自指向 `/prospec-promote-backfill`
3. 非輕量 scale（含未標示）行為與現況逐字相同；拒絕路徑不寫入任何位元組
4. `change progress` 缺 tasks.md 時的建議也讀同一份登記表，不把無任務清單的 scale 導向會拒絕它的站

**Spec:**
`prospec change plan` and `prospec change tasks` resolve the change's scale through `forbiddenArtifacts()` before touching the filesystem: a station whose own product is forbidden refuses with an actionable redirect, and the tasks station's `plan.md` prerequisite applies only when `plan.md` is not forbidden for that scale. Refusal happens before any write, so the change directory stays byte-identical.
- WHEN `scale: quick` and no plan.md exists, THEN `change tasks` scaffolds tasks.md and advances `story → tasks` without producing plan.md or delta-spec.md
- WHEN `scale: backfill`, THEN `change tasks` refuses (backfill records existing code — no task list) and `change plan` refuses and points at `/prospec-promote-backfill`
- WHEN `scale: quick`, THEN `change plan` refuses and points at `prospec change tasks`
- WHEN the scale is `standard`, `full`, or absent, THEN both stations keep their existing prerequisites, including the missing-plan.md refusal at the tasks station
- WHEN metadata.yaml is absent, THEN the scale is unknown, no prerequisite is relaxed, and the pre-existing refusal stands
- WHEN metadata.yaml is present but invalid, THEN the validation error surfaces first (the record deciding which prerequisites apply is read before them); nothing is written and nothing is relaxed. Only suggestion-shaped reads (`change progress`, `knowledge update`) degrade to "scale unknown" via `readScaleQuietly`, never a gate
- WHEN `change progress` finds no tasks.md, THEN its suggestion reads the same registry — a scale with no task list is told so instead of being sent to the tasks station that would refuse it
- WHEN `change scale` is asked to write a scale whose contract forbids an artifact already on disk, THEN it refuses before writing and names those files — a scale and its artifacts must agree, or the change is invalid the moment the scale lands

**Priority:** High

---

### REQ-LIB-040: Promote-Scaffold Verdict Covers delta-spec.md

**Feature:** sdd-workflow
**Story:** US-3

**Description:**
`validatePromoteScaffold` 自稱是 promotion 的完整機器裁決，卻從未檢查 delta-spec.md —— 而那正是 promotion 的產物。

**Acceptance Criteria:**
1. 缺 delta-spec.md 時回報 FAIL 並指名該檔
2. delta-spec.md 存在時不新增任何 finding（無偽陽性）
3. `hasDeltaSpec` 為必填輸入，讓型別檢查逼出每個呼叫點

**Spec:**
`validatePromoteScaffold` takes `hasDeltaSpec` as a required input and FAILs when the promotion scaffold has no `delta-spec.md`. The verdict `/prospec-promote-backfill` calls the complete machine check therefore covers the artifact promotion exists to produce, not only the artifacts it must not produce.
- WHEN a promotion scaffold has no delta-spec.md, THEN the verdict is FAIL and names the missing file
- WHEN delta-spec.md is present, THEN the check contributes no finding

**Priority:** High

---

### REQ-TESTS-072: Lifecycle-Contract and Station-Matrix Coverage

**Feature:** sdd-workflow
**Story:** US-4

**Description:**
用契約測試把「文件宣告的輕量 scale 契約」釘在實作上，補齊 unit 的行為矩陣與 quick 路徑的端到端流程。

**Acceptance Criteria:**
1. 契約測試以雙向集合相等比對兩份 `_status-lifecycle.md` 副本的矩陣表與登記表
2. 兩站 × 四個 scale 的行為矩陣在 unit 層逐格覆蓋，且各新斷言經 mutation 驗證
3. integration 層覆蓋 `story → scale quick → tasks` 全流程

**Spec:**
A contract test pins the light-scale artifact matrix documented in both `_status-lifecycle.md` copies against `SCALE_FORBIDDEN_ARTIFACTS` by set equality in both directions, so a contract stated in the doc but absent from the code (or the reverse) fails the build. Unit tests cover the two stations across every scale, and an integration test drives the quick path end to end.
- WHEN the documented matrix and the registry disagree in either direction, THEN the contract test fails
- WHEN a station stops honouring the registry, THEN its station-matrix unit test fails
- WHEN the quick path runs `story → scale quick → tasks`, THEN the integration test asserts tasks.md exists, plan.md and delta-spec.md do not, and status is `tasks`

**Priority:** High

---

## MODIFIED

### REQ-CHNG-011: Decompose Plan into Tasks

**Feature:** sdd-workflow
**Story:** US-1, US-2

**Before:**
唯一的前置條件是「plan.md valid」—— 該 REQ 假設每個變更都有 plan，`change tasks` 因此無條件要求 plan.md。

**After:**
plan.md 前置條件改為依 scale 條件成立：quick 由 proposal.md 拆解，backfill 根本不該有 tasks.md。

**Reason:**
`_status-lifecycle.md` 早已宣告 `story → tasks` 是 quick 的合法跳站，但 tasks 站的實作從未有這個例外（issue #123）。

**Spec:**
`/prospec-tasks` decomposes into a tasks.md grouped by architecture layer. Its plan.md prerequisite is scale-conditional: the `prospec change tasks` CLI reads the light-scale artifact registry instead of assuming every change has a plan.
- WHEN plan.md valid, THEN tasks.md groups by architecture layer
- WHEN parallelizable, THEN mark `[P]`
- WHEN design-spec.md exists, THEN UI tasks annotated for MCP design reading
- WHEN `scale: quick`, THEN the plan.md prerequisite is skipped and tasks are decomposed from proposal.md, advancing `story → tasks`
- WHEN `scale: backfill`, THEN the station refuses: backfill records existing code and its contract forbids tasks.md

**Priority:** High

---

### REQ-TEMPLATES-087: Scale-Tiered Plan Depth

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
quick 只在 skill 的 Entry Gate 被人類判斷擋下，CLI 對 scale 一無所知。

**After:**
拒絕改為機械化：`prospec change plan` 在該 scale 禁止 plan.md 時直接拒絕，backfill 一併納入。

**Reason:**
skill Entry Gate 是判斷步驟而非機制；CLI 一旦被跑就會產出契約禁止的 hollow 工件，backfill 甚至會讓自己的 `validate promote-scaffold` 轉 FAIL。

**Spec:**
plan has three tiers by scale: quick is rejected and directed to tasks (no file produced), standard ≤120 lines (default), full is a complete architecture analysis (not subject to the 120-line cap). The plan-format reference includes three-tier guidance. The rejection is mechanical rather than skill judgment alone — `prospec change plan` refuses whenever plan.md is forbidden for the change's scale.
- WHEN `scale: quick`, THEN both the skill Entry Gate and the CLI refuse and direct the user to tasks, writing no plan.md or delta-spec.md
- WHEN `scale: backfill`, THEN the CLI refuses and directs the user to `/prospec-promote-backfill` — a plan.md would fail that scaffold's own validate gate
- WHEN the scale is `standard`, `full`, or absent, THEN the station behaves exactly as before

**Priority:** High

---

### REQ-CLI-031: `prospec validate <kind>` Reports Artifact Structure Verdicts

**Feature:** sdd-workflow
**Story:** US-3

**Before:**
`promote-scaffold` 的「完整裁決」列舉為：reviewed draft + proposal 存在、無 plan.md／tasks.md、`scale: backfill`、`status: implemented`、`related_modules` 非空、trust-zone 乾淨 —— 獨缺 delta-spec.md。

**After:**
同一份清單加入 delta-spec.md 存在檢查，且禁用工件集改由 `SCALE_FORBIDDEN_ARTIFACTS` 提供而非驗證器自寫。

**Reason:**
REQ-CLI-031 是信任區裡描述這道裁決的 REQ；只列 ADDED REQ-LIB-040 會讓 archive 把一份漏掉 delta-spec 的「完整」清單永久寫進信任區（PB-003：宣稱必須 ⊆ 實作）。

**Spec:**
One command carries the artifact checks the backfill / promote / design skills used to narrate, with the machine/judgment boundary drawn explicitly per kind: `slug` and `promote-scaffold` are **complete** verdicts; `backfill-draft` and `design-spec` report the **structural subset** and the skill applies the semantic rules over those facts. A failing verdict exits 1, like `check --strict`.
- WHEN `validate slug` runs, THEN the verdict is the executable `isSafeResourceName` guard (no path separators, no `..`, no empty segments)
- WHEN `validate promote-scaffold` runs, THEN it checks the artifact set — reviewed draft, proposal AND `delta-spec.md` present (promotion's own product), and none of the artifacts `SCALE_FORBIDDEN_ARTIFACTS` forbids under `scale: backfill` — plus `scale: backfill`, `status: implemented`, non-empty `related_modules`, and trust-zone cleanliness; a probe that cannot run (git failure, unreadable config) is reported as an explicit "could not verify" finding, never as clean
- WHEN the registry gains a forbidden artifact this verdict cannot probe, THEN it reports that gap as a FAIL rather than passing silently
- WHEN `validate backfill-draft` runs, THEN it reports route-header presence (`**Feature:**` / `**Story:**`), every `[NEEDS CLARIFICATION]` marker with its line, and the feature-map coverage gap as INFO — the >50% ratio classification (story-level denominator, heuristic-WHY exemption) is stated to be the skill's
- WHEN `validate design-spec` runs, THEN a missing required section or a remaining `[NEEDS CLARIFICATION]` FAILs, and component coverage is out of scope — extracting the component list from proposal prose is judgment

**Priority:** High

---

### REQ-TYPES-070: Station-Routing Contract and Canonical Order

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
`SDD_STATIONS` 只有八站，backfill 的晉升沒有對應站點，因此 router 無法誠實表達「promotion 未完成」。

**After:**
新增 `promote` 站（`/prospec-promote-backfill`），位置緊接 `implement` 之前 —— 即該晉升落地的 status。

**Reason:**
`backfill` 在抵達 `implemented` 前無任何前向規劃站；缺少站點詞彙時 router 只能指向 plan／tasks，而兩站都會拒絕該 scale。

**Spec:**
The types layer defines the SDD station order — including the workflow rank of the no-status-transition design/review stations and the `promote` backfill entry — and the `ChangeRouteFacts`/`ChangeRoute`/`StatusReport` report contract (current node, next station, blocking gates, reasons, per-change error entries). Implemented as `ChangeRoute` + `ChangeRouteError` (the delta-spec's `ChangeRouteEntry` expressiveness, split into routed/error shapes).
- WHEN the station order is read, THEN `SDD_STATIONS` is `story → plan → design → tasks → promote → implement → review → verify → archive` (periodic learn excluded from the linear order), and a contract test pins it against the `## Station order` chain carried by both `_status-lifecycle.md` copies — the claim of agreement is enforced, not asserted
- WHEN a station is routed to, THEN `STATION_SKILLS` names the skill that runs it for every station, `promote` → `/prospec-promote-backfill`
- WHEN `promote`'s rank is read, THEN it sits immediately before `implement` — the status a promotion lands at
- WHEN a change cannot be routed, THEN the contract expresses it as a named error entry, never a dropped record
- WHEN the change schema is consulted, THEN `CHANGE_STATUSES`/`CHANGE_SCALES` are unchanged — routing adds no status value

**Priority:** High

---

### REQ-LIB-035: Pure Route Evaluator

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
router 自行比對 `scale === 'quick'`，且只在 `implemented` 處理 backfill —— backfill 停在更早的 status 時會被路由到 plan。

**After:**
skip 判斷改由 `SCALE_FORBIDDEN_ARTIFACTS` 提供；無 plan 亦無 tasks 的 scale 在抵達 `implemented` 前一律路由到 `promote`。

**Reason:**
router 自稱是 `_status-lifecycle.md` 的可執行副本，卻是同一份契約的第三份硬編碼；且會指向必然失敗的站。

**Spec:**
`lib/status-router.ts` exposes the I/O-free `routeChange(facts)` — the executable copy of `_status-lifecycle.md`: six-state order, the `scale: quick` story→tasks legal skip, the `scale: backfill` `implemented` entry (absent plan/tasks are its normal state), the design station insertion (`ui_scope` full/partial between plan and tasks, never under a scale with no plan), review done-ness via `review_provenance`, verify B/C/D stay reasons, and the archive Knowledge-sync gate declaration. Which stations a scale skips is read from `SCALE_FORBIDDEN_ARTIFACTS`, not from a scale name re-tested here.
- WHEN the full status × scale matrix runs, THEN every computed station matches `_status-lifecycle.md` (fixture-pinned; retro-validated 46/46 against the local archive at verification)
- WHEN `scale: quick` at `story`, THEN next is tasks and plan.md is never gated on; WHEN `scale: backfill` at `implemented`, THEN it is a legal entry, not a skip
- WHEN `status: implemented` without `review_provenance`, THEN next is review (by workflow order, not status); with it, next is verify
- WHEN the function runs, THEN it performs no I/O (drift-checker evaluator precedent)
- WHEN a scale forbids `plan.md` but not `tasks.md`, THEN `story` routes to `tasks` (the quick skip) — derived from the registry, not from the scale's name
- WHEN a scale forbids both `plan.md` and `tasks.md` and the change has not reached `implemented`, THEN it routes to `promote` with the incomplete promotion as the reason, and its blocking gate names `prospec validate promote-scaffold`
- WHEN such a change reaches `implemented`, THEN routing resumes at the normal review/verify/archive path, and the completed station it reports is `promote` — never `implement`, a station that scale's contract never let it run
- WHEN a scale's contract has no plan, THEN the design station is never suggested for it at any status (design hangs off `plan`), keyed on the artifact registry rather than the scale's name

**Priority:** High

---

### REQ-TEMPLATES-085: Fast-Forward Quick Path

**Feature:** sdd-workflow
**Story:** US-4

**Before:**
lifecycle 的兩份副本只以散文記載 quick 轉移，契約斷言只鎖住兩份副本彼此同步。

**After:**
兩份副本另載一張輕量 scale 工件矩陣表，契約斷言改為同時鎖住「副本 ↔ 程式碼登記表」。

**Reason:**
散文鎖散文只能證明兩份文件一致，證明不了文件與實作一致 —— 這正是本變更要根治的漂移形狀。

**Spec:**
ff reads `metadata.scale`: quick skips Phase 3 (Plan Generation; no plan.md/delta-spec.md produced, no module README loaded), status story → tasks; standard/full keep the three-phase flow. The lifecycle's two copies (`_status-lifecycle.md` + init template) document the quick transition AND carry the light-scale artifact matrix, with contract assertions locking their sync with each other and with the code registry.
- WHEN quick, THEN the Output Contract self-assesses "plan absent per contract", not falsely reporting Unmet
- WHEN either copy's matrix diverges from `SCALE_FORBIDDEN_ARTIFACTS`, THEN the contract test fails

**Priority:** Medium

---

## REMOVED

_No removals in this change._
