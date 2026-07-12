import { describe, it, expect } from 'vitest';
import { readTemplateSource } from '../../src/lib/template.js';

/**
 * The onboarding/upgrade skills must direct the agent to obtain the trigger
 * scaffold from `prospec agent triggers` (REQ-TEMPLATES-108 / 121) rather than
 * grepping a deployed SKILL.md. The existing skill byte-sync contract guarantees
 * the deployed SKILL.md mirrors these templates, so asserting the template source
 * covers both the template and its rendered mirror.
 */
describe('onboarding skills reference `prospec agent triggers`', () => {
  it.each(['prospec-quickstart', 'prospec-upgrade'])(
    '%s.hbs directs the agent to run `prospec agent triggers`',
    (skill) => {
      const src = readTemplateSource(`skills/${skill}.hbs`);
      expect(src).toContain('prospec agent triggers');
    },
  );
});
