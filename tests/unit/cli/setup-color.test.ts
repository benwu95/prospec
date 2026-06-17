import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const MODULE_PATH = '../../../src/cli/setup-color.js';

/**
 * setup-color.ts is a side-effecting module evaluated at import time. It reads
 * process.stdout.isTTY and the NO_COLOR / FORCE_COLOR env vars, and conditionally
 * sets process.env.NO_COLOR = '1'. To exercise every branch we control those
 * inputs, then re-evaluate the module fresh with vi.resetModules() + dynamic import.
 */

let originalIsTTY: PropertyDescriptor | undefined;
let originalNoColor: string | undefined;
let originalForceColor: string | undefined;

function setIsTTY(value: boolean | undefined): void {
  Object.defineProperty(process.stdout, 'isTTY', {
    value,
    configurable: true,
    writable: true,
  });
}

async function loadModule(): Promise<void> {
  vi.resetModules();
  await import(MODULE_PATH);
}

beforeEach(() => {
  originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  originalNoColor = process.env.NO_COLOR;
  originalForceColor = process.env.FORCE_COLOR;
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
});

afterEach(() => {
  if (originalIsTTY) {
    Object.defineProperty(process.stdout, 'isTTY', originalIsTTY);
  } else {
    delete (process.stdout as { isTTY?: unknown }).isTTY;
  }
  if (originalNoColor === undefined) {
    delete process.env.NO_COLOR;
  } else {
    process.env.NO_COLOR = originalNoColor;
  }
  if (originalForceColor === undefined) {
    delete process.env.FORCE_COLOR;
  } else {
    process.env.FORCE_COLOR = originalForceColor;
  }
});

describe('setup-color side-effect', () => {
  it('sets NO_COLOR=1 when stdout is not a TTY and no color env is set (then branch)', async () => {
    setIsTTY(undefined);
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;

    await loadModule();

    expect(process.env.NO_COLOR).toBe('1');
  });

  it('sets NO_COLOR=1 when isTTY is explicitly false', async () => {
    setIsTTY(false);
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;

    await loadModule();

    expect(process.env.NO_COLOR).toBe('1');
  });

  it('does NOT set NO_COLOR when stdout IS a TTY (first conjunct false → else branch)', async () => {
    setIsTTY(true);
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;

    await loadModule();

    expect('NO_COLOR' in process.env).toBe(false);
  });

  it('leaves an explicit NO_COLOR untouched even when non-TTY (second conjunct false → else branch)', async () => {
    setIsTTY(false);
    process.env.NO_COLOR = '0';
    delete process.env.FORCE_COLOR;

    await loadModule();

    // user's explicit value wins — module must not overwrite it with '1'
    expect(process.env.NO_COLOR).toBe('0');
  });

  it('does NOT set NO_COLOR when FORCE_COLOR is present and non-TTY (third conjunct false → else branch)', async () => {
    setIsTTY(false);
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = '1';

    await loadModule();

    // FORCE_COLOR from the user wins — NO_COLOR must not be introduced
    expect('NO_COLOR' in process.env).toBe(false);
  });

  it('honors FORCE_COLOR even when an empty string (presence, not truthiness)', async () => {
    setIsTTY(false);
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = '';

    await loadModule();

    expect('NO_COLOR' in process.env).toBe(false);
  });
});
