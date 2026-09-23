/* DYESKIT chart layer — hand-built SVG, no dependencies.
   Rules followed: thin marks, 2px rounded data-ends, recessive grid, legend whenever
   two series are drawn, hover tooltip on every mark, and a table view for every chart. */

const CSS = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const S1 = () => CSS('--series-1');
const S2 = () => CSS('--series-2');
const fmtPct = v => (v === null || v === undefined ? '—' : (v * 100).toFixed(0) + '%');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------- tooltip */
let tipEl = null;
function tip(html, evt) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tooltip'; document.body.appendChild(tipEl); }
  tipEl.innerHTML = html;
  tipEl.style.display = 'block';
  const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
  if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}
const hideTip = () => { if (tipEl) tipEl.style.display = 'none'; };
document.addEventListener('scroll', hideTip, true);

function hoverable(el, htmlFn) {
  el.addEventListener('mousemove', e => tip(htmlFn(), e));
  el.addEventListener('mouseleave', hideTip);
  el.style.cursor = 'default';
}

const svgEl = (name, attrs = {}) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, v);
  return e;
};

/** Every chart ships a table view; this wires the toggle. */
function withTable(container, svg, tableHtml, label) {
  container.innerHTML = '';
  const holder = document.createElement('div');
  holder.appendChild(svg);
  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap hidden';
  tableWrap.innerHTML = tableHtml;
  const toggle = document.createElement('button');
  toggle.className = 'chart-toggle';
  toggle.textContent = 'Show as table';
  toggle.onclick = () => {
    const showTable = tableWrap.classList.contains('hidden');
    tableWrap.classList.toggle('hidden', !showTable);
    holder.classList.toggle('hidden', showTable);
    toggle.textContent = showTable ? 'Show as chart' : 'Show as table';
  };
  container.appendChild(holder);
  container.appendChild(tableWrap);
  container.appendChild(toggle);
  if (label) svg.setAttribute('aria-label', label);
  return container;
}

function legend(items) {
  const l = document.createElement('div');
  l.className = 'legend';
  l.innerHTML = items.map(i => `<span class="key"><span class="swatch" style="background:${i.color}"></span>${esc(i.label)}</span>`).join('');
  return l;
}

/* ------------------------------------------------------------ radar (7 dimensions) */
export function radarChart(container, { series, axes, max = 1 }) {
  const size = 320, cx = size / 2, cy = size / 2 + 6, r = 108;
  const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${size} ${size + 22}`, role: 'img' });
  const n = axes.length;
  const pt = (i, val) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    const rad = (val / max) * r;
    return [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
  };

  [0.25, 0.5, 0.75, 1].forEach(ring => {
    const pts = axes.map((_, i) => pt(i, ring * max).join(',')).join(' ');
    svg.appendChild(svgEl('polygon', { points: pts, fill: 'none', class: 'gridline' }));
  });
  axes.forEach((a, i) => {
    const [x, y] = pt(i, max);
    svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'gridline' }));
    const [lx, ly] = pt(i, max * 1.22);
    const t = svgEl('text', { x: lx, y: ly, class: 'axis-label', 'text-anchor': lx > cx + 4 ? 'start' : lx < cx - 4 ? 'end' : 'middle', 'dominant-baseline': 'middle' });
    t.textContent = a.label;
    svg.appendChild(t);
  });

  series.forEach((s, si) => {
    const color = si === 0 ? S1() : S2();
    const pts = axes.map((a, i) => pt(i, s.values[i] === null ? 0 : s.values[i]));
    const poly = svgEl('polygon', {
      points: pts.map(p => p.join(',')).join(' '),
      fill: si === 0 ? color : 'none', 'fill-opacity': si === 0 ? 0.14 : 0,
      stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round',
      'stroke-dasharray': si === 1 ? '5 4' : null,
    });
    svg.appendChild(poly);
    pts.forEach((p, i) => {
      const dot = svgEl('circle', { cx: p[0], cy: p[1], r: 4.5, fill: color, stroke: CSS('--surface'), 'stroke-width': 2 });
      hoverable(dot, () => `<div class="t-title">${esc(axes[i].label)}</div>` +
        series.map((ss, k) => `<div class="t-row"><span>${esc(ss.label)}</span><b>${fmtPct(ss.values[i])}</b></div>`).join(''));
      svg.appendChild(dot);
    });
  });

  const table = `<table><thead><tr><th>Dimension</th>${series.map(s => `<th class="num">${esc(s.label)}</th>`).join('')}</tr></thead><tbody>` +
    axes.map((a, i) => `<tr><td>${esc(a.label)}</td>${series.map(s => `<td class="num">${fmtPct(s.values[i])}</td>`).join('')}</tr>`).join('') +
    '</tbody></table>';

  withTable(container, svg, table, 'Seven-dimension well-being profile');
  if (series.length > 1) container.insertBefore(legend(series.map((s, i) => ({ label: s.label, color: i === 0 ? S1() : S2() }))), container.lastChild);
  return container;
}

/* --------------------------------------------------- horizontal bars (ranked) */
export function barsH(container, { rows, max = 1, valueFormat = fmtPct, color, showValue = true, reference = null, height = 22, width = 620, labelWidth = 150 }) {
  const labelW = labelWidth, valueW = 52, w = width, gap = 8;
  const h = rows.length * (height + gap) + 26;
  const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, role: 'img', preserveAspectRatio: 'xMinYMin meet' });
  const plotW = w - labelW - valueW;
  const x = v => (Math.max(0, Math.min(v, max)) / max) * plotW;

  [0, 0.25, 0.5, 0.75, 1].forEach(t => {
    const gx = labelW + t * plotW;
    svg.appendChild(svgEl('line', { x1: gx, y1: 12, x2: gx, y2: h - 18, class: 'gridline' }));
    const lab = svgEl('text', { x: gx, y: h - 4, class: 'axis-label', 'text-anchor': 'middle' });
    lab.textContent = valueFormat(t * max);
    svg.appendChild(lab);
  });

  rows.forEach((r, i) => {
    const y = 12 + i * (height + gap);
    const label = svgEl('text', { x: labelW - 10, y: y + height / 2, class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'middle' });
    label.textContent = r.label;
    svg.appendChild(label);
    const barColor = r.color || color || S1();
    const bw = Math.max(2, x(r.value));
    const bar = svgEl('rect', { x: labelW, y, width: bw, height, rx: 4, fill: barColor });
    hoverable(bar, () => `<div class="t-title">${esc(r.label)}</div><div class="t-row"><span>${esc(r.metric || 'Score')}</span><b>${valueFormat(r.value)}</b></div>` +
      (r.note ? `<div class="t-row"><span>${esc(r.note)}</span></div>` : ''));
    svg.appendChild(bar);
    if (showValue) {
      const v = svgEl('text', { x: labelW + bw + 8, y: y + height / 2, class: 'value-label', 'dominant-baseline': 'middle' });
      v.textContent = valueFormat(r.value);
      svg.appendChild(v);
    }
  });

  if (reference !== null && reference !== undefined) {
    const rx = labelW + x(reference);
    svg.appendChild(svgEl('line', { x1: rx, y1: 8, x2: rx, y2: h - 18, stroke: CSS('--ink-2'), 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
    const t = svgEl('text', { x: rx + 4, y: 8, class: 'axis-label' });
    t.textContent = 'average';
    svg.appendChild(t);
  }

  const table = `<table><thead><tr><th>Item</th><th class="num">Value</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${valueFormat(r.value)}</td></tr>`).join('') + '</tbody></table>';
  return withTable(container, svg, table, 'Ranked bar chart');
}

/* ------------------------------------------- vertical ordinal bars (band spread) */
export function barsV(container, { rows, valueFormat = v => v, ramp = true }) {
  const w = 620, h = 200, padL = 34, padB = 46, padT = 12;
  const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, role: 'img' });
  const max = Math.max(1, ...rows.map(r => r.value));
  const plotH = h - padB - padT, plotW = w - padL - 10;
  const bw = Math.min(58, (plotW / rows.length) - 10);
  const steps = ['--seq-100', '--seq-250', '--seq-350', '--seq-450', '--seq-450', '--seq-550', '--seq-650'];

  [0, 0.5, 1].forEach(t => {
    const gy = padT + plotH - t * plotH;
    svg.appendChild(svgEl('line', { x1: padL, y1: gy, x2: w - 10, y2: gy, class: 'gridline' }));
    const lab = svgEl('text', { x: padL - 8, y: gy, class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'middle' });
    lab.textContent = Math.round(t * max);
    svg.appendChild(lab);
  });

  rows.forEach((r, i) => {
    const x = padL + (i + 0.5) * (plotW / rows.length) - bw / 2;
    const bh = Math.max(r.value > 0 ? 3 : 0, (r.value / max) * plotH);
    const y = padT + plotH - bh;
    const fill = r.color || (ramp ? CSS(steps[Math.min(i, steps.length - 1)]) : S1());
    const bar = svgEl('rect', { x, y, width: bw, height: bh, rx: 4, fill });
    hoverable(bar, () => `<div class="t-title">${esc(r.label)}</div><div class="t-row"><span>${esc(r.metric || 'Households')}</span><b>${valueFormat(r.value)}</b></div>`);
    svg.appendChild(bar);
    const cap = svgEl('text', { x: x + bw / 2, y: y - 5, class: 'value-label', 'text-anchor': 'middle' });
    cap.textContent = r.value ? valueFormat(r.value) : '';
    svg.appendChild(cap);
    (r.sub ? [r.label, r.sub] : [r.label]).forEach((line, k) => {
      const t = svgEl('text', { x: x + bw / 2, y: h - padB + 16 + k * 12, class: 'axis-label', 'text-anchor': 'middle' });
      t.textContent = line;
      svg.appendChild(t);
    });
  });
  svg.appendChild(svgEl('line', { x1: padL, y1: padT + plotH, x2: w - 10, y2: padT + plotH, class: 'axis-line' }));

  const table = `<table><thead><tr><th>Band</th><th class="num">Households</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td>${esc(r.label)}${r.sub ? ' — ' + esc(r.sub) : ''}</td><td class="num">${r.value}</td></tr>`).join('') + '</tbody></table>';
  return withTable(container, svg, table, 'Distribution of households by band');
}

/* ------------------------------------------------------------- line (trend) */
export function lineChart(container, { points, yLabel = 'Score %', valueFormat = v => v + '%' }) {
  const w = 620, h = 210, padL = 40, padB = 34, padT = 14, padR = 12;
  const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, role: 'img' });
  if (!points.length) { container.innerHTML = '<p class="muted small">No data in this period.</p>'; return container; }
  const ys = points.map(p => p.value).filter(v => v !== null);
  const min = Math.max(0, Math.min(...ys) - 8), max = Math.min(100, Math.max(...ys) + 8);
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const X = i => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const Y = v => padT + plotH - ((v - min) / (max - min || 1)) * plotH;

  [0, 0.5, 1].forEach(t => {
    const val = min + t * (max - min), gy = Y(val);
    svg.appendChild(svgEl('line', { x1: padL, y1: gy, x2: w - padR, y2: gy, class: 'gridline' }));
    const lab = svgEl('text', { x: padL - 8, y: gy, class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'middle' });
    lab.textContent = Math.round(val);
    svg.appendChild(lab);
  });

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.value)}`).join(' ');
  svg.appendChild(svgEl('path', { d, fill: 'none', stroke: S1(), 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  points.forEach((p, i) => {
    const dot = svgEl('circle', { cx: X(i), cy: Y(p.value), r: 4.5, fill: S1(), stroke: CSS('--surface'), 'stroke-width': 2 });
    hoverable(dot, () => `<div class="t-title">${esc(p.label)}</div><div class="t-row"><span>${esc(yLabel)}</span><b>${valueFormat(p.value)}</b></div>` +
      (p.n !== undefined ? `<div class="t-row"><span>Surveys</span><b>${p.n}</b></div>` : ''));
    svg.appendChild(dot);
    if (i % Math.ceil(points.length / 8 || 1) === 0 || i === points.length - 1) {
      const t = svgEl('text', { x: X(i), y: h - padB + 16, class: 'axis-label', 'text-anchor': 'middle' });
      t.textContent = p.label;
      svg.appendChild(t);
    }
  });
  svg.appendChild(svgEl('line', { x1: padL, y1: padT + plotH, x2: w - padR, y2: padT + plotH, class: 'axis-line' }));

  const table = `<table><thead><tr><th>Month</th><th class="num">${esc(yLabel)}</th><th class="num">Surveys</th></tr></thead><tbody>` +
    points.map(p => `<tr><td>${esc(p.label)}</td><td class="num">${valueFormat(p.value)}</td><td class="num">${p.n ?? ''}</td></tr>`).join('') + '</tbody></table>';
  return withTable(container, svg, table, 'Trend over time');
}

/* ------------------------------------------------ village map (scatter on lat/lon) */
export function villageMap(container, { villages, onSelect }) {
  const w = 620, h = 300, pad = 34;
  const withGeo = villages.filter(v => v.lat && v.lon);
  if (!withGeo.length) { container.innerHTML = '<p class="muted small">No village coordinates yet.</p>'; return container; }
  const lats = withGeo.map(v => v.lat), lons = withGeo.map(v => v.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const X = lon => pad + ((lon - minLon) / ((maxLon - minLon) || 1)) * (w - pad * 2);
  const Y = lat => h - pad - ((lat - minLat) / ((maxLat - minLat) || 1)) * (h - pad * 2);
  const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, role: 'img' });

  const steps = ['--seq-100', '--seq-250', '--seq-350', '--seq-450', '--seq-550', '--seq-650'];
  const colorFor = pct => CSS(steps[Math.min(steps.length - 1, Math.max(0, Math.floor(((pct || 0) - 30) / 10)))]);

  withGeo.forEach(v => {
    const g = svgEl('g', {});
    const c = svgEl('circle', { cx: X(v.lon), cy: Y(v.lat), r: Math.max(7, Math.min(18, Math.sqrt(v.n || 1) * 2.2)),
      fill: colorFor(v.pct), stroke: CSS('--surface'), 'stroke-width': 2 });
    hoverable(c, () => `<div class="t-title">${esc(v.village)}</div>` +
      `<div class="t-row"><span>VWBI</span><b>${v.pct ? v.pct.toFixed(1) + '%' : '—'}</b></div>` +
      `<div class="t-row"><span>Band</span><b>${v.band || '—'}</b></div>` +
      `<div class="t-row"><span>Surveys</span><b>${v.n}</b></div>`);
    c.style.cursor = 'pointer';
    c.addEventListener('click', () => onSelect && onSelect(v));
    g.appendChild(c);
    const idx = withGeo.indexOf(v);
    const dy = idx % 2 === 0 ? -16 : 24;
    const t = svgEl('text', { x: X(v.lon), y: Y(v.lat) + dy, class: 'axis-label', 'text-anchor': 'middle' });
    t.textContent = v.village;
    g.appendChild(t);
    svg.appendChild(g);
  });

  const table = `<table><thead><tr><th>Village</th><th>District</th><th class="num">VWBI %</th><th class="num">Surveys</th></tr></thead><tbody>` +
    withGeo.map(v => `<tr><td>${esc(v.village)}</td><td>${esc(v.district)}</td><td class="num">${v.pct ?? '—'}</td><td class="num">${v.n}</td></tr>`).join('') + '</tbody></table>';
  const el = withTable(container, svg, table, 'Village map coloured by well-being score');
  const l = document.createElement('div');
  l.className = 'legend';
  l.innerHTML = '<span class="key muted">Lower</span>' +
    steps.map(s => `<span class="swatch" style="background:${CSS(s)}"></span>`).join('') +
    '<span class="key muted">Higher · circle size = surveys</span>';
  el.insertBefore(l, el.lastChild);
  return el;
}

export { fmtPct, esc };
