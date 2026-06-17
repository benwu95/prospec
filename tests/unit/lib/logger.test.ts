import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../../../src/lib/logger.js';

describe('createLogger', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('normal mode', () => {
    it('should output success messages with the ✓ symbol', () => {
      const logger = createLogger('normal');
      logger.success('Done');
      const output = stdoutSpy.mock.calls.flat().join('');
      expect(output).toContain('✓');
      expect(output).toContain('Done');
      expect(output).toMatch(/✓.*Done/);
      expect(output.endsWith('\n')).toBe(true);
    });

    it('should output error messages to stderr with the ✗ symbol', () => {
      const logger = createLogger('normal');
      logger.error('Failed');
      const output = stderrSpy.mock.calls.flat().join('');
      expect(output).toContain('✗');
      expect(output).toContain('Failed');
      // error never writes to stdout
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should output warning messages with the ⚠ symbol', () => {
      const logger = createLogger('normal');
      logger.warning('Caution');
      const output = stdoutSpy.mock.calls.flat().join('');
      expect(output).toContain('⚠');
      expect(output).toContain('Caution');
    });

    it('should output info messages with the ℹ symbol', () => {
      const logger = createLogger('normal');
      logger.info('Note');
      const output = stdoutSpy.mock.calls.flat().join('');
      expect(output).toContain('ℹ');
      expect(output).toContain('Note');
    });

    it('should NOT output step messages', () => {
      const logger = createLogger('normal');
      logger.step('Step 1');
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should NOT output detail messages', () => {
      const logger = createLogger('normal');
      logger.detail('key', 'value');
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should NOT output list messages', () => {
      const logger = createLogger('normal');
      logger.list(['a', 'b']);
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should output summary messages with a leading blank line and no symbol', () => {
      const logger = createLogger('normal');
      logger.summary('All done');
      const output = stdoutSpy.mock.calls.flat().join('');
      expect(output).toContain('All done');
      // summary is intentionally symbol-free, distinguishing it from success/info/etc.
      expect(output).not.toContain('✓');
      expect(output).not.toContain('ℹ');
      // distinguishing behavior: a leading newline before the message and a trailing newline
      expect(output).toBe('\nAll done\n');
    });
  });

  describe('quiet mode', () => {
    it('should suppress success messages', () => {
      const logger = createLogger('quiet');
      logger.success('Done');
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should still output error messages', () => {
      const logger = createLogger('quiet');
      logger.error('Failed');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Failed'));
    });

    it('should suppress warning messages', () => {
      const logger = createLogger('quiet');
      logger.warning('Caution');
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should suppress info messages', () => {
      const logger = createLogger('quiet');
      logger.info('Note');
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should suppress summary messages', () => {
      const logger = createLogger('quiet');
      logger.summary('Done');
      expect(stdoutSpy).not.toHaveBeenCalled();
    });
  });

  describe('verbose mode', () => {
    it('should output all message types', () => {
      const logger = createLogger('verbose');
      logger.success('Done');
      logger.warning('Warn');
      logger.info('Info');
      logger.step('Step');
      logger.detail('key', 'value');
      logger.list(['item']);
      logger.summary('Summary');
      // 7 stdout calls (success, warning, info, step, detail, list item, summary)
      expect(stdoutSpy).toHaveBeenCalledTimes(7);
    });

    it('should output step messages with the ⎿ symbol', () => {
      const logger = createLogger('verbose');
      logger.step('Processing files');
      const output = stdoutSpy.mock.calls.flat().join('');
      expect(output).toContain('⎿');
      expect(output).toContain('Processing files');
    });

    it('should output detail messages with the → symbol and label: value format', () => {
      const logger = createLogger('verbose');
      logger.detail('Path', '/tmp/test');
      const output = stdoutSpy.mock.calls.flat().join('');
      expect(output).toContain('→');
      // label and value separated by ": ", distinguishing detail() formatting
      expect(output).toMatch(/Path: \/tmp\/test/);
    });

    it('should output one bulleted line per list item', () => {
      const logger = createLogger('verbose');
      logger.list(['alpha', 'beta', 'gamma']);
      // one write() call per item
      expect(stdoutSpy).toHaveBeenCalledTimes(3);
      const output = stdoutSpy.mock.calls.flat().join('');
      expect(output).toContain('alpha');
      expect(output).toContain('beta');
      expect(output).toContain('gamma');
      // each item carries the • bullet
      expect((output.match(/•/g) ?? []).length).toBe(3);
    });

    it('should emit nothing for an empty list', () => {
      const logger = createLogger('verbose');
      logger.list([]);
      expect(stdoutSpy).not.toHaveBeenCalled();
    });
  });

  describe('default level', () => {
    it('should default to normal mode', () => {
      const logger = createLogger();
      logger.success('Done');
      expect(stdoutSpy).toHaveBeenCalled();
      stdoutSpy.mockClear();
      logger.step('Step');
      expect(stdoutSpy).not.toHaveBeenCalled();
    });
  });

  describe('detail formatting', () => {
    it('should include optional detail text', () => {
      const logger = createLogger('normal');
      logger.success('Created', '/path/to/file');
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('/path/to/file'));
    });

    it('should append detail to error messages when provided', () => {
      const logger = createLogger('normal');
      logger.error('Failed', 'EACCES');
      const output = stderrSpy.mock.calls.flat().join('');
      expect(output).toContain('Failed');
      expect(output).toContain('EACCES');
    });

    it('should omit detail suffix from error messages when not provided', () => {
      const logger = createLogger('normal');
      logger.error('Failed');
      const output = stderrSpy.mock.calls.flat().join('');
      expect(output).toContain('Failed');
      expect(output).not.toContain('EACCES');
    });

    it('should append detail to warning messages when provided', () => {
      const logger = createLogger('normal');
      logger.warning('Caution', 'deprecated');
      const output = stdoutSpy.mock.calls.flat().join('');
      expect(output).toContain('Caution');
      expect(output).toContain('deprecated');
    });

    it('should omit detail suffix from warning messages when not provided', () => {
      const logger = createLogger('normal');
      logger.warning('Caution');
      const output = stdoutSpy.mock.calls.flat().join('');
      expect(output).toContain('Caution');
      expect(output).not.toContain('deprecated');
    });

    it('should append detail to info messages when provided', () => {
      const logger = createLogger('normal');
      logger.info('Note', 'extra context');
      const output = stdoutSpy.mock.calls.flat().join('');
      expect(output).toContain('Note');
      expect(output).toContain('extra context');
    });

    it('should omit detail suffix from info messages when not provided', () => {
      const logger = createLogger('normal');
      logger.info('Note');
      const output = stdoutSpy.mock.calls.flat().join('');
      expect(output).toContain('Note');
      expect(output).not.toContain('extra context');
    });
  });
});
