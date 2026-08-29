/**
 * Enable the Node module compile cache as early as possible so the CLI's own
 * modules are compiled from cached V8 bytecode on subsequent runs.
 *
 * ESM `import` statements are hoisted and run before any other top-level code,
 * so this cannot live inside `index.ts` ahead of its other imports — it must be
 * its own module, imported FIRST in `index.ts` (before `./setup-color.js`). It
 * touches no picocolors, so it preserves the setup-color-before-picocolors
 * ordering that non-TTY color disabling depends on.
 *
 * Best-effort: `enableCompileCache` exists on Node >= 22.8 and is absent under
 * other runtimes (e.g. the Bun-compiled binary), so the call is guarded.
 */
import { enableCompileCache } from 'node:module';

try {
  enableCompileCache?.();
} catch {
  // A read-only cache dir or an unsupporting runtime must never break startup.
}
