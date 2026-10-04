# 落差處置與證據

| 族 | 站點 | 現有 owner／反例 | 處置 |
|---|---|---|---|
| 1 輪數 | ff、skill-format title、TYPES-086 | types/cascade MIN=1 MAX=5 default=3；schema 接受 1 | ff 刪重複範圍並引用 breaker reference，Spec 與 schema 一致 |
| 2 check | knowledge-generate、AGNT-035、KNOW-013/016 | check command 不收 positional argument；check knowledge-size exit 1 | 用 prospec check，查看 knowledge-size |
| 3 backfill | verify Entry Gate、1/5、5/5、NEVER；verify-backfill；TESTS-034 | verify-record：scale backfill AND draft exists | 主 skill 指 reference；reference 保留 provenance 與品質/test policy |
| 4 時序 | 排除 | #325 已接受首次 S/A → sync → 最終重建 review/tests/verify | 不改 verify/archive/cascade/lifecycle 該族句子 |
| 5 promote | promote NEVER、TEMPLATES-118 | knowledge-sync：known module、feature-map、slug fallback；related=[] + REQ-SERVICES-001 仍導出 services | 保留記錄追溯模組義務，刪 bypass 理由；依 CLI 回報同步 |
| 6 clean sentence | review Provenance/Clean-review、scoped test、lib station-engines；TEMPLATES-130/163、SERVICES-098、CLI-028、LIB-049、TESTS-121 | review-merge：merged.length===0；input=[] 配 carried rows 非空 | 刪每輪必有句子與手動附句理由；保留 counts/close/baseline 與 trailing-content preservation |
| 7 verify 拒收 | verify Entry Gate/NEVER、status-router 兩個 gate、init/authored lifecycle、services README；TEMPLATES-131、SERVICES-100、LIB-035、TESTS-043；US-24/US-6 | verify-record：target adjudication.status !== pass，含 skipped/unprovable | 指向 CLI 當前拒收與補救；判準留 owner Spec |
| 8 WARN 後拒收 | types/cli-help、雙語 Reference、review-format reference；TYPES-098、TEMPLATES-163、SERVICES-086/098 | review-merge 先 WARN 後重評；unit failure injection 區分 artifact 寫入前／後：WARN 與 completed writes 留存，無成功 round log | 區分初始 metrics-only 與後續 WARN／completed writes 留存拒收；review-format 的 metrics 說明指向 CLI refusal outcomes |
| 9 知識範圍 | init/authored module conventions、loading partial/index、knowledge-generate Step4/4.5/failure/NEVER、knowledge-update NEVER；KNOW-004/013/016 | diagram conventions 允許 linked supplementary flow docs；drift-sources 逐檔量測模組 .md | README 作入口，連結 sub-module/supplementary docs；保留按需載入與逐檔預算 |

站點以 `src/templates/skills`、`src/templates/init`、相同 authored trust-zone 文件及其生成 assets 為完整範圍。精確定位以 section/符號為準。

以 bundle、source CLI agent sync、既有 token counter 重生 assets 與 exact baselines，ceilings 不提高。L2 涉及五個 related modules；Feature Specs 僅由 archive sync，US prose 留 delta Manual Convergence，Change History 保持歷史。

#341 移除的 canonical claims registry 不重建；#342 廣泛負向 assertion 清理排除。

Review follow-up：F-326-1 刪除 review-format 的 clean round 手動補句義務；F-326-2 收斂後段 refusal 的部分寫入宣稱，direct owner SERVICES-086 與 098 的完整 bodies 及 Dropped 同步。共 21 個 MODIFIED REQ；原 proposal baseline 與 Option A 保持。
