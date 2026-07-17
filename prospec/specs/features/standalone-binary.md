---
feature: standalone-binary
status: active
last_updated: 2026-07-08
story_count: 1
req_count: 8
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

#### REQ-LIB-001: Template Embedded Compilation
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
Adjust the installation and execution instructions, including the English README.md and the Chinese README.zh-TW.md in the root directory, as well as the website installation instruction pages under the docs/ directory, to provide users with clear guidance for installing and launching the standalone binary.

**Scenarios:**
- WHEN viewing README.md and README.zh-TW.md, THEN a one-click installation script, standalone binary download, and npx/devDependency options have been added, and the global npm install has been removed.
- WHEN visiting the docs/ website, THEN the installation instructions on the relevant pages are synchronously adjusted to the one-click installation script.

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
| 2026-07-07 | compile-standalone-binary | Implement standalone binary compilation and publish pipeline | US-1, REQ-CLI-001, REQ-LIB-001, REQ-TYPES-001, REQ-DOCS-001 |
| 2026-07-08 | cli-print-template | Add print-template CLI subcommand and service to support Node.js-free template resolution in prospec-upgrade skill | US-1, REQ-CLI-020, REQ-SERVICES-015, REQ-TEMPLATES-005, REQ-LIB-008 |
| 2026-07-08 | compress-release-binaries | Package binaries in .zip and .tar.gz archives and update installers | REQ-CLI-001 |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
