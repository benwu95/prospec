# Review: dedupe-init-doc-registry

**Rounds:** 1 / cap 3   **Status:** review-clean

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/types/conventions.ts:88-98（+ tests 兩處 toContainEqual） | major | maintainability/DRY | proposed → 實作者採納（asKnowledgeInitDoc helper） |
| src/types/conventions.ts:28（CanonicalDoc 型別語意） | major | maintainability / spec-architecture | proposed → 實作者採納（改名 ConventionDocSource） |

## Round 1（fresh-context reviewer，mode B 多鏡頭；quick 降級：delta-spec 比對 not-applicable）

**0 critical、2 major——迴圈於第 1 輪收斂 review-clean。**

行為不變不變式經審查者逐項舉證：registry 順序/內容與 HEAD 逐位元一致（constitution → user-managed 三項原序 → index → canonical 兩項）；`ALL_INITIAL_CONVENTION_DOCS` 值不變（消費端 filterConventions/index-template 無感）；`context` 欄位不外洩（無精確等值斷言指向 index 項）；新契約標記 `prospec/ai-knowledge` 確為 context 衍生（範本 `{{knowledge_base_path}}`，無靜態出現）；F3 比對式清零、F2 字面重述僅剩語意不同的 `CORE_CONVENTIONS`（L1 策展子集，範疇外）與測試釘住；conventions.ts 維持 0 import（leaf）；REQ-TYPES-038 文字不矛盾，proposal Spec Impact 的「僅描述性修訂」判斷獲審查者確認；feature-map `cli` 插入符合字母序慣例；四套目標測試 61 綠、contract+integration 573 綠、typecheck 乾淨。

### F1 [major] — registry 內同一投影 lambda 複製兩次（測試再抄兩次）【已採納】

修 restatement 的變更自己引入了 4 行投影的複製貼上；`InitDoc` 未來若增欄位（`context` 正是前兆），optional 欄位讓 tsc 不會抓漏更新的那份——正是 PB-006 的漂移類。
**採納修法**：抽 `asKnowledgeInitDoc(doc: ConventionDocSource): InitDoc` 具名 helper，registry 兩處 spread 與測試兩處綁定斷言共用（形狀測試獨立守住投影本身）。

### F2 [major] — user-managed 清單型別標成 `CanonicalDoc[]`，型別名成為誤導【已採納】

`CanonicalDoc` 的文件註解宣稱「never user-customized」，而 user-managed 清單的存在意義正是「會被使用者客製」——型別名承載錯誤語意；且 proposal Related Modules 原載明 `UserManagedDoc` 結構，實作靜默改用 `CanonicalDoc`（proposal 偏差，行為無影響）。
**採納修法**：介面改名為角色中性的 `ConventionDocSource`（形狀語意），「never user-customized」語意移至 `CANONICAL_CONVENTION_DOCS` 常數註解；無外部 importer（grep 證實），無 alias 需求。

## 採納記錄（非 review 迴圈 auto-fix）

依 severity 契約 majors 僅 proposed、不由迴圈自動修；本兩項為使用者「修正以上問題」指示的直接延續且皆為 drop-in，由**實作者**於 review-clean 後採納。採納後 typecheck 乾淨、全套 1821 tests 綠（計數不變——純重構）；/prospec-verify 將獨立複審。
