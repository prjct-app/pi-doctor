import { access, realpath } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';
import { manifest, record, tree } from './files.ts';
import type { Dependency } from './types.ts';

export async function dependencyRoot(from: string, name: string): Promise<string | undefined> {
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) return undefined;
  const search = async (dir: string): Promise<string | undefined> => {
    const candidate = join(dir, 'node_modules', name);
    if (await access(join(candidate, 'package.json')).then(() => true, () => false)) return realpath(candidate);
    return dir === parse(dir).root ? undefined : search(dirname(dir));
  };
  return search(from);
}

export async function collectDependencies(
  roots: readonly { id: string; root: string }[], signal: AbortSignal,
): Promise<readonly Dependency[]> {
  const packages = new Map<string, { name: string; bytes: number; complete: boolean; owners: Set<string>; }>();
  const visited = new Set<string>();
  const visit = async (root: string, owner: string): Promise<void> => {
    signal.throwIfAborted();
    const key = `${root}\0${owner}`;
    if (visited.has(key)) return;
    visited.add(key);
    const json = await manifest(join(root, 'package.json')).catch(() => undefined);
    if (!json) { const entry = packages.get(root); if (entry) entry.complete = false; return; }
    if (!record(json.dependencies)) return;
    for (const name of Object.keys(json.dependencies).sort()) {
      const child = await dependencyRoot(root, name);
      if (!child) {
        const missing = join(root, 'node_modules', name);
        if (!packages.has(missing)) packages.set(missing, { name, bytes: 0, complete: false, owners: new Set() });
        packages.get(missing)!.owners.add(owner);
        continue;
      }
      if (!packages.has(child)) {
        const disk = await tree(child, signal);
        packages.set(child, { name, bytes: disk.bytes, complete: disk.warnings.length === 0, owners: new Set() });
      }
      packages.get(child)!.owners.add(owner);
      await visit(child, owner);
    }
  };
  for (const entry of roots) await visit(entry.root, entry.id);
  return [...packages.entries()].map(([path, item]) => ({ path, name: item.name, bytes: item.bytes, complete: item.complete, owners: [...item.owners].sort() }));
}
