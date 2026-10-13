import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './audit-fixture.ts';
import { auditController } from '../src/audit/controller.ts';
import { analysisRequest, validateAssessments } from '../src/audit/assessments.ts';
import type { Assessment, AuditReport } from '../src/audit/types.ts';

function result(report: AuditReport, index = 0): Assessment {
  const resource = report.resources[index];
  return { resourceId: resource.id, contribution: resource.purpose, workflowValue: 'Potential safety/workflow value', projectRelevance: 'No current task-specific need established',
    tradeoffs: 'Measured overhead with dynamic context unknown', recommendation: 'review', reasons: ['Inspect documented role before changing configuration'],
    evidenceIds: [resource.evidence[0].id], uncertainty: 'No global history or reliable lifetime use evidence' };
}
test('analysis requires confirmation; batches validate IDs and preserve recommendations as data', async t => {
  const f = await fixture(); t.after(() => f.session.dispose());
  const audit = auditController(f.api);
  await audit.scan(f.ctx, f.host);
  const report = audit.get().report; assert.ok(report);
  const model = f.session.modelRuntime.getModels()[0]; assert.ok(model);
  const ctx = { ...f.ctx, model, isIdle: () => true, ui: { ...f.ctx.ui, confirm: async () => false } };
  await audit.analyze(ctx);
  assert.equal(f.sent.length, 0);
  await assert.rejects(audit.analyze({ ...ctx, ui: { ...ctx.ui, confirm: async () => { audit.cancel(); return true; } } }), /changed during confirmation/);
  assert.equal(f.sent.length, 0, 'no stale consent starts analysis');
  await audit.analyze({ ...ctx, ui: { ...ctx.ui, confirm: async () => true } });
  assert.equal(f.sent.length, 1);
  assert.deepEqual(f.active.value, ['doctor_read_audit', 'doctor_record_assessments'], 'analysis declares only read-only audit workflow tools');
  assert.equal(audit.record(report.id, report.sessionId, [result(report)]), 1);
  assert.throws(() => audit.record('stale', report.sessionId, [result(report)]), /stale/);
  assert.throws(() => audit.record(report.id, 'other-session', [result(report)]), /stale/);
  audit.settled();
  assert.equal(audit.get().phase, 'partial', 'missing verdicts are not a complete analysis');
  assert.equal(f.active.value.includes('doctor_read_audit'), false);
  assert.deepEqual(f.active.value, ['protect'], 'unrelated active tools preserved');
});
test('complete batches, cancellation and new scans invalidate stale results', async t => {
  const f = await fixture(); t.after(() => f.session.dispose());
  const audit = auditController(f.api);
  await audit.scan(f.ctx, f.host);
  const report = audit.get().report; assert.ok(report);
  const model = f.session.modelRuntime.getModels()[0]; assert.ok(model);
  const ctx = { ...f.ctx, model, isIdle: () => true, ui: { ...f.ctx.ui, confirm: async () => true } };
  await audit.analyze(ctx);
  audit.record(report.id, report.sessionId, report.resources.map((_resource, index) => result(report, index)));
  audit.settled();
  assert.equal(audit.get().phase, 'complete');
  const running = audit.scan(f.ctx, f.host);
  audit.cancel();
  await running;
  assert.equal(audit.get().phase, 'canceled');
  assert.equal(audit.get().report?.id, report.id, 'previous finished facts retained');
  assert.throws(() => audit.record(report.id, report.sessionId, [result(report)]), /canceled/);
  audit.reset();
  assert.equal(audit.get().report, undefined);
});
test('invalid model data is rejected atomically, with no fabricated verdict', async t => {
  const f = await fixture(); t.after(() => f.session.dispose());
  const audit = auditController(f.api); await audit.scan(f.ctx, f.host);
  const report = audit.get().report; assert.ok(report);
  assert.throws(() => validateAssessments([{ ...result(report), evidenceIds: ['invented'] }], report), /Evidence/);
  assert.throws(() => validateAssessments([result(report), result(report)], report), /duplicate/);
  assert.throws(() => validateAssessments([{ ...result(report), reasons: [] }], report), /Reasons/);
  assert.throws(() => validateAssessments([{ ...result(report), recommendation: 'delete-now' }], report), /recommendation/);
  assert.throws(() => validateAssessments([{ ...result(report), uncertainty: '' }], report), /uncertainty/);
  const prompt = analysisRequest(report);
  assert.match(prompt, /UNTRUSTED DATA/);
  assert.match(prompt, /lack of observed calls with lack of value/);
  assert.match(prompt, /no configuration edits/);
});
