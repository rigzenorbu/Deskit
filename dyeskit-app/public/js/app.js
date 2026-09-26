/* DYESKIT front-end — plain ES modules, no framework. */
import { radarChart, barsH, barsV, lineChart, villageMap, ringGauge, fmtPct, esc } from './charts.js';

const root = document.getElementById('root');
const state = {
  me: null, rights: null, meta: null, view: 'dashboard',
  filters: { district: '', village_id: '', status: '', from: '', to: '', gender: '', religion: '', age_min: '', age_max: '', band: '', collector_id: '', search: '' },
  dashboard: null, survey: null, detail: null,
};

/* --------------------------------------------------------------- helpers */
async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    // fetch only throws when the server could not be reached at all. Saying
    // "failed" here reads as "wrong password", which sends people hunting for
    // the wrong problem — name the real cause instead.
    throw new Error('Cannot reach the server. Check your connection, or the link you are using may have expired.');
  }
  if (res.status === 401 && !path.endsWith('/login')) { state.me = null; renderLogin(); throw new Error('Not signed in'); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const qs = (sel, scope = document) => scope.querySelector(sel);
const qsa = (sel, scope = document) => [...scope.querySelectorAll(sel)];

function toast(msg, ms = 2600) {
  const t = el(`<div class="toast">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function modal(title, bodyHtml, onOk, okLabel = 'Confirm') {
  const back = el(`<div class="modal-back"><div class="modal">
    <h2>${esc(title)}</h2><div class="stack">${bodyHtml}</div>
    <div class="inline" style="margin-top:16px;justify-content:flex-end">
      <button class="btn ghost" data-cancel>Cancel</button><button class="btn" data-ok>${esc(okLabel)}</button></div>
  </div></div>`);
  document.body.appendChild(back);
  const close = () => back.remove();
  qs('[data-cancel]', back).onclick = close;
  qs('[data-ok]', back).onclick = async () => { const ok = await onOk(back); if (ok !== false) close(); };
  back.addEventListener('click', e => { if (e.target === back) close(); });
  return back;
}
const bandLabel = b => (state.meta.bands.find(x => x.band === b) || {}).label || 'Insufficient data';
const dimName = id => (state.meta.dimensions.find(d => d.id === id) || {}).name || id;
const dimColor = id => getComputedStyle(document.documentElement).getPropertyValue(`--dim-${id}`).trim() || 'var(--series-1)';
const dimDot = id => `<span class="dim-dot" style="background:${dimColor(id)}"></span>`;
const dimLegend = () => `<div class="dim-legend">${state.meta.dimensions
  .map(d => `<span class="dim-key">${dimDot(d.id)}${esc(d.name)}</span>`).join('')}</div>`;
const bandRamp = b => {
  const step = { 1: '--seq-100', 2: '--seq-100', 3: '--seq-250', 4: '--seq-350', 5: '--seq-450', 6: '--seq-550', 7: '--seq-650' }[b] || '--seq-350';
  return getComputedStyle(document.documentElement).getPropertyValue(step).trim();
};
const fmtDate = s => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—');
const qstring = extra => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...state.filters, ...(extra || {}) })) if (v !== '' && v !== null && v !== undefined) p.set(k, v);
  return p.toString();
};
const statusFor = score => score === null || score === undefined ? { cls: 'muted', label: 'No data' }
  : score < 0.29 ? { cls: 'critical', label: 'Urgent' }
  : score < 0.43 ? { cls: 'serious', label: 'Needs attention' }
  : score < 0.57 ? { cls: 'warning', label: 'Basic' }
  : score < 0.71 ? { cls: 'good', label: 'Advancing' } : { cls: 'good', label: 'Strong' };

/* ------------------------------------------------------------------ login */
function renderLogin(message) {
  root.innerHTML = '';
  const wrap = el(`<div class="login-wrap"><div class="card login-card">
    <div class="brand"><img src="images/logo-placeholder.svg" alt=""><div class="brand-text">
      <strong>Project DYESKIT</strong><span>Village Well-Being Platform · Ladakh</span></div></div>
    ${message ? `<div class="notice ok">${esc(message)}</div>` : ''}
    <div class="inline" style="margin-bottom:12px">
      <button class="btn sm" data-tab="signin">Sign in</button>
      <button class="btn sm ghost" data-tab="signup">Register as field researcher</button>
    </div>
    <form class="stack" data-form="signin">
      <div><label>Email</label><input name="email" type="email" required autocomplete="username" value=""></div>
      <div><label>Password</label><input name="password" type="password" required autocomplete="current-password"></div>
      <button class="btn" type="submit">Sign in</button>
      <div class="notice small" style="margin-top:4px">
        <b>Demo accounts</b><br>
        admin@dyeskit.org / Admin@123 — full access<br>
        supervisor@dyeskit.org / Super@123 — review &amp; edit<br>
        collector@dyeskit.org / Collect@123 — collect data<br>
        analyst@dyeskit.org / Analyst@123 — dashboards + anonymised export<br>
        viewer@dyeskit.org / Viewer@123 — read only
      </div>
    </form>
    <form class="stack hidden" data-form="signup">
      <div><label>Full name</label><input name="name" required></div>
      <div><label>Email</label><input name="email" type="email" required></div>
      <div><label>Mobile number</label><input name="phone" placeholder="+91…"></div>
      <div><label>Password</label><input name="password" type="password" required minlength="8"></div>
      <button class="btn" type="submit">Register</button>
      <p class="small muted">New accounts are created with the <b>Field Researcher</b> role and stay
        “Review in progress” until an admin approves them.</p>
    </form>
    <p class="small muted" style="margin-top:14px">Your answers and the data you collect are confidential.
      Personal details are stored separately and are never included in analyst exports.</p>
  </div></div>`);
  root.appendChild(wrap);

  const show = tab => {
    qsa('[data-form]', wrap).forEach(f => f.classList.toggle('hidden', f.dataset.form !== tab));
    qsa('[data-tab]', wrap).forEach(b => b.classList.toggle('ghost', b.dataset.tab !== tab));
  };
  qsa('[data-tab]', wrap).forEach(b => b.onclick = () => show(b.dataset.tab));

  qs('[data-form="signin"]', wrap).onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/api/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      state.me = r.user; state.rights = r.rights;
      await boot();
    } catch (err) {
      const box = el(`<div class="notice error">${esc(err.message)}</div>`);
      e.target.prepend(box);
      setTimeout(() => box.remove(), 4000);
    }
  };
  qs('[data-form="signup"]', wrap).onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/api/signup', { method: 'POST', body: Object.fromEntries(fd) });
      renderLogin(r.message);
    } catch (err) { toast(err.message); }
  };
}

/* ------------------------------------------------------------------ shell */
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '◎', roles: ['admin', 'supervisor', 'analyst', 'viewer', 'collector'] },
  { id: 'villages', label: 'Villages', icon: '⌂', roles: ['admin', 'supervisor', 'analyst', 'viewer', 'collector'] },
  { id: 'collect', label: 'Collect data', icon: '✎', roles: ['admin', 'supervisor', 'collector'] },
  { id: 'insights', label: 'Insights & assistant', icon: '✦', roles: ['admin', 'supervisor', 'analyst', 'viewer', 'collector'] },
  { id: 'data', label: 'Submissions', icon: '≣', roles: ['admin', 'supervisor', 'analyst', 'collector'] },
  { id: 'export', label: 'Export', icon: '↓', roles: ['admin', 'supervisor', 'analyst'] },
  { id: 'admin', label: 'Administration', icon: '⚙', roles: ['admin'] },
  { id: 'method', label: 'How scoring works', icon: 'ƒ', roles: ['admin', 'supervisor', 'analyst', 'viewer', 'collector'] },
];

function renderShell() {
  root.innerHTML = '';
  const nav = NAV.filter(n => n.roles.includes(state.me.role));
  const primary = nav.slice(0, 4);
  const shell = el(`<div class="app">
    <div class="scrim" data-scrim></div>
    <aside class="sidebar">
      <div class="brand"><img src="images/logo-placeholder.svg" alt="DYESKIT logo placeholder">
        <div class="brand-text"><strong>DYESKIT</strong><span>Village Well-Being</span></div></div>
      <nav class="nav">${nav.map(n => `<button data-view="${n.id}"><span class="ico">${n.icon}</span>${n.label}</button>`).join('')}</nav>
      <div class="sidebar-foot">
        <div><b>${esc(state.me.name)}</b><br><span class="muted">${esc(state.me.role)}</span></div>
        <div class="inline">
          <button class="btn sm ghost" data-theme-toggle>◐ Theme</button>
          <button class="btn sm ghost" data-logout>Sign out</button>
        </div>
        <div class="muted">Questionnaire ${esc(state.meta.questionnaire.version)} · Scoring ${esc(state.meta.scoring_version)}</div>
      </div>
    </aside>
    <div>
      <header class="topbar">
        <button class="icon-btn" data-menu aria-label="Menu">☰</button>
        <img src="images/logo-placeholder.svg" alt="">
        <span class="title" data-title>Dashboard</span>
        <button class="icon-btn" data-theme-toggle-m aria-label="Switch theme">◐</button>
      </header>
      <main class="main" id="main"></main>
    </div>
    <nav class="bottomnav">
      ${primary.map(n => `<button data-view="${n.id}"><span class="ico">${n.icon}</span>${esc(n.label.split(' ')[0])}</button>`).join('')}
      <button data-menu><span class="ico">☰</span>More</button>
    </nav>
  </div>`);
  root.appendChild(shell);
  const closeDrawer = () => shell.classList.remove('drawer-open');
  qsa('[data-menu]', shell).forEach(b => b.onclick = () => shell.classList.toggle('drawer-open'));
  qs('[data-scrim]', shell).onclick = closeDrawer;
  qsa('[data-view]', shell).forEach(b => {
    b.onclick = () => { state.view = b.dataset.view; closeDrawer(); renderView(); };
    if (b.dataset.view === state.view) b.setAttribute('aria-current', 'page');
  });
  qs('[data-theme-toggle-m]', shell).onclick = () => qs('[data-theme-toggle]', shell).click();
  qs('[data-logout]', shell).onclick = async () => { await api('/api/logout', { method: 'POST' }); state.me = null; renderLogin('Signed out.'); };
  qs('[data-theme-toggle]', shell).onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
    if (next) document.documentElement.setAttribute('data-theme', next); else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('dyeskit-theme', next);
    renderView();
  };
}

function renderView() {
  qsa('[data-view]').forEach(b => {
    if (b.dataset.view === state.view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const current = NAV.find(n => n.id === state.view);
  const titleEl = qs('[data-title]');
  if (titleEl && current) titleEl.textContent = current.label;
  window.scrollTo(0, 0);
  const main = qs('#main');
  main.innerHTML = '<div class="spinner"></div>';
  ({
    dashboard: viewDashboard, villages: viewVillages, collect: viewCollect, insights: viewInsights,
    data: viewData, export: viewExport, admin: viewAdmin, method: viewMethod,
  }[state.view] || viewDashboard)(main);
}

/* ---------------------------------------------------------- filter bar */
function filterBar(onChange, opts = {}) {
  const v = state.meta.villages;
  const bar = el(`<div class="filters">
    <div class="f"><label>District</label><select data-f="district">
      <option value="">All districts</option><option value="leh">Leh</option><option value="kargil">Kargil</option></select></div>
    <div class="f"><label>Village</label><select data-f="village_id"><option value="">All villages</option>
      ${v.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
    <div class="f"><label>From</label><input type="date" data-f="from"></div>
    <div class="f"><label>To</label><input type="date" data-f="to"></div>
    <div class="f"><label>Gender</label><select data-f="gender"><option value="">Any</option>
      <option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></div>
    <div class="f"><label>Religion</label><select data-f="religion"><option value="">Any</option>
      <option value="buddhist">Buddhist</option><option value="muslim">Muslim</option><option value="hindu">Hindu</option>
      <option value="christian">Christian</option><option value="other">Other</option></select></div>
    <div class="f" style="max-width:96px"><label>Age min</label><input type="number" min="18" max="110" data-f="age_min"></div>
    <div class="f" style="max-width:96px"><label>Age max</label><input type="number" min="18" max="110" data-f="age_max"></div>
    <div class="f"><label>Band</label><select data-f="band"><option value="">Any band</option>
      ${state.meta.bands.map(b => `<option value="${b.band}">${b.band} — ${esc(b.label)}</option>`).join('')}</select></div>
    ${opts.status ? `<div class="f"><label>Status</label><select data-f="status"><option value="">Any status</option>
      <option value="draft">Draft</option><option value="submitted">Submitted</option>
      <option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>` : ''}
    ${opts.search ? '<div class="f"><label>Search</label><input data-f="search" placeholder="Household or village"></div>' : ''}
    <div class="spacer"></div>
    <button class="btn ghost sm" data-reset>Reset filters</button>
  </div>`);
  qsa('[data-f]', bar).forEach(input => {
    input.value = state.filters[input.dataset.f] ?? '';
    input.onchange = () => { state.filters[input.dataset.f] = input.value; onChange(); };
  });
  qs('[data-reset]', bar).onclick = () => {
    Object.keys(state.filters).forEach(k => state.filters[k] = '');
    onChange();
  };

  // On phones the filter block is hidden behind a button so it does not fill the screen.
  const active = Object.values(state.filters).filter(v => v !== '' && v !== null && v !== undefined).length;
  const wrap = document.createElement('div');
  const toggle = el(`<button class="filters-toggle" type="button">
    <span>Filters${active ? '' : ' — showing everything'}</span>
    <span class="inline">${active ? `<span class="count">${active} set</span>` : ''}<span>▾</span></span></button>`);
  toggle.onclick = () => {
    const open = bar.classList.toggle('show');
    toggle.querySelector('span:last-child > span:last-child').textContent = open ? '▴' : '▾';
  };
  wrap.appendChild(toggle);
  wrap.appendChild(bar);
  return wrap;
}

const activeFilterNote = () => {
  const parts = [];
  if (state.filters.district) parts.push(state.filters.district === 'leh' ? 'Leh' : 'Kargil');
  if (state.filters.village_id) { const v = state.meta.villages.find(x => x.id == state.filters.village_id); if (v) parts.push(v.name); }
  if (state.filters.gender) parts.push(state.filters.gender);
  if (state.filters.religion) parts.push(state.filters.religion);
  if (state.filters.age_min || state.filters.age_max) parts.push(`age ${state.filters.age_min || '18'}–${state.filters.age_max || '110'}`);
  if (state.filters.from || state.filters.to) parts.push(`${state.filters.from || 'start'} → ${state.filters.to || 'today'}`);
  if (state.filters.band) parts.push(`band ${state.filters.band}`);
  return parts.length ? parts.join(' · ') : 'All villages, all respondents';
};

/* -------------------------------------------------------------- dashboard */
async function viewDashboard(main) {
  const data = await api('/api/dashboard?' + qstring());
  state.dashboard = data;
  const o = data.overall;
  const dims = state.meta.dimensions;

  main.innerHTML = '';
  main.appendChild(el(`<div class="page-head"><div>
      <h1>Village well-being dashboard</h1>
      <p>Filtered view: <b>${esc(activeFilterNote())}</b>. Scores are computed from raw answers with
      ${esc(state.meta.scoring_version)}; villages below the minimum sample are marked.</p>
    </div></div>`));
  main.appendChild(filterBar(() => renderView()));

  const flagCount = o.flags.length;
  const best = data.villages[0], worst = data.villages[data.villages.length - 1];
  const hero = el(`<div class="hero">
    <div data-gauge></div>
    <div class="hero-text">
      <div class="hero-title">Village well-being index</div>
      <div class="hero-band">Band ${o.band || '—'} · ${esc(o.band_label)}</div>
      <div class="hero-note">${o.n} households across ${data.villages.length} village${data.villages.length === 1 ? '' : 's'}${o.coverage ? `, ${o.coverage.percent}% of ${o.coverage.households} on record` : ''}.</div>
      <div class="hero-chips">
        ${best ? `<span class="chip">Highest · ${esc(best.village)} ${best.pct ? best.pct.toFixed(1) + '%' : ''}</span>` : ''}
        ${worst && worst !== best ? `<span class="chip">Lowest · ${esc(worst.village)} ${worst.pct ? worst.pct.toFixed(1) + '%' : ''}</span>` : ''}
        <span class="chip">${flagCount ? flagCount + ' dimension' + (flagCount === 1 ? '' : 's') + ' flagged' : 'No dimension flagged'}</span>
      </div>
    </div></div>`);
  main.appendChild(hero);
  ringGauge(qs('[data-gauge]', hero), { value: o.vwbi, caption: 'of 100%' });

  main.appendChild(el(`<div class="grid cols-3" style="margin-top:14px">
    <div class="card tile accent"><div class="label">Households surveyed</div>
      <div class="value">${o.n}</div>
      <div class="note">${o.coverage ? `${o.coverage.percent}% of ${o.coverage.households} households on record` : 'no denominator'}</div></div>
    <div class="card tile accent"><div class="label">Villages in view</div>
      <div class="value">${data.villages.length}</div>
      <div class="note">${data.villages.filter(v => v.coverage && !v.coverage.sufficient).length} below minimum sample</div></div>
    <div class="card tile accent"><div class="label">Dimensions flagged</div>
      <div class="value">${flagCount}</div>
      <div class="note">${flagCount ? esc(o.flags.map(f => f.name).join(', ')) : 'none below “Basic” (43%)'}</div></div>
  </div>`));

  const row1 = el('<div class="grid cols-2" style="margin-top:14px"></div>');
  const radarCard = el(`<div class="card"><header><h3>Seven dimensions</h3>
    <span class="sub">filtered view vs. all villages</span></header><div data-radar></div></div>`);
  const villageCard = el(`<div class="card"><header><h3>Villages ranked by well-being</h3>
    <span class="sub">dashed line = average of this view</span></header><div data-villages></div></div>`);
  row1.append(radarCard, villageCard);
  main.appendChild(row1);

  // radar needs the unfiltered baseline for comparison
  const baseline = await api('/api/dashboard');
  radarChart(qs('[data-radar]', radarCard), {
    axes: dims.map(d => ({ label: d.name })),
    axisColors: dims.map(d => dimColor(d.id)),
    series: [
      { label: 'This view', values: dims.map(d => o.dims[d.id]) },
      { label: 'All villages', values: dims.map(d => baseline.overall.dims[d.id]) },
    ],
  });

  barsH(qs('[data-villages]', villageCard), {
    rows: data.villages.map(v => ({
      label: v.village, value: v.vwbi ?? 0, metric: 'VWBI', color: bandRamp(v.band),
      note: `Band ${v.band || '—'} · ${v.n} surveys · ${v.coverage && !v.coverage.sufficient ? 'below minimum sample' : 'sample sufficient'}`,
    })),
    reference: o.vwbi,
  });
  qs('[data-villages]', villageCard).insertAdjacentHTML('beforeend',
    `<div class="dim-legend">${state.meta.bands.slice(2).map(b =>
      `<span class="dim-key"><span class="dim-dot" style="background:${bandRamp(b.band)}"></span>Band ${b.band}</span>`).join('')}</div>`);

  const row2 = el('<div class="grid cols-2" style="margin-top:14px"></div>');
  const bandCard = el(`<div class="card"><header><h3>Households by band</h3>
    <span class="sub">1 = foundational support needed · 7 = thriving</span></header><div data-bands></div></div>`);
  const weakCard = el(`<div class="card"><header><h3>Weakest indicators</h3>
    <span class="sub">lowest 10 of ${state.meta.indicators ? Object.values(state.meta.indicators).flat().length : ''} indicators</span></header><div data-weak></div></div>`);
  row2.append(bandCard, weakCard);
  main.appendChild(row2);

  barsV(qs('[data-bands]', bandCard), {
    rows: o.bands.map(b => ({ label: 'Band ' + b.band, sub: b.label.split(' ')[0], value: b.count,
      metric: 'Households', color: bandRamp(b.band) })),
  });
  barsH(qs('[data-weak]', weakCard), {
    rows: data.indicators.slice(0, 10).map(i => ({
      label: i.label, value: i.score, metric: 'Mean score',
      note: `${dimName(i.dim)} · ${i.n} households`,
      color: dimColor(i.dim),
    })),
  });
  qs('[data-weak]', weakCard).insertAdjacentHTML('beforeend', dimLegend());

  const row3 = el('<div class="grid cols-2" style="margin-top:14px"></div>');
  const mapCard = el(`<div class="card"><header><h3>Village map</h3><span class="sub">click a village to filter</span></header><div data-map></div></div>`);
  const trendCard = el(`<div class="card"><header><h3>Survey activity and mean score</h3><span class="sub">by month</span></header><div data-trend></div></div>`);
  row3.append(mapCard, trendCard);
  main.appendChild(row3);

  villageMap(qs('[data-map]', mapCard), {
    villages: data.villages.map(v => {
      const meta = state.meta.villages.find(m => m.id === v.village_id) || {};
      return { ...v, lat: meta.lat, lon: meta.lon };
    }),
    onSelect: v => { state.filters.village_id = String(v.village_id); renderView(); },
  });
  lineChart(qs('[data-trend]', trendCard), {
    points: data.trend.map(t => ({ label: t.month, value: t.pct, n: t.n })),
    yLabel: 'Mean well-being %',
  });

  const row4 = el('<div class="grid cols-3" style="margin-top:14px"></div>');
  const prioCard = el(`<div class="card"><header><h3>What villagers say matters most</h3><span class="sub">weighted top-3 ranking</span></header><div data-prio></div></div>`);
  const flagCard = el(`<div class="card"><header><h3>Priority flags</h3><span class="sub">below 43% = under “Basic”</span></header><div data-flags></div></div>`);
  const qualityCard = el(`<div class="card"><header><h3>Data quality</h3><span class="sub">this view</span></header><div data-quality></div></div>`);
  row4.append(prioCard, flagCard, qualityCard);
  main.appendChild(row4);

  const maxPrio = Math.max(1, ...data.priorities.map(p => p.score));
  barsH(qs('[data-prio]', prioCard), {
    rows: data.priorities.slice(0, 8).map(p => ({ label: p.label, value: p.score, metric: 'Weighted points' })),
    max: maxPrio, valueFormat: v => Math.round(v), height: 18, width: 400, labelWidth: 132,
  });

  const flagsEl = qs('[data-flags]', flagCard);
  if (!o.flags.length) flagsEl.innerHTML = '<p class="small"><span class="status good"><span class="dot"></span>No dimension below the “Basic” line in this view.</span></p>';
  else flagsEl.innerHTML = `<table><tbody>${o.flags.map(f => {
    const st = statusFor(f.score);
    return `<tr><td>${esc(f.name)}</td><td class="num">${fmtPct(f.score)}</td>
      <td><span class="status ${st.cls}"><span class="dot"></span>${st.label}</span></td></tr>`;
  }).join('')}</tbody></table>
  <p class="small muted" style="margin-top:8px">Villages: ${esc(data.villages.filter(v => v.flags.length).map(v => v.village).join(', ') || 'none')}</p>`;

  const q = data.quality;
  qs('[data-quality]', qualityCard).innerHTML = `<table><tbody>
    <tr><td>Approved</td><td class="num">${q.approved}</td></tr>
    <tr><td>Awaiting review</td><td class="num">${q.submitted}</td></tr>
    <tr><td>Drafts</td><td class="num">${q.drafts}</td></tr>
    <tr><td>Below validity floor</td><td class="num">${q.invalid}</td></tr>
    <tr><td>Interview under 10 min</td><td class="num">${q.fast}</td></tr>
    <tr><td>No BMI measurement</td><td class="num">${q.no_bmi}</td></tr>
  </tbody></table><p class="small muted" style="margin-top:8px">Short interviews and missing measurements are review prompts, not errors.</p>`;
}

/* --------------------------------------------------------------- villages */
async function viewVillages(main) {
  const data = state.dashboard && !qstring() ? state.dashboard : await api('/api/dashboard?' + qstring());
  main.innerHTML = '';
  main.appendChild(el(`<div class="page-head"><div><h1>Villages</h1>
    <p>Every village in view with its score, sample coverage and flagged dimensions. Click a row for the full profile.</p></div></div>`));
  main.appendChild(filterBar(() => renderView()));

  const table = el(`<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Village</th><th class="hide-sm">District</th><th class="num hide-sm">Surveys</th><th class="num hide-sm">Coverage</th>
      <th class="num">VWBI</th><th>Band</th><th class="hide-sm">Flags</th></tr></thead>
    <tbody>${data.villages.map(v => `<tr data-v="${v.village_id}" style="cursor:pointer">
      <td><b>${esc(v.village)}</b><div class="show-sm small muted">${v.district === 'leh' ? 'Leh' : 'Kargil'} · ${v.n} surveys</div></td>
      <td class="hide-sm">${v.district === 'leh' ? 'Leh' : 'Kargil'}</td>
      <td class="num hide-sm">${v.n}</td>
      <td class="num hide-sm">${v.coverage ? v.coverage.percent + '%' : '—'} ${v.coverage && !v.coverage.sufficient ? '<span class="status serious"><span class="dot"></span></span>' : ''}</td>
      <td class="num">${v.pct === null ? '—' : v.pct.toFixed(1) + '%'}</td>
      <td><span class="band-pill" data-band="${v.band || 0}">${v.band || '—'} · ${esc((v.band_label || '').split(' ')[0])}</span></td>
      <td class="hide-sm">${v.flags.length ? v.flags.map(f => `<span class="status ${f.severity}"><span class="dot"></span>${esc(f.name)}</span>`).join(' ') : '<span class="muted small">none</span>'}</td>
    </tr>`).join('')}</tbody></table></div></div>`);
  main.appendChild(table);
  qsa('[data-v]', table).forEach(tr => tr.onclick = () => villageProfile(Number(tr.dataset.v)));
}

async function villageProfile(villageId) {
  const main = qs('#main');
  main.innerHTML = '<div class="spinner"></div>';
  const meta = state.meta.villages.find(v => v.id === villageId);
  const data = await api('/api/dashboard?village_id=' + villageId);
  const all = state.dashboard || await api('/api/dashboard');
  const v = data.villages[0];
  const notes = await api('/api/notes?village_id=' + villageId);
  const dims = state.meta.dimensions;

  main.innerHTML = '';
  main.appendChild(el(`<div class="page-head"><div>
    <h1>${esc(meta.name)}</h1>
    <p>${esc([meta.block, meta.district === 'leh' ? 'Leh' : 'Kargil'].filter((x, i, arr) => x && arr.indexOf(x) === i).join(' · '))} · ${meta.altitude_m ? meta.altitude_m + ' m' : ''} ·
    ${meta.households} households on record</p></div>
    <button class="btn ghost" data-back>← All villages</button></div>`));
  qs('[data-back]', main).onclick = () => { state.view = 'villages'; renderView(); };

  const c = v.coverage;
  const strongest = dims.map(d => d.id).sort((x, y) => (v.dims[y] || 0) - (v.dims[x] || 0))[0];
  const weakest = dims.map(d => d.id).sort((x, y) => (v.dims[x] || 0) - (v.dims[y] || 0))[0];
  const vhero = el(`<div class="hero">
    <div data-gauge></div>
    <div class="hero-text">
      <div class="hero-title">${esc(meta.name)} · village index</div>
      <div class="hero-band">Band ${v.band} · ${esc(v.band_label)}</div>
      <div class="hero-note">${v.n} surveys${c ? `, ${c.percent}% of ${meta.households} households — ${c.sufficient ? 'sample sufficient' : 'below the minimum sample'}` : ''}.</div>
      <div class="hero-chips">
        <span class="chip">Strongest · ${esc(dimName(strongest))} ${fmtPct(v.dims[strongest])}</span>
        <span class="chip">Weakest · ${esc(dimName(weakest))} ${fmtPct(v.dims[weakest])}</span>
        ${v.flags.length ? `<span class="chip">${v.flags.length} flagged</span>` : ''}
      </div>
    </div></div>`);
  main.appendChild(vhero);
  ringGauge(qs('[data-gauge]', vhero), { value: v.vwbi, caption: 'of 100%' });

  main.appendChild(el(`<div class="grid cols-4" style="margin-top:14px">
    <div class="card tile accent"><div class="label">Village index</div><div class="value">${v.pct === null ? '—' : v.pct.toFixed(1) + '%'}</div>
      <div class="note"><span class="band-pill" data-band="${v.band}">Band ${v.band} · ${esc(v.band_label)}</span></div></div>
    <div class="card tile accent"><div class="label">Surveys</div><div class="value">${v.n}</div>
      <div class="note">${c ? `needs ${c.required} · ${c.sufficient ? 'sufficient' : 'below minimum'}` : ''}</div></div>
    <div class="card tile accent"><div class="label">Coverage</div><div class="value">${c ? c.percent + '%' : '—'}</div>
      <div class="note">of ${meta.households} households</div></div>
    <div class="card tile accent"><div class="label">Strongest dimension</div>
      <div class="value" style="font-size:1.3rem">${esc(dimName(dims.map(d => d.id).sort((a, b) => (v.dims[b] || 0) - (v.dims[a] || 0))[0]))}</div>
      <div class="note">${fmtPct(Math.max(...dims.map(d => v.dims[d.id] || 0)))}</div></div>
  </div>`));

  const row = el('<div class="grid cols-2" style="margin-top:14px"></div>');
  const radarCard = el(`<div class="card"><header><h3>Dimension profile</h3><span class="sub">village vs. all villages</span></header><div data-radar></div></div>`);
  const indCard = el(`<div class="card"><header><h3>Indicators to act on</h3><span class="sub">lowest 10 in this village</span></header><div data-ind></div></div>`);
  row.append(radarCard, indCard);
  main.appendChild(row);

  radarChart(qs('[data-radar]', radarCard), {
    axes: dims.map(d => ({ label: d.name })),
    axisColors: dims.map(d => dimColor(d.id)),
    series: [
      { label: meta.name, values: dims.map(d => v.dims[d.id]) },
      { label: 'All villages', values: dims.map(d => all.overall.dims[d.id]) },
    ],
  });
  barsH(qs('[data-ind]', indCard), {
    rows: data.indicators.slice(0, 10).map(i => ({ label: i.label, value: i.score, metric: 'Mean',
      note: dimName(i.dim), color: dimColor(i.dim) })),
  });
  qs('[data-ind]', indCard).insertAdjacentHTML('beforeend', dimLegend());

  const row2 = el('<div class="grid cols-2" style="margin-top:14px"></div>');
  const prioCard = el(`<div class="card"><header><h3>Village priorities</h3><span class="sub">what households ranked</span></header><div data-prio></div></div>`);
  const noteCard = el(`<div class="card"><header><h3>Field notes</h3><span class="sub">qualitative record</span></header>
    <div class="stack">${notes.rows.length ? notes.rows.map(n => `<div class="notice small"><b>${esc(n.dim ? dimName(n.dim) : 'General')}</b> — ${esc(n.note)}
      <div class="muted" style="margin-top:4px">${esc(n.author || 'unknown')} · ${fmtDate(n.created_at)}</div></div>`).join('') : '<p class="muted small">No notes yet.</p>'}
    ${['admin', 'supervisor', 'collector'].includes(state.me.role) ? `<div class="stack" style="margin-top:6px">
      <textarea rows="3" data-note placeholder="Add an observation from the field…"></textarea>
      <div class="inline"><select data-note-dim style="max-width:180px"><option value="">General</option>
        ${dims.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select>
        <button class="btn sm" data-add-note>Add note</button></div></div>` : ''}
    </div></div>`);
  row2.append(prioCard, noteCard);
  main.appendChild(row2);

  const maxP = Math.max(1, ...data.priorities.map(p => p.score));
  barsH(qs('[data-prio]', prioCard), {
    rows: data.priorities.slice(0, 8).map(p => ({ label: p.label, value: p.score, metric: 'Weighted points' })),
    max: maxP, valueFormat: v2 => Math.round(v2), height: 18, width: 460, labelWidth: 140,
  });

  const addBtn = qs('[data-add-note]', noteCard);
  if (addBtn) addBtn.onclick = async () => {
    const note = qs('[data-note]', noteCard).value.trim();
    if (!note) return;
    await api('/api/notes', { method: 'POST', body: { village_id: villageId, dim: qs('[data-note-dim]', noteCard).value || null, note } });
    toast('Note saved');
    villageProfile(villageId);
  };
}

/* ----------------------------------------------------------------- collect */
async function viewCollect(main) {
  const mine = await api('/api/submissions?' + new URLSearchParams({ status: 'draft', limit: 50 }));
  main.innerHTML = '';
  main.appendChild(el(`<div class="page-head"><div><h1>Collect data</h1>
    <p>Interviewer-administered. Consent is recorded before the survey opens; answers save as a draft until you submit.</p></div>
    <button class="btn" data-new>+ New household survey</button></div>`));

  main.appendChild(el(`<div class="card"><header><h3>Your drafts</h3><span class="sub">not yet submitted</span></header>
    ${mine.rows.length ? `<div class="table-wrap"><table><thead><tr><th>Household</th><th class="hide-sm">Village</th><th class="hide-sm">Started</th><th></th></tr></thead>
      <tbody>${mine.rows.map(r => `<tr>
        <td>${esc(r.household_code)}<div class="show-sm small muted">${esc(r.village)} · ${fmtDate(r.submitted_at)}</div></td>
        <td class="hide-sm">${esc(r.village)}</td><td class="hide-sm">${fmtDate(r.submitted_at)}</td>
        <td><button class="btn sm secondary" data-open="${r.id}">Open</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted small">No drafts. Start a new survey when you are with a household.</p>'}</div>`));
  qsa('[data-open]', main).forEach(b => b.onclick = () => openSurvey(Number(b.dataset.open)));

  qs('[data-new]', main).onclick = () => {
    const villages = state.meta.villages;
    modal('Start a new survey', `
      <div><label>Village</label><select data-village>${villages.map(v => `<option value="${v.id}">${esc(v.name)} — ${v.district === 'leh' ? 'Leh' : 'Kargil'}</option>`).join('')}</select></div>
      <div><label>Household head name (kept private, never exported to analysts)</label><input data-head placeholder="optional"></div>
      <div class="notice small"><b>Consent script — read aloud</b><br>${esc(state.meta.questionnaire.consent)}</div>
      <label class="inline" style="font-size:.9rem"><input type="checkbox" data-consent style="width:auto"> The respondent agreed to take part.</label>
    `, async back => {
      if (!qs('[data-consent]', back).checked) { toast('Consent is required before the survey opens'); return false; }
      const r = await api('/api/submissions', { method: 'POST', body: {
        village_id: Number(qs('[data-village]', back).value),
        head_name: qs('[data-head]', back).value || null, consent: true,
      } });
      toast('Survey created: ' + r.household_code);
      openSurvey(r.id);
    }, 'Start survey');
  };
}

async function openSurvey(id) {
  const main = qs('#main');
  main.innerHTML = '<div class="spinner"></div>';
  const { submission, answers, score } = await api('/api/submissions/' + id);
  const sections = state.meta.questionnaire.sections;
  const draft = { ...answers };

  main.innerHTML = '';
  const head = el(`<div class="page-head"><div>
    <h1>Survey · ${esc(submission.household_code)}</h1>
    <p>${esc(submission.village)} · ${submission.district === 'leh' ? 'Leh' : 'Kargil'} · status <b>${esc(submission.status)}</b></p>
    <div class="progressbar" style="width:280px;margin-top:8px"><i data-progress style="width:0%"></i></div>
    <p class="small muted" data-progress-text></p></div>
    <div class="inline">
      <button class="btn secondary" data-save>Save draft</button>
      <button class="btn" data-submit>Submit</button>
      <button class="btn ghost" data-back>Close</button></div></div>`);
  main.appendChild(head);
  qs('[data-back]', head).onclick = () => { state.view = 'collect'; renderView(); };

  const form = el('<div class="survey card"></div>');
  main.appendChild(form);
  const scoreCard = el(`<div class="card" style="margin-top:14px"><header><h3>Live score preview</h3>
    <span class="sub">recomputed as you answer — the field team sees what the data says</span></header><div data-livescore></div></div>`);
  main.appendChild(scoreCard);

  const visible = item => !item.showIf || (item.showIf.in || []).includes(draft[item.showIf.item]);

  function drawScore(sc) {
    const dims = state.meta.dimensions;
    qs('[data-livescore]', scoreCard).innerHTML = '';
    const box = el('<div></div>');
    qs('[data-livescore]', scoreCard).appendChild(box);
    barsH(box, {
      rows: dims.map(d => ({
        label: d.name, value: sc.dims[d.id].score ?? 0, metric: 'Dimension score',
        note: sc.dims[d.id].valid ? `${sc.dims[d.id].answered}/${sc.dims[d.id].total} indicators` : 'not enough answers yet',
        color: sc.dims[d.id].valid ? dimColor(d.id) : 'var(--muted)',
      })), height: 18,
    });
    box.insertAdjacentHTML('afterbegin', `<p class="small">Well-being index so far:
      <b>${sc.pct === null ? '—' : sc.pct.toFixed(1) + '%'}</b>
      <span class="band-pill">${sc.band ? 'Band ' + sc.band + ' · ' + esc(sc.band_label) : 'insufficient data'}</span>
      ${sc.valid ? '' : '<span class="status serious"><span class="dot"></span>below validity floor</span>'}</p>`);
  }

  function updateProgress() {
    const all = sections.flatMap(s => s.items).filter(visible);
    const done = all.filter(i => draft[i.id] !== undefined && draft[i.id] !== '' && !(Array.isArray(draft[i.id]) && !draft[i.id].length)).length;
    qs('[data-progress]', head).style.width = Math.round((done / all.length) * 100) + '%';
    qs('[data-progress-text]', head).textContent = `${done} of ${all.length} questions answered`;
  }

  async function recompute() {
    updateProgress();
    const r = await api('/api/submissions/' + id, { method: 'PATCH', body: { answers: draft, reason: submission.status === 'draft' ? null : 'field correction' } });
    drawScore(r.score);
  }

  function renderItem(item) {
    const wrap = el(`<div class="q" data-item="${item.id}">
      <div class="qtext"><span class="qid">${item.id}</span>${esc(item.q)}${item.required ? ' *' : ''}</div>
      ${item.help ? `<div class="help">${esc(item.help)}</div>` : ''}
      <div data-input></div></div>`);
    const slot = qs('[data-input]', wrap);
    const set = (v) => { draft[item.id] = v; recompute(); };

    if (item.type === 'single' || item.type === 'village') {
      const opts = item.type === 'village'
        ? state.meta.villages.map(v => ({ v: v.name, label: v.name }))
        : item.options;
      const box = el('<div class="opts"></div>');
      opts.forEach(op => {
        const b = el(`<button type="button" class="opt" aria-pressed="${draft[item.id] === op.v}">${esc(op.label)}</button>`);
        b.onclick = () => { set(op.v); qsa('.opt', box).forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); redrawConditionals(); };
        box.appendChild(b);
      });
      slot.appendChild(box);
    } else if (item.type === 'multi' || item.type === 'rank3') {
      const cur = new Set(draft[item.id] || []);
      const box = el('<div class="opts"></div>');
      item.options.forEach(op => {
        const b = el(`<button type="button" class="opt" aria-pressed="${cur.has(op.v)}">${esc(op.label)}${item.type === 'rank3' && cur.has(op.v) ? ` (${[...cur].indexOf(op.v) + 1})` : ''}</button>`);
        b.onclick = () => {
          if (cur.has(op.v)) cur.delete(op.v);
          else { if (item.type === 'rank3' && cur.size >= 3) { toast('Pick the top 3 only'); return; } cur.add(op.v); }
          set([...cur]);
          renderSections();
        };
        box.appendChild(b);
      });
      slot.appendChild(box);
    } else if (item.type === 'likert' || item.type === 'likert_rev') {
      const scale = item.scale || ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
      const box = el(`<div class="likert"><span class="scale-ends">${esc(scale[0])}</span></div>`);
      [1, 2, 3, 4, 5].forEach(n => {
        const b = el(`<button type="button" class="opt lk" aria-pressed="${Number(draft[item.id]) === n}">${n}</button>`);
        b.onclick = () => { set(n); qsa('.lk', box).forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); };
        box.appendChild(b);
      });
      box.appendChild(el(`<span class="scale-ends">${esc(scale[4])}</span>`));
      slot.appendChild(box);
    } else if (item.type === 'number') {
      const i = el(`<input type="number" ${item.min !== undefined ? `min="${item.min}"` : ''} ${item.max !== undefined ? `max="${item.max}"` : ''}
        value="${draft[item.id] ?? ''}" style="max-width:200px" placeholder="${esc(item.unit || '')}">`);
      i.onchange = () => { set(i.value === '' ? undefined : Number(i.value)); redrawConditionals(); };
      slot.appendChild(i);
    } else if (item.type === 'measure') {
      const cur = draft[item.id] || {};
      const box = el('<div class="row2"></div>');
      item.fields.forEach(f => {
        const g = el(`<div><label>${esc(f.label)} (${esc(f.unit)})</label><input type="number" min="${f.min}" max="${f.max}" value="${cur[f.k] ?? ''}"></div>`);
        qs('input', g).onchange = e => {
          const v = { ...(draft[item.id] || {}) };
          if (e.target.value === '') delete v[f.k]; else v[f.k] = Number(e.target.value);
          set(Object.keys(v).length ? v : undefined);
        };
        box.appendChild(g);
      });
      slot.appendChild(box);
      slot.appendChild(el('<p class="small muted" style="margin-top:6px">Leave blank if no measuring kit is available — BMI is then excluded, not scored as zero.</p>'));
    } else {
      const i = el(`<input type="text" value="${esc(draft[item.id] || '')}" style="max-width:420px" placeholder="optional">`);
      i.onchange = () => set(i.value || undefined);
      slot.appendChild(i);
    }
    return wrap;
  }

  function renderSections() {
    form.innerHTML = '';
    sections.forEach(sec => {
      form.appendChild(el(`<div class="section-head"><span class="tag">${sec.id}</span><h2>${esc(sec.title)}</h2></div>
        ${sec.note ? `<p class="small muted">${esc(sec.note)}</p>` : ''}`));
      sec.items.filter(visible).forEach(item => form.appendChild(renderItem(item)));
    });
    updateProgress();
  }
  const redrawConditionals = () => renderSections();

  renderSections();
  drawScore(score);

  qs('[data-save]', head).onclick = async () => { await recompute(); toast('Draft saved'); };
  qs('[data-submit]', head).onclick = async () => {
    await recompute();
    await api(`/api/submissions/${id}/submit`, { method: 'POST' });
    toast('Submitted for review');
    state.view = 'collect'; renderView();
  };
}

/* -------------------------------------------------------------- submissions */
async function viewData(main) {
  const data = await api('/api/submissions?' + qstring({ limit: 500 }));
  main.innerHTML = '';
  main.appendChild(el(`<div class="page-head"><div><h1>Submissions</h1>
    <p>Every record in view. Supervisors approve or send back; admins can delete to the recycle bin.</p></div></div>`));
  main.appendChild(filterBar(() => renderView(), { status: true, search: true }));

  main.appendChild(el(`<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Household</th><th class="hide-sm">Village</th><th class="hide-sm">Date</th><th>Status</th><th class="num">Score</th><th class="hide-sm">Band</th><th class="num hide-sm">Minutes</th><th></th></tr></thead>
    <tbody>${data.rows.map(r => `<tr>
      <td>${esc(r.household_code)}<div class="show-sm small muted">${esc(r.village)} · ${fmtDate(r.submitted_at)}</div></td>
      <td class="hide-sm">${esc(r.village)}</td><td class="hide-sm">${fmtDate(r.submitted_at)}</td>
      <td>${esc(r.status)}${r.valid ? '' : ' <span class="status serious"><span class="dot"></span>low validity</span>'}</td>
      <td class="num">${r.pct === null ? '—' : r.pct.toFixed(1) + '%'}</td>
      <td class="hide-sm">${r.band ? `<span class="band-pill" data-band="${r.band}">${r.band}</span>` : '—'}</td>
      <td class="num hide-sm">${r.duration_min ?? '—'}</td>
      <td><button class="btn sm secondary" data-detail="${r.id}">Open</button></td></tr>`).join('')}</tbody>
  </table></div><p class="small muted" style="margin-top:8px">${data.rows.length} records shown.</p></div>`));
  qsa('[data-detail]', main).forEach(b => b.onclick = () => submissionDetail(Number(b.dataset.detail)));
}

async function submissionDetail(id) {
  const main = qs('#main');
  main.innerHTML = '<div class="spinner"></div>';
  const { submission, answers, score, history } = await api('/api/submissions/' + id);
  const R = state.rights;
  const dims = state.meta.dimensions;

  main.innerHTML = '';
  main.appendChild(el(`<div class="page-head"><div>
    <h1>${esc(submission.household_code)}</h1>
    <p>${esc(submission.village)} · ${fmtDate(submission.submitted_at)} · status <b>${esc(submission.status)}</b>
      · questionnaire ${esc(submission.questionnaire_version)}</p></div>
    <div class="inline">
      ${R.review && submission.status === 'submitted' ? '<button class="btn" data-approve>Approve</button><button class="btn ghost" data-reject>Send back</button>' : ''}
      ${R.editAny ? `<button class="btn secondary" data-edit>Edit answers</button>` : ''}
      ${R.delete ? '<button class="btn danger" data-delete>Delete</button>' : ''}
      <button class="btn ghost" data-back>← Back</button></div></div>`));
  qs('[data-back]', main).onclick = () => { state.view = 'data'; renderView(); };

  const row = el('<div class="grid cols-2"></div>');
  const radarCard = el(`<div class="card"><header><h3>Dimension scores</h3><span class="sub">this household</span></header><div data-radar></div></div>`);
  const indCard = el(`<div class="card"><header><h3>Indicator detail</h3><span class="sub">how each score was derived</span></header>
    <div class="table-wrap"><table><thead><tr><th>Indicator</th><th>Dimension</th><th class="num">Score</th><th>Note</th></tr></thead>
    <tbody>${Object.entries(score.indicators).map(([k, i]) => `<tr><td>${esc(i.label)}</td><td>${esc(dimName(i.dim))}</td>
      <td class="num">${i.score === null ? '<span class="muted">not collected</span>' : fmtPct(i.score)}</td>
      <td class="small muted">${esc(i.detail || (i.status === 'PNA' ? 'declined → neutral 0.5' : ''))}</td></tr>`).join('')}</tbody></table></div></div>`);
  row.append(radarCard, indCard);
  main.appendChild(row);
  radarChart(qs('[data-radar]', radarCard), {
    axes: dims.map(d => ({ label: d.name })),
    axisColors: dims.map(d => dimColor(d.id)),
    series: [{ label: 'Household', values: dims.map(d => score.dims[d.id].score) }],
  });

  const answersCard = el(`<div class="card" style="margin-top:14px"><header><h3>Answers</h3>
    <span class="sub">${Object.keys(answers).length} recorded</span></header><div class="table-wrap"><table>
    <thead><tr><th>Item</th><th>Question</th><th>Answer</th></tr></thead><tbody>
    ${state.meta.questionnaire.sections.flatMap(s => s.items).filter(i => answers[i.id] !== undefined).map(i => {
      const v = answers[i.id];
      const label = Array.isArray(v) ? v.map(x => ((i.options || []).find(o => o.v === x) || {}).label || x).join(', ')
        : typeof v === 'object' && v !== null ? Object.entries(v).map(([k, x]) => `${k}: ${x}`).join(', ')
        : ((i.options || []).find(o => o.v === v) || {}).label || v;
      return `<tr><td class="muted">${i.id}</td><td>${esc(i.q)}</td><td><b>${esc(String(label))}</b></td></tr>`;
    }).join('')}</tbody></table></div></div>`);
  main.appendChild(answersCard);

  if (history.length) {
    main.appendChild(el(`<div class="card" style="margin-top:14px"><header><h3>Change history</h3>
      <span class="sub">nothing is overwritten</span></header><div class="table-wrap"><table>
      <thead><tr><th>When</th><th>Item</th><th>Old</th><th>New</th><th>Reason</th></tr></thead><tbody>
      ${history.map(h => `<tr><td>${fmtDate(h.changed_at)}</td><td>${esc(h.item_id)}</td>
        <td class="muted">${esc(String(h.old_value).slice(0, 40))}</td><td>${esc(String(h.new_value).slice(0, 40))}</td>
        <td class="small">${esc(h.reason || '')}</td></tr>`).join('')}</tbody></table></div></div>`));
  }

  const review = async (decision) => {
    await api(`/api/submissions/${id}/review`, { method: 'POST', body: { decision, note: decision === 'reject' ? prompt('Note for the field researcher:') || '' : '' } });
    toast(decision === 'approve' ? 'Approved' : 'Sent back');
    submissionDetail(id);
  };
  if (qs('[data-approve]', main)) qs('[data-approve]', main).onclick = () => review('approve');
  if (qs('[data-reject]', main)) qs('[data-reject]', main).onclick = () => review('reject');
  if (qs('[data-edit]', main)) qs('[data-edit]', main).onclick = () => openSurvey(id);
  if (qs('[data-delete]', main)) qs('[data-delete]', main).onclick = () => {
    modal('Delete this submission?', `<p class="small">It moves to the recycle bin and can be restored for 30 days. The reason is stored in the audit log.</p>
      <div><label>Reason</label><input data-reason placeholder="e.g. duplicate of H0123"></div>`, async back => {
      const reason = qs('[data-reason]', back).value.trim();
      if (reason.length < 4) { toast('Please give a reason'); return false; }
      await api('/api/submissions/' + id, { method: 'DELETE', body: { reason } });
      toast('Moved to recycle bin');
      state.view = 'data'; renderView();
    }, 'Delete');
  };
}

/* ------------------------------------------------------------------ export */
function viewExport(main) {
  main.innerHTML = '';
  main.appendChild(el(`<div class="page-head"><div><h1>Export data</h1>
    <p>Downloads respect the filters below. ${state.rights.pii ? 'Your role includes household identifiers.'
      : 'Household identifiers are removed for your role.'}</p></div></div>`));
  main.appendChild(filterBar(() => renderView(), { status: true }));
  const card = el(`<div class="card"><div class="grid cols-3">
    <div><h3>One row per household</h3><p class="small muted">Every question as a column, plus dimension scores, index and band. Opens directly in Excel or SPSS.</p>
      <button class="btn" data-kind="wide">Download CSV</button></div>
    <div><h3>One row per answer</h3><p class="small muted">Long format for database loads and re-analysis.</p>
      <button class="btn secondary" data-kind="long">Download CSV</button></div>
    <div><h3>Codebook</h3><p class="small muted">Every column, question text, codes and score values — ship it with any dataset you share.</p>
      <button class="btn secondary" data-kind="codebook">Download CSV</button></div>
  </div><p class="small muted" style="margin-top:12px">Every download is written to the audit log with the filters used.</p></div>`);
  main.appendChild(card);
  qsa('[data-kind]', card).forEach(b => b.onclick = () => {
    window.location = '/api/export?kind=' + b.dataset.kind + '&' + qstring();
    toast('Preparing download…');
  });
}

/* ------------------------------------------------------------------- admin */
async function viewAdmin(main) {
  const [users, bin, audit] = await Promise.all([api('/api/users'), api('/api/recycle-bin'), api('/api/audit')]);
  main.innerHTML = '';
  main.appendChild(el(`<div class="page-head"><div><h1>Administration</h1>
    <p>Users and access, villages, the recycle bin and the audit log.</p></div>
    <div class="inline"><button class="btn secondary" data-rescore>Recalculate all scores</button>
    <button class="btn" data-add-user>+ Add user</button></div></div>`));

  qs('[data-rescore]', main).onclick = async () => {
    const r = await api('/api/rescore', { method: 'POST' });
    toast(`Rescored ${r.submissions} submissions with ${r.scoring_version}`);
  };
  qs('[data-add-user]', main).onclick = () => modal('Add user', `
    <div><label>Name</label><input data-name></div>
    <div><label>Email</label><input data-email type="email"></div>
    <div><label>Role</label><select data-role>
      <option value="collector">Field Researcher (collect data)</option>
      <option value="supervisor">Supervisor (review &amp; edit)</option>
      <option value="analyst">Analyst (dashboards + anonymised export)</option>
      <option value="viewer">Viewer (read only)</option>
      <option value="admin">Admin (full access)</option></select></div>
    <div><label>Temporary password</label><input data-password type="text" value="Welcome@123"></div>`, async back => {
    await api('/api/users', { method: 'POST', body: {
      name: qs('[data-name]', back).value, email: qs('[data-email]', back).value,
      role: qs('[data-role]', back).value, password: qs('[data-password]', back).value,
    } });
    toast('User created'); renderView();
  }, 'Create');

  const userCard = el(`<div class="card"><header><h3>Users and access</h3>
    <span class="sub">pending accounts must be approved before they can sign in</span></header>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Villages</th><th></th></tr></thead>
    <tbody>${users.rows.map(u => `<tr>
      <td>${esc(u.name)}</td><td class="small">${esc(u.email || '')}</td>
      <td><select data-role-for="${u.id}" style="min-width:130px">
        ${['admin', 'supervisor', 'collector', 'analyst', 'viewer'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
      <td>${u.status === 'pending' ? '<span class="status warning"><span class="dot"></span>Review in progress</span>'
        : u.status === 'active' ? '<span class="status good"><span class="dot"></span>Active</span>'
        : '<span class="status critical"><span class="dot"></span>Disabled</span>'}</td>
      <td class="small">${u.villages.length ? esc(u.villages.map(v => v.name).join(', ')) : '<span class="muted">none</span>'}</td>
      <td class="inline">
        ${u.status === 'pending' ? `<button class="btn sm" data-approve-user="${u.id}">Approve</button>` : ''}
        ${u.status === 'active' && u.id !== state.me.id ? `<button class="btn sm ghost" data-disable-user="${u.id}">Disable</button>` : ''}
        ${u.status === 'disabled' ? `<button class="btn sm ghost" data-enable-user="${u.id}">Re-enable</button>` : ''}
        <button class="btn sm secondary" data-assign="${u.id}">Villages</button></td></tr>`).join('')}
    </tbody></table></div></div>`);
  main.appendChild(userCard);

  const patchUser = async (id, body) => { await api('/api/users/' + id, { method: 'PATCH', body }); toast('Updated'); renderView(); };
  qsa('[data-approve-user]', userCard).forEach(b => b.onclick = () => patchUser(b.dataset.approveUser, { status: 'active' }));
  qsa('[data-disable-user]', userCard).forEach(b => b.onclick = () => patchUser(b.dataset.disableUser, { status: 'disabled' }));
  qsa('[data-enable-user]', userCard).forEach(b => b.onclick = () => patchUser(b.dataset.enableUser, { status: 'active' }));
  qsa('[data-role-for]', userCard).forEach(s => s.onchange = () => patchUser(s.dataset.roleFor, { role: s.value }));
  qsa('[data-assign]', userCard).forEach(b => b.onclick = () => {
    const u = users.rows.find(x => x.id == b.dataset.assign);
    const owned = new Set(u.villages.map(v => v.id));
    modal(`Villages for ${u.name}`, `<div class="opts">${state.meta.villages.map(v =>
      `<button type="button" class="opt" data-v="${v.id}" aria-pressed="${owned.has(v.id)}">${esc(v.name)}</button>`).join('')}</div>
      <p class="small muted">A field researcher can only collect and see data in the villages selected here.</p>`,
      async back => {
        const chosen = qsa('[data-v]', back).filter(x => x.getAttribute('aria-pressed') === 'true').map(x => Number(x.dataset.v));
        await patchUser(u.id, { villages: chosen });
      }, 'Save');
    setTimeout(() => qsa('.modal [data-v]').forEach(btn => btn.onclick = () =>
      btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')), 0);
  });

  const villageCard = el(`<div class="card" style="margin-top:14px"><header><h3>Villages</h3>
    <span class="sub">household counts drive the coverage check</span></header>
    <div class="table-wrap"><table><thead><tr><th>Village</th><th>Block</th><th>District</th><th class="num">Households</th><th class="num">Altitude</th><th></th></tr></thead>
    <tbody>${state.meta.villages.map(v => `<tr>
      <td>${esc(v.name)}</td><td>${esc(v.block || '')}</td><td>${v.district === 'leh' ? 'Leh' : 'Kargil'}</td>
      <td class="num"><input type="number" value="${v.households}" data-hh="${v.id}" style="width:92px"></td>
      <td class="num">${v.altitude_m || '—'}</td>
      <td><button class="btn sm secondary" data-save-village="${v.id}">Save</button></td></tr>`).join('')}
    </tbody></table></div>
    <div class="inline" style="margin-top:10px"><button class="btn sm" data-add-village>+ Add village</button></div></div>`);
  main.appendChild(villageCard);
  qsa('[data-save-village]', villageCard).forEach(b => b.onclick = async () => {
    const id = b.dataset.saveVillage;
    await api('/api/villages/' + id, { method: 'PATCH', body: { households: Number(qs(`[data-hh="${id}"]`, villageCard).value) } });
    toast('Village updated');
    state.meta = await api('/api/meta');
  });
  qs('[data-add-village]', villageCard).onclick = () => modal('Add village', `
    <div><label>Name</label><input data-name></div>
    <div><label>Block / Tehsil</label><input data-block></div>
    <div><label>District</label><select data-district><option value="leh">Leh</option><option value="kargil">Kargil</option></select></div>
    <div class="row2"><div><label>Households</label><input type="number" data-hh value="0"></div>
      <div><label>Altitude (m)</label><input type="number" data-alt></div></div>`, async back => {
    await api('/api/villages', { method: 'POST', body: {
      name: qs('[data-name]', back).value, block: qs('[data-block]', back).value,
      district: qs('[data-district]', back).value, households: Number(qs('[data-hh]', back).value),
      altitude_m: Number(qs('[data-alt]', back).value) || null,
    } });
    state.meta = await api('/api/meta');
    toast('Village added'); renderView();
  }, 'Add');

  main.appendChild(el(`<div class="grid cols-2" style="margin-top:14px">
    <div class="card"><header><h3>Recycle bin</h3><span class="sub">restorable for 30 days</span></header>
      ${bin.rows.length ? `<div class="table-wrap"><table><thead><tr><th>Household</th><th>Village</th><th>Deleted</th><th>Reason</th><th></th></tr></thead>
      <tbody>${bin.rows.map(r => `<tr><td>${esc(r.household_code)}</td><td>${esc(r.village)}</td><td>${fmtDate(r.deleted_at)}</td>
        <td class="small">${esc(r.delete_reason || '')}</td><td><button class="btn sm secondary" data-restore="${r.id}">Restore</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small">Empty.</p>'}</div>
    <div class="card"><header><h3>Audit log</h3><span class="sub">last 200 actions</span></header>
      <div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th></tr></thead>
      <tbody>${audit.rows.slice(0, 60).map(a => `<tr><td class="small">${new Date(a.at).toLocaleString('en-IN')}</td>
        <td class="small">${esc(a.user_name || 'system')}</td><td class="small">${esc(a.action)}</td>
        <td class="small muted">${esc((a.entity || '') + ' ' + (a.entity_id || ''))}</td></tr>`).join('')}
      </tbody></table></div></div></div>`));
  qsa('[data-restore]', main).forEach(b => b.onclick = async () => {
    await api(`/api/submissions/${b.dataset.restore}/restore`, { method: 'POST' });
    toast('Restored'); renderView();
  });
}

/* ---------------------------------------------------------------- insights */
const SEV_CLASS = { critical: 'critical', serious: 'serious', watch: 'warning', good: 'good' };

async function viewInsights(main) {
  const [data, caps] = await Promise.all([
    api('/api/insights' + (state.filters.village_id ? '?village_id=' + state.filters.village_id : '')),
    api('/api/assistant/capabilities'),
  ]);

  main.innerHTML = '';
  main.appendChild(el(`<div class="page-head"><div><h1>Insights &amp; assistant</h1>
    <p>Two layers. The <b>rules engine</b> applies fixed thresholds to the data and never guesses.
    The <b>assistant</b> answers questions in plain language, but may only report what the rules engine
    and the scoring engine compute — it cannot produce a number of its own.</p></div></div>`));

  /* ---- ask box ---- */
  const ask = el(`<div class="card"><header><h3>Ask about the data</h3>
      <span class="sub">${caps.llm_enabled ? 'language model: ' + esc(caps.model) : 'rule-based planner (no API key set)'}</span></header>
    <div class="inline" style="gap:8px">
      <input data-q placeholder="e.g. Which villages in Kargil have the lowest financial wellbeing?" style="flex:1 1 380px">
      <button class="btn" data-send>Ask</button></div>
    <div class="inline" style="margin-top:8px;gap:6px">
      ${['Where is water stress worst?', 'What is flagged in Drass?', 'Compare Stok and Drass',
         'Which villages could learn from each other?', 'What does band 4 mean?']
        .map(x => `<button class="opt" data-eg="${esc(x)}">${esc(x)}</button>`).join('')}
    </div>
    <div data-answer style="margin-top:12px"></div>
    <details style="margin-top:10px"><summary class="small muted">How this answer is kept accurate</summary>
      <ul class="small muted">${caps.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      <p class="small muted">Available lookups: ${caps.tools.map(t => esc(t.name)).join(', ')}.</p>
    </details></div>`);
  main.appendChild(ask);

  const answerBox = qs('[data-answer]', ask);
  async function send(question) {
    qs('[data-q]', ask).value = question;
    answerBox.innerHTML = '<div class="spinner"></div>';
    try {
      const r = await api('/api/assistant', { method: 'POST', body: { question } });
      answerBox.innerHTML = `<div class="notice" style="font-size:.95rem">${esc(r.answer)}</div>
        ${r.note ? `<p class="small muted" style="margin-top:6px">${esc(r.note)}</p>` : ''}
        <p class="small muted" style="margin-top:8px">Evidence — every number above comes from these tables:</p>` +
        r.evidence.map(e => `<div class="card" style="margin-top:8px;box-shadow:none">
          <header><h3 style="font-size:.85rem">${esc(e.tool)}(${esc(JSON.stringify(e.args))})</h3>
            <span class="sub">${esc(e.result.summary || '')}</span></header>
          ${e.result.rows && e.result.rows.length ? `<div class="table-wrap"><table>
            <thead><tr>${(e.result.columns || []).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
            <tbody>${e.result.rows.slice(0, 15).map(row => `<tr>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>` : '<p class="small muted">No rows returned.</p>'}</div>`).join('');
    } catch (err) { answerBox.innerHTML = `<div class="notice error">${esc(err.message)}</div>`; }
  }
  qs('[data-send]', ask).onclick = () => send(qs('[data-q]', ask).value.trim());
  qs('[data-q]', ask).addEventListener('keydown', e => { if (e.key === 'Enter') send(e.target.value.trim()); });
  qsa('[data-eg]', ask).forEach(b => b.onclick = () => send(b.dataset.eg));

  /* ---- priority actions ---- */
  const actions = el(`<div class="card" style="margin-top:14px"><header><h3>What needs attention</h3>
    <span class="sub">households affected, counted by fixed rules</span></header>
    ${data.actions.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Problem</th><th class="hide-sm">Dimension</th><th class="num">Households</th><th class="num hide-sm">Share</th><th class="hide-sm">Worst villages</th><th>Level</th></tr></thead>
      <tbody>${data.actions.map(a2 => `<tr>
        <td><b>${esc(a2.name)}</b><div class="small muted">${esc(a2.action)}</div></td>
        <td class="hide-sm"><span class="dim-key">${dimDot(a2.dim)}${esc(dimName(a2.dim))}</span></td>
        <td class="num">${a2.households} of ${a2.of}<span class="show-sm"> (${(a2.share * 100).toFixed(0)}%)</span></td>
        <td class="num hide-sm">${(a2.share * 100).toFixed(0)}%</td>
        <td class="small hide-sm">${esc(a2.villages.join(' · '))}</td>
        <td><span class="status ${SEV_CLASS[a2.level] || 'warning'}"><span class="dot"></span>${esc(a2.level)}</span></td>
      </tr>`).join('')}</tbody></table></div>`
      : '<p class="muted small">Nothing crosses the thresholds in this view.</p>'}</div>`);
  main.appendChild(actions);

  /* ---- matches ---- */
  const matches = el(`<div class="card" style="margin-top:14px"><header><h3>Villages that could learn from each other</h3>
    <span class="sub">paired where the gap is 20 points or more</span></header>
    ${data.matches.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Problem</th><th>Village needing help</th><th>Village to learn from</th><th class="num">Gap</th></tr></thead>
      <tbody>${data.matches.map(m => `<tr>
        <td>${esc(m.name)}</td>
        <td><b>${esc(m.needs.village)}</b> <span class="muted">${(m.needs.share * 100).toFixed(0)}% of ${m.needs.of}</span></td>
        <td><b>${esc(m.has.village)}</b> <span class="muted">${(m.has.share * 100).toFixed(0)}% of ${m.has.of}</span></td>
        <td class="num">${(m.gap * 100).toFixed(0)} pts</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted small">No pairing meets the threshold.</p>'}</div>`);
  main.appendChild(matches);

  /* ---- per-village ---- */
  const per = el(`<div class="card" style="margin-top:14px"><header><h3>Village by village</h3>
    <span class="sub">flags and showcases per village</span></header><div class="stack"></div></div>`);
  const stack = qs('.stack', per);
  data.villages.forEach(v => {
    const flagCount = v.flags.length, showCount = v.showcases.length;
    const d = el(`<details><summary><b>${esc(v.village)}</b>
      <span class="muted small"> — ${v.pct === null ? 'no score' : v.pct.toFixed(1) + '%'} ·
      ${flagCount} flag${flagCount === 1 ? '' : 's'} · ${showCount} showcase${showCount === 1 ? '' : 's'} ·
      ${v.n} surveys${v.coverage && !v.coverage.sufficient ? ' · BELOW MINIMUM SAMPLE' : ''}</span></summary>
      <div class="table-wrap" style="margin-top:8px"><table><tbody>
      ${v.flags.map(f => `<tr><td style="width:90px"><span class="status ${SEV_CLASS[f.level] || 'warning'}"><span class="dot"></span>flag</span></td>
        <td><b>${esc(f.name)}</b><div class="small muted">${esc(f.why)}${f.action ? ' ' + esc(f.action) : ''}</div></td></tr>`).join('')}
      ${v.showcases.map(sc => `<tr><td><span class="status good"><span class="dot"></span>showcase</span></td>
        <td><b>${esc(sc.name)}</b><div class="small muted">${esc(sc.why)}</div></td></tr>`).join('')}
      </tbody></table></div></details>`);
    stack.appendChild(d);
  });
  main.appendChild(per);

  main.appendChild(el(`<p class="small muted" style="margin-top:12px">
    Thresholds in force: dimension flagged below ${(data.thresholds.flag_dimension * 100).toFixed(0)}%;
    signal levels at ${data.thresholds.signal_bands.map(b => `${b.level} ≥ ${(b.min_share * 100).toFixed(0)}%`).join(', ')};
    showcase at ${(data.thresholds.showcase_dimension * 100).toFixed(0)}%; pairing gap ${(data.thresholds.match_gap * 100).toFixed(0)} points;
    village reported at ${esc(data.thresholds.min_village_sample)}. Scoring ${esc(data.scoring_version)}.</p>`));
}

/* ------------------------------------------------------------------ method */
function viewMethod(main) {
  const dims = state.meta.dimensions;
  const ind = state.meta.indicators;
  main.innerHTML = '';
  main.appendChild(el(`<div class="page-head"><div><h1>How the scoring works</h1>
    <p>Every number on the dashboard can be traced back to a rule on this page and to the raw answers stored with each submission.</p></div></div>`));

  main.appendChild(el(`<div class="card"><h3>From answer to index</h3>
    <ol class="small" style="line-height:1.8">
      <li>Each indicator is scored <b>0 to 1</b> from the household's answer.</li>
      <li>A <b>dimension score</b> is the plain average of its indicator scores — never a multiplication, so one weak answer cannot zero a dimension.</li>
      <li>The <b>well-being index (IWB)</b> is the average of the seven dimension scores, each weighted 1/7.</li>
      <li>The index is shown as a percentage and mapped to the familiar <b>1–7 band</b>.</li>
      <li>A <b>village score (VWBI)</b> is the mean of valid household indexes in that village.</li>
    </ol>
    <p class="small muted">Missing data: "don't know" and "prefer not to answer" score a neutral 0.5; not-collected items are excluded
      and the denominator shrinks. A dimension resolves only with at least half its indicators (minimum 2); a household resolves only
      with at least 5 of 7 dimensions; a village is reported only at 30% of households or 10 surveys, whichever is larger.</p></div>`));

  main.appendChild(el(`<div class="card" style="margin-top:14px"><h3>Bands</h3>
    <div class="table-wrap"><table><thead><tr><th>Range</th><th>Band</th><th>Meaning</th></tr></thead><tbody>
    ${state.meta.bands.map(b => `<tr><td>${b.min}–${Math.round(b.max)}%</td><td><span class="band-pill" data-band="${b.band}">${b.band}</span></td><td>${esc(b.label)}</td></tr>`).join('')}
    </tbody></table></div></div>`));

  main.appendChild(el(`<div class="card" style="margin-top:14px"><h3>Indicators in each dimension</h3>
    <div class="grid cols-2">${dims.map(d => `<div><h4 style="margin:8px 0 4px">${dimDot(d.id)} ${esc(d.name)}</h4>
      <ul class="small muted" style="margin:0;padding-left:18px">${(ind[d.id] || []).map(i => `<li>${esc(i.label)} <span style="opacity:.7">(${i.items.join(', ')})</span></li>`).join('')}</ul></div>`).join('')}</div>
    <p class="small muted" style="margin-top:10px">Thresholds are anchored to Indian references: ICMR / WHO Asia-Pacific BMI cut-offs,
      IPHS norms for hill and tribal areas, BIS IS 10500 drinking water, and ₹ income bands — not the Malaysian or Bhutanese values in the
      original platform documents. A traditional dry-compost toilet scores full marks, and monastic or vocational education is credited at 0.5.</p></div>`));
}

/* -------------------------------------------------------------------- boot */
async function boot() {
  const saved = localStorage.getItem('dyeskit-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  try {
    state.meta = await api('/api/meta');
    state.me = state.meta.user; state.rights = state.meta.rights;
    if (!NAV.find(n => n.id === state.view && n.roles.includes(state.me.role))) state.view = 'dashboard';
    renderShell();
    renderView();
  } catch {
    renderLogin();
  }
}
boot();
