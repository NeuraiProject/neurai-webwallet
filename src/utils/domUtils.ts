/**
 * DOM manipulation utilities for the Neurai WebWallet
 * Functions for interacting with the browser DOM
 */

import { betterToast, betterAlert } from '../betterDialog';

/**
 * Interface for message-related maps used in scrollToLastUnread
 */
interface Message {
  id: number;
  deliveryKey?: string;
  [key: string]: unknown;
}

/**
 * Copies text to the system clipboard with fallback support
 *
 * Attempts to use the modern Clipboard API first, then falls back to
 * the legacy execCommand method for older browsers.
 *
 * @param text - The text to copy to clipboard
 * @returns Promise that resolves when copy is successful
 *
 * @example
 * await copyToClipboard("NSEax8pKQb78C1ZeMt4Nia9DgFfKDntmmf");
 * // Shows toast: "✓ Address copied"
 */
export async function copyToClipboard(text: string): Promise<void> {
  const value = (text ?? "").trim();
  if (!value) return;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = value;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      el.style.top = "-9999px";
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    betterToast("✓ Address copied");
  } catch (e) {
    console.error("Copy failed", e);
    betterAlert("Error", "Unable to copy address to clipboard");
  }
}

/**
 * Auto-resizes a textarea element to fit its content
 *
 * Dynamically adjusts the height of a textarea to match its scrollHeight,
 * allowing it to expand as the user types. When empty, reverts to minimum height.
 *
 * This function is used across multiple components (Chat, Login) to provide
 * consistent textarea auto-resize behavior.
 *
 * @param textarea - The textarea HTML element to resize
 * @param minHeight - Minimum height in pixels when empty (default: 44)
 *
 * @example
 * const textarea = document.querySelector('textarea');
 * autoResizeTextarea(textarea); // Expands to fit content with default minHeight
 *
 * @example
 * autoResizeTextarea(textarea, 48); // Custom minHeight for chat input
 */
export function autoResizeTextarea(textarea: HTMLTextAreaElement, minHeight = 44): void {
  // Reset height to allow shrinking
  textarea.style.height = "auto";
  const scrollHeight = textarea.scrollHeight;
  const height = textarea.value.trim() ? scrollHeight : minHeight;
  textarea.style.height = `${height}px`;
}

/**
 * @deprecated Use autoResizeTextarea instead
 * Kept for backwards compatibility
 */
export function autoResizeChatInput(textarea: HTMLTextAreaElement, minHeight = 48): void {
  autoResizeTextarea(textarea, minHeight);
}

/**
 * Scrolls to the first unread message in a chat tab
 *
 * If there's a last-read message, scrolls to the first message after it.
 * If no last-read message exists, scrolls to the bottom of the chat.
 *
 * @param tabKey - The identifier for the chat tab
 * @param lastReadMap - Map of tab keys to last-read message delivery keys
 * @param messagesMap - Map of tab keys to arrays of messages
 * @param refMap - Map of tab keys to end-of-messages div refs
 *
 * @example
 * scrollToLastUnread(
 *   "group",
 *   lastReadMessageByTab,
 *   messagesByTab,
 *   messagesEndRef.current
 * );
 */
export function scrollToLastUnread(
  tabKey: string,
  lastReadMap: Map<string, string>,
  messagesMap: Map<string, Message[]>,
  refMap: Map<string, HTMLDivElement | null>
): void {
  const lastReadId = lastReadMap.get(tabKey);
  const tabMessages = messagesMap.get(tabKey) || [];

  if (!lastReadId || tabMessages.length === 0) {
    // No hay último leído, ir al final
    const endRef = refMap.get(tabKey);
    if (endRef) {
      endRef.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    return;
  }

  // Buscar el primer mensaje no leído
  const lastReadIndex = tabMessages.findIndex(m => m.deliveryKey === lastReadId);
  if (lastReadIndex === -1 || lastReadIndex === tabMessages.length - 1) {
    // No encontrado o es el último, ir al final
    const endRef = refMap.get(tabKey);
    if (endRef) {
      endRef.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    return;
  }

  // Hacer scroll al primer mensaje no leído
  const firstUnreadId = tabMessages[lastReadIndex + 1]?.id;
  if (firstUnreadId) {
    const element = document.getElementById(`message-${firstUnreadId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}
