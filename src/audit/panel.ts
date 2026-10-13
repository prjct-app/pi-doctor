import { panelText, type PanelDetail, type PanelItem, type PanelSpec } from '@prjct.app/pi-tui-kit';
import type { AuditController } from './controller.ts';
import { redact } from './files.ts';
import type { AuditResource, AuditState, Estimate } from './types.ts';

export const bytes = (size: number | undefined): string => size === undefined ? 'unknown' : size < 1_024 ? `${size} B` : size < 1_048_576 ? `${(size / 1_024).toFixed(1)} KiB` : `${(size / 1_048_576).toFixed(1)} MiB`;
const tokens = (value: Estimate | undefined): string => value ? `~${value.tokens.toLocaleString()} tok (${value.characters} chars)` : 'unknown';
const weight = (resource: AuditResource): number | undefined => resource.context.catalog || resource.context.declarations || resource.context.retainedReads
  ? (resource.context.catalog?.tokens ?? 0) + (resource.context.declarations?.tokens ?? 0) + (resource.context.retainedReads?.tokens ?? 0) : undefined;
const ID = 'audit:';

type PanelOps = Readonly<{ scan(): Promise<void>; analyze(): void; cancel(): void }>;
export function auditPanelSpec(base: PanelSpec, audit: AuditController, ops: PanelOps): PanelSpec {
  const view: { value: Readonly<{ inventory: boolean; filter: string; sort: string }> } = { value: { inventory: false, filter: 'all', sort: 'name' } };
  const resourceOf = (item: PanelItem): AuditResource | undefined => audit.get().report?.resources.find(resource => `${ID}${resource.id}` === item.id);
  const selected = (): AuditResource[] => {
    const state = audit.get();
    const verdict = (resource: AuditResource): string => state.assessments.find(item => item.resourceId === resource.id)?.recommendation ?? 'pending';
    const resources = (state.report?.resources ?? []).filter(resource => view.value.filter === 'all' || view.value.filter === resource.kind
      || (view.value.filter === 'review' && ['pending', 'review', 'disable', 'remove'].includes(verdict(resource))));
    return [...resources].sort((a, b) => view.value.sort === 'disk' ? (b.bytes ?? -1) - (a.bytes ?? -1)
      : view.value.sort === 'context' ? (weight(b) ?? -1) - (weight(a) ?? -1)
      : view.value.sort === 'decision' ? verdict(a).localeCompare(verdict(b)) : a.name.localeCompare(b.name));
  };
  const cycle = (field: 'filter' | 'sort', values: readonly string[], refresh: () => void): void => {
    view.value = { ...view.value, [field]: values[(values.indexOf(view.value[field]) + 1) % values.length] }; refresh();
  };
  return {
    ...base,
    title: 'Doctor',
    summary: () => view.value.inventory ? `Management · ${base.summary?.() ?? ''}`
      : `${audit.get().report?.resources.length ?? 0} resources · ${audit.get().phase} · ${view.value.filter} · ${view.value.sort}`,
    items: () => view.value.inventory ? base.items() : [
      { id: `${ID}summary`, label: audit.get().progress, symbol: audit.get().phase === 'complete' ? '✓' : '○', tone: 'accent', meta: 'scan overview' },
      ...selected().map((resource): PanelItem => {
        const decision = audit.get().assessments.find(item => item.resourceId === resource.id)?.recommendation ?? 'pending';
        return { id: `${ID}${resource.id}`, label: resource.name, symbol: resource.kind === 'skill' ? '◇' : '□',
          tone: decision === 'keep' ? 'success' : ['review', 'disable', 'remove'].includes(decision) ? 'warning' : 'text',
          meta: `${resource.kind} · ${bytes(resource.bytes)}${resource.sizeComplete ? '' : ' partial/unknown'} · ${weight(resource) === undefined ? 'context unknown' : `~${weight(resource)} tok observed/declared`} · ${decision}`,
          search: `${resource.kind} ${resource.purpose} ${resource.state} ${decision}` };
      }),
    ],
    detail: item => {
      if (view.value.inventory) return base.detail(item);
      const resource = resourceOf(item);
      return resource ? resourceDetail(resource, audit.get()) : overview(audit.get());
    },
    actions: [
      { key: 's', label: 'Scan (no model)', bulk: true, when: () => !['scanning', 'analyzing'].includes(audit.get().phase), run: (_item, panel) => { void ops.scan().catch(error => panel.notice(String(error), 'error')); } },
      { key: 'a', label: 'Analyze value', bulk: true, when: () => !!audit.get().report && !['scanning', 'analyzing'].includes(audit.get().phase), run: (_item, panel) => { panel.close(); ops.analyze(); } },
      { key: 'b', label: 'Cancel scan/analysis results', bulk: true, when: () => ['scanning', 'analyzing'].includes(audit.get().phase), run: (_item, panel) => { ops.cancel(); panel.refresh(); } },
      { key: 'v', label: () => view.value.inventory ? 'Audit view' : 'Manage resources', run: (_item, panel) => { view.value = { ...view.value, inventory: !view.value.inventory }; panel.refresh(); } },
      { key: 'f', label: () => `Filter: ${view.value.filter}`, when: () => !view.value.inventory, run: (_item, panel) => cycle('filter', ['all', 'extension', 'skill', 'review'], panel.refresh) },
      { key: 'o', label: () => `Sort: ${view.value.sort}`, when: () => !view.value.inventory, run: (_item, panel) => cycle('sort', ['name', 'disk', 'context', 'decision'], panel.refresh) },
      ...(base.actions ?? []).map(action => ({ ...action, when: (item: PanelItem | undefined) => view.value.inventory && (action.when?.(item) ?? true) })),
    ],
    initial: `${ID}summary`,
    subscribe: listener => {
      const unsubscribe = audit.subscribe(listener);
      const unsubscribeBase = base.subscribe?.(listener);
      return () => { unsubscribe(); unsubscribeBase?.(); };
    },
  };
}

/** Text mode consumes the same detail data, not a parallel audit implementation. */
export function auditText(spec: PanelSpec): string {
  return [panelText(spec), ...spec.items().map(item => {
    const detail = spec.detail(item);
    return [`\n${detail.title}`, detail.subtitle ?? '', ...(detail.fields ?? []).map(field => `${field.label}: ${field.value}`),
      ...(detail.sections ?? []).flatMap(section => [section.title, ...section.lines.map(line => redact(line).slice(0, 1_000))]),
    ].join('\n');
  })].join('\n');
}

function resourceDetail(resource: AuditResource, state: AuditState): PanelDetail {
  const assessment = state.assessments.find(item => item.resourceId === resource.id);
  const deps = state.report?.dependencies.filter(item => item.owners.includes(resource.id)) ?? [];
  const sections = [
    { title: 'Purpose', lines: [redact(resource.purpose)] },
    { title: 'Capabilities', lines: resource.capabilities.length ? resource.capabilities.map(item => `${item.kind}: ${item.name} — ${redact(item.description)}`) : ['None observable; this is not evidence of no value.'] },
    { title: 'Context accounting (estimates, not billing)', lines: [
      `Advertised catalog: ${tokens(resource.context.catalog)}`,
      `Declared tools before provider/loadout: ${tokens(resource.context.declarations)}`,
      `Full instruction load potential: ${tokens(resource.context.instructions)}`,
      `Retained direct read/tool outputs: ${tokens(resource.context.retainedReads)}`,
      `Observed direct reads: ${resource.context.readCount}; retained successful tool results: ${resource.context.observedCalls}`,
      ...resource.context.notes,
    ] },
    { title: 'Runtime dependencies (shared, not additive)', lines: deps.length ? deps.map(dep => `${dep.name}: ${bytes(dep.bytes)}${dep.complete ? '' : ' partial'} · shared by ${dep.owners.length} resources`) : ['None resolved; unresolved dependencies may be unknown.'] },
    { title: assessment ? `Recommendation: ${assessment.recommendation}` : 'Verdict pending', lines: assessment ? [
      `Contribution: ${assessment.contribution}`, `Overall workflow: ${assessment.workflowValue}`, `Project/session: ${assessment.projectRelevance}`,
      `Tradeoffs: ${assessment.tradeoffs}`, ...assessment.reasons, `Uncertainty: ${assessment.uncertainty}`, `Evidence: ${assessment.evidenceIds.join(', ')}`,
    ] : ['Press a to request analysis with your active model. No recommendation is applied automatically.'] },
    { title: 'Evidence', lines: resource.evidence.map(item => `${item.id} — ${item.source}\n${redact(item.text).slice(0, 6_000)}`) },
    { title: 'Warnings', lines: [...resource.warnings] },
  ];
  return { title: resource.name, subtitle: `${resource.kind} · ${resource.state}`, fields: [
    { label: 'disk', value: `${bytes(resource.bytes)}${resource.sizeComplete ? ' logical bytes' : ' partial/unknown'}` },
    { label: 'source', value: resource.source }, { label: 'path', value: resource.path },
  ], sections };
}

function overview(state: AuditState): PanelDetail {
  const report = state.report;
  const priorities = state.assessments.filter(item => item.recommendation !== 'keep');
  return { title: 'Resource audit', subtitle: state.progress, fields: [
    { label: 'scan', value: report?.at ?? 'not scanned' }, { label: 'analysis', value: `${state.assessments.length}/${report?.resources.length ?? 0} resources` },
    { label: 'shared dependency graph', value: report ? `${bytes(report.dependencies.reduce((sum, dep) => sum + dep.bytes, 0))} unique logical bytes (may be partial)` : 'unknown' },
    { label: 'catalog wrapper overhead', value: tokens(report?.catalogOverhead) },
  ], sections: [
    { title: 'Controls', lines: ['s scan · a analyze with active model · b cancel pending work', 'f filter · o sort · / search · v management view', 'Esc closes; measured facts remain session-local. No scan changes settings.'] },
    { title: 'Priorities (recommendations, not changes)', lines: priorities.length ? priorities.map(item => `${report?.resources.find(resource => resource.id === item.resourceId)?.name}: ${item.recommendation} — ${item.reasons.join('; ')}`) : ['No analyzed priorities yet.'] },
    { title: 'Measurement limits', lines: [...(report?.warnings ?? []), 'Per-row context costs can overlap and are not an additive billing total.'] },
  ] };
}
