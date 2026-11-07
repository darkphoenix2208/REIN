// Slack integration for approval notifications
// Uses Slack Web API and Block Kit for interactive messages

export interface SlackConfig {
  botToken: string; // SLACK_BOT_TOKEN
  approvalChannelId: string; // SLACK_APPROVAL_CHANNEL
}

export interface SlackApprovalMessage {
  actionId: string;
  amountCents: number;
  reason: string;
  approvalUrl: string;
  customerEmail?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Get Slack configuration from environment
 */
export function getSlackConfig(): SlackConfig | null {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_APPROVAL_CHANNEL;
  
  if (!botToken || !channelId) return null;
  
  return { botToken, approvalChannelId: channelId };
}

/**
 * Check if Slack is configured and enabled
 */
export function isSlackEnabled(): boolean {
  return getSlackConfig() !== null;
}

/**
 * Send approval request to Slack channel with interactive buttons
 */
export async function sendApprovalRequest(message: SlackApprovalMessage, config?: SlackConfig | null): Promise<boolean> {
  const slackConfig = config ?? getSlackConfig();
  if (!slackConfig) return false;
  
  const blocks = buildApprovalBlocks(message);
  
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackConfig.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackConfig.approvalChannelId,
        text: `Approval needed: ${message.reason}`,
        blocks,
      }),
    });
    
    const data = await response.json() as { ok: boolean; error?: string };
    
    if (!data.ok) {
      console.error('Slack API error:', data.error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Failed to send Slack message:', error);
    return false;
  }
}

/**
 * Build Slack Block Kit blocks for approval message
 */
function buildApprovalBlocks(message: SlackApprovalMessage) {
  const amount = `$${(message.amountCents / 100).toFixed(2)}`;
  
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚨 Approval Required',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Action ID:*\n${message.actionId.slice(0, 12)}...`,
        },
        {
          type: 'mrkdwn',
          text: `*Amount:*\n${amount}`,
        },
        {
          type: 'mrkdwn',
          text: `*Reason:*\n${message.reason}`,
        },
        ...(message.customerEmail
          ? [{
              type: 'mrkdwn' as const,
              text: `*Customer:*\n${message.customerEmail}`,
            }]
          : []),
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✅ Approve',
            emoji: true,
          },
          style: 'primary',
          url: `${message.approvalUrl}?decision=approve`,
          action_id: 'approve_action',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '❌ Reject',
            emoji: true,
          },
          style: 'danger',
          url: `${message.approvalUrl}?decision=reject`,
          action_id: 'reject_action',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '👀 View Details',
            emoji: true,
          },
          url: message.approvalUrl,
          action_id: 'view_details',
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Click buttons above or visit <${message.approvalUrl}|approval page> to decide._`,
        },
      ],
    },
  ];
}

/**
 * Send notification after approval decision is made
 */
export async function sendApprovalResult(
  actionId: string,
  decision: 'approved' | 'rejected',
  approver: string,
  config?: SlackConfig | null
): Promise<boolean> {
  const slackConfig = config ?? getSlackConfig();
  if (!slackConfig) return false;
  
  const emoji = decision === 'approved' ? '✅' : '❌';
  const text = `${emoji} Action ${actionId.slice(0, 12)}... ${decision} by ${approver}`;
  
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackConfig.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackConfig.approvalChannelId,
        text,
      }),
    });
    
    const data = await response.json() as { ok: boolean };
    return data.ok;
  } catch {
    return false;
  }
}
