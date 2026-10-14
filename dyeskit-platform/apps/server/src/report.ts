/**
 * Printable reports.
 *   • reportHtml — a village or a district: one or two A4 pages for a council or panchayat
 *     meeting. Totals only: no household is named or coded.
 *   • householdReportHtml — one household's own result, for the family (or its supervisor).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANDS, DIMENSIONS, ORGANISATION, SCORING_VERSION, VILLAGE_MIN_HOUSEHOLDS, VILLAGE_MIN_SHARE, districtName, questionNo,
  type Dashboard, type DimensionId, type HouseholdScore, type RoundScore, type Signal, type computeInsights,
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

/** Shared by the village/district report and the household report. */
const CSS = `@page { size: A4; margin: 14mm 13mm; }
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
`;

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
${CSS}</style></head><body>
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

/* ------------------------------------------------------------ one household */

export interface HouseholdReportInput {
  householdCode: string;
  headName: string | null;
  village: string;
  district: string;
  roundName: string;
  submittedAt: string | null;
  status: string;
  score: HouseholdScore;
  /** averages to compare with; village is left out for household members (they never see village data) */
  compare: { label: string; score: number | null; dims: Record<DimensionId, number | null> }[];
  /** the same household's survey in an earlier round, if any */
  previous: { roundName: string; score: HouseholdScore } | null;
  /** what the household's answers point to (insight rules) */
  signals: Signal[];
  generatedBy: string;
}

/** The seven dimensions as a radar: the household filled, the comparisons as dashed outlines. */
function radarSvg(series: { values: (number | null)[]; color: string; fill?: boolean; dashed?: boolean }[]) {
  const size = 250, c = size / 2, r = 88, n = DIMENSIONS.length;
  const at = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * r * (v / 100), c + Math.sin(a) * r * (v / 100)];
  };
  const ring = (v: number) => DIMENSIONS.map((_, i) => at(i, v).join(',')).join(' ');
  const grid = [25, 50, 75, 100].map(v => `<polygon points="${ring(v)}" fill="none" stroke="#E1E6F0" stroke-width="1"/>`).join('');
  const spokes = DIMENSIONS.map((_, i) => { const [x, y] = at(i, 100); return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" stroke="#E1E6F0"/>`; }).join('');
  const labels = DIMENSIONS.map((d, i) => {
    const [x, y] = at(i, 122);
    return `<text x="${x}" y="${y}" font-size="10" font-weight="700" fill="${DIM_COLORS[d.id]}" text-anchor="middle" dominant-baseline="middle">${esc(d.short)}</text>`;
  }).join('');
  const shapes = series.map(s => {
    const pts = s.values.map((v, i) => at(i, v ?? 0).join(',')).join(' ');
    return `<polygon points="${pts}" fill="${s.fill ? s.color + '33' : 'none'}" stroke="${s.color}" stroke-width="${s.fill ? 2.2 : 1.6}"${s.dashed ? ' stroke-dasharray="4 3"' : ''}/>`;
  }).join('');
  return `<svg viewBox="-20 -6 ${size + 40} ${size + 12}" width="270" height="244" xmlns="http://www.w3.org/2000/svg">${grid}${spokes}${shapes}${labels}</svg>`;
}

export function householdReportHtml(r: HouseholdReportInput) {
  const s = r.score;
  const band = bandOf(s.band);
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const when = r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const prev = r.previous?.score ?? null;
  const change = s.score !== null && prev?.score != null ? Math.round((s.score - prev.score) * 10) / 10 : null;
  const COMPARE_COLORS = ['#4A5470', '#14A3A8'];

  const dimRows = DIMENSIONS.map(dim => {
    const v = s.dims[dim.id].score;
    const was = prev?.dims[dim.id]?.score ?? null;
    const ch = v !== null && was !== null ? Math.round((v - was) * 10) / 10 : null;
    return `<tr>
      <td style="white-space:nowrap"><span class="dot" style="background:${DIM_COLORS[dim.id]}"></span>${esc(dim.short)}</td>
      <td class="bar"><div class="track"><div class="fill" style="width:${v ?? 0}%;background:${DIM_COLORS[dim.id]}"></div><div class="line" style="left:43%"></div></div></td>
      <td class="num"><b>${n1(v)}</b></td>
      ${r.compare.map(cmp => `<td class="num muted">${n1(cmp.dims[dim.id])}</td>`).join('')}
      ${prev ? `<td class="num ${ch === null ? '' : ch > 0.5 ? 'up' : ch < -0.5 ? 'down' : ''}">${ch === null ? '' : (ch > 0 ? '▲ +' : ch < 0 ? '▼ ' : '') + ch}</td>` : ''}
    </tr>`;
  }).join('');

  const scored = Object.entries(s.questions).filter(([, q]) => q.points !== null && q.status === 'ok');
  const weakest = [...scored].sort((a, b) => a[1].points! - b[1].points!).filter(([, q]) => q.points! < 50).slice(0, 5);
  const strongest = DIMENSIONS.map(d => ({ d, v: s.dims[d.id].score })).filter(x => x.v !== null && x.v >= 71).sort((a, b) => b.v! - a.v!).slice(0, 3);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Household ${esc(r.householdCode)} — well-being report ${esc(r.roundName)}</title>
<style>
${CSS}
.radar { display: flex; gap: 10px; align-items: center; }
.legend { font-size: 10.5px; } .legend div { margin: 3px 0; } .sw { display: inline-block; width: 18px; height: 0; border-top: 2.5px solid; margin-right: 6px; vertical-align: middle; }
h2 { margin: 13px 0 5px; } .score { margin: 12px 0; } .item { margin: 5px 0; padding: 5px 10px; }
th { text-align: right; font-size: 9.5px; color: #4A5470; font-weight: 700; padding: 2px 4px; } th:first-child { text-align: left; }
</style></head><body>
<div class="head">
  ${LOGO ? `<img src="${LOGO}" alt="">` : ''}
  <div><h1>Household ${esc(r.householdCode)}</h1><div class="sub">${esc([r.headName, r.village, `${districtName(r.district)} district`].filter(Boolean).join(' · '))}</div></div>
  <div class="right">Household well-being report<br><b>Round ${esc(r.roundName)}</b><br>surveyed ${esc(when)}</div>
</div>

<div class="score">
  <div class="box">
    <div class="lbl">Well-being score</div>
    <div class="big" style="color:${BAND_COLORS[s.band ?? 0] ?? '#4A5470'}">${n1(s.score)}<span style="font-size:14px;color:#4A5470"> / 100</span></div>
    ${band ? `<span class="pill" style="background:${BAND_COLORS[band.band]}22;color:${BAND_COLORS[band.band]}">Band ${band.band} · ${esc(band.label)}</span>` : '<span class="muted">Not enough answers for a score</span>'}
  </div>
  ${r.compare.map(cmp => `<div class="box">
    <div class="lbl">${esc(cmp.label)}</div>
    <div class="big" style="color:#4A5470">${n1(cmp.score)}</div>
    <div class="muted small" style="margin-top:6px">${s.score !== null && cmp.score !== null ? (s.score >= cmp.score ? `This household is ${(s.score - cmp.score).toFixed(1)} above` : `This household is ${(cmp.score - s.score).toFixed(1)} below`) : 'average household score'}</div>
  </div>`).join('')}
  ${r.previous ? `<div class="box">
    <div class="lbl">Since round ${esc(r.previous.roundName)}</div>
    <div class="big ${change === null ? '' : change > 0.5 ? 'up' : change < -0.5 ? 'down' : ''}">${change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}`}</div>
    <div class="muted small" style="margin-top:6px">was ${n1(prev?.score)}</div>
  </div>` : ''}
</div>

<h2>The seven dimensions</h2>
<div class="radar">
  ${radarSvg([...r.compare.map((cmp, i) => ({ values: DIMENSIONS.map(d => cmp.dims[d.id]), color: COMPARE_COLORS[i], dashed: true })),
    { values: DIMENSIONS.map(d => s.dims[d.id].score), color: '#1F4FB8', fill: true }])}
  <div style="flex:1">
    <table>
      <tr><th></th><th></th><th>This household</th>${r.compare.map(cmp => `<th>${esc(cmp.label.replace(' average', ''))}</th>`).join('')}${prev ? '<th>Change</th>' : ''}</tr>
      ${dimRows}
    </table>
    <div class="legend" style="margin-top:6px">
      <div><span class="sw" style="border-color:#1F4FB8"></span>This household</div>
      ${r.compare.map((cmp, i) => `<div><span class="sw" style="border-color:${COMPARE_COLORS[i]};border-top-style:dashed"></span>${esc(cmp.label)}</div>`).join('')}
    </div>
  </div>
</div>
<div class="muted small">Each score is the average of fixed points (0–100) for the household’s answers. The thin line marks 43, the “Basic” level.</div>

<div class="cols">
  <div>
    <h2>What could be better</h2>
    ${r.signals.length ? r.signals.slice(0, 5).map(x => `<div class="item" style="border-color:${DIM_COLORS[x.dim]}"><b>${esc(x.label)}</b><span class="muted">${esc(x.action)}</span></div>`).join('')
      : '<p class="muted">None of the warning signs used in DYESKIT apply to this household. 🎉</p>'}
  </div>
  <div>
    <h2>Strengths</h2>
    ${strongest.length ? strongest.map(x => `<div class="item" style="border-color:${DIM_COLORS[x.d.id]}"><b>${esc(x.d.name)} — ${n1(x.v)}</b><span class="muted">${esc(x.d.about)}</span></div>`).join('')
      : '<p class="muted">No dimension is at “Strong” (71) or above yet.</p>'}
    ${weakest.length ? `<h2>Lowest-scoring answers</h2><table>${weakest.map(([id, q]) => `<tr><td><span class="dot" style="background:${DIM_COLORS[q.dim]}"></span>${esc(questionNo(id))} · ${esc(q.label)}<div class="muted small" style="margin-left:16px">${esc(q.detail ?? '')}</div></td><td class="num"><b>${q.points}</b></td></tr>`).join('')}</table>` : ''}
  </div>
</div>

<div class="foot">
  Survey ${esc(r.status === 'approved' ? 'checked and approved' : r.status === 'rejected' ? 'sent back for correction' : 'waiting to be checked')};
  ${s.countedDimensions} of 7 dimensions had enough answers to count. Averages include only checked surveys of this round.<br>
  ${esc(ORGANISATION.name)} · scoring ${esc(SCORING_VERSION)} · prepared by ${esc(r.generatedBy)} on ${esc(date)}.
  This report is about one household and is private: share it only with the family and project staff.
</div>
</body></html>`;
}
