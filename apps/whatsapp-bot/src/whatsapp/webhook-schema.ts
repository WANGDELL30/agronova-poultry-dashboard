import { z } from 'zod';

// Only the fields the bot reads. Meta adds fields over time, so unknown keys are ignored.
const messageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string().regex(/^\d+$/),
  type: z.string().min(1),
  text: z.object({ body: z.string() }).optional(),
});

const webhookSchema = z.object({
  object: z.string(),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              field: z.string().optional(),
              value: z
                .object({
                  metadata: z.object({ phone_number_id: z.string() }).optional(),
                  messages: z.array(messageSchema).optional(),
                })
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

export interface InboundMessage {
  id: string;
  /** Sender's number: country code and digits, as WhatsApp reports it. */
  from: string;
  sentAt: Date;
  /** Null for anything that is not a text message (image, audio, location, ...). */
  text: string | null;
}

/**
 * Extracts user messages from a webhook delivery. Returns null when the payload is not a WhatsApp
 * delivery at all. Delivery/read status notifications yield an empty list.
 *
 * @param phoneNumberId when given, messages addressed to another business number are dropped.
 */
export function extractInboundMessages(
  payload: unknown,
  phoneNumberId: string | null,
): InboundMessage[] | null {
  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success || parsed.data.object !== 'whatsapp_business_account') return null;
  const messages: InboundMessage[] = [];
  for (const entry of parsed.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;
      if (phoneNumberId && value.metadata && value.metadata.phone_number_id !== phoneNumberId) {
        continue;
      }
      for (const message of value.messages) {
        messages.push({
          id: message.id,
          from: message.from,
          sentAt: new Date(Number(message.timestamp) * 1000),
          text: message.type === 'text' && message.text ? message.text.body : null,
        });
      }
    }
  }
  return messages;
}
