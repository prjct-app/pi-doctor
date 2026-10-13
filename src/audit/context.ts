import { formatSkillsForPrompt, type Skill, type SessionProjection, type ToolInfo } from '@earendil-works/pi-coding-agent';
import { resolve, relative } from 'node:path';
import { record } from './files.ts';
import { estimate, type ContextCost } from './types.ts';

export const skillEntry = (skill: Skill): string => formatSkillsForPrompt([skill]).match(/  <skill>[\s\S]*?  <\/skill>/)?.[0] ?? '';
export const textContent = (content: unknown): string => typeof content === 'string' ? content
  : Array.isArray(content) ? content.filter(record).filter(item => item.type === 'text' && typeof item.text === 'string').map(item => item.text).join('\n') : '';
export type Observed = Readonly<{ tool: string; path?: string; text: string }>;

/** Only the active compaction/context-edit-aware projection; no session-file scan. */
export function observations(projection: SessionProjection, cwd: string): readonly Observed[] {
  const calls = new Map<string, { tool: string; path?: string }>();
  const outputs: Observed[] = [];
  for (const message of projection.messages) {
    if (message.role === 'assistant') {
      for (const block of message.content) {
        if (block.type !== 'toolCall') continue;
        const args: unknown = block.arguments;
        const path = record(args) && typeof args.path === 'string' ? resolve(cwd, args.path) : undefined;
        calls.set(block.id, { tool: block.name, path });
      }
    }
    if (message.role === 'toolResult' && !message.isError) {
      const call = calls.get(message.toolCallId);
      if (call) outputs.push({ ...call, text: textContent(message.content) });
    }
  }
  return outputs;
}

export function skillCost(skill: Skill, instructions: string, prompt: string, observed: readonly Observed[]): ContextCost {
  const fragment = skillEntry(skill);
  const reads = observed.filter(item => item.path && !relative(resolve(skill.baseDir), item.path).startsWith('..')
    && item.tool === 'read' && item.text.length > 0);
  const instructionReads = reads.filter(item => item.path === resolve(skill.filePath));
  return {
    catalog: estimate(fragment && prompt.includes(fragment) ? fragment : ''),
    instructions: estimate(instructions),
    retainedReads: estimate(reads.map(item => item.text).join('\n')),
    readCount: reads.length,
    observedCalls: instructionReads.length,
    notes: [
      'Catalog = entry present in current system prompt; shared wrapper excluded.',
      'Instructions = potential full-file load (bounded excerpt), not current injection.',
      'Retained reads = observed direct read outputs, including references and repeated reads.',
      'Bash/codemode/explicit skill expansion and dynamic injection attribution are unknown.',
      'Compacted or context-edited content is excluded; no global usage history.',
    ],
  };
}

export function extensionCost(tools: readonly ToolInfo[], active: readonly string[], hidden: readonly string[], observed: readonly Observed[]): ContextCost {
  const declared = tools.filter(tool => active.includes(tool.name) && !hidden.includes(tool.name));
  const owned = new Set(tools.map(tool => tool.name));
  const outputs = observed.filter(item => owned.has(item.tool));
  return {
    declarations: estimate(declared.length ? JSON.stringify(declared.map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters, promptGuidelines: tool.promptGuidelines }))) : ''),
    retainedReads: estimate(outputs.map(item => item.text).join('\n')),
    readCount: 0,
    observedCalls: outputs.length,
    notes: [
      'Declarations = pre-provider/pre-loadout JSON estimate, not exact final injection.',
      'Tool outputs = successful retained direct results, not lifetime invocation count.',
      'Dynamic prompt/messages and indirect tool use are unattributable (unknown).',
      'A UI/hook extension can provide value without model tool calls.',
    ],
  };
}
