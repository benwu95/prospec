import { stringifyYaml } from '../../src/lib/yaml-utils.js';

export const verifiedPremise = {
  problem: 'Source attribution is lost during story authoring.',
  source: 'ai-proposed',
  source_ref: 'Investigation: authoring code path',
  evidence: { kind: 'observation', ref: 'Captured authoring output', result: 'Inferred value was presented as confirmed.' },
  withdrawal: 'Withdraw if the existing workflow already preserves source attribution.',
  verification: { status: 'verified', by: 'maintainer', conclusion: 'Confirmed by inspecting the generated output.' },
};
export function premiseProposal(value: unknown = verifiedPremise): string {
  return `# Proposal\n\n## Premise\n\n\`\`\`yaml\n${stringifyYaml(value)}\`\`\`\n\n## Other\nPreserved content.\n`;
}

/** Author evidence explicitly in fixtures whose subject is a later station. */
export function withVerifiedPremise(proposal: string, source: string = verifiedPremise.source): string {
  const section = premiseProposal({ ...verifiedPremise, source }).split('## Other')[0]!.split('## Premise')[1]!;
  const declaration = `## Premise${section}`;
  return proposal.includes('## Premise')
    ? proposal.replace(/## Premise[\s\S]*?(?=\n## |$)/, declaration)
    : `${proposal}\n${declaration}`;
}
