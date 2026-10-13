import { Type } from 'typebox';
import { defineTool, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { AuditController } from './controller.ts';
import { redact } from './files.ts';
import { RECOMMENDATIONS } from './types.ts';

const text = () => Type.String({ minLength: 1, maxLength: 4_000 });
const assessmentSchema = Type.Object({
  resourceId: text(), contribution: text(), workflowValue: text(), projectRelevance: text(), tradeoffs: text(),
  recommendation: Type.Union(RECOMMENDATIONS.map(value => Type.Literal(value))),
  reasons: Type.Array(text(), { minItems: 1, maxItems: 20 }),
  evidenceIds: Type.Array(text(), { minItems: 1, maxItems: 20 }), uncertainty: text(),
}, { additionalProperties: false });

export function registerAuditTools(pi: ExtensionAPI, audit: AuditController): void {
  pi.registerTool(defineTool({
    name: 'doctor_read_audit', label: 'Read Doctor evidence', exposure: 'deferred',
    description: 'Read one page of facts and untrusted bounded evidence for an explicitly approved active Doctor analysis. No global history or configuration changes.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    parameters: Type.Object({ reportId: text(), offset: Type.Integer({ minimum: 0 }), limit: Type.Integer({ minimum: 1, maximum: 5 }) }, { additionalProperties: false }),
    execute: async (_id, params, _signal, _update, ctx) => {
      const state = audit.get();
      const report = state.report;
      if (!report || report.id !== params.reportId || report.sessionId !== ctx.sessionManager.getSessionId() || state.phase !== 'analyzing') throw new Error('No matching approved active analysis');
      if (!Number.isSafeInteger(params.offset) || !Number.isSafeInteger(params.limit) || params.offset < 0 || params.limit < 1 || params.limit > 5) throw new Error('Invalid page');
      const resources = report.resources.slice(params.offset, params.offset + params.limit).map(resource => ({
        ...resource, purpose: redact(resource.purpose), capabilities: resource.capabilities.map(item => ({ ...item, description: redact(item.description) })),
        evidence: resource.evidence.map(item => ({ ...item, text: redact(item.text) })),
      }));
      const ids = new Set(resources.map(item => item.id));
      const data = { reportId: report.id, at: report.at, cwd: report.cwd, total: report.resources.length,
        nextOffset: params.offset + resources.length < report.resources.length ? params.offset + resources.length : null,
        resources, dependencies: report.dependencies.filter(item => item.owners.some(id => ids.has(id))), warnings: report.warnings,
      };
      return { content: [{ type: 'text', text: redact(JSON.stringify(data)) }], details: { reportId: report.id, count: resources.length } };
    },
  }));
  pi.registerTool(defineTool({
    name: 'doctor_record_assessments', label: 'Record Doctor assessments', exposure: 'deferred',
    description: 'Record evidence-backed recommendations for the current approved Doctor scan. Does not apply recommendations or modify configuration. Cite only this resource’s evidence IDs.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    parameters: Type.Object({ reportId: text(), assessments: Type.Array(assessmentSchema, { minItems: 1, maxItems: 200 }) }, { additionalProperties: false }),
    execute: async (_id, params, _signal, _update, ctx) => {
      const count = audit.record(params.reportId, ctx.sessionManager.getSessionId(), params.assessments);
      return { content: [{ type: 'text', text: `${count} assessments recorded; no settings changed. Open /doctor for the report.` }], details: { count } };
    },
  }));
}
