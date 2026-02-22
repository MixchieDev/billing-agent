import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  getContractsDueSoon,
  getContractDetails,
  getInvoiceStats,
  getPendingInvoices,
  getOverdueInvoices,
  searchContracts,
  getBillingTotals,
} from './chat-tools';

// Initialize Gemini
function getGemini() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set. Add it to your .env file.');
  }
  return createGoogleGenerativeAI({ apiKey });
}

const MODEL = 'gemini-2.5-flash';

// System prompt
const SYSTEM_PROMPT = `You are a helpful billing assistant for YAHSHUA-ABBA, an accounting and payroll services firm in the Philippines. You help users query and understand their billing data, contracts, and invoices.

## Available Billing Entities
- **YOWI** (YAHSHUA OUTSOURCING WORLDWIDE INC.) - Main billing entity
- **ABBA** (THE ABBA INITIATIVE, OPC) - Secondary billing entity

## Product Types: Accounting, Payroll, Compliance, HR

## Billing Models: Direct, Globe/Innove, RCBC

## Invoice Statuses: PENDING, APPROVED, REJECTED, SENT, PAID

## Guidelines
1. Format all currency as Philippine Peso with the ₱ symbol
2. Be concise but helpful
3. Use numbered or bulleted lists
4. Offer follow-up suggestions
5. Use the tools to get real-time data

## Cross-System Queries
You can also query data from other YAHSHUA systems:
- **CRM (Nexus)**: Use query_crm to search leads, agreements, contacts, companies
- **Smart Support**: Use query_smart_support to search support issues and tickets`;

// Tool definitions in OpenAI-compatible format (Gemini supports this)
const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_contracts_due_soon',
      description: 'Get contracts with billing dates coming up within the specified number of days.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to look ahead (default: 7)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_contract_details',
      description: 'Get detailed information about a specific contract by company name.',
      parameters: {
        type: 'object',
        properties: {
          companyName: { type: 'string', description: 'Company name to search for' },
        },
        required: ['companyName'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_invoice_stats',
      description: 'Get dashboard statistics for pending, approved, rejected, sent, and paid invoices.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_pending_invoices',
      description: 'Get list of invoices that are pending approval.',
      parameters: {
        type: 'object',
        properties: {
          billingEntity: { type: 'string', enum: ['YOWI', 'ABBA'], description: 'Filter by billing entity' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_overdue_invoices',
      description: 'Get list of invoices past their due date but not yet paid.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_contracts',
      description: 'Search contracts by company name or product type.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_billing_totals',
      description: 'Get billing totals and summary for a billing entity and/or time period.',
      parameters: {
        type: 'object',
        properties: {
          entity: { type: 'string', enum: ['YOWI', 'ABBA'], description: 'Billing entity code' },
          month: { type: 'string', description: 'Month in YYYY-MM format' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_crm',
      description: 'Query the CRM (Nexus) system for leads, agreements, contacts, or companies.',
      parameters: {
        type: 'object',
        properties: {
          entity: { type: 'string', enum: ['leads', 'agreements', 'contacts', 'companies', 'products'], description: 'What to query' },
          searchTerm: { type: 'string', description: 'Search term to filter results' },
        },
        required: ['entity'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_smart_support',
      description: 'Query the Smart Support system for users, clients, issues, or products. Use "users" to get user accounts with details, "clients" for client records, "issues" for support tickets.',
      parameters: {
        type: 'object',
        properties: {
          entity: { type: 'string', enum: ['users', 'issues', 'clients', 'products'], description: 'What to query: users (user accounts), clients (client records), issues (support tickets), products' },
          searchTerm: { type: 'string', description: 'Search term to filter results' },
        },
        required: ['entity'],
      },
    },
  },
];

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Execute tool by name
async function executeTool(name: string, args: Record<string, any>): Promise<unknown> {
  switch (name) {
    case 'get_contracts_due_soon':
      return getContractsDueSoon(args.days);
    case 'get_contract_details':
      return getContractDetails(args.companyName);
    case 'get_invoice_stats':
      return getInvoiceStats();
    case 'get_pending_invoices':
      return getPendingInvoices(args.billingEntity);
    case 'get_overdue_invoices':
      return getOverdueInvoices();
    case 'search_contracts':
      return searchContracts(args.query);
    case 'get_billing_totals':
      return getBillingTotals(args.entity, args.month);
    case 'query_crm': {
      try {
        const { getNexusBridgeHeaders, getNexusConvexUrl } = await import('./bridge-auth');
        const res = await fetch(getNexusConvexUrl('/bridge/query'), {
          method: 'POST',
          headers: getNexusBridgeHeaders(),
          body: JSON.stringify({ entity: args.entity, searchTerm: args.searchTerm, organizationId: process.env.NEXUS_ORGANIZATION_ID || '' }),
        });
        if (!res.ok) return { error: `CRM returned ${res.status}` };
        return res.json();
      } catch (e) {
        return { error: `CRM unreachable: ${(e as Error).message}` };
      }
    }
    case 'query_smart_support': {
      try {
        const ssUrl = process.env.SMART_SUPPORT_CONVEX_URL;
        const ssKey = process.env.SMART_SUPPORT_BRIDGE_API_KEY;
        if (!ssUrl || !ssKey) return { error: 'Smart Support not configured' };
        const res = await fetch(`${ssUrl}/bridge/query`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${ssKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity: args.entity, searchTerm: args.searchTerm }),
        });
        if (!res.ok) return { error: `Smart Support returned ${res.status}` };
        return res.json();
      } catch (e) {
        return { error: `Smart Support unreachable: ${(e as Error).message}` };
      }
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// Helper: Call Gemini with retry on 429
async function callGemini(
  apiKey: string,
  msgs: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }>
): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: msgs,
          tools,
          tool_choice: 'auto',
          max_tokens: 1024,
          temperature: 0.5,
        }),
      }
    );

    if (res.status === 429 && attempt < 2) {
      // Rate limited - wait and retry
      await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      // Parse error to provide user-friendly message
      try {
        const errData = JSON.parse(errText);
        if (errData[0]?.error?.code === 429) {
          throw new Error('The AI service is temporarily rate limited. Please try again in a moment.');
        }
      } catch {}
      throw new Error(`Gemini API error: ${res.status} - ${errText}`);
    }

    return await res.json();
  }
  throw new Error('The AI service is temporarily unavailable due to rate limits. Please try again in a moment.');
}

// Process a chat message using Gemini with tool calling
export async function processChat(
  messages: ChatMessage[],
  userId: string
): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set');

  // Build messages array for Gemini (OpenAI-compatible endpoint)
  const apiMessages: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Use Gemini via Google's OpenAI-compatible endpoint with retry
  let data = await callGemini(apiKey, apiMessages);
  let maxIterations = 5;

  // Tool calling loop
  while (maxIterations > 0) {
    const message = data.choices?.[0]?.message;
    if (!message) break;

    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) break;

    maxIterations--;

    // Add assistant message with tool calls
    apiMessages.push({
      role: 'assistant',
      content: message.content || '',
      tool_calls: toolCalls,
    });

    // Execute each tool call
    for (const toolCall of toolCalls) {
      const fnName = toolCall.function.name;
      const fnArgs = JSON.parse(toolCall.function.arguments || '{}');

      // Strip nulls
      const cleanArgs: Record<string, any> = {};
      for (const [k, v] of Object.entries(fnArgs)) {
        if (v !== null && v !== undefined) cleanArgs[k] = v;
      }

      const result = await executeTool(fnName, cleanArgs);

      apiMessages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
      });
    }

    // Continue conversation with retry
    data = await callGemini(apiKey, apiMessages);
  }

  return data.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response.';
}
