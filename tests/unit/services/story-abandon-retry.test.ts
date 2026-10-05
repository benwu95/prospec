import { beforeEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute } from '../../../src/services/change-story.service.js';
import { readChangeMetadata } from '../../../src/lib/change-metadata.js';
import { readPremiseAssessment } from '../../../src/lib/premise.js';
import { abandonedFixture } from '../../helpers/abandon.js';
vi.mock('node:fs', async () => { const { fs } = await import('memfs'); return { ...fs, default: fs }; });
vi.mock('../../../src/lib/template.js', () => ({ renderTemplate: () => '# Scaffold\n' }));
beforeEach(() => { vol.reset(); vol.fromJSON({ '/p/.prospec.yaml': 'project:\n  name: test\n' }); });
it('links completed normalized same-issue attempts and returns reasons without rewriting a supplied proposal', async () => {
  const { archive } = abandonedFixture('/p'); const body = '# Authored\n';
  const result = await execute({ name: 'retry', issue: ' #333\n', proposalBody: body, scale: 'quick', cwd: '/p' });
  expect(result.priorAttempts).toMatchObject([{ archive, reason: 'Premise disproved' }]);
  const { metadata } = readChangeMetadata('/p/.prospec/changes/retry/metadata.yaml', 'retry');
  expect(metadata.retry_of).toEqual([{ archive, digest: expect.stringMatching(/^[a-f0-9]{64}$/) }]);
  expect(fs.readFileSync('/p/.prospec/changes/retry/proposal.md', 'utf8')).toBe(body);
  expect(readPremiseAssessment('/p/.prospec/changes/retry', '/p').assessment.state).toBe('blocked');
});
it.each([undefined, ' ', '#334', 'https://github.com/o/r/issues/333'])('writes explicit empty links for nonmatching registration %s', async (issue) => {
  abandonedFixture('/p'); await execute({ name: 'fresh', issue, cwd: '/p' });
  expect(readChangeMetadata('/p/.prospec/changes/fresh/metadata.yaml', 'fresh').metadata.retry_of).toEqual([]);
});
it('dry run returns history and creates no change', async () => {
  abandonedFixture('/p'); const before = vol.toJSON();
  const result = await execute({ name: 'preview', issue: '#333', dryRun: true, cwd: '/p' });
  expect(result.priorAttempts).toHaveLength(1); expect(vol.toJSON()).toEqual(before);
});
it('refuses unreadable history before creating any artifacts', async () => {
  const { dir } = abandonedFixture('/p'); fs.unlinkSync(`${dir}/preservation/manifest.json`);
  await expect(execute({ name: 'retry', issue: '#333', cwd: '/p' })).rejects.toThrow(/history|manifest/i);
  expect(fs.existsSync('/p/.prospec/changes/retry')).toBe(false);
});
