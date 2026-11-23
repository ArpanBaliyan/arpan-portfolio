/*
 * Small SVG chart helpers. No libraries, so the page works offline.
 */
(function (root) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  // ---------------------------------------------------------------- tooltip
  var tipEl = null;
  function tip() {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tooltip"; tipEl.setAttribute("role", "status"); document.body.appendChild(tipEl); }
    return tipEl;
  }
  function showTip(html, x, y) {
    var t = tip(); t.innerHTML = html; t.classList.add("on");
    var w = t.offsetWidth, h = t.offsetHeight;
    var left = x + 14, top = y + 14;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top + h > window.innerHeight - 8) top = y - h - 14;
    t.style.left = Math.max(8, left) + "px"; t.style.top = Math.max(8, top) + "px";
  }
  function hideTip() { if (tipEl) tipEl.classList.remove("on"); }

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, str, attrs) {
    var t = el("text", Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = str; return t;
  }
  function svgFor(container, height) {
    container.innerHTML = "";
    var w = Math.max(280, container.clientWidth || 600);
    var svg = el("svg", { viewBox: "0 0 " + w + " " + height, width: w, height: height, role: "img" }, null);
    container.appendChild(svg);
    return { svg: svg, w: w, h: height };
  }
  function niceTicks(max, count) {
    if (max <= 0) return [0];
    var raw = max / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).find(function (s) { return s >= raw; });
    var out = []; for (var v = 0; v <= max + step * 0.001; v += step) out.push(v);
    if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
    return out;
  }
  function kfmt(v) { return v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : v >= 1000 ? "$" + Math.round(v / 1000) + "K" : "$" + Math.round(v); }
  function rounded(x, y, w, h, r) {   // bar with rounded top only, anchored to the baseline
    r = Math.min(r, w / 2, h);
    return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y +
      "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
  }

  // ---------------------------------------------------------------- limit map
  /*
   * Each dot is one account. Across: the limit it needs. Up: the limit on file.
   * Dots on the diagonal are right-sized; the shaded band is the tolerance.
   */
  function limitMap(container, points, opts) {
    opts = opts || {};
    var H = opts.height || 430;
    var c = svgFor(container, H);
    var m = { l: 62, r: 16, t: 14, b: 46 };
    var iw = c.w - m.l - m.r, ih = H - m.t - m.b;
    var lo = 250, hi = 100000;
    function lx(v) { return m.l + (Math.log10(Math.max(lo, Math.min(hi, v))) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * iw; }
    function ly(v) { return m.t + ih - (Math.log10(Math.max(lo, Math.min(hi, v))) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * ih; }
    c.svg.setAttribute("aria-label", "Scatter plot of credit limit on file against the limit each account needs");
    var g = el("g", { class: "grid" }, c.svg);
    var ticks = [250, 1000, 2500, 10000, 25000, 100000];
    ticks.forEach(function (t) {
      el("line", { x1: lx(t), x2: lx(t), y1: m.t, y2: m.t + ih }, g);
      el("line", { x1: m.l, x2: m.l + iw, y1: ly(t), y2: ly(t) }, g);
      text(c.svg, lx(t), m.t + ih + 18, kfmt(t), { "text-anchor": "middle", class: "axis" });
      text(c.svg, m.l - 8, ly(t) + 4, kfmt(t), { "text-anchor": "end", class: "axis" });
    });
    // tolerance band 0.67x to 1.5x
    var band = [[lo, lo * 0.67], [hi, hi * 0.67], [hi, hi * 1.5], [lo, lo * 1.5]];
    el("path", { d: "M" + band.map(function (p) { return lx(p[0]) + "," + ly(p[1]); }).join("L") + "Z", fill: "var(--accent-soft)", opacity: 0.8 }, c.svg);
    el("line", { x1: lx(lo), y1: ly(lo), x2: lx(hi), y2: ly(hi), stroke: "var(--accent)", "stroke-width": 1.5, "stroke-dasharray": "5 4" }, c.svg);
    text(c.svg, lx(60000), ly(60000 * 1.5) + 2, "Right-sized", { "text-anchor": "end", class: "axis", fill: "var(--accent-ink)", transform: "rotate(" + (-Math.atan2(ih, iw) * 180 / Math.PI) + " " + lx(60000) + " " + ly(60000 * 1.5) + ")" });
    text(c.svg, lx(400), m.t + 16, "Limit far above need", { class: "axis" });
    text(c.svg, m.l + iw - 4, m.t + ih - 10, "Buying far beyond the limit", { class: "axis", "text-anchor": "end" });
    text(c.svg, m.l + iw / 2, H - 6, "Limit the account needs (from how it buys and pays)", { "text-anchor": "middle", class: "axis" });
    var yl = text(c.svg, 14, m.t + ih / 2, "Limit on file", { "text-anchor": "middle", class: "axis", transform: "rotate(-90 14 " + (m.t + ih / 2) + ")" });
    var order = { Low: 0, Watch: 1, High: 2, Severe: 3 };
    points.slice().sort(function (a, b) { return order[a.band] - order[b.band]; }).forEach(function (p) {
      var dot = el("circle", { cx: lx(p.x), cy: ly(p.y), r: 4.5, fill: "var(--" + p.band.toLowerCase() + ")", stroke: "var(--surface)", "stroke-width": 1.5, tabindex: -1 }, c.svg);
      var hit = el("circle", { cx: lx(p.x), cy: ly(p.y), r: 9, fill: "transparent", style: "cursor:pointer" }, c.svg);
      hit.addEventListener("mousemove", function (e) { dot.setAttribute("r", 6.5); showTip(p.tip, e.clientX, e.clientY); });
      hit.addEventListener("mouseleave", function () { dot.setAttribute("r", 4.5); hideTip(); });
      if (opts.onClick) hit.addEventListener("click", function () { hideTip(); opts.onClick(p); });
    });
  }

  // ---------------------------------------------------------------- stacked weekly bars
  function stackedBars(container, labels, series, opts) {
    opts = opts || {};
    var H = opts.height || 280;
    var c = svgFor(container, H);
    var m = { l: 56, r: 10, t: 12, b: 34 };
    var iw = c.w - m.l - m.r, ih = H - m.t - m.b;
    var totals = labels.map(function (_, i) { return series.reduce(function (t, s) { return t + s.values[i]; }, 0); });
    var ticks = niceTicks(Math.max.apply(null, totals), 4);
    var max = ticks[ticks.length - 1];
    var y = function (v) { return m.t + ih - v / max * ih; };
    var g = el("g", { class: "grid" }, c.svg);
    ticks.forEach(function (t) { el("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t) }, g); text(c.svg, m.l - 8, y(t) + 4, kfmt(t), { "text-anchor": "end", class: "axis" }); });
    var slot = iw / labels.length, bw = Math.max(6, Math.min(34, slot * 0.62));
    labels.forEach(function (lab, i) {
      var x = m.l + slot * i + (slot - bw) / 2, acc = 0;
      series.forEach(function (s, k) {
        var v = s.values[i]; if (v <= 0) return;
        var top = y(acc + v), bottom = y(acc);
        var h = bottom - top - (acc > 0 ? 2 : 0);   // 2px gap between segments
        if (h > 0) {
          if (k === series.length - 1 || series.slice(k + 1).every(function (z) { return z.values[i] <= 0; })) el("path", { d: rounded(x, top, bw, h, 3), fill: s.color }, c.svg);
          else el("rect", { x: x, y: top, width: bw, height: h, fill: s.color }, c.svg);
        }
        acc += v;
      });
      if (i % (labels.length > 8 ? 2 : 1) === 0 || c.w > 700) text(c.svg, x + bw / 2, H - 12, lab.short, { "text-anchor": "middle", class: "axis" });
      var hit = el("rect", { x: m.l + slot * i, y: m.t, width: slot, height: ih, fill: "transparent" }, c.svg);
      hit.addEventListener("mousemove", function (e) {
        var rows = series.map(function (s) { return '<div class="row"><span class="k">' + s.name + "</span><span>" + kfmt(s.values[i]) + "</span></div>"; }).join("");
        showTip("<b>" + lab.long + "</b>" + rows + '<div class="row"><span class="k">Total</span><b>' + kfmt(totals[i]) + "</b></div>", e.clientX, e.clientY);
      });
      hit.addEventListener("mouseleave", hideTip);
    });
    el("line", { class: "baseline", x1: m.l, x2: m.l + iw, y1: y(0), y2: y(0) }, c.svg);
  }

  // ---------------------------------------------------------------- lines with crosshair
  function lines(container, labels, series, opts) {
    opts = opts || {};
    var H = opts.height || 260;
    var c = svgFor(container, H);
    var m = { l: 56, r: 14, t: 12, b: 34 };
    var iw = c.w - m.l - m.r, ih = H - m.t - m.b;
    var all = [];
    series.forEach(function (s) { all = all.concat(s.values); });
    var ticks = niceTicks(Math.max.apply(null, all), 4), max = ticks[ticks.length - 1];
    var x = function (i) { return m.l + (labels.length === 1 ? iw / 2 : i / (labels.length - 1) * iw); };
    var y = function (v) { return m.t + ih - v / max * ih; };
    var g = el("g", { class: "grid" }, c.svg);
    ticks.forEach(function (t) { el("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t) }, g); text(c.svg, m.l - 8, y(t) + 4, (opts.fmt || kfmt)(t), { "text-anchor": "end", class: "axis" }); });
    labels.forEach(function (lab, i) { if (i % 2 === 0 || c.w > 700) text(c.svg, x(i), H - 12, lab.short, { "text-anchor": "middle", class: "axis" }); });
    el("line", { class: "baseline", x1: m.l, x2: m.l + iw, y1: y(0), y2: y(0) }, c.svg);
    series.forEach(function (s) {
      el("path", { d: s.values.map(function (v, i) { return (i ? "L" : "M") + x(i) + "," + y(v); }).join(""), fill: "none", stroke: s.color, "stroke-width": 2, "stroke-dasharray": s.dash || null, "stroke-linejoin": "round" }, c.svg);
      s.values.forEach(function (v, i) { el("circle", { cx: x(i), cy: y(v), r: 3.5, fill: s.color, stroke: "var(--surface)", "stroke-width": 1.5 }, c.svg); });
    });
    var cross = el("line", { y1: m.t, y2: m.t + ih, stroke: "var(--rule-strong)", "stroke-width": 1, visibility: "hidden" }, c.svg);
    var hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" }, c.svg);
    hit.addEventListener("mousemove", function (e) {
      var r = c.svg.getBoundingClientRect(), px = (e.clientX - r.left) * c.w / r.width;
      var i = Math.round((px - m.l) / iw * (labels.length - 1)); i = Math.max(0, Math.min(labels.length - 1, i));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      showTip("<b>" + labels[i].long + "</b>" + series.map(function (s) { return '<div class="row"><span class="k">' + s.name + "</span><span>" + (opts.fmt || kfmt)(s.values[i]) + "</span></div>"; }).join(""), e.clientX, e.clientY);
    });
    hit.addEventListener("mouseleave", function () { cross.setAttribute("visibility", "hidden"); hideTip(); });
  }

  // ---------------------------------------------------------------- small bars (memo)
  function bars(container, labels, values, opts) {
    opts = opts || {};
    var H = opts.height || 150;
    var c = svgFor(container, H);
    var m = { l: 46, r: 6, t: 8, b: 24 };
    var iw = c.w - m.l - m.r, ih = H - m.t - m.b;
    var ticks = niceTicks(Math.max.apply(null, values.concat([opts.ref || 0, 1])), 3), max = ticks[ticks.length - 1];
    var y = function (v) { return m.t + ih - Math.max(0, v) / max * ih; };
    var g = el("g", { class: "grid" }, c.svg);
    ticks.forEach(function (t) { el("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t) }, g); text(c.svg, m.l - 6, y(t) + 4, (opts.fmt || kfmt)(t), { "text-anchor": "end", class: "axis" }); });
    var slot = iw / values.length, bw = Math.max(4, slot * 0.6);
    values.forEach(function (v, i) {
      var x = m.l + slot * i + (slot - bw) / 2;
      var h = y(0) - y(v);
      if (h > 0) el("path", { d: rounded(x, y(v), bw, h, 2.5), fill: opts.color || "var(--accent)" }, c.svg);
      if (i % 2 === 0) text(c.svg, x + bw / 2, H - 8, labels[i].short, { "text-anchor": "middle", class: "axis" });
      var hit = el("rect", { x: m.l + slot * i, y: m.t, width: slot, height: ih, fill: "transparent" }, c.svg);
      hit.addEventListener("mousemove", function (e) { showTip("<b>" + labels[i].long + "</b><div>" + (opts.fmt || kfmt)(v) + "</div>", e.clientX, e.clientY); });
      hit.addEventListener("mouseleave", hideTip);
    });
    if (opts.ref) {
      el("line", { x1: m.l, x2: m.l + iw, y1: y(opts.ref), y2: y(opts.ref), stroke: "var(--severe)", "stroke-width": 1.5, "stroke-dasharray": "4 3" }, c.svg);
      text(c.svg, m.l + iw, y(opts.ref) - 5, opts.refLabel || "", { "text-anchor": "end", class: "axis", fill: "var(--severe)" });
    }
    el("line", { class: "baseline", x1: m.l, x2: m.l + iw, y1: y(0), y2: y(0) }, c.svg);
  }

  root.Charts = { limitMap: limitMap, stackedBars: stackedBars, lines: lines, bars: bars, showTip: showTip, hideTip: hideTip, kfmt: kfmt };
})(window);
