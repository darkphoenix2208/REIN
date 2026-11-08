// Example: Using rein.wrap() with different frameworks

// ============================================
// Example 1: LangChain
// ============================================
import { wrap as wrapLangChain } from '../sdk/wrap-langchain.ts';

// Simulated LangChain tool
class FakeLangChainTool {
  name = 'refund_items';
  description = 'Refund items from an order';
  schema = {};
  
  async func({ capture_id, items }: { capture_id: string; items: any[] }) {
    console.log(`Refunding ${items.length} items from ${capture_id}`);
    return { refunded: true };
  }
}

const langchainTool = new FakeLangChainTool();

const gatedLangChainTool = wrapLangChain(langchainTool as any, {
  reinBaseUrl: 'http://localhost:4317',
  reinToken: process.env.REIN_TOKEN,
});

// Use the gated tool
// await gatedLangChainTool.func({ capture_id: 'CAP123', items: [{ item_id: 'mug', qty: 1 }] });

// ============================================
// Example 2: OpenAI Swarm
// ============================================
import { wrap as wrapOpenAI } from '../sdk/wrap-openai.ts';

const swarmFunction = {
  name: 'refund_items',
  description: 'Refund items',
  parameters: {
    type: 'object',
    properties: {
      capture_id: { type: 'string' },
      items: { type: 'array' }
    }
  },
  function: async ({ capture_id, items }: any) => {
    console.log(`Refunding ${items.length} items from ${capture_id}`);
    return { refunded: true };
  }
};

const gatedSwarmFunction = wrapOpenAI(swarmFunction, {
  reinBaseUrl: 'http://localhost:4317',
  reinToken: process.env.REIN_TOKEN,
});

// Use the gated function
// await gatedSwarmFunction.function({ capture_id: 'CAP456', items: [{ item_id: 'mug', qty: 1 }] });

// ============================================
// Example 3: Claude SDK (MCP Proxy)
// ============================================
// For Claude, use the MCP proxy (server/proxy.ts) which wraps tools automatically.
// See docs/Integration/MCP_SETUP.md for details.

console.log('Wrapper examples loaded. Use these patterns in your agent setup.');
