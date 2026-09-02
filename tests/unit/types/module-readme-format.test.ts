import { describe, expect, it } from 'vitest';
import {
  MODULE_README_CONTENT_FORMATS,
  MODULE_README_FORMAT_DATE,
  MODULE_README_MCP_VISIBILITIES,
  type ModuleReadmeExtensionDeclaration,
} from '../../../src/types/module-readme-format.js';

describe('Module README format contracts', () => {
  it('declares the current compatible format release', () => {
    expect(MODULE_README_FORMAT_DATE).toBe('2026-09-01');
  });

  it('exposes the initial extension declaration vocabulary', () => {
    const declaration: ModuleReadmeExtensionDeclaration = {
      id: 'ownership',
      heading: 'Ownership',
      appliesTo: ['services'],
      required: false,
      mcpVisibility: 'included',
      contentFormat: 'field-table',
    };

    expect(MODULE_README_CONTENT_FORMATS).toEqual(['markdown', 'field-table']);
    expect(MODULE_README_MCP_VISIBILITIES).toEqual(['included']);
    expect(declaration).toMatchObject({ id: 'ownership', required: false });
  });
});
