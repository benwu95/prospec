import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { detectModules } from '../../../src/lib/module-detector.js';

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
    expect(result.modules.length).toBeGreaterThan(0);
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).toContain('services');
    expect(moduleNames).toContain('lib');
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
      '/project/docs/ai-knowledge/module-map.yaml': `
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
      '/project/prospec/ai-knowledge/module-map.yaml': `
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
    // The legacy docs/ default would not find this file; the custom path must be honored.
    const result = detectModules(files, '/project', 'auto', 'prospec/ai-knowledge');
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

  it('should generate keywords for modules', () => {
    const files = [
      'src/services/auth.ts',
      'src/services/user.ts',
    ];
    vol.fromJSON({
      '/project/src/services/auth.ts': '',
      '/project/src/services/user.ts': '',
    });
    const result = detectModules(files, '/project');
    const services = result.modules.find((m) => m.name === 'services');
    expect(services?.keywords).toContain('services');
  });

  it('should skip root-level files from module detection', () => {
    const files = [
      'package.json',
      'tsconfig.json',
      'src/services/auth.ts',
      'src/services/user.ts',
    ];
    vol.fromJSON({
      '/project/package.json': '{}',
      '/project/tsconfig.json': '{}',
      '/project/src/services/auth.ts': '',
      '/project/src/services/user.ts': '',
    });
    const result = detectModules(files, '/project');
    const moduleNames = result.modules.map((m) => m.name);
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
    expect(result.modules.length).toBeGreaterThan(0);
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
    // Each domain has only 1 file, so domain detection produces nothing
    // Falls back to resolveConflicts with empty modules
    const moduleNames = result.modules.map((m) => m.name);
    expect(moduleNames).not.toContain('auth');
    expect(moduleNames).not.toContain('checkout');
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

    // No strategy parameter = defaults to 'auto'
    const result = detectModules(files, '/project');
    expect(result.modules.length).toBeGreaterThan(0);
  });
});
