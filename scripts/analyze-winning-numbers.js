#!/usr/bin/env node

const ENDPOINT = 'https://dhlottery.co.kr/lt645/selectPstLt645Info.do';
const THOUSAND_ROUND_DATE = '2022-01-29T11:50:00Z';
const WEEK_TO_MILLISECOND = 604800000;
const NUMBER_MIN = 1;
const NUMBER_MAX = 45;

function parseArgs(argv) {
  const options = {
    start: 1,
    end: null,
    recent: 50,
    recommendations: 5,
    concurrency: 8,
    seed: new Date().toISOString().slice(0, 10)
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--start') {
      options.start = readPositiveInt(arg, next);
      i++;
    } else if (arg === '--end') {
      options.end = readPositiveInt(arg, next);
      i++;
    } else if (arg === '--recent') {
      options.recent = readPositiveInt(arg, next);
      i++;
    } else if (arg === '--recommendations') {
      options.recommendations = readPositiveInt(arg, next);
      i++;
    } else if (arg === '--concurrency') {
      options.concurrency = readPositiveInt(arg, next);
      i++;
    } else if (arg === '--seed') {
      if (!next) throw new Error('--seed requires a value');
      options.seed = next;
      i++;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readPositiveInt(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: npm run analyze:winning -- [options]

Options:
  --start <round>             First round to analyze (default: 1)
  --end <round>               Last round to analyze (default: latest available)
  --recent <count>            Recent rounds window for trend stats (default: 50)
  --recommendations <count>   Number of suggested games to print (default: 5)
  --concurrency <count>       Parallel fetch count (default: 8)
  --seed <text>               Seed for repeatable recommendations (default: today)
  --help                      Show this help

Examples:
  npm run analyze:winning
  npm run analyze:winning -- --start 900 --recent 100 --recommendations 10
  npm run analyze:winning -- --end 1150 --seed my-strategy`);
}

function estimateLastRound() {
  const standardDate = new Date(THOUSAND_ROUND_DATE);
  const additionalRound = Math.floor((Date.now() - standardDate.getTime()) / WEEK_TO_MILLISECOND);
  return 1000 + additionalRound;
}

async function fetchRound(round) {
  const url = `${ENDPOINT}?srchStrLtEpsd=${round}&srchEndLtEpsd=${round}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Round ${round}: request failed (${response.status})`);
  }

  const data = await response.json();
  const item = data.data?.list?.[0];

  if (!item) {
    return null;
  }

  const main = [item.tm1WnNo, item.tm2WnNo, item.tm3WnNo, item.tm4WnNo, item.tm5WnNo, item.tm6WnNo]
    .map(Number)
    .sort((a, b) => a - b);
  const bonus = Number(item.bnsWnNo);

  if (main.length !== 6 || main.some(num => !Number.isInteger(num) || num < NUMBER_MIN || num > NUMBER_MAX)) {
    throw new Error(`Round ${round}: invalid winning numbers`);
  }

  return {
    round,
    main,
    bonus,
    sum: main.reduce((total, num) => total + num, 0)
  };
}

async function findLatestAvailableRound(estimatedRound) {
  for (let round = estimatedRound + 2; round >= Math.max(1, estimatedRound - 10); round--) {
    const result = await fetchRound(round);
    if (result) return result.round;
  }

  throw new Error('Could not find the latest available round');
}

async function fetchRounds(start, end, concurrency) {
  const rounds = [];
  for (let round = start; round <= end; round++) {
    rounds.push(round);
  }

  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < rounds.length) {
      const index = cursor++;
      const round = rounds[index];
      const result = await fetchRound(round);
      if (result) {
        results.push(result);
      }
    }
  }

  const workerCount = Math.min(concurrency, rounds.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results.sort((a, b) => a.round - b.round);
}

function analyzeRounds(rounds, recentCount) {
  const recentRounds = rounds.slice(-recentCount);
  const historicalSet = new Set(rounds.map(round => round.main.join(',')));

  const overallFrequency = createNumberMap();
  const recentFrequency = createNumberMap();
  const bonusFrequency = createNumberMap();
  const pairFrequency = new Map();
  const oddEvenPatterns = new Map();
  const lowHighPatterns = new Map();
  const consecutiveCounts = new Map();
  const sumBuckets = new Map();
  const lastSeen = createNumberMap(0);

  for (const round of rounds) {
    for (const num of round.main) {
      overallFrequency.set(num, overallFrequency.get(num) + 1);
      lastSeen.set(num, round.round);
    }
    bonusFrequency.set(round.bonus, bonusFrequency.get(round.bonus) + 1);
    collectPairs(round.main, pairFrequency);
    addMapCount(oddEvenPatterns, getOddEvenPattern(round.main));
    addMapCount(lowHighPatterns, getLowHighPattern(round.main));
    addMapCount(consecutiveCounts, String(countConsecutivePairs(round.main)));
    addMapCount(sumBuckets, getSumBucket(round.sum));
  }

  for (const round of recentRounds) {
    for (const num of round.main) {
      recentFrequency.set(num, recentFrequency.get(num) + 1);
    }
  }

  const latestRound = rounds.at(-1).round;
  const missingSpans = new Map(
    Array.from(lastSeen.entries()).map(([num, seenRound]) => [num, seenRound === 0 ? rounds.length : latestRound - seenRound])
  );

  return {
    rounds,
    recentRounds,
    latestRound,
    historicalSet,
    overallFrequency,
    recentFrequency,
    bonusFrequency,
    pairFrequency,
    oddEvenPatterns,
    lowHighPatterns,
    consecutiveCounts,
    sumBuckets,
    missingSpans
  };
}

function createNumberMap(initialValue = 0) {
  return new Map(Array.from({ length: NUMBER_MAX }, (_, index) => [index + 1, initialValue]));
}

function collectPairs(numbers, pairFrequency) {
  for (let i = 0; i < numbers.length; i++) {
    for (let j = i + 1; j < numbers.length; j++) {
      addMapCount(pairFrequency, `${numbers[i]}-${numbers[j]}`);
    }
  }
}

function addMapCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function getOddEvenPattern(numbers) {
  const odd = numbers.filter(num => num % 2 === 1).length;
  return `${odd} odd / ${numbers.length - odd} even`;
}

function getLowHighPattern(numbers) {
  const low = numbers.filter(num => num <= 22).length;
  return `${low} low / ${numbers.length - low} high`;
}

function countConsecutivePairs(numbers) {
  let count = 0;
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] === numbers[i - 1] + 1) count++;
  }
  return count;
}

function getSumBucket(sum) {
  const bucketStart = Math.floor(sum / 20) * 20;
  return `${bucketStart}-${bucketStart + 19}`;
}

function topEntries(map, count, order = 'desc') {
  const direction = order === 'asc' ? 1 : -1;
  return Array.from(map.entries())
    .sort((a, b) => direction * (a[1] - b[1]) || a[0] - b[0])
    .slice(0, count);
}

function formatEntries(entries) {
  return entries.map(([key, value]) => `${key}:${value}`).join('  ');
}

function printAnalysis(stats, options) {
  const totalRounds = stats.rounds.length;
  const sums = stats.rounds.map(round => round.sum);
  const averageSum = sums.reduce((total, sum) => total + sum, 0) / sums.length;

  console.log('\n=== Lotto 6/45 Historical Analysis ===');
  console.log(`Rounds analyzed: ${stats.rounds[0].round} - ${stats.latestRound} (${totalRounds} rounds)`);
  console.log(`Recent window: ${stats.recentRounds.length} rounds`);
  console.log(`Recommendation seed: ${options.seed}`);

  console.log('\n[Frequency]');
  console.log(`Hot overall:        ${formatEntries(topEntries(stats.overallFrequency, 10))}`);
  console.log(`Cold overall:       ${formatEntries(topEntries(stats.overallFrequency, 10, 'asc'))}`);
  console.log(`Hot recent:         ${formatEntries(topEntries(stats.recentFrequency, 10))}`);
  console.log(`Longest missing:    ${formatEntries(topEntries(stats.missingSpans, 10))}`);
  console.log(`Most common bonus:  ${formatEntries(topEntries(stats.bonusFrequency, 10))}`);

  console.log('\n[Patterns]');
  console.log(`Odd/even:           ${formatEntries(topEntries(stats.oddEvenPatterns, 5))}`);
  console.log(`Low/high:           ${formatEntries(topEntries(stats.lowHighPatterns, 5))}`);
  console.log(`Consecutive pairs:  ${formatEntries(topEntries(stats.consecutiveCounts, 5))}`);
  console.log(`Sum buckets:        ${formatEntries(topEntries(stats.sumBuckets, 6))}`);
  console.log(`Sum average:        ${averageSum.toFixed(1)} (min ${Math.min(...sums)}, max ${Math.max(...sums)})`);

  console.log('\n[Pairs]');
  console.log(`Most common pairs:  ${formatEntries(topEntries(stats.pairFrequency, 10))}`);
}

function recommendGames(stats, count, seed) {
  const rng = createSeededRandom(seed);
  const scores = buildNumberScores(stats);
  const games = [];
  const seen = new Set();

  let attempts = 0;
  while (games.length < count && attempts < count * 1000) {
    attempts++;
    const game = pickWeightedGame(scores, rng);
    const key = game.join(',');

    if (seen.has(key) || stats.historicalSet.has(key) || !isBalancedGame(game)) {
      continue;
    }

    seen.add(key);
    games.push(game);
  }

  return games;
}

function buildNumberScores(stats) {
  const maxOverall = Math.max(...stats.overallFrequency.values());
  const maxRecent = Math.max(...stats.recentFrequency.values(), 1);
  const maxMissing = Math.max(...stats.missingSpans.values(), 1);

  return Array.from({ length: NUMBER_MAX }, (_, index) => {
    const num = index + 1;
    const overall = stats.overallFrequency.get(num) / maxOverall;
    const recent = stats.recentFrequency.get(num) / maxRecent;
    const missing = stats.missingSpans.get(num) / maxMissing;
    const score = 0.4 * overall + 0.35 * recent + 0.25 * missing;
    return { num, score: Math.max(score, 0.01) };
  });
}

function pickWeightedGame(scores, rng) {
  const pool = scores.map(item => ({ ...item }));
  const selected = [];

  while (selected.length < 6) {
    const totalScore = pool.reduce((total, item) => total + item.score, 0);
    let target = rng() * totalScore;
    const index = pool.findIndex(item => {
      target -= item.score;
      return target <= 0;
    });
    const pickedIndex = index >= 0 ? index : pool.length - 1;
    selected.push(pool[pickedIndex].num);
    pool.splice(pickedIndex, 1);
  }

  return selected.sort((a, b) => a - b);
}

function isBalancedGame(game) {
  const odd = game.filter(num => num % 2 === 1).length;
  const low = game.filter(num => num <= 22).length;
  const sum = game.reduce((total, num) => total + num, 0);
  const consecutivePairs = countConsecutivePairs(game);

  return odd >= 2 && odd <= 4 && low >= 2 && low <= 4 && sum >= 100 && sum <= 180 && consecutivePairs <= 2;
}

function createSeededRandom(seedText) {
  let seed = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    seed = Math.imul(seed ^ seedText.charCodeAt(i), 3432918353);
    seed = (seed << 13) | (seed >>> 19);
  }

  return function random() {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    seed ^= seed >>> 16;
    return (seed >>> 0) / 4294967296;
  };
}

function printRecommendations(games) {
  console.log('\n[Suggested games]');
  if (games.length === 0) {
    console.log('No recommendations generated. Try increasing --recommendations or changing --seed.');
    return;
  }

  games.forEach((game, index) => {
    const sum = game.reduce((total, num) => total + num, 0);
    const odd = game.filter(num => num % 2 === 1).length;
    console.log(`${String(index + 1).padStart(2, '0')}. ${game.join(', ')}  (sum ${sum}, ${odd} odd/${6 - odd} even)`);
  });

  console.log('\nNote: Lottery draws are random. These suggestions are statistical filters, not a prediction guarantee.');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const latestRound = options.end ?? (await findLatestAvailableRound(estimateLastRound()));
  if (options.start > latestRound) {
    throw new Error(`--start (${options.start}) cannot be greater than latest round (${latestRound})`);
  }

  console.log(`Fetching rounds ${options.start}-${latestRound}...`);
  const rounds = await fetchRounds(options.start, latestRound, options.concurrency);
  if (rounds.length === 0) {
    throw new Error('No winning numbers fetched');
  }

  const stats = analyzeRounds(rounds, options.recent);
  printAnalysis(stats, options);
  printRecommendations(recommendGames(stats, options.recommendations, options.seed));
}

main().catch(error => {
  console.error(`\nAnalysis failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
