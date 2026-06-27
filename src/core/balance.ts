import type { BrowserSession } from './browser';
import { GOTO_TIMEOUT, URLS } from './config';

const BALANCE_PATTERNS = [
  /(?:예치금|보유예치금|예치금\s*잔액|잔액)\s*(?:잔액|현재잔액|보유금액)?\s*[:：]?\s*([0-9,]+)\s*원/,
  /([0-9,]+)\s*원\s*(?:예치금|보유예치금|잔액)/
];

function parseDepositBalance(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();

  for (const pattern of BALANCE_PATTERNS) {
    const match = normalized.match(pattern);
    const amount = match?.[1];
    if (amount) {
      return `${amount}원`;
    }
  }

  return null;
}

export async function getDepositBalance(session: BrowserSession): Promise<string | null> {
  if (!session.isAuthenticated()) {
    throw new Error('Not authenticated. Login first');
  }

  const page = session.getPage();

  console.log('[Balance] Navigating to my page');
  await page.goto(URLS.MY_PAGE_HOME, { waitUntil: 'load', timeout: GOTO_TIMEOUT });

  const bodyText = await page.locator('body').innerText({ timeout: GOTO_TIMEOUT });
  const balance = parseDepositBalance(bodyText);

  if (!balance) {
    const snippet = bodyText.replace(/\s+/g, ' ').slice(0, 300);
    console.warn(`[Balance] Failed to parse deposit balance from my page: ${snippet}`);
    return null;
  }

  console.log(`[Balance] Deposit balance parsed: ${balance}`);
  return balance;
}
