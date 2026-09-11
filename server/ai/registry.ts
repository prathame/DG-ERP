import type { AiTool, GeminiFunctionDeclaration } from './types';

const tools = new Map<string, AiTool>();

export function registerTool(tool: AiTool): void {
  tools.set(tool.name, tool);
}

export function getTool(name: string): AiTool | undefined {
  return tools.get(name);
}

export function listTools(): AiTool[] {
  return [...tools.values()];
}

export function geminiFunctionDeclarations(): GeminiFunctionDeclaration[] {
  return listTools()
    .filter(t => t.exposeToModel !== false)
    .map(t => t.declaration);
}
