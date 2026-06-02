export interface InsufficientBalanceDetails {
  currentBalance: number;
  requiredAmount: number;
  shortage: number;
  requestedGames: number;
}

export class InsufficientBalanceError extends Error {
  readonly details: InsufficientBalanceDetails;

  constructor(details: Omit<InsufficientBalanceDetails, 'shortage'>) {
    const shortage = Math.max(0, details.requiredAmount - details.currentBalance);
    const fullDetails = { ...details, shortage };

    super(
      `예치금이 부족합니다. 현재 예치금: ${formatWon(fullDetails.currentBalance)}, ` +
        `필요 금액: ${formatWon(fullDetails.requiredAmount)}, 부족 금액: ${formatWon(fullDetails.shortage)}`
    );

    this.name = 'InsufficientBalanceError';
    this.details = fullDetails;
  }
}

export function isInsufficientBalanceError(error: unknown): error is InsufficientBalanceError {
  return error instanceof InsufficientBalanceError;
}

export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}
