import { ChatMessage } from '../src/types/game';

// Swear words filter for Georgian and English
const FORBIDDEN_WORDS = [
  'ყლე', 'ბოზი', 'ნაბოზარი', 'ტრაკი', 'დედამოტყნული', 'fuck', 'shit', 'bitch', 'asshole', 'cunt'
];

// Simple in-memory player message timestamps for rate limiting (max 3 messages per 2 seconds)
const playerMessageLog = new Map<string, number[]>();

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
  playerId: string,
  senderName: string,
  rawText: string
): { valid: boolean; error?: string; message?: ChatMessage } {
  // 1. Sanitize text
  const clean = sanitizeText(rawText);
  if (!clean) {
    return { valid: false, error: 'შეტყობინება ცარიელია' };
  }

  if (clean.length > 200) {
    return { valid: false, error: 'შეტყობინება ძალიან გრძელია (მაქს. 200 სიმბოლო)' };
  }

  // 2. Rate limit check (Max 3 messages per 2 seconds)
  const now = Date.now();
  const timestamps = playerMessageLog.get(playerId) || [];
  const recent = timestamps.filter((t) => now - t < 2000);

  if (recent.length >= 3) {
    return { valid: false, error: 'გთხოვთ დაიცვათ პაუზა შეტყობინებებს შორის' };
  }

  recent.push(now);
  playerMessageLog.set(playerId, recent);

  // 3. Filter profanity
  const filtered = filterProfanity(clean);

  const message: ChatMessage = {
    id: `msg_${now}_${Math.random().toString(36).substr(2, 5)}`,
    senderId: playerId,
    senderName: sanitizeText(senderName),
    text: filtered,
    timestamp: now,
    isSystem: false,
    type: 'chat',
  };

  return { valid: true, message };
}

export function createSystemMessage(text: string, type: ChatMessage['type'] = 'chat'): ChatMessage {
  return {
    id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    senderId: 'system',
    senderName: 'სისტემა',
    text,
    timestamp: Date.now(),
    isSystem: true,
    type,
  };
}
