// rein.wrap() for OpenAI Agents SDK (Swarm)
export interface ReinWrapOptions {
  reinBaseUrl: string;
  reinToken?: string;
}

export interface SwarmFunction {
  name: string;
  description: string;
  parameters: object;
  function: (args: any) => any | Promise<any>;
}

/**
 * Wrap an OpenAI Swarm function to go through Rein gate.
 * 
 * Example:
 * ```ts
 * import { wrap } from 'rein/sdk/wrap-openai';
 * 
 * const refundFunction = {
 *   name: 'refund_items',
 *   description: 'Refund items',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       capture_id: { type: 'string' },
 *       items: { type: 'array' }
 *     }
 *   },
 *   function: async ({ capture_id, items }) => {
 *     // Original refund logic
 *   }
 * };
 * 
 * const gatedRefund = wrap(refundFunction, {
 *   reinBaseUrl: 'http://localhost:4317',
 *   reinToken: process.env.REIN_TOKEN
 * });
 * ```
 */
export function wrap(swarmFunc: SwarmFunction, options: ReinWrapOptions): SwarmFunction {
  const originalFunction = swarmFunc.function;

  return {
    ...swarmFunc,
    function: async (args: any) => {
      // Call Rein /v1/check
      const checkResponse = await fetch(`${options.reinBaseUrl}/v1/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.reinToken ? { Authorization: `Bearer ${options.reinToken}` } : {}),
        },
        body: JSON.stringify({
          tool: swarmFunc.name,
          captureId: args.capture_id,
          amountCents: args.amount ? Math.round(parseFloat(args.amount.value) * 100) : null,
          items: args.items || null,
        }),
      });

      const checkResult = await checkResponse.json();

      if (checkResult.status === 'blocked') {
        return { error: `Blocked by Rein: ${checkResult.reason}` };
      }

      if (checkResult.status === 'pending_approval') {
        return { 
          error: `Escalated by Rein: ${checkResult.reason}`,
          approvalUrl: checkResult.approvalUrl 
        };
      }

      // Execute original function
      const result = await originalFunction(args);

      // Report result to Rein
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
    },
  };
}
