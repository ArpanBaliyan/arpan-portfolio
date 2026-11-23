// charts.js — small hand-drawn SVG charts, no libraries.
var CH = (function () {
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, text) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; }
  function svg(w, h, label) { return el('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', role: 'img', 'aria-label': label }); }
  function money(x) { return x >= 1000 ? '$' + (x / 1000).toFixed(x >= 10000 ? 0 : 1).replace('.0', '') + 'K' : '$' + Math.round(x); }

  // Limit on file vs need, log-log, with the right-sized band
  function scatter(fig, pts, colorOf, label) {
    var W = 900, H = 460, l = 70, r = 20, t = 20, b = 56, lo = 100, hi = 120000;
    var s = svg(W, H, label), lx = function (v) { return l + (Math.log10(Math.max(lo, Math.min(hi, v))) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * (W - l - r); },
      ly = function (v) { return H - b - (Math.log10(Math.max(lo, Math.min(hi, v))) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * (H - t - b); };
    var ticks = [100, 300, 1000, 3000, 10000, 30000, 100000];
    ticks.forEach(function (v) { s.appendChild(el('line', { x1: lx(v), x2: lx(v), y1: t, y2: H - b, stroke: '#E2E8E3' })); s.appendChild(el('line', { x1: l, x2: W - r, y1: ly(v), y2: ly(v), stroke: '#E2E8E3' }));
      s.appendChild(el('text', { x: lx(v), y: H - b + 18, 'text-anchor': 'middle', 'font-size': 12 }, money(v))); s.appendChild(el('text', { x: l - 8, y: ly(v) + 4, 'text-anchor': 'end', 'font-size': 12 }, money(v))); });
    // right-sized band: limit between 2/3 and 1.5x of need
    var band = []; for (var i = 0; i <= 40; i++) { var v = lo * Math.pow(hi / lo, i / 40); band.push(lx(v) + ',' + ly(v * 1.5)); }
    for (i = 40; i >= 0; i--) { v = lo * Math.pow(hi / lo, i / 40); band.push(lx(v) + ',' + ly(v / 1.5)); }
    s.appendChild(el('polygon', { points: band.join(' '), fill: '#2457A6', 'fill-opacity': 0.08, stroke: '#2457A6', 'stroke-opacity': 0.25 }));
    s.appendChild(el('line', { x1: lx(lo), y1: ly(lo), x2: lx(hi), y2: ly(hi), stroke: '#2457A6', 'stroke-dasharray': '4 4', 'stroke-opacity': 0.6 }));
    pts.forEach(function (p) { var c = el('circle', { cx: lx(p[0]), cy: ly(p[1]), r: 4, fill: colorOf(p[3]), 'fill-opacity': 0.75, stroke: '#fff', 'stroke-width': 0.6 }); c.appendChild(el('title', {}, 'Needs ' + money(p[0]) + ' · limit ' + money(p[1]) + ' · tier ' + p[2] + ' · ' + p[3].toLowerCase())); s.appendChild(c); });
    s.appendChild(el('text', { x: (l + W - r) / 2, y: H - 14, 'text-anchor': 'middle', 'font-size': 13 }, 'What one buying cycle needs (best of 3- and 6-month average × terms + 15 days)'));
    var yl = el('text', { x: 16, y: (t + H - b) / 2, 'text-anchor': 'middle', 'font-size': 13, transform: 'rotate(-90 16 ' + (t + H - b) / 2 + ')' }, 'Limit on file'); s.appendChild(yl);
    fig.appendChild(s);
  }

  // Horizontal bars with a label column
  function bars(fig, rows, opts) {
    var W = 900, rowH = 30, l = opts.labelWidth || 300, r = 120, H = rows.length * rowH + 16, max = Math.max.apply(null, rows.map(function (x) { return x.v; }));
    var s = svg(W, H, opts.label);
    rows.forEach(function (x, i) { var y = 8 + i * rowH, w = (W - l - r) * x.v / max;
      s.appendChild(el('text', { x: l - 10, y: y + 19, 'text-anchor': 'end', 'font-size': 13, fill: '#16233F' }, x.name));
      s.appendChild(el('rect', { x: l, y: y + 6, width: Math.max(1, w), height: 18, fill: x.color }));
      s.appendChild(el('text', { x: l + w + 8, y: y + 19, 'font-size': 13 }, x.text)); });
    fig.appendChild(s);
  }

  // Workload before / after as a share of each agent's target
  function alloc(fig, rows, label) {
    var W = 900, rowH = 46, l = 170, r = 70, H = rows.length * rowH + 40, max = Math.max(2, Math.max.apply(null, rows.map(function (x) { return x.before / x.target; })) * 1.05);
    var s = svg(W, H, label), x = function (v) { return l + (W - l - r) * v / max; };
    [0, 0.5, 1, 1.5, 2].filter(function (v) { return v <= max; }).forEach(function (v) { s.appendChild(el('line', { x1: x(v), x2: x(v), y1: 6, y2: H - 28, stroke: v === 1 ? '#16233F' : '#E2E8E3', 'stroke-dasharray': v === 1 ? '4 3' : '' })); s.appendChild(el('text', { x: x(v), y: H - 10, 'text-anchor': 'middle', 'font-size': 12 }, Math.round(v * 100) + '%')); });
    rows.forEach(function (a, i) { var y = 10 + i * rowH, b0 = a.before / a.target, b1 = a.after / a.target;
      s.appendChild(el('text', { x: l - 10, y: y + 22, 'text-anchor': 'end', 'font-size': 13, fill: '#16233F' }, a.agent));
      s.appendChild(el('rect', { x: l, y: y + 4, width: Math.max(1, x(b0) - l), height: 12, fill: '#C8D2CA' }));
      s.appendChild(el('rect', { x: l, y: y + 20, width: Math.max(1, x(b1) - l), height: 12, fill: '#16233F' }));
      s.appendChild(el('text', { x: x(Math.max(b0, b1)) + 8, y: y + 22, 'font-size': 12 }, Math.round(b0 * 100) + '% → ' + Math.round(b1 * 100) + '%')); });
    fig.appendChild(s);
  }

  // Monthly line with labelled first and last points
  function line(fig, pts, opts) {
    var W = 900, H = 320, l = 60, r = 30, t = 24, b = 44, max = opts.max || Math.max.apply(null, pts.map(function (p) { return p.v; })) * 1.1;
    var s = svg(W, H, opts.label), x = function (i) { return l + i * (W - l - r) / (pts.length - 1); }, y = function (v) { return H - b - v / max * (H - t - b); };
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) { var v = max * f; s.appendChild(el('line', { x1: l, x2: W - r, y1: y(v), y2: y(v), stroke: '#E2E8E3' })); s.appendChild(el('text', { x: l - 8, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 12 }, opts.fmt(v))); });
    pts.forEach(function (p, i) { if (i % 3 === 0 || i === pts.length - 1) s.appendChild(el('text', { x: x(i), y: H - b + 18, 'text-anchor': i === pts.length - 1 ? 'end' : 'middle', 'font-size': 12 }, p.m)); });
    s.appendChild(el('polyline', { points: pts.map(function (p, i) { return x(i) + ',' + y(p.v); }).join(' '), fill: 'none', stroke: '#16233F', 'stroke-width': 2.5 }));
    [0, pts.length - 1].forEach(function (i) { s.appendChild(el('circle', { cx: x(i), cy: y(pts[i].v), r: 5, fill: i ? '#2E7048' : '#A8382B' })); s.appendChild(el('text', { x: x(i) + (i ? -10 : 10), y: y(pts[i].v) - 12, 'text-anchor': i ? 'end' : 'start', 'font-size': 14, fill: '#16233F', 'font-weight': 600 }, opts.fmt(pts[i].v))); });
    if (opts.marker !== undefined) { var mx = x(opts.marker); s.appendChild(el('line', { x1: mx, x2: mx, y1: t, y2: H - b, stroke: '#F3D54E', 'stroke-width': 3 })); s.appendChild(el('text', { x: mx + 6, y: t + 12, 'font-size': 12 }, opts.markerText)); }
    fig.appendChild(s);
  }
  return { scatter: scatter, bars: bars, alloc: alloc, line: line, money: money };
})();
