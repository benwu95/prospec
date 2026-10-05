import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../../src/lib/template.js';
import { assessPremise } from '../../src/lib/premise.js';
import { withoutFencedBlocks } from '../../src/lib/markdown-fences.js';

const context = { change_name: 'example', base_dir: 'prospec', knowledge_base_path: 'prospec/ai-knowledge', constitution_path: 'prospec/CONSTITUTION.md', target: 'module', check_id: 'check', language_is_english: true };
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start + heading.length);
  const end = rest.search(/^#{1,3} /m);
  const body = end < 0 ? rest : rest.slice(0, end);
  expect(body.trim()).not.toBe('');
  return body;
}
describe('sourced premise authoring contracts', () => {
  it.each(['change/proposal.md.hbs', 'change/auto-draft-proposal.md.hbs'])('%s emits one real pending declaration', (file) => {
    const text = renderTemplate(file, context);
    const headers = withoutFencedBlocks(text.split('\n')).filter((line) => line === '## Premise');
    expect(headers).toEqual(['## Premise']);
    const result = assessPremise({ premise_version: 1 }, text);
    expect(result).toMatchObject({ state: 'blocked', premise: { source: 'ai-proposed', verification: { status: 'pending' } } });
    expect(result.premise && Object.keys(result.premise).sort()).toEqual(['evidence', 'problem', 'source', 'source_ref', 'verification', 'withdrawal']);
    expect(result.premise?.withdrawal).toBe('');
    expect(result.premise?.verification.by).toBe('');
  });
  it('new-story distinguishes authoring from verified premise and supports re-entry', () => {
    const text = renderTemplate('skills/prospec-new-story.hbs', context);
    const gather = section(text, '### Phase 1:');
    expect(gather).toContain('source');
    expect(gather).not.toContain('Infer Background (why)');
    for (const heading of ['### Phase 2:', '### Phase 3.5:']) {
      const interactive = section(text, heading).split('\n').find((line) => line.includes('**Interactive mode'));
      expect(interactive).toBeDefined();
      expect(interactive).toMatch(/Reuse supplied decisions; only for missing input:.*STOP\. Ask/);
    }
    const scaffold = section(text, '### Phase 3:');
    expect(scaffold).toContain('same proposal');
    expect(scaffold).toContain('preserve');
    const write = section(text, '### Phase 5:');
    expect(write.indexOf('prospec validate proposal')).toBeGreaterThan(write.indexOf('proposal-format'));
    expect(write).toContain('prospec-explore');
    expect(write).toContain('--amend-scenarios');
  });
  it('ff aligns Draft-First activation and story gate', () => {
    const text = renderTemplate('skills/prospec-ff.hbs', context);
    expect(section(text, '### Phase 1:')).toContain('Draft-First');
    const story = section(text, '### Phase 2:');
    expect(story).toContain('prospec validate proposal');
    expect(story).toContain('prospec-explore');
    expect(story).not.toContain('STOP. Ask the user to confirm the scale');
  });
  it('explore hands a bounded premise-check back to new-story without writing artifacts', () => {
    const text = renderTemplate('skills/prospec-explore.hbs', context);
    const handoff = section(text, '## Premise Check Handoff');
    expect(handoff).toContain('prospec-new-story');
    expect(handoff).toContain('same proposal');
    expect(handoff).toContain('Do not write');
    for (const field of ['problem', 'source', 'evidence', 'withdrawal', 'verification']) expect(handoff).toContain(field);
  });
});
