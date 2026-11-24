import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const W = 830;
const RED = '#ff453a';
const TZ = 'America/Sao_Paulo';
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIGIT = 0.646;
const DOT = 0.2686;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const text = (x, y, s, size, weight = 400, cls = 't1', extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" class="${cls}" ${extra}>${esc(s)}</text>`;

const eyebrow = (x, y, label) => text(x, y, label, 11.5, 600, 't3', 'letter-spacing="2.76"');

async function fontFace() {
  const data = (await readFile(join(here, 'inter.woff2'))).toString('base64');
  return `@font-face{font-family:'Inter B';font-weight:100 900;src:url(data:font/woff2;base64,${data}) format('woff2')}`;
}

function frame(h, title, css, defs, body, font) {
  const base =
    "text{font-family:'Inter B',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-feature-settings:'kern','cv11','ss01'}" +
    '.t1{fill:#f5f5f5}.t2{fill:#f5f5f5;fill-opacity:.62}.t3{fill:#f5f5f5;fill-opacity:.38}.num{font-variant-numeric:tabular-nums}' +
    '.pulse{animation:pulse 2.4s cubic-bezier(.2,.8,.2,1) infinite;transform-box:fill-box;transform-origin:center}' +
    '@keyframes pulse{0%{transform:scale(1);opacity:.55}80%,100%{transform:scale(3.2);opacity:0}}' +
    '.dr{animation:drift 22s ease-in-out infinite alternate;transform-origin:415px 50%}' +
    '@keyframes drift{from{transform:translate(-2%,-3%) scale(1)}to{transform:translate(2%,3%) scale(1.06)}}' +
    '@media (prefers-reduced-motion:reduce){*{animation:none!important}}';
  const shell =
    `<clipPath id="cc"><rect width="${W}" height="${h}" rx="24"/></clipPath>` +
    '<filter id="gn" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>' +
    '<radialGradient id="vg" cx="50%" cy="0%" r="120%"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>' +
    '<radialGradient id="l0"><stop offset="0" stop-color="#fff" stop-opacity=".075"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="l1"><stop offset="0" stop-color="#fff" stop-opacity=".035"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></radialGradient>';
  const bg =
    `<g clip-path="url(#cc)"><rect width="${W}" height="${h}" fill="#0a0a0a"/>` +
    `<g class="dr"><ellipse cx="415" cy="-10" rx="460" ry="${h * 0.6}" fill="url(#l0)"/><ellipse cx="760" cy="${h}" rx="280" ry="${h * 0.5}" fill="url(#l1)"/></g>` +
    `<rect width="${W}" height="${h}" fill="url(#vg)"/><rect width="${W}" height="${h}" filter="url(#gn)" opacity=".05"/></g>` +
    `<rect x=".5" y=".5" width="${W - 1}" height="${h - 1}" rx="23.5" stroke="#fff" stroke-opacity=".09"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" fill="none" role="img" aria-label="${esc(title)}">` +
    `<title>${esc(title)}</title><style>${font}${base}${css}</style><defs>${shell}${defs}</defs>${bg}${body}</svg>`
  );
}

const LANGS = 'languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}';

const QUERY = `query($login:String!){user(login:$login){
  publicRepos:repositories(ownerAffiliations:OWNER,isFork:false,privacy:PUBLIC){totalCount}
  owned:repositories(ownerAffiliations:OWNER,isFork:false,first:100){nodes{nameWithOwner ${LANGS}}}
  contributed:repositoriesContributedTo(first:100,includeUserRepositories:true,contributionTypes:[COMMIT,PULL_REQUEST,REPOSITORY]){nodes{nameWithOwner ${LANGS}}}
  contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount weekday}}}}
}}`;

async function fetchData(login, token) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': login },
    body: JSON.stringify({ query: QUERY, variables: { login } })
  });
  const json = await res.json();
  if (!res.ok || !json.data?.user) throw new Error(JSON.stringify(json.errors || json));
  const user = json.data.user;
  const cal = user.contributionsCollection.contributionCalendar;
  const repos = new Map();
  for (const repo of [...(user.owned?.nodes || []), ...(user.contributed?.nodes || [])]) {
    if (repo) repos.set(repo.nameWithOwner, repo);
  }
  const all = [...repos.values()];
  const langs = new Map();
  for (const repo of all) {
    for (const e of repo.languages.edges) langs.set(e.node.name, (langs.get(e.node.name) || 0) + e.size);
  }
  return {
    total: cal.totalContributions,
    weeks: cal.weeks.map((w) => w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, weekday: d.weekday }))),
    repos: user.publicRepos.totalCount,
    languages: [...langs.entries()].sort((a, b) => b[1] - a[1])
  };
}

function streaks(weeks) {
  const days = weeks.flat();
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i -= 1;
  let current = 0;
  while (i >= 0 && days[i].count > 0) {
    current += 1;
    i -= 1;
  }
  return { current, longest, active: days.filter((d) => d.count > 0).length };
}

const plural = (n, one, many) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;

export function renderStats(data, font, now = new Date()) {
  const H = 452;
  const { current, longest, active } = streaks(data.weeks);
  const totalLabel = data.total.toLocaleString('pt-BR');
  const updated = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: TZ }).format(now).replace('.', '');
  let body = '';
  let css =
    '.c{animation:cin .7s cubic-bezier(.16,1,.3,1) both}@keyframes cin{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}' +
    '.c{transform-box:fill-box;transform-origin:center}' +
    '.rise{animation:rise 1.1s cubic-bezier(.16,1,.3,1) both}@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
    '.seg{animation:grow 1.2s cubic-bezier(.16,1,.3,1) both;transform-box:fill-box;transform-origin:left}@keyframes grow{from{transform:scaleX(0)}to{transform:none}}';
  const defs =
    '<linearGradient id="ng" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f5f5f5" stop-opacity=".55"/></linearGradient>';

  body += eyebrow(32, 46, 'ATIVIDADE NO GITHUB');
  body += text(798, 46, `atualizado em ${updated}`, 13, 400, 't3', 'text-anchor="end"');

  const size = 96;
  const track = -2;
  const digits = totalLabel.replace(/\D/g, '').length;
  const dots = totalLabel.length - digits;
  const numW = digits * DIGIT * size + dots * DOT * size + track * (totalLabel.length - 1);
  body += `<g class="rise"><text x="28" y="152" font-size="${size}" font-weight="200" letter-spacing="${track}" class="num" fill="url(#ng)">${totalLabel}</text></g>`;
  const lx = 28 + numW + 20;
  body += `<g class="rise" style="animation-delay:.12s">${text(lx, 118, data.total === 1 ? 'contribuição' : 'contribuições', 16, 500)}${text(lx, 140, 'nos últimos 12 meses', 13.5, 400, 't3')}</g>`;

  const metrics = [
    ['Sequência atual', plural(current, 'dia', 'dias')],
    ['Maior sequência', plural(longest, 'dia', 'dias')],
    ['Repositórios públicos', data.repos.toLocaleString('pt-BR')]
  ];
  metrics.forEach(([label, value], i) => {
    const y = 92 + i * 32;
    body += `<g class="rise" style="animation-delay:${0.2 + i * 0.08}s">${text(560, y, label, 13.5, 400, 't3')}${text(798, y, value, 14.5, 500, 't1 num', 'text-anchor="end"')}</g>`;
    if (i < metrics.length - 1) body += `<path d="M560 ${y + 12.5}H798" stroke="#fff" stroke-opacity=".07"/>`;
  });

  const counts = data.weeks.flat().map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b);
  const q = (p) => (counts.length ? counts[Math.min(counts.length - 1, Math.floor(p * counts.length))] : 1);
  const t1 = q(0.25);
  const t2 = q(0.5);
  const t3 = q(0.75);
  const level = (c) => (c === 0 ? 0 : c <= t1 ? 1 : c <= t2 ? 2 : c <= t3 ? 3 : 4);
  const ops = [0.055, 0.2, 0.38, 0.62, 0.92];
  const step = 14.5;
  const cell = 11.5;
  const gx = 32;
  const gy = 210;
  const weeks = data.weeks.slice(-53);
  let lastLabel = -4;
  weeks.forEach((week, col) => {
    const first = week[0];
    if (!first) return;
    const m = Number(first.date.slice(5, 7)) - 1;
    const prev = col > 0 ? Number(weeks[col - 1][0].date.slice(5, 7)) - 1 : -1;
    if (m !== prev && col - lastLabel >= 3 && col < weeks.length - 1) {
      body += text(gx + col * step, gy - 10, MONTHS[m], 11.5, 400, 't3');
      lastLabel = col;
    }
  });
  const flat = weeks.flat();
  const last = flat[flat.length - 1];
  weeks.forEach((week, col) => {
    for (const d of week) {
      const x = gx + col * step;
      const y = gy + d.weekday * step;
      const delay = (0.15 + col * 0.014).toFixed(3);
      body += `<rect class="c" style="animation-delay:${delay}s" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="#fff" fill-opacity="${ops[level(d.count)]}"/>`;
    }
  });
  if (last) {
    const col = weeks.length - 1;
    const x = gx + col * step + cell / 2;
    const y = gy + last.weekday * step + cell / 2;
    body += `<circle cx="${x}" cy="${y}" r="2.6" fill="${RED}" class="pulse"/><circle cx="${x}" cy="${y}" r="2.6" fill="${RED}"/>`;
  }
  const ly = gy + 7 * step + 18;
  body += text(gx, ly, `${plural(active, 'dia ativo', 'dias ativos')} no último ano`, 12.5, 400, 't3');
  let lgx = 798 - 5 * 14.5 - 32;
  body += text(lgx - 8, ly, 'Menos', 12, 400, 't3', 'text-anchor="end"');
  ops.forEach((o, i) => {
    body += `<rect x="${lgx + i * 14.5}" y="${ly - 10}" width="${cell}" height="${cell}" rx="3" fill="#fff" fill-opacity="${o}"/>`;
  });
  body += text(lgx + 5 * 14.5 + 5, ly, 'Mais', 12, 400, 't3');

  const sy = ly + 46;
  body += eyebrow(32, sy, 'LINGUAGENS');
  const totalBytes = data.languages.reduce((s, [, v]) => s + v, 0);
  if (!totalBytes) {
    body += text(32, sy + 30, 'Nenhum repositório público com código ainda.', 13.5, 400, 't3');
  } else {
    const top = data.languages.slice(0, 5);
    const rest = data.languages.slice(5).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) top.push(['Outras', rest]);
    const segOps = [0.92, 0.66, 0.46, 0.32, 0.22, 0.14];
    const bw = 766;
    let x = 32;
    const gap = 3;
    const usable = bw - gap * (top.length - 1);
    top.forEach(([, v], i) => {
      const w = Math.max(2, (v / totalBytes) * usable);
      body += `<rect class="seg" style="animation-delay:${0.3 + i * 0.08}s" x="${x.toFixed(2)}" y="${sy + 16}" width="${w.toFixed(2)}" height="6" rx="3" fill="#fff" fill-opacity="${segOps[i]}"/>`;
      x += w + gap;
    });
    const colW = bw / top.length;
    top.forEach(([name, v], i) => {
      const cx = 32 + i * colW;
      const pct = ((v / totalBytes) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
      body += `<circle cx="${cx + 4}" cy="${sy + 45}" r="4" fill="#fff" fill-opacity="${segOps[i]}"/>`;
      body += text(cx + 15, sy + 50, name, 13.5, 500, 't1');
      body += text(cx + 15, sy + 70, `${pct}%`, 12.5, 400, 't3 num');
    });
  }
  return frame(H, `${totalLabel} contribuições no GitHub nos últimos 12 meses`, css, defs, body, font);
}

async function main() {
  const login = process.env.GH_LOGIN;
  const token = process.env.GH_TOKEN;
  const font = await fontFace();
  const now = new Date();
  const data = await fetchData(login, token);
  await writeFile(join(root, 'assets', 'stats.svg'), renderStats(data, font, now));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
