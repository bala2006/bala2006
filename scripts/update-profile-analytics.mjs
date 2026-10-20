import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const owner = 'bala2006';
const profileRepo = owner;
const apiRoot = 'https://api.github.com';
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const analyticsDir = path.join(outDir, 'assets', 'analytics');
const dataDir = path.join(outDir, 'data');

const projectAreas = {
  'AI systems & developer tools': [
    'nero', 'octopus', 'agentmesh-mcp', 'laya-browser-mcp', 'kiro-eng-toolkit',
  ],
  'Forecasting & reliability': [
    'transport-demand-forecasting', 'jma-etas-benchmark', 'railresilient-forecasting',
    'traffic-safety-compute-reliability-benchmark',
  ],
  'Machine learning research': ['reliable-deepfake-detection', 'voice-detection'],
  'Apps & creative tools': [
    'Tactical-Grid', 'Helium', 'luna-calorie-releases', 'crazy-ads',
  ],
  'Experiments & community tools': ['laya-rail', 'cobblemon-client-1.21.1'],
};

const palettes = {
  dark: {
    background: '#0d1419', card: '#131e24', cardAlt: '#17242a', border: '#2a3a40',
    text: '#edf4f4', muted: '#96a8ad', subtle: '#687c82', accent: '#56d6bf',
    accent2: '#a89aff', accent3: '#f0b45d', grid: '#26363c',
    levels: ['#17242a', '#124c45', '#167b68', '#28ad8c', '#61dfbd'],
  },
  light: {
    background: '#f3f8f7', card: '#ffffff', cardAlt: '#edf5f3', border: '#d4e1de',
    text: '#18292e', muted: '#5e7479', subtle: '#7c9195', accent: '#087f6e',
    accent2: '#6856b5', accent3: '#aa6700', grid: '#dce8e5',
    levels: ['#eaf2f0', '#b9e5d9', '#76ccb4', '#34a98c', '#087f6e'],
  },
};

const xml = (value = '') => String(value).replace(/[<>&"']/g, (char) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
}[char]));

const short = (value, length = 24) => {
  const text = String(value ?? 'Unknown');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value);

async function getJson(url, label) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bala2006-profile-analytics',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`${label}: GitHub API ${response.status}: ${detail}`);
  }
  return response.json();
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getCommitActivity(repo) {
  const url = `${apiRoot}/repos/${owner}/${encodeURIComponent(repo.name)}/stats/commit_activity`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'bala2006-profile-analytics',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (response.status === 204) return [];
    if (response.status === 202) {
      if (attempt < 2) {
        await pause(2000 * (attempt + 1));
        continue;
      }
      console.log(`Weekly statistics are still pending for ${repo.name}; deriving its calendar from commit history.`);
      return getCommitHistoryActivity(repo);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`${repo.name} commit activity: GitHub API ${response.status}: ${detail}`);
    }
    return response.json();
  }
  throw new Error(`Unable to load commit activity for ${repo.name}.`);
}

async function getCommitHistoryActivity(repo) {
  const until = new Date();
  const since = new Date(until.getTime() - 364 * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - since.getUTCDay());
  const weeks = new Map();
  let oldestSeen = until;

  for (let page = 1; page <= 20; page += 1) {
    const url = `${apiRoot}/repos/${owner}/${encodeURIComponent(repo.name)}/commits?per_page=100&page=${page}&since=${encodeURIComponent(since.toISOString())}&until=${encodeURIComponent(until.toISOString())}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'bala2006-profile-analytics',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`${repo.name} commit history: GitHub API ${response.status}: ${detail}`);
    }
    const commits = await response.json();
    if (commits.length === 0) break;
    for (const item of commits) {
      const stamp = item.commit?.committer?.date ?? item.commit?.author?.date;
      if (!stamp) continue;
      const date = new Date(stamp);
      if (date < oldestSeen) oldestSeen = date;
      const weekStart = new Date(date);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      weekStart.setUTCHours(0, 0, 0, 0);
      const timestamp = Math.floor(weekStart.getTime() / 1000);
      const week = weeks.get(timestamp) ?? { week: timestamp, days: Array(7).fill(0), total: 0 };
      week.days[date.getUTCDay()] += 1;
      week.total += 1;
      weeks.set(timestamp, week);
    }
    if (commits.length < 100 || oldestSeen <= since) break;
    if (page === 20) throw new Error(`${repo.name} exceeds the 2,000-commit fallback window; refusing to publish a partial calendar.`);
  }
  return [...weeks.values()].sort((a, b) => a.week - b.week);
}

async function listPublicRepositories() {
  const repos = [];
  for (let page = 1; page <= 10; page += 1) {
    const pageRepos = await getJson(
      `${apiRoot}/users/${owner}/repos?type=owner&per_page=100&sort=pushed&page=${page}`,
      'Public repository list',
    );
    repos.push(...pageRepos);
    if (pageRepos.length < 100) break;
  }
  return repos
    .filter((repo) => repo.name !== profileRepo && !repo.fork)
    .map((repo) => ({
      name: repo.name,
      url: repo.html_url,
      description: repo.description ?? '',
      primaryLanguage: repo.language ?? 'Unspecified',
      stars: repo.stargazers_count ?? 0,
      forks: repo.forks_count ?? 0,
      pushedAt: repo.pushed_at,
      archived: Boolean(repo.archived),
      area: Object.entries(projectAreas).find(([, names]) => names.includes(repo.name))?.[0] ?? 'Other projects',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function aggregateWeeks(repositories) {
  const days = new Map();
  const repoStats = repositories.map(({ repo, weeks }) => {
    let last90Days = 0;
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    for (const week of weeks) {
      const start = new Date(week.week * 1000);
      for (let index = 0; index < 7; index += 1) {
        const date = new Date(start);
        date.setUTCDate(date.getUTCDate() + index);
        const key = date.toISOString().slice(0, 10);
        const count = week.days?.[index] ?? 0;
        days.set(key, (days.get(key) ?? 0) + count);
        if (date.getTime() >= cutoff) last90Days += count;
      }
    }
    return { name: repo.name, url: repo.url, commits90d: last90Days, weeks };
  });
  const calendar = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, commits]) => ({ date, commits }));
  const monthly = new Map();
  for (const day of calendar) {
    const month = day.date.slice(0, 7);
    monthly.set(month, (monthly.get(month) ?? 0) + day.commits);
  }
  const months = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12)
    .map(([month, commits]) => ({ month, commits }));
  const commits52w = calendar.reduce((sum, day) => sum + day.commits, 0);
  return { calendar, months, commits52w, repoStats };
}

function svgBase({ title, description, width, height, p, body }) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">` +
    `<title id="title">${xml(title)}</title><desc id="desc">${xml(description)}</desc>` +
    `<style>text{font-family:Inter,Segoe UI,Arial,sans-serif}.title{fill:${p.text};font-size:24px;font-weight:700}.subtitle{fill:${p.muted};font-size:13px}.label{fill:${p.text};font-size:13px}.muted{fill:${p.muted};font-size:12px}.tiny{fill:${p.subtle};font-size:10px}.value{fill:${p.text};font-size:29px;font-weight:700}.card{fill:${p.card};stroke:${p.border};stroke-width:1}.track{fill:${p.grid}}.accent{fill:${p.accent}}</style>` +
    `<rect width="${width}" height="${height}" rx="22" fill="${p.background}"/>${body}</svg>`;
}

function overviewSvg(data, p) {
  const metrics = [
    ['PUBLIC REPOS', data.repos.length, 'owned repositories'],
    ['STARS', data.stars, 'across public repos'],
    ['FORKS', data.forks, 'across public repos'],
    ['COMMITS · 52 WEEKS', data.commits52w, 'default branch activity'],
  ];
  const cardWidth = 258;
  const cards = metrics.map(([label, value, note], index) => {
    const x = 40 + index * 280;
    return `<g><rect class="card" x="${x}" y="102" width="${cardWidth}" height="104" rx="15"/>` +
      `<text x="${x + 18}" y="129" class="tiny">${xml(label)}</text>` +
      `<text x="${x + 18}" y="166" class="value">${xml(formatNumber(value))}</text>` +
      `<text x="${x + 18}" y="190" class="tiny">${xml(note)}</text></g>`;
  }).join('');

  const languages = new Map();
  for (const repo of data.repos) {
    const language = repo.primaryLanguage || 'Unspecified';
    languages.set(language, (languages.get(language) ?? 0) + 1);
  }
  const languageRows = [...languages.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 7);
  const themeCounts = new Map();
  for (const repo of data.repos) themeCounts.set(repo.area, (themeCounts.get(repo.area) ?? 0) + 1);
  const areaRows = [...themeCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxLanguage = Math.max(1, ...languageRows.map(([, count]) => count));
  const maxArea = Math.max(1, ...areaRows.map(([, count]) => count));
  const leftRows = languageRows.map(([name, count], index) => {
    const y = 270 + index * 25;
    const width = 295 * count / maxLanguage;
    return `<text x="58" y="${y + 4}" class="label">${xml(short(name, 18))}</text>` +
      `<rect class="track" x="220" y="${y - 10}" width="295" height="12" rx="6"/>` +
      `<rect x="220" y="${y - 10}" width="${width.toFixed(1)}" height="12" rx="6" fill="${index % 2 ? p.accent2 : p.accent}"/>` +
      `<text x="526" y="${y + 2}" class="muted">${count}</text>`;
  }).join('');
  const rightRows = areaRows.map(([name, count], index) => {
    const y = 270 + index * 25;
    const width = 260 * count / maxArea;
    return `<text x="640" y="${y + 4}" class="label">${xml(short(name, 28))}</text>` +
      `<rect class="track" x="842" y="${y - 10}" width="260" height="12" rx="6"/>` +
      `<rect x="842" y="${y - 10}" width="${width.toFixed(1)}" height="12" rx="6" fill="${index % 2 ? p.accent3 : p.accent}"/>` +
      `<text x="1114" y="${y + 2}" class="muted">${count}</text>`;
  }).join('');

  const body = `<text x="40" y="52" class="title">PROFILE ANALYTICS</text>` +
    `<text x="40" y="77" class="subtitle">Public, non-fork repositories · refreshed ${xml(data.generatedAt.slice(0, 10))}</text>` +
    cards +
    `<rect class="card" x="40" y="232" width="530" height="218" rx="16"/>` +
    `<text x="58" y="258" class="label">Primary language by repository</text>` + leftRows +
    `<rect class="card" x="590" y="232" width="570" height="218" rx="16"/>` +
    `<text x="610" y="258" class="label">Projects by focus area</text>` + rightRows +
    `<text x="40" y="478" class="tiny">Commits count activity on each repository’s default branch; this is not an author-only contribution count.</text>`;
  return svgBase({
    title: 'GitHub profile analytics overview',
    description: 'Repository, star, fork, commit, language, and project-area summaries for public non-fork repositories.',
    width: 1200, height: 500, p, body,
  });
}

function calendarSvg(data, p) {
  const cells = data.calendar;
  const first = cells.length ? new Date(`${cells[0].date}T00:00:00Z`) : new Date();
  const firstSunday = new Date(first);
  firstSunday.setUTCDate(firstSunday.getUTCDate() - firstSunday.getUTCDay());
  const lookup = new Map(cells.map((day) => [day.date, day.commits]));
  const max = Math.max(1, ...cells.map((day) => day.commits));
  const days = 7;
  const weeks = 53;
  const cell = 13;
  const gap = 4;
  const x0 = 90;
  const y0 = 91;
  let rects = '';
  for (let week = 0; week < weeks; week += 1) {
    for (let dow = 0; dow < days; dow += 1) {
      const date = new Date(firstSunday);
      date.setUTCDate(date.getUTCDate() + week * 7 + dow);
      const key = date.toISOString().slice(0, 10);
      if (date < first || date > new Date(`${cells.at(-1)?.date ?? key}T00:00:00Z`)) continue;
      const count = lookup.get(key) ?? 0;
      const level = count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(count / max * 4)));
      const x = x0 + week * (cell + gap);
      const y = y0 + dow * (cell + gap);
      rects += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${p.levels[level]}"><title>${xml(key)}: ${count} commits</title></rect>`;
    }
  }
  const monthLabels = [];
  let previousMonth = '';
  for (let week = 0; week < weeks; week += 1) {
    const date = new Date(firstSunday);
    date.setUTCDate(date.getUTCDate() + week * 7);
    const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    if (month !== previousMonth && date >= first) {
      monthLabels.push(`<text x="${x0 + week * (cell + gap)}" y="74" class="tiny">${month}</text>`);
      previousMonth = month;
    }
  }
  const labels = [['Mon', 1], ['Wed', 3], ['Fri', 5]].map(([label, dow]) =>
    `<text x="48" y="${y0 + dow * (cell + gap) + 10}" class="tiny">${label}</text>`).join('');
  const legendX = 900;
  const legend = `<text x="${legendX - 76}" y="249" class="tiny">Less</text>` +
    p.levels.map((color, index) => `<rect x="${legendX + index * 20}" y="238" width="13" height="13" rx="3" fill="${color}"/>`).join('') +
    `<text x="${legendX + 110}" y="249" class="tiny">More</text>`;
  const body = `<text x="40" y="42" class="title">CUSTOM COMMIT CALENDAR</text>` +
    `<text x="40" y="63" class="subtitle">Daily commits across public repository default branches · rolling 52 weeks</text>` +
    monthLabels.join('') + labels + rects + legend +
    `<text x="40" y="279" class="tiny">A commit is counted on the date it appears in the repository’s weekly GitHub activity summary.</text>`;
  return svgBase({
    title: 'Custom GitHub commit calendar',
    description: 'A daily heatmap of commits across public non-fork repository default branches for the rolling 52-week period.',
    width: 1200, height: 295, p, body,
  });
}

function commitAnalysisSvg(data, p) {
  const body = [`<text x="40" y="48" class="title">COMMIT &amp; REPOSITORY ANALYSIS</text>`,
    `<text x="40" y="70" class="subtitle">Monthly commit trend · recent repository activity · repository stars</text>`];

  const monthX = 74;
  const monthY = 136;
  const chartWidth = 480;
  const chartHeight = 180;
  const maxMonth = Math.max(1, ...data.months.map((m) => m.commits));
  body.push(`<rect class="card" x="32" y="91" width="548" height="262" rx="16"/>`);
  body.push(`<text x="52" y="119" class="label">Commits by month</text>`);
  body.push(`<line x1="${monthX}" y1="${monthY + chartHeight}" x2="${monthX + chartWidth}" y2="${monthY + chartHeight}" stroke="${p.grid}"/>`);
  const barGap = 9;
  const barWidth = Math.max(10, (chartWidth - barGap * (data.months.length - 1)) / Math.max(1, data.months.length));
  for (let i = 0; i < data.months.length; i += 1) {
    const item = data.months[i];
    const height = Math.max(2, chartHeight * item.commits / maxMonth);
    const x = monthX + i * (barWidth + barGap);
    const y = monthY + chartHeight - height;
    const monthLabel = new Date(`${item.month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    body.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" rx="4" fill="${i % 3 === 0 ? p.accent2 : p.accent}"><title>${xml(item.month)}: ${item.commits} commits</title></rect>`);
    body.push(`<text x="${(x + barWidth / 2).toFixed(1)}" y="${monthY + chartHeight + 18}" class="tiny" text-anchor="middle">${monthLabel}</text>`);
  }

  const recent = [...data.repoStats].sort((a, b) => b.commits90d - a.commits90d || a.name.localeCompare(b.name)).slice(0, 7);
  const maxRecent = Math.max(1, ...recent.map((r) => r.commits90d));
  body.push(`<rect class="card" x="600" y="91" width="568" height="262" rx="16"/>`);
  body.push(`<text x="620" y="119" class="label">Most active repositories · last 90 days</text>`);
  recent.forEach((repo, index) => {
    const y = 154 + index * 26;
    const width = 285 * repo.commits90d / maxRecent;
    body.push(`<text x="620" y="${y + 3}" class="muted">${xml(short(repo.name, 22))}</text>`);
    body.push(`<rect class="track" x="800" y="${y - 9}" width="285" height="11" rx="5.5"/>`);
    body.push(`<rect x="800" y="${y - 9}" width="${width.toFixed(1)}" height="11" rx="5.5" fill="${index % 2 ? p.accent2 : p.accent}"><title>${xml(repo.name)}: ${repo.commits90d} commits</title></rect>`);
    body.push(`<text x="1095" y="${y + 3}" class="tiny">${repo.commits90d}</text>`);
  });

  const stars = [...data.repos].sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name)).slice(0, 8);
  const maxStars = Math.max(1, ...stars.map((r) => r.stars));
  body.push(`<rect class="card" x="32" y="373" width="1136" height="246" rx="16"/>`);
  body.push(`<text x="52" y="402" class="label">Most starred public repositories</text>`);
  const left = stars.slice(0, 4);
  const right = stars.slice(4, 8);
  const addStarRows = (rows, startX) => rows.forEach((repo, index) => {
    const y = 444 + index * 39;
    const barX = startX + 155;
    const barWidth = 200 * repo.stars / maxStars;
    body.push(`<text x="${startX}" y="${y + 4}" class="label">${xml(short(repo.name, 22))}</text>`);
    body.push(`<rect class="track" x="${barX}" y="${y - 9}" width="280" height="14" rx="7"/>`);
    body.push(`<rect x="${barX}" y="${y - 9}" width="${barWidth.toFixed(1)}" height="14" rx="7" fill="${p.accent3}"><title>${xml(repo.name)}: ${repo.stars} stars · ${repo.forks} forks</title></rect>`);
    body.push(`<text x="${barX + 210}" y="${y + 4}" class="muted">★ ${repo.stars} · forks ${repo.forks}</text>`);
  });
  addStarRows(left, 52);
  addStarRows(right, 620);
  body.push(`<text x="40" y="647" class="tiny">All counts use public, non-fork repositories; commit counts cover each repository’s default branch.</text>`);

  return svgBase({
    title: 'GitHub commit and repository analysis',
    description: 'Monthly commit bar chart, repositories with most default-branch commits in the last 90 days, and most-starred repositories.',
    width: 1200, height: 675, p, body: body.join(''),
  });
}

function placeholderSvg(title, message, p) {
  const body = `<text x="40" y="52" class="title">${xml(title)}</text>` +
    `<text x="40" y="80" class="subtitle">${xml(message)}</text>` +
    `<rect class="card" x="40" y="112" width="1120" height="115" rx="16"/>` +
    `<circle cx="88" cy="169" r="19" fill="${p.cardAlt}" stroke="${p.accent}"/>` +
    `<path d="M88 157v13l9 5" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>` +
    `<text x="126" y="164" class="label">Waiting for the first scheduled analytics refresh</text>` +
    `<text x="126" y="188" class="muted">This panel will populate from public GitHub repository data.</text>`;
  return svgBase({ title, description: message, width: 1200, height: 260, p, body });
}

async function main() {
  await mkdir(analyticsDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  const repos = await listPublicRepositories();
  const activity = [];
  for (const repo of repos) {
    const weeks = await getCommitActivity(repo);
    activity.push({ repo, weeks });
  }
  const aggregate = aggregateWeeks(activity);
  const data = {
    generatedAt: new Date().toISOString(),
    owner,
    scope: 'Public non-fork repositories; commit activity on each default branch.',
    repos: repos.map(({ name, url, description, primaryLanguage, stars, forks, pushedAt, archived, area }) => ({
      name, url, description, primaryLanguage, stars, forks, pushedAt, archived, area,
    })),
    stars: repos.reduce((sum, repo) => sum + repo.stars, 0),
    forks: repos.reduce((sum, repo) => sum + repo.forks, 0),
    commits52w: aggregate.commits52w,
    calendar: aggregate.calendar,
    months: aggregate.months,
    repoStats: aggregate.repoStats.map(({ name, url, commits90d }) => ({ name, url, commits90d })),
  };

  const svgByName = {
    overview: (p) => overviewSvg(data, p),
    'commit-calendar': (p) => calendarSvg(data, p),
    'commit-analysis': (p) => commitAnalysisSvg(data, p),
  };
  for (const [name, render] of Object.entries(svgByName)) {
    for (const [mode, palette] of Object.entries(palettes)) {
      await writeFile(path.join(analyticsDir, `${name}-${mode}.svg`), render(palette), 'utf8');
    }
  }
  await writeFile(path.join(dataDir, 'profile-analytics.json'), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Updated analytics for ${repos.length} public repositories (${aggregate.commits52w} default-branch commits).`);
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exitCode = 1;
});

