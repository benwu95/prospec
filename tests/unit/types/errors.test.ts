import { describe, it, expect } from 'vitest';
import {
  ProspecError,
  ModuleDetectionError,
} from '../../../src/types/errors.js';

describe('ProspecError', () => {
  it('carries code and suggestion', () => {
    const err = new ProspecError('boom', 'SOME_CODE', 'do the thing');
    expect(err.code).toBe('SOME_CODE');
    expect(err.suggestion).toBe('do the thing');
    expect(err.message).toBe('boom');
  });

  it('forwards an underlying cause to preserve the original error', () => {
    const original = new TypeError('original failure');
    const err = new ProspecError('boom', 'SOME_CODE', 'fix', { cause: original });
    expect(err.cause).toBe(original);
  });
});

describe('ModuleDetectionError', () => {
  it('forwards cause so the underlying programming error is not masked', () => {
    const original = new TypeError('pattern.replace is not a function');
    const err = new ModuleDetectionError(original.message, { cause: original });
    expect(err.code).toBe('MODULE_DETECTION_ERROR');
    expect(err.message).toContain('pattern.replace is not a function');
    expect(err.cause).toBe(original);
  });

  it('still works without a cause (backward compatible)', () => {
    const err = new ModuleDetectionError('something');
    expect(err.cause).toBeUndefined();
    expect(err.message).toBe('Module detection failed: something');
  });
});
