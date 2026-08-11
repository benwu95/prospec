# Tasks: skip-unspawnable-test-command

> `scale: quick` —— 無 plan／delta-spec，任務由 proposal.md 的驗收情境拆解。

## Lib

- [x] T1 `lib/test-runner.ts`：`ExecutableProbe` 注入契約 ＋ `defaultExecutableProbe`（PATH 依平台分隔、`exists` 只認檔案不認目錄） ~40 lines
- [x] T2 `lib/test-runner.ts`：`classifyExecutable` —— 非 win32 恆 spawnable；win32 依 **libuv 規則**兩趟搜尋（先全 PATH 找「含點字面名／`.com`／`.exe`」，全無才找 `.cmd`／`.bat` 作診斷），PATHEXT 不參與；已帶副檔名或本身是路徑則不搜 PATH ~40 lines
- [x] T3 `lib/test-runner.ts`：`describeUnspawnable`（只有 shim 阻擋，`not-found` 刻意不阻擋）＋ `unspawnableReason`（分類 argv[0]，空指令自成原因） ~30 lines
- [x] T4 `lib/test-runner.ts`：`runTestCommand` 於 spawn 前套用同一判定並回報同一原因；加 probe 注入以便該守衛可在 POSIX 上被釘住 ~12 lines
- [x] T5 `lib/drift-sources.ts`：`collectTestProvenance` 把 shim 視為來源不可用（`source unavailable: …` → check `skipped`）；probe 注入為測試接縫 ~10 lines

## Templates

- [x] T6 `references/config-example.yaml.hbs` ＋ `init/prospec.yaml.hbs`：`test_command` 說明載明 Windows 不得指向 shim，並給不經 shell 的替代寫法 ~14 lines

## Tests

- [x] T7 unit：`classifyExecutable` 平台注入 11 條（非 win32／`.cmd`／`.bat`／真 `.exe`／`.com`／`.exe` 跨目錄勝過較前目錄的 `.cmd`／全 PATH 皆無才判 shim／已帶副檔名／路徑不搜 PATH／not-found／PATHEXT 不影響判定的負向斷言） ~110 lines
- [x] T8 unit：`describeUnspawnable`（含「not-found 不阻擋」的負向斷言）、`unspawnableReason`、`defaultExecutableProbe`（PATH 切分 ＋ `exists` 的檔案／目錄／不存在三態） ~65 lines
- [x] T9 unit：`runTestCommand` 預先拒絕 3 條（含「本來會成功的指令在 shim 判定下仍無 exit code」以證明未 spawn）＋ `collectTestProvenance` 兩處接線 2 條 ~60 lines
- [x] T10 unit：真機行為以 `describe.runIf(process.platform === 'win32')` 保留，待 Windows CI job 存在時才跑 ~10 lines
- [x] T11 [V] 對每個新斷言類別做 mutation-verify；第一輪 runner 守衛為 GREEN（唯一覆蓋它的是被 skip 的 win32 測試）→ 加 probe 注入補釘後轉紅。review 另指出 `exists` 的兩個 mutation 存活 → 補三態斷言後轉紅 ~8 lines

## Docs

- [x] T12 root `README.md` 的 `--record-tests` 說明列出此 skip 原因，並同步 `README.zh-TW.md` ~6 lines
- [x] T13 [M] `pnpm bundle` ＋ agent sync ＋ `pnpm counts`（新增測試改動計數） ~5 lines

## Summary

- **Total Tasks:** 13（code 11、`[M]` 1、`[V]` 1）
- **Total Estimated Lines:** ~377 lines
