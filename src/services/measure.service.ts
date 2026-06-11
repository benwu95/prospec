import * as fs from 'node:fs';
import * as path from 'node:path';
import { ZodError } from 'zod';
import { MeasurementReportInvalid, PrerequisiteError } from '../types/errors.js';
import {
  DEFAULT_REPORT_FILENAME,
  MeasurementReportSchema,
  type MeasurementReport,
} from '../types/measurement.js';

export interface MeasureOptions {
  cwd?: string;
  /** Report file path, relative to cwd (default: measurement-report.json). */
  reportPath?: string;
}

export interface MeasureResult {
  reportPath: string;
  report: MeasurementReport;
}

/**
 * Execute the measure workflow — read-only:
 *
 * 1. Locate measurement-report.json (produced by `pnpm measure:tokens`)
 * 2. Validate it against MeasurementReportSchema
 * 3. Return the parsed report for display
 *
 * Never calls any provider API and never burns tokens.
 */
export async function execute(options: MeasureOptions): Promise<MeasureResult> {
  const cwd = options.cwd ?? process.cwd();
  const relPath = options.reportPath ?? DEFAULT_REPORT_FILENAME;
  const reportPath = path.resolve(cwd, relPath);

  if (!fs.existsSync(reportPath)) {
    throw new PrerequisiteError(
      `Measurement report not found: ${relPath}`,
      'Run `pnpm measure:tokens` first to generate the report (requires a provider API key)',
    );
  }

  const raw = fs.readFileSync(reportPath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new MeasurementReportInvalid(
      relPath,
      err instanceof Error ? err.message : 'invalid JSON',
    );
  }

  try {
    const report = MeasurementReportSchema.parse(parsed);
    return { reportPath, report };
  } catch (err) {
    const details =
      err instanceof ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : String(err);
    throw new MeasurementReportInvalid(relPath, details);
  }
}
