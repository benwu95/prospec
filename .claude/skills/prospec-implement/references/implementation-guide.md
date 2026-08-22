# Implementation Guide

This document provides implementation guidelines for the **prospec-implement** Skill.

---

## Implementation Principles

### 1. TDD Approach (If Required by Constitution)

If `prospec/CONSTITUTION.md` requires TDD (Test-Driven Development):

1. **Write tests first:** Write corresponding unit tests before implementing functionality
2. **Red-Green-Refactor cycle:**
   - Red: Write test, ensure it fails
   - Green: Implement minimum functionality to pass the test
   - Refactor: Optimize code quality
3. **Test coverage:** Ensure core logic has sufficient test coverage

---

### 2. Task Execution Order

Follow the architecture-layer sequence defined in `tasks.md` — the project's own layers, lowest-dependency first (e.g. `Domain → Ports → Adapters → Tests`, or `Models → Services → Controllers → Tests`).

**Dependency rules:**
- Complete depended-upon (lower) layers first
- Then implement the layers that depend on them
- `[P]` marked tasks can be executed simultaneously (no dependencies)

**Example execution order** (illustrative only — a layered example project; substitute your project's own layers):

```
1. Types/Define ErrorType enum
2. Types/Create ErrorResponse interface
3. [P] Lib/Implement BaseError class (parallelizable)
   [P] Lib/Implement ErrorFormatter utility (parallelizable)
4. Lib/Create error factory functions (depends on BaseError)
5. Services/Integrate with API middleware (depends on BaseError, ErrorFormatter)
```

---

### 3. Progressive Disclosure

**Only load AI Knowledge relevant to the current task:**

1. **Before starting:** Read `prospec/index.md` to understand overall architecture
2. **During task execution:** Only read `prospec/ai-knowledge/modules/{module}/README.md` for the relevant module
3. **Avoid:** Loading all AI Knowledge files at once

**Example:**

When executing task `Implement BaseError class`:
- Read `prospec/ai-knowledge/modules/error-handler/README.md`
- No need to read `api-middleware`, `logger`, or other module READMEs

---

### 4. Task Completion Marking

**Mark complete immediately:**

After completing each task, immediately update `tasks.md` to mark as `[x]`:

```markdown
- [x] Implement BaseError class with error code mapping ~50 lines
```

This helps track progress and avoid duplicate work.

---

### 5. Commit Strategy

**Do not commit during implement.** The commit boundary is after `/prospec-verify` reaches Grade S/A: implement, review, and verify all operate on the working tree, and the change is then committed **once** as a single atomic-by-feature commit.

- **Why defer:** committing after each task group breaks atomic-by-feature the moment review or verify requires a fix, and it inverts the provenance order (content finalized → commit → record → archive).
- **At the boundary:** follow the commit rules in `prospec/CONSTITUTION.md` for message format and grouping — this guide does not restate them. prospec prompts the user to commit; it never auto-commits.

---

### 6. Error Handling

**If a task fails:**

1. **Record blocker:** Document the issue in `tasks.md` or the Story's Notes
2. **Continue execution:** If there are other independent tasks, continue with them
3. **Report:** Report incomplete tasks and reasons when Story is finalized

**Example:**

```markdown
## Blockers

- Task "Integrate with API middleware" blocked: API middleware module not yet merged from another branch
```

---

### 7. Code Quality Checks

**After completing implementation:**

1. **Lint:** Run linter to ensure consistent code style
   ```bash
   pnpm run lint
   ```

2. **Type Check:** Run TypeScript type checking
   ```bash
   pnpm run type-check
   ```

3. **Tests:** Run tests to verify functionality
   ```bash
   pnpm test
   ```

---

## Reference Information

- Project name: `prospec`
- Tech stack: `typescript` + ``
- Package manager: `pnpm`
- AI Knowledge path: `prospec/ai-knowledge`
- Constitution file: `prospec/CONSTITUTION.md`
