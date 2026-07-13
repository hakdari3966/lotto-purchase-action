import * as core from '@actions/core';
import * as crypto from 'crypto';
import * as http2 from 'http2';
import { getNextLottoRound } from '../utils/rounds';
import { formatTrackingReference, type PurchaseMetadata, type WinningCheckResult } from '../tracking/types';

interface ApnsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKey: string;
  deviceToken: string;
  useSandbox: boolean;
}

interface ApnsAlert {
  title: string;
  body: string;
}

function getInput(name: string): string {
  return core.getInput(name) || process.env[name.replace(/-/g, '_').toUpperCase()] || '';
}

function getConfig(): ApnsConfig | null {
  const keyId = getInput('apns-key-id');
  const teamId = getInput('apns-team-id');
  const bundleId = getInput('apns-bundle-id');
  const privateKey = getInput('apns-private-key').replace(/\\n/g, '\n');
  const deviceToken = getInput('apns-device-token').replace(/\s/g, '');
  const useSandbox = (getInput('apns-use-sandbox') || 'true').toLowerCase() !== 'false';

  if (!keyId || !teamId || !bundleId || !privateKey || !deviceToken) {
    return null;
  }

  return { keyId, teamId, bundleId, privateKey, deviceToken, useSandbox };
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function createJwt(config: ApnsConfig): string {
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: config.keyId }));
  const claims = base64Url(JSON.stringify({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${header}.${claims}`;

  const signer = crypto.createSign('SHA256');
  signer.update(signingInput);
  signer.end();

  const signature = signer.sign({ key: config.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${base64Url(signature)}`;
}

async function sendApns(alert: ApnsAlert): Promise<void> {
  const config = getConfig();
  if (!config) {
    return;
  }

  const host = config.useSandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const client = http2.connect(host);

  await new Promise<void>((resolve, reject) => {
    client.once('error', reject);

    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${config.deviceToken}`,
      authorization: `bearer ${createJwt(config)}`,
      'apns-topic': config.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10'
    });

    let responseBody = '';
    let statusCode = 0;

    request.setEncoding('utf8');
    request.on('response', headers => {
      statusCode = Number(headers[':status'] || 0);
    });
    request.on('data', chunk => {
      responseBody += chunk;
    });
    request.on('end', () => {
      client.close();
      if (statusCode >= 200 && statusCode < 300) {
        resolve();
        return;
      }
      reject(new Error(`APNs failed (${statusCode}): ${responseBody || 'empty response'}`));
    });
    request.on('error', error => {
      client.close();
      reject(error);
    });

    request.end(
      JSON.stringify({
        aps: {
          alert,
          sound: 'default'
        }
      })
    );
  });
}

async function notifyApns(alert: ApnsAlert): Promise<void> {
  try {
    await sendApns(alert);
    console.log('[APNs] Push notification sent');
  } catch (error) {
    console.error('[APNs] Failed to send push notification:', error instanceof Error ? error.message : error);
  }
}

export async function notifyApnsPurchase(purchases: PurchaseMetadata[], depositBalance?: string | null): Promise<void> {
  const round = getNextLottoRound();
  const totalGames = purchases.reduce((sum, purchase) => sum + purchase.numbers.length, 0);
  const balanceText = depositBalance ? ` 예치금 ${depositBalance}` : '';

  await notifyApns({
    title: `제${round}회 로또 구매 완료`,
    body: `${totalGames}게임 구매 완료.${balanceText}`
  });
}

export async function notifyApnsWinning(result: WinningCheckResult): Promise<void> {
  const winningGames = result.ranks.map((rank, index) => ({ rank, game: index + 1 })).filter(item => item.rank > 0);
  if (winningGames.length === 0) {
    return;
  }

  await notifyApns({
    title: `제${result.round}회 로또 당첨`,
    body: `${winningGames.map(item => `${item.game}번 ${item.rank}등`).join(', ')} (${formatTrackingReference(result)})`
  });
}

export async function notifyApnsWinningCheckSummary(results: WinningCheckResult[]): Promise<void> {
  if (results.length === 0) {
    await notifyApns({
      title: '로또 당첨 확인',
      body: '확인 가능한 대기 구매 내역이 없습니다.'
    });
    return;
  }

  const totalGames = results.reduce((sum, result) => sum + result.ranks.length, 0);
  const winningGames = results.reduce((sum, result) => sum + result.ranks.filter(rank => rank > 0).length, 0);

  await notifyApns({
    title: winningGames > 0 ? `로또 당첨 확인: ${winningGames}게임 당첨` : '로또 당첨 확인: 당첨 없음',
    body: `총 ${totalGames}게임 확인`
  });
}
