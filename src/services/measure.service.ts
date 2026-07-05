import * as fs from 'node:fs';
import * as path from 'node:path';
import { ZodError, type ZodType } from 'zod';
import { MeasurementReportInvalid, PrerequisiteError } from '../types/errors.js';
import {
  DEFAULT_REPORT_FILENAME,
  DEFAULT_SIZE_REPORT_FILENAME,
  MeasurementReportSchema,
  SizeReportSchema,
  type MeasurementReport,
  type SizeReport,
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

export interface SizeMeasureResult {
  reportPath: string;
  sizeReport: SizeReport;
}

/** Read + JSON-parse + schema-validate a report file, shared by both modes.
 *  Missing file → PrerequisiteError with a mode-specific hint; malformed JSON or
 *  schema mismatch → MeasurementReportInvalid. */
function loadReport<T>(
  cwd: string,
  relPath: string,
  schema: ZodType<T>,
  missingHint: string,
): { reportPath: string; data: T } {
  const reportPath = path.resolve(cwd, relPath);

  if (!fs.existsSync(reportPath)) {
    throw new PrerequisiteError(`Measurement report not found: ${relPath}`, missingHint);
  }

  const raw = fs.readFileSync(reportPath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new MeasurementReportInvalid(relPath, err instanceof Error ? err.message : 'invalid JSON');
  }

  try {
    return { reportPath, data: schema.parse(parsed) };
  } catch (err) {
    const details =
      err instanceof ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : String(err);
    throw new MeasurementReportInvalid(relPath, details);
  }
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
  const { reportPath, data } = loadReport(
    cwd,
    relPath,
    MeasurementReportSchema,
    'Run `pnpm measure:tokens` first to generate the report (requires a provider API key)',
  );
  return { reportPath, report: data };
}

/**
 * Execute the offline measure workflow — read-only, keyless:
 * validates a size-report.json (produced by `pnpm measure:tokens --offline`)
 * against SizeReportSchema and returns it for display. Size-only: no cache/cost.
 */
export async function executeOffline(options: MeasureOptions): Promise<SizeMeasureResult> {
  const cwd = options.cwd ?? process.cwd();
  const relPath = options.reportPath ?? DEFAULT_SIZE_REPORT_FILENAME;
  const { reportPath, data } = loadReport(
    cwd,
    relPath,
    SizeReportSchema,
    'Run `pnpm measure:tokens --offline` first to generate a keyless size estimate',
  );
  return { reportPath, sizeReport: data };
}
