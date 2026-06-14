import { z } from 'zod';

/**
 * ChangeMetadata schema — validates metadata.yaml in change directories
 *
 * State transitions: story → plan → tasks → implemented → verified → archived
 * (canonical source: prospec/ai-knowledge/_status-lifecycle.md)
 */

export const CHANGE_STATUSES = ['story', 'plan', 'tasks', 'implemented', 'verified', 'archived'] as const;

/** Process weight per change (BL-004). Absent on existing metadata means `standard`. */
export const CHANGE_SCALES = ['quick', 'standard', 'full'] as const;

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
  // Written by new-story after user-confirmed complexity assessment (BL-004).
  // Optional keeps existing metadata valid; absent reads as `standard`.
  scale: z.enum(CHANGE_SCALES).optional(),
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

/**
 * True when `current` precedes `target` in the lifecycle order. Used to keep
 * status advances forward-only — re-running a planning command on an already
 * advanced change must not silently regress its status.
 */
export function isStatusBefore(
  current: string | undefined,
  target: ChangeStatus,
): boolean {
  const currentIndex =
    current === undefined ? -1 : CHANGE_STATUSES.indexOf(current as ChangeStatus);
  return currentIndex < CHANGE_STATUSES.indexOf(target);
}
export type ChangeScale = (typeof CHANGE_SCALES)[number];
export type QualityLogEntry = z.infer<typeof QualityLogEntrySchema>;
export type GateResult = (typeof GATE_RESULTS)[number];
