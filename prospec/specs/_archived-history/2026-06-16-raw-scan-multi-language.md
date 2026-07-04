# raw-scan-multi-language — Archive Summary

- **Archived**: 2026-06-16
- **Original Created**: 2026-06-16T07:11:14Z
- **Quality Grade**: A

## User Story

As a developer running prospec on a backend project,
I want raw-scan to detect language / entry points / dependencies / config files for mainstream backend languages,
So that AI Knowledge generation sees the real stack instead of a JS/TS-only view.

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | New `manifest-parsers.ts` (TOML/XML/go.mod/requirements/composer parsers); `detector` backend language + tree-wide detection |
| services | High | `raw-scan.service` multi-ecosystem dependency dispatch, backend entry-points/config patterns; go.mod docstring made true |
| templates | Low | `raw-scan.md.hbs` section reorder (tech-profile / project-structure groups) |
| tests | High | per-language fixtures (manifest-parsers, detector, raw-scan.service, knowledge-format) |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-022 | MODIFIED | raw-scan.md section order regrouped |
| REQ-KNOW-027 | ADDED | Dependencies multi-ecosystem parsing (Node/Python/Go/Rust/Maven/.NET/PHP) |
| REQ-KNOW-028 | ADDED | Tech Stack backend language + package-manager detection |
| REQ-KNOW-029 | ADDED | Entry Points backend conventions |
| REQ-KNOW-030 | ADDED | Config Files backend build-file patterns |

## Completion

- **Tasks**: 16/16 code (100%) + 1 `[M]` (raw-scan refresh) done
- **Acceptance Criteria**: all met (SC-001…006)
- **Review**: 5 major (0 critical), all verifier-confirmed and fixed pre-commit
- **Adopted deps**: smol-toml (BSD-3), fast-xml-parser (MIT)

## Review & Verify

- **Review**: 5 major（0 critical）皆 verifier-confirmed 後於 commit 前修復——含 Ruby+PHP polyglot Tech Stack/deps 不一致（Gemfile→[] 短路修，ledger raw-scan/techstack-deps-language-ordering）
- **Verify**: Grade A；Tasks 16/16 code + 1 `[M]`、SC-001…006 全 met
- **Quality Log**: 不可回收（bundle 已失；review 明細僅摘要「5 major」）
- **Source**: summary 內文 + _lessons-ledger

## Knowledge Update

Synced at archive Entry Gate:
- `prospec/ai-knowledge/modules/lib/README.md` (manifest-parsers, detector)
- `prospec/ai-knowledge/modules/services/README.md` (raw-scan.service multi-ecosystem)
