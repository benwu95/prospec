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
import { describe, it, expect } from 'vitest';
import {
  STARTUP_PATHS,
  measureStartupModules,
  checkStartupContract,
} from '../../scripts/measure-startup-modules.js';

describe('startup module graph (REQ-CLI-045)', () => {
  it('satisfies the whole startup contract with no violations', () => {
    const { violations } = checkStartupContract();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it.each(STARTUP_PATHS.map((p) => [p.label, p] as const))(
    '%s excludes its forbidden heavy deps',
    (_label, p) => {
      const { heavy } = measureStartupModules(p.args);
      for (const dep of p.forbidden) {
        expect(heavy).not.toContain(dep);
      }
    },
  );

  it.each(STARTUP_PATHS.filter((p) => p.maxNodeModules !== undefined).map((p) => [p.label, p] as const))(
    '%s stays under its node_modules ceiling',
    (_label, p) => {
      const { nodeModules } = measureStartupModules(p.args);
      expect(nodeModules).toBeLessThanOrEqual(p.maxNodeModules!);
    },
  );
});
