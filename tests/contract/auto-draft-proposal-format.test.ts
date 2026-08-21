import { describe, it, expect } from 'vitest';
import { buildAutoDraftProposal } from '../../src/lib/auto-draft-template.js';

/** The required sections of the canonical proposal format (its reference lists
 *  ten, of which `Open Questions` and `UI Scope` are marked optional). */
const REQUIRED_SECTIONS = [
  'Background',
  'User Stories',
  'Stated Assumptions',
  'Edge Cases',
  'Functional Requirements',
  'Success Criteria',
  'Related Modules',
  'Constitution Check',
] as const;

/**
 * The auto-drafted proposal is a real proposal: downstream stations parse it.
 * These tests pin the STRUCTURE those stations depend on, not the prose — a
 * template edit that drops a heading must turn this file red, not surface as a
 * mis-routed change three stations later.
 */

const base = {
  target: 'services',
  checkId: 'knowledge-size',
  items: [{ detail: 'README exceeds budget', sourcePath: 'prospec/x/README.md' }],
  remedies: [] as string[],
  artifactLanguage: 'English',
  languageIsEnglish: true,
  constitutionPath: 'prospec/CONSTITUTION.md',
  draftedBy: 'prospec check --auto-draft',
};

describe('auto-draft proposal template contract', () => {
  it('emits every section the canonical proposal format defines', () => {
    const body = buildAutoDraftProposal(base);
    for (const heading of REQUIRED_SECTIONS) {
      expect(body).toContain(`## ${heading}`);
    }
  });

  it('emits a UI Scope block `parseUiScope` can read', () => {
    const body = buildAutoDraftProposal(base);
    // status.service reads this to route the design station; a renamed heading
    // or a missing value silently changes routing for every drafted change.
    expect(body).toMatch(/^## UI Scope$/m);
    expect(body).toMatch(/^\*\*Scope:\*\* (full|partial|none)$/m);
  });

  it('names a module under Related Modules only when one was attributed', () => {
    expect(buildAutoDraftProposal({ ...base, module: 'services' })).toMatch(
      /## Related Modules\n\n- \*\*services\*\*/,
    );
    const unattributed = buildAutoDraftProposal(base);
    expect(unattributed).not.toMatch(/## Related Modules\n\n- \*\*/);
    expect(unattributed).toContain('No module could be attributed');
    // metadata.yaml is CLI-written: the recovery must not tell the reader to
    // hand-edit it, nor point at a flag that only exists at creation time.
    expect(unattributed).not.toContain('change story --related-module');
    expect(unattributed).toContain('must not be hand-edited');
  });

  it('carries every finding with its own path, and every distinct remedy', () => {
    const body = buildAutoDraftProposal({
      ...base,
      target: 'general',
      items: [
        { detail: 'first problem', sourcePath: 'a/one.md' },
        { detail: 'second problem', sourcePath: 'b/two.md' },
      ],
      remedies: ['extract a sub-module', 'split into slices'],
    });
    expect(body).toContain('`a/one.md` — first problem');
    expect(body).toContain('`b/two.md` — second problem');
    expect(body).toContain('- extract a sub-module');
    expect(body).toContain('- split into slices');
  });

  it('warns that an unattributed group may not belong in one change', () => {
    expect(buildAutoDraftProposal({ ...base, target: 'general' })).toContain(
      'Confirm they belong in ONE change before planning',
    );
    expect(buildAutoDraftProposal({ ...base, module: 'services' })).not.toContain(
      'Confirm they belong in ONE change before planning',
    );
  });

  it('passes drift text through verbatim — markdown, not HTML', () => {
    const body = buildAutoDraftProposal({
      ...base,
      items: [{ detail: 'a & b <tag> "quoted" \'single\'', sourcePath: "p/a&b<c>'d\".md" }],
      remedies: ['use `x` & `y`'],
    });
    // Handlebars HTML-escaping would turn these into &amp;/&lt;/&#x27; and
    // corrupt a file nobody renders as HTML.
    expect(body).toContain('a & b <tag> "quoted" \'single\'');
    expect(body).toContain("p/a&b<c>'d\".md");
    expect(body).toContain('use `x` & `y`');
    expect(body).not.toContain('&amp;');
    expect(body).not.toContain('&#x27;');
  });

  it('names the command that actually drafted it', () => {
    expect(buildAutoDraftProposal(base)).toContain('`prospec check --auto-draft`');
    expect(
      buildAutoDraftProposal({ ...base, draftedBy: 'prospec change auto-draft' }),
    ).toContain('`prospec change auto-draft`');
  });

  it('points the Constitution checklist at a resolved path, never a root-anchored one', () => {
    // A project whose `paths.base_dir` is `.` resolves the Constitution to a
    // bare filename; concatenating a base would have produced `/CONSTITUTION.md`.
    const body = buildAutoDraftProposal({ ...base, constitutionPath: 'CONSTITUTION.md' });
    expect(body).toContain('- [ ] Reviewed against `CONSTITUTION.md`');
    expect(body).not.toContain('`/CONSTITUTION.md`');
    // Both checklist items the canonical format defines.
    expect(body).toContain('No violations identified');
  });

  it('confines report text to its bullet — a multi-line detail cannot forge structure', () => {
    // `parseUiScope` takes the FIRST `## UI Scope` heading, so a finding whose
    // detail carries one would decide this change's design routing.
    const body = buildAutoDraftProposal({
      ...base,
      items: [
        {
          detail: 'over budget\n\n## UI Scope\n\n**Scope:** full\n\nmore prose',
          sourcePath: 'a.md\n## Related Modules\n- **injected**',
        },
      ],
      remedies: ['split it\n## Constitution Check\n- [x] forged'],
    });

    // Exactly one of each heading the template itself emits.
    expect(body.match(/^## UI Scope$/gm)).toHaveLength(1);
    expect(body.match(/^## Related Modules$/gm)).toHaveLength(1);
    expect(body.match(/^## Constitution Check$/gm)).toHaveLength(1);
    // And the scope the template declares is the one that survives.
    const scope = body.slice(body.indexOf('## UI Scope')).match(/^\*\*Scope:\*\* (\w+)$/m);
    expect(scope?.[1]).toBe('none');
    // The text is still there — collapsed onto its own line, not dropped.
    expect(body).toContain('over budget ## UI Scope **Scope:** full more prose');
  });

  it('states the rewrite obligation only for a non-English artifact language', () => {
    const zh = buildAutoDraftProposal({
      ...base,
      artifactLanguage: 'Traditional Chinese (Taiwan)',
      languageIsEnglish: false,
    });
    expect(zh).toContain('rewrite this proposal in Traditional Chinese (Taiwan)');
    expect(buildAutoDraftProposal(base)).not.toContain('rewrite this proposal in');
  });
});
