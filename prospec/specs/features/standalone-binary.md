---
feature: standalone-binary
status: active
last_updated: 2026-09-01
story_count: 2
req_count: 10
---

# Standalone Binary Compilation

## Who & Why

**Target users**: Users who want to run Prospec CLI without Node.js or pnpm installation.

**Problem solved**: Eliminates the requirement of having Node.js / TypeScript environment in target project machines or CI/CD pipelines.

**Why it matters**: Simplifies CLI installation and execution, making Prospec accessible to non-Node.js project ecosystems.

## User Stories & Behavior Specifications

### US-1: Download and Run the Standalone Binary [P1]

As a developer of a downstream project,
I want to directly download the prospec standalone binary for my operating system platform and run it in the terminal,
So that I can use prospec for Spec-Driven Development directly without needing to install Node.js separately on my machine.

**Acceptance Scenarios:**
- WHEN running the downloaded `prospec --version` on a clean Linux/macOS/Windows environment without Node.js, THEN the current version is printed successfully.
- WHEN running `prospec check` in a downstream project directory, THEN drift auditing can proceed normally and the audit results are output.

#### REQ-CLI-001: Standalone Binary Compilation and Packaging for Multi-Platform
When a Release is published on GitHub, automatically trigger the build pipeline to compile Standalone Binary executables for Linux x64, macOS arm64/x64, and Windows x64, complete the macOS codesign, and automatically package and compress them into `.zip` or `.tar.gz` archives.

**Scenarios:**
- WHEN a Release has been published, THEN the assets include prospec-linux-x64.tar.gz, prospec-macos-arm64.tar.gz, prospec-macos-x64.tar.gz, and prospec-windows-x64.zip.
- WHEN running the macOS binary, THEN the ad-hoc codesign signature has been completed, allowing it to run on macOS systems.
- WHEN running any binary, THEN it can run standalone without an external Node.js runtime environment.

#### REQ-LIB-066: Template Embedded Compilation
To solve the problem that a standalone binary cannot access templates in the external file system, all `.hbs` template contents must be aggregated into an in-memory lookup dictionary before packaging and compilation, and read preferentially from that dictionary at runtime.

**Scenarios:**
- WHEN running `pnpm run bundle`, THEN `src/lib/bundled-templates.ts` is automatically generated first.
- WHEN template.ts cannot locate the `templates/` directory in the file system at runtime, THEN it can still use `BUNDLED_TEMPLATES` to successfully render the initial configuration, Change proposal, and task list.

#### REQ-TYPES-001: Static Version Resolution Fallback
To solve the problem that a standalone binary has no `package.json` from which to read the version number, reading `PROSPEC_VERSION` must support static resolution via an environment variable injected at packaging time.

**Scenarios:**
- WHEN `process.env.PROSPEC_VERSION` exists, THEN `PROSPEC_VERSION` directly uses that environment variable value.
- WHEN running the MCP service, THEN `PROSPEC_VERSION` is read uniformly via `types/version`, without using `require('../../package.json')`.
- WHEN running in an unpackaged environment (local development), THEN the version number can still be read from `package.json` via fallback.

#### REQ-DOCS-001: Standalone Binary Installation Documentation
Adjust the installation and execution instructions, including the English README.md and the Chinese README.zh-TW.md in the root directory, as well as the website installation instruction pages under the docs/ directory, to provide users with clear guidance for installing and launching the standalone binary. Public installation and execution documentation stays aligned with the supported delivery paths, frozen public registries, and current host-aware workflow before a release is published.
- WHEN viewing README.md and README.zh-TW.md, THEN a one-click installation script, standalone binary download, and npx/devDependency options have been added, and the global npm install has been removed.
- WHEN visiting the docs/ website, THEN the installation instructions on the relevant pages are synchronously adjusted to the one-click installation script.
- WHEN the standalone binary path is documented, THEN Node.js is explicitly optional; Node.js requirements apply only to npx, devDependency, or source-development paths
- WHEN a Skill is named in shared public prose, THEN its bare `prospec-<name>` identity is used and host-specific explicit invocation syntax is explained separately
- WHEN a major release is prepared, THEN the public documentation describes the current station chain, compatibility boundaries, and downstream upgrade steps before the release is published
- WHEN public content is prepared before that release, THEN the upcoming version is labelled as upcoming while package, configuration, navbar, structured-data version, and release-date fields retain the currently released value until the release bump
- WHEN documentation enumerates the MCP or Skill surface, THEN names and totals match the frozen registries and host profiles in source
- WHEN a numeric efficiency claim is published, THEN it cites a current reproducible measurement; otherwise the documentation uses non-numeric wording and points to `prospec measure`
- WHEN metadata, structured data, FAQ, social-preview text, or accessibility text restates product behavior, THEN it remains semantically aligned with the visible lifecycle, runtime requirements, and invocation guidance in both languages

#### REQ-CLI-020: Add the print-template Subcommand
Add the `print-template <path>` subcommand to the `prospec` CLI to directly output the source content of the built-in Handlebars templates.

**Scenarios:**
- WHEN running `prospec print-template <path>` and the template exists, THEN the raw template string is output directly to `stdout` without formatting.
- WHEN passing a non-existent template path, THEN a `TemplateError` is thrown and execution ends with exit code `1`.

#### REQ-SERVICES-015: Implement the Print-Template Business Logic
Implement the service corresponding to `print-template`, obtaining the template content from `readTemplateSource` in `lib/template.ts`.

**Scenarios:**
- WHEN the parameter `templatePath` is passed and forwarded to `readTemplateSource`, THEN the corresponding template source string is returned.

#### REQ-TEMPLATES-005: Update the Template-Reading Logic in prospec-upgrade.hbs
Modify the execution steps of the `prospec-upgrade` skill to completely remove the scripts that previously used Node.js (`require.resolve`) and package lookup, replacing them with a native call to the `prospec print-template <template_path>` command.

**Scenarios:**
- WHEN running the `prospec-upgrade` skill, THEN no `node` command is called anymore.
- WHEN looking for a template, THEN always call `prospec print-template` preferentially to obtain the template content.

#### REQ-LIB-008: Export the readTemplateSource Function
Modify `src/lib/template.ts` to publicly export `readTemplateSource`.

**Scenarios:**
- WHEN another module needs to read template source code, THEN it can directly call the exported `readTemplateSource` function.


### US-2: Fast, command-scoped CLI startup [P1]

As a developer invoking the prospec CLI (including skills that shell out to it many times per station),
I want each command to load only the dependencies it actually uses, and the `bin` to run a prebuilt bundle with the compile cache on,
So that everyday read commands no longer pay the module-load and fixed startup cost of dependencies unrelated to them.

**Acceptance Scenarios:**
- WHEN running a read command such as `prospec status` or `prospec check`, THEN command-irrelevant heavy dependencies (MCP SDK, @inquirer, manifest parsers) are absent from its startup module set.
- WHEN running the `bin`-installed `prospec --version`, THEN it starts from the prebuilt bundle with the Node module compile cache enabled.

#### REQ-CLI-045: Command-scoped Startup Loading
Each CLI command lazy-loads its service and formatter inside the action handler; command registration imports only the `types` layer. A command's startup module set excludes dependencies that command does not use.
- WHEN running `prospec status`, `prospec check`, `prospec change log`, or `prospec verify record` on the unbundled `dist/cli/index.js`, THEN the loaded module set (counted via `module.registerHooks`) contains none of `@modelcontextprotocol/sdk`, `@inquirer/*`, `fast-xml-parser`, or `smol-toml`.
- WHEN running `prospec status`, `prospec change log`, or `prospec verify record` (none of which render a template), THEN the loaded module set also excludes `handlebars`; `prospec check` legitimately loads `handlebars` only through the canonical-doc-drift collector it actually runs.
- WHEN running `prospec --version` or `prospec change log`, THEN the loaded `node_modules` module count is at most 200 (down from a 530 baseline); WHEN running `prospec status` or `prospec verify record`, which transitively import the drift engine and its fast-glob dependency tree, THEN the count is at most 250 — still more than halved from the 530 baseline.
- WHEN running `prospec mcp serve`, `prospec init`, or `prospec knowledge init`, THEN each command's required dependency (MCP SDK, inquirer, manifest parsers) is imported on demand within the action and observable behavior is unchanged.

#### REQ-CLI-046: Bundled bin and Startup Compile Cache
`package.json` `bin.prospec` points to the built esbuild bundle, `pnpm build` emits that bundle at the path `bin` references, and the Node compile cache is enabled at process start via a first-imported module that runs ahead of the picocolors import.
- WHEN `pnpm build` completes, THEN the file referenced by `bin.prospec` exists and is the bundle the build emits.
- WHEN the bundled CLI starts under Node, THEN `module.enableCompileCache()` has been invoked before any picocolors import, and the non-TTY color-disable side effect (`setup-color`) still runs before picocolors loads.
- WHEN the Release Binaries workflow compiles the bundle with `bun build --compile`, THEN the multi-platform binaries build and the Windows smoke check still pass.

## Edge Cases

- **Template-not-found error**: When running commands that involve file generation (such as `prospec init`) in the Standalone Binary, the Handlebars template-reading mechanism will crash if it expects to access the external `src/templates` directory. Expected behavior: template content must be embedded in the binary at packaging time, ensuring it can be read normally without external physical template files.
- **Version-number read failure**: The binary has no `package.json` to require. Expected behavior: `PROSPEC_VERSION` can be read from a static environment variable or a packaging parameter, without producing the error of not finding `package.json`.

## Success Criteria

- **SC-1**: The assets of the GitHub Release include archives such as `prospec-linux-x64.tar.gz`, `prospec-macos-arm64.tar.gz`, `prospec-macos-x64.tar.gz`, and `prospec-windows-x64.zip`, which can be run directly after extraction.
- **SC-2**: All binaries work normally without installing any external Node.js runtime environment.
- **SC-3**: The binaries support calling the full set of existing commands, including `prospec init`, `prospec check`, and `prospec serve`, and template loading works normally.

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace existing versions
2. **Functional Grouping**: New requirements insert under the corresponding User Story
3. **No Inline Provenance**: Historical attribution only in Change History table
4. **Deprecation over Deletion**: Removed requirements move to Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-09-01 | refresh-v2-documentation | MODIFIED REQ-DOCS-001 | REQ-DOCS-001 |
| 2026-08-29 | lazy-load-cli-startup | ADDED REQ-CLI-045; ADDED REQ-CLI-046 | REQ-CLI-045, REQ-CLI-046 |
| 2026-07-07 | compile-standalone-binary | Implement standalone binary compilation and publish pipeline | US-1, REQ-CLI-001, REQ-LIB-066, REQ-TYPES-001, REQ-DOCS-001 |
| 2026-07-08 | cli-print-template | Add print-template CLI subcommand and service to support Node.js-free template resolution in prospec-upgrade skill | US-1, REQ-CLI-020, REQ-SERVICES-015, REQ-TEMPLATES-005, REQ-LIB-008 |
| 2026-07-08 | compress-release-binaries | Package binaries in .zip and .tar.gz archives and update installers | REQ-CLI-001 |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
