/**
 * The printable report for a village or a district — one or two A4 pages for a council or
 * panchayat meeting. Totals only: no household is named or coded.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANDS, DIMENSIONS, ORGANISATION, SCORING_VERSION, VILLAGE_MIN_HOUSEHOLDS, VILLAGE_MIN_SHARE,
  type Dashboard, type RoundScore, type computeInsights,
} from '@dyeskit/core';

type Insights = ReturnType<typeof computeInsights>;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOGO = (() => {
  try { return 'data:image/png;base64,' + fs.readFileSync(path.join(HERE, '..', '..', 'mobile', 'assets', 'images', 'logo.png')).toString('base64'); }
  catch { return null; }
})();

const DIM_COLORS: Record<string, string> = { phy: '#EF5D60', fin: '#F0A030', emo: '#E064AA', soc: '#8A63F0', env: '#22B07D', int: '#3B8CF0', spi: '#F27A36' };
const BAND_COLORS: Record<number, string> = { 1: '#C23B3B', 2: '#E0613A', 3: '#EE9A2E', 4: '#E3B530', 5: '#7CC35A', 6: '#2BAE7E', 7: '#11998E' };
const LEVEL_COLORS: Record<string, string> = { critical: '#D93F3F', serious: '#EE8A2E', watch: '#D9B12C' };

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
const n1 = (x: number | null | undefined) => (x === null || x === undefined ? '—' : x.toFixed(1));
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const bandOf = (b: number | null) => BANDS.find(x => x.band === b);

export interface ReportInput {
  title: string;                 // "Stok" or "Changthang district"
  subtitle: string;              // "Leh district · Chuchot block · code STO"
  roundName: string;
  households: number | null;     // on record (villages only)
  dashboard: Dashboard;
  insights: Insights;
  rounds: RoundScore[];
  generatedBy: string;
}

export function reportHtml(r: ReportInput) {
  const d = r.dashboard, o = d.overall;
  const band = bandOf(o.band);
  const coverage = o.coverage;
  const flags = r.insights.villages.flatMap(v => v.flags.map(f => ({ ...f, village: v.name })));
  const dimFlags = o.flags;
  const signalActions = r.insights.actions.slice(0, 4);   // keeps a village report on one page
  const brights = r.insights.villages.flatMap(v => v.showcases.filter(s => s.type === 'dimension').map(s => s.name));
  const prev = r.rounds.filter(x => x.score !== null);
  const before = prev.length >= 2 ? prev[prev.length - 2] : null;
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const dimRows = DIMENSIONS.map(dim => {
    const v = o.dims[dim.id];
    const was = before?.dims[dim.id] ?? null;
    const ch = v !== null && was !== null ? Math.round((v - was) * 10) / 10 : null;
    return `<tr>
      <td><span class="dot" style="background:${DIM_COLORS[dim.id]}"></span>${esc(dim.name)}</td>
      <td class="bar"><div class="track"><div class="fill" style="width:${v ?? 0}%;background:${DIM_COLORS[dim.id]}"></div><div class="line" style="left:43%"></div></div></td>
      <td class="num"><b>${n1(v)}</b></td>
      <td class="num ${ch === null ? '' : ch > 0.5 ? 'up' : ch < -0.5 ? 'down' : ''}">${ch === null ? '' : (ch > 0 ? '▲ +' : ch < 0 ? '▼ ' : '') + ch}</td>
    </tr>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.title)} — well-being report ${esc(r.roundName)}</title>
<style>
@page { size: A4; margin: 14mm 13mm; }
* { box-sizing: border-box; }
body { font: 11.5px/1.5 -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #121A33; margin: 0; background: #fff; }
.head { background: linear-gradient(120deg,#16245A,#1F4FB8 60%,#14A3A8); color: #fff; border-radius: 14px; padding: 18px 20px; display: flex; gap: 16px; align-items: center; }
.head img { width: 54px; height: 54px; border-radius: 14px; }
.head h1 { font-size: 24px; margin: 0; letter-spacing: -0.4px; }
.head .sub { opacity: .88; margin-top: 2px; }
.head .right { margin-left: auto; text-align: right; font-size: 11px; opacity: .9; }
.score { display: flex; gap: 14px; margin: 14px 0; }
.box { flex: 1; border: 1px solid #E1E6F0; border-radius: 12px; padding: 12px 14px; }
.big { font-size: 34px; font-weight: 800; letter-spacing: -1px; line-height: 1; }
.lbl { font-size: 9.5px; text-transform: uppercase; letter-spacing: .8px; color: #4A5470; font-weight: 700; }
.pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 11px; margin-top: 6px; }
h2 { font-size: 14.5px; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #EEF1F8; }
table { width: 100%; border-collapse: collapse; }
td { padding: 4px 4px; vertical-align: middle; }
td.num { text-align: right; white-space: nowrap; width: 54px; }
td.bar { width: 55%; }
.track { position: relative; height: 10px; background: #EEF1F8; border-radius: 6px; overflow: hidden; }
.fill { height: 100%; border-radius: 6px; }
.line { position: absolute; top: -2px; bottom: -2px; width: 1.5px; background: #4A5470; opacity: .5; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 5px; margin-right: 7px; }
.up { color: #1E9E6A; font-weight: 700; } .down { color: #D93F3F; font-weight: 700; }
.item { border-left: 4px solid #E1E6F0; padding: 6px 10px; margin: 6px 0; background: #FAFBFD; border-radius: 0 8px 8px 0; break-inside: avoid; }
.item b { display: block; }
.muted { color: #4A5470; } .small { font-size: 10px; }
.cols { display: flex; gap: 16px; } .cols > div { flex: 1; }
.foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #E1E6F0; font-size: 9.5px; color: #4A5470; }
</style></head><body>
<div class="head">
  ${LOGO ? `<img src="${LOGO}" alt="">` : ''}
  <div><h1>${esc(r.title)}</h1><div class="sub">${esc(r.subtitle)}</div></div>
  <div class="right">Well-being report<br><b>Round ${esc(r.roundName)}</b><br>${esc(date)}</div>
</div>

<div class="score">
  <div class="box">
    <div class="lbl">Well-being index</div>
    <div class="big" style="color:${BAND_COLORS[o.band ?? 0] ?? '#4A5470'}">${n1(o.score)}<span style="font-size:14px;color:#4A5470"> / 100</span></div>
    ${band ? `<span class="pill" style="background:${BAND_COLORS[band.band]}22;color:${BAND_COLORS[band.band]}">Band ${band.band} · ${esc(band.label)}</span>` : '<span class="muted">Not enough surveys for a score yet</span>'}
  </div>
  <div class="box">
    <div class="lbl">Households surveyed</div>
    <div class="big">${o.n}</div>
    <div class="muted small" style="margin-top:6px">${coverage
      ? `${coverage.percent}% of ${coverage.households} households on record — ${coverage.reliable ? '<b style="color:#1E9E6A">reliable</b>' : `<b style="color:#D9831C">not yet reliable</b> (${coverage.required - coverage.surveyed} more needed)`}`
      : r.households === null ? `${d.headline.villagesSurveyed} villages surveyed` : 'Household count not recorded'}</div>
  </div>
  ${before ? `<div class="box">
    <div class="lbl">Since round ${esc(before.name)}</div>
    <div class="big ${o.score !== null && before.score !== null ? (o.score - before.score > 0.5 ? 'up' : o.score - before.score < -0.5 ? 'down' : '') : ''}">${o.score !== null && before.score !== null ? `${o.score - before.score > 0 ? '+' : ''}${(o.score - before.score).toFixed(1)}` : '—'}</div>
    <div class="muted small" style="margin-top:6px">was ${n1(before.score)} with ${before.n} households</div>
  </div>` : ''}
</div>

<h2>The seven dimensions</h2>
<table>${dimRows}</table>
<div class="muted small">Each score is the average of fixed points (0–100) given to every answer. The thin line marks 43, the “Basic” level; below it a dimension is flagged.${before ? ` Arrows show change since round ${esc(before.name)}.` : ''}</div>

<div class="cols">
  <div>
    <h2>Needs attention</h2>
    ${dimFlags.map(f => `<div class="item" style="border-color:${LEVEL_COLORS[f.level]}"><b>${esc(DIMENSIONS.find(x => x.id === f.dim)!.name)} — ${n1(f.score)}</b><span class="muted">Below the “Basic” level of 43${f.level === 'critical' ? '; critical below 29' : ''}.</span></div>`).join('')}
    ${signalActions.length ? signalActions.map(a => `<div class="item" style="border-color:${LEVEL_COLORS[a.level]}"><b>${esc(a.label)} — ${a.households} of ${a.of} households (${pct(a.share)})</b><span class="muted">${esc(a.action)}</span></div>`).join('')
      : !dimFlags.length ? '<p class="muted">Nothing affects 15% or more of households. 🎉</p>' : ''}
  </div>
  <div>
    <h2>What households asked for</h2>
    ${d.priorities.length ? `<table>${d.priorities.slice(0, 6).map((p, i) => `<tr><td>${i + 1}. ${esc(p.label)}</td><td class="num">${p.points} pts</td></tr>`).join('')}</table>
      <div class="muted small">Top-3 priorities: 1st choice 3 points, 2nd 2, 3rd 1.</div>` : '<p class="muted">No priorities recorded yet.</p>'}
    ${brights.length ? `<h2>Bright spots</h2><p>${[...new Set(brights)].map(esc).join(' · ')} at band 6 or above — worth sharing with other villages.</p>` : ''}
    <h2>Lowest-scoring questions</h2>
    <table>${d.questions.slice(0, 6).map(q => `<tr><td><span class="dot" style="background:${DIM_COLORS[q.dim]}"></span>${esc(q.label)}</td><td class="num"><b>${n1(q.points)}</b></td></tr>`).join('')}</table>
  </div>
</div>
${flags.length && r.insights.villages.length > 1 ? `<h2>Villages with flags</h2>${r.insights.villages.filter(v => v.flags.length).slice(0, 12)
  .map(v => `<div class="item"><b>${esc(v.name)} — ${n1(v.score)}</b><span class="muted">${v.flags.slice(0, 3).map(f => esc(f.name)).join(' · ')}</span></div>`).join('')}` : ''}

<div class="foot">
  ${esc(ORGANISATION.name)} · scoring ${esc(SCORING_VERSION)} · prepared by ${esc(r.generatedBy)} on ${esc(date)}.
  Figures are totals across households; no household is named. A result is called reliable once ${Math.round(VILLAGE_MIN_SHARE * 100)}% of a village’s
  households (and at least ${VILLAGE_MIN_HOUSEHOLDS}) have been surveyed. Self-reported surveys count once a supervisor has approved them.
</div>
</body></html>`;
}
