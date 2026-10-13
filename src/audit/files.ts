import { constants } from 'node:fs';
import { open, readdir, lstat, realpath } from 'node:fs/promises';
import { extname, join, basename } from 'node:path';
import { errorText } from './types.ts';

export const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const PRIVATE = /^(?:\.env(?:\..*)?|auth(?:\..*)?|credentials(?:\..*)?|secrets?(?:\..*)?)$/i;
export const isPrivate = (path: string): boolean => path.split(/[\\/]/).some(part => PRIVATE.test(part));

/** Defense in depth for task-relevant excerpts, not a guarantee of arbitrary secret detection. */
export function redact(text: string): string {
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[redacted private key]')
    .replace(/\b(?:sk-[\w-]{16,}|gh[pousr]_[\w]{20,}|pis_[0-9a-f]{64})\b/g, '[redacted credential]')
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)(?=[,;\s]|$)/gi, '$1[redacted]')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
}

export async function readExcerpt(path: string, maxBytes = 64_000): Promise<string> {
  if (isPrivate(path)) throw new Error('Private file excluded');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Not a regular resource file');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const buffer = Buffer.alloc(Math.min(info.size, maxBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}

export async function manifest(path: string): Promise<Record<string, unknown>> {
  const text = await readExcerpt(path);
  const value: unknown = JSON.parse(text);
  if (!record(value)) throw new Error('Manifest must be an object');
  return value;
}

export type Tree = Readonly<{ root: string; bytes: number; files: readonly string[]; warnings: readonly string[] }>;
export async function tree(path: string, signal: AbortSignal): Promise<Tree> {
  const root = await realpath(path);
  const files: string[] = [];
  const warnings: string[] = [];
  const count = { bytes: 0, entries: 0 };
  const visit = async (current: string): Promise<void> => {
    signal.throwIfAborted();
    if (++count.entries > 20_000) { if (!warnings.includes('Disk scan entry limit reached; size is partial')) warnings.push('Disk scan entry limit reached; size is partial'); return; }
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) { warnings.push(`Symlink not traversed: ${current}`); return; }
      if (info.isFile()) { count.bytes += info.size; files.push(current); return; }
      if (!info.isDirectory()) return;
      for (const name of (await readdir(current)).sort()) {
        if (name === 'node_modules' || name === '.git') continue;
        await visit(join(current, name));
        if (count.entries > 20_000) break;
      }
    } catch (error) {
      if (signal.aborted) throw error;
      warnings.push(`${current}: ${errorText(error)}`);
    }
  };
  await visit(root);
  return { root, bytes: count.bytes, files, warnings };
}

export async function documentation(files: readonly string[]): Promise<string> {
  const readme = files.find(path => /^readme\.md$/i.test(basename(path)));
  return readme ? redact(await readExcerpt(readme, 6_000).catch(() => '')).slice(0, 6_000) : '';
}

/** Literal hook names are candidates, never proof that dynamic registrations ran. */
export async function hookCandidates(files: readonly string[], signal: AbortSignal): Promise<string[]> {
  const names = new Set<string>();
  for (const path of files.filter(path => ['.ts', '.js', '.mjs', '.cjs'].includes(extname(path))).slice(0, 200)) {
    signal.throwIfAborted();
    if (isPrivate(path)) continue;
    const text = await readExcerpt(path).catch(() => '');
    for (const match of text.matchAll(/\b(?:pi|api)\.on\(\s*['"]([a-z_]+)['"]/g)) names.add(match[1]);
  }
  return [...names].sort();
}
