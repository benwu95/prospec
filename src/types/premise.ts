import { z } from 'zod';

export const PREMISE_SOURCES = ['user-observation', 'third-party-report', 'ai-proposed'] as const;
export const PREMISE_LIMITATION = 'Structural validation only: source identity and evidence truth are not independently verified; reproduction steps are not executed.';
export const PREMISE_REMEDY = 'Use prospec-explore to investigate, then prospec-new-story to update this proposal and run `prospec validate proposal <change>`.';

const observation = z.object({
  kind: z.literal('observation'), ref: z.string(), result: z.string(),
}).strict();
const reproduction = z.object({
  kind: z.literal('reproduction'), ref: z.string(), result: z.string(),
  steps: z.string(), expected: z.string(), actual: z.string(),
}).strict();

/** Shape validation permits pending/empty scaffolds; assessment decides readiness. */
export const PremiseSchema = z.object({
  problem: z.string(),
  source: z.enum(PREMISE_SOURCES),
  source_ref: z.string(),
  evidence: z.discriminatedUnion('kind', [observation, reproduction]),
  withdrawal: z.string(),
  verification: z.object({
    status: z.enum(['pending', 'verified']), by: z.string(), conclusion: z.string(),
  }).strict(),
}).strict();
export type Premise = z.infer<typeof PremiseSchema>;
export interface PremiseAssessment {
  state: 'ready' | 'blocked' | 'legacy' | 'exempt';
  findings: string[];
  remedy: string;
  limitation: string;
  premise?: Premise;
}
