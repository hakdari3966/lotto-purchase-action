import * as core from '@actions/core';
import * as crypto from 'crypto';
import { getOctokit, getRepo } from './client';
import { updateIssueWithResults, isIssuesEnabled } from './issues';
import { fetchWinningNumbers, checkWinning } from '../utils/winning';
import { getLastLottoRound, getNextLottoRound } from '../utils/rounds';
import { type PurchaseMetadata, type WinningCheckResult } from '../tracking/types';

const STORAGE_PATH = '.github/lotto-purchase-history.json';
const STORAGE_VERSION = 1;

interface StoredPurchaseRecord {
  id: string;
  round: number;
  createdAt: string;
  status: 'waiting' | 'checked';
  purchases: PurchaseMetadata[];
  depositBalance?: string | null;
  issueNumber?: number;
  checkedAt?: string;
  ranks?: number[];
}

interface PurchaseHistoryState {
  version: number;
  records: StoredPurchaseRecord[];
}

interface LoadedHistoryState {
  sha?: string;
  state: PurchaseHistoryState;
}

function getEmptyState(): PurchaseHistoryState {
  return {
    version: STORAGE_VERSION,
    records: []
  };
}

async function loadHistoryState(): Promise<LoadedHistoryState> {
  const octokit = getOctokit();
  const repo = getRepo();

  try {
    const response = await octokit.rest.repos.getContent({
      ...repo,
      path: STORAGE_PATH
    });

    if (Array.isArray(response.data) || !('content' in response.data)) {
      throw new Error(`[History] Expected a file at ${STORAGE_PATH}`);
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf8');
    const parsed = JSON.parse(content) as Partial<PurchaseHistoryState>;

    return {
      sha: response.data.sha,
      state: {
        version: typeof parsed.version === 'number' ? parsed.version : STORAGE_VERSION,
        records: Array.isArray(parsed.records) ? parsed.records : []
      }
    };
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 404) {
      return { state: getEmptyState() };
    }

    throw error;
  }
}

async function saveHistoryState(state: PurchaseHistoryState, message: string, sha?: string): Promise<void> {
  const octokit = getOctokit();
  const repo = getRepo();
  const content = Buffer.from(`${JSON.stringify(state, null, 2)}\n`, 'utf8').toString('base64');

  await octokit.rest.repos.createOrUpdateFileContents({
    ...repo,
    path: STORAGE_PATH,
    message,
    content,
    sha
  });
}

export async function recordPurchaseHistory(
  purchases: PurchaseMetadata[],
  depositBalance?: string | null
): Promise<StoredPurchaseRecord> {
  const { state, sha } = await loadHistoryState();
  const createdAt = new Date().toISOString();
  const record: StoredPurchaseRecord = {
    id: crypto.randomUUID(),
    round: getNextLottoRound(),
    createdAt,
    status: 'waiting',
    purchases,
    depositBalance: depositBalance ?? null
  };

  state.records.unshift(record);
  await saveHistoryState(state, `chore: record lotto purchase ${record.id}`, sha);
  console.log(`[History] Recorded purchase history: ${record.id}`);
  return record;
}

export async function attachIssueNumberToPurchaseHistory(recordId: string, issueNumber: number): Promise<void> {
  const { state, sha } = await loadHistoryState();
  const record = state.records.find(entry => entry.id === recordId);

  if (!record) {
    core.warning(`[History] Purchase record not found for issue attachment: ${recordId}`);
    return;
  }

  record.issueNumber = issueNumber;
  await saveHistoryState(state, `chore: link lotto issue #${issueNumber}`, sha);
  console.log(`[History] Linked purchase record ${recordId} to issue #${issueNumber}`);
}

export async function checkPurchaseHistory(): Promise<WinningCheckResult[]> {
  const { state, sha } = await loadHistoryState();
  const pendingRecords = state.records.filter(record => record.status === 'waiting');

  if (pendingRecords.length === 0) {
    console.log('[History] No waiting purchase records');
    return [];
  }

  const currentRound = getLastLottoRound();
  const issuesEnabled = await isIssuesEnabled().catch(error => {
    console.warn(
      '[History] Failed to check GitHub Issues availability:',
      error instanceof Error ? error.message : error
    );
    return false;
  });

  const checkedResults: WinningCheckResult[] = [];
  let changed = false;

  for (const record of pendingRecords) {
    if (record.round > currentRound) {
      console.log(`[History] Record ${record.id}: Round ${record.round} not drawn yet (current: ${currentRound})`);
      continue;
    }

    const numbers = record.purchases.flatMap(purchase => purchase.numbers);
    const winningNumbers = await fetchWinningNumbers(record.round);
    const ranks = numbers.map(selectedNumbers => checkWinning(selectedNumbers, winningNumbers).rank);

    record.status = 'checked';
    record.checkedAt = new Date().toISOString();
    record.ranks = ranks;
    changed = true;

    if (issuesEnabled && record.issueNumber) {
      try {
        await updateIssueWithResults(record.issueNumber, record.round, ranks);
      } catch (error) {
        console.error(
          `[History] Failed to update issue #${record.issueNumber}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    checkedResults.push({
      trackingId: record.id,
      round: record.round,
      ranks,
      issueNumber: record.issueNumber
    });
    console.log(`[History] Checked purchase record ${record.id}`);
  }

  if (changed) {
    await saveHistoryState(state, 'chore: update lotto winning results', sha);
  }

  return checkedResults;
}
