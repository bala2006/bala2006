import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const owner = 'bala2006';
const profileRepo = owner;
const apiRoot = 'https://api.github.com';
const scriptPath = fileURLToPath(import.meta.url);
const outDir = path.resolve(path.dirname(scriptPath), '..');
const analyticsDir = path.join(outDir, 'assets', 'analytics');
const dataDir = path.join(outDir, 'data');

const identity = {
  handle: '@bala2006',
  name: 'Bala Chandra Sekhar Reddy Moole',
  tagline: 'I build AI systems, research tools, and apps, then make the results easy to inspect.',
  buildingLabel: 'Currently building',
  buildingName: 'Octopus',
  buildingNote: 'a local-first team of AI agents that plans, builds, reviews, and tests software.',
};

const projectAreas = {
  'AI systems': [
    'nero', 'octopus', 'agentmesh-mcp', 'laya-browser-mcp', 'kiro-eng-toolkit',
  ],
  'Forecasting': [
    'transport-demand-forecasting', 'jma-etas-benchmark', 'railresilient-forecasting',
    'traffic-safety-compute-reliability-benchmark',
  ],
  'ML research': ['reliable-deepfake-detection', 'voice-detection'],
  'Apps & creative': ['Tactical-Grid', 'Helium', 'luna-calorie-releases', 'crazy-ads'],
  'Experiments': ['laya-rail', 'cobblemon-client-1.21.1'],
};

// GitHub's Primer light and dark tokens, plus the exact contribution-graph ramp.
const palettes = {
  dark: {
    canvas: '#0d1117', subtle: '#161b22', border: '#30363d',
    fg: '#e6edf3', muted: '#8b949e', faint: '#6e7681',
    accent: '#58a6ff', success: '#3fb950',
    levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    other: '#484f58',
  },
  light: {
    canvas: '#ffffff', subtle: '#f6f8fa', border: '#d0d7de',
    fg: '#1f2328', muted: '#59636e', faint: '#818b98',
    accent: '#0969da', success: '#1a7f37',
    levels: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    other: '#afb8c1',
  },
};

// Linguist colors, so the language bar reads like GitHub's own.
const languageColors = {
  Python: '#3572a5', TypeScript: '#3178c6', JavaScript: '#f1e05a', 'C++': '#f34b7d',
  Dart: '#00b4ab', HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051',
  'Jupyter Notebook': '#da5b0b', Kotlin: '#a97bff', Java: '#b07219', Rust: '#dea584',
  'C#': '#178600', C: '#555555', Go: '#00add8', Swift: '#f05138', Vue: '#41b883',
  Ruby: '#701516', PHP: '#4f5d95', SCSS: '#c6538c', MDX: '#fcb32c', PowerShell: '#012456',
  Makefile: '#427819', Dockerfile: '#384d54', CMake: '#da3434',
};

const fallbackColors = ['#8b949e', '#d29922', '#a371f7', '#39c5cf', '#f85149'];

const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif';

const xml = (value = '') => String(value).replace(/[<>&"']/g, (char) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
}[char]));

const short = (value, length = 24) => {
  const text = String(value ?? 'Unknown');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

// Greedy wrap on a character budget, so narrow panels follow the copy instead of
// hard-coding line breaks next to it.
const wrapText = (value, maxChars) => {
  const lines = [];
  let line = '';
  for (const word of String(value ?? '').split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
};

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value);

const formatPercent = (share) => {
  const percent = share * 100;
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
};

const formatDate = (value) => new Date(value)
  .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const monthName = (date) => date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

const hashOf = (value) => [...String(value)]
  .reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7);

const languageColor = (name) => languageColors[name] ?? fallbackColors[hashOf(name) % fallbackColors.length];

const apiHeaders = () => {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'bala2006-profile-analytics',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

async function getJson(url, label) {
  const response = await fetch(url, { headers: apiHeaders() });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`${label}: GitHub API ${response.status}: ${detail}`);
  }
  return response.json();
}

async function getSearchTotal(kind) {
  const query = `author:${owner} is:${kind}`;
  const result = await getJson(
    `${apiRoot}/search/issues?q=${encodeURIComponent(query)}&per_page=1`,
    `Public ${kind} count`,
  );
  if (result.incomplete_results || !Number.isInteger(result.total_count)) {
    throw new Error(`GitHub returned an incomplete public ${kind} count.`);
  }
  return result.total_count;
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getCommitActivity(repo) {
  const url = `${apiRoot}/repos/${owner}/${encodeURIComponent(repo.name)}/stats/commit_activity`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: apiHeaders() });
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
    const response = await fetch(url, { headers: apiHeaders() });
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
      languagesUrl: repo.languages_url,
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

const getLanguages = (repo) => getJson(repo.languagesUrl, `${repo.name} languages`);

function aggregateLanguages(perRepo) {
  const totals = new Map();
  for (const languages of perRepo) {
    for (const [name, bytes] of Object.entries(languages)) {
      if (!Number.isFinite(bytes) || bytes <= 0) continue;
      totals.set(name, (totals.get(name) ?? 0) + bytes);
    }
  }
  const totalBytes = [...totals.values()].reduce((sum, bytes) => sum + bytes, 0);
  return [...totals.entries()]
    .map(([name, bytes]) => ({ name, bytes, share: totalBytes ? bytes / totalBytes : 0 }))
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
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
    return { name: repo.name, url: repo.url, commits90d: last90Days };
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

// ---------------------------------------------------------------------------
// Design system
// ---------------------------------------------------------------------------

function svgBase({ title, description, width, height, p, body }) {
  const style = [
    `text{font-family:${fontFamily}}`,
    `.title{fill:${p.fg};font-size:16px;font-weight:600}`,
    `.sub{fill:${p.muted};font-size:12px}`,
    `.note{fill:${p.faint};font-size:11px}`,
    `.label{fill:${p.muted};font-size:11px}`,
    `.value{fill:${p.fg};font-size:20px;font-weight:600}`,
    `.repo{fill:${p.fg};font-size:12px}`,
    `.count{fill:${p.muted};font-size:11px}`,
    `.hero-handle{fill:${p.accent};font-size:12px;font-weight:600}`,
    `.hero-name{fill:${p.fg};font-size:30px;font-weight:600;letter-spacing:-.5px}`,
    `.hero-name-sm{fill:${p.fg};font-size:18px;font-weight:600;letter-spacing:-.2px}`,
    `.hero-tag{fill:${p.muted};font-size:14px}`,
    `.hero-eyebrow{fill:${p.faint};font-size:10px;font-weight:600;letter-spacing:.9px}`,
    `.hero-building{fill:${p.fg};font-size:15px;font-weight:600}`,
    `.hero-building-note{fill:${p.muted};font-size:12px}`,
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t d">`
    + `<title id="t">${xml(title)}</title><desc id="d">${xml(description)}</desc>`
    + `<style>${style}</style>`
    + `<rect width="${width}" height="${height}" rx="6" fill="${p.canvas}"/>`
    + `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="none" stroke="${p.border}"/>`
    + body
    + '</svg>';
}

const rule = (p, y, x0, x1) => `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${p.border}"/>`;

const cell = (p, x, y, width, height) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="${p.subtle}"/>`;

const panelHeader = (title, meta, p, width, inset) => `<text x="${inset}" y="32" class="title">${xml(title)}</text>`
  + `<text x="${width - inset}" y="32" class="sub" text-anchor="end">${xml(meta)}</text>`;

function languageSeries(data, p, limit = 5) {
  const series = data.languages.slice(0, limit).map(({ name, share }) => ({
    name, share, color: languageColor(name),
  }));
  const rest = data.languages.slice(limit);
  if (rest.length) {
    series.push({
      name: rest.length === 1 ? rest[0].name : 'Other',
      share: rest.reduce((sum, item) => sum + item.share, 0),
      color: p.other,
    });
  }
  return series;
}

// Segments are inset by the gap so adjacent similar hues stay separable.
function stackedLanguages(series, x, y, width, height) {
  let cursor = x;
  return series.map((item) => {
    const segmentWidth = item.share * width;
    const rect = `<rect x="${cursor.toFixed(2)}" y="${y}" width="${Math.max(segmentWidth - 3, 1).toFixed(2)}" height="${height}" fill="${item.color}"><title>${xml(item.name)}: ${formatPercent(item.share)}</title></rect>`;
    cursor += segmentWidth;
    return rect;
  }).join('');
}

function languageLegend(series, p, { x, y, columnWidth, columns }) {
  return series.map((item, index) => {
    const cx = x + (index % columns) * columnWidth;
    const cy = y + Math.floor(index / columns) * 22;
    return `<circle cx="${cx + 4}" cy="${cy - 4}" r="4" fill="${item.color}"/>`
      + `<text x="${cx + 14}" y="${cy}" class="sub">${xml(short(item.name, 18))}</text>`
      + `<text x="${cx + columnWidth - 34}" y="${cy}" class="count" text-anchor="end">${formatPercent(item.share)}</text>`;
  }).join('');
}

function statCells(stats, p, { x, y, columns, cellWidth, cellHeight, gap }) {
  return stats.map(([label, value], index) => {
    const cx = x + (index % columns) * (cellWidth + gap);
    const cy = y + Math.floor(index / columns) * (cellHeight + gap);
    return cell(p, cx, cy, cellWidth, cellHeight)
      + `<text x="${cx + 12}" y="${cy + 22}" class="label">${xml(label)}</text>`
      + `<text x="${cx + 12}" y="${cy + 47}" class="value">${xml(formatNumber(value))}</text>`;
  }).join('');
}

function heatmap(calendar, p, { x, y, cellSize, gap, weekOffset = 0, weekCount }) {
  const byDate = new Map(calendar.map((day) => [day.date, day.commits]));
  const first = new Date(`${calendar[0].date}T00:00:00Z`);
  const last = new Date(`${calendar.at(-1).date}T00:00:00Z`);
  const aligned = new Date(first);
  aligned.setUTCDate(aligned.getUTCDate() - aligned.getUTCDay());
  const totalWeeks = Math.ceil((Math.round((last - aligned) / 86400000) + 1) / 7);
  const start = Math.max(0, weekOffset);
  const end = Math.min(totalWeeks, start + weekCount);
  const max = Math.max(1, ...calendar.map((day) => day.commits));
  const pitch = cellSize + gap;

  let cells = '';
  let labels = '';
  let previousMonth = '';
  let lastLabel = -3;
  for (let week = start; week < end; week += 1) {
    const column = week - start;
    const weekStart = new Date(aligned);
    weekStart.setUTCDate(weekStart.getUTCDate() + week * 7);
    const month = monthName(weekStart);
    if (month !== previousMonth && column - lastLabel >= 3) {
      labels += `<text x="${x + column * pitch}" y="${y - 10}" class="note">${month}</text>`;
      previousMonth = month;
      lastLabel = column;
    }
    for (let dow = 0; dow < 7; dow += 1) {
      const date = new Date(weekStart);
      date.setUTCDate(date.getUTCDate() + dow);
      if (date < first || date > last) continue;
      const key = date.toISOString().slice(0, 10);
      const count = byDate.get(key) ?? 0;
      const level = count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
      cells += `<rect x="${x + column * pitch}" y="${y + dow * pitch}" width="${cellSize}" height="${cellSize}" rx="2" fill="${p.levels[level]}"><title>${xml(key)}: ${count} ${count === 1 ? 'commit' : 'commits'}</title></rect>`;
    }
  }

  const weekdays = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']]
    .map(([dow, label]) => `<text x="${x - 8}" y="${y + dow * pitch + cellSize - 2}" class="note" text-anchor="end">${label}</text>`)
    .join('');

  return { body: labels + weekdays + cells, totalWeeks };
}

// Right-aligned against `right` so the legend never floats mid-panel.
function heatLegend(p, { right, y }) {
  const width = 28 + 5 * 15 + 2 + 27;
  const x = right - width;
  return `<text x="${x}" y="${y}" class="note">Less</text>`
    + p.levels.map((color, index) => `<rect x="${x + 28 + index * 15}" y="${y - 8}" width="10" height="10" rx="2" fill="${color}"/>`).join('')
    + `<text x="${x + 28 + 5 * 15 + 2}" y="${y}" class="note">More</text>`;
}

// One shared `peak` keeps every bar in a panel on the same scale.
function repoRows(repos, p, { x, y, width, rowHeight, limit, peak, nameWidth = 190, stacked = false }) {
  const rows = repos.slice(0, limit);
  const scale = Math.max(1, peak ?? Math.max(...rows.map((repo) => repo.commits90d)));
  return rows.map((repo, index) => {
    const cy = y + index * rowHeight;
    const label = `<text x="${x}" y="${cy}" class="repo">${xml(short(repo.name, 30))}</text>`
      + `<text x="${x + width}" y="${cy}" class="count" text-anchor="end">${repo.commits90d}</text>`;
    const barX = stacked ? x : x + nameWidth;
    const barWidth = stacked ? width : width - nameWidth - 38;
    const barY = stacked ? cy + 9 : cy - 7;
    const length = (repo.commits90d / scale) * barWidth;
    return label
      + `<rect x="${barX}" y="${barY}" width="${barWidth}" height="6" rx="3" fill="${p.subtle}"/>`
      + `<rect x="${barX}" y="${barY}" width="${Math.max(length, 1.5).toFixed(1)}" height="6" rx="3" fill="${p.success}"><title>${xml(repo.name)}: ${repo.commits90d} ${repo.commits90d === 1 ? 'commit' : 'commits'}</title></rect>`;
  }).join('');
}

const byActivity = (repos) => [...repos]
  .sort((a, b) => b.commits90d - a.commits90d || a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function heroSvg(_data, p) {
  const body = `<text x="24" y="44" class="hero-handle">${xml(identity.handle)}</text>`
    + `<text x="24" y="82" class="hero-name">${xml(identity.name)}</text>`
    + `<text x="24" y="110" class="hero-tag">${xml(identity.tagline)}</text>`
    + rule(p, 132, 24, 776)
    + `<text x="24" y="156" class="hero-eyebrow">${xml(identity.buildingLabel.toUpperCase())}</text>`
    + `<text x="24" y="178"><tspan class="hero-building">${xml(identity.buildingName)}</tspan><tspan class="hero-building-note" dx="10">${xml(identity.buildingNote)}</tspan></text>`;
  return svgBase({
    title: `${identity.name} introduction`,
    description: `${identity.handle}. ${identity.tagline} Currently building ${identity.buildingName}, ${identity.buildingNote}`,
    width: 800, height: 202, p, body,
  });
}

function heroMobileSvg(_data, p) {
  const tagLines = wrapText(identity.tagline, 46);
  const noteLines = wrapText(identity.buildingNote, 44);
  const ruleY = 96 + (tagLines.length - 1) * 20 + 18;
  const eyebrowY = ruleY + 24;
  const nameY = eyebrowY + 20;
  const noteTop = nameY + 20;
  const height = noteTop + (noteLines.length - 1) * 16 + 22;
  const body = `<text x="20" y="40" class="hero-handle">${xml(identity.handle)}</text>`
    + `<text x="20" y="70" class="hero-name-sm">${xml(identity.name)}</text>`
    + tagLines.map((line, index) => `<text x="20" y="${96 + index * 20}" class="hero-tag">${xml(line)}</text>`).join('')
    + rule(p, ruleY, 20, 380)
    + `<text x="20" y="${eyebrowY}" class="hero-eyebrow">${xml(identity.buildingLabel.toUpperCase())}</text>`
    + `<text x="20" y="${nameY}" class="hero-building">${xml(identity.buildingName)}</text>`
    + noteLines.map((line, index) => `<text x="20" y="${noteTop + index * 16}" class="hero-building-note">${xml(line)}</text>`).join('');
  return svgBase({
    title: `${identity.name} introduction`,
    description: `${identity.handle}. ${identity.tagline} Currently building ${identity.buildingName}, ${identity.buildingNote}`,
    width: 400, height, p, body,
  });
}

function overviewSvg(data, p) {
  const series = languageSeries(data, p);
  const stats = [
    ['Public repos', data.repos.length],
    ['Commits · 52w', data.commits52w],
    ['Active · 90d', data.activeRepos90d],
    ['Stars', data.stars],
    ['Pull requests', data.pullRequests],
    ['Issues', data.issues],
  ];
  const body = panelHeader('Profile overview', `Updated ${formatDate(data.generatedAt)}`, p, 800, 20)
    + rule(p, 46, 20, 780)
    + statCells(stats, p, { x: 20, y: 62, columns: 3, cellWidth: 245, cellHeight: 62, gap: 12 })
    + rule(p, 214, 20, 780) +
    `<text x="20" y="238" class="label">Code by language</text>`
    + `<text x="780" y="238" class="note" text-anchor="end">share of bytes on default branches</text>`
    + `<clipPath id="langbar"><rect x="20" y="248" width="760" height="10" rx="5"/></clipPath>`
    + `<g clip-path="url(#langbar)">${stackedLanguages(series, 20, 248, 760, 10)}</g>`
    + languageLegend(series, p, { x: 20, y: 282, columnWidth: 254, columns: 3 });
  return svgBase({
    title: 'GitHub profile overview',
    description: `Repository, star, pull request, issue and commit totals, plus the share of code by language across ${data.repos.length} public non-fork repositories.`,
    width: 800, height: 318, p, body,
  });
}

function overviewMobileSvg(data, p) {
  const series = languageSeries(data, p);
  const stats = [
    ['Repos', data.repos.length],
    ['Commits · 52w', data.commits52w],
    ['Active · 90d', data.activeRepos90d],
    ['Stars', data.stars],
    ['PRs', data.pullRequests],
    ['Issues', data.issues],
  ];
  const body = panelHeader('Overview', formatDate(data.generatedAt), p, 400, 20)
    + rule(p, 46, 20, 380)
    + statCells(stats, p, { x: 20, y: 62, columns: 2, cellWidth: 174, cellHeight: 62, gap: 12 })
    + rule(p, 286, 20, 380) +
    `<text x="20" y="310" class="label">Code by language</text>`
    + `<text x="20" y="328" class="note">share of bytes on default branches</text>`
    + `<clipPath id="langbar"><rect x="20" y="340" width="360" height="8" rx="4"/></clipPath>`
    + `<g clip-path="url(#langbar)">${stackedLanguages(series, 20, 340, 360, 8)}</g>`
    + languageLegend(series, p, { x: 20, y: 372, columnWidth: 184, columns: 2 });
  return svgBase({
    title: 'GitHub profile overview',
    description: `Repository, star, pull request, issue and commit totals, plus the share of code by language across ${data.repos.length} public non-fork repositories.`,
    width: 400, height: 436, p, body,
  });
}

function activitySvg(data, p) {
  const grid = heatmap(data.calendar, p, { x: 60, y: 72, cellSize: 10, gap: 3, weekCount: 53 });
  const repos = byActivity(data.repoStats).slice(0, 6);
  const peak = Math.max(...repos.map((repo) => repo.commits90d));
  const body = panelHeader(
    'Commit activity',
    `${formatDate(data.calendar[0].date)} – ${formatDate(data.calendar.at(-1).date)}`,
    p, 800, 20,
  )
    + rule(p, 46, 20, 780)
    + grid.body
    + heatLegend(p, { right: 780, y: 186 })
    + rule(p, 206, 20, 780)
    + `<text x="20" y="230" class="label">Most active repositories · last 90 days</text>`
    + `<text x="780" y="230" class="note" text-anchor="end">default-branch commits</text>`
    + repoRows(repos, p, { x: 20, y: 260, width: 760, rowHeight: 26, limit: 6, peak, nameWidth: 210 });
  return svgBase({
    title: 'Daily commit activity for the last 52 weeks',
    description: `A contribution calendar of daily commits across public repository default branches, followed by the most active repositories over the last 90 days.`,
    width: 800, height: 412, p, body,
  });
}

function activityMobileSvg(data, p) {
  const full = heatmap(data.calendar, p, { x: 44, y: 112, cellSize: 9, gap: 3, weekCount: 52 });
  const earlier = heatmap(data.calendar, p, { x: 44, y: 112, cellSize: 9, gap: 3, weekCount: 26 });
  const recent = heatmap(data.calendar, p, {
    x: 44, y: 248, cellSize: 9, gap: 3, weekOffset: Math.max(0, full.totalWeeks - 26), weekCount: 26,
  });
  const repos = byActivity(data.repoStats).slice(0, 5);
  const peak = Math.max(...repos.map((repo) => repo.commits90d));
  const body = panelHeader('Commit activity', '', p, 400, 20)
    + `<text x="20" y="48" class="sub">Public default branches · 52 weeks</text>`
    + rule(p, 62, 20, 380)
    + `<text x="20" y="84" class="label">Earlier 26 weeks</text>`
    + earlier.body
    + `<text x="20" y="220" class="label">Recent 26 weeks</text>`
    + recent.body
    + heatLegend(p, { right: 380, y: 352 })
    + rule(p, 370, 20, 380)
    + `<text x="20" y="394" class="label">Most active · last 90 days</text>`
    + repoRows(repos, p, { x: 20, y: 420, width: 360, rowHeight: 34, limit: 5, peak, stacked: true });
  return svgBase({
    title: 'Daily commit activity for the last 52 weeks',
    description: 'A contribution calendar of daily commits across public repository default branches, split into two 26-week panels, followed by the most active repositories over the last 90 days.',
    width: 400, height: 580, p, body,
  });
}

const panels = {
  hero: heroSvg,
  'hero-mobile': heroMobileSvg,
  overview: overviewSvg,
  'overview-mobile': overviewMobileSvg,
  activity: activitySvg,
  'activity-mobile': activityMobileSvg,
};

async function renderAll(data, { assetsDir = path.join(outDir, 'assets'), analyticsOutput = analyticsDir } = {}) {
  await mkdir(analyticsOutput, { recursive: true });
  for (const [name, render] of Object.entries(panels)) {
    const target = name.startsWith('hero') ? assetsDir : analyticsOutput;
    for (const [mode, palette] of Object.entries(palettes)) {
      await writeFile(path.join(target, `${name}-${mode}.svg`), render(data, palette), 'utf8');
    }
  }
}

async function main() {
  await mkdir(analyticsDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  const repos = await listPublicRepositories();
  const activity = [];
  const languagesByRepo = [];
  for (const repo of repos) {
    const [weeks, languages] = await Promise.all([getCommitActivity(repo), getLanguages(repo)]);
    activity.push({ repo, weeks });
    languagesByRepo.push(languages);
  }
  const aggregate = aggregateWeeks(activity);
  const languages = aggregateLanguages(languagesByRepo);
  const pullRequests = await getSearchTotal('pull-request');
  const issues = await getSearchTotal('issue');
  const data = {
    generatedAt: new Date().toISOString(),
    owner,
    scope: 'Public non-fork repositories; commit activity on each default branch.',
    repos: repos.map(({ name, url, description, primaryLanguage, stars, forks, pushedAt, archived, area }) => ({
      name, url, description, primaryLanguage, stars, forks, pushedAt, archived, area,
    })),
    stars: repos.reduce((sum, repo) => sum + repo.stars, 0),
    forks: repos.reduce((sum, repo) => sum + repo.forks, 0),
    pullRequests,
    issues,
    commits52w: aggregate.commits52w,
    activeRepos90d: aggregate.repoStats.filter((repo) => repo.commits90d > 0).length,
    languages,
    totalBytes: languages.reduce((sum, language) => sum + language.bytes, 0),
    calendar: aggregate.calendar,
    months: aggregate.months,
    repoStats: aggregate.repoStats,
  };

  await renderAll(data);
  await writeFile(path.join(dataDir, 'profile-analytics.json'), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Updated analytics for ${repos.length} public repositories (${aggregate.commits52w} default-branch commits, ${languages.length} languages).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}

export { renderAll, palettes, panels };
