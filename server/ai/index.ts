import { registerAiTools } from './tools';

let registered = false;

export function ensureAiToolsRegistered(): void {
  if (registered) return;
  registerAiTools();
  registered = true;
}

export { runAssistantTurn, GeminiCallError } from './orchestrate';
export { getTool, listTools } from './registry';
export { confirmPendingInvoice, cancelPendingInvoice } from './pending';
export type { ToolContext } from './types';
