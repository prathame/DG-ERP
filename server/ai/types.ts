import type { AccessLevel } from '../middleware/permissions';

export type ToolRisk = 'read' | 'prepare' | 'write';

export type ToolContext = {
  tenantId: string;
  userId: string;
  userName: string;
  role: string;
  permissions: Record<string, AccessLevel> | null | undefined;
  correlationId?: string;
};

export type ToolResult = Record<string, unknown>;

export type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; items?: unknown }>;
    required?: string[];
  };
};

export type AiTool = {
  name: string;
  description: string;
  risk: ToolRisk;
  module: string;
  need: AccessLevel;
  /** When false, the handler exists for /api/chatbot fallback only — not sent to Gemini. */
  exposeToModel?: boolean;
  declaration: GeminiFunctionDeclaration;
  handler: (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolResult>;
};

export type InvoicePreview = {
  kind: 'invoice_only';
  stockNote: string;
  customerName: string;
  partyType: string;
  partyId: string;
  items: Array<{
    productId: string;
    description: string;
    qty: number;
    unit: string;
    rate: number;
    gstPercent: number;
    taxable: number;
    tax: number;
    total: number;
    stock: number;
    stockWarning: string | null;
  }>;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
};

export type PendingInvoicePayload = {
  partyType: 'vendor' | 'customer';
  partyId: string;
  customerName: string;
  customerGstin: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  items: Array<{
    productId: string;
    qty: number;
    unit: string;
    description: string;
    hsnSac?: string;
    gstPercent: number;
  }>;
};

export type AssistantAction = { type: string; params: Record<string, string> };

export type AssistantPending = {
  id: string;
  type: 'create_invoice';
  preview: InvoicePreview;
  expiresAt: string;
};

export type AssistantResponse = {
  text: string;
  action?: AssistantAction;
  pendingAction?: AssistantPending;
  toolsUsed?: string[];
};
