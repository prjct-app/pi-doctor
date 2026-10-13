import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from 'typebox';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, formatSkillsForPrompt, type Skill } from '@earendil-works/pi-coding-agent';
import { piHost } from '../src/actions.ts';
import type { AuditApi } from '../src/audit/controller.ts';

export async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'doctor-audit-'));
  const agentDir = join(cwd, 'agent');
  const root = join(agentDir, 'npm', 'node_modules', 'fixture-ext');
  const shared = join(agentDir, 'npm', 'node_modules', 'shared-dep');
  const skillDir = join(agentDir, 'skills', 'fixture-skill');
  await Promise.all([root, shared, skillDir].map(path => mkdir(path, { recursive: true })));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture-ext', version: '1.0.0', description: 'Protect destructive changes with owner approval.', dependencies: { 'shared-dep': '1.0.0', missing: '1.0.0' } }));
  await writeFile(join(root, 'README.md'), 'A useful safety extension. token = "secret-sentinel"');
  await writeFile(join(root, 'index.ts'), "throw new Error('SCANNER MUST NOT EXECUTE'); pi.on('tool_call', () => {});");
  await writeFile(join(shared, 'package.json'), '{"name":"shared-dep","version":"1.0.0"}');
  await writeFile(join(shared, 'data.txt'), 'shared');
  const instructions = '---\nname: fixture-skill\ndescription: Review API contracts\n---\n# Contract review\nRead references/example.md only when needed.\n';
  await writeFile(join(skillDir, 'SKILL.md'), instructions);
  await mkdir(join(skillDir, 'references'));
  await writeFile(join(skillDir, 'references', 'example.md'), 'API contracts.');
  await writeFile(join(agentDir, 'auth.json'), '{"token":"private-global-sentinel"}');
  await writeFile(join(agentDir, 'settings.json'), JSON.stringify({ packages: ['npm:fixture-ext@1.0.0'] }));
  const settingsManager = SettingsManager.inMemory({});
  const modelRuntime = await ModelRuntime.create({ authPath: join(cwd, 'empty-auth.json'), modelsPath: null, refreshOnCreate: false });
  const resourceLoader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true, noSkills: true, noContextFiles: true, noPromptTemplates: true, noThemes: true });
  await resourceLoader.reload();
  const { session } = await createAgentSession({ cwd, agentDir, settingsManager, modelRuntime, resourceLoader, sessionManager: SessionManager.inMemory(cwd) });
  const skill: Skill = { name: 'fixture-skill', description: 'Review API contracts', baseDir: skillDir, filePath: join(skillDir, 'SKILL.md'), disableModelInvocation: false,
    sourceInfo: { path: join(skillDir, 'SKILL.md'), source: 'user', scope: 'user', origin: 'top-level' } };
  const baseContext = session.extensionRunner.createCommandContext();
  const ctx = { ...baseContext, getSystemPromptOptions: () => ({ cwd, skills: [skill] }), getSystemPrompt: () => formatSkillsForPrompt([skill]) };
  const active = { value: ['protect'] };
  const sent: string[] = [];
  const api: AuditApi = {
    getAllTools: () => [{ name: 'protect', description: 'Confirm destructive changes', parameters: Type.Object({}), exposure: 'direct',
      sourceInfo: { path: join(root, 'index.ts'), source: 'npm:fixture-ext@1.0.0', scope: 'user', origin: 'package' } }],
    getActiveTools: () => [...active.value], setActiveTools: names => { active.value = names; },
    getCommands: () => [{ name: 'protection', description: 'Configure safety approval', source: 'extension', sourceInfo: { path: join(root, 'index.ts'), source: 'npm:fixture-ext@1.0.0', scope: 'user', origin: 'package' } }],
    sendUserMessage: message => { if (typeof message !== 'string') throw new Error('Expected text'); sent.push(message); },
  };
  return { cwd, agentDir, root, shared, skill, instructions, ctx, api, active, sent, session, host: piHost(cwd, agentDir) };
}
