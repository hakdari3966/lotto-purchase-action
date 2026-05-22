const state = {
  repo: sessionStorage.getItem('lotto-dashboard-repo') || 'kkd927/lotto-purchase-action',
  token: sessionStorage.getItem('lotto-dashboard-token') || '',
  issues: [],
  runs: [],
  filteredIssues: []
};

const elements = {
  repoHeading: document.querySelector('#repoHeading'),
  repoSub: document.querySelector('#repoSub'),
  connectionPill: document.querySelector('#connectionPill'),
  refreshButton: document.querySelector('#refreshButton'),
  lastUpdated: document.querySelector('#lastUpdated'),
  nextSchedule: document.querySelector('#nextSchedule'),
  nextScheduleHint: document.querySelector('#nextScheduleHint'),
  lastRunIcon: document.querySelector('#lastRunIcon'),
  lastRunStatus: document.querySelector('#lastRunStatus'),
  lastRunTime: document.querySelector('#lastRunTime'),
  waitingCount: document.querySelector('#waitingCount'),
  winningCount: document.querySelector('#winningCount'),
  purchaseSummary: document.querySelector('#purchaseSummary'),
  roundFilter: document.querySelector('#roundFilter'),
  statusFilter: document.querySelector('#statusFilter'),
  searchInput: document.querySelector('#searchInput'),
  purchaseRows: document.querySelector('#purchaseRows'),
  emptyPurchases: document.querySelector('#emptyPurchases'),
  runList: document.querySelector('#runList'),
  runsLink: document.querySelector('#runsLink'),
  repoInput: document.querySelector('#repoInput'),
  tokenInput: document.querySelector('#tokenInput'),
  settingsForm: document.querySelector('#settingsForm'),
  clearTokenButton: document.querySelector('#clearTokenButton'),
  tokenStatus: document.querySelector('#tokenStatus'),
  exportButton: document.querySelector('#exportButton')
};

const LABELS = {
  waiting: ':hourglass:',
  losing: ':skull_and_crossbones:'
};

const demoIssues = [
  buildDemoIssue(1162, 5, 'open', [LABELS.waiting], '#235', '2026-05-17T03:00:12Z'),
  buildDemoIssue(1161, 5, 'closed', [LABELS.losing], '#233', '2026-05-10T03:00:03Z'),
  buildDemoIssue(1160, 3, 'open', [':tada: :five:'], '#231', '2026-05-03T03:00:02Z'),
  buildDemoIssue(1159, 5, 'closed', [LABELS.losing], '#229', '2026-04-26T03:00:02Z')
];

const demoRuns = [
  buildDemoRun('success', 'schedule', '2026-05-17T03:00:12Z', 68),
  buildDemoRun('success', 'workflow_dispatch', '2026-05-10T03:00:03Z', 59),
  buildDemoRun('failure', 'schedule', '2026-05-03T03:00:02Z', 72)
];

function buildDemoIssue(round, games, stateName, labels, issue, createdAt) {
  return {
    number: Number(issue.replace('#', '')),
    html_url: `https://github.com/${state.repo}/issues/${issue.replace('#', '')}`,
    title: `제${round}회 ${games}게임`,
    state: stateName,
    created_at: createdAt,
    labels: labels.map(name => ({ name: name.trim() })),
    body: `workflow_run: ${createdAt}\nround: ${round}\n\n## Purchase #1 (Auto)\ntimestamp: ${createdAt}\ntype: auto\nnumbers: ${JSON.stringify(
      Array.from({ length: games }, (_, index) => [3 + index, 9 + index, 14 + index, 23 + index, 31 + index, 42])
    )}\nlink: https://www.dhlottery.co.kr/qr.do`
  };
}

function buildDemoRun(conclusion, event, createdAt, seconds) {
  const started = new Date(createdAt).getTime();
  return {
    name: '로또 구매 (수동 + 스케줄)',
    conclusion,
    status: 'completed',
    event,
    created_at: createdAt,
    updated_at: new Date(started + seconds * 1000).toISOString(),
    html_url: `https://github.com/${state.repo}/actions`
  };
}

function headers() {
  const base = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  if (state.token) {
    base.Authorization = `Bearer ${state.token}`;
  }

  return base;
}

async function githubGet(path) {
  const response = await fetch(`https://api.github.com/repos/${state.repo}${path}`, {
    headers: headers()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 180)}`);
  }

  return response.json();
}

async function loadData() {
  setLoading(true);
  try {
    const [issues, workflowRuns] = await Promise.all([
      githubGet('/issues?state=all&per_page=100'),
      githubGet('/actions/workflows/lotto-purchase.yml/runs?per_page=20')
    ]);

    state.issues = issues.filter(issue => !issue.pull_request);
    state.runs = workflowRuns.workflow_runs || [];
    setConnected(Boolean(state.token), state.token ? '토큰 연결됨' : '공개 데이터');
  } catch (error) {
    console.warn('[Dashboard] GitHub API failed, using demo data:', error);
    state.issues = demoIssues;
    state.runs = demoRuns;
    setConnected(Boolean(state.token), state.token ? '데모 데이터' : '토큰 미연결');
  } finally {
    setLoading(false);
    render();
  }
}

function setLoading(isLoading) {
  elements.refreshButton.disabled = isLoading;
  elements.refreshButton.classList.toggle('is-loading', isLoading);
}

function setConnected(isConnected, label) {
  elements.connectionPill.classList.toggle('muted', !isConnected);
  elements.connectionPill.lastChild.textContent = label;
  elements.tokenStatus.textContent = label;
}

function parseIssue(issue) {
  const body = issue.body || '';
  const roundMatch = body.match(/^round:\s*(\d+)/m) || issue.title.match(/제?(\d+)회/);
  const numbersMatches = [...body.matchAll(/^numbers:\s*(.+)$/gm)];
  const numbers = numbersMatches.flatMap(match => {
    try {
      const parsed = JSON.parse(match[1]);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const labelNames = issue.labels.map(label => label.name);

  return {
    issue,
    round: roundMatch ? Number(roundMatch[1]) : 0,
    games: numbers.length || Number(issue.title.match(/(\d+)게임/)?.[1] || 0),
    numbers,
    status: getIssueStatus(issue.state, labelNames),
    result: getIssueResult(labelNames),
    createdAt: getPurchaseTimestamp(body, issue.created_at),
    labels: labelNames
  };
}

function getPurchaseTimestamp(body, fallback) {
  const timestamp = body.match(/^timestamp:\s*(.+)$/m)?.[1] || body.match(/^workflow_run:\s*(.+)$/m)?.[1];
  return timestamp || fallback;
}

function getIssueStatus(issueState, labels) {
  if (labels.includes(LABELS.waiting)) return 'waiting';
  if (labels.some(label => label.includes('medal') || label.includes(':four:') || label.includes(':five:'))) {
    return 'winning';
  }
  if (labels.includes(LABELS.losing)) return 'losing';
  return issueState;
}

function getIssueResult(labels) {
  if (labels.some(label => label.includes('1st_place'))) return '1등';
  if (labels.some(label => label.includes('2nd_place'))) return '2등';
  if (labels.some(label => label.includes('3rd_place'))) return '3등';
  if (labels.some(label => label.includes(':four:'))) return '4등';
  if (labels.some(label => label.includes(':five:'))) return '5등';
  if (labels.includes(LABELS.waiting)) return '추첨 전';
  if (labels.includes(LABELS.losing)) return '낙첨';
  return '-';
}

function render() {
  elements.repoHeading.textContent = state.repo;
  elements.repoInput.value = state.repo;
  elements.tokenInput.value = state.token;
  elements.runsLink.href = `https://github.com/${state.repo}/actions/workflows/lotto-purchase.yml`;
  elements.repoSub.textContent = state.issues === demoIssues ? '데모 데이터 표시 중' : 'GitHub Issues와 Actions 기반 운영 현황';

  const purchases = state.issues.map(parseIssue).sort((a, b) => b.round - a.round || b.issue.number - a.issue.number);
  renderSummary(purchases);
  renderFilters(purchases);
  renderPurchases(purchases);
  renderRuns();
  elements.lastUpdated.textContent = `마지막 업데이트: ${formatDateTime(new Date().toISOString())}`;
}

function renderSummary(purchases) {
  const waiting = purchases.filter(item => item.status === 'waiting').length;
  const winning = purchases.filter(item => item.status === 'winning').length;
  const lastRun = state.runs[0];

  elements.nextSchedule.textContent = formatDateTime(getNextSundayNoonKst().toISOString(), {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
  elements.nextScheduleHint.textContent = `KST 기준, ${formatCountdown(getNextSundayNoonKst())}`;
  elements.waitingCount.textContent = String(waiting);
  elements.winningCount.textContent = String(winning);

  if (lastRun) {
    const conclusion = lastRun.conclusion || lastRun.status;
    elements.lastRunStatus.textContent = translateRunConclusion(conclusion);
    elements.lastRunTime.textContent = formatDateTime(lastRun.created_at);
    elements.lastRunIcon.className = `summary-icon ${conclusion === 'success' ? 'green' : conclusion === 'failure' ? 'red' : 'amber'}`;
  } else {
    elements.lastRunStatus.textContent = '-';
    elements.lastRunTime.textContent = '실행 기록 없음';
  }

  const totalGames = purchases.reduce((sum, item) => sum + item.games, 0);
  elements.purchaseSummary.textContent = `총 ${purchases.length.toLocaleString()}개 이슈, ${totalGames.toLocaleString()}게임`;
}

function renderFilters(purchases) {
  const current = elements.roundFilter.value;
  const rounds = [...new Set(purchases.map(item => item.round).filter(Boolean))].sort((a, b) => b - a);
  elements.roundFilter.innerHTML =
    '<option value="all">전체 회차</option>' + rounds.map(round => `<option value="${round}">제${round}회</option>`).join('');
  elements.roundFilter.value = rounds.includes(Number(current)) ? current : 'all';
}

function renderPurchases(purchases) {
  const roundFilter = elements.roundFilter.value;
  const statusFilter = elements.statusFilter.value;
  const query = elements.searchInput.value.trim().toLowerCase();

  state.filteredIssues = purchases.filter(item => {
    const roundMatches = roundFilter === 'all' || String(item.round) === roundFilter;
    const statusMatches = statusFilter === 'all' || item.status === statusFilter || item.issue.state === statusFilter;
    const haystack = `${item.round} ${item.issue.number} ${item.title} ${JSON.stringify(item.numbers)}`.toLowerCase();
    return roundMatches && statusMatches && (!query || haystack.includes(query));
  });

  elements.purchaseRows.innerHTML = state.filteredIssues
    .map(
      item => `<tr>
        <td>${item.round ? `제${item.round}회` : '-'}</td>
        <td>${item.games || '-'}</td>
        <td>${statusBadge(item.status)}</td>
        <td><a class="issue-link" href="${item.issue.html_url}" target="_blank" rel="noreferrer">#${item.issue.number}</a></td>
        <td>${formatDateTime(item.createdAt)}</td>
        <td>${item.result}</td>
      </tr>`
    )
    .join('');

  elements.emptyPurchases.classList.toggle('hidden', state.filteredIssues.length > 0);
}

function renderRuns() {
  elements.runList.innerHTML = state.runs
    .slice(0, 8)
    .map(run => {
      const conclusion = run.conclusion || run.status;
      const statusClass = conclusion === 'success' ? 'success' : conclusion === 'failure' ? 'failure' : 'pending';
      return `<a class="run-item" href="${run.html_url}" target="_blank" rel="noreferrer">
        <span class="run-dot ${statusClass}">${statusClass === 'success' ? '✓' : statusClass === 'failure' ? '×' : '•'}</span>
        <span>
          <strong>${run.name || 'Lotto Purchase Workflow'}</strong>
          <small>${translateRunEvent(run.event)} · ${translateRunConclusion(conclusion)}</small>
        </span>
        <span class="run-meta">
          ${formatDateTime(run.created_at)}<br />
          ${formatDuration(run.created_at, run.updated_at)}
        </span>
      </a>`;
    })
    .join('');

  if (!state.runs.length) {
    elements.runList.innerHTML = '<div class="empty-state">실행 기록이 없습니다.</div>';
  }
}

function statusBadge(status) {
  const labelMap = {
    waiting: '대기',
    winning: '당첨',
    losing: '낙첨',
    open: '열림',
    closed: '닫힘',
    success: '성공',
    failure: '실패'
  };

  return `<span class="status-badge status-${status}">${labelMap[status] || status}</span>`;
}

function getNextSundayNoonKst() {
  const utcOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + utcOffset);
  const daysUntilSunday = (7 - kstNow.getUTCDay()) % 7;
  let targetUtcMs = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate() + daysUntilSunday,
    3,
    0,
    0,
    0
  );

  if (targetUtcMs <= Date.now()) {
    targetUtcMs += 7 * 24 * 60 * 60 * 1000;
  }

  return new Date(targetUtcMs);
}

function formatDateTime(value, options = {}) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  }).format(new Date(value));
}

function formatCountdown(date) {
  const diff = Math.max(0, date.getTime() - Date.now());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return `${days}일 ${hours}시간 남음`;
}

function formatDuration(start, end) {
  if (!start || !end) return '-';
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}분 ${seconds % 60}초`;
}

function translateRunConclusion(value) {
  const map = {
    success: '성공',
    failure: '실패',
    cancelled: '취소',
    completed: '완료',
    in_progress: '실행 중',
    queued: '대기 중'
  };
  return map[value] || value || '-';
}

function translateRunEvent(value) {
  const map = {
    schedule: '스케줄',
    workflow_dispatch: '수동 실행',
    push: '푸시'
  };
  return map[value] || value || '-';
}

function exportCsv() {
  const rows = [['round', 'games', 'status', 'issue', 'created_at', 'result']];
  for (const item of state.filteredIssues) {
    rows.push([item.round, item.games, item.status, `#${item.issue.number}`, item.createdAt, item.result]);
  }

  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lotto-purchases.csv';
  link.click();
  URL.revokeObjectURL(url);
}

elements.settingsForm.addEventListener('submit', event => {
  event.preventDefault();
  state.repo = elements.repoInput.value.trim() || 'kkd927/lotto-purchase-action';
  state.token = elements.tokenInput.value.trim();
  sessionStorage.setItem('lotto-dashboard-repo', state.repo);
  sessionStorage.setItem('lotto-dashboard-token', state.token);
  loadData();
});

elements.clearTokenButton.addEventListener('click', () => {
  state.token = '';
  elements.tokenInput.value = '';
  sessionStorage.removeItem('lotto-dashboard-token');
  loadData();
});

elements.refreshButton.addEventListener('click', loadData);
elements.roundFilter.addEventListener('change', () => renderPurchases(state.issues.map(parseIssue)));
elements.statusFilter.addEventListener('change', () => renderPurchases(state.issues.map(parseIssue)));
elements.searchInput.addEventListener('input', () => renderPurchases(state.issues.map(parseIssue)));
elements.exportButton.addEventListener('click', exportCsv);

loadData();
