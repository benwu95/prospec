/**
 * Contract test: All CLI formatters must sanitize free-form string outputs (REQ-TESTS-104, REQ-CLI-049).
 *
 * Every formatter under `src/cli/formatters/` (excluding `sanitize.ts`) must import
 * `sanitizeTerminal` and invoke it on free-form string properties (descriptions,
 * names, error messages, user-controlled strings) before writing to stdout/stderr.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatUpgradeOutput } from '../../src/cli/formatters/upgrade-output.js';
import { formatChangeStoryOutput } from '../../src/cli/formatters/change-story-output.js';
import { formatProspecError } from '../../src/cli/formatters/error-output.js';
import { ProspecError } from '../../src/types/errors.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const FORMATTERS_DIR = path.join(REPO_ROOT, 'src/cli/formatters');

function getFormatterFiles(): string[] {
  return fs
    .readdirSync(FORMATTERS_DIR)
    .filter((file) => file.endsWith('.ts') && file !== 'sanitize.ts');
}

/**
 * Structural validator for a single formatter file's content.
 */
export function validateFormatterSanitization(content: string, filename: string): { valid: boolean; reason?: string } {
  // 1. Check import of sanitizeTerminal
  const hasImport =
    /import\s+{[^}]*sanitizeTerminal[^}]*}\s+from\s+['"]\.\/sanitize(?:\.js)?['"]/.test(content);

  if (!hasImport) {
    return { valid: false, reason: `${filename} does not import sanitizeTerminal from ./sanitize.js` };
  }

  // 2. Check that sanitizeTerminal is called in the file
  const hasUsage = /\bsanitizeTerminal\s*\(/.test(content);
  if (!hasUsage) {
    return { valid: false, reason: `${filename} imports sanitizeTerminal but does not invoke it` };
  }

  return { valid: true };
}

describe('Formatter Sanitize Contract', () => {
  it('discovers all formatters in src/cli/formatters/ dynamically (≥ 20 formatters)', () => {
    const files = getFormatterFiles();
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it('verifies that EVERY formatter imports and invokes sanitizeTerminal', () => {
    const files = getFormatterFiles();
    const failures: string[] = [];

    for (const file of files) {
      const filePath = path.join(FORMATTERS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const result = validateFormatterSanitization(content, file);
      if (!result.valid) {
        failures.push(result.reason!);
      }
    }

    expect(failures).toEqual([]);
  });

  describe('Runtime Escape-Code Payload Neutralization (REQ-TESTS-104)', () => {
    it('neutralizes OSC and ANSI escape payloads in upgrade-output', () => {
      let stderrOutput = '';
      let stdoutOutput = '';
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((str) => {
        stderrOutput += String(str);
        return true;
      });
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        stdoutOutput += String(str);
        return true;
      });

      const maliciousPayload = '\u001b]52;c;ZXhwbG9pdA==\u0007\u001b[31mInjected';

      formatUpgradeOutput({
        agentSync: {
          agents: [],
          totalFiles: 1,
          warnings: [`Malicious warning: ${maliciousPayload}`],
          hints: [`Malicious hint: ${maliciousPayload}`],
        },
        report: {
          versionFrom: '1.0.0',
          versionTo: '1.1.0',
          docs: [],
          createdDocs: [],
          nudges: [{ field: 'test', message: `Malicious nudge: ${maliciousPayload}` }],
          missingTriggers: [`skill-${maliciousPayload}`],
          staleLanguagePolicy: true,
          currentLanguagePolicy: {
            severity: 'MUST',
            name: `Language Policy ${maliciousPayload}`,
            description: `Description ${maliciousPayload}`,
            rationale: `Rationale ${maliciousPayload}`,
            check: `Check ${maliciousPayload}`,
          },
        },
        resolvedNudges: [{ field: 'lang', value: `tw-${maliciousPayload}` }],
        rawScanRefreshed: false,
        nextStep: `/prospec-upgrade-${maliciousPayload}`,
      });

      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();

      // Ensure no raw C0 escape (\u001b) or bell (\u0007) leaked to terminal output
      expect(stderrOutput).not.toContain('\u001b]52');
      expect(stderrOutput).not.toContain('\u0007');
      expect(stdoutOutput).not.toContain('\u001b]52');
      expect(stdoutOutput).not.toContain('\u0007');
    });

    it('neutralizes escape payloads in error-output', () => {
      let stderrOutput = '';
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((str) => {
        stderrOutput += String(str);
        return true;
      });

      const maliciousPayload = '\u001b[2J\u001b[H\u0000Exploit';
      const error = new ProspecError(
        `Error ${maliciousPayload}`,
        'TEST_CODE',
        `Suggestion ${maliciousPayload}`,
      );
      formatProspecError(error);

      stderrSpy.mockRestore();

      expect(stderrOutput).not.toContain('\u001b[2J');
      expect(stderrOutput).not.toContain('\u0000');
    });

    it('neutralizes escape payloads in change-story-output', () => {
      let stdoutOutput = '';
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        stdoutOutput += String(str);
        return true;
      });

      const maliciousPayload = '\u001b]52;c;evil\u0007';
      formatChangeStoryOutput({
        changeName: `change-${maliciousPayload}`,
        changeDir: `.prospec/changes/change-${maliciousPayload}`,
        description: `Desc ${maliciousPayload}`,
        createdFiles: [`path/${maliciousPayload}`],
        dryRun: false,
        relatedModules: [{ name: `mod-${maliciousPayload}`, description: `desc-${maliciousPayload}` }],
      });

      stdoutSpy.mockRestore();

      expect(stdoutOutput).not.toContain('\u001b]52');
      expect(stdoutOutput).not.toContain('\u0007');
    });

  });

  describe('Mutation Verification (PB-001/PB-019)', () => {
    it('turns red if sanitizeTerminal import is removed from real formatter code', () => {
      const realCode = fs.readFileSync(path.join(FORMATTERS_DIR, 'change-story-output.ts'), 'utf-8');
      const mutated = realCode.replace(/import\s+{[^}]*sanitizeTerminal[^}]*}\s+from\s+['"]\.\/sanitize(?:\.js)?['"];?/, '');
      const result = validateFormatterSanitization(mutated, 'change-story-output.ts');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('does not import sanitizeTerminal');
    });

    it('turns red if sanitizeTerminal invocations are removed from real formatter code', () => {
      const realCode = fs.readFileSync(path.join(FORMATTERS_DIR, 'change-story-output.ts'), 'utf-8');
      const mutated = realCode.replaceAll('sanitizeTerminal(', '(');
      const result = validateFormatterSanitization(mutated, 'change-story-output.ts');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('does not invoke it');
    });
  });
});
