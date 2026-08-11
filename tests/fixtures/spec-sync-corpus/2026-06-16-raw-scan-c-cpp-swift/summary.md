# raw-scan-c-cpp-swift — Archive Summary

- **Archived**: 2026-06-16
- **Original Created**: 2026-06-16T08:18:26Z
- **Quality Grade**: A

## User Story

As a developer on a C / C++ / Swift project,
I want raw-scan to detect those languages' entry points, declarative dependencies, build files, and tech stack,
So that the scan is useful beyond the languages with a declarative package manifest.

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `manifest-parsers` vcpkg.json + conanfile.txt parsers; `detector` Swift + C/C++ (extension heuristic), `hasCFamilySource` |
| services | Medium | `raw-scan.service` Swift/C-family dependency dispatch + backend entry/config patterns |
| tests | High | C/C++/Swift fixtures across the three units |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-031 | ADDED | C/C++/Swift Config Files + Entry Points detection |
| REQ-KNOW-032 | ADDED | Declarative dependency parsing (vcpkg.json, conanfile.txt); imperative manifests left to the LLM |
| REQ-KNOW-033 | ADDED | Tech Stack detection for Swift + C/C++ (build-file + source-extension heuristic) |

## Completion

- **Tasks**: 11/11 code (100%)
- **Acceptance Criteria**: all met (SC-001…005)
- **Review**: 2 major (0 critical, 1 nit dropped), both verifier-confirmed and fixed pre-commit; C-family language/deps unified via `hasCFamilySource`
- **New runtime deps**: none (JSON.parse + line scan)

## Knowledge Update

Synced at archive Entry Gate alongside raw-scan-multi-language:
- `prospec/ai-knowledge/modules/lib/README.md`
- `prospec/ai-knowledge/modules/services/README.md`
