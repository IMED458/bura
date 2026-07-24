import { ChatMessage } from '../types/game';

// Swear words filter for Georgian and English
const FORBIDDEN_WORDS = [
  'ყლე', 'ბოზი', 'ნაბოზარი', 'ტრაკი', 'დედამოტყნული', 'fuck', 'shit', 'bitch', 'asshole', 'cunt',
];

// Per-sender timestamps for lightweight client-side rate limiting (3 msgs / 2s).
const senderMessageLog = new Map<string, number[]>();

export function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

export function filterProfanity(text: string): string {
  let cleaned = text;
  for (const word of FORBIDDEN_WORDS) {
    const regex = new RegExp(word, 'gi');
    cleaned = cleaned.replace(regex, '***');
  }
  return cleaned;
}

export function validateChatMessage(
  senderId: string,
  senderName: string,
  rawText: string
): { valid: boolean; error?: string; message?: Omit<ChatMessage, 'id'> } {
  const clean = sanitizeText(rawText);
  if (!clean) return { valid: false, error: 'შეტყობინება ცარიელია' };
  if (clean.length > 200) return { valid: false, error: 'შეტყობინება ძალიან გრძელია (მაქს. 200 სიმბოლო)' };

  const now = Date.now();
  const recent = (senderMessageLog.get(senderId) || []).filter((t) => now - t < 2000);
  if (recent.length >= 3) return { valid: false, error: 'გთხოვთ დაიცვათ პაუზა შეტყობინებებს შორის' };
  recent.push(now);
  senderMessageLog.set(senderId, recent);

  return {
    valid: true,
    message: {
      senderId,
      senderName: sanitizeText(senderName),
      text: filterProfanity(clean),
      timestamp: now,
      isSystem: false,
      type: 'chat',
    },
  };
}

export function createSystemMessage(text: string, type: ChatMessage['type'] = 'chat'): Omit<ChatMessage, 'id'> {
  return {
    senderId: 'system',
    senderName: 'სისტემა',
    text,
    timestamp: Date.now(),
    isSystem: true,
    type,
  };
}
