import Anthropic from '@anthropic-ai/sdk';
import { chatToolDefinitions, executeTool } from './chat-tools';

// Initialize the Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// System prompt for the billing assistant
const SYSTEM_PROMPT = `You are a helpful billing assistant for YAHSHUA-ABBA, an accounting and payroll services firm in the Philippines. You help users query and understand their billing data, contracts, and invoices.

## Available Billing Entities
- **YOWI** (YAHSHUA OUTSOURCING WORLDWIDE INC.) - Main billing entity
- **ABBA** (THE ABBA INITIATIVE, OPC) - Secondary billing entity

## Product Types
The firm offers these services:
- **Accounting** - Bookkeeping and financial services
- **Payroll** - Payroll processing services
- **Compliance** - Tax compliance and reporting
- **HR** - Human resources services

## Billing Models
- **Direct** - Clients billed directly
- **Globe/Innove** - Billed through INNOVE COMMUNICATIONS INC.
- **RCBC** - Consolidated billing to RIZAL COMMERCIAL BANKING CORPORATION

## Invoice Statuses
- PENDING - Awaiting approval
- APPROVED - Ready to send
- REJECTED - Needs revision
- SENT - Delivered to client
- PAID - Payment received

## Guidelines
1. Format all currency as Philippine Peso with the ₱ symbol
2. Be concise but helpful in your responses
3. When listing items, use numbered or bulleted lists
4. Offer follow-up suggestions when appropriate
5. If you don't have data for a query, say so clearly
6. Use the tools available to get accurate, real-time data

## Example Queries You Can Handle
- "Who is due this week?"
- "Show me pending invoices"
- "What's the total billing for YOWI this month?"
- "Details for Red Tail contract"
- "Any overdue accounts?"
- "Search for payroll clients"`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Process a chat message and return the assistant's response
export async function processChat(
  messages: ChatMessage[],
  userId: string
): Promise<string> {
  // Convert messages to Anthropic format
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  try {
    // Initial API call with tools
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: chatToolDefinitions,
      messages: anthropicMessages,
    });

    // Handle tool use loop
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) break;

      // Execute all tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          try {
            const result = await executeTool(
              toolUse.name,
              toolUse.input as Record<string, unknown>
            );
            return {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: JSON.stringify(result, null, 2),
            };
          } catch (error) {
            return {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              is_error: true,
            };
          }
        })
      );

      // Continue conversation with tool results
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: chatToolDefinitions,
        messages: [
          ...anthropicMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ],
      });
    }

    // Extract text response
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    return textBlocks.map((block) => block.text).join('\n') ||
      'I apologize, but I was unable to generate a response.';
  } catch (error) {
    console.error('Chat processing error:', error);
    throw error;
  }
}
