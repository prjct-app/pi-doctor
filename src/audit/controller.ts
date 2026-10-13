import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type { Host } from '../actions.ts';
import { analysisRequest, validateAssessments } from './assessments.ts';
import { scanAudit } from './scan.ts';
import { AUDIT_TOOL_NAMES, emptyAudit, errorText, type AuditState } from './types.ts';

export type AuditApi = Pick<ExtensionAPI, 'getAllTools' | 'getActiveTools' | 'getCommands' | 'setActiveTools' | 'sendUserMessage'>;
export function auditController(pi: AuditApi) {
  const cell: { value: AuditState; operation?: AbortController; generation: number; savedTools?: readonly string[] } = { value: emptyAudit(), generation: 0 };
  const listeners = new Set<() => void>();
  const publish = (next: AuditState): void => { cell.value = next; for (const listener of listeners) listener(); };
  const deactivate = (): void => {
    if (cell.savedTools) { pi.setActiveTools([...cell.savedTools]); cell.savedTools = undefined; }
  };
  const cancel = (): void => {
    cell.operation?.abort(); cell.generation += 1;
    if (cell.value.phase === 'analyzing') deactivate();
    publish({ ...cell.value, phase: 'canceled', progress: 'Canceled; last completed facts retained.' });
  };
  return {
    get: (): AuditState => cell.value,
    subscribe: (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel,
    reset: (): void => { cancel(); publish(emptyAudit()); },
    scan: async (ctx: ExtensionCommandContext, host: Host): Promise<void> => {
      if (cell.value.phase === 'scanning' || cell.value.phase === 'analyzing') throw new Error('Cancel the current scan/analysis first');
      const generation = ++cell.generation;
      const operation = new AbortController(); cell.operation = operation;
      publish({ ...cell.value, phase: 'scanning', progress: 'Scanning resources (no model call)…' });
      try {
        const report = await scanAudit({ host, ctx, pi, signal: operation.signal, progress: progress => {
          if (generation === cell.generation) publish({ ...cell.value, progress });
        } });
        if (generation === cell.generation) publish({ report, assessments: [], phase: 'idle', progress: `Measured ${report.resources.length} resources. Press a for evidence-based analysis.` });
      } catch (error) {
        if (generation === cell.generation) publish({ ...cell.value, phase: 'failed', progress: errorText(error) });
      } finally { if (cell.operation === operation) cell.operation = undefined; }
    },
    analyze: async (ctx: ExtensionCommandContext): Promise<void> => {
      const report = cell.value.report;
      if (!report || report.sessionId !== ctx.sessionManager.getSessionId()) throw new Error('Scan this session first');
      if (cell.value.phase === 'scanning' || cell.value.phase === 'analyzing') throw new Error('An operation is already running');
      if (!ctx.model) throw new Error('No active model; measured facts remain available');
      if (!ctx.isIdle()) throw new Error('Wait for the current agent operation to finish');
      const generation = cell.generation;
      const model = ctx.model;
      if (!await ctx.ui.confirm('Analyze with the active model?', `${model.provider}/${model.id}. Resource facts and bounded redacted documentation excerpts will enter this session. Uses tokens and current context; no global history or configuration edits. During analysis only Doctor evidence/record tools are enabled; your previous tools are restored afterward.`)) return;
      if (generation !== cell.generation || cell.value.report?.id !== report.id || report.sessionId !== ctx.sessionManager.getSessionId()
        || ctx.model?.id !== model.id || ctx.model?.provider !== model.provider || !ctx.isIdle()) throw new Error('Scan/session/model changed during confirmation; request analysis again');
      publish({ ...cell.value, assessments: [], phase: 'analyzing', progress: 'Active agent analyzing; Esc stops the agent. /doctor cancel invalidates pending results.' });
      cell.savedTools = pi.getActiveTools();
      pi.setActiveTools([...AUDIT_TOOL_NAMES]);
      try { pi.sendUserMessage(analysisRequest(report)); }
      catch (error) { deactivate(); publish({ ...cell.value, phase: 'failed', progress: errorText(error) }); throw error; }
    },
    record: (reportId: string, sessionId: string, values: unknown): number => {
      const report = cell.value.report;
      if (!report || report.id !== reportId || report.sessionId !== sessionId || cell.value.phase !== 'analyzing') throw new Error('No matching active analysis; results are stale or canceled');
      const batch = validateAssessments(values, report);
      const replacements = new Set(batch.map(item => item.resourceId));
      const assessments = [...cell.value.assessments.filter(item => !replacements.has(item.resourceId)), ...batch];
      publish({ ...cell.value, assessments, progress: `${assessments.length}/${report.resources.length} assessments recorded` });
      return assessments.length;
    },
    settled: (): void => {
      if (cell.value.phase !== 'analyzing') return;
      const total = cell.value.report?.resources.length ?? 0;
      const complete = total > 0 && cell.value.assessments.length === total;
      deactivate();
      publish({ ...cell.value, phase: complete ? 'complete' : 'partial', progress: complete ? 'Analysis complete; recommendations only.' : `Analysis incomplete: ${cell.value.assessments.length}/${total}. Missing verdicts remain pending.` });
    },
  };
}
export type AuditController = ReturnType<typeof auditController>;
