import { z } from 'zod';
import { FixturePathSchema } from './protocol.js';
import { boundedProcess } from './process.js';

// Trusted controller code, shared verbatim by host and container capture. Never model-supplied.
// Bounded observation, not an OS security boundary against a concurrent native daemon.
export const NATIVE_FILES_SCRIPT = `
const fs = require('node:fs'), path = require('node:path');
const maximum = Number(process.argv[1]), files = Object.create(null), unavailable = [];
if (!Number.isSafeInteger(maximum) || maximum <= 0) throw Error('Invalid capture limit');
let bytes = 0;
function walk(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, {withFileTypes:true}).sort((a,b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.git') continue;
    const name = prefix + entry.name, file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) { unavailable.push(name); continue; }
    if (entry.isDirectory()) { walk(file, name + '/'); continue; }
    if (!entry.isFile() || bytes + fs.lstatSync(file).size > maximum) { unavailable.push(name); continue; }
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const info = fs.fstatSync(fd);
      if (!info.isFile() || bytes + info.size > maximum) { unavailable.push(name); continue; }
      const content = Buffer.alloc(info.size);
      let read = 0;
      while (read < content.length) { const n = fs.readSync(fd, content, read, content.length-read, read); if (!n) break; read += n; }
      bytes += read;
      files[name] = content.subarray(0,read).toString('base64');
    } finally { fs.closeSync(fd); }
  }
}
walk(process.cwd());
console.log(JSON.stringify({encoding:'base64', files, unavailable}));`;
const base64 = z.string().refine((value) => Buffer.from(value, 'base64').toString('base64') === value);
const captureSchema = z.strictObject({ encoding: z.literal('base64'),
  files: z.record(FixturePathSchema, base64), unavailable: z.array(FixturePathSchema) });
export const parseNativeFiles = (raw: string) => captureSchema.parse(JSON.parse(raw));

export async function captureNativeFiles(cwd: string, maxBytes = 10_000_000) {
  const result = await boundedProcess({ command: process.execPath, args: ['-e', NATIVE_FILES_SCRIPT, String(maxBytes)],
    cwd, input: '', timeoutMs: 30000, maxBytes: Math.ceil(maxBytes * 1.5) + 1_000_000 });
  if (result.exitCode !== 0) throw new Error('Native file capture failed');
  return parseNativeFiles(result.output);
}
