import type { BrowserSession } from './browser';
import { GOTO_TIMEOUT, URLS } from './config';

const MONEY_PATTERN = /([0-9,]+)\s*원/;
const DEPOSIT_LABEL_PATTERN = /예치금/;

function formatMoney(amount: string): string {
  return `${amount}원`;
}

function parseWon(value: string): string | null {
  const normalized = value.replace(/[^\d]/g, '');
  return normalized ? formatMoney(normalized) : null;
}

export function parseDepositBalance(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;

    if (!DEPOSIT_LABEL_PATTERN.test(line)) {
      continue;
    }

    const sameLineAmount = line.slice(line.search(DEPOSIT_LABEL_PATTERN)).match(MONEY_PATTERN)?.[1];
    if (sameLineAmount) {
      return formatMoney(sameLineAmount);
    }

    for (const candidate of lines.slice(index + 1, index + 6)) {
      const amount = candidate.match(MONEY_PATTERN)?.[1];
      if (amount) {
        return formatMoney(amount);
      }
    }
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  const depositIndex = normalized.search(DEPOSIT_LABEL_PATTERN);
  if (depositIndex >= 0) {
    const nearbyText = normalized.slice(depositIndex, depositIndex + 160);
    const amount = nearbyText.match(MONEY_PATTERN)?.[1];
    return amount ? formatMoney(amount) : null;
  }

  return null;
}

async function readDepositBalanceFromPage(session: BrowserSession): Promise<string | null> {
  const page = session.getPage();

  const directAmount = await page
    .locator('.myPage-deposit-info.grid-item02 .deposit-box01 #totalAmt')
    .first()
    .innerText({ timeout: 5000 })
    .catch(() => '');
  const directBalance = parseWon(directAmount);
  if (directBalance) {
    return directBalance;
  }

  const depositBoxText = await page
    .locator('.myPage-deposit-info.grid-item02 .deposit-box01')
    .first()
    .innerText({ timeout: 2000 })
    .catch(() => '');
  const depositBoxBalance = parseDepositBalance(depositBoxText);
  if (depositBoxBalance) {
    return depositBoxBalance;
  }

  const candidateSelectors = [
    '[id*="deposit" i]',
    '[class*="deposit" i]',
    '[id*="balance" i]',
    '[class*="balance" i]',
    '[id*="money" i]',
    '[class*="money" i]'
  ];

  for (const selector of candidateSelectors) {
    const text = await page
      .locator(selector)
      .first()
      .innerText({ timeout: 1000 })
      .catch(() => '');
    const parsed = parseDepositBalance(text);
    if (parsed) {
      return parsed;
    }
  }

  const bodyText = await page
    .locator('body')
    .innerText({ timeout: GOTO_TIMEOUT })
    .catch(() => '');
  return parseDepositBalance(bodyText);
}

export async function getDepositBalance(session: BrowserSession): Promise<string | null> {
  if (!session.isAuthenticated()) {
    throw new Error('Not authenticated. Login first');
  }

  const page = session.getPage();

  console.log('[Balance] Navigating to my page');
  await page.goto(URLS.MY_PAGE_HOME, { waitUntil: 'load', timeout: GOTO_TIMEOUT });

  const balance = await readDepositBalanceFromPage(session);

  if (!balance) {
    const bodyText = await page
      .locator('body')
      .innerText({ timeout: GOTO_TIMEOUT })
      .catch(() => '');
    const snippet = bodyText.replace(/\s+/g, ' ').slice(0, 300);
    console.warn(`[Balance] Failed to parse deposit balance from my page: ${snippet}`);
    return null;
  }

  console.log(`[Balance] Deposit balance parsed: ${balance}`);
  return balance;
}
