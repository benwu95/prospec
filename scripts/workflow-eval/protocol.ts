import { z } from 'zod';
import { SDD_STATIONS } from '../../src/types/status.js';
import { CHANGE_STATUSES } from '../../src/types/change.js';
import {
  JudgmentDimensionsInputSchema, ReviewFindingsInputSchema,
  VERIFIER_REPORT_SCHEMAS,
} from '../../src/types/station.js';

export const SCENARIO_IDS = [
  'quick', 'standard-ui', 'proven-backfill', 'equivalent-commit',
  'reverify-c', 'missing-receipt', 'stale-delta', 'multi-change',
] as const;
const text = z.string().min(1);
const count = z.number().int().nonnegative();
const positive = z.number().int().positive();
const version = z.literal(1);
const station = z.enum(SDD_STATIONS);
const id = z.enum(SCENARIO_IDS);
const delegationState = z.enum(['pending', 'timeout']);
// Fixture *names* are portable relative paths; actual filesystem containment is
// independently enforced at the action gateway, including symlinks.
export const FixturePathSchema = text.refine((p) =>
  !/[\\:]/.test(p) && ![...p].some((c) => c.charCodeAt(0) < 32) && !p.startsWith('/') &&
  p.split('/').every((part) => part !== '' && part !== '.' && part !== '..' && part !== '.git'),
{ message: 'Expected a portable relative fixture path outside .git' });
export const PayloadKindSchema = z.enum(['prospec-plan', 'prospec-tasks', 'review', 'verify']);
export type PayloadKind = z.infer<typeof PayloadKindSchema>;

export function validatePayload(kind: PayloadKind, payload: unknown) {
  const schema = kind === 'review' ? ReviewFindingsInputSchema
    : kind === 'verify' ? JudgmentDimensionsInputSchema : VERIFIER_REPORT_SCHEMAS[kind];
  return schema.safeParse(payload);
}

export const ScenarioSchema = z.strictObject({
  version, id, task: text, files: z.record(FixturePathSchema, z.string()),
  setup: id, entry_skill: text,
  delegation: z.strictObject({ id: text, polls: z.array(delegationState).min(1) }).optional(),
});
export const OracleSchema = z.strictObject({
  version, id, routes: z.array(station).min(1),
  required_reads: z.array(FixturePathSchema), forbidden_reads: z.array(FixturePathSchema),
  required_files: z.array(FixturePathSchema), forbidden_files: z.array(FixturePathSchema),
  forbidden_commands: z.array(text),
  allow_writes: z.boolean().default(true), allow_delegation: z.boolean().default(true),
  required_commands: z.array(z.array(text).min(1)).default([]),
  payloads: z.array(PayloadKindSchema), suite_runs: count,
  required_receipts: z.array(PayloadKindSchema).default([]),
  required_states: z.record(FixturePathSchema, z.enum(CHANGE_STATUSES)).default({}),
  required_log_skills: z.record(FixturePathSchema, z.array(text).min(1)).default({}),
  required_signals: z.array(delegationState).default([]),
  terminal: z.enum(['handoff', 'stop', 'signoff']),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioOracle = z.infer<typeof OracleSchema>;

export const ExecutorConfigSchema = z.strictObject({
  id: text, tier: z.enum(['stronger', 'cheaper']), command: text,
  args: z.array(z.string()), model: text, env_keys: z.array(text),
  settings: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean()])),
  input_usd_per_mtok: z.number().finite().nonnegative().optional(),
  output_usd_per_mtok: z.number().finite().nonnegative().optional(),
  // The configured trusted adapter must enforce this conservative bound over
  // its entire request, including its own added framing. chars/4 is never a cap.
  token_bound: z.enum(['utf8-bytes', 'unavailable']), mediated_tools: z.literal(true),
});
export const EvaluationConfigSchema = z.strictObject({
  version, execution_mode: z.enum(['api', 'subscription']).optional(),
  budget_usd: z.number().finite().positive().optional(), max_requests: positive.optional(), max_turns: positive,
  max_actions: positive.default(200),
  timeout_ms: positive, max_output_bytes: positive,
  max_input_tokens: positive, max_output_tokens: positive,
  executors: z.array(ExecutorConfigSchema).min(1),
}).refine((c) => new Set(c.executors.map((e) => e.id)).size === c.executors.length,
{ message: 'Executor IDs must be unique' }).superRefine((c, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (c.execution_mode !== 'subscription') {
    if (c.budget_usd === undefined || c.max_requests !== undefined || c.executors.some((e) =>
      e.input_usd_per_mtok === undefined || e.output_usd_per_mtok === undefined || e.token_bound !== 'utf8-bytes')) {
      issue('API mode requires USD budget, pricing and enforceable token bounds');
    }
  } else if (c.max_requests === undefined || c.budget_usd !== undefined || c.executors.length !== 2 ||
    new Set(c.executors.map((e) => e.tier)).size !== 2 || c.executors.some((e) =>
      e.input_usd_per_mtok !== undefined || e.output_usd_per_mtok !== undefined || e.token_bound !== 'unavailable')) {
    issue('Subscription mode requires two tiers and a request quota, without pricing or token guarantees');
  }
});
export type ExecutorConfig = z.infer<typeof ExecutorConfigSchema>;
export type EvaluationConfig = z.infer<typeof EvaluationConfigSchema>;

export const ActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('wait'), delegation_id: text }),
  z.strictObject({ kind: z.literal('delegate'), schema: PayloadKindSchema, path: text,
    prompt: text, reads: z.array(text).min(1) }),
  z.strictObject({ kind: z.literal('read'), path: text }),
  z.strictObject({ kind: z.literal('write'), path: text, content: z.string() }),
  z.strictObject({ kind: z.literal('cli'), args: z.array(z.string()).min(1) }),
  z.strictObject({ kind: z.literal('route'), station }),
  z.strictObject({ kind: z.literal('submit'), schema: PayloadKindSchema, path: text }),
  z.strictObject({ kind: z.literal('finish'), terminal: z.enum(['handoff', 'stop', 'signoff']),
    message: text, claims_pass: z.boolean() }),
]);
export type Action = z.infer<typeof ActionSchema>;
export const UsageSchema = z.strictObject({ input: count, output: count });
const event = { seq: positive };
export const EventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...event, kind: z.literal('delegation'), delegation_id: text, state: delegationState }),
  z.strictObject({ ...event, kind: z.literal('attempt'), action: z.unknown() }),
  z.strictObject({ ...event, kind: z.literal('route'), station }),
  z.strictObject({ ...event, kind: z.literal('read'), path: text, digest: text,
    content: z.string(), category: z.enum(['skill', 'reference', 'other']), station }),
  z.strictObject({ ...event, kind: z.literal('delegation-read'), path: text, digest: text,
    content: z.string(), category: z.enum(['skill', 'reference', 'other']), station }),
  z.strictObject({ ...event, kind: z.literal('write'), path: text, digest: text }),
  z.strictObject({ ...event, kind: z.literal('command'), args: z.array(z.string()),
    exit_code: z.number().int().nullable(), output: z.string() }),
  z.strictObject({ ...event, kind: z.literal('payload'), schema: PayloadKindSchema,
    path: text, valid: z.boolean(), errors: z.array(z.string()), source: z.enum(['submission', 'fresh-executor']).default('submission') }),
  z.strictObject({ ...event, kind: z.literal('suite'), exit_code: z.number().int().nullable() }),
  z.strictObject({ ...event, kind: z.literal('denied'), reason: text }),
  z.strictObject({ ...event, kind: z.literal('error'), reason: text }),
  z.strictObject({ ...event, kind: z.literal('usage'), input: count, output: count }),
  z.strictObject({ ...event, kind: z.literal('usage-unavailable'), reason: text }),
  z.strictObject({ ...event, kind: z.literal('finish'), terminal: z.enum(['handoff', 'stop', 'signoff']),
    claims_pass: z.boolean(), message: text }),
]);
export type TraceEvent = z.infer<typeof EventSchema>;
export type EventInput = TraceEvent extends infer E ? E extends TraceEvent ? Omit<E, 'seq'> : never : never;

export const IdentitySchema = z.strictObject({
  scenario: id, executor: text, tier: z.enum(['stronger', 'cheaper']), model: text,
  variant: z.enum(['baseline', 'candidate']), instruction_digest: text,
  runtime_revision: text, runner_digest: text, corpus_digest: text,
  oracle_digest: text, settings_digest: text,
});
export const ObservedRunSchema = z.strictObject({
  version, identity: IdentitySchema, source: z.enum(['live', 'synthetic']),
  events: z.array(EventSchema), files: z.record(FixturePathSchema, z.string()),
  duration_ms: z.number().finite().nonnegative(),
  stop_reason: z.enum(['finished', 'timeout', 'budget', 'unavailable', 'error', 'limit', 'forbidden']),
});
export type ObservedRun = z.infer<typeof ObservedRunSchema>;
export const VerdictSchema = z.strictObject({
  complete: z.boolean(), failures: z.array(text),
  route_correct: count, route_expected: count,
  payload_first_pass: count, payload_expected: count,
  forbidden_actions: count, false_pass: count,
  suite_runs: count, unnecessary_test_runs: count,
});
export type RunVerdict = z.infer<typeof VerdictSchema>;
