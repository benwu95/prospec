import { describe, it, expect } from 'vitest';
import { TaskMeasurementSchema } from '../../../src/types/measurement.js';

describe('TaskMeasurementSchema reason invariant', () => {
  it('accepts an ok task without a reason', () => {
    const r = TaskMeasurementSchema.safeParse({ task_id: 't1', status: 'ok' });
    expect(r.success).toBe(true);
  });

  it('rejects a failed/skipped task with no reason', () => {
    expect(TaskMeasurementSchema.safeParse({ task_id: 't1', status: 'failed' }).success).toBe(false);
    expect(TaskMeasurementSchema.safeParse({ task_id: 't1', status: 'skipped' }).success).toBe(false);
    expect(TaskMeasurementSchema.safeParse({ task_id: 't1', status: 'failed', reason: '' }).success).toBe(false);
  });

  it('accepts a failed task that carries a reason', () => {
    const r = TaskMeasurementSchema.safeParse({ task_id: 't1', status: 'failed', reason: 'timeout' });
    expect(r.success).toBe(true);
  });
});
