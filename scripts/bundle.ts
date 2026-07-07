import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';


import { bundleTemplates } from './bundle-templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const version = pkg.version;

// 1. Run templates bundle first
console.log('Bundling templates...');
bundleTemplates();


// 2. Build with esbuild
console.log('Bundling CLI with esbuild...');
await esbuild.build({
  entryPoints: [path.resolve(__dirname, '../src/cli/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.resolve(__dirname, '../dist/cli-bundle.js'),
  define: {
    'process.env.PROSPEC_VERSION': JSON.stringify(version),
  },
  banner: {
    js: `import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);`,
  },
});

console.log('Bundle completed successfully!');
