import path from 'node:path';
import { unlinkSync } from 'node:fs';
import { JsonReporter } from 'vitest/reporters';
import type { TestModule, TestRunEndReason, Vitest } from 'vitest/node';
import { STAMP_FIELD, stampFor, workTreeDigest, type DigestResult, type WorkTreeStamp } from './report-source.js';

/**
 * `pnpm test`'s JSON reporter (REQ-TESTS-150): vitest's own JSON report plus one
 * work-tree stamp, so `pnpm counts` can tell whether the report still stands
 * for the files on disk. It re-serialises vitest's report object with that one
 * field added; the file write stays vitest's.
 */

type ReporterOptions = ConstructorParameters<typeof JsonReporter>[0];

/**
 * The JSON output path, resolved as vitest resolves it: the reporter option,
 * else the config's `outputFile` string or its `json` key, against the root.
 * vitest does not export its own resolver, so this restates that rule.
 */
export function reportPath(options: ReporterOptions, config: Vitest['config']): string | undefined {
  const configured = config.outputFile;
  const file = options.outputFile ?? (typeof configured === 'string' ? configured : configured?.json);
  return file === undefined ? undefined : path.resolve(config.root, file);
}

/** Remove the previous report; returns why it could not be removed (a missing one counts as removed). */
export function removeEarlierReport(file: string): string | undefined {
  try {
    unlinkSync(file);
    return undefined;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return `could not remove the earlier report: ${(err as Error).message}`;
  }
}

export default class StampedJsonReporter extends JsonReporter {
  private before: DigestResult = { reason: 'the run never started' };
  private removal: string | undefined;
  private stamp: WorkTreeStamp = { unusable: 'the run never ended' };

  override onInit(ctx: Vitest): void {
    super.onInit(ctx);
    // A run that is killed before it writes its report must not leave the previous one behind.
    const file = reportPath(this.options, ctx.config);
    this.removal = file === undefined ? undefined : removeEarlierReport(file);
    this.before = workTreeDigest(ctx.config.root);
  }

  override async onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    _errors?: ReadonlyArray<unknown>,
    reason?: TestRunEndReason,
  ): Promise<void> {
    this.stamp = this.removal !== undefined
      ? { unusable: this.removal }
      : stampFor({ before: this.before, after: workTreeDigest(this.ctx.config.root), reason });
    await super.onTestRunEnd(testModules);
  }

  override async writeReport(report: string): Promise<void> {
    await super.writeReport(JSON.stringify({ ...(JSON.parse(report) as object), [STAMP_FIELD]: this.stamp }));
  }
}
