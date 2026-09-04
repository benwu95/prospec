import { describe, expect, it } from 'vitest';
import {
  parseModuleReadmeExtensions,
  validateModuleReadmeFormat,
} from '../../../src/lib/module-readme-format.js';

const convention = `# Module README Conventions
<!-- prospec:auto-start -->
Core rules
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
~~~markdown
| ID | Heading | Content | Applies To | Required | MCP Visibility | Content Format |
| --- | --- | --- | --- | --- | --- | --- |
| ignored | Ignored | Ignored purpose | all | optional | included | markdown |
~~~

## Project Section Extensions
| ID | Heading | Content | Applies To | Required | MCP Visibility | Content Format |
| --- | --- | --- | --- | --- | --- | --- |
| ownership | Ownership | Who owns this module | services | required | included | field-table |
| runbook | Runbook | On-call runbook steps | all | optional | included | markdown |
<!-- prospec:user-end -->`;

const readme = `# Services
> Command orchestration
<!-- prospec:module-readme-format 2026-09-01 -->
<!-- prospec:auto-start -->
## Key Files
## Public API
## Dependencies
## Modification Guide
## Pitfalls
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
<!-- prospec:section-start ownership -->
## Ownership
| Field | Value |
| --- | --- |
| _Add field_ | _Add value_ |
<!-- prospec:section-end ownership -->
<!-- prospec:user-end -->`;

describe('Module README format', () => {
  it('parses the canonical Markdown extension registry without treating fenced examples as declarations', () => {
    const report = parseModuleReadmeExtensions(convention);

    expect(report).toMatchObject({ ok: true });
    expect(report.declarations).toEqual([
      {
        id: 'ownership',
        heading: 'Ownership',
        content: 'Who owns this module',
        appliesTo: ['services'],
        required: true,
        mcpVisibility: 'included',
        contentFormat: 'field-table',
      },
      {
        id: 'runbook',
        heading: 'Runbook',
        content: 'On-call runbook steps',
        appliesTo: 'all',
        required: false,
        mcpVisibility: 'included',
        contentFormat: 'markdown',
      },
    ]);
  });

  it('accepts the dated Core grammar and a required field-table extension instance', () => {
    expect(validateModuleReadmeFormat({ module: 'services', readme, convention })).toMatchObject({
      ok: true,
      findings: [],
    });
  });

  it('reports legacy or misplaced format grammar and ignores illustrative fenced extension markers', () => {
    const legacy = readme.replace('<!-- prospec:module-readme-format 2026-09-01 -->\n', '');
    const fencedExample = readme.replace(
      '<!-- prospec:user-end -->',
      `~~~markdown
<!-- prospec:section-start unregistered-example -->
## Example
<!-- prospec:section-end unregistered-example -->
~~~
<!-- prospec:user-end -->`,
    );

    const legacyReport = validateModuleReadmeFormat({ module: 'services', readme: legacy, convention });
    expect(legacyReport.ok).toBe(false);
    expect(legacyReport.findings.some((item) => item.message.includes('needs exactly one'))).toBe(true);
    expect(validateModuleReadmeFormat({ module: 'services', readme: fencedExample, convention })).toMatchObject({
      ok: true,
    });
  });

  it('rejects duplicate, unknown, wrong-heading, misplaced, non-applicable, and missing required extension instances', () => {
    const duplicate = readme.replace(
      '<!-- prospec:user-end -->',
      `<!-- prospec:section-start ownership -->
## Ownership
| Field | Value |
| --- | --- |
| team | Knowledge |
<!-- prospec:section-end ownership -->
<!-- prospec:user-end -->`,
    );
    const unknown = readme.replaceAll('ownership', 'unknown');
    const wrongHeading = readme.replace('## Ownership', '## Owners');
    const misplaced = readme.replace(
      '<!-- prospec:user-start -->\n<!-- prospec:section-start ownership -->',
      '<!-- prospec:section-start ownership -->\n<!-- prospec:user-start -->',
    );
    const nonApplicable = readme.replaceAll('services', 'cli');
    const missingRequired = readme.replace(
      /<!-- prospec:section-start ownership -->[\s\S]*?<!-- prospec:section-end ownership -->\n/,
      '',
    );

    for (const [candidate, expected] of [
      [duplicate, 'is duplicated'],
      [unknown, 'is not registered'],
      [wrongHeading, "must use heading '## Ownership'"],
      [misplaced, 'must be inside the README user block'],
      [nonApplicable, "does not apply to module 'cli'"],
      [missingRequired, "required extension 'ownership' is missing"],
    ] as const) {
      const report = validateModuleReadmeFormat({
        module: candidate === nonApplicable ? 'cli' : 'services',
        readme: candidate,
        convention,
      });
      expect(report.ok, expected).toBe(false);
      expect(report.findings.some((item) => item.message.includes(expected)), expected).toBe(true);
    }
  });

  it('makes an unclosed fence an actionable format failure', () => {
    const report = validateModuleReadmeFormat({
      module: 'services',
      readme: `${readme}\n~~~markdown`,
      convention,
    });

    expect(report.ok).toBe(false);
    expect(report.findings.some((item) => item.message.includes('unclosed Markdown fence'))).toBe(true);
  });

  it('accepts the exact field-table placeholder and rejects each structural mutation', () => {
    const mutations = [
      [readme.replace('| Field | Value |', '| field | Value |'), 'exact `| Field | Value |` header'],
      [readme.replace('| --- | --- |', '| --- | --- | --- |'), 'valid two-column separator'],
      [readme.replace('| _Add field_ | _Add value_ |', ''), 'at least one body row'],
      [readme.replace('| _Add field_ | _Add value_ |', '| owner | |'), 'exactly two non-empty cells'],
      [readme.replace('| _Add field_ | _Add value_ |', '| owner | team | extra |'), 'exactly two non-empty cells'],
    ] as const;

    const placeholder = validateModuleReadmeFormat({ module: 'services', readme, convention });
    expect(placeholder.ok).toBe(true);
    for (const [candidate, expected] of mutations) {
      const report = validateModuleReadmeFormat({ module: 'services', readme: candidate, convention });
      expect(report.ok, expected).toBe(false);
      expect(report.findings.some((item) => item.message.includes(expected)), expected).toBe(true);
    }
  });

  it('rejects duplicate Core headings and stray content between markers', () => {
    const duplicateCore = readme.replace(
      '## Pitfalls',
      '## Pitfalls\n## Public API',
    );
    const contentBeforeAuto = readme.replace(
      '<!-- prospec:auto-start -->',
      'stray line between marker and auto block\n<!-- prospec:auto-start -->',
    );
    const contentBetweenBlocks = readme.replace(
      '<!-- prospec:user-start -->',
      'stray line between auto and user\n<!-- prospec:user-start -->',
    );

    const dupReport = validateModuleReadmeFormat({ module: 'services', readme: duplicateCore, convention });
    expect(dupReport.ok).toBe(false);
    expect(dupReport.findings.some((item) => item.message.includes('Core heading ## Public API is duplicated'))).toBe(true);

    const beforeAutoReport = validateModuleReadmeFormat({ module: 'services', readme: contentBeforeAuto, convention });
    expect(beforeAutoReport.ok).toBe(false);
    expect(beforeAutoReport.findings.some((item) => item.message.includes('content is not allowed between format marker and auto block'))).toBe(true);

    const betweenBlocksReport = validateModuleReadmeFormat({ module: 'services', readme: contentBetweenBlocks, convention });
    expect(betweenBlocksReport.ok).toBe(false);
    expect(betweenBlocksReport.findings.some((item) => item.message.includes('content is not allowed between auto block and user block'))).toBe(true);
  });

  // Build a README with a custom user-block body around the dated Core grammar.
  const coreReadme = (userBody: string): string => `# Services
> Command orchestration
<!-- prospec:module-readme-format 2026-09-01 -->
<!-- prospec:auto-start -->
## Key Files
## Public API
## Dependencies
## Modification Guide
## Pitfalls
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
${userBody}
<!-- prospec:user-end -->`;

  it('reports the field-table separator failure on its real source line', () => {
    // In `readme`, the separator sits on line 15; the offset must be anchored to
    // the table body, not the section-start marker (regression guard for the base mix-up).
    const badSeparator = readme.replace('| --- | --- |', '| --- | --- | --- |');
    const report = validateModuleReadmeFormat({ module: 'services', readme: badSeparator, convention });
    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual({
      level: 'FAIL',
      message: 'line 15: field-table extension needs a valid two-column separator',
    });
  });

  it('rejects a plain-text pseudo-heading that merely equals the registered heading', () => {
    const pseudo = coreReadme(
      '<!-- prospec:section-start runbook -->\nRunbook\n\nsome content\n<!-- prospec:section-end runbook -->',
    );
    const report = validateModuleReadmeFormat({ module: 'cli', readme: pseudo, convention });
    expect(report.ok).toBe(false);
    expect(report.findings.some((item) => item.message.includes("must use heading '## Runbook'"))).toBe(true);
  });

  it('accepts a real H2 markdown extension with the generator placeholder body', () => {
    const markdown = coreReadme(
      '<!-- prospec:section-start runbook -->\n## Runbook\n\n_Add content_\n<!-- prospec:section-end runbook -->',
    );
    expect(validateModuleReadmeFormat({ module: 'cli', readme: markdown, convention })).toMatchObject({ ok: true });
  });

  it('diagnoses each malformed section-marker arrangement', () => {
    const nested = coreReadme(
      '<!-- prospec:section-start runbook -->\n<!-- prospec:section-start ownership -->\n## Ownership\n<!-- prospec:section-end ownership -->\n<!-- prospec:section-end runbook -->',
    );
    const endWithoutStart = coreReadme('<!-- prospec:section-end runbook -->');
    const unclosed = coreReadme('<!-- prospec:section-start ownership -->\n## Ownership');

    for (const [candidate, expected] of [
      [nested, "starts before 'runbook' ends"],
      [endWithoutStart, 'ends without a matching start marker'],
      [unclosed, 'has no matching end marker'],
    ] as const) {
      const report = validateModuleReadmeFormat({ module: 'cli', readme: candidate, convention });
      expect(report.ok, expected).toBe(false);
      expect(report.findings.some((item) => item.message.includes(expected)), expected).toBe(true);
    }
  });

  it('closes a started block on a mismatched end so it is not also reported missing', () => {
    const mismatched = coreReadme(
      '<!-- prospec:section-start ownership -->\n## Ownership\n| Field | Value |\n| --- | --- |\n| a | b |\n<!-- prospec:section-end runbook -->',
    );
    const report = validateModuleReadmeFormat({ module: 'services', readme: mismatched, convention });
    expect(report.ok).toBe(false);
    expect(report.findings.some((item) => item.message.includes("does not match start ID 'ownership'"))).toBe(true);
    expect(report.findings.some((item) => item.message.includes("required extension 'ownership' is missing"))).toBe(false);
  });

  const MARKER = '<!-- prospec:module-readme-format 2026-09-01 -->';
  // Everything below the auto block is constant, so each placement case varies
  // only the title/summary/marker arrangement above it.
  const withHead = (head: string): string => `${head}
<!-- prospec:auto-start -->
## Key Files
## Public API
## Dependencies
## Modification Guide
## Pitfalls
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
<!-- prospec:user-end -->`;

  it('accepts blank lines between the summary and the format marker', () => {
    const spaced = withHead(`# CLI Surface\n> Thin I/O layer\n\n${MARKER}`);
    expect(validateModuleReadmeFormat({ module: 'cli', readme: spaced, convention })).toMatchObject({ ok: true });
  });

  it('rejects non-blank content between the summary and the format marker, anchored to that line', () => {
    const strayed = withHead(`# CLI Surface\n> Thin I/O layer\nstray note\n${MARKER}`);
    const report = validateModuleReadmeFormat({ module: 'cli', readme: strayed, convention });
    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual({
      level: 'FAIL',
      message: 'line 3: only blank lines may separate the summary from the format marker',
    });
  });

  it('reports every stray line before the marker, at the same density as the marker/auto-block gap', () => {
    const strayed = withHead(`# CLI Surface\n> Thin I/O layer\nfirst stray\nsecond stray\n${MARKER}`);
    const report = validateModuleReadmeFormat({ module: 'cli', readme: strayed, convention });
    const gap = report.findings.filter((item) => item.message.includes('only blank lines may separate'));
    expect(gap.map((item) => item.message)).toEqual([
      'line 3: only blank lines may separate the summary from the format marker',
      'line 4: only blank lines may separate the summary from the format marker',
    ]);
  });

  it('names the out-of-order header once instead of cascading over the whole document', () => {
    // Regression pin: the summary/marker gap shares the auto-block gap's order
    // guard. Without it, a marker below the auto block turns every body line
    // into a `only blank lines may separate…` finding with a useless remedy.
    const belowAuto = `# CLI Surface
> Thin I/O layer
<!-- prospec:auto-start -->
## Key Files
## Public API
## Dependencies
## Modification Guide
## Pitfalls
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
<!-- prospec:user-end -->
${MARKER}`;
    const report = validateModuleReadmeFormat({ module: 'cli', readme: belowAuto, convention });
    expect(report.ok).toBe(false);
    expect(report.findings.filter((item) => item.message.includes('only blank lines may separate'))).toEqual([]);
    expect(report.findings.some((item) => item.message.includes('auto block must appear after the format marker'))).toBe(true);
  });

  it('treats a closed fenced block before the marker as blank, matching the shared mask', () => {
    const fenced = withHead(`# CLI Surface\n> Thin I/O layer\n\n~~~text\nillustrative\n~~~\n\n${MARKER}`);
    expect(validateModuleReadmeFormat({ module: 'cli', readme: fenced, convention })).toMatchObject({ ok: true });
  });

  it('anchors an absent marker to the line it belongs on and states the placement rule', () => {
    const missing = withHead('# CLI Surface\n> Thin I/O layer');
    const report = validateModuleReadmeFormat({ module: 'cli', readme: missing, convention });
    expect(report.ok).toBe(false);
    const marker = report.findings.find((item) => item.message.includes('needs exactly one'));
    expect(marker?.message).toContain('line 3:');
    expect(marker?.message).toContain('first non-blank line after the summary');
  });

  it('falls back to line 1 for an absent marker when there is no valid summary to anchor to', () => {
    const noSummary = withHead('# CLI Surface\nplain text, not a blockquote');
    const report = validateModuleReadmeFormat({ module: 'cli', readme: noSummary, convention });
    expect(report.ok).toBe(false);
    const marker = report.findings.find((item) => item.message.includes('needs exactly one'));
    expect(marker?.message).toContain('line 1:');
  });

  it('keeps the exactly-one verdict and its line 1 anchor for a duplicated marker', () => {
    const duplicated = withHead(`# CLI Surface\n> Thin I/O layer\n${MARKER}\n${MARKER}`);
    const report = validateModuleReadmeFormat({ module: 'cli', readme: duplicated, convention });
    expect(report.ok).toBe(false);
    const marker = report.findings.find((item) => item.message.includes('needs exactly one'));
    expect(marker?.message).toContain('line 1:');
    expect(marker?.message).not.toContain('first non-blank line after the summary');
  });

  it('still fails a marker placed above the summary, through the existing summary check', () => {
    const inverted = withHead(`# CLI Surface\n${MARKER}\n> Thin I/O layer`);
    const report = validateModuleReadmeFormat({ module: 'cli', readme: inverted, convention });
    expect(report.ok).toBe(false);
    expect(report.findings.some((item) => item.message.includes('needs one blockquote summary after its title'))).toBe(true);
    expect(report.findings.some((item) => item.message.includes('only blank lines may separate'))).toBe(false);
  });

  it('validates a CRLF README the same as its LF form', () => {
    const crlf = readme.replace(/\n/g, '\r\n');
    expect(validateModuleReadmeFormat({ module: 'services', readme: crlf, convention })).toMatchObject({ ok: true });
  });
});

