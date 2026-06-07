import { z } from 'zod';

/**
 * ChangeMetadata schema — validates metadata.yaml in change directories
 *
 * State transitions: story → plan → tasks → implemented → verified → archived
 * (canonical source: prospec/ai-knowledge/_status-lifecycle.md)
 */

export const CHANGE_STATUSES = ['story', 'plan', 'tasks', 'implemented', 'verified', 'archived'] as const;

/** Severity vocabulary shared with Entry/Exit gates and verify (no fourth state). */
export const GATE_RESULTS = ['PASS', 'WARN', 'FAIL'] as const;

/** One Entry/Exit gate record, appended per skill stage for cross-stage traceability. */
export const QualityLogEntrySchema = z.object({
  skill: z.string(),
  date: z.string(), // ISO 8601 date
  result: z.enum(GATE_RESULTS),
  warnings: z.array(z.string()).default([]),
});

export const ChangeMetadataSchema = z.object({
  name: z.string(),
  created_at: z.string(), // ISO 8601
  status: z.enum(CHANGE_STATUSES),
  related_modules: z.array(z.string()).optional(),
  description: z.string().optional(),
  // Entry/Exit gate trail (BL-003). Typed contract for the gate-record shape;
  // optional keeps existing metadata valid. NOTE: metadata.yaml is read via
  // parseYaml(doc.toJS()) (lossless), not validated by this schema at read time —
  // so this field is a type contract + test fixture, not strip protection.
  quality_log: z.array(QualityLogEntrySchema).optional(),
});

export type ChangeMetadata = z.infer<typeof ChangeMetadataSchema>;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];
export type QualityLogEntry = z.infer<typeof QualityLogEntrySchema>;
export type GateResult = (typeof GATE_RESULTS)[number];
