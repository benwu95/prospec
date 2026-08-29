#!/usr/bin/env node

// Enable the V8 compile cache before anything else loads (its own module so it
// runs ahead of the hoisted imports below). It touches no picocolors, so the
// setup-color-before-picocolors ordering still holds.
import './enable-compile-cache.js';
// Must precede any picocolors import — disables color for non-TTY stdout.
// `./program.js` is the first picocolors consumer, so it is imported after this.
import './setup-color.js';
import { runProgram } from './program.js';

/**
 * Global options resolved from root flags. Defined here (the entry module) and
 * consumed across the command layer via `import type { GlobalOptions }`; the
 * type-only import is erased, so it never pulls the entry's run into a consumer.
 */
export type GlobalOptions = {
  verbose?: boolean;
  quiet?: boolean;
};

void runProgram(process.argv);
