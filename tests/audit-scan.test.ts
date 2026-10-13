import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './audit-fixture.ts';
import { scanAudit } from '../src/audit/scan.ts';
import { collectDependencies } from '../src/audit/dependencies.ts';
import { readExcerpt, redact, tree } from '../src/audit/files.ts';

test('scan explains extension/skill purpose, capabilities, distinct costs and never executes source', async t => {
  const f = await fixture(); t.after(() => f.session.dispose());
  const settingsBefore = await readFile(join(f.agentDir, 'settings.json'), 'utf8');
  const progress: string[] = [];
  const report = await scanAudit({ host: f.host, ctx: f.ctx, pi: f.api, signal: new AbortController().signal, progress: message => progress.push(message) });
  assert.equal(report.resources.length, 2);
  const extension = report.resources.find(item => item.kind === 'extension');
  const skill = report.resources.find(item => item.kind === 'skill');
  assert.match(extension?.purpose ?? '', /owner approval/);
  assert.ok(extension?.capabilities.some(item => item.name === 'protect' && item.kind === 'tool'));
  assert.ok(extension?.capabilities.some(item => item.name === 'protection' && item.kind === 'command'));
  assert.ok(extension?.capabilities.some(item => item.name === 'tool_call' && item.kind === 'hook candidate'));
  assert.equal(extension?.state, 'Runtime capabilities registered');
  assert.ok(extension?.bytes && extension.bytes > 0);
  assert.ok(skill?.context.catalog && skill.context.catalog.tokens > 0);
  assert.equal(skill?.context.instructions?.characters, f.instructions.length);
  assert.equal(skill?.context.retainedReads?.tokens, 0, 'not read means no attributed retained body');
  assert.equal(f.sent.length, 0, 'no model request');
  assert.ok(progress.length > 1);
  assert.equal(await readFile(join(f.agentDir, 'settings.json'), 'utf8'), settingsBefore);
  assert.ok(!JSON.stringify(report).includes('private-global-sentinel'), 'no auth content read');
  assert.ok(report.dependencies.some(item => item.name === 'missing' && !item.complete), 'missing dependencies stay unresolved');
});

test('shared dependency graph counts physical bytes once and tracks both owners', async t => {
  const f = await fixture(); t.after(() => f.session.dispose());
  const dependencies = await collectDependencies([{ id: 'first', root: f.root }, { id: 'second', root: f.root }], new AbortController().signal);
  const shared = dependencies.filter(item => item.name === 'shared-dep');
  assert.equal(shared.length, 1);
  assert.deepEqual(shared[0].owners, ['first', 'second']);
  const disk = await tree(f.shared, new AbortController().signal);
  assert.equal(shared[0].bytes, disk.bytes);
});

test('file traversal does not follow child symlinks; private excerpts are denied', async t => {
  const f = await fixture(); t.after(() => f.session.dispose());
  await symlink(join(f.agentDir, 'auth.json'), join(f.root, 'README-private.md'));
  const disk = await tree(f.root, new AbortController().signal);
  assert.ok(disk.warnings.some(message => message.includes('Symlink')));
  await assert.rejects(readExcerpt(join(f.root, 'README-private.md')), /regular resource/);
  await assert.rejects(readExcerpt(join(f.agentDir, 'auth.json')), /Private/);
});

test('abort is honored and malformed resource produces partial facts', async t => {
  const f = await fixture(); t.after(() => f.session.dispose());
  const controller = new AbortController(); controller.abort();
  await assert.rejects(scanAudit({ host: f.host, ctx: f.ctx, pi: f.api, signal: controller.signal, progress() {} }));
  await writeFile(join(f.root, 'package.json'), 'not JSON');
  const report = await scanAudit({ host: f.host, ctx: f.ctx, pi: f.api, signal: new AbortController().signal, progress() {} });
  assert.ok(report.resources.some(item => item.state === 'Unresolved'));
  assert.ok(report.resources.some(item => item.kind === 'skill'), 'other resources still measured');
});

test('bounded evidence redaction removes common secret forms', () => {
  assert.equal(redact('token = "secret-sentinel"'), 'token = [redacted]');
  assert.ok(!redact('password: abc123').includes('abc123'));
  assert.ok(!redact('sk-' + 'a'.repeat(32)).includes('a'.repeat(32)));
});
