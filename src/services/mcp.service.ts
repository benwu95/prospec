import path from 'node:path';
import { createRequire } from 'node:module';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import {
  isSafeResourceName,
  listFeatureSpecs,
  loadModuleMap,
  parseIndexModules,
  readFeatureSpec,
  readFeatureMapRaw,
  readIndex,
  readModuleMapRaw,
  readModuleReadme,
  readPlaybook,
  readProduct,
  searchModules,
  attachModuleCategories,
} from '../lib/knowledge-reader.js';
import {
  buildDependencyRules,
  constitutionFallbackRules,
  evaluateKnowledgeHealth,
} from '../lib/drift-checker.js';
import { collectGitTimestamps } from '../lib/drift-sources.js';
import {
  MCP_RESOURCE_URIS,
  MCP_SERVER_NAME,
  SearchModulesInputShape,
  SearchModulesResultSchema,
  GetDependencyDirectionInputShape,
  DependencyDirectionResultSchema,
  type DependencyDirectionResult,
} from '../types/mcp.js';
import { McpResourceNotFound } from '../types/errors.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

/**
 * Read-only MCP server (REQ-MCP-001..005). Every resource read goes through
 * lib/knowledge-reader on each request — no caching, so clients always see
 * the current file state (REQ-MCP-002 AC3). The server registers no write
 * surface of any kind (REQ-MCP-007 — purely additive, nothing in skills or
 * existing services references it).
 */

export interface McpServeOptions {
  cwd?: string;
}

export interface McpServeResult {
  kind: 'serve';
  serverName: string;
  version: string;
  knowledgePath: string;
  featuresDir: string;
}

export interface McpServerContext {
  cwd: string;
  /** Resolved base dir — the root index.md lives at `<baseDir>/index.md`. */
  baseDir: string;
  knowledgePath: string;
  specsPath: string;
  featuresDir: string;
}

/** Start the stdio server. Diagnostics belong on stderr — stdout is the protocol channel. */
export async function execute(options: McpServeOptions): Promise<McpServeResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  const paths = resolveBasePaths(config, cwd);
  const featuresDir = path.join(paths.specsPath, 'features');

  const server = buildMcpServer({
    cwd,
    baseDir: paths.baseDir,
    knowledgePath: paths.knowledgePath,
    specsPath: paths.specsPath,
    featuresDir,
  });
  await server.connect(new StdioServerTransport());

  return {
    kind: 'serve',
    serverName: MCP_SERVER_NAME,
    version: pkg.version,
    knowledgePath: paths.knowledgePath,
    featuresDir,
  };
}

/** Assemble the server — exported separately so tests drive it over an in-memory transport. */
export function buildMcpServer(ctx: McpServerContext): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: pkg.version });
  registerKnowledgeResources(server, ctx);
  registerSpecResources(server, ctx);
  registerTools(server, ctx);
  return server;
}

function registerKnowledgeResources(server: McpServer, ctx: McpServerContext): void {
  server.registerResource(
    'index',
    MCP_RESOURCE_URIS.index,
    {
      title: 'AI Knowledge Index',
      description: 'Module index — where to look first',
      mimeType: 'text/markdown',
    },
    (uri) => textResource(uri.href, 'text/markdown', readIndex(ctx.baseDir)),
  );

  server.registerResource(
    'module-map',
    MCP_RESOURCE_URIS.moduleMap,
    {
      title: 'Module Map',
      description: 'Module boundaries and depends_on declarations',
      mimeType: 'application/yaml',
    },
    (uri) =>
      textResource(
        uri.href,
        'application/yaml',
        readModuleMapRaw(ctx.knowledgePath),
        'module-map.yaml not found — run `prospec knowledge init` first',
      ),
  );

  server.registerResource(
    'feature-map',
    MCP_RESOURCE_URIS.featureMap,
    {
      title: 'Feature Map',
      description: 'feature → module index (which modules a feature spans + its REQ prefixes)',
      mimeType: 'application/yaml',
    },
    // Raw like module-map: served verbatim, never parsed here (REQ-MCP-002).
    (uri) =>
      textResource(
        uri.href,
        'application/yaml',
        readFeatureMapRaw(ctx.knowledgePath),
        'feature-map.yaml not found — bootstrapped by the /prospec-archive skill (archive a verified change)',
      ),
  );

  server.registerResource(
    'playbook',
    MCP_RESOURCE_URIS.playbook,
    {
      title: 'Team Playbook',
      description: 'Human-approved lessons promoted by /prospec-learn',
      mimeType: 'text/markdown',
    },
    (uri) => textResource(uri.href, 'text/markdown', readPlaybook(ctx.knowledgePath)),
  );

  server.registerResource(
    'health',
    MCP_RESOURCE_URIS.health,
    {
      title: 'Knowledge Health',
      description: 'Per-module staleness and coverage (same pure function as `prospec check`)',
      mimeType: 'application/json',
    },
    (uri) => readHealth(uri.href, ctx),
  );

  server.registerResource(
    'module',
    new ResourceTemplate(MCP_RESOURCE_URIS.moduleTemplate, {
      // A missing map degrades the listing to empty instead of failing
      // resources/list wholesale; direct module reads stay available (graceful).
      // An invalid map throws loudly (REQ-MCP-006 AC3).
      list: () => ({
        // same guard as the read path — never advertise a URI the read
        // handler would refuse (list/read halves must agree)
        resources: listMapModules(ctx)
          .filter(isSafeResourceName)
          .map((name) => ({
            uri: MCP_RESOURCE_URIS.moduleTemplate.replace('{name}', name),
            name: `module: ${name}`,
            mimeType: 'text/markdown',
          })),
      }),
    }),
    {
      title: 'Module Knowledge',
      description: 'Recipe-First README for one module',
      mimeType: 'text/markdown',
    },
    (uri, variables) =>
      textResource(
        uri.href,
        'text/markdown',
        readModuleReadme(ctx.knowledgePath, String(variables.name)),
      ),
  );
}

function registerSpecResources(server: McpServer, ctx: McpServerContext): void {
  server.registerResource(
    'product',
    MCP_RESOURCE_URIS.product,
    {
      title: 'Product Spec',
      description: 'PRD entry point — product overview + feature map (top-level navigation)',
      mimeType: 'text/markdown',
    },
    (uri) =>
      textResource(
        uri.href,
        'text/markdown',
        readProduct(ctx.specsPath),
        'product.md not found — generated by the /prospec-archive skill (archive a verified change)',
      ),
  );

  server.registerResource(
    'feature-spec',
    new ResourceTemplate(MCP_RESOURCE_URIS.specTemplate, {
      list: () => ({
        resources: listFeatureSpecs(ctx.featuresDir)
          .filter(isSafeResourceName)
          .map((name) => ({
            uri: MCP_RESOURCE_URIS.specTemplate.replace('{name}', name),
            name: `spec: ${name}`,
            mimeType: 'text/markdown',
          })),
      }),
    }),
    {
      title: 'Feature Spec',
      description: 'Feature spec (REQ source of truth) for one feature',
      mimeType: 'text/markdown',
    },
    (uri, variables) =>
      textResource(uri.href, 'text/markdown', readFeatureSpec(ctx.featuresDir, String(variables.name))),
  );
}

function registerTools(server: McpServer, ctx: McpServerContext): void {
  server.registerTool(
    'search_modules',
    {
      title: 'Search modules',
      description:
        'Find which module owns a concept — normalized term-OR match over the ' +
        'curated Module/Keywords/Aliases columns of knowledge://index',
      inputSchema: SearchModulesInputShape,
      outputSchema: SearchModulesResultSchema,
      annotations: { readOnlyHint: true },
    },
    ({ query }) => {
      const index = readIndex(ctx.baseDir);
      if (index === null) {
        return toolError('knowledge://index not found — generate AI Knowledge first');
      }
      const ranked = searchModules(query, parseIndexModules(index));
      const result = attachModuleCategories(ranked, loadModuleMap(ctx.knowledgePath, ctx.cwd));
      return structuredResult(result);
    },
  );

  server.registerTool(
    'get_dependency_direction',
    {
      title: 'Get dependency direction',
      description:
        'May `from` import `to`? Answered from module-map depends_on, or the ' +
        'Constitution chain cli → services → lib → types when no map exists',
      inputSchema: GetDependencyDirectionInputShape,
      outputSchema: DependencyDirectionResultSchema,
      annotations: { readOnlyHint: true },
    },
    ({ from, to }) => {
      const moduleMap = loadModuleMap(ctx.knowledgePath, ctx.cwd);
      const rules = moduleMap ? buildDependencyRules(moduleMap) : constitutionFallbackRules();
      const result: DependencyDirectionResult = {
        allowed: rules.allowed.get(from)?.has(to) ?? false,
        direction: `${from} → ${to}`,
        source: rules.source,
      };
      return structuredResult(result);
    },
  );
}

function readHealth(uriHref: string, ctx: McpServerContext) {
  const moduleMap = loadModuleMap(ctx.knowledgePath, ctx.cwd);
  if (moduleMap === null) {
    throw new McpResourceNotFound(
      uriHref,
      'module-map.yaml not found — run `prospec knowledge init` first',
    );
  }
  const outcome = evaluateKnowledgeHealth(
    collectGitTimestamps(ctx.cwd, moduleMap, ctx.knowledgePath),
  );
  // An unavailable git history is an honest environment fact, not an error —
  // mirror the check engine's skip semantics instead of fabricating numbers.
  const payload =
    outcome.knowledgeHealth ?? { unavailable: true, reason: outcome.result.reason ?? 'source unavailable' };
  return {
    contents: [
      { uri: uriHref, mimeType: 'application/json', text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function listMapModules(ctx: McpServerContext): string[] {
  // missing map → null → empty listing (graceful); a present-but-invalid map
  // throws ModuleDetectionError so resources/list fails loudly, consistent
  // with `prospec check` (REQ-MCP-006 AC3) — the server process survives.
  return (loadModuleMap(ctx.knowledgePath, ctx.cwd)?.modules ?? []).map((m) => m.name);
}

function textResource(
  uriHref: string,
  mimeType: string,
  text: string | null,
  notFoundHint?: string,
) {
  if (text === null) throw new McpResourceNotFound(uriHref, notFoundHint);
  return { contents: [{ uri: uriHref, mimeType, text }] };
}

function structuredResult(structured: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}
