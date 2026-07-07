#!/usr/bin/env node

const STORE_ENDPOINT = 'https://www.dhlottery.co.kr/store.do';
const RESULT_ENDPOINT = 'https://www.dhlottery.co.kr/common.do';
const THOUSAND_ROUND_DATE = '2022-01-29T11:50:00Z';
const WEEK_TO_MILLISECOND = 604800000;
const METHODS = ['자동', '수동', '반자동'];

function parseArgs(argv) {
  const options = {
    start: null,
    end: null,
    weeks: 52,
    concurrency: 6,
    top: 10
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
    } else if (arg === '--weeks') {
      options.weeks = readPositiveInt(arg, next);
      i++;
    } else if (arg === '--concurrency') {
      options.concurrency = readPositiveInt(arg, next);
      i++;
    } else if (arg === '--top') {
      options.top = readPositiveInt(arg, next);
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
  console.log(`Usage: npm run analyze:winning-methods -- [options]

Options:
  --weeks <count>        Number of recent weekly rounds to analyze (default: 52)
  --start <round>        First round to analyze. Overrides --weeks when used with --end
  --end <round>          Last round to analyze (default: latest available)
  --concurrency <count>  Parallel fetch count (default: 6)
  --top <count>          Number of notable rounds/stores to print (default: 10)
  --help                 Show this help

Examples:
  npm run analyze:winning-methods
  npm run analyze:winning-methods -- --weeks 26
  npm run analyze:winning-methods -- --start 1175 --end 1226`);
}

function estimateLastRound() {
  const standardDate = new Date(THOUSAND_ROUND_DATE);
  const additionalRound = Math.floor((Date.now() - standardDate.getTime()) / WEEK_TO_MILLISECOND);
  return 1000 + additionalRound;
}

async function findLatestAvailableRound(estimatedRound) {
  for (let round = estimatedRound + 2; round >= Math.max(1, estimatedRound - 10); round--) {
    const summary = await fetchRoundSummary(round).catch(() => null);
    if (summary) return summary.round;
  }

  throw new Error('Could not find the latest available round');
}

async function fetchRoundSummary(round) {
  const url = `${RESULT_ENDPOINT}?method=getLottoNumber&drwNo=${round}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 lotto-purchase-action analysis script'
    }
  });

  if (!response.ok) {
    throw new Error(`Round ${round}: result request failed (${response.status})`);
  }

  const data = await response.json();
  if (data.returnValue !== 'success') {
    return null;
  }

  return {
    round: Number(data.drwNo),
    date: data.drwNoDate || '',
    firstPrizeWinners: Number(data.firstPrzwnerCo || 0)
  };
}

async function fetchWinningStores(round) {
  const url = `${STORE_ENDPOINT}?method=topStore&pageGubun=L645&drwNo=${round}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 lotto-purchase-action analysis script'
    }
  });

  if (!response.ok) {
    throw new Error(`Round ${round}: store request failed (${response.status})`);
  }

  const html = await response.text();
  return parseFirstPrizeStores(html, round);
}

function parseFirstPrizeStores(html, round) {
  const rows = [];
  const rowMatches = html.matchAll(/<tr[\s\S]*?<\/tr>/gi);

  for (const rowMatch of rowMatches) {
    const cells = Array.from(rowMatch[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(match =>
      normalizeCell(match[1])
    );

    if (cells.length < 4) {
      continue;
    }

    const methodIndex = cells.findIndex(cell => METHODS.includes(cell));
    if (methodIndex < 0) {
      continue;
    }

    const number = Number(cells[0]);
    rows.push({
      round,
      number: Number.isInteger(number) ? number : rows.length + 1,
      storeName: cells[1] || '',
      method: cells[methodIndex],
      address: cells[methodIndex + 1] || ''
    });
  }

  if (rows.length === 0) {
    throw new Error(`Round ${round}: no first-prize store rows found`);
  }

  return rows;
}

function normalizeCell(value) {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchRound(round) {
  const [summary, stores] = await Promise.all([fetchRoundSummary(round), fetchWinningStores(round)]);

  return {
    round,
    date: summary?.date || '',
    expectedFirstPrizeWinners: summary?.firstPrizeWinners || 0,
    stores,
    counts: countMethods(stores)
  };
}

function countMethods(stores) {
  const counts = { 자동: 0, 수동: 0, 반자동: 0 };
  for (const store of stores) {
    counts[store.method]++;
  }
  return counts;
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
      results.push(await fetchRound(round));
    }
  }

  const workerCount = Math.min(concurrency, rounds.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results.sort((a, b) => a.round - b.round);
}

function analyze(rounds) {
  const totals = { 자동: 0, 수동: 0, 반자동: 0 };
  const storeCounts = new Map();
  const mismatches = [];

  for (const round of rounds) {
    for (const method of METHODS) {
      totals[method] += round.counts[method];
    }

    if (round.expectedFirstPrizeWinners > 0 && round.expectedFirstPrizeWinners !== round.stores.length) {
      mismatches.push({
        round: round.round,
        expected: round.expectedFirstPrizeWinners,
        parsed: round.stores.length
      });
    }

    for (const store of round.stores) {
      const key = `${store.storeName} | ${store.address}`;
      const current = storeCounts.get(key) ?? {
        storeName: store.storeName,
        address: store.address,
        total: 0,
        자동: 0,
        수동: 0,
        반자동: 0
      };
      current.total++;
      current[store.method]++;
      storeCounts.set(key, current);
    }
  }

  return {
    rounds,
    totals,
    totalGames: METHODS.reduce((sum, method) => sum + totals[method], 0),
    storeCounts: Array.from(storeCounts.values()).sort((a, b) => b.total - a.total || a.storeName.localeCompare(b.storeName)),
    mismatches
  };
}

function printAnalysis(stats, options) {
  const firstRound = stats.rounds[0];
  const lastRound = stats.rounds.at(-1);

  console.log('\n=== Lotto 6/45 First-Prize Winning Method Analysis ===');
  console.log(
    `Rounds analyzed: ${firstRound.round} (${firstRound.date || 'date unknown'}) - ${lastRound.round} (${lastRound.date || 'date unknown'})`
  );
  console.log(`Rounds: ${stats.rounds.length}`);
  console.log(`First-prize games: ${stats.totalGames}`);

  console.log('\n[Totals]');
  for (const method of METHODS) {
    console.log(`${method.padEnd(6)} ${String(stats.totals[method]).padStart(4)} games  ${formatPercent(stats.totals[method], stats.totalGames)}`);
  }

  console.log('\n[By round]');
  for (const round of stats.rounds) {
    const total = round.stores.length;
    console.log(
      `${round.round}회 ${round.date || ''}  총 ${String(total).padStart(2)}게임  자동 ${String(round.counts.자동).padStart(2)}  수동 ${String(round.counts.수동).padStart(2)}  반자동 ${String(round.counts.반자동).padStart(2)}`
    );
  }

  printNotableRounds(stats.rounds, options.top);
  printTopStores(stats.storeCounts, options.top);

  if (stats.mismatches.length > 0) {
    console.log('\n[Parse warnings]');
    for (const item of stats.mismatches) {
      console.log(`${item.round}회: official first-prize count ${item.expected}, parsed store rows ${item.parsed}`);
    }
  }

  console.log('\nNote: Counts are first-prize winning games, not unique people. Multiple manual tickets can belong to one buyer.');
}

function printNotableRounds(rounds, top) {
  console.log('\n[Notable rounds]');

  const byAuto = [...rounds].sort((a, b) => b.counts.자동 - a.counts.자동 || b.stores.length - a.stores.length).slice(0, top);
  const byManual = [...rounds].sort((a, b) => b.counts.수동 - a.counts.수동 || b.stores.length - a.stores.length).slice(0, top);
  const byManualRate = [...rounds]
    .filter(round => round.stores.length > 0)
    .sort((a, b) => b.counts.수동 / b.stores.length - a.counts.수동 / a.stores.length || b.counts.수동 - a.counts.수동)
    .slice(0, top);

  console.log(`Auto-heavy:       ${formatRoundList(byAuto, '자동')}`);
  console.log(`Manual-heavy:     ${formatRoundList(byManual, '수동')}`);
  console.log(
    `Manual-rate high: ${byManualRate
      .map(round => `${round.round}회 ${formatPercent(round.counts.수동, round.stores.length)} (${round.counts.수동}/${round.stores.length})`)
      .join('  ')}`
  );
}

function formatRoundList(rounds, method) {
  return rounds.map(round => `${round.round}회 ${round.counts[method]}/${round.stores.length}`).join('  ');
}

function printTopStores(storeCounts, top) {
  console.log('\n[Repeated first-prize stores in range]');
  const repeated = storeCounts.filter(store => store.total > 1).slice(0, top);

  if (repeated.length === 0) {
    console.log('No repeated stores in this range.');
    return;
  }

  for (const store of repeated) {
    console.log(
      `${store.storeName}  총 ${store.total}게임  자동 ${store.자동}  수동 ${store.수동}  반자동 ${store.반자동}  (${store.address})`
    );
  }
}

function formatPercent(value, total) {
  if (total === 0) return '0.0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const latestRound = options.end ?? (await findLatestAvailableRound(estimateLastRound()));
  const startRound =
    options.start ?? Math.max(1, latestRound - options.weeks + 1);

  if (startRound > latestRound) {
    throw new Error(`Start round (${startRound}) cannot be greater than end round (${latestRound})`);
  }

  console.log(`Fetching first-prize store rows for rounds ${startRound}-${latestRound}...`);
  const rounds = await fetchRounds(startRound, latestRound, options.concurrency);
  const stats = analyze(rounds);
  printAnalysis(stats, options);
}

main().catch(error => {
  console.error(`\nAnalysis failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
