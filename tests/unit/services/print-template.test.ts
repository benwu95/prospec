import { describe, it, expect } from 'vitest';
import { execute } from '../../../src/services/print-template.service.js';
import { TemplateError } from '../../../src/types/errors.js';

describe('print-template service', () => {
  it('returns template content for a valid bundled template', async () => {
    const result = await execute({ templatePath: 'skills/prospec-upgrade.hbs' });
    expect(result.content).toContain('Prospec Upgrade Skill');
  });

  it('throws TemplateError for an invalid template path', async () => {
    await expect(
      execute({ templatePath: 'non-existent-template.hbs' })
    ).rejects.toThrow(TemplateError);
  });
});
