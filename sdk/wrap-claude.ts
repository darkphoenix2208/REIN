// rein.wrap() for Anthropic Claude SDK
import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export interface ReinWrapOptions {
  reinBaseUrl: string;
  reinToken?: string;
}

/**
 * Wrap a Claude SDK tool to go through Rein gate.
 * 
 * Example:
 * ```ts
 * import { wrap } from 'rein/sdk/wrap-claude';
 * 
 * const refundTool: Tool = {
 *   name: 'refund_items',
 *   description: 'Refund items from an order',
 *   input_schema: {
 *     type: 'object',
 *     properties: {
 *       capture_id: { type: 'string' },
 *       items: { type: 'array', items: { type: 'object' } }
 *     }
 *   }
 * };
 * 
 * const gatedRefund = wrap(refundTool, {
 *   reinBaseUrl: 'http://localhost:4317',
 *   reinToken: process.env.REIN_TOKEN
 * });
 * ```
 */
export function wrap(tool: Tool, options: ReinWrapOptions): Tool {
  return {
    ...tool,
    // Intercept tool execution via tool_use content block
    // This wrapper is conceptual: Claude SDK doesn't expose a server-side hook.
    // In practice, you'd use the MCP proxy or REST client.
  };
}

// Note: Anthropic's SDK doesn't provide server-side tool execution hooks.
// For Claude, use the MCP proxy (server/proxy.ts) which already wraps tools.
// This module demonstrates the API pattern for documentation purposes.
