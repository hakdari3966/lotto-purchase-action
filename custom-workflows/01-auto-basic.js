/**
 * 01. 자동 구매 기본 예제
 *
 * 가장 먼저 실행해보기 좋은 예제입니다.
 * 설정한 게임 수만큼 자동 구매합니다.
 * 동행복권 1회 구매 한도에 맞춰 5게임씩 나눠 구매합니다.
 * 이 실행이 끝나면 구매 결과는 GitHub Issue 1개로 정리됩니다.
 */

const GAME_COUNT = Number(process.env.GAME_COUNT || '1');
const MAX_GAMES_PER_PURCHASE = 5;

export default async ({ purchaseAuto }) => {
  console.log('=== 01-auto-basic 시작 ===');

  if (!Number.isInteger(GAME_COUNT) || GAME_COUNT < 1 || GAME_COUNT > 10) {
    throw new Error('GAME_COUNT는 1~10 사이의 정수여야 합니다.');
  }

  console.log(`자동 구매 ${GAME_COUNT}게임을 진행합니다.`);

  const purchased = [];
  let remainingGames = GAME_COUNT;

  while (remainingGames > 0) {
    const batchSize = Math.min(remainingGames, MAX_GAMES_PER_PURCHASE);
    console.log(`자동 구매 ${batchSize}게임 묶음을 진행합니다.`);
    purchased.push(...(await purchaseAuto(batchSize)));
    remainingGames -= batchSize;
  }

  console.log(process.env.DRY_RUN === 'true' ? '드라이런 선택 완료:' : '구매 완료:', purchased);
};
