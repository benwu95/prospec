/**
 * Deterministic Verification Context Projection Service (REQ-SERVICES-115, REQ-TYPES-104).
 *
 * Prepares and writes the bounded verify-context.json projection for a change
 * by calling the shared assessVerificationContext assessment owner and checking
 * pre-write stability. Does NOT run tests, modify metadata.yaml, or advance status.
 */

import fs from 'node:fs';
import path from 'node:path';
import { assessVerificationContext } from '../lib/verification-context.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { resolveChange } from './change-resolver.js';
import { PrerequisiteError } from '../types/errors.js';

export interface VerifyContextOptions {
  change?: string;
  cwd?: string;
  quiet?: boolean;
}

export interface VerifyContextResult {
  changeName: string;
  contextPath: string;
  contextId: string;
}

export async function execute(options: VerifyContextOptions): Promise<VerifyContextResult> {
  const cwd = options.cwd ?? process.cwd();
  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Which change context is being prepared?',
  );

  const changeDir = path.join(cwd, '.prospec', 'changes', changeName);
  if (!fs.existsSync(changeDir)) {
    throw new PrerequisiteError(
      `Change '${changeName}' not found`,
      'Verify the change name is correct, or run `prospec change story` to create a new change',
    );
  }

  const assessment = assessVerificationContext(cwd, changeName);

  if (!assessment.recheck()) {
    throw new PrerequisiteError(
      'verification inputs changed or are unprovable — nothing was written',
      'Re-run verify context against stable current inputs',
    );
  }

  const contextPath = path.join(changeDir, 'verify-context.json');
  const relPath = path.join('.prospec', 'changes', changeName, 'verify-context.json');
  const content = JSON.stringify(assessment.context, null, 2) + '\n';

  await atomicWrite(contextPath, content);

  return {
    changeName,
    contextPath: relPath,
    contextId: assessment.context.context_id,
  };
}
