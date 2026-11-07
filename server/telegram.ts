// Telegram Bot integration for approval notifications
// Sends approval requests to Telegram, receives approve/deny responses

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface ApprovalNotification {
  actionId: string;
  amountCents: number;
  currency: string;
  ruleId: string;
  reason: string;
  approvalUrl: string;
  sessionId: string;
  tool: string;
  captureId?: string;
  payeeEmail?: string;
}

export async function sendTelegramApproval(
  config: TelegramConfig,
  notification: ApprovalNotification
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const { botToken, chatId } = config;

  const amount = `${(notification.amountCents / 100).toFixed(2)} ${notification.currency}`;
  const actionType = notification.tool === 'create_payout' ? 'Payout' : 'Refund';
  const target = notification.payeeEmail || notification.captureId || 'Unknown';

  const message = `
🔔 *Approval Required*

*Type:* ${actionType}
*Amount:* \`${amount}\`
*Target:* \`${target}\`
*Rule:* \`${notification.ruleId}\`
*Reason:* ${notification.reason}

*Session:* \`${notification.sessionId}\`
*Action ID:* \`${notification.actionId}\`

[Open Approval Page](${notification.approvalUrl})

_Note: This is a ${process.env.REIN_MODE === 'live' ? 'LIVE' : 'SIMULATED'} request_
  `.trim();

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };

    if (!data.ok) {
      return { ok: false, error: data.description || 'Telegram API error' };
    }

    return { ok: true, messageId: data.result?.message_id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function sendTelegramResult(
  config: TelegramConfig,
  actionId: string,
  decision: 'approved' | 'denied',
  executionStatus?: 'executed' | 'failed' | 'pending'
): Promise<{ ok: boolean; error?: string }> {
  const { botToken, chatId } = config;

  const emoji = decision === 'approved' ? '✅' : '❌';
  const statusText = executionStatus
    ? executionStatus === 'executed'
      ? ' → Executed ✓'
      : executionStatus === 'failed'
      ? ' → Execution Failed'
      : ' → Pending Execution'
    : '';

  const message = `
${emoji} *${decision.charAt(0).toUpperCase() + decision.slice(1)}*${statusText}

*Action ID:* \`${actionId}\`
  `.trim();

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    const data = await response.json() as { ok: boolean; description?: string };

    if (!data.ok) {
      return { ok: false, error: data.description || 'Telegram API error' };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export function getTelegramConfig(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return null;
  }

  return { botToken, chatId };
}

export function isTelegramEnabled(): boolean {
  return !!getTelegramConfig();
}
