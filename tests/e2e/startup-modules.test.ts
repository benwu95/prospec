/**
 * Startup module-graph guard (REQ-CLI-045).
 *
 * Spawns the compiled `dist/cli/index.js` per command with a
 * `module.registerHooks` load counter and asserts command-scoped loading:
 * the four command-irrelevant heavy deps never appear on the read paths, and
 * `--version`/`status` stay under the node_modules ceiling.
 *
 * Requires a prior `pnpm build` (like the sibling cli e2e suite, which spawns
 * the same compiled entry).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  STARTUP_PATHS,
  measureStartupModules,
  checkStartupContract,
} from '../../scripts/measure-startup-modules.js';

// This file spawns the compiled CLI once per measured path; under the parallel
// suite that contends with the other spawn-bound files, so a single test can
// exceed vitest's 5s default (PB-010). Give it the same generous file-level
// timeout the sibling spawn-bound e2e files use.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

describe('startup module graph (REQ-CLI-045)', () => {
  it('covers ordinary, current-report, stale-report and in-flight status independently', () => {
    expect(STARTUP_PATHS.filter((p) => p.args[0] === 'status').map((p) => p.scenario)).toEqual([
      'no-report', 'current-report', 'stale-report', 'in-flight',
    ]);
  });

  it.each(['no-report', 'current-report', 'stale-report', 'in-flight'] as const)(
    'executes the real %s status branch', (scenario) => {
      const result = measureStartupModules(['status', '--json'], undefined, scenario);
      expect(result.exitCode).toBe(0);
      const status = JSON.parse(result.stdout);
      expect(status.clean).toBe(scenario !== 'in-flight');
      if (scenario === 'stale-report') {
        expect(status.drift).toMatchObject({ state: 'unusable', reason: 'stale' });
      } else {
        expect(status.drift).toBeUndefined();
      }
      if (scenario === 'current-report' || scenario === 'stale-report') {
        expect(result.heavy).toContain('handlebars');
      } else {
        expect(result.heavy).not.toContain('handlebars');
      }
    },
  );

  it('satisfies the whole startup contract with no violations', () => {
    const { violations } = checkStartupContract();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it.each(STARTUP_PATHS.map((p) => [p.label, p] as const))(
    '%s excludes its forbidden heavy deps',
    (_label, p) => {
      const { heavy } = measureStartupModules(p.args, undefined, p.scenario);
      for (const dep of p.forbidden) {
        expect(heavy).not.toContain(dep);
      }
    },
  );

  it.each(STARTUP_PATHS.filter((p) => p.maxNodeModules !== undefined).map((p) => [p.label, p] as const))(
    '%s stays under its node_modules ceiling',
    (_label, p) => {
      const { nodeModules } = measureStartupModules(p.args, undefined, p.scenario);
      expect(nodeModules).toBeLessThanOrEqual(p.maxNodeModules!);
    },
  );
});
