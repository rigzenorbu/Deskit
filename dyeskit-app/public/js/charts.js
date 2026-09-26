/* DYESKIT chart layer — hand-built SVG, no dependencies.
   Rules kept: thin marks, rounded data-ends, recessive grid, a legend whenever two
   series are drawn, a hover tooltip on every mark, a table view for every chart, and
   colours only from the validated palette (blue / orange + the blue sequential ramp). */

const CSS = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const S1 = () => CSS('--series-1');
const S2 = () => CSS('--series-2');
const fmtPct = v => (v === null || v === undefined ? '—' : (v * 100).toFixed(0) + '%');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let uid = 0;
const nextId = p => `${p}-${++uid}`;

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
document.addEventListener('pointerdown', e => { if (!e.target.closest('svg.chart')) hideTip(); });

/** Works for mouse and for touch: tapping a mark shows its tooltip. */
function hoverable(el, htmlFn) {
  el.addEventListener('mousemove', e => tip(htmlFn(), e));
  el.addEventListener('mouseleave', hideTip);
  el.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') tip(htmlFn(), e); });
  el.classList.add('mark');
}

const svgEl = (name, attrs = {}) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, v);
  return e;
};

/** A gradient from a colour to a softer version of itself. */
function gradient(svg, id, color, horizontal = true) {
  let defs = svg.querySelector('defs');
  if (!defs) { defs = svgEl('defs'); svg.insertBefore(defs, svg.firstChild); }
  const g = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: horizontal ? 1 : 0, y2: horizontal ? 0 : 1 });
  g.appendChild(svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.95 }));
  g.appendChild(svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0.6 }));
  defs.appendChild(g);
  return `url(#${id})`;
}

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

/* ------------------------------------------------- ring gauge (hero number) */
export function ringGauge(container, { value, caption, size = 128 }) {
  const stroke = 11, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const svg = svgEl('svg', { class: 'chart gauge', viewBox: `0 0 ${size} ${size}`, role: 'img' });
  const gid = nextId('gauge');
  const defs = svgEl('defs');
  const lg = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 1, y2: 1 });
  lg.appendChild(svgEl('stop', { offset: '0%', 'stop-color': CSS('--brand') }));
  lg.appendChild(svgEl('stop', { offset: '100%', 'stop-color': S1() }));
  defs.appendChild(lg);
  svg.appendChild(defs);

  svg.appendChild(svgEl('circle', { cx: size / 2, cy: size / 2, r, fill: 'none',
    stroke: CSS('--surface-2'), 'stroke-width': stroke }));
  const pctOf = Math.max(0, Math.min(1, value || 0));
  const arc = svgEl('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: `url(#${gid})`,
    'stroke-width': stroke, 'stroke-linecap': 'round',
    'stroke-dasharray': `${(c * pctOf).toFixed(2)} ${c.toFixed(2)}`,
    transform: `rotate(-90 ${size / 2} ${size / 2})` });
  arc.classList.add('gauge-arc');
  svg.appendChild(arc);

  const big = svgEl('text', { x: size / 2, y: size / 2 + 2, 'text-anchor': 'middle', class: 'gauge-value' });
  big.textContent = value === null || value === undefined ? '—' : (value * 100).toFixed(1) + '%';
  svg.appendChild(big);
  if (caption) {
    const t = svgEl('text', { x: size / 2, y: size / 2 + 22, 'text-anchor': 'middle', class: 'gauge-caption' });
    t.textContent = caption;
    svg.appendChild(t);
  }
  container.innerHTML = '';
  container.appendChild(svg);
  return container;
}

/* ------------------------------------------------------------ radar */
export function radarChart(container, { series, axes, max = 1, axisColors = null }) {
  const size = 380, cx = size / 2, cy = size / 2 + 4, r = 104;
  // viewBox trimmed to the drawing plus its labels, so the card has no dead space
  const svg = svgEl('svg', { class: 'chart', viewBox: `2 30 ${size - 4} ${size - 38}`, role: 'img' });
  const n = axes.length;
  const pt = (i, val) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    const rad = (val / max) * r;
    return [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
  };

  svg.appendChild(svgEl('polygon', { points: axes.map((_, i) => pt(i, max).join(',')).join(' '),
    fill: CSS('--surface-2'), 'fill-opacity': 0.6 }));
  [0.25, 0.5, 0.75, 1].forEach((ring, idx) => {
    svg.appendChild(svgEl('polygon', { points: axes.map((_, i) => pt(i, ring * max).join(',')).join(' '),
      fill: 'none', stroke: CSS('--grid'), 'stroke-width': idx === 3 ? 1.4 : 1,
      'stroke-dasharray': idx === 3 ? null : '3 4' }));
  });
  axes.forEach((a, i) => {
    const [x, y] = pt(i, max);
    svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: CSS('--grid'), 'stroke-width': 1 }));
    // a small marker in the dimension's own colour sits on the outer ring, so each
    // axis is identifiable by colour as well as by its label
    if (axisColors && axisColors[i]) {
      const [mx, my] = pt(i, max * 1.09);
      svg.appendChild(svgEl('circle', { cx: mx, cy: my, r: 4.5, fill: axisColors[i],
        stroke: CSS('--surface'), 'stroke-width': 2 }));
    }
    const [lx, ly] = pt(i, max * 1.3);
    const t = svgEl('text', { x: lx, y: ly, class: 'axis-label strong',
      'text-anchor': lx > cx + 4 ? 'start' : lx < cx - 4 ? 'end' : 'middle', 'dominant-baseline': 'middle' });
    t.textContent = a.label;
    svg.appendChild(t);
  });

  series.forEach((s, si) => {
    const color = si === 0 ? S1() : S2();
    const pts = axes.map((a, i) => pt(i, s.values[i] === null ? 0 : s.values[i]));
    const poly = svgEl('polygon', {
      points: pts.map(p => p.join(',')).join(' '),
      fill: si === 0 ? gradient(svg, nextId('radar'), color, false) : 'none',
      'fill-opacity': si === 0 ? 0.32 : 0,
      stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round',
      'stroke-dasharray': si === 1 ? '6 5' : null,
    });
    poly.classList.add('radar-shape');
    svg.appendChild(poly);
    pts.forEach((p, i) => {
      const dot = svgEl('circle', { cx: p[0], cy: p[1], r: 5, fill: color,
        stroke: CSS('--surface'), 'stroke-width': 2.5 });
      hoverable(dot, () => `<div class="t-title">${esc(axes[i].label)}</div>` +
        series.map(ss => `<div class="t-row"><span>${esc(ss.label)}</span><b>${fmtPct(ss.values[i])}</b></div>`).join(''));
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

/* --------------------------------------------------- horizontal bars */
export function barsH(container, { rows, max = 1, valueFormat = fmtPct, color, showValue = true,
  reference = null, height = 22, width = 620, labelWidth = 150 }) {
  const labelW = labelWidth, valueW = 54, w = width, gap = 9;
  const h = rows.length * (height + gap) + 26;
  const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, role: 'img', preserveAspectRatio: 'xMinYMin meet' });
  const plotW = w - labelW - valueW;
  const x = v => (Math.max(0, Math.min(v, max)) / max) * plotW;

  [0, 0.25, 0.5, 0.75, 1].forEach(t => {
    const gx = labelW + t * plotW;
    svg.appendChild(svgEl('line', { x1: gx, y1: 8, x2: gx, y2: h - 20, stroke: CSS('--grid'),
      'stroke-width': 1, 'stroke-dasharray': t ? '3 5' : null }));
    const lab = svgEl('text', { x: gx, y: h - 5, class: 'axis-label', 'text-anchor': 'middle' });
    lab.textContent = valueFormat(t * max);
    svg.appendChild(lab);
  });

  rows.forEach((r, i) => {
    const y = 10 + i * (height + gap);
    const label = svgEl('text', { x: labelW - 12, y: y + height / 2, class: 'axis-label',
      'text-anchor': 'end', 'dominant-baseline': 'middle' });
    label.textContent = r.label;
    svg.appendChild(label);

    // faint rail showing the full scale behind each bar
    svg.appendChild(svgEl('rect', { x: labelW, y, width: plotW, height, rx: height / 2,
      fill: CSS('--surface-2'), 'fill-opacity': 0.8 }));

    const barColor = r.color || color || S1();
    const bw = Math.max(height, x(r.value));
    const bar = svgEl('rect', { x: labelW, y, width: bw, height, rx: height / 2,
      fill: r.color ? barColor : gradient(svg, nextId('bar'), barColor) });
    bar.classList.add('bar-grow');
    bar.style.setProperty('--delay', `${i * 40}ms`);
    hoverable(bar, () => `<div class="t-title">${esc(r.label)}</div><div class="t-row"><span>${esc(r.metric || 'Score')}</span><b>${valueFormat(r.value)}</b></div>` +
      (r.note ? `<div class="t-row"><span>${esc(r.note)}</span></div>` : ''));
    svg.appendChild(bar);

    if (showValue) {
      // values align in their own column at the right, so they never sit on the rail
      const v = svgEl('text', { x: w - 6, y: y + height / 2, class: 'value-label strong',
        'text-anchor': 'end', 'dominant-baseline': 'middle' });
      v.textContent = valueFormat(r.value);
      svg.appendChild(v);
    }
  });

  if (reference !== null && reference !== undefined) {
    const rx = labelW + x(reference);
    svg.appendChild(svgEl('line', { x1: rx, y1: 4, x2: rx, y2: h - 20, stroke: CSS('--ink-2'),
      'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    const t = svgEl('text', { x: rx + 5, y: 9, class: 'axis-label' });
    t.textContent = 'average';
    svg.appendChild(t);
  }

  const table = `<table><thead><tr><th>Item</th><th class="num">Value</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${valueFormat(r.value)}</td></tr>`).join('') + '</tbody></table>';
  return withTable(container, svg, table, 'Ranked bar chart');
}

/* --------------------------------------------- vertical ordinal bars */
export function barsV(container, { rows, valueFormat = v => v, ramp = true }) {
  const w = 620, h = 214, padL = 34, padB = 46, padT = 18;
  const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, role: 'img' });
  const max = Math.max(1, ...rows.map(r => r.value));
  const plotH = h - padB - padT, plotW = w - padL - 10;
  const bw = Math.min(54, (plotW / rows.length) - 12);
  const steps = ['--seq-100', '--seq-250', '--seq-350', '--seq-450', '--seq-450', '--seq-550', '--seq-650'];

  [0, 0.5, 1].forEach(t => {
    const gy = padT + plotH - t * plotH;
    svg.appendChild(svgEl('line', { x1: padL, y1: gy, x2: w - 10, y2: gy, stroke: CSS('--grid'),
      'stroke-width': 1, 'stroke-dasharray': t ? '3 5' : null }));
    const lab = svgEl('text', { x: padL - 8, y: gy, class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'middle' });
    lab.textContent = Math.round(t * max);
    svg.appendChild(lab);
  });

  rows.forEach((r, i) => {
    const x = padL + (i + 0.5) * (plotW / rows.length) - bw / 2;
    const bh = Math.max(r.value > 0 ? 4 : 0, (r.value / max) * plotH);
    const y = padT + plotH - bh;
    const fill = r.color || (ramp ? CSS(steps[Math.min(i, steps.length - 1)]) : S1());
    const rad = Math.min(7, bw / 2, bh);
    // rounded top, square base, so the bar sits on the axis instead of floating
    const bar = svgEl('path', {
      d: `M${x},${y + bh} L${x},${y + rad} Q${x},${y} ${x + rad},${y} L${x + bw - rad},${y} Q${x + bw},${y} ${x + bw},${y + rad} L${x + bw},${y + bh} Z`,
      fill,
    });
    bar.classList.add('bar-rise');
    bar.style.setProperty('--delay', `${i * 45}ms`);
    hoverable(bar, () => `<div class="t-title">${esc(r.label)}</div><div class="t-row"><span>${esc(r.metric || 'Households')}</span><b>${valueFormat(r.value)}</b></div>`);
    svg.appendChild(bar);

    const cap = svgEl('text', { x: x + bw / 2, y: y - 6, class: 'value-label strong', 'text-anchor': 'middle' });
    cap.textContent = r.value ? valueFormat(r.value) : '';
    svg.appendChild(cap);
    (r.sub ? [r.label, r.sub] : [r.label]).forEach((line, k) => {
      const t = svgEl('text', { x: x + bw / 2, y: h - padB + 16 + k * 12, class: 'axis-label', 'text-anchor': 'middle' });
      t.textContent = line;
      svg.appendChild(t);
    });
  });
  svg.appendChild(svgEl('line', { x1: padL, y1: padT + plotH, x2: w - 10, y2: padT + plotH, stroke: CSS('--axis'), 'stroke-width': 1 }));

  const table = `<table><thead><tr><th>Band</th><th class="num">Households</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td>${esc(r.label)}${r.sub ? ' — ' + esc(r.sub) : ''}</td><td class="num">${r.value}</td></tr>`).join('') + '</tbody></table>';
  return withTable(container, svg, table, 'Distribution of households by band');
}

/* ------------------------------------------------------------- line */
export function lineChart(container, { points, yLabel = 'Score %', valueFormat = v => v + '%' }) {
  const w = 620, h = 214, padL = 40, padB = 34, padT = 18, padR = 14;
  const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, role: 'img' });
  if (!points.length) { container.innerHTML = '<p class="muted small">No data in this period.</p>'; return container; }
  const ys = points.map(p => p.value).filter(v => v !== null);
  const min = Math.max(0, Math.min(...ys) - 8), max = Math.min(100, Math.max(...ys) + 8);
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const X = i => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const Y = v => padT + plotH - ((v - min) / (max - min || 1)) * plotH;

  [0, 0.5, 1].forEach(t => {
    const val = min + t * (max - min), gy = Y(val);
    svg.appendChild(svgEl('line', { x1: padL, y1: gy, x2: w - padR, y2: gy, stroke: CSS('--grid'),
      'stroke-width': 1, 'stroke-dasharray': t === 0 ? null : '3 5' }));
    const lab = svgEl('text', { x: padL - 8, y: gy, class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'middle' });
    lab.textContent = Math.round(val);
    svg.appendChild(lab);
  });

  // smooth curve: horizontal control points at the midpoint of each span
  const path = points.map((p, i) => {
    const x = X(i), y = Y(p.value);
    if (!i) return `M${x},${y}`;
    const px = X(i - 1), py = Y(points[i - 1].value), mx = (px + x) / 2;
    return `C${mx},${py} ${mx},${y} ${x},${y}`;
  }).join(' ');

  const areaId = nextId('area');
  const defs = svgEl('defs');
  const lg = svgEl('linearGradient', { id: areaId, x1: 0, y1: 0, x2: 0, y2: 1 });
  lg.appendChild(svgEl('stop', { offset: '0%', 'stop-color': S1(), 'stop-opacity': 0.3 }));
  lg.appendChild(svgEl('stop', { offset: '100%', 'stop-color': S1(), 'stop-opacity': 0 }));
  defs.appendChild(lg);
  svg.appendChild(defs);
  svg.appendChild(svgEl('path', { d: `${path} L${X(points.length - 1)},${padT + plotH} L${padL},${padT + plotH} Z`, fill: `url(#${areaId})` }));

  const line = svgEl('path', { d: path, fill: 'none', stroke: S1(), 'stroke-width': 2.5,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  svg.appendChild(line);

  points.forEach((p, i) => {
    const last = i === points.length - 1;
    const dot = svgEl('circle', { cx: X(i), cy: Y(p.value), r: last ? 6 : 4.5,
      fill: last ? S1() : CSS('--surface'), stroke: S1(), 'stroke-width': 2.5 });
    hoverable(dot, () => `<div class="t-title">${esc(p.label)}</div><div class="t-row"><span>${esc(yLabel)}</span><b>${valueFormat(p.value)}</b></div>` +
      (p.n !== undefined ? `<div class="t-row"><span>Surveys</span><b>${p.n}</b></div>` : ''));
    svg.appendChild(dot);
    if (i % Math.ceil(points.length / 7 || 1) === 0 || last) {
      const t = svgEl('text', { x: X(i), y: h - padB + 16, class: 'axis-label', 'text-anchor': 'middle' });
      t.textContent = p.label;
      svg.appendChild(t);
    }
  });

  const table = `<table><thead><tr><th>Month</th><th class="num">${esc(yLabel)}</th><th class="num">Surveys</th></tr></thead><tbody>` +
    points.map(p => `<tr><td>${esc(p.label)}</td><td class="num">${valueFormat(p.value)}</td><td class="num">${p.n ?? ''}</td></tr>`).join('') + '</tbody></table>';
  return withTable(container, svg, table, 'Trend over time');
}

/* --------------------------------------------------------- village map */
export function villageMap(container, { villages, onSelect }) {
  const w = 620, h = 320, pad = 42;
  const withGeo = villages.filter(v => v.lat && v.lon);
  if (!withGeo.length) { container.innerHTML = '<p class="muted small">No village coordinates yet.</p>'; return container; }
  const lats = withGeo.map(v => v.lat), lons = withGeo.map(v => v.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const X = lon => pad + ((lon - minLon) / ((maxLon - minLon) || 1)) * (w - pad * 2);
  const Y = lat => h - pad - ((lat - minLat) / ((maxLat - minLat) || 1)) * (h - pad * 2);
  const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, role: 'img' });

  // faint graticule so the scatter reads as a map rather than a plot
  for (let i = 1; i < 4; i++) {
    svg.appendChild(svgEl('line', { x1: pad, y1: pad + (i * (h - pad * 2)) / 4, x2: w - pad, y2: pad + (i * (h - pad * 2)) / 4,
      stroke: CSS('--grid'), 'stroke-width': 1, 'stroke-dasharray': '2 7' }));
    svg.appendChild(svgEl('line', { x1: pad + (i * (w - pad * 2)) / 4, y1: pad, x2: pad + (i * (w - pad * 2)) / 4, y2: h - pad,
      stroke: CSS('--grid'), 'stroke-width': 1, 'stroke-dasharray': '2 7' }));
  }

  const steps = ['--seq-100', '--seq-250', '--seq-350', '--seq-450', '--seq-550', '--seq-650'];
  const colorFor = pct => CSS(steps[Math.min(steps.length - 1, Math.max(0, Math.floor(((pct || 0) - 30) / 10)))]);

  withGeo.forEach((v, idx) => {
    const cx = X(v.lon), cy = Y(v.lat), rad = Math.max(8, Math.min(20, Math.sqrt(v.n || 1) * 2.3));
    const g = svgEl('g', {});
    g.appendChild(svgEl('circle', { cx, cy, r: rad + 6, fill: colorFor(v.pct), 'fill-opacity': 0.16 }));
    const c = svgEl('circle', { cx, cy, r: rad, fill: colorFor(v.pct), stroke: CSS('--surface'), 'stroke-width': 2.5 });
    c.classList.add('map-dot');
    c.style.setProperty('--delay', `${idx * 35}ms`);
    hoverable(c, () => `<div class="t-title">${esc(v.village)}</div>` +
      `<div class="t-row"><span>Index</span><b>${v.pct ? v.pct.toFixed(1) + '%' : '—'}</b></div>` +
      `<div class="t-row"><span>Band</span><b>${v.band || '—'}</b></div>` +
      `<div class="t-row"><span>Surveys</span><b>${v.n}</b></div>`);
    c.style.cursor = 'pointer';
    c.addEventListener('click', () => onSelect && onSelect(v));
    g.appendChild(c);
    const t = svgEl('text', { x: cx, y: cy + (idx % 2 === 0 ? -rad - 9 : rad + 17),
      class: 'axis-label strong halo', 'text-anchor': 'middle' });
    t.textContent = v.village;
    g.appendChild(t);
    svg.appendChild(g);
  });

  const table = `<table><thead><tr><th>Village</th><th>District</th><th class="num">Index %</th><th class="num">Surveys</th></tr></thead><tbody>` +
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
