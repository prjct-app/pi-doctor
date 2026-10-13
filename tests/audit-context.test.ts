import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Type } from 'typebox';
import { SessionManager, formatSkillsForPrompt, type Skill } from '@earendil-works/pi-coding-agent';
import { extensionCost, observations, skillCost } from '../src/audit/context.ts';

const skill: Skill = { name: 'review', description: 'Review contracts', filePath: '/workspace/skills/review/SKILL.md', baseDir: '/workspace/skills/review', disableModelInvocation: false,
  sourceInfo: { path: '/workspace/skills/review/SKILL.md', scope: 'user', origin: 'top-level', source: 'user' } };
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
function retainedRead(session: SessionManager, id: string, path: string, text: string) {
  session.appendMessage({ role: 'assistant', content: [{ type: 'toolCall', id, name: 'read', arguments: { path } }], api: 'openai-responses', provider: 'fixture', model: 'fixture', usage, stopReason: 'toolUse', timestamp: 1 });
  return session.appendMessage({ role: 'toolResult', toolCallId: id, toolName: 'read', content: [{ type: 'text', text }], isError: false, timestamp: 2 });
}

test('catalog, instructions, repeated direct reads and references are separate', () => {
  const session = SessionManager.inMemory('/workspace');
  retainedRead(session, 'first', skill.filePath, 'instructions');
  retainedRead(session, 'repeat', skill.filePath, 'instructions');
  retainedRead(session, 'reference', skill.baseDir + '/references/example.md', 'reference');
  const cost = skillCost(skill, 'potential instructions', formatSkillsForPrompt([skill]), observations(session.buildSessionProjection(), '/workspace'));
  assert.equal(cost.readCount, 3);
  assert.equal(cost.observedCalls, 2);
  assert.equal(cost.retainedReads?.characters, 'instructions\ninstructions\nreference'.length);
  assert.equal(cost.instructions?.characters, 'potential instructions'.length);
  assert.ok(cost.catalog && cost.catalog.tokens > 0);
});

test('context edits and compaction do not resurrect old injected text', () => {
  const session = SessionManager.inMemory('/workspace');
  const id = retainedRead(session, 'read', skill.filePath, 'instructions');
  session.appendContextEdit(id, null);
  assert.equal(observations(session.buildSessionProjection(), '/workspace').length, 0);
  const rawId = retainedRead(session, 'old', skill.filePath, 'old instructions');
  session.appendCompaction('compacted', rawId, 100);
  const observed = observations(session.buildSessionProjection(), '/workspace');
  assert.equal(observed.length, 0, 'result without retained corresponding call cannot be attributed');
});

test('hidden/unadvertised skill catalog is zero; potential instructions are not zero', () => {
  const hidden = { ...skill, disableModelInvocation: true };
  const cost = skillCost(hidden, 'instructions', '', []);
  assert.equal(cost.catalog?.tokens, 0);
  assert.ok(cost.instructions?.tokens);
  assert.equal(cost.retainedReads?.tokens, 0);
});

test('no declared tools gives zero schema estimate, never proves no workflow value', () => {
  const cost = extensionCost([{ name: 'protect', description: 'Protect edits', parameters: Type.Object({}), exposure: 'deferred', sourceInfo: skill.sourceInfo }], [], [], []);
  assert.equal(cost.declarations?.tokens, 0);
  assert.ok(cost.notes.some(note => note.includes('value without')));
  assert.equal(cost.observedCalls, 0);
});
