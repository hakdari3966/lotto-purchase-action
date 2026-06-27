import { isEnabled, sendMessage } from './client';
import { getCheckWinningLink } from '../utils/winning';
import { getNextLottoRound } from '../utils/rounds';

interface PurchaseMetadata {
  type: 'auto' | 'manual';
  numbers: number[][];
  timestamp: string;
}

// Send purchase notification to Telegram
export async function notifyPurchase(purchases: PurchaseMetadata[], depositBalance?: string | null): Promise<void> {
  if (!isEnabled()) return;

  const round = getNextLottoRound();
  const totalGames = purchases.reduce((sum, p) => sum + p.numbers.length, 0);
  const balanceLine = depositBalance ? `예치금 잔액: \`${depositBalance}\`\n` : '';

  const sections = purchases.map((purchase, index) => {
    const typeLabel = purchase.type === 'auto' ? '자동' : '수동';
    const link = getCheckWinningLink(purchase.numbers, round);
    const numbersText = purchase.numbers.map((nums, i) => `  ${i + 1}. \`${nums.join(', ')}\``).join('\n');

    return `*#${index + 1} (${typeLabel})*\n${numbersText}\n[당첨확인](${link})`;
  });

  const message =
    `🎰 *제${round}회 로또 구매 완료*\n` + `총 ${totalGames}게임\n` + balanceLine + `\n` + sections.join('\n\n');

  console.log('[Telegram] Sending purchase notification');
  await sendMessage(message);
}

// Send winning notification to Telegram (only when there are winners)
export async function notifyWinning(issueNumber: number, round: number, ranks: number[]): Promise<void> {
  if (!isEnabled()) return;

  const winningGames = ranks.map((rank, index) => ({ rank, game: index + 1 })).filter(r => r.rank > 0);

  if (winningGames.length === 0) return;

  const rankEmojis = ['', '🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const results = winningGames.map(g => `  ${rankEmojis[g.rank]} ${g.game}번 게임: ${g.rank}등 당첨!`).join('\n');

  const message = `🎉 *제${round}회 당첨!*\n\n` + `${results}\n\n` + `Issue #${issueNumber}`;

  console.log('[Telegram] Sending winning notification');
  await sendMessage(message);
}

// Send a check-only summary even when all games lost.
export async function notifyWinningCheckSummary(
  results: Array<{ issueNumber: number; round: number; ranks: number[] }>
): Promise<void> {
  if (!isEnabled()) return;

  if (results.length === 0) {
    console.log('[Telegram] Sending empty winning-check summary');
    await sendMessage('🔎 *로또 당첨 확인*\n\n확인 가능한 대기 구매 내역이 없습니다.');
    return;
  }

  const totalGames = results.reduce((sum, result) => sum + result.ranks.length, 0);
  const winningGames = results.reduce((sum, result) => sum + result.ranks.filter(rank => rank > 0).length, 0);
  const title = winningGames > 0 ? `🎉 *로또 당첨 확인: ${winningGames}게임 당첨*` : '🔎 *로또 당첨 확인: 당첨 없음*';

  const sections = results.map(result => {
    const lines = result.ranks.map((rank, index) => {
      const text = rank > 0 ? `${rank}등 당첨` : '낙첨';
      return `  ${index + 1}. ${text}`;
    });

    return `*제${result.round}회* (Issue #${result.issueNumber})\n${lines.join('\n')}`;
  });

  const message = `${title}\n` + `총 ${totalGames}게임 확인\n\n` + sections.join('\n\n');

  console.log('[Telegram] Sending winning-check summary');
  await sendMessage(message);
}
