import { describe, expect, it } from 'vitest';
import { assessPremise } from '../../../src/lib/premise.js';
import { premiseProposal, verifiedPremise } from '../../helpers/premise.js';

const assess = (text: string | null) => assessPremise({ premise_version: 1, scale: 'standard' }, text);
describe('assessPremise', () => {
  it('accepts a complete declaration without changing the AI source', () => {
    const result = assess(premiseProposal());
    expect(result.state).toBe('ready');
    expect(result.premise?.source).toBe('ai-proposed');
    expect(result.limitation).toContain('Structural validation only');
  });
  it.each(['quick', 'backfill'])('exempts %s with explicit disclosure', (scale) => {
    expect(assessPremise({ premise_version: 1, scale }, null).state).toBe('exempt');
  });
  it('discloses missing version as legacy', () => {
    expect(assessPremise({}, null)).toMatchObject({ state: 'legacy', findings: [expect.stringContaining('legacy')] });
  });
  it.each([null, 0, 2, '1'])('never treats unknown version %s as legacy', (premise_version) => {
    expect(assessPremise({ premise_version, scale: 'quick' }, premiseProposal()).state).toBe('blocked');
  });
  it.each([null, '', '# Missing', '````md\n' + premiseProposal() + '\n````', premiseProposal() + '\n## Premise\n', premiseProposal() + '\n```'])('refuses missing/duplicate/fenced/malformed section %#', (text) => {
    expect(assess(text).state).toBe('blocked');
  });
  it('accepts CRLF and ignores an outer fenced example', () => {
    const text = '````md\n' + premiseProposal() + '\n````\n' + premiseProposal();
    expect(assess(text.replaceAll('\n', '\r\n')).state).toBe('ready');
  });
  it('ends the section at the next level-one heading', () => {
    expect(assess(premiseProposal().replace('## Other', '# Other') + '\n```yaml\nexample: true\n```').state).toBe('ready');
  });
  it.each(['', '  ', 'TBD', '[NEEDS CLARIFICATION]', '<problem>', 'TODO', '...'])('rejects placeholder %s', (problem) => {
    expect(assess(premiseProposal({ ...verifiedPremise, problem })).state).toBe('blocked');
  });
  it('rejects pending regardless of the named source', () => {
    for (const source of ['user-observation', 'third-party-report', 'ai-proposed']) {
      expect(assess(premiseProposal({ ...verifiedPremise, source, verification: { ...verifiedPremise.verification, status: 'pending' } })).state).toBe('blocked');
    }
  });
  it.each([
    premiseProposal().replace('problem:', 'problem: duplicate\nproblem:'),
    premiseProposal().replace('source_ref:', 'extra: value\nsource_ref:'),
    premiseProposal().replace(/source_ref:.*\n/, 'source_ref: *ref\n'),
    premiseProposal().replace('## Other', '```yaml\na: b\n```\n## Other'),
  ])('refuses malformed mapping %#', (text) => { expect(text).not.toBe(premiseProposal()); expect(assess(text).state).toBe('blocked'); });
  it('rejects YAML aliases even when their expansion would be valid', () => {
    expect(assess(premiseProposal().replace('source: ai-proposed', 'source: &s ai-proposed').replace(/source_ref:.*\n/, 'source_ref: *s\n')).state).toBe('blocked');
  });
  it('requires all reproduction details', () => {
    const evidence = { kind: 'reproduction', ref: 'test', result: 'Confirmed', steps: 'Run CLI', expected: 'Source preserved', actual: 'Source replaced' };
    expect(assess(premiseProposal({ ...verifiedPremise, evidence })).state).toBe('ready');
    expect(assess(premiseProposal({ ...verifiedPremise, evidence: { ...evidence, steps: '' } })).state).toBe('blocked');
  });
});
