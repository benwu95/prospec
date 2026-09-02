/** Compatible Module README grammar release — not the document modification date. */
export const MODULE_README_FORMAT_DATE = '2026-09-01' as const;

/** Content shapes the initial Module README extension registry admits. */
export const MODULE_README_CONTENT_FORMATS = ['markdown', 'field-table'] as const;
export type ModuleReadmeContentFormat = (typeof MODULE_README_CONTENT_FORMATS)[number];

/** Raw module knowledge is a full Markdown passthrough, so extensions are included. */
export const MODULE_README_MCP_VISIBILITIES = ['included'] as const;
export type ModuleReadmeMcpVisibility = (typeof MODULE_README_MCP_VISIBILITIES)[number];

/** A parsed Project Section Extensions registry row. */
export interface ModuleReadmeExtensionDeclaration {
  id: string;
  heading: string;
  content: string;
  appliesTo: 'all' | readonly string[];
  required: boolean;
  mcpVisibility: ModuleReadmeMcpVisibility;
  contentFormat: ModuleReadmeContentFormat;
}
