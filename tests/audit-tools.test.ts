import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { fixture } from './audit-fixture.ts';
import { auditController } from '../src/audit/controller.ts';
import { registerAuditTools } from '../src/audit/tools.ts';

test('typed tools gate consent/session identity, redact evidence, reject invalid pages and record results', async t => {
  const f = await fixture(); t.after(() => f.session.dispose());
  const audit = auditController(f.api); await audit.scan(f.ctx, f.host);
  const report = audit.get().report; assert.ok(report);
  const settingsManager = SettingsManager.inMemory({});
  const loader = new DefaultResourceLoader({ cwd: f.cwd, agentDir: f.agentDir, settingsManager, noSkills: true, noContextFiles: true, noThemes: true, noPromptTemplates: true,
    extensionFactories: [pi => registerAuditTools(pi, audit)] });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: f.cwd, agentDir: f.agentDir, resourceLoader: loader, settingsManager, modelRuntime: f.session.modelRuntime, sessionManager: SessionManager.inMemory(f.cwd) });
  t.after(() => session.dispose());
  const read = session.extensionRunner.getToolDefinition('doctor_read_audit');
  const write = session.extensionRunner.getToolDefinition('doctor_record_assessments');
  assert.ok(read); assert.ok(write);
  const signal = new AbortController().signal;
  const otherCtx = session.extensionRunner.createToolContext('fixture-call', signal);
  const ctx = { ...otherCtx, sessionManager: f.ctx.sessionManager };
  await assert.rejects(read.execute('read', { reportId: report.id, offset: 0, limit: 1 }, signal, undefined, ctx), /approved/);
  const model = f.session.modelRuntime.getModels()[0]; assert.ok(model);
  await audit.analyze({ ...f.ctx, model, isIdle: () => true, ui: { ...f.ctx.ui, confirm: async () => true } });
  const page = await read.execute('read', { reportId: report.id, offset: 0, limit: 1 }, signal, undefined, ctx);
  const text = page.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  assert.ok(text.includes('[redacted]'));
  assert.ok(!text.includes('secret-sentinel'));
  assert.match(text, /nextOffset/);
  await assert.rejects(read.execute('read', { reportId: report.id, offset: -1, limit: 1 }, signal, undefined, ctx), /Invalid page/);
  await assert.rejects(read.execute('read', { reportId: report.id, offset: 0, limit: 1 }, signal, undefined, otherCtx), /approved/);
  const resource = report.resources[0];
  await write.execute('write', { reportId: report.id, assessments: [{ resourceId: resource.id, contribution: 'Safety approval', workflowValue: 'Potential protection', projectRelevance: 'Not established', tradeoffs: 'Dependencies and unknown dynamic injection',
    recommendation: 'review', reasons: ['Verify use before removal'], evidenceIds: [resource.evidence[0].id], uncertainty: 'No lifetime use evidence' }] }, signal, undefined, ctx);
  assert.equal(audit.get().assessments.length, 1);
  audit.cancel();
  await assert.rejects(write.execute('write', { reportId: report.id, assessments: [] }, signal, undefined, ctx), /canceled/);
});
