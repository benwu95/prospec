/**
 * Contract test: All change metadata issue sinks must route through normalizeIssueRef (REQ-TESTS-105, REQ-LIB-048).
 *
 * `normalizeIssueRef` in `src/lib/change-metadata.ts` is THE single source of truth for
 * absent/blank/multi-line issue semantics. Any code reading or writing `metadata.issue`
 * (e.g. change-story, auto-draft, archive, status) must call `normalizeIssueRef`.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeIssueRef } from '../../src/lib/change-metadata.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SERVICES_DIR = path.join(REPO_ROOT, 'src/services');

/**
 * Dynamically discover all service files that handle change issue metadata or options.issue.
 */
function discoverIssueSinkFiles(): string[] {
  const serviceFiles = fs.readdirSync(SERVICES_DIR).filter((file) => file.endsWith('.ts'));
  const discovered: string[] = [];

  for (const file of serviceFiles) {
    const relPath = path.join('src/services', file);
    const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
    if (
      /\boptions\.issue\b/.test(content) ||
      /\bmetadata\.issue\b/.test(content) ||
      /\bmeta\.issue\b/.test(content) ||
      /\bnormalizeIssueRef\b/.test(content)
    ) {
      discovered.push(relPath);
    }
  }

  return discovered;
}

/**
 * Validate that a sink file imports and invokes normalizeIssueRef when handling issue references.
 */
export function validateSinkSanitization(content: string, filename: string): { valid: boolean; reason?: string } {
  const hasImport =
    /import\s+{[^}]*normalizeIssueRef[^}]*}\s+from\s+['"][^'"]*change-metadata(?:\.js)?['"]/.test(content);

  if (!hasImport) {
    return { valid: false, reason: `${filename} does not import normalizeIssueRef from change-metadata` };
  }

  const hasUsage = /\bnormalizeIssueRef\s*\(/.test(content);
  if (!hasUsage) {
    return { valid: false, reason: `${filename} imports normalizeIssueRef but does not invoke it` };
  }

  return { valid: true };
}

describe('Issue-Ref Sink Contract', () => {
  it('dynamically discovers all issue sink files in src/services/ (including auto-draft, change-story, archive, status)', () => {
    const sinks = discoverIssueSinkFiles();
    expect(sinks).toContain('src/services/change-story.service.ts');
    expect(sinks).toContain('src/services/auto-draft.service.ts');
    expect(sinks).toContain('src/services/archive.service.ts');
    expect(sinks).toContain('src/services/status.service.ts');
    expect(sinks.length).toBeGreaterThanOrEqual(4);
  });

  it('verifies that EVERY discovered sink file imports and invokes normalizeIssueRef', () => {
    const sinks = discoverIssueSinkFiles();
    const failures: string[] = [];

    for (const relPath of sinks) {
      const fullPath = path.join(REPO_ROOT, relPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const result = validateSinkSanitization(content, relPath);
      if (!result.valid) {
        failures.push(result.reason!);
      }
    }

    expect(failures).toEqual([]);
  });

  it('ensures normalizeIssueRef correctly normalizes multi-line and whitespace inputs', () => {
    // Multi-line collapses to single line
    expect(normalizeIssueRef('https://github.com/org/repo/issues/123\n## Injected Heading\n- Extra line')).toBe(
      'https://github.com/org/repo/issues/123 ## Injected Heading - Extra line',
    );

    // Whitespace-only or empty returns undefined
    expect(normalizeIssueRef('   \n\t  ')).toBeUndefined();
    expect(normalizeIssueRef('')).toBeUndefined();
    expect(normalizeIssueRef(null)).toBeUndefined();
    expect(normalizeIssueRef(undefined)).toBeUndefined();
    expect(normalizeIssueRef(123)).toBeUndefined();

    // Valid issue ref preserved trimmed
    expect(normalizeIssueRef('  #206  ')).toBe('#206');
    expect(normalizeIssueRef('https://github.com/benwu95/prospec/issues/206')).toBe(
      'https://github.com/benwu95/prospec/issues/206',
    );
  });

  describe('Mutation Verification (PB-001/PB-019)', () => {
    it('turns red if normalizeIssueRef import is missing from real service code (e.g. auto-draft.service.ts)', () => {
      const realCode = fs.readFileSync(path.join(REPO_ROOT, 'src/services/auto-draft.service.ts'), 'utf-8');
      const mutated = realCode.replace('normalizeIssueRef,', '');
      const result = validateSinkSanitization(mutated, 'src/services/auto-draft.service.ts');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('does not import normalizeIssueRef');
    });

    it('turns red if normalizeIssueRef invocation is omitted in real service code (e.g. change-story.service.ts)', () => {
      const realCode = fs.readFileSync(path.join(REPO_ROOT, 'src/services/change-story.service.ts'), 'utf-8');
      const mutated = realCode.replaceAll('normalizeIssueRef(', '(');
      const result = validateSinkSanitization(mutated, 'src/services/change-story.service.ts');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('does not invoke it');
    });
  });
});
