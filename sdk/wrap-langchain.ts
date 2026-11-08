// rein.wrap() for LangChain
// Note: Install @langchain/core for actual usage
type RunnableConfig = any;
type StructuredTool = {
  name: string;
  description: string;
  schema: any;
  func: (input: any, config?: RunnableConfig) => Promise<any>;
};

export interface ReinWrapOptions {
  reinBaseUrl: string;
  reinToken?: string;
}

/**
 * Wrap a LangChain StructuredTool to go through Rein gate.
 * 
 * Example:
 * ```ts
 * import { wrap } from 'rein/sdk/wrap-langchain';
 * import { DynamicStructuredTool } from '@langchain/core/tools';
 * import { z } from 'zod';
 * 
 * const refundTool = new DynamicStructuredTool({
 *   name: 'refund_items',
 *   description: 'Refund items',
 *   schema: z.object({
 *     capture_id: z.string(),
 *     items: z.array(z.object({ item_id: z.string(), qty: z.number() }))
 *   }),
 *   func: async ({ capture_id, items }) => {
 *     // Original implementation
 *   }
 * });
 * 
 * const gatedRefund = wrap(refundTool, {
 *   reinBaseUrl: 'http://localhost:4317',
 *   reinToken: process.env.REIN_TOKEN
 * });
 * ```
 */
export function wrap<T extends StructuredTool>(tool: T, options: ReinWrapOptions): T {
  const originalFunc = tool.func.bind(tool);

  // Clone the tool with gated execution
  const gatedTool = Object.create(Object.getPrototypeOf(tool));
  Object.assign(gatedTool, tool);

  gatedTool.func = async function (input: any, config?: RunnableConfig) {
    // Call Rein /v1/check endpoint
    const checkResponse = await fetch(`${options.reinBaseUrl}/v1/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.reinToken ? { Authorization: `Bearer ${options.reinToken}` } : {}),
      },
      body: JSON.stringify({
        tool: tool.name,
        captureId: input.capture_id,
        amountCents: input.amount ? Math.round(parseFloat(input.amount.value) * 100) : null,
        items: input.items || null,
      }),
    });

    const checkResult: any = await checkResponse.json();

    if (checkResult.status === 'blocked') {
      throw new Error(`Rein blocked: ${checkResult.reason}`);
    }

    if (checkResult.status === 'pending_approval') {
      throw new Error(`Rein escalated: ${checkResult.reason}. Approval required at ${checkResult.approvalUrl}`);
    }

    // Execute original tool
    const result = await originalFunc(input, config);

    // Report back to Rein
    await fetch(`${options.reinBaseUrl}/v1/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.reinToken ? { Authorization: `Bearer ${options.reinToken}` } : {}),
      },
      body: JSON.stringify({
        actionId: checkResult.actionId,
        approved: true,
        approverEmail: 'system',
      }),
    });

    return result;
  };

  return gatedTool as T;
}
