/**
 * Message processing utilities for the Neurai WebWallet
 * Functions for parsing, formatting, and analyzing chat messages
 */

/**
 * Interface for message-like objects used in getUnreadCount
 */
interface Message {
  deliveryKey?: string;
  [key: string]: unknown;
}

/**
 * Extracts bot model information from message text
 *
 * Parses message text to extract AI model information if present.
 * Supports formats like:
 * - [BOT]: [model-name]
 * - [BOT]: model-name
 * - [BOT] model-name
 *
 * @param text - The message text to parse
 * @returns Object containing cleaned text and extracted model name (or null)
 *
 * @example
 * extractBotModel("[BOT]: [google/gemma-3-1b] Hello!")
 * // Returns { cleanText: "Hello!", model: "google/gemma-3-1b" }
 *
 * extractBotModel("[BOT] gpt-4 Hi there")
 * // Returns { cleanText: "Hi there", model: "gpt-4" }
 *
 * extractBotModel("Regular message")
 * // Returns { cleanText: "Regular message", model: null }
 */
export function extractBotModel(text: string): { cleanText: string; model: string | null } {
  // Expected formats (at the start):
  // [BOT]: [google/gemma-3-1b]
  // [BOT]: google/gemma-3-1b
  // [BOT] google/gemma-3-1b
  const trimmed = text ?? "";

  // Try bracketed model name format: [BOT]: [model-name]
  const bracketed = /^\s*\[BOT\]\s*:?\s*\[([^\]]+)\]\s*\n?/i.exec(trimmed);
  if (bracketed) {
    return { cleanText: trimmed.slice(bracketed[0].length).trimStart(), model: bracketed[1].trim() };
  }

  // Try plain model name format: [BOT]: model-name or [BOT] model-name
  const plain = /^\s*\[BOT\]\s*:?\s*([^\n]+)\s*\n?/i.exec(trimmed);
  if (plain) {
    const remainder = plain[1].trim();
    const after = trimmed.slice(plain[0].length).trimStart();
    if (!remainder) {
      return { cleanText: after, model: null };
    }

    const tokens = remainder.split(/\s+/).filter(Boolean);
    const model = tokens[0] ?? null;
    const inlineText = tokens.slice(1).join(" ");
    const cleanText = [inlineText, after].filter(Boolean).join(" ").trimStart();

    return { cleanText, model };
  }

  return { cleanText: trimmed, model: null };
}

/**
 * Computes the expiration date for a message
 *
 * @param unixTimestamp - The message creation timestamp in seconds
 * @param messageExpiryHours - Number of hours until message expires (null = no expiry)
 * @param formatFn - Function to format the expiry timestamp
 * @returns Formatted expiry date string or undefined if no expiry
 *
 * @example
 * computeExpiresDate(1704067200, 24, formatUnixTimestampNoSecondsShortYear)
 * // Returns "01/02/24, 00:00" (24 hours after the timestamp)
 *
 * computeExpiresDate(1704067200, null, formatFn)
 * // Returns undefined (no expiry)
 */
export function computeExpiresDate(
  unixTimestamp: number,
  messageExpiryHours: number | null,
  formatFn: (timestamp: number) => string
): string | undefined {
  if (!messageExpiryHours || messageExpiryHours <= 0) return undefined;
  const expiresAt = unixTimestamp + messageExpiryHours * 60 * 60;
  return formatFn(expiresAt);
}

/**
 * Counts unread messages for a conversation
 *
 * Calculates the number of messages that have arrived after the last-read message.
 * If no last-read message exists, all messages are considered unread.
 *
 * @param address - The address/tab key for the conversation
 * @param lastReadMap - Map of addresses to last-read message delivery keys
 * @param messagesMap - Map of addresses to arrays of messages
 * @returns Number of unread messages
 *
 * @example
 * getUnreadCount("NXYZabc...", lastReadMessageByTab, messagesByTab)
 * // Returns 3 (3 messages after last-read message)
 *
 * getUnreadCount("NXYZabc...", new Map(), messagesByTab)
 * // Returns 10 (all messages unread - no last-read marker)
 */
export function getUnreadCount(
  address: string,
  lastReadMap: Map<string, string>,
  messagesMap: Map<string, Message[]>
): number {
  const lastRead = lastReadMap.get(address);
  const tabMessages = messagesMap.get(address) || [];

  if (!lastRead || tabMessages.length === 0) {
    return tabMessages.length;
  }

  const lastReadIndex = tabMessages.findIndex(m => m.deliveryKey === lastRead);
  if (lastReadIndex === -1) {
    return tabMessages.length;
  }

  return Math.max(0, tabMessages.length - lastReadIndex - 1);
}
