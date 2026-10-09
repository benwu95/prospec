# Customizing Module READMEs (Project Section Extensions)

Use each module README as the knowledge entry point: link its sub-module and supplementary docs, including flow diagrams. Run `prospec check` and inspect `knowledge-size` for per-file budgets.

By default, every module README follows the canonical Recipe-First structure (`## Key Files`, `## Public API`, `## Dependencies`, `## Modification Guide`, `## Pitfalls`, and optional `## Ripple Effects` / `## Sub-Modules`) inside its generated block (`prospec:auto-start` ... `prospec:auto-end`).

On the first non-blank line after the title's one-line summary — blank lines may separate the two — and above that block, sits a format marker: `<!-- prospec:module-readme-format 2026-09-01 -->`. It names the compatible grammar release the file conforms to, not the date the document was last edited: clarifications and registered optional extensions keep the same date, while an incompatible change to marker semantics or the core section grammar earns a new one. [`_module-readme-conventions.md`](../../prospec/ai-knowledge/_module-readme-conventions.md) is the authority for both the marker and the structure, and `prospec validate module-readme <module>` grades a README against them.

To add project-specific custom sections (e.g. `## Team Ownership`, `## Security Rules`), register them in [`prospec/ai-knowledge/_module-readme-conventions.md`](../../prospec/ai-knowledge/_module-readme-conventions.md) inside its `prospec:user` block under `## Project Section Extensions`. This Markdown table is the **single authority** for custom sections (do not define them in `.prospec.yaml`):

| ID | Heading | Content | Applies To | Required | MCP Visibility | Content Format |
| --- | --- | --- | --- | --- | --- | --- |
| team-ownership | Team Ownership | Who owns this module and how to reach them | all | optional | included | field-table |
| security-rules | Security Rules | Security controls enforced in this module | auth,services | required | included | markdown |

- **`Content`**: One-line description of the section's purpose — what it is for and what belongs in it, so an agent knows how to fill it.
- **`Applies To`**: `all` or a comma-separated list of module names.
- **`Required`**: `required` (enforced during validation) or `optional`.
- **`Content Format`**:
  - `field-table`: Strict 2-column key-value table (`| Field | Value |`).
  - `markdown`: Freeform Markdown text.

In the target module's `modules/{module}/README.md`, implement the section within `<!-- prospec:user-start -->` and `<!-- prospec:user-end -->`:

```markdown
<!-- prospec:user-start -->
<!-- prospec:section-start team-ownership -->
## Team Ownership

| Field | Value |
| --- | --- |
| Owner | Platform Team |
| Slack | #platform-eng |
<!-- prospec:section-end team-ownership -->
<!-- prospec:user-end -->
```

Validate conformity at any time:
```bash
prospec validate module-readme <module-name>
```
