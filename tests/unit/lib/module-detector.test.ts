import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol } from 'memfs';
import { toInlineCodeSpan } from '../../../src/lib/markdown-fences.js';
import {
  detectModules,
  buildModuleMap,
  collectNonSourceDirectories,
  isSourceFile,
} from '../../../src/lib/module-detector.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

describe('detectModules', () => {
  it('should detect modules from directory structure', () => {
    const files = [
      'src/services/auth.ts',
      'src/services/user.ts',
      'src/lib/config.ts',
      'src/lib/utils.ts',
      'src/types/errors.ts',
    ];
    vol.fromJSON({
      '/project/src/services/auth.ts': 'import { config } from "../lib/config.js";',
      '/project/src/services/user.ts': '',
      '/project/src/lib/config.ts': '',
      '/project/src/lib/utils.ts': '',
      '/project/src/types/errors.ts': '',
    });
    const result = detectModules(files, '/project');
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('services');
    expect(moduleNames).toContain('lib');
    // The seeded relative import (`services/auth.ts` → `../lib/config`) must
    // surface as a real dependency edge, not just produce two bare modules.
    const services = result.modules.find((m) => m.name === 'services');
    expect(services?.relationships.depends_on).toContain('lib');
  });

  it('should detect architecture patterns', () => {
    const files = [
      'src/cli/index.ts',
      'src/services/auth.ts',
      'src/lib/config.ts',
      'src/types/errors.ts',
    ];
    vol.fromJSON({
      '/project/src/cli/index.ts': '',
      '/project/src/services/auth.ts': '',
      '/project/src/lib/config.ts': '',
      '/project/src/types/errors.ts': '',
    });
    const result = detectModules(files, '/project');
    // pragmatic pattern requires cli, services, lib, types
    expect(result.architecture).toBe('pragmatic');
  });

  it('should detect MVC architecture', () => {
    const files = [
      'src/models/user.ts',
      'src/views/home.ts',
      'src/controllers/auth.ts',
    ];
    vol.fromJSON({
      '/project/src/models/user.ts': '',
      '/project/src/views/home.ts': '',
      '/project/src/controllers/auth.ts': '',
    });
    const result = detectModules(files, '/project');
    expect(result.architecture).toBe('mvc');
  });

  it('should use existing module-map.yaml when available', () => {
    const files = ['src/index.ts'];
    vol.fromJSON({
      '/project/prospec/ai-knowledge/module-map.yaml': `
modules:
  - name: core
    description: Core module
    paths:
      - src/core/**
    keywords:
      - core
    relationships:
      depends_on: []
      used_by: []
`,
      '/project/src/index.ts': '',
    });
    const result = detectModules(files, '/project');
    expect(result.modules[0]?.name).toBe('core');
  });

  it('should read existing module-map.yaml from a custom knowledge base path', () => {
    const files = ['src/index.ts'];
    vol.fromJSON({
      '/project/custom-knowledge/module-map.yaml': `
modules:
  - name: domain
    description: Domain module
    paths:
      - src/domain/**
    keywords:
      - domain
    relationships:
      depends_on: []
      used_by: []
`,
      '/project/src/index.ts': '',
    });
    // The default prospec/ai-knowledge would not find this file (it lives under custom-knowledge); the custom path must be honored.
    const result = detectModules(files, '/project', 'auto', 'custom-knowledge');
    expect(result.modules[0]?.name).toBe('domain');
  });

  it('should detect entry points', () => {
    const files = [
      'src/index.ts',
      'src/cli/index.ts',
      'src/services/auth.ts',
    ];
    vol.fromJSON({
      '/project/src/index.ts': '',
      '/project/src/cli/index.ts': '',
      '/project/src/services/auth.ts': '',
    });
    const result = detectModules(files, '/project');
    expect(result.entryPoints).toContain('src/index.ts');
    expect(result.entryPoints).toContain('src/cli/index.ts');
  });

  it('recognizes root-level go/py entry points and excludes non-entry files', () => {
    const files = ['main.go', 'manage.py', 'src/services/auth.ts', 'README.md'];
    vol.fromJSON({
      '/project/main.go': '',
      '/project/manage.py': '',
      '/project/src/services/auth.ts': '',
      '/project/README.md': '',
    });
    const result = detectModules(files, '/project', 'architecture');
    expect(result.entryPoints).toContain('main.go');
    expect(result.entryPoints).toContain('manage.py');
    // A regular source file and the readme are not entry-point patterns.
    expect(result.entryPoints).not.toContain('src/services/auth.ts');
    expect(result.entryPoints).not.toContain('README.md');
  });

  it('generates keywords from name + camel/kebab split + path segments, excluding glob tokens', () => {
    const files = [
      'src/orderService/create.ts',
      'src/orderService/cancel.ts',
    ];
    vol.fromJSON({
      '/project/src/orderService/create.ts': '',
      '/project/src/orderService/cancel.ts': '',
    });
    // Architecture strategy yields name 'orderService' with paths ['src/orderService/**'],
    // so each generateKeywords branch contributes a DISTINCT, non-duplicated token:
    //   - name.toLowerCase()            → 'orderservice'   (whole-name branch)
    //   - camelCase split (>=3 chars)   → 'order', 'service' (split branch)
    //   - path segments (no '**'/'*'/'.')→ 'src'          (path-segment branch)
    // Pinning the full sorted set fails if ANY single branch is dropped.
    const result = detectModules(files, '/project', 'architecture');
    const order = result.modules.find((m) => m.name === 'orderService');
    expect(order?.keywords).toBeDefined();
    expect([...order!.keywords].sort()).toEqual(
      ['order', 'orderservice', 'service', 'src'],
    );
    // The glob marker is filtered out of path-segment extraction (not a keyword).
    expect(order?.keywords).not.toContain('**');
    expect(order?.keywords).not.toContain('*');
  });

  it('should skip root-level files from module detection', () => {
    const files = [
      'package.json',
      'tsconfig.json',
      // Root files must never surface as modules. NOTE on coverage: with the
      // name-based bypass gone, `detectFromDirectories`' `parts.length < 2`
      // guard no longer changes this outcome for any reachable input — a root
      // file always forms a singleton prefix bucket, which the uniform 2-file
      // threshold drops anyway (and a prefix shared with a same-named directory
      // is not constructible on a real filesystem). The guard is retained as
      // intent, not as the thing under test; what this case pins is the
      // OUTCOME, which must hold however the guard is refactored.
      'config',
      'src/services/auth.ts',
      'src/services/user.ts',
    ];
    vol.fromJSON({
      '/project/package.json': '{}',
      '/project/tsconfig.json': '{}',
      '/project/config': '',
      '/project/src/services/auth.ts': '',
      '/project/src/services/user.ts': '',
    });
    const result = detectModules(files, '/project');
    const moduleNames = result.modules.map((m) => m.name);
    // Pin the whole positive set: the only surviving module is the 2-file
    // src/services dir. Any root-level leakage fails this.
    expect(moduleNames).toEqual(['services']);
    expect(moduleNames).not.toContain('config');
    expect(moduleNames).not.toContain('package.json');
    expect(moduleNames).not.toContain('tsconfig.json');
  });

  it('should return unknown architecture when no pattern matches', () => {
    const files = ['data/file1.csv', 'data/file2.csv'];
    vol.fromJSON({
      '/project/data/file1.csv': '',
      '/project/data/file2.csv': '',
    });
    const result = detectModules(files, '/project');
    expect(result.architecture).toBe('unknown');
  });

  it('stays unknown when only a single architecture indicator matches', () => {
    // 'models' is the lone indicator of any pattern; the bestScore >= 2 guard
    // must reject a single match rather than label it 'mvc'/'layered'.
    const files = [
      'src/models/a.ts',
      'src/models/b.ts',
      'src/widgets/c.ts',
      'src/widgets/d.ts',
    ];
    vol.fromJSON({
      '/project/src/models/a.ts': '',
      '/project/src/models/b.ts': '',
      '/project/src/widgets/c.ts': '',
      '/project/src/widgets/d.ts': '',
    });
    const result = detectModules(files, '/project', 'architecture');
    expect(result.architecture).toBe('unknown');
  });

  it('should accept strategy parameter', () => {
    const files = [
      'src/services/auth.ts',
      'src/services/user.ts',
      'src/lib/config.ts',
      'src/lib/utils.ts',
    ];
    vol.fromJSON({
      '/project/src/services/auth.ts': '',
      '/project/src/services/user.ts': '',
      '/project/src/lib/config.ts': '',
      '/project/src/lib/utils.ts': '',
    });
    const result = detectModules(files, '/project', 'architecture');
    // The 'architecture' strategy dispatches to directory-layer detection,
    // which must split these into the two second-level dirs.
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toEqual(expect.arrayContaining(['services', 'lib']));
  });

  it('keeps same-named dirs at different roots distinct instead of one wide glob', () => {
    const files = [
      'src/services/a.ts',
      'src/services/b.ts',
      'services/c.ts',
      'services/d.ts',
    ];
    vol.fromJSON({
      '/project/src/services/a.ts': '',
      '/project/src/services/b.ts': '',
      '/project/services/c.ts': '',
      '/project/services/d.ts': '',
    });
    const result = detectModules(files, '/project', 'architecture');
    const services = result.modules.find((m) => m.name === 'services');
    // Both roots must be represented as their own globs; the old code collapsed
    // them to a single 'src/**' that dropped the root-level services/ files.
    expect(services?.paths).toEqual(
      expect.arrayContaining(['src/services/**', 'services/**']),
    );
    expect(services?.paths).not.toContain('src/**');
  });

  it('detects relationships by resolved path, not import substring', () => {
    const files = [
      'src/web/page.ts',
      'src/web/view.ts',
      'src/api/handler.ts',
      'src/api/route.ts',
      'src/shared/util.ts',
      'src/shared/const.ts',
    ];
    vol.fromJSON({
      // 'rapidapi' is a package whose name CONTAINS 'api'; the real dep is shared
      '/project/src/web/page.ts':
        "import x from 'rapidapi';\nimport { u } from '../shared/util.js';\n",
      '/project/src/web/view.ts': '',
      '/project/src/api/handler.ts': '',
      '/project/src/api/route.ts': '',
      '/project/src/shared/util.ts': '',
      '/project/src/shared/const.ts': '',
    });

    const result = detectModules(files, '/project', 'architecture');
    const web = result.modules.find((m) => m.name === 'web');
    // real relative dependency is detected
    expect(web?.relationships.depends_on).toContain('shared');
    // 'rapidapi'.includes('api') must NOT create a bogus dep on module 'api'
    expect(web?.relationships.depends_on).not.toContain('api');
  });

  it('detects a directory (barrel) relative import', () => {
    const files = [
      'src/web/page.ts',
      'src/web/view.ts',
      'src/shared/util.ts',
      'src/shared/index.ts',
    ];
    vol.fromJSON({
      // imports the directory, not a concrete file → resolves to 'src/shared'
      '/project/src/web/page.ts': "import { u } from '../shared';\n",
      '/project/src/web/view.ts': '',
      '/project/src/shared/util.ts': '',
      '/project/src/shared/index.ts': '',
    });

    const result = detectModules(files, '/project', 'architecture');
    const web = result.modules.find((m) => m.name === 'web');
    expect(web?.relationships.depends_on).toContain('shared');
  });

  it('ignores commented-out imports when detecting relationships', () => {
    const files = [
      'src/web/page.ts',
      'src/web/view.ts',
      'src/api/handler.ts',
      'src/api/route.ts',
      'src/shared/util.ts',
      'src/shared/const.ts',
    ];
    vol.fromJSON({
      '/project/src/web/page.ts':
        "// import { old } from '../api/handler.js';\n" +
        "import { u } from '../shared/util.js';\n",
      '/project/src/web/view.ts': '',
      '/project/src/api/handler.ts': '',
      '/project/src/api/route.ts': '',
      '/project/src/shared/util.ts': '',
      '/project/src/shared/const.ts': '',
    });

    const result = detectModules(files, '/project', 'architecture');
    const web = result.modules.find((m) => m.name === 'web');
    expect(web?.relationships.depends_on).toContain('shared');
    // The only reference to 'api' is inside a line comment — it must not edge.
    expect(web?.relationships.depends_on).not.toContain('api');
  });
});

describe('detectModules — domain strategy', () => {
  it('should group files by domain from features/', () => {
    const files = [
      'src/features/auth/LoginPage.tsx',
      'src/features/auth/AuthService.ts',
      'src/features/checkout/CheckoutPage.tsx',
      'src/features/checkout/CartService.ts',
      'src/utils/helpers.ts',
      'src/utils/constants.ts',
    ];
    vol.fromJSON({
      '/project/src/features/auth/LoginPage.tsx': '',
      '/project/src/features/auth/AuthService.ts': '',
      '/project/src/features/checkout/CheckoutPage.tsx': '',
      '/project/src/features/checkout/CartService.ts': '',
      '/project/src/utils/helpers.ts': '',
      '/project/src/utils/constants.ts': '',
    });

    const result = detectModules(files, '/project', 'domain');
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('auth');
    expect(moduleNames).toContain('checkout');
  });

  it('should detect domains from pages/ and routes/', () => {
    const files = [
      'src/pages/dashboard/index.tsx',
      'src/pages/dashboard/widgets.tsx',
      'src/routes/settings/profile.tsx',
      'src/routes/settings/billing.tsx',
    ];
    vol.fromJSON({
      '/project/src/pages/dashboard/index.tsx': '',
      '/project/src/pages/dashboard/widgets.tsx': '',
      '/project/src/routes/settings/profile.tsx': '',
      '/project/src/routes/settings/billing.tsx': '',
    });

    const result = detectModules(files, '/project', 'domain');
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('dashboard');
    expect(moduleNames).toContain('settings');
  });

  it('should add infra catch-all for non-domain files', () => {
    const files = [
      'src/features/auth/Login.tsx',
      'src/features/auth/Register.tsx',
      'src/middleware/cors.ts',
      'src/middleware/logger.ts',
    ];
    vol.fromJSON({
      '/project/src/features/auth/Login.tsx': '',
      '/project/src/features/auth/Register.tsx': '',
      '/project/src/middleware/cors.ts': '',
      '/project/src/middleware/logger.ts': '',
    });

    const result = detectModules(files, '/project', 'domain');
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('auth');
    expect(moduleNames).toContain('infra');

    // infra must carry its actual files (not paths: []), so it participates in
    // dependency detection and keyword generation rather than matching nothing.
    const infra = result.modules.find((m) => m.name === 'infra');
    expect(infra?.paths.length).toBeGreaterThan(0);
    expect(infra?.paths).toContain('src/middleware/cors.ts');
  });

  it('should require 2+ files per domain', () => {
    const files = [
      'src/features/auth/Login.tsx',
      'src/features/checkout/Cart.tsx',
    ];
    vol.fromJSON({
      '/project/src/features/auth/Login.tsx': '',
      '/project/src/features/checkout/Cart.tsx': '',
    });

    const result = detectModules(files, '/project', 'domain');
    // Each domain has only 1 file, so the 2-file threshold drops both; the
    // explicit 'domain' strategy does not fall back, so NO modules survive.
    expect(result.modules).toEqual([]);
  });

  it('emits a glob that targets the REAL suffixed directory, not the normalized name', () => {
    const files = [
      'src/services/orderService/create.ts',
      'src/services/orderService/cancel.ts',
      'src/controllers/orderController/handler.ts',
      'src/controllers/orderController/router.ts',
    ];
    vol.fromJSON({
      '/project/src/services/orderService/create.ts': '',
      '/project/src/services/orderService/cancel.ts': '',
      '/project/src/controllers/orderController/handler.ts': '',
      '/project/src/controllers/orderController/router.ts': '',
    });

    const result = detectModules(files, '/project', 'domain');
    const order = result.modules.find((m) => m.name === 'order');
    expect(order).toBeDefined();
    // Both real directory segments are unioned as their own globs; the old code
    // emitted a single '**/order/**' that matched NONE of the module's files.
    expect(order?.paths).toEqual(
      expect.arrayContaining(['**/orderService/**', '**/orderController/**']),
    );
    expect(order?.paths).not.toContain('**/order/**');
  });

  it('keeps the domain glob consumable so cross-domain relationships survive', () => {
    const files = [
      'src/components/checkoutView/Cart.tsx',
      'src/components/checkoutView/Summary.tsx',
      'src/services/paymentService/api.ts',
      'src/services/paymentService/gateway.ts',
    ];
    vol.fromJSON({
      '/project/src/components/checkoutView/Cart.tsx':
        "import { pay } from '../../services/paymentService/api.js';\n",
      '/project/src/components/checkoutView/Summary.tsx': '',
      '/project/src/services/paymentService/api.ts': '',
      '/project/src/services/paymentService/gateway.ts': '',
    });

    const result = detectModules(files, '/project', 'domain');
    const checkout = result.modules.find((m) => m.name === 'checkout');
    // Membership is re-derived from the glob; a broken '**/checkout/**' glob
    // would scan zero files and silently drop this dependency edge.
    expect(checkout?.relationships.depends_on).toContain('payment');
  });

  it('does not over-strip a suffix that is merely the tail of a longer word', () => {
    const files = [
      'src/features/preview/Panel.tsx',
      'src/features/preview/Toolbar.tsx',
      'src/features/reviews/List.tsx',
      'src/features/reviews/Item.tsx',
    ];
    vol.fromJSON({
      '/project/src/features/preview/Panel.tsx': '',
      '/project/src/features/preview/Toolbar.tsx': '',
      '/project/src/features/reviews/List.tsx': '',
      '/project/src/features/reviews/Item.tsx': '',
    });

    const result = detectModules(files, '/project', 'domain');
    const moduleNames = result.modules.map((m) => m.name);
    // 'preview' must NOT become 'pre', 'reviews' must NOT become 're'.
    expect(moduleNames).toContain('preview');
    expect(moduleNames).toContain('reviews');
    expect(moduleNames).not.toContain('pre');
    expect(moduleNames).not.toContain('re');
  });
});

describe('detectModules — package strategy', () => {
  it('should detect packages from pnpm-workspace.yaml', () => {
    const files = [
      'packages/web/src/index.ts',
      'packages/web/src/App.tsx',
      'packages/api/src/index.ts',
      'packages/api/src/server.ts',
    ];
    vol.fromJSON({
      '/monorepo/pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
      '/monorepo/packages/web/src/index.ts': '',
      '/monorepo/packages/web/src/App.tsx': '',
      '/monorepo/packages/api/src/index.ts': '',
      '/monorepo/packages/api/src/server.ts': '',
    });

    const result = detectModules(files, '/monorepo', 'package');
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('web');
    expect(moduleNames).toContain('api');
  });

  it('detects packages from a deep-glob workspace pattern outside packages/apps', () => {
    const files = [
      'libs/web/src/index.ts',
      'libs/web/src/App.tsx',
      'libs/api/src/index.ts',
      'libs/api/src/server.ts',
    ];
    vol.fromJSON({
      // 'libs/**' is not covered by the packages/apps fallback, so a single-'*'
      // strip ('libs/*') would match nothing and yield zero packages.
      '/monorepo/pnpm-workspace.yaml': 'packages:\n  - "libs/**"\n',
      '/monorepo/libs/web/src/index.ts': '',
      '/monorepo/libs/web/src/App.tsx': '',
      '/monorepo/libs/api/src/index.ts': '',
      '/monorepo/libs/api/src/server.ts': '',
    });

    const result = detectModules(files, '/monorepo', 'package');
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('web');
    expect(moduleNames).toContain('api');
  });

  it('should detect packages from package.json workspaces', () => {
    const files = [
      'packages/shared/src/utils.ts',
      'packages/shared/src/types.ts',
      'apps/frontend/src/main.tsx',
      'apps/frontend/src/App.tsx',
    ];
    vol.fromJSON({
      '/monorepo/package.json': JSON.stringify({
        workspaces: ['packages/*', 'apps/*'],
      }),
      '/monorepo/packages/shared/src/utils.ts': '',
      '/monorepo/packages/shared/src/types.ts': '',
      '/monorepo/apps/frontend/src/main.tsx': '',
      '/monorepo/apps/frontend/src/App.tsx': '',
    });

    const result = detectModules(files, '/monorepo', 'package');
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('shared');
    expect(moduleNames).toContain('frontend');
  });

  it('should fallback to packages/ directory when no workspace config', () => {
    const files = [
      'packages/core/src/index.ts',
      'packages/core/src/utils.ts',
      'packages/ui/src/Button.tsx',
      'packages/ui/src/Input.tsx',
    ];
    vol.fromJSON({
      '/monorepo/packages/core/src/index.ts': '',
      '/monorepo/packages/core/src/utils.ts': '',
      '/monorepo/packages/ui/src/Button.tsx': '',
      '/monorepo/packages/ui/src/Input.tsx': '',
    });

    const result = detectModules(files, '/monorepo', 'package');
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('core');
    expect(moduleNames).toContain('ui');
  });

  it('should return empty when no package structure exists', () => {
    const files = [
      'src/services/auth.ts',
      'src/services/user.ts',
    ];
    vol.fromJSON({
      '/project/src/services/auth.ts': '',
      '/project/src/services/user.ts': '',
    });

    const result = detectModules(files, '/project', 'package');
    // Package strategy should produce 0 modules for non-monorepo
    // Then resolveConflicts still returns empty → modules from architecture fallback in keyword/conflict steps
    expect(result.modules.length).toBe(0);
  });

  it('tolerates a malformed packages shape without crashing detection', () => {
    const files = [
      'packages/web/src/index.ts',
      'packages/web/src/App.tsx',
    ];
    vol.fromJSON({
      // A non-string element in `packages` must not throw a TypeError that
      // bubbles up and fails ALL detection.
      '/monorepo/pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n  - foo: bar\n',
      '/monorepo/packages/web/src/index.ts': '',
      '/monorepo/packages/web/src/App.tsx': '',
    });

    expect(() => detectModules(files, '/monorepo', 'package')).not.toThrow();
    const result = detectModules(files, '/monorepo', 'package');
    expect(result.modules.map((m) => m.name)).toContain('web');
  });
});

describe('detectModules — auto strategy', () => {
  it('should prefer package strategy when monorepo detected', () => {
    const files = [
      'packages/web/src/index.ts',
      'packages/web/src/App.tsx',
      'packages/api/src/index.ts',
      'packages/api/src/server.ts',
    ];
    vol.fromJSON({
      '/monorepo/pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
      '/monorepo/packages/web/src/index.ts': '',
      '/monorepo/packages/web/src/App.tsx': '',
      '/monorepo/packages/api/src/index.ts': '',
      '/monorepo/packages/api/src/server.ts': '',
    });

    const result = detectModules(files, '/monorepo', 'auto');
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('web');
    expect(moduleNames).toContain('api');
  });

  it('should fallback to domain when no monorepo', () => {
    const files = [
      'src/features/auth/Login.tsx',
      'src/features/auth/Register.tsx',
      'src/features/shop/Products.tsx',
      'src/features/shop/Cart.tsx',
    ];
    vol.fromJSON({
      '/project/src/features/auth/Login.tsx': '',
      '/project/src/features/auth/Register.tsx': '',
      '/project/src/features/shop/Products.tsx': '',
      '/project/src/features/shop/Cart.tsx': '',
    });

    const result = detectModules(files, '/project', 'auto');
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('auth');
    expect(moduleNames).toContain('shop');
  });

  it('should fallback to architecture when no domain', () => {
    const files = [
      'src/services/auth.ts',
      'src/services/user.ts',
      'src/lib/config.ts',
      'src/lib/utils.ts',
    ];
    vol.fromJSON({
      '/project/src/services/auth.ts': '',
      '/project/src/services/user.ts': '',
      '/project/src/lib/config.ts': '',
      '/project/src/lib/utils.ts': '',
    });

    const result = detectModules(files, '/project', 'auto');
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('services');
    expect(moduleNames).toContain('lib');
  });

  it('should default to auto when strategy not specified', () => {
    const files = [
      'src/services/auth.ts',
      'src/services/user.ts',
    ];
    vol.fromJSON({
      '/project/src/services/auth.ts': '',
      '/project/src/services/user.ts': '',
    });

    // No strategy parameter = defaults to 'auto'. With no monorepo and no
    // domain grouping, auto falls all the way through to architecture, which
    // groups the two src/services files into one 'services' module.
    const result = detectModules(files, '/project');
    expect(result.modules.map((m) => m.name)).toEqual(['services']);
  });
});

describe('detectModules — existing module-map default fields (L108, L112-113)', () => {
  it('defaults description to "" and relationships to empty arrays when omitted', () => {
    const files = ['src/index.ts'];
    vol.fromJSON({
      // The module entry intentionally omits `description` and `relationships`
      // so the `?? ''` / `?? []` fallbacks are exercised.
      '/project/prospec/ai-knowledge/module-map.yaml': `
modules:
  - name: bare
    paths:
      - src/bare/**
    keywords:
      - bare
`,
      '/project/src/index.ts': '',
    });

    const result = detectModules(files, '/project');
    const bare = result.modules[0];
    expect(bare?.name).toBe('bare');
    expect(bare?.description).toBe('');
    expect(bare?.relationships.depends_on).toEqual([]);
    expect(bare?.relationships.used_by).toEqual([]);
  });
});

describe('loadExistingModuleMap — absolute knowledge base path (L199 cond-expr#0)', () => {
  it('honors an absolute knowledgeBasePath instead of joining against cwd', () => {
    const files = ['src/index.ts'];
    vol.fromJSON({
      // The map lives at an ABSOLUTE location unrelated to cwd; the absolute
      // branch of the ternary must resolve it directly.
      '/abs/knowledge/module-map.yaml': `
modules:
  - name: absmod
    description: Absolute module
    paths:
      - src/abs/**
    keywords:
      - abs
    relationships:
      depends_on: []
      used_by: []
`,
      '/project/src/index.ts': '',
    });

    const result = detectModules(files, '/project', 'auto', '/abs/knowledge');
    expect(result.modules[0]?.name).toBe('absmod');
  });

  it('falls through to detection when the absolute map path does not exist', () => {
    const files = ['src/services/a.ts', 'src/services/b.ts'];
    vol.fromJSON({
      '/project/src/services/a.ts': '',
      '/project/src/services/b.ts': '',
    });

    // Absolute path is honored (cond-expr#0) but no file there → null → detect.
    const result = detectModules(files, '/project', 'architecture', '/nowhere/knowledge');
    expect(result.modules.map((m) => m.name)).toContain('services');
  });
});

describe('normalizeDomainName — separated suffix branch (L239 if#0)', () => {
  it('strips a hyphen/underscore-separated layer suffix from the domain name', () => {
    const files = [
      'src/services/order-service/create.ts',
      'src/services/order-service/cancel.ts',
      'src/controllers/billing_controller/handler.ts',
      'src/controllers/billing_controller/router.ts',
    ];
    vol.fromJSON({
      '/project/src/services/order-service/create.ts': '',
      '/project/src/services/order-service/cancel.ts': '',
      '/project/src/controllers/billing_controller/handler.ts': '',
      '/project/src/controllers/billing_controller/router.ts': '',
    });

    const result = detectModules(files, '/project', 'domain');
    const names = result.modules.map((m) => m.name);
    // 'order-service' → 'order' (hyphen-separated), 'billing_controller' →
    // 'billing' (underscore-separated) via the SEPARATED regex branch.
    expect(names).toContain('order');
    expect(names).toContain('billing');
    expect(names).not.toContain('order-service');
    expect(names).not.toContain('billing_controller');
  });
});

describe('detectByDomain — too-short normalized name skipped (L283 if#0)', () => {
  it('drops a domain whose normalized name is shorter than 2 chars', () => {
    const files = [
      'src/features/a/one.ts',
      'src/features/a/two.ts',
      'src/features/auth/Login.tsx',
      'src/features/auth/Register.tsx',
    ];
    vol.fromJSON({
      '/project/src/features/a/one.ts': '',
      '/project/src/features/a/two.ts': '',
      '/project/src/features/auth/Login.tsx': '',
      '/project/src/features/auth/Register.tsx': '',
    });

    const result = detectModules(files, '/project', 'domain');
    const names = result.modules.map((m) => m.name);
    // Domain 'a' has length 1 (< 2) and is skipped entirely; 'auth' survives.
    expect(names).not.toContain('a');
    expect(names).toContain('auth');
  });
});

describe('detectByPackage — workspace pattern edge cases', () => {
  it('skips negation workspace patterns (L346 if#0)', () => {
    const files = [
      'packages/web/src/index.ts',
      'packages/web/src/App.tsx',
      'packages/internal/src/secret.ts',
      'packages/internal/src/util.ts',
    ];
    vol.fromJSON({
      // Negation pattern must be ignored (not applied as an exclusion, and not
      // treated as a base dir); only the positive 'packages/*' matters.
      '/monorepo/pnpm-workspace.yaml':
        'packages:\n  - "packages/*"\n  - "!packages/internal"\n',
      '/monorepo/packages/web/src/index.ts': '',
      '/monorepo/packages/web/src/App.tsx': '',
      '/monorepo/packages/internal/src/secret.ts': '',
      '/monorepo/packages/internal/src/util.ts': '',
    });

    const result = detectModules(files, '/monorepo', 'package');
    const names = result.modules.map((m) => m.name);
    // The '!' pattern is skipped; 'packages/*' still picks up both dirs because
    // the heuristic does not apply negation as an exclusion.
    expect(names).toContain('web');
    expect(names).toContain('internal');
  });

  it('ignores a file that is exactly the base dir with a trailing slash (L353 if#1)', () => {
    const files = [
      'packages/', // pathological: equals base + '/', slice → '' → parts[0] falsy
      'packages/web/src/index.ts',
      'packages/web/src/App.tsx',
    ];
    vol.fromJSON({
      '/monorepo/pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
      '/monorepo/packages/web/src/index.ts': '',
      '/monorepo/packages/web/src/App.tsx': '',
    });

    const result = detectModules(files, '/monorepo', 'package');
    const names = result.modules.map((m) => m.name);
    // 'packages/' yields no package dir (parts[0] is '' → skipped); only 'web'.
    expect(names).toEqual(['web']);
  });

  it('drops a workspace package that has fewer than 2 files (L377 if#1)', () => {
    const files = [
      'packages/web/src/index.ts',
      'packages/web/src/App.tsx',
      'packages/lonely/src/only.ts',
    ];
    vol.fromJSON({
      '/monorepo/pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
      '/monorepo/packages/web/src/index.ts': '',
      '/monorepo/packages/web/src/App.tsx': '',
      '/monorepo/packages/lonely/src/only.ts': '',
    });

    const result = detectModules(files, '/monorepo', 'package');
    const names = result.modules.map((m) => m.name);
    // 'lonely' has a single file → below the 2-file threshold → not a module.
    expect(names).toContain('web');
    expect(names).not.toContain('lonely');
  });
});

describe('detectWorkspacePackages — malformed/object workspace shapes', () => {
  it('treats a non-array pnpm `packages` value as no packages (L395 cond-expr#1)', () => {
    const files = [
      'packages/web/src/index.ts',
      'packages/web/src/App.tsx',
    ];
    vol.fromJSON({
      // `packages` is a scalar string, not a sequence → toStringArray → [].
      // detectByPackage then falls back to the packages/ directory heuristic.
      '/monorepo/pnpm-workspace.yaml': 'packages: not-a-list\n',
      '/monorepo/packages/web/src/index.ts': '',
      '/monorepo/packages/web/src/App.tsx': '',
    });

    const result = detectModules(files, '/monorepo', 'package');
    // No workspace patterns extracted → fallback to packages/ dir scan → 'web'.
    expect(result.modules.map((m) => m.name)).toContain('web');
  });

  it('reads workspaces from the object form { packages: [...] } (L416/L417)', () => {
    const files = [
      'libs/web/src/index.ts',
      'libs/web/src/App.tsx',
      'libs/api/src/index.ts',
      'libs/api/src/server.ts',
    ];
    vol.fromJSON({
      // Yarn/npm object form of workspaces. The 'packages' key is read; the
      // 'libs/*' glob (outside packages/apps) only resolves via the config path.
      '/monorepo/package.json': JSON.stringify({
        workspaces: { packages: ['libs/*'], nohoist: ['**/foo'] },
      }),
      '/monorepo/libs/web/src/index.ts': '',
      '/monorepo/libs/web/src/App.tsx': '',
      '/monorepo/libs/api/src/index.ts': '',
      '/monorepo/libs/api/src/server.ts': '',
    });

    const result = detectModules(files, '/monorepo', 'package');
    const names = result.modules.map((m) => m.name);
    expect(names).toContain('web');
    expect(names).toContain('api');
  });

  it('returns no packages when workspaces object lacks a `packages` key (L416 if#1)', () => {
    const files = [
      'src/services/a.ts',
      'src/services/b.ts',
    ];
    vol.fromJSON({
      // Object workspaces WITHOUT 'packages' → the `'packages' in ws` guard is
      // false → no patterns → no packages/apps dirs → package strategy empty.
      '/project/package.json': JSON.stringify({
        workspaces: { nohoist: ['**/foo'] },
      }),
      '/project/src/services/a.ts': '',
      '/project/src/services/b.ts': '',
    });

    const result = detectModules(files, '/project', 'package');
    expect(result.modules).toEqual([]);
  });
});

describe('detectRelationships — comment stripping and bare-import segment match', () => {
  it('blanks a block comment so a commented-out import is ignored (L576)', () => {
    const files = [
      'src/web/page.ts',
      'src/web/view.ts',
      'src/api/handler.ts',
      'src/api/route.ts',
      'src/shared/util.ts',
      'src/shared/const.ts',
    ];
    vol.fromJSON({
      // The ONLY reference to '../api/handler' is inside a /* ... */ block;
      // stripComments must blank it so no edge to 'api' forms. The real import
      // of '../shared/util' (outside the comment) must still register.
      '/project/src/web/page.ts':
        "/* import { old } from '../api/handler.js'; */\n" +
        "import { u } from '../shared/util.js';\n",
      '/project/src/web/view.ts': '',
      '/project/src/api/handler.ts': '',
      '/project/src/api/route.ts': '',
      '/project/src/shared/util.ts': '',
      '/project/src/shared/const.ts': '',
    });

    const result = detectModules(files, '/project', 'architecture');
    const web = result.modules.find((m) => m.name === 'web');
    expect(web?.relationships.depends_on).toContain('shared');
    expect(web?.relationships.depends_on).not.toContain('api');
  });

  it('matches a bare import whose path segment equals a module name (L658 binary-expr#1)', () => {
    const files = [
      'src/web/page.ts',
      'src/web/view.ts',
      'src/shared/util.ts',
      'src/shared/const.ts',
    ];
    vol.fromJSON({
      // A BARE (package) specifier whose internal path segment 'shared' exactly
      // equals the other module's name → segment-anchored bare-import match.
      '/project/src/web/page.ts': "import x from '@myorg/shared';\n",
      '/project/src/web/view.ts': '',
      '/project/src/shared/util.ts': '',
      '/project/src/shared/const.ts': '',
    });

    const result = detectModules(files, '/project', 'architecture');
    const web = result.modules.find((m) => m.name === 'web');
    const shared = result.modules.find((m) => m.name === 'shared');
    expect(web?.relationships.depends_on).toContain('shared');
    expect(shared?.relationships.used_by).toContain('web');
  });
});

describe('buildModuleMap', () => {
  it('maps a DetectionResult into the canonical module-map shape', () => {
    const detection = {
      architecture: 'pragmatic',
      entryPoints: ['src/index.ts'],
      modules: [
        {
          name: 'services',
          description: 'Business logic services',
          paths: ['src/services/**'],
          keywords: ['services', 'auth'],
          relationships: { depends_on: ['lib'], used_by: ['cli'] },
        },
      ],
    };

    const map = buildModuleMap(detection);
    expect(map.modules).toHaveLength(1);
    const m = map.modules[0]!;
    expect(m.name).toBe('services');
    expect(m.description).toBe('Business logic services');
    expect(m.paths).toEqual(['src/services/**']);
    expect(m.keywords).toEqual(['services', 'auth']);
    expect(m.relationships).toEqual({ depends_on: ['lib'], used_by: ['cli'] });
    // architecture/entryPoints are not part of the persisted map shape
    expect(map).not.toHaveProperty('architecture');
    expect(map).not.toHaveProperty('entryPoints');
  });
});

describe('detectModules — source-file gating (REQ-LIB-038)', () => {
  it('drops doc/asset/cache dirs and keeps only source-bearing dirs (top-level-flat layout)', () => {
    // The shape issue #92 reports: a brownfield project whose real code sits in
    // src/<pkg> + tests, surrounded by several top-level dirs carrying no code.
    const files = [
      'cache/data.json',
      'cache/index.json',
      'docs/format.md',
      'docs/mapping.md',
      'docs/workflow.md',
      'samples/one.json',
      'samples/two.json',
      'scripts/build.sh',
      'scripts/release.sh',
      'spec/one.pdf',
      'spec/two.pdf',
      'src/pkg/__init__.py',
      'src/pkg/parser.py',
      'src/pkg/writer.py',
      'tests/test_parser.py',
      'tests/test_writer.py',
    ];
    vol.fromJSON(Object.fromEntries(files.map((f) => [`/flat/${f}`, ''])));

    const result = detectModules(files, '/flat', 'architecture');
    const moduleNames = result.modules.map((m) => m.name);
    // Pin the whole positive set (order-independent): only source-bearing dirs.
    expect([...moduleNames].sort()).toEqual(['pkg', 'scripts', 'tests']);
    // Negative assertions per noise dir — each is 2+ files and would qualify on
    // the unfiltered list, so dropping the filter turns every one of these red.
    for (const noise of ['docs', 'samples', 'spec', 'cache']) {
      expect(moduleNames).not.toContain(noise);
    }
    // paths keep the pre-change directory-glob shape (only the input narrowed).
    expect(result.modules.find((m) => m.name === 'pkg')?.paths).toEqual(['src/pkg/**']);
    expect(result.modules.find((m) => m.name === 'tests')?.paths).toEqual(['tests/**']);
  });

  it('counts source files only for the admission threshold, ignoring doc volume', () => {
    const files = [
      // 3 source files buried under 5 docs — still a module.
      'dll/bundle.py',
      'dll/check.py',
      'dll/build.py',
      'dll/README.md',
      'dll/README.nuget.md',
      'dll/NOTES.md',
      'dll/CHANGELOG.md',
      'dll/LICENSE.md',
      // 1 source file plus docs — below the 2-file threshold, so not a module.
      'tools/convert.py',
      'tools/usage.md',
      'tools/examples.md',
    ];
    vol.fromJSON(Object.fromEntries(files.map((f) => [`/mixed/${f}`, ''])));

    const result = detectModules(files, '/mixed', 'architecture');
    const moduleNames = result.modules.map((m) => m.name);
    expect([...moduleNames].sort()).toEqual(['dll']);
    // 3 files pre-filter, 1 post-filter: the threshold must see the subset.
    expect(moduleNames).not.toContain('tools');
  });

  it('matches extensions case-insensitively and treats extensionless files as non-source', () => {
    const files = [
      'native/decoder.H',
      'native/decoder.c',
      // Uppercase NON-source extensions must still be denied — this is what the
      // case-folding is load-bearing for: without it `.MD`/`.PNG` miss the
      // non-source set and 'handbook' becomes a module.
      'handbook/INTRO.MD',
      'handbook/COVER.PNG',
      // Extensionless executables/build files carry no recognizable extension.
      'bin/olfconvert',
      'bin/olfdump',
    ];
    vol.fromJSON(Object.fromEntries(files.map((f) => [`/cfam/${f}`, ''])));

    const result = detectModules(files, '/cfam', 'architecture');
    const moduleNames = result.modules.map((m) => m.name);
    expect([...moduleNames].sort()).toEqual(['native']);
    expect(moduleNames).not.toContain('handbook');
    expect(moduleNames).not.toContain('bin');
  });

  it('treats template and style extensions as source', () => {
    // Excluding these would erase prospec's own src/templates/** (66 .hbs) and
    // every frontend project's component/style dirs. The two doc-only files are
    // load-bearing: without them, denying template/style extensions leaves NO
    // module, the fallback restores the unfiltered list, and these three dirs come
    // back anyway — making the assertion vacuous for exactly the regression it
    // guards. With them the fallback still fires, but it now also admits 'docs',
    // so the negative assertion below is what turns the mutation red.
    const files = [
      'templates/skill.hbs',
      'templates/readme.hbs',
      'ui/Button.vue',
      'ui/Input.vue',
      'styles/main.scss',
      'styles/reset.css',
      'docs/guide.md',
      'docs/reference.md',
    ];
    vol.fromJSON(Object.fromEntries(files.map((f) => [`/web/${f}`, ''])));

    const result = detectModules(files, '/web', 'architecture');
    expect([...result.modules.map((m) => m.name)].sort()).toEqual([
      'styles',
      'templates',
      'ui',
    ]);
    expect(result.modules.map((m) => m.name)).not.toContain('docs');
  });

  it('keeps an unrecognized language’s dirs — an unknown extension counts as source', () => {
    // The polarity guard. Under an allowlist of known source extensions, a
    // language nobody listed loses every code dir while an incidental script dir
    // survives — here detection would collapse to ['docs'], the exact inverse of
    // this change's purpose. Denying only non-code families keeps .f90 as source.
    const files = [
      'src/solver.f90',
      'src/mesh.f90',
      'src/io.f90',
      'kernels/advect.f90',
      'kernels/diffuse.f90',
      'docs/build.sh',
      'docs/publish.sh',
      'docs/manual.md',
    ];
    vol.fromJSON(Object.fromEntries(files.map((f) => [`/fortran/${f}`, ''])));

    const result = detectModules(files, '/fortran', 'architecture');
    const moduleNames = result.modules.map((m) => m.name);
    // 'docs' qualifying on its two shell scripts is pre-existing imprecision, not
    // the erasure this pins against — what must never happen is 'src'/'kernels'
    // disappearing while 'docs' stays.
    expect([...moduleNames].sort()).toEqual(['docs', 'kernels', 'src']);
  });

  it('falls back when narrowing finds no module, not merely when the subset is empty', () => {
    // A Kubernetes-manifest repo whose only source file is one CI script. The
    // subset is non-empty (`hack/verify.sh`) yet no directory reaches the 2-file
    // threshold, so an emptiness-keyed fallback would never fire and detection
    // would return ZERO modules — and `knowledge init` writes module-map.yaml only
    // when absent, making that empty map permanent.
    const files = [
      'manifests/deployment.yaml',
      'manifests/service.yaml',
      'manifests/ingress.yaml',
      'overlays/dev/kustomization.yaml',
      'overlays/prod/kustomization.yaml',
      'hack/verify.sh',
      'README.md',
    ];
    vol.fromJSON(Object.fromEntries(files.map((f) => [`/k8s/${f}`, ''])));

    const result = detectModules(files, '/k8s', 'architecture');
    const moduleNames = result.modules.map((m) => m.name);
    expect([...moduleNames].sort()).toEqual(['manifests', 'overlays']);
  });

  it('falls back to the unfiltered list when no file is recognized as source', () => {
    // A docs-as-code project: filtering to an empty subset must degrade to the
    // pre-change behavior, never to an empty module map.
    const files = ['config', 'docs/guide.md', 'docs/reference.md', 'notes.txt'];
    vol.fromJSON(Object.fromEntries(files.map((f) => [`/docsonly/${f}`, ''])));

    const result = detectModules(files, '/docsonly', 'architecture');
    const moduleNames = result.modules.map((m) => m.name);
    expect(result.modules.length).toBeGreaterThan(0);
    expect([...moduleNames].sort()).toEqual(['docs']);
    // Root files stay out on the fallback path too, where the scope is the
    // unfiltered list (see the coverage note on the root-skip test above: the
    // 2-file threshold, not the guard, is what excludes them now).
    expect(moduleNames).not.toContain('config');
  });

  it('narrows the domain strategy to source files too', () => {
    const files = [
      'features/checkout/api.ts',
      'features/checkout/index.ts',
      'features/onboarding/guide.md',
      'features/onboarding/spec.md',
    ];
    vol.fromJSON(Object.fromEntries(files.map((f) => [`/domain/${f}`, ''])));

    const result = detectModules(files, '/domain', 'domain');
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('checkout');
    expect(moduleNames).not.toContain('onboarding');
  });

  it('narrows the package strategy to source files too', () => {
    const files = [
      'packages/core/src/index.ts',
      'packages/core/src/util.ts',
      'packages/docs-site/README.md',
      'packages/docs-site/CHANGELOG.md',
    ];
    vol.fromJSON(Object.fromEntries(files.map((f) => [`/mono/${f}`, ''])));

    const result = detectModules(files, '/mono', 'package');
    const moduleNames = result.modules.map((m) => m.name);
    expect([...moduleNames].sort()).toEqual(['core']);
    expect(moduleNames).not.toContain('docs-site');
  });

  it('reports architecture from the NARROWED scope, so a docs-only layer stops counting', () => {
    // REQ-LIB-038: architecture-pattern recognition reads the source subset too.
    // An mvc layout whose views/ and controllers/ hold only prose drops below the
    // 2-indicator bar and must report `unknown` — over the unfiltered list it
    // would still report `mvc`.
    const files = [
      'models/user.ts',
      'models/order.ts',
      'views/home.md',
      'views/about.md',
      'controllers/main.md',
      'controllers/admin.md',
    ];
    vol.fromJSON(Object.fromEntries(files.map((f) => [`/mvc/${f}`, ''])));

    expect(detectModules(files, '/mvc', 'architecture').architecture).toBe('unknown');
  });

  it('never filters a curated module-map — a doc-only module survives verbatim', () => {
    // Guards the early-return path: the filter narrows detection INPUT only. A
    // later pass that also filtered the curated result would drop this module.
    const files = ['docs/guide.md', 'docs/reference.md', 'src/lib/config.ts'];
    vol.fromJSON({
      '/curated/prospec/ai-knowledge/module-map.yaml': `
modules:
  - name: documentation
    description: Handbook and specs
    paths:
      - docs/**
    keywords:
      - docs
    relationships:
      depends_on: []
      used_by: []
`,
      ...Object.fromEntries(files.map((f) => [`/curated/${f}`, ''])),
    });

    const result = detectModules(files, '/curated');
    expect(result.modules.map((m) => m.name)).toEqual(['documentation']);
    expect(result.modules[0]?.paths).toEqual(['docs/**']);
  });

  it('leaves a src-centric project unchanged', () => {
    const files = [
      'src/cli/index.ts',
      'src/cli/parse-options.ts',
      'src/lib/config.ts',
      'src/lib/fs-utils.ts',
      'src/services/init.service.ts',
      'src/services/knowledge-init.service.ts',
      'src/types/config.ts',
      'src/types/errors.ts',
      'tests/unit/config.test.ts',
      'tests/unit/fs-utils.test.ts',
    ];
    vol.fromJSON(Object.fromEntries(files.map((f) => [`/srccentric/${f}`, ''])));

    const result = detectModules(files, '/srccentric', 'architecture');
    expect([...result.modules.map((m) => m.name)].sort()).toEqual([
      'cli',
      'lib',
      'services',
      'tests',
      'types',
    ]);
    expect(result.modules.find((m) => m.name === 'cli')?.paths).toEqual(['src/cli/**']);
    expect(result.modules.find((m) => m.name === 'tests')?.paths).toEqual(['tests/**']);
    expect(result.architecture).toBe('pragmatic');
  });
});

describe('detectModules — catch block wraps unexpected errors (L145/L148/L149)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('node:path');
    vi.restoreAllMocks();
  });

  // The thrown value is computed AFTER resetModules so a ModuleDetectionError
  // instance is built from the SAME freshly-evaluated errors module that the
  // re-imported detector checks `instanceof` against (identity must match).
  async function loadWithPathThrow(
    makeThrow: (errs: typeof import('../../../src/types/errors.js')) => unknown,
  ) {
    vi.resetModules();
    const errs = await import('../../../src/types/errors.js');
    const throwValue = makeThrow(errs);
    vi.doMock('node:path', async () => {
      const real = await vi.importActual<typeof import('node:path')>('node:path');
      return {
        ...real,
        default: real,
        join: (...args: string[]) => {
          // Throw only while resolving the module-map path (sentinel base),
          // which sits OUTSIDE loadExistingModuleMap's inner try → propagates.
          if (args.includes('__BOOM__')) throw throwValue;
          return real.join(...args);
        },
      };
    });
    const mod = await import('../../../src/lib/module-detector.js');
    return {
      detectModules: mod.detectModules,
      ModuleDetectionError: errs.ModuleDetectionError,
      throwValue,
    };
  }

  it('wraps a thrown plain Error as ModuleDetectionError preserving message+cause (L149 cond-expr#0)', async () => {
    const { detectModules: detect, ModuleDetectionError: MDE, throwValue: boom } =
      await loadWithPathThrow(() => new Error('join exploded'));

    let caught: unknown;
    try {
      detect(['src/a/x.ts', 'src/a/y.ts'], '/p', 'auto', '__BOOM__');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MDE);
    expect((caught as Error).message).toContain('join exploded');
    expect((caught as { cause?: unknown }).cause).toBe(boom);
    expect((caught as { code: string }).code).toBe('MODULE_DETECTION_ERROR');
  });

  it('stringifies a thrown non-Error value (L149 cond-expr#1)', async () => {
    const { detectModules: detect, ModuleDetectionError: MDE } =
      await loadWithPathThrow(() => 'plain string failure');

    let caught: unknown;
    try {
      detect(['src/a/x.ts', 'src/a/y.ts'], '/p', 'auto', '__BOOM__');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MDE);
    expect((caught as Error).message).toContain('plain string failure');
  });

  it('re-throws an existing ModuleDetectionError unchanged (L145 if#0)', async () => {
    const { detectModules: detect, throwValue: original } = await loadWithPathThrow(
      (errs) => new errs.ModuleDetectionError('already wrapped'),
    );

    let caught: unknown;
    try {
      detect(['src/a/x.ts', 'src/a/y.ts'], '/p', 'auto', '__BOOM__');
    } catch (e) {
      caught = e;
    }
    // Same identity → not re-wrapped (the `instanceof ... throw err` branch).
    expect(caught).toBe(original);
  });
});

describe('collectNonSourceDirectories (REQ-KNOW-038)', () => {
  it('lists a directory whose files are all non-source, with count and extensions', () => {
    const result = collectNonSourceDirectories([
      'manifests/deploy.yaml',
      'manifests/service.yml',
      'src/index.ts',
      'src/util.ts',
    ]);
    expect(result.directories).toEqual([
      {
        path: 'manifests',
        pathDisplay: '`manifests/`',
        fileCount: 2,
        extensions: ['.yaml', '.yml'],
        extensionDisplays: ['`.yaml`', '`.yml`'],
        extensionsOmitted: 0,
      },
    ]);
    expect(result.omitted).toBe(0);
  });

  it('omits a directory holding at least one source file, however many non-source files it also has', () => {
    const result = collectNonSourceDirectories([
      'docs/a.md',
      'docs/b.md',
      'docs/c.pdf',
      'docs/build.ts',
    ]);
    expect(result.directories).toEqual([]);
  });

  it('folds a nested non-source subtree into its topmost non-source ancestor', () => {
    const result = collectNonSourceDirectories([
      'book/chapters/one.tex',
      'book/chapters/deep/two.tex',
      'book/preface.md',
      'src/a.ts',
      'src/b.ts',
    ]);
    // `book` qualifies, so `book/chapters` and `book/chapters/deep` fold into it.
    expect(result.directories.map((d) => d.path)).toEqual(['book']);
    expect(result.directories[0]?.fileCount).toBe(3);
    // Volume-ranked: two `.tex` outrank one `.md`.
    expect(result.directories[0]?.extensions).toEqual(['.tex', '.md']);
  });

  it('lists a non-source directory nested under a source-bearing parent', () => {
    const result = collectNonSourceDirectories([
      'src/index.ts',
      'src/util.ts',
      'src/assets/logo.png',
      'src/assets/icon.svg',
    ]);
    // `src` holds source, so it does not qualify — `src/assets` is the topmost that does.
    expect(result.directories.map((d) => d.path)).toEqual(['src/assets']);
    expect(result.directories[0]?.extensions).toEqual(['.png', '.svg']);
  });

  it('orders equal-volume extensions by codepoint, not locale', () => {
    const result = collectNonSourceDirectories([
      'gamma/z.yaml',
      'gamma/a.md',
      'gamma/_raw.png',
      'src/a.ts',
      'src/b.ts',
    ]);
    // One file each, so the tie-break IS the order. Codepoint and ICU collation
    // disagree on these three, so swapping the comparator flips the expectation.
    const gamma = result.directories.find((d) => d.path === 'gamma');
    expect(gamma?.extensions).toEqual(['.md', '.png', '.yaml']);
  });

  it('reports extensionless files as `(no extension)`, sorted ahead of dotted extensions', () => {
    const result = collectNonSourceDirectories([
      'bin/deploy',
      'bin/notes.md',
      'src/a.ts',
      'src/b.ts',
    ]);
    expect(result.directories[0]?.extensions).toEqual(['(no extension)', '.md']);
  });

  it('labels a trailing-dot filename the same way the classifier judges it', () => {
    // `path.extname('weird.')` is '.', but `isSourceFile` strips the dot before
    // testing emptiness — so the file is extensionless to the gate. The reporter
    // must agree, or one feature describes the same file two ways.
    expect(isSourceFile('docs/weird.')).toBe(false);
    const result = collectNonSourceDirectories(['docs/weird.', 'docs/a.md']);
    expect(result.directories[0]?.extensions).toEqual(['(no extension)', '.md']);
    expect(result.directories[0]?.extensions).not.toContain('.');
  });

  it('ignores root-level files — they belong to no directory', () => {
    const result = collectNonSourceDirectories(['README.md', 'LICENSE', 'src/a.ts', 'src/b.ts']);
    expect(result.directories).toEqual([]);
  });

  it('returns an empty result for an empty file list', () => {
    expect(collectNonSourceDirectories([])).toEqual({ directories: [], omitted: 0 });
  });

  it('caps the directory list and discloses how many were omitted', () => {
    const files = Array.from({ length: 53 }, (_, i) =>
      `d${String(i).padStart(3, '0')}/note.md`,
    );
    const result = collectNonSourceDirectories(files);
    expect(result.directories).toHaveLength(50);
    expect(result.omitted).toBe(3);
    // The kept 50 are the first in codepoint order, not an arbitrary slice.
    expect(result.directories[0]?.path).toBe('d000');
    expect(result.directories.at(-1)?.path).toBe('d049');
  });

  it('caps extensions per entry and discloses the remainder', () => {
    const result = collectNonSourceDirectories([
      'assets/a.png', 'assets/b.jpg', 'assets/c.gif', 'assets/d.svg',
      'assets/e.webp', 'assets/f.bmp', 'assets/g.ico',
      'src/a.ts', 'src/b.ts',
    ]);
    const assets = result.directories[0];
    expect(assets?.extensions).toEqual(['.bmp', '.gif', '.ico', '.jpg', '.png']);
    expect(assets?.extensionsOmitted).toBe(2);
    expect(assets?.fileCount).toBe(7);
  });

  it('clamps a zero or negative cap to 1 — an empty list with a non-zero omitted count would render the opposite claim', () => {
    const zero = collectNonSourceDirectories(['a/x.md', 'b/y.md'], { maxDirectories: 0 });
    expect(zero.directories.map((d) => d.path)).toEqual(['a']);
    expect(zero.omitted).toBe(1);

    const negative = collectNonSourceDirectories(['a/x.md', 'b/y.md', 'c/z.md'], {
      maxDirectories: -1,
    });
    // Never drops an entry without counting it: kept + omitted === qualifying.
    expect(negative.directories.length + negative.omitted).toBe(3);

    const zeroExt = collectNonSourceDirectories(['a/x.md', 'a/y.png'], { maxExtensions: 0 });
    expect(zeroExt.directories[0]?.extensions).toEqual(['.md']);
    expect(zeroExt.directories[0]?.extensionsOmitted).toBe(1);
  });

  it('honors explicit caps over the defaults', () => {
    const result = collectNonSourceDirectories(
      ['a/x.md', 'b/y.md', 'c/z.md'],
      { maxDirectories: 2, maxExtensions: 1 },
    );
    expect(result.directories.map((d) => d.path)).toEqual(['a', 'b']);
    expect(result.omitted).toBe(1);
  });
});

describe('isSourceFile (REQ-LIB-038 exported single source)', () => {
  it('is exported so raw-scan reuses this classification instead of re-deriving one', () => {
    expect(typeof isSourceFile).toBe('function');
  });

  it('reads only the LAST extension, so a denylist entry matches terminal segments only', () => {
    // `path.extname('jquery.min.js')` is `.js`, so the `min` entry cannot reach
    // it — but `path.extname('app.min')` IS `.min`, so the entry is live and the
    // minified build output it names stays denied. Removing it on a
    // "dead entry" reading would silently reclassify that output as source.
    expect(isSourceFile('vendor/jquery.min.js')).toBe(true);
    expect(isSourceFile('dist/app.min')).toBe(false);
    expect(isSourceFile('dist/APP.MIN')).toBe(false);
    expect(isSourceFile('vendor/app.js.map')).toBe(false);
  });

  it('matches the denylist case-insensitively and rejects extensionless files', () => {
    expect(isSourceFile('docs/READ.MD')).toBe(false);
    expect(isSourceFile('include/vec.H')).toBe(true);
    expect(isSourceFile('Makefile')).toBe(false);
  });
});

describe('detectModules — uniform 2-file threshold (REQ-LIB-038)', () => {
  it('drops a single-source-file directory whose name used to grant a bypass', () => {
    const files = ['src/utils/one.ts', 'src/core/a.ts', 'src/core/b.ts'];
    vol.fromJSON({
      '/project/src/utils/one.ts': '',
      '/project/src/core/a.ts': '',
      '/project/src/core/b.ts': '',
    });
    const names = detectModules(files, '/project', 'architecture').modules.map((m) => m.name);
    // `utils` is on no list any more — 1 source file is 1 source file.
    expect(names).not.toContain('utils');
    expect(names).toContain('core');
  });

  it('leaves a 2+ source-file directory detected with its glob unchanged', () => {
    const files = ['src/config/a.ts', 'src/config/b.ts', 'src/core/a.ts', 'src/core/b.ts'];
    vol.fromJSON({
      '/project/src/config/a.ts': '',
      '/project/src/config/b.ts': '',
      '/project/src/core/a.ts': '',
      '/project/src/core/b.ts': '',
    });
    const modules = detectModules(files, '/project', 'architecture').modules;
    expect(modules.find((m) => m.name === 'config')?.paths).toEqual(['src/config/**']);
  });

  it('falls back to the unfiltered list when removing the bypass takes the count to zero', () => {
    // Source subset is a single file, so no directory reaches the threshold.
    // Under the old name-based bypass `utils` was admitted here and the fallback
    // never fired; now it must, and `docs` — which exists only in the unfiltered
    // list — is the proof that it did.
    const files = ['utils/helper.ts', 'utils/README.md', 'docs/a.md', 'docs/b.md'];
    vol.fromJSON({
      '/project/utils/helper.ts': '',
      '/project/utils/README.md': '',
      '/project/docs/a.md': '',
      '/project/docs/b.md': '',
    });
    const names = detectModules(files, '/project', 'architecture').modules.map((m) => m.name);
    expect(names).toContain('utils');
    expect(names).toContain('docs');
  });
});

describe('collectNonSourceDirectories — the caps keep the signal (REQ-KNOW-038)', () => {
  it('ranks directories by file volume so a truncated list keeps the substantial ones', () => {
    // The monorepo shape that made codepoint truncation useless: 12 tiny asset
    // dirs sorting alphabetically before the one directory that IS the evidence.
    const files = [
      ...Array.from({ length: 12 }, (_, i) => [
        `apps/app${String(i).padStart(2, '0')}/src/index.ts`,
        `apps/app${String(i).padStart(2, '0')}/assets/logo.png`,
      ]).flat(),
      ...Array.from({ length: 9 }, (_, i) => `manifests/deploy${i}.yaml`),
    ];
    const result = collectNonSourceDirectories(files, { maxDirectories: 3 });
    // `manifests` (9 files) must survive a cap of 3 even though `apps/app00/assets`
    // sorts first alphabetically.
    expect(result.directories[0]?.path).toBe('manifests');
    expect(result.directories.map((d) => d.path)).toContain('manifests');
    expect(result.omitted).toBe(10);
  });

  it('ranks extensions by occurrence so the per-entry cap keeps the telling one', () => {
    // Android `res/`: `.xml` IS the signal (it is UI source), and it is the only
    // extension with more than one file — alphabetical truncation dropped it.
    const files = [
      'app/src/main/java/Main.java',
      'app/src/main/res/layout/activity_main.xml',
      'app/src/main/res/layout/fragment_list.xml',
      'app/src/main/res/layout/dialog.xml',
      'app/src/main/res/drawable/a.gif',
      'app/src/main/res/drawable/b.jpg',
      'app/src/main/res/drawable/d.png',
      'app/src/main/res/drawable/e.webp',
      'app/src/main/res/values/c.json',
    ];
    const res = collectNonSourceDirectories(files).directories
      .find((d) => d.path.endsWith('res'));
    expect(res?.extensions[0]).toBe('.xml');
    expect(res?.extensions).toContain('.xml');
    expect(res?.extensionsOmitted).toBe(1);
  });

  it('breaks volume ties by codepoint, not locale', () => {
    // Equal counts, so the tie-break is the whole ordering: codepoint puts '_'
    // (0x5F) and uppercase 'Z' (0x5A) before lowercase 'a'; ICU collation does not.
    const result = collectNonSourceDirectories([
      'alpha/b.md', 'Zeta/a.md', '_tools/c.md',
      'gamma/z.yaml', 'gamma/a.md', 'gamma/_raw.png',
      'src/a.ts', 'src/b.ts',
    ]);
    expect(result.directories.map((d) => d.path)).toEqual(['gamma', 'Zeta', '_tools', 'alpha']);
  });

  it('renders every path and extension as an escape-proof code span', () => {
    // A scanned directory name can contain a backtick; rendered raw it would
    // close its span and spill the rest as prose into an agent-read artifact.
    const result = collectNonSourceDirectories([
      'ok/a.md',
      'we`ird/b.md',
      'src/a.ts',
      'src/b.ts',
    ]);
    const plain = result.directories.find((d) => d.path === 'ok');
    const tricky = result.directories.find((d) => d.path === 'we`ird');
    expect(plain?.pathDisplay).toBe('`ok/`');
    expect(tricky?.pathDisplay).toBe('``we`ird/``');
    // The raw path stays available for programmatic consumers.
    expect(tricky?.path).toBe('we`ird');
    expect(plain?.extensionDisplays).toEqual(['`.md`']);

    // Extension labels go through the same helper for symmetry, but note that no
    // REACHABLE label needs widening: a backtick-bearing extension is not on the
    // denylist, so `isSourceFile` calls it source and its directory never
    // qualifies. `path.extname('x.we`ird')` really is '.we`ird' — it just cannot
    // arrive here. Asserting the relation is the most a test can pin.
    expect(plain?.extensionDisplays).toEqual(
      (plain?.extensions ?? []).map((e) => toInlineCodeSpan(e)),
    );
    expect(collectNonSourceDirectories(['weird/a.we`ird', 'weird/b.we`ird'])
      .directories).toEqual([]);
  });
});
