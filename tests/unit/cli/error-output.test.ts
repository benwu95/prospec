import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatProspecError,
  formatGenericError,
  handleError,
} from '../../../src/cli/formatters/error-output.js';
import { ProspecError, ConfigNotFound } from '../../../src/types/errors.js';

// BEL (0x07) is a C0 control char picocolors never emits (it only uses ESC for
// color), so asserting "no BEL in output" proves injected control bytes were
// stripped without being confused by terminal-color escape sequences.
const BEL = String.fromCharCode(0x07);

function captureStderr(fn: () => void): string {
  const writes: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  });
  fn();
  return writes.join('');
}

beforeEach(() => {
  process.exitCode = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe('formatProspecError', () => {
  it('writes the error message and suggestion to stderr', () => {
    const err = new ConfigNotFound('/repo/.prospec.yaml');
    const out = captureStderr(() => formatProspecError(err));

    expect(out).toContain('Config file not found: /repo/.prospec.yaml');
    expect(out).toContain('prospec init');
  });

  it('sets process.exitCode to 1', () => {
    const err = new ConfigNotFound();
    captureStderr(() => formatProspecError(err));

    expect(process.exitCode).toBe(1);
  });

  it('emits the suggestion line with the → marker and an intact backtick command token', () => {
    // NO_COLOR is forced on in vitest.config, so pc.cyan is identity and the
    // highlightCommands ANSI wrap is unobservable. What IS observable on this
    // path is the suggestion line's shape: the two-space indent + dim "→" marker
    // produced by formatProspecError (source line 25) and the backtick command
    // token reconstructed intact by highlightCommands' regex replace
    // (/`([^`]+)`/g -> `${cmd}`). Pinning the whole line fails if the marker,
    // indent, or backtick round-trip regresses (e.g. a replace callback that
    // drops a backtick or mangles the captured command).
    const err = new ConfigNotFound();
    const out = captureStderr(() => formatProspecError(err));

    expect(out).toContain('  → Run `prospec init` first to initialize the project');
  });

  it('leaves suggestions without backticks untouched (no command highlight)', () => {
    // ProspecError base with a plain suggestion exercises highlightCommands'
    // no-match path: the text passes through with no added backticks.
    const err = new ProspecError('boom', 'BOOM', 'just retry the operation');
    const out = captureStderr(() => formatProspecError(err));

    expect(out).toContain('just retry the operation');
    expect(out).not.toContain('`');
  });

  it('strips control characters from message and suggestion', () => {
    const err = new ProspecError(`bad${BEL} msg`, 'X', `do ${BEL}this`);
    const out = captureStderr(() => formatProspecError(err));

    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('bad msg');
    expect(out).toContain('do this');
  });
});

describe('formatGenericError', () => {
  it('writes a generic banner and the Error name + message for Error instances', () => {
    const err = new Error('something broke');
    const out = captureStderr(() => formatGenericError(err));

    expect(out).toContain('An unexpected error occurred');
    expect(out).toContain('Error');
    expect(out).toContain('something broke');
  });

  it('sets process.exitCode to 1', () => {
    captureStderr(() => formatGenericError(new Error('x')));

    expect(process.exitCode).toBe(1);
  });

  it('omits the stack trace when verbose is false (default arg)', () => {
    const err = new Error('no stack shown');
    err.stack = 'Error: no stack shown\n    at someFrame (file.js:1:1)';
    const out = captureStderr(() => formatGenericError(err));

    expect(out).toContain('no stack shown');
    expect(out).not.toContain('someFrame');
  });

  it('appends the stack trace (skipping the first line) when verbose is true', () => {
    const err = new Error('with stack');
    // Use a stack header token ("BoomHeader: stk") distinct from both the
    // message ("with stack") and the frames, so the negative assertion isolates
    // the header-drop: stackLines = stack.split('\n').slice(1)... (source L45-47)
    // removes the header line. Without the slice the header would survive.
    err.stack =
      'BoomHeader: stk\n    at frameOne (a.js:1:1)\n    at frameTwo (b.js:2:2)';
    const out = captureStderr(() => formatGenericError(err, true));

    // Frames remain ...
    expect(out).toContain('frameOne (a.js:1:1)');
    expect(out).toContain('frameTwo (b.js:2:2)');
    // ... but the sliced-off header line is gone. Fails if slice(1) regresses
    // to slice(0) / no-slice and the header leaks into the appended block.
    expect(out).not.toContain('BoomHeader: stk');
  });

  it('does not append a stack section when verbose is true but stack is absent', () => {
    const err = new Error('stackless');
    err.stack = undefined;
    const out = captureStderr(() => formatGenericError(err, true));

    expect(out).toContain('stackless');
    // No trailing "    at ..." frames since there was no stack to print.
    expect(out).not.toContain('    at ');
  });

  it('stringifies non-Error values into the output', () => {
    const out = captureStderr(() => formatGenericError('a raw string failure'));

    expect(out).toContain('An unexpected error occurred');
    expect(out).toContain('a raw string failure');
  });

  it('does not print a stack for non-Error values even when verbose is true', () => {
    const out = captureStderr(() => formatGenericError({ weird: 1 }, true));

    // Object goes through String() in the else branch — no stack frames emitted.
    expect(out).toContain('[object Object]');
    expect(out).not.toContain('    at ');
  });
});

describe('handleError', () => {
  it('dispatches ProspecError instances to the Prospec formatter', () => {
    const err = new ConfigNotFound('/x/.prospec.yaml');
    const out = captureStderr(() => handleError(err));

    // Prospec path emits the suggestion line (the → marker text); generic path never would.
    expect(out).toContain('Config file not found: /x/.prospec.yaml');
    expect(out).toContain('prospec init');
    expect(out).not.toContain('An unexpected error occurred');
  });

  it('dispatches non-Prospec errors to the generic formatter', () => {
    const err = new Error('plain error');
    const out = captureStderr(() => handleError(err));

    expect(out).toContain('An unexpected error occurred');
    expect(out).toContain('plain error');
  });

  it('forwards the verbose flag to the generic formatter', () => {
    const err = new Error('verbose dispatch');
    err.stack =
      'Error: verbose dispatch\n    at dispatchedFrame (d.js:3:3)';
    const out = captureStderr(() => handleError(err, true));

    expect(out).toContain('dispatchedFrame (d.js:3:3)');
  });

  it('does not print a stack for a verbose generic dispatch when stack is absent', () => {
    // Exercises handleError default/false-equivalent stack handling: verbose true
    // is forwarded, but the absent stack means no frames are appended.
    const err = new Error('no frames');
    err.stack = undefined;
    const out = captureStderr(() => handleError(err, true));

    expect(out).toContain('no frames');
    expect(out).not.toContain('    at ');
  });
});
