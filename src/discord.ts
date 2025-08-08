import fetch from 'node-fetch';
import { logger } from './logger.js';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

export async function sendDiscordMessage(content: string) {
  if (!DISCORD_WEBHOOK_URL) {
    logger.warn('DISCORD_WEBHOOK_URL not set; skip sending message');
    return;
  }
  const body = { content };
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord webhook failed ${res.status}: ${text}`);
  }
}
