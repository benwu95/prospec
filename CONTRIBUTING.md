# Contributing to Prospec

Thank you for considering contributing to Prospec! This guide will help you get started.

## Development Setup

This project uses **pnpm** for development (Node 22.13+, pnpm 11+).

```bash
# Clone the repository
git clone https://github.com/benwu95/prospec.git
cd prospec

# Install dependencies
pnpm install

# First-time local install: build, then register the `prospec` bin globally
pnpm run build && pnpm add -g .

# After making changes, just rebuild — the global bin picks up the new dist/
pnpm run build

# Verify
prospec --help

# Remove it when finished
pnpm uninstall -g prospec
```

> First-time global install needs `pnpm setup` run once to configure the global bin directory.

## Development Workflow

```bash
# Watch mode (recompile on change)
pnpm run dev

# Run all tests
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Type check
pnpm run typecheck

# Lint
pnpm run lint
```

## Project Structure

```
src/
├── cli/          — Commander.js commands + formatters
├── services/     — Business logic (one service per command)
├── lib/          — Pure utility functions
├── types/        — Zod schemas + TypeScript types
└── templates/    — Handlebars templates (.hbs)

tests/
├── unit/         — Unit tests (lib + services)
├── contract/     — Contract tests (CLI output + Skill format)
├── integration/  — Integration tests (multi-service flows)
└── e2e/          — End-to-end tests (real CLI process)
```

## Coding Standards

- **Language**: TypeScript strict mode, no `any`
- **Style**: Follow ESLint + Prettier configuration
- **Naming**: camelCase for variables/functions, PascalCase for types/classes
- **Imports**: Use `.js` extension for relative imports (ESM)
- **Error handling**: Use custom error classes from `src/types/errors.ts`
- **Testing**: Every new service/feature requires tests

## Dependency Management

Development is **pnpm-only**; the single lockfile is `pnpm-lock.yaml`.

When you add, remove, or upgrade a dependency, run `pnpm install` and commit the updated
`pnpm-lock.yaml`:

```bash
pnpm install   # updates pnpm-lock.yaml
```

CI runs `pnpm install --frozen-lockfile` on every push/PR — if the lockfile drifts from
`package.json`, CI fails.

Notes:

- **pnpm 11+ and Node 22.13+ are required** (pnpm 11 needs Node ≥ 22.13; enforced via
  `engines`). Build-script approvals (e.g. esbuild) live in `pnpm-workspace.yaml` under
  `allowBuilds`.
- End users installing the **published** CLI can still use npm or pnpm — the pnpm-only
  rule applies to developing this repo, not to consuming it.

## Making Changes

### 1. Create a branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Use Prospec's own SDD workflow

Prospec uses itself for development! Use the Skills:

```bash
# Describe your change
/prospec-new-story your-feature

# Generate implementation plan + delta-spec
/prospec-plan

# Break down tasks
/prospec-tasks

# Implement (work on the working tree — don't commit yet)
/prospec-implement

# Adversarial review → fix loop (verifier-confirmed criticals auto-fixed)
/prospec-review

# Verify; at grade S/A it prompts you to commit — one atomic commit folding
# implement + review + verify fixes (prospec prompts, never auto-commits)
/prospec-verify

# Archive + sync Feature Specs / Knowledge
/prospec-archive

# (periodic) promote recurring lessons into shared team rules
/prospec-learn
```

> The commit boundary is **after** `/prospec-verify` reaches grade S/A — implement,
> review, and verify all operate on the working tree first, then land as a single
> atomic-by-feature commit. See [README — Quality Gates & Self-Improvement](./README.md#quality-gates--self-improvement).

### 3. Write tests

- Unit tests for new services/utilities
- Contract tests if adding new Skills or CLI output formats
- E2E tests for new CLI commands

### 4. Commit

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): add new feature
fix(scope): fix specific bug
docs: update documentation
test: add or update tests
refactor(scope): restructure code
chore: dependency updates, config changes
```

### 5. Submit a Pull Request

- Write a clear description of what changed and why
- Reference any related issues
- Ensure all tests pass

## Adding a New Skill

1. Add skill definition to `src/types/skill.ts` (SKILL_DEFINITIONS array)
2. Create template at `src/templates/skills/your-skill-name.hbs`
3. If the skill needs references, create `src/templates/skills/references/your-ref.hbs` and map it in `getSkillReferences` (`src/services/agent-sync.service.ts`)
4. Update contract tests in `tests/contract/skill-format.test.ts` — bump the `SKILL_DEFINITIONS` length assertion and write **section-scoped** structure assertions: slice to the section under test, assert distinctive in-section content, then mutation-verify (delete the section and confirm the test goes red). A bare `toContain` over the whole rendered template false-greens against incidental text (team rule `_playbook.md` PB-001).
5. Run `prospec agent sync` to generate the new Skill files

## Adding a New CLI Command

1. Create service at `src/services/your-command.service.ts`
2. Create command at `src/cli/commands/your-command.ts`
3. Create formatter at `src/cli/formatters/your-command-output.ts`
4. Register in `src/cli/index.ts`
5. Add unit tests for the service
6. Add E2E tests in `tests/e2e/cli.test.ts`

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include steps to reproduce for bugs
- Include your Node.js version and OS

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
