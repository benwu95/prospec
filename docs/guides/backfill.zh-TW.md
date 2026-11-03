# Backfill：把既有程式碼納進信任區
[English](./backfill.md) • [文件](../README.zh-TW.md)

Brownfield 專案累積了大量「沒有 Feature Spec 描述」的行為。**Backfill** 是一條一等、雙 skill 的流程：從程式碼反向萃取這些行為，並把它 graduate 進規格信任區（`prospec/specs/features/`）—— 而且**從不手寫信任區**（archive 維持唯一寫入者）。

```mermaid
flowchart TD
    CODE[("既有<br/>brownfield code")] --> BF([萃取<br/>Backfill]) -- "草稿 + 人工審閱" --> PR([晉升<br/>Promote]) -- "scale: backfill<br/>(無 plan/tasks)" --> K([知識同步<br/>Knowledge Sync]) --> V([驗證<br/>Verify]) -- "spec-fidelity → S/A" --> A([歸檔<br/>Archive])

    A -- Spec Sync --> FS[("Feature Specs<br/>graduate 進信任區")]

    classDef asset fill:#eef7ff,stroke:#2b6cb0,stroke-width:2px;
    class CODE,FS asset;
```

1. **萃取** —— `prospec-backfill-spec` 讀程式碼（與 tests、git history、docs）、stage 一份 route-compatible 的 `backfill-draft.md`；無法從程式碼推得的 intent 標 `[NEEDS CLARIFICATION]`，絕不捏造。
2. **審閱** —— 解決每個 `[NEEDS CLARIFICATION]`（*So that* 價值、目標角色、模糊 AC），確認候選 feature slug。這是人工關卡。
3. **晉升** —— `prospec-promote-backfill` 把審閱過的草稿展開為 change scaffold（proposal + delta-spec + metadata），標記 `scale: backfill`、`status: implemented`。`backfill` 是像 `quick` 的**輕量 scale** —— 不產空殼 `plan.md`/`tasks.md`，因為程式碼已存在。
4. **Knowledge Sync** —— 執行 `prospec knowledge update --change <name>`（不會為 feature-slug REQ ID mint 任何 module）。更新`prospec knowledge update --change` 回報的 modules ∪ `metadata.related_modules` 的 READMEs，再用 `prospec knowledge verify` stamp。 這些準備須在最終驗證前完成。
5. **最終驗證** —— `prospec-verify` 改評 **spec-fidelity**（每條 REQ 的 `file:line` 須成立）。`backfill-draft.md` 證明 provenance 後，既有 debt 以逐規則的 `applicability: pre-existing-code` 分類，非空 `statement` 須說明位置、非本次引入的理由與本次 artifacts 的合規證據。Current-artifact violations、aggregate Constitution `FAIL` 與實際 tests `FAIL` 仍參與評級；無法取得的原始 baseline 保持 `not-adjudicated`。其他 gates 與 grade budgets 仍適用。依 contract，proven backfill 的 code review 是 optional。S/A 確認已準備的輸入；之後若有效輸入改動，須重新驗證。
6. **歸檔** —— `prospec-archive` 把需求 graduate 進 `prospec/specs/features/{slug}.md`。這是唯一會寫信任區的環節。
