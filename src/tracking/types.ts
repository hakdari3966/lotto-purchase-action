export interface PurchaseMetadata {
  type: 'auto' | 'manual';
  numbers: number[][];
  timestamp: string;
}

export interface WinningCheckResult {
  trackingId: string;
  round: number;
  ranks: number[];
  issueNumber?: number;
}

export function formatTrackingReference(result: Pick<WinningCheckResult, 'trackingId' | 'issueNumber'>): string {
  return result.issueNumber ? `Issue #${result.issueNumber}` : `기록 ${result.trackingId.slice(0, 8)}`;
}
