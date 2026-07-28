/**
 * Contract tests for generated change-artifact output.
 *
 * Renders the real templates (no mocks) so the assertions cover what actually
 * lands in a change directory.
 */
import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../src/lib/template.js';

describe('Change Artifact Format Contract', () => {
  describe('proposal.md Related Modules', () => {
    /** The section from its heading to the next `## ` heading. */
    function relatedModulesSection(proposal: string): string {
      const start = proposal.indexOf('## Related Modules');
      expect(start).toBeGreaterThan(-1);
      const rest = proposal.slice(start);
      const next = rest.indexOf('\n## ', 1);
      return next === -1 ? rest : rest.slice(0, next);
    }

    // The template supplies the emphasis, so the context must carry a bare name.
    // Passing a pre-bolded name (what the index.md Module cell looks like)
    // renders `****lib****`, which is why the name is stripped upstream.
    it('bolds each module name exactly once', () => {
      const proposal = renderTemplate('change/proposal.md.hbs', {
        change_name: 'add-widget',
        related_modules: [
          { name: 'lib', description: 'Shared utilities' },
          { name: 'services', description: 'Business logic' },
        ],
      });
      const section = relatedModulesSection(proposal);

      expect(section).toContain('- **lib**: Shared utilities');
      expect(section).toContain('- **services**: Business logic');
      expect(section).not.toContain('****');
      // Every bullet in the section is a single-bolded module entry.
      const bullets = section.split('\n').filter((l) => l.startsWith('- '));
      expect(bullets).toHaveLength(2);
      for (const bullet of bullets) {
        expect(bullet).toMatch(/^- \*\*[^*]+\*\*: /);
      }
    });

    it('renders the no-modules-matched branch instead of an empty list', () => {
      const proposal = renderTemplate('change/proposal.md.hbs', {
        change_name: 'add-widget',
        related_modules: undefined,
      });
      const section = relatedModulesSection(proposal);
      expect(section).not.toMatch(/^- /m);
      expect(section).toContain('_No related modules detected.');
    });
  });
});
