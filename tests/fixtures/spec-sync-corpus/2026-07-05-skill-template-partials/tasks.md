# Tasks：skill template boilerplate partial 化 + generated 標記

## Templates

- [x] 盤點 verbatim-identical boilerplate 段落（md5 確認 Next-Step Handoff 6-identical 集合；Output Contract/Entry Gate/Quality Gate 的 verbatim-safe framing）~10 lines
- [x] 建 `_next-step-handoff.hbs`（＋其他 verbatim-safe partial），逐字搬移原 inline 內容 ~40 lines
- [x] 對應 template 段落換成 `{{> ...}}` 引用（引用它的 skill）~30 lines
- [x] SKILL.md generated 標記（frontmatter 後、來源指引；partial 或所有 .hbs 頭部）~17 lines

## Lib

- [x] `template.ts` `ensureBuiltinPartials` 註冊新 partials ~6 lines

## Config / regen

- [x] [M] `prospec agent sync` 重生所有 SKILL.md（.claude + .agents）~5 lines
- [x] [V] `git diff` 部署 SKILL.md：除 generated 標記外 byte-identical（零 drift）；否則調 partial ~5 lines

## Tests

- [x] contract：partial single-source（引用 template 含 `{{> ...}}`、不含 inline 副本）+ generated 標記存在 + partial 展開 byte-identical；mutation-verified ~50 lines

## Verification

- [x] [V] `pnpm typecheck` 全綠
- [x] [V] `pnpm test` 全綠（含既有生成契約）
- [x] [V] `pnpm lint`、`pnpm counts`(如需)、`prospec check` 0 fail

## Summary

- **Total Tasks:** 11（code 6、[M] 1、[V] 4）
