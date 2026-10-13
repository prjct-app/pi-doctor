import { randomUUID } from 'node:crypto';
import { join, resolve, relative, basename } from 'node:path';
import { formatSkillsForPrompt, type ExtensionCommandContext, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { Host } from '../actions.ts';
import { documentation, hookCandidates, manifest, readExcerpt, tree, record } from './files.ts';
import { collectDependencies } from './dependencies.ts';
import { extensionCost, observations, skillCost, skillEntry } from './context.ts';
import { errorText, estimate, type AuditReport, type AuditResource, type Capability } from './types.ts';

export type ScanInput = Readonly<{
  host: Host;
  ctx: ExtensionCommandContext;
  pi: Pick<ExtensionAPI, 'getAllTools' | 'getActiveTools' | 'getCommands'>;
  signal: AbortSignal;
  progress(text: string): void;
}>;
const inside = (root: string, path: string): boolean => {
  if (path.startsWith('builtin:') || path.startsWith('<')) return false;
  const part = relative(resolve(root), resolve(path));
  return part === '' || (!part.startsWith('..') && !part.startsWith('/'));
};

export async function scanAudit({ host, ctx, pi, signal, progress }: ScanInput): Promise<AuditReport> {
  const options = ctx.getSystemPromptOptions();
  const prompt = ctx.getSystemPrompt();
  const tools = pi.getAllTools();
  const commands = pi.getCommands();
  const observed = observations(ctx.sessionManager.buildSessionProjection(), ctx.cwd);
  const resources: AuditResource[] = [];
  const roots: { id: string; root: string }[] = [];
  const warnings: string[] = [];
  const configured = host.packages.listConfiguredPackages();
  const covered = new Set<string>();
  for (const pkg of configured) {
    signal.throwIfAborted();
    const root = pkg.installedPath ?? host.packages.getInstalledPath(pkg.source, pkg.scope);
    const id = `extension:${pkg.scope}:${pkg.source}`;
    progress(`Inspecting ${pkg.source}`);
    if (!root) {
      resources.push(unresolved(id, pkg.source, pkg.source, 'Configured; installation unresolved'));
      continue;
    }
    try {
      const json = await manifest(join(root, 'package.json'));
      const disk = await tree(root, signal);
      const owned = tools.filter(tool => (inside(root, tool.sourceInfo.path) || inside(disk.root, tool.sourceInfo.path)));
      const ownedCommands = commands.filter(command => command.source === 'extension' && (inside(root, command.sourceInfo.path) || inside(disk.root, command.sourceInfo.path)));
      const paths = [...owned.map(tool => tool.sourceInfo.path), ...ownedCommands.map(command => command.sourceInfo.path)];
      paths.forEach(path => covered.add(path));
      const capabilities: Capability[] = [
        ...owned.map(tool => ({ kind: 'tool' as const, name: tool.name, description: tool.description })),
        ...ownedCommands.map(command => ({ kind: 'command' as const, name: command.name, description: command.description ?? '' })),
        ...(await hookCandidates(disk.files, signal)).map(name => ({ kind: 'hook candidate' as const, name, description: 'Literal source candidate; registration not proven.' })),
      ];
      const description = typeof json.description === 'string' ? json.description : 'Purpose not declared in package manifest';
      const docs = await documentation(disk.files);
      const dependencies = record(json.dependencies) ? Object.keys(json.dependencies) : [];
      resources.push({ id, kind: 'extension', name: typeof json.name === 'string' ? json.name : pkg.source,
        source: pkg.source, path: disk.root, state: paths.length ? 'Runtime capabilities registered' : 'Configured; runtime loading unverified',
        purpose: description, bytes: disk.bytes, sizeComplete: disk.warnings.length === 0, dependencies, capabilities,
        context: extensionCost(owned, pi.getActiveTools(), options.hiddenTools ?? [], observed),
        evidence: [
          { id: `${id}:manifest`, source: join(root, 'package.json'), text: description },
          { id: `${id}:capabilities`, source: 'SDK registration metadata / static hook candidates', text: JSON.stringify(capabilities) },
          ...(docs ? [{ id: `${id}:readme`, source: 'README excerpt (untrusted)', text: docs }] : []),
          { id: `${id}:cost`, source: 'Filesystem / current SDK context', text: `Logical package bytes ${disk.bytes}; ${paths.length} registered capability paths; ${dependencies.length} direct runtime dependencies. Dynamic context attribution unknown.` },
        ], warnings: [...disk.warnings, 'Hook discovery is bounded to 200 source files; indirect/dynamic hooks unknown.'],
      });
      roots.push({ id, root: disk.root });
    } catch (error) {
      if (signal.aborted) throw error;
      resources.push(unresolved(id, pkg.source, root, errorText(error)));
    }
  }
  const engineTools = new Set(['read', 'bash', 'powershell', 'edit', 'write', 'grep', 'find', 'ls']);
  const runtimePaths = new Set([...tools.filter(tool => !(engineTools.has(tool.name) && tool.sourceInfo.path === `builtin:${tool.name}`)).map(tool => tool.sourceInfo.path), ...commands.filter(command => command.source === 'extension').map(command => command.sourceInfo.path)]);
  for (const path of runtimePaths) {
    if (covered.has(path)) continue;
    signal.throwIfAborted();
    progress(`Inspecting ${basename(path)}`);
    const owned = tools.filter(tool => tool.sourceInfo.path === path);
    const ownedCommands = commands.filter(command => command.sourceInfo.path === path && command.source === 'extension');
    const id = `extension:${path}`;
    const capabilities: Capability[] = [
      ...owned.map(tool => ({ kind: 'tool' as const, name: tool.name, description: tool.description })),
      ...ownedCommands.map(command => ({ kind: 'command' as const, name: command.name, description: command.description ?? '' })),
    ];
    const disk = path.startsWith('builtin:') || path.startsWith('<') ? undefined : await tree(path, signal).catch(error => { warnings.push(`${path}: ${errorText(error)}`); return undefined; });
    resources.push({ id, kind: 'extension', name: basename(path), path, source: owned[0]?.sourceInfo.source ?? ownedCommands[0]?.sourceInfo.source ?? path,
      state: 'Runtime capabilities registered', purpose: capabilities.map(item => item.description).filter(Boolean).join('; ') || 'Purpose unknown',
      bytes: disk?.bytes, sizeComplete: !!disk && disk.warnings.length === 0, dependencies: [], capabilities,
      context: extensionCost(owned, pi.getActiveTools(), options.hiddenTools ?? [], observed),
      evidence: [{ id: `${id}:capabilities`, source: 'SDK registration metadata', text: JSON.stringify(capabilities) }], warnings: disk?.warnings ?? ['Disk footprint unavailable for synthetic/unresolved resource'],
    });
  }
  for (const skill of options.skills ?? []) {
    signal.throwIfAborted();
    progress(`Inspecting skill ${skill.name}`);
    const id = `skill:${skill.filePath}`;
    const disk = await tree(skill.baseDir, signal).catch(error => { warnings.push(`${skill.filePath}: ${errorText(error)}`); return undefined; });
    const instructions = await readExcerpt(skill.filePath).catch(error => { warnings.push(`${skill.filePath}: ${errorText(error)}`); return undefined; });
    const measuredCost = skillCost(skill, instructions ?? '', prompt, observed);
    const cost = { ...measuredCost, instructions: instructions === undefined ? undefined : measuredCost.instructions };
    resources.push({ id, kind: 'skill', name: skill.name, path: skill.filePath, source: skill.sourceInfo.source,
      state: cost.catalog?.characters ? 'Advertised' : 'Available; not advertised', purpose: skill.description,
      bytes: disk?.bytes, sizeComplete: !!disk && disk.warnings.length === 0, dependencies: [], capabilities: [], context: cost,
      evidence: [
        { id: `${id}:catalog`, source: 'SDK skill metadata', text: skill.description },
        { id: `${id}:instructions`, source: 'SKILL.md bounded excerpt (untrusted)', text: instructions === undefined ? 'Instructions unreadable; potential injection unknown' : instructions.slice(0, 6_000) },
        { id: `${id}:cost`, source: 'Current prompt / retained direct reads', text: JSON.stringify(cost) },
      ], warnings: [...(disk?.warnings ?? ['Disk footprint unknown']), ...(instructions !== undefined && Buffer.byteLength(instructions) >= 64_000 ? ['Instruction measurement is a bounded excerpt, potentially partial'] : [])],
    });
  }
  progress('Measuring runtime dependencies (shared paths counted once)');
  const dependencies = await collectDependencies(roots, signal);
  const catalog = formatSkillsForPrompt(options.skills ?? []);
  const fragments = (options.skills ?? []).map(skillEntry).join('\n');
  return { id: randomUUID(), sessionId: ctx.sessionManager.getSessionId(), at: new Date().toISOString(), cwd: ctx.cwd,
    resources, dependencies, catalogOverhead: estimate(prompt.includes(catalog) && catalog ? catalog.replace(fragments, '') : ''),
    warnings: [...warnings, 'Excluded resources and extensions with no public registrations may be undiscoverable; configuration is not loading proof.',
      'Logical disk bytes exclude node_modules and .git; dependencies are a separate deduplicated graph.',
      'Estimates are characters / 4, not provider billing. Current retained reads are not lifetime use.'],
  };
}

function unresolved(id: string, name: string, path: string, warning: string): AuditResource {
  return { id, kind: 'extension', name, path, source: name, state: 'Unresolved', purpose: 'Unknown', sizeComplete: false, dependencies: [], capabilities: [],
    context: { readCount: 0, observedCalls: 0, notes: ['Context contribution unknown'] },
    evidence: [{ id: `${id}:unresolved`, source: 'Package discovery', text: warning }], warnings: [warning] };
}
