import * as core from '@actions/core';
import axios from 'axios';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

function getConfig() {
  const token = core.getInput('telegram-bot-token');
  const chatId = core.getInput('telegram-chat-id');
  return { token, chatId };
}

function parseBooleanInput(value: string, fallback = true): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
}

export function isEnabled(): boolean {
  const { token, chatId } = getConfig();
  return Boolean(token && chatId);
}

export function isPurchaseNotificationEnabled(): boolean {
  const value = core.getInput('telegram-notify-purchase') || process.env.TELEGRAM_NOTIFY_PURCHASE || 'true';
  return parseBooleanInput(value, true);
}

export async function sendMessage(text: string): Promise<void> {
  const { token, chatId } = getConfig();

  if (!token || !chatId) {
    return;
  }

  try {
    await axios.post(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`[Telegram] Failed to send message: ${error.message}`);
    } else if (error instanceof Error) {
      console.error(`[Telegram] Failed to send message: ${error.message}`);
    } else {
      console.error('[Telegram] Failed to send message:', error);
    }
  }
}
