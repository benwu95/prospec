# Project Test Runner & Ecosystem Adaptation Reference

A test record certifies before/after inputs only when both are provable and equal and exit is 0.
The CLI prewrites running; timeout/crash/unavailable/unprovable never restore an old PASS.
Ignore generated suite outputs; tracked outputs remain inputs. Capture does not isolate transient
change-and-restore, external services or ignored dependencies.

## Test Evidence Policy

`test_evidence.exclude_knowledge: true` declares Knowledge is not a test input; absent/false keeps full scope. The CLI resolves `knowledge.base_path` or `{paths.base_dir}/ai-knowledge`; unsafe paths fail closed. Both records carry `test-inputs-v1` / `repository-inputs-without-knowledge-v1` and `test_policy`. Policy, config bytes, command and retained inputs must match; unknown/missing identity requires a real run.

Certified reuse preserves original run facts; newer nonpassing attempts cannot revive old PASS. Explicit `check --record-tests` always executes. Review/context, Knowledge checks and pre-merge CI retain their scope.

## Test Command Resolution Hierarchy

Resolve commands in this order:

1. **Explicit Config**: `.prospec.yaml` `tech_stack.test_command`.
2. **Declared Package Manager**: `tech_stack.package_manager` plus a `package.json` `scripts.test` entry → `<package_manager> test`; otherwise continue.
3. **Dynamic Ecosystem Manifest Detection**, first match:
   - **Rust**: `Cargo.toml` → `cargo test`.
   - **Python**: `poetry.lock` → `poetry run pytest`; `pdm.lock` → `pdm run pytest`; `uv.lock` → `uv run pytest`; `pytest.ini` / `pyproject.toml` / `setup.py` / `requirements.txt` → `pytest`.
   - **Go**: `go.mod` → `go test ./...`.
   - **Node.js**: `package.json` with `scripts.test` → `pnpm test` / `yarn test` / `bun test` by lockfile, else `npm test`.
   - **Make**: `Makefile` with `test:` → `make test`.
4. **Honest Fallback**: unresolved commands are `not-adjudicated` (skipped); configure `tech_stack.test_command`.

## Project Constitution & Commit Invariants

1. **Constitution Obedience**:
   - All code, tests, and commit messages produced during cascading MUST adhere strictly to the project's `prospec/CONSTITUTION.md`.
2. **Language Policy**:
   - Change artifacts (`.prospec/changes/**`, `.prospec/archive/**`) follow the project's configured `artifact_language`.
   - Technical trust zone documentation and commit messages follow standard English conventions (or the project's declared policy).
3. **Atomic Commits**:
   - S/A verification is the single commit boundary. Automated loops NEVER create partial or intermediate commits during implementation or review.
