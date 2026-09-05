# Project Test Runner & Ecosystem Adaptation Reference

This document defines the **Project Test Runner & Multi-Ecosystem Adaptation Guidelines** for executing tests and adhering to project conventions across varied tech stacks.

---

A test record certifies before/after repository inputs only when both snapshots are provable and equal
and the actual exit is 0. The CLI prewrites running; timeout/crash/unavailable/unprovable attempts do
not restore an old PASS. Declare generated suite outputs in Git ignores; tracked outputs remain inputs.
Snapshot capture is not isolation against transient change-and-restore, external services or ignored dependencies.

## Purpose

Prospec is an architecture- and language-agnostic Spec-Driven Development framework. When executing automated testing during implementation, review, and verification, the Agent dynamically adapts to the host repository's test runner, language conventions, and Constitution.

---

## Test Command Resolution Hierarchy

When executing project test suites (`check --record-tests`, implement verification, or verify 5/5), the test command is resolved in the following priority:

1. **Explicit Config (`.prospec.yaml`)**:
   - `tech_stack.test_command` (e.g. `pytest -q`, `cargo test`, `pnpm test`) — highest priority.
2. **Declared Package Manager**:
   - `tech_stack.package_manager` set in `.prospec.yaml` **and** `package.json` has a `scripts.test` entry → `<package_manager> test`. Without the declared package manager this step is skipped — a Node project then falls under dynamic detection below, after Rust, Python and Go.
3. **Dynamic Ecosystem Manifest Detection** (first match wins, in this order):
   - **Rust**: `Cargo.toml` → `cargo test`
   - **Python**:
     - `poetry.lock` → `poetry run pytest`
     - `pdm.lock` → `pdm run pytest`
     - `uv.lock` → `uv run pytest`
     - `pytest.ini` / `pyproject.toml` / `setup.py` / `requirements.txt` → `pytest`
   - **Go**: `go.mod` → `go test ./...`
   - **Node.js**: `package.json` with a `scripts.test` entry → `pnpm test` / `yarn test` / `bun test` by lockfile, else `npm test`
   - **Make**: `Makefile` with `test:` target → `make test`
4. **Honest Fallback**:
   - If no test command can be resolved, tests are marked as `not-adjudicated` (skipped honestly) and the developer is guided to configure `tech_stack.test_command` in `.prospec.yaml`.

---

## Project Constitution & Commit Invariants

1. **Constitution Obedience**:
   - All code, tests, and commit messages produced during cascading MUST adhere strictly to the project's `prospec/CONSTITUTION.md`.
2. **Language Policy**:
   - Change artifacts (`.prospec/changes/**`, `.prospec/archive/**`) follow the project's configured `artifact_language`.
   - Technical trust zone documentation and commit messages follow standard English conventions (or the project's declared policy).
3. **Atomic Commits**:
   - S/A verification is the single commit boundary. Automated loops NEVER create partial or intermediate commits during implementation or review.

---

## Reference Information

- Project name: `prospec`
- AI Knowledge path: `prospec/ai-knowledge`
- Constitution file: `prospec/CONSTITUTION.md`
