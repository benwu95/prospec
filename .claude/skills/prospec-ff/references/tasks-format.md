# Tasks Format Reference

This document defines the expected format for `tasks.md`, used by the **prospec-tasks** Skill.

---

## Purpose

`tasks.md` breaks down `plan.md` implementation steps into concrete development tasks, each carrying its `[M]`/`[V]` kind marker (required); complexity estimates and `[P]` parallelization markers are optional.

---

## Standard Format

### 1. Checkbox Format

Use Markdown checkbox syntax:

```markdown
- [ ] Pending task
- [x] Completed task
```

---

### 2. Architecture-Layer Grouping

Group tasks by architecture layer in recommended order:

```markdown
## Types

- [ ] [Task description] ~{lines} lines

## Lib

- [ ] [Task description] ~{lines} lines

## Services

- [ ] [Task description] ~{lines} lines

## CLI

- [ ] [Task description] ~{lines} lines

## Tests

- [ ] [Task description] ~{lines} lines
```

**Example:**

```markdown
## Types

- [ ] Define ErrorType enum (ValidationError, NotFoundError, etc.) ~30 lines
- [ ] Create ErrorResponse interface for API responses ~20 lines

## Lib

- [ ] [P] Implement BaseError class with error code mapping ~50 lines
- [ ] [P] Implement ErrorFormatter utility ~40 lines
- [ ] Create error factory functions (createValidationError, etc.) ~60 lines

## Services

- [ ] Integrate error handler with API middleware ~80 lines
- [ ] Update existing error handling in UserService ~40 lines
- [ ] Update existing error handling in AuthService ~40 lines

## CLI

- [ ] Add error code reference to CLI help command ~20 lines

## Tests

- [ ] [P] Write unit tests for BaseError class ~60 lines
- [ ] [P] Write unit tests for ErrorFormatter ~50 lines
- [ ] Write integration tests for API error responses ~100 lines
```

---

### 3. Parallelizable Task Markers (Optional)

`[P]` is an **optional** reader aid — no skill or service consumes it (implement executes tasks sequentially), so never gate on it. Use it only when it helps a human split the work: mark tasks that can run in parallel (no dependencies):

```markdown
- [ ] [P] Parallelizable task 1 ~50 lines
- [ ] [P] Parallelizable task 2 ~50 lines
```

---

### 4. Task Kind Markers

> This section is the **single frozen definition** of the task `kind` schema. Other skills
> and references cite this section — they must not restate the definition.

Every task has exactly one kind. Mark non-code tasks; an unmarked task **is** code:

| Marker | Kind | Meaning | Examples |
|--------|------|---------|----------|
| (none) | `code` | Changes source, templates, tests, or docs in the repo | implement schema field, edit template, write test |
| `[M]` | `manual` | A human or out-of-repo action; produces no diff | run a CLI command, configure an external tool, obtain an API key |
| `[V]` | `verification` | Confirms an outcome without producing new content | mutation-verify assertions, confirm a fixture is unchanged |

```markdown
- [ ] T1 Implement scale field in schema ~15 lines        ← code (unmarked)
- [ ] T2 [M] Run `prospec agent sync` to redeploy ~5 lines
- [ ] T3 [V] Mutation-verify the new assertions ~10 lines
```

**Rules:**

- Kind markers compose with `[P]`: `- [ ] T4 [P] [M] ...` (order: `[P]` before kind)
- A task with no marker is `code` — old tasks.md files without markers remain valid (all code)
- Consumer semantics: completion rate counts **code tasks only**; `[M]`/`[V]` tasks are listed
  separately and never counted in the completion denominator (verify), and unchecked `[M]`
  tasks warn without blocking (archive)

---

### 5. Complexity Estimate Format (Optional)

`~{lines} lines` is an **optional** estimate — nothing downstream reads it, so never gate on it. When you do include one, use this format (not S/M/L):

```markdown
- [ ] Simple task ~20 lines
- [ ] Medium task ~50 lines
- [ ] Complex task ~100 lines
```

---

### 6. Summary Section

Add a summary at the end of the file:

```markdown
## Summary

- **Total Tasks:** {total task count}
- **Parallelizable Tasks:** {parallelizable task count}
- **Total Estimated Lines:** ~{total estimated lines} lines
```

**Example:**

```markdown
## Summary

- **Total Tasks:** 13
- **Parallelizable Tasks:** 4
- **Total Estimated Lines:** ~640 lines
```

---

## Task Granularity Guidelines

- **Ideal count: 15-25 tasks**
- **Too many (>25):** Consider merging similar tasks
- **Too few (<10):** Consider splitting complex tasks

---

## Task Granularity Examples

### Good granularity:

```markdown
- [ ] Implement BaseError class with error code mapping ~50 lines
```

### Too coarse (needs splitting):

```markdown
- [ ] Implement entire error handling system ~500 lines
```

**Split into:**

```markdown
- [ ] Implement BaseError class ~50 lines
- [ ] Implement ErrorFormatter utility ~40 lines
- [ ] Implement error factory functions ~60 lines
- [ ] Integrate with API middleware ~80 lines
```

### Too fine (needs merging):

```markdown
- [ ] Import BaseError class ~1 line
- [ ] Define error code constant ~1 line
- [ ] Define error message constant ~1 line
```

**Merge into:**

```markdown
- [ ] Define error codes and messages ~30 lines
```

---

## File Length Guidelines

- Keep under **100 lines**
- If tasks exceed 30, consider whether the Story scope is too large

---

## Reference Information

- Project name: `prospec`
- AI Knowledge path: `prospec/ai-knowledge`
- Constitution file: `prospec/CONSTITUTION.md`
