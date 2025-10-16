import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { LlmService } from '#lib/llm/llm.service';
import { Logger } from '@nestjs/common';

@Workflow({
  name: 'Miami Distro - Handle Cliq Notification Subscription',
  webhook: true,
  concurrency: 10,
})
export class MiamiDistroHandleNotificationSubscriptionWorkflow extends WorkflowBase {
  constructor(
    private readonly zohoService: ZohoService,
    private readonly llmService: LlmService,
  ) {
    super();
  }

  private logger = new Logger(
    MiamiDistroHandleNotificationSubscriptionWorkflow.name,
  );

  private expandBotMentions(message: any) {
    let text: string = message?.text ?? message.content.text;
    const mentions = Array.isArray(message?.mentions)
      ? message.mentions
      : typeof message?.mentions === 'object'
        ? Object.values(message?.mentions)
        : [];

    for (const mention of mentions) {
      text = text.replaceAll(`{@${mention.id}}`, `@${mention.name}`);
    }

    return text;
  }

  @Step(1)
  async execute() {
    const { user, message_details, chat } = this.payload;
    const { message } = message_details;

    // Determine scope, either 'dm' or 'channel'
    const scope = chat.type === 'bot' || chat.type === 'dm' ? 'dm' : 'channel';

    // Fetch recent messages from the chat
    // For DMs, fetch last 10 messages; for channels, fetch last 50 messages
    // This is to ensure we have enough context in channels where there may be more activity
    // and the bot may not be mentioned in every message
    // We will filter these messages later to find relevant ones

    const {
      data: { data: messages },
    } = await this.zohoService.get(
      `/v2/chats/${chat.id}/messages?limit=${scope === 'dm' ? 10 : 50}`,
      {
        connection: 'miami_distro',
        baseURL: 'https://cliq.zoho.com/api',
      },
    );

    const db = scope === 'channel' ? 'kartkonnectchannels' : 'kartkonnectusers';
    // Fetch current subscriptions from the database
    const subscriptions: { id: string; topic: string }[] = [];

    await this.zohoService.iterateCliqDB<{ id: string; topic: string }>({
      connection: 'miami_distro',
      db,
      criteria:
        scope === 'channel'
          ? `channel==${chat.channel_unique_name}`
          : `userid==${user.id}`,
      callback(i) {
        subscriptions.push(i);
      },
    });

    // Build message history for LLM input
    const history = messages
      .filter((msg) => {
        if (msg.type !== 'text') {
          return false;
        }

        if (scope === 'dm') {
          return true;
        }

        if (
          msg.message_source?.type === 'bot' &&
          msg.message_source.name === 'KartKonnect'
        ) {
          return true;
        }

        return msg.replied_to?.sender?.name === 'KartKonnect';
      })
      .slice(-10)
      .map((msg) => {
        const role =
          (msg.message_source?.type === 'bot' &&
            msg.message_source?.name === 'KartKonnect') ||
          msg.sender.id.startsWith('b-')
            ? 'assistant'
            : 'user';

        return {
          role,
          content:
            role === 'user'
              ? this.expandBotMentions(msg)
              : JSON.stringify({
                  response: this.expandBotMentions(msg),
                }),
        };
      });

    // Add system prompt and user message to the history
    const context = {
      scope,
      channel_name: chat.title,
      user_id: user.id,
      user_name: user.first_name || user.last_name,
      current_subscriptions: subscriptions.map((s) => s.topic),
    };

    const systemPrompt = `
You are KartKonnect — the Zoho Cliq bot for WooCommerce ↔ Zoho integration.

Speak as KartKonnect in first person ("I", "me") with a friendly, concise tone.
Never refer to yourself as "assistant" or "AI" — you ARE KartKonnect.

You manage notification preferences for channels and individual users.

### Supported Notification Types
- "new_order" → new orders pushed from WooCommerce to Zoho
- "new_customer" → Zoho CRM contacts synced to WooCommerce

---

### Context
${JSON.stringify(context, null, 2)}

Interpretation rules:
1. If scope = "channel", refer to “this channel”.
2. If scope = "dm", refer to “you” directly.
3. Use the user_name when addressing personally (e.g., “Got it, ${user.first_name || user.last_name}!”).
4. Use the "{@user_id}" to mention (e.g., “You're welcome!, {@${context.user_id}}”).

Behavior rules:
- If the user asks to subscribe to a topic they’re already subscribed to, say they’re already subscribed.
- If they ask to unsubscribe from a topic they’re not subscribed to, say they’re not currently subscribed.
- If they ask for a type you don’t handle, clarify you only manage the supported types.
- If unclear, greet naturally (like a human) and redirect to your purpose.

Return **ONLY valid JSON** in this schema:
{
  "subscribe": ["new_order"|"new_customer", ...] | [] | null,
  "unsubscribe": ["new_order"|"new_customer", ...] | [] | null,
  "response": "string"
}
`;

    const client = this.llmService.getClient('hbh');

    const res = await client.chat.completions.create({
      model: 'meta/llama-3.3-70b-instruct',
      temperature: 0.5,
      max_completion_tokens: 512,
      stream: false,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...history,
        {
          role: 'user',
          content:
            this.expandBotMentions(message) +
            '\n\nRespond ONLY in valid JSON as per the format described above.',
        },
      ],
    });

    const output = res.choices[0].message.content as string;
    const match = output.match(/\{[\s\S]*\}/);
    const outputJson = match
      ? JSON.parse(match[0])
      : {
          subscribe: null,
          unsubscribe: null,
          response: 'Something went wrong. Please try again.',
        };

    if (!this.responseMetaSent) {
      await this.sendResponseMeta({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      await this.sendResponse(JSON.stringify(outputJson), true);
    }

    if (outputJson.unsubscribe?.length) {
      for (const topic of outputJson.unsubscribe) {
        const subscription = subscriptions.find((s) => s.topic === topic);

        try {
          await this.zohoService.delete(
            `/v2/storages/${db}/records/${subscription?.id}`,
            {
              connection: 'miami_distro',
              baseURL: 'https://cliq.zoho.com/api',
            },
          );
        } catch (e) {
          this.logger.error(`Failed to unsubscribe from ${topic}`, e);
        }
      }
    }

    if (outputJson.subscribe?.length) {
      for (const topic of outputJson.subscribe) {
        try {
          await this.zohoService.post(
            `/v2/storages/${db}/records`,
            {
              values: {
                [scope === 'channel' ? 'channel' : 'userid']:
                  scope === 'channel' ? chat.channel_unique_name : user.id,
                topic,
              },
            },
            {
              connection: 'miami_distro',
              baseURL: 'https://cliq.zoho.com/api',
            },
          );
        } catch (e) {
          this.logger.error(`Failed to subscribe ${topic}`, e);
        }
      }
    }

    return {
      context,
      res,
    };
  }
}
