// registerHooks load counter — injected via `node --import` into a CLI child
// process so it tallies exactly the module graph that process pulls in. Prints
// one machine-readable line on exit; the parent (measure-startup-modules.ts /
// the startup-modules e2e guard) parses it. Kept as plain .mjs so it needs no
// transpile step under `--import`.
import module from 'node:module';

const loaded = new Set();
module.registerHooks({
  load(url, context, nextLoad) {
    loaded.add(url);
    return nextLoad(url, context);
  },
});

const HEAVY = {
  'mcp-sdk': '@modelcontextprotocol',
  inquirer: '@inquirer',
  'fast-xml-parser': 'fast-xml-parser',
  'smol-toml': 'smol-toml',
  handlebars: '/handlebars/',
};

process.on('exit', () => {
  let nodeModules = 0;
  let own = 0;
  const heavy = [];
  for (const url of loaded) {
    if (url.includes('/node_modules/')) nodeModules++;
    else own++;
  }
  for (const [name, needle] of Object.entries(HEAVY)) {
    if ([...loaded].some((u) => u.includes(needle))) heavy.push(name);
  }
  process.stderr.write(
    `PROSPEC_STARTUP ${JSON.stringify({ nodeModules, own, heavy: heavy.sort() })}\n`,
  );
});
