/*
 * Westline Credit Control: screens.
 * All calculations are in engine.js; this file only draws them.
 */
(function () {
  "use strict";
  var E = window.CreditEngine, C = window.Charts, DAY = E.DAY;
  var money = E.money;
  var state = { view: "overview", source: "sample", sourceName: "", invoices: null, customers: null, asOfOverride: null };
  var cache = {};
  var BANDS = ["Low", "Watch", "High", "Severe"];

  // ---------------------------------------------------------------- formatting
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fdate(t) { if (!t) return "–"; var d = new Date(t); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function fshort(t) { var d = new Date(t); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; }
  function pct(x, dp) { return (x * 100).toFixed(dp || 0) + "%"; }
  function esc(s) { return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function full(x) { return x === null || x === undefined || !isFinite(x) ? "–" : (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("en-US"); }
  function days(x) { return x === null || x === undefined ? "–" : Math.round(x) + (Math.abs(Math.round(x)) === 1 ? " day" : " days"); }
  function chip(band) { return '<span class="chip ' + band + '">' + band + "</span>"; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ---------------------------------------------------------------- data
  function load(invText, cusText, name, asOf) {
    var inv = E.readInvoices(invText);
    if (inv.error) return { error: inv.error };
    var cus = cusText ? E.readCustomers(cusText) : { customers: {} };
    if (cus.error) return { error: cus.error };
    if (!inv.invoices.length) return { error: "No usable invoice rows were found. Each row needs a customer, an invoice date and an amount." };
    state.invoices = inv.invoices;
    state.customers = cus.customers;
    state.sourceName = name;
    state.asOfOverride = asOf || null;
    state.meta = { skipped: inv.skipped, hasPaid: inv.hasPaidDates, hasDue: inv.hasDueDates, customers: Object.keys(cus.customers).length };
    compute();
    return { ok: true, invoices: inv.invoices.length, skipped: inv.skipped };
  }

  function compute() {
    var t0 = performance.now();
    var m = E.buildModel(state.invoices, state.customers, { asOf: state.asOfOverride });
    cache = { model: m, forecast: E.forecast(m), backtest: E.backtest(state.invoices, state.customers, m.asOf) };
    cache.ms = Math.round(performance.now() - t0);
    $("#source-label").innerHTML = "<strong>" + esc(state.sourceName) + "</strong> as of " + fdate(m.asOf);
    renderAll();
  }

  function active() { return cache.model.accounts.filter(function (a) { return a.active || a.limit > 0; }); }

  // ---------------------------------------------------------------- navigation
  function go(view) {
    state.view = view;
    $all(".tab").forEach(function (t) { t.setAttribute("aria-selected", t.dataset.view === view ? "true" : "false"); });
    $all(".view").forEach(function (v) { v.hidden = v.id !== "view-" + view; });
    render(view);
    window.scrollTo({ top: 0 });
    if (history.replaceState) history.replaceState(null, "", "#" + view);
  }
  function renderAll() { render(state.view); }
  function render(view) {
    if (!cache.model && view !== "data") return;
    ({ overview: overview, accounts: accounts, limits: limits, forecast: forecastView, whatif: whatif, method: method, data: dataView })[view]();
  }

  // ---------------------------------------------------------------- overview
  function overview() {
    var m = cache.model, s = m.summary, f = cache.forecast, bt = cache.backtest;
    var acc = active();
    var withLimit = acc.filter(function (a) { return a.active && a.limit > 0 && a.recLimit > 0; });
    var off = withLimit.filter(function (a) { return a.drift > 1.5 || a.drift < 0.67; }).length;
    var offShare = withLimit.length ? off / withLimit.length : 0;
    var hiSev = acc.filter(function (a) { return a.band === "High" || a.band === "Severe"; });
    var hiSevOpen = hiSev.reduce(function (t, a) { return t + a.open; }, 0);
    var hiSevLoss = hiSev.reduce(function (t, a) { return t + a.expectedLoss; }, 0);
    var next4 = f.fromOpen.slice(0, 4).reduce(sum, 0) + f.fromNew.slice(0, 4).reduce(sum, 0);
    var total13 = f.totalOpen + f.totalNew;
    var changes = acc.filter(function (a) { return a.action !== "Keep" && a.action !== "No action"; }).length;
    var tenths = Math.round(offShare * 10);

    var headline = m.hasLimits && withLimit.length
      ? (tenths >= 1 ? tenths + " in 10 credit limits no longer match how the customer buys" : "Most credit limits match how customers buy")
      : "Credit risk and cash forecast for " + acc.length + " accounts";

    var findings = [];
    if (m.hasLimits) {
      findings.push([pct(offShare), "of limits on file are more than 50% above or 33% below what the account needs." + (s.limitsCount ? " " + s.staleLimits + " of " + s.limitsCount + " limits have not been reviewed in over a year." : "")]);
      findings.push([String(s.overLimit), "accounts owe more than their limit, " + money(s.overLimitAmount) + " above their limits in total. " + s.over3x + " buy more than three times their limit every month."]);
      if (s.noLimit) findings.push([String(s.noLimit), "accounts buy on credit with no limit on file."]);
    }
    findings.push([String(hiSev.length), "accounts in the High and Severe bands hold " + money(hiSevOpen) + " (" + pct(hiSevOpen / Math.max(1, s.open)) + " of the open balance) and " + pct(hiSevLoss / Math.max(1, s.expectedLoss)) + " of the expected credit loss."]);
    findings.push([money(next4), "expected in the next 4 weeks." + (bt ? " Tested on the last 13 weeks, the forecast was within " + pct(Math.abs(bt.totalError), 1) + " of the cash that came in." : "")]);

    var v = $("#view-overview");
    v.innerHTML =
      '<div class="hero"><div class="grid-hero">' +
        "<div><h1>" + esc(headline) + "</h1>" +
        '<p class="lead">A credit review of every ' + (state.source === "sample" ? "Westline " : "") + "account, rebuilt from " + monthsOfHistory() + " months of invoices and payments: a risk score for each customer, the limit it should have, and the cash to expect.</p>" +
        '<ul class="findings">' + findings.map(function (x) { return '<li><span class="fig">' + esc(x[0]) + '</span><span class="txt">' + esc(x[1]) + "</span></li>"; }).join("") + "</ul></div>" +
        "<div>" + (m.hasLimits ? '<h3>Limit on file against the limit each account needs</h3><p class="small muted" style="margin:4px 0 0">Each dot is an account with a limit. Dots in the blue band are right-sized. Select a dot to open its credit memo.</p><div class="chart" id="limit-map"></div>' +
          '<div class="legend">' + BANDS.slice(0, 3).map(function (b) { return '<span><i class="swatch" style="background:var(--' + b.toLowerCase() + ')"></i>' + b + " risk</span>"; }).join("") + '</div><p class="small muted" style="margin-top:6px">Severe accounts are not plotted: the recommendation for them is no open credit.</p>'
          : '<h3>Risk bands</h3><p class="muted small">Add a customer file with credit limits to see the limit review.</p>') +
        "</div>" +
      "</div></div>" +
      '<div class="stats">' +
        stat(money(s.open), "open balance, " + pct(s.pastDue / Math.max(1, s.open)) + " past due") +
        stat(money(s.expectedLoss), "expected credit loss on the open balance") +
        stat(money(total13), "cash expected in the next 13 weeks") +
        stat(String(changes), "accounts need a limit change or a hold") +
      "</div>" +
      '<div class="grid-2">' +
        '<div class="panel"><div class="panel-head"><div><h2>Risk bands</h2><p>Every account scored from 0 to 100 on seven rules. See How it works.</p></div></div>' + bandTable() + "</div>" +
        (m.hasLimits ? '<div class="panel"><div class="panel-head"><div><h2>Who set the limits</h2><p>' + setterNote() + '</p></div></div>' + setterTable() + "</div>"
          : '<div class="panel"><h2>Next step</h2><p class="muted">Add a customer file with a credit_limit column to see which limits to raise, lower or close.</p></div>') +
      "</div>";

    if (m.hasLimits) {
      var pts = withLimit.map(function (a) {
        return { x: a.recLimit, y: a.limit, band: a.band, id: a.id,
          tip: "<b>" + esc(a.name) + "</b>" + row("Limit on file", full(a.limit)) + row("Needs", full(a.recLimit)) + row("Buys a month", full(a.avgMonthly)) + row("Risk", a.band + ", " + a.score + " points") };
      });
      C.limitMap($("#limit-map"), pts, { height: 470, onClick: function (p) { openMemo(p.id); } });
    }
  }
  function setterNote() {
    var st = cache.model.summary.setters.filter(function (x) { return x.count >= 10; });
    if (!st.length) return "How far each person's limits sit from what the account needs.";
    var shares = st.map(function (x) { return x.off / x.count; });
    var lo = Math.min.apply(null, shares), hi = Math.max.apply(null, shares);
    return hi - lo < 0.3 ? "Every group that sets limits has " + pct(lo) + " to " + pct(hi) + " of them off. The cause is the missing review process, not one person."
      : "Drift ranges from " + pct(lo) + " to " + pct(hi) + " depending on who set the limit.";
  }
  function whyList(a) {
    var top = a.scoreParts.filter(function (p) { return p.points >= 3; }).sort(function (x, y) { return y.points - x.points; }).slice(0, 3)
      .map(function (p) { return p.why + " (" + Math.round(p.points) + " points)"; });
    return a.reasons.concat(top);
  }
  function stat(v, l) { return '<div class="stat"><div class="v">' + esc(v) + '</div><div class="l">' + esc(l) + "</div></div>"; }
  function row(k, v) { return '<div class="row"><span class="k">' + esc(k) + "</span><span>" + esc(v) + "</span></div>"; }
  function sum(a, b) { return a + b; }
  function monthsOfHistory() {
    var first = state.invoices.reduce(function (m, i) { return Math.min(m, i.date); }, Infinity);
    return Math.max(1, Math.round((cache.model.asOf - first) / (30.44 * DAY)));
  }

  function bandTable() {
    var s = cache.model.summary;
    var rows = BANDS.map(function (b) {
      var x = s.bands[b];
      return "<tr><td>" + chip(b) + '</td><td class="num">' + x.accounts + '</td><td class="num">' + money(x.open) + '</td><td class="num">' + pct(x.open / Math.max(1, s.open)) + '</td><td class="num">' + money(x.expectedLoss) + "</td></tr>";
    }).join("");
    return '<div class="table-wrap"><table><thead><tr><th>Band</th><th class="num">Accounts</th><th class="num">Open balance</th><th class="num">Share</th><th class="num">Expected loss</th></tr></thead><tbody>' + rows +
      '</tbody><tfoot><tr><td>Total</td><td class="num">' + s.accounts + '</td><td class="num">' + money(s.open) + '</td><td class="num">100%</td><td class="num">' + money(s.expectedLoss) + "</td></tr></tfoot></table></div>";
  }
  function setterTable() {
    var s = cache.model.summary;
    var rows = s.setters.slice().sort(function (a, b) { return b.off / b.count - a.off / a.count; }).map(function (x) {
      return "<tr><td>" + esc(x.name) + '</td><td class="num">' + x.count + '</td><td class="num">' + x.off + '</td><td class="num"><span class="scorebar"><span class="track"><span class="fill" style="display:block;width:' + Math.round(x.off / x.count * 100) + '%;background:var(--accent)"></span></span>' + pct(x.off / x.count) + "</span></td></tr>";
    }).join("");
    return '<div class="table-wrap"><table><thead><tr><th>Set by</th><th class="num">Active limits</th><th class="num">Off by 50%+</th><th class="num">Share off</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  }

  // ---------------------------------------------------------------- accounts
  var acct = { q: "", band: "", yard: "", action: "", sort: "score", dir: -1, page: 0, size: 25 };
  var ACCT_COLS = [
    ["name", "Account", false], ["score", "Risk", true], ["open", "Owes", true], ["over60", "60+ days late", true],
    ["effectiveDbt", "Avg days late", true], ["trend", "Trend", true], ["limit", "Limit", true], ["util", "Limit used", true], ["action", "Action", false]
  ];
  function accounts() {
    var acc = active();
    var yards = uniq(acc.map(function (a) { return a.yard; }).filter(Boolean));
    var actions = uniq(acc.map(function (a) { return a.action; }));
    var v = $("#view-accounts");
    v.innerHTML = '<div class="page-head"><h1>Accounts</h1><p class="lead">Every account with its risk score, balance and payment pattern. Select an account to open its credit review memo.</p></div>' +
      '<div class="panel"><div class="toolbar">' +
        '<label class="sr-only" for="f-q">Search accounts</label><input type="search" id="f-q" placeholder="Search by name or ID" value="' + esc(acct.q) + '">' +
        select("f-band", "Risk band", ["", "Low", "Watch", "High", "Severe"], acct.band, "All bands") +
        (yards.length ? select("f-yard", "Yard", [""].concat(yards), acct.yard, "All yards") : "") +
        select("f-action", "Action", [""].concat(actions), acct.action, "All actions") +
        '<span class="count" id="acct-count"></span></div>' +
        '<div class="table-wrap"><table id="acct-table"><thead><tr>' + ACCT_COLS.map(function (c) {
          return '<th class="sortable' + (c[2] ? " num" : "") + '" data-key="' + c[0] + '" tabindex="0"' + (acct.sort === c[0] ? ' aria-sort="' + (acct.dir < 0 ? "descending" : "ascending") + '"' : "") + ">" + c[1] + "</th>";
        }).join("") + "</tr></thead><tbody></tbody></table></div><div class=\"pager\" id=\"acct-pager\"></div></div>";
    $("#f-q").addEventListener("input", function (e) { acct.q = e.target.value; acct.page = 0; drawAccounts(); });
    ["band", "yard", "action"].forEach(function (k) { var s = $("#f-" + k); if (s) s.addEventListener("change", function (e) { acct[k] = e.target.value; acct.page = 0; drawAccounts(); }); });
    $all("#acct-table th.sortable").forEach(function (th) {
      var fn = function () {
        var k = th.dataset.key; if (acct.sort === k) acct.dir *= -1; else { acct.sort = k; acct.dir = k === "name" || k === "action" ? 1 : -1; }
        $all("#acct-table th").forEach(function (x) { x.removeAttribute("aria-sort"); });
        th.setAttribute("aria-sort", acct.dir < 0 ? "descending" : "ascending"); drawAccounts();
      };
      th.addEventListener("click", fn); th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
    });
    drawAccounts();
  }
  function drawAccounts() {
    var q = acct.q.trim().toLowerCase();
    var list = active().filter(function (a) {
      return (!q || a.name.toLowerCase().indexOf(q) !== -1 || a.id.toLowerCase().indexOf(q) !== -1) &&
        (!acct.band || a.band === acct.band) && (!acct.yard || a.yard === acct.yard) && (!acct.action || a.action === acct.action);
    });
    var key = function (a) {
      if (acct.sort === "util") return a.limit ? a.open / a.limit : (a.open > 0 ? 99 : -1);
      var v = a[acct.sort]; return v === null || v === undefined ? -999 : v;
    };
    list.sort(function (a, b) { var x = key(a), y = key(b); return (typeof x === "string" ? x.localeCompare(y) : x - y) * acct.dir; });
    var pages = Math.max(1, Math.ceil(list.length / acct.size));
    acct.page = Math.min(acct.page, pages - 1);
    var slice = list.slice(acct.page * acct.size, (acct.page + 1) * acct.size);
    $("#acct-count").textContent = list.length + " accounts";
    $("#acct-table tbody").innerHTML = slice.map(function (a) {
      var tr = a.trend === null ? "–" : a.trend > 2 ? '<span class="up">' + Math.round(a.trend) + " days slower</span>" : a.trend < -2 ? '<span class="down">' + Math.round(-a.trend) + " days faster</span>" : "Steady";
      var util = a.limit ? pct(a.open / a.limit) : (a.open > 0 ? "No limit" : "–");
      return '<tr class="clickable" tabindex="0" data-id="' + esc(a.id) + '"><td><div class="name">' + esc(a.name) + '</div><div class="sub">' + esc([a.id, a.yard, a.segment].filter(Boolean).join(", ")) + "</div></td>" +
        '<td class="num"><span class="scorebar">' + a.score + '<span class="track"><span class="fill" style="display:block;width:' + a.score + "%;background:var(--" + a.band.toLowerCase() + ')"></span></span>' + chip(a.band) + "</span></td>" +
        '<td class="num">' + full(a.open) + '</td><td class="num">' + (a.over60 ? full(a.over60) : "–") + '</td><td class="num">' + (a.effectiveDbt === null ? "–" : Math.round(a.effectiveDbt)) + '</td><td class="num">' + tr + "</td>" +
        '<td class="num">' + (a.limit ? full(a.limit) : "None") + '</td><td class="num">' + util + "</td><td>" + esc(a.action) + "</td></tr>";
    }).join("") || '<tr><td colspan="9" class="muted">No accounts match these filters. Clear a filter to see more.</td></tr>';
    bindRows("#acct-table");
    var pg = $("#acct-pager");
    pg.innerHTML = "<span>Page " + (acct.page + 1) + " of " + pages + '</span><button type="button" id="pg-prev"' + (acct.page === 0 ? " disabled" : "") + '>Previous</button><button type="button" id="pg-next"' + (acct.page >= pages - 1 ? " disabled" : "") + ">Next</button>";
    $("#pg-prev").onclick = function () { acct.page--; drawAccounts(); };
    $("#pg-next").onclick = function () { acct.page++; drawAccounts(); };
  }
  function bindRows(table) {
    $all(table + " tr.clickable").forEach(function (tr) {
      tr.addEventListener("click", function () { openMemo(tr.dataset.id); });
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter") openMemo(tr.dataset.id); });
    });
  }
  function select(id, label, opts, val, allLabel) {
    return '<label class="sr-only" for="' + id + '">' + label + '</label><select id="' + id + '">' + opts.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === val ? " selected" : "") + ">" + esc(o || allLabel) + "</option>";
    }).join("") + "</select>";
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }).sort(); }

  // ---------------------------------------------------------------- limit review
  var ACTION_INFO = {
    "Raise": "Buys more than the limit supports",
    "Lower": "Limit far above what the account needs",
    "Set first limit": "Buying on credit with no limit",
    "Card or prepay only": "Severe risk or repeat returned payments, no card on file",
    "Move to card on file": "Severe risk or repeat returned payments, card on file",
    "Close dormant limit": "No orders or balance in 90 days",
    "Set limit": "No limits were supplied",
    "Keep": "Within the right-sized range"
  };
  var limitFilter = "";
  function limits() {
    var m = cache.model;
    var acc = active();
    var order = ["Raise", "Lower", "Set first limit", "Set limit", "Card or prepay only", "Move to card on file", "Close dormant limit", "Keep"];
    var groups = order.map(function (k) {
      var list = acc.filter(function (a) { return a.action === k; });
      return { k: k, n: list.length, change: list.reduce(function (t, a) { return t + a.change; }, 0) };
    }).filter(function (g) { return g.n; });
    var v = $("#view-limits");
    v.innerHTML = '<div class="page-head"><h1>Limit review</h1><p class="lead">The recommended limit for every account, the action to take, and who signs it off. Limits are sized from how the account buys and pays; see How it works.</p></div>' +
      '<div class="actions-grid" role="group" aria-label="Filter by action">' + groups.map(function (g) {
        return '<button type="button" class="action-cell" data-action="' + esc(g.k) + '" aria-pressed="' + (limitFilter === g.k) + '"><span class="n">' + g.n + '</span><span class="a">' + esc(g.k) + '</span><span class="d">' + esc(ACTION_INFO[g.k] || "") + "</span></button>";
      }).join("") + "</div>" +
      '<div class="panel" style="margin-top:20px"><div class="panel-head"><div><h2 id="limit-title"></h2><p>Approval follows a simple matrix: new limits up to $5,000 by a credit analyst, up to $25,000 by the credit manager, above that by the controller. Holds and closures by the credit manager.</p></div>' +
      '<button class="btn ghost" type="button" id="export-review">Download review list (CSV)</button></div>' +
      '<div class="table-wrap"><table id="limit-table"><thead><tr><th>Account</th><th>Risk</th><th class="num">Owes</th><th class="num">Limit on file</th><th>Set by, date</th><th class="num">Recommended</th><th class="num">Change</th><th>Action</th><th>Signs off</th></tr></thead><tbody></tbody></table></div><div class="pager" id="limit-pager"></div></div>';
    $all(".action-cell").forEach(function (b) {
      b.addEventListener("click", function () {
        limitFilter = limitFilter === b.dataset.action ? "" : b.dataset.action; limitPage = 0;
        $all(".action-cell").forEach(function (x) { x.setAttribute("aria-pressed", x.dataset.action === limitFilter); });
        drawLimits();
      });
    });
    $("#export-review").addEventListener("click", exportReview);
    drawLimits();
  }
  var limitPage = 0;
  function reviewList() {
    return active().filter(function (a) { return limitFilter ? a.action === limitFilter : a.action !== "Keep" && a.action !== "No action"; })
      .sort(function (a, b) { return Math.abs(b.change) - Math.abs(a.change); });
  }
  function drawLimits() {
    var list = reviewList();
    $("#limit-title").textContent = (limitFilter || "All changes") + ": " + list.length + " account" + (list.length === 1 ? "" : "s");
    var size = 25, pages = Math.max(1, Math.ceil(list.length / size));
    limitPage = Math.min(limitPage, pages - 1);
    $("#limit-table tbody").innerHTML = list.slice(limitPage * size, (limitPage + 1) * size).map(function (a) {
      var ch = a.change === 0 ? "–" : (a.change > 0 ? '<span class="down">+' : '<span class="up">') + full(a.change).replace("−", "−") + "</span>";
      return '<tr class="clickable" tabindex="0" data-id="' + esc(a.id) + '"><td><div class="name">' + esc(a.name) + '</div><div class="sub">' + esc(a.id) + "</div></td><td>" + chip(a.band) + '</td><td class="num">' + full(a.open) +
        '</td><td class="num">' + (a.limit ? full(a.limit) : "None") + '</td><td><div>' + esc(a.limitSetBy || "–") + '</div><div class="sub">' + (a.limitSetDate ? fdate(a.limitSetDate) : "") + '</div></td><td class="num">' + full(a.recLimit) +
        '</td><td class="num">' + ch + "</td><td>" + esc(a.action) + "</td><td>" + esc(a.approver || "–") + "</td></tr>";
    }).join("") || '<tr><td colspan="9" class="muted">No accounts need this action.</td></tr>';
    bindRows("#limit-table");
    var pg = $("#limit-pager");
    pg.innerHTML = "<span>Page " + (limitPage + 1) + " of " + pages + '</span><button type="button" id="lp-prev"' + (limitPage === 0 ? " disabled" : "") + '>Previous</button><button type="button" id="lp-next"' + (limitPage >= pages - 1 ? " disabled" : "") + ">Next</button>";
    $("#lp-prev").onclick = function () { limitPage--; drawLimits(); };
    $("#lp-next").onclick = function () { limitPage++; drawLimits(); };
  }
  function exportReview() {
    var rows = [["customer_id", "customer_name", "risk_points", "risk_band", "owes", "limit_on_file", "limit_set_by", "limit_set_date", "recommended_limit", "change", "action", "signs_off", "reasons"]];
    reviewList().forEach(function (a) {
      rows.push([a.id, a.name, a.score, a.band, a.open.toFixed(2), a.limit || "", a.limitSetBy, a.limitSetDate ? new Date(a.limitSetDate).toISOString().slice(0, 10) : "", a.recLimit, a.change, a.action, a.approver, a.reasons.join("; ")]);
    });
    download("credit-limit-review-" + new Date(cache.model.asOf).toISOString().slice(0, 10) + ".csv", toCSV(rows));
  }
  function toCSV(rows) { return rows.map(function (r) { return r.map(function (c) { c = String(c === undefined || c === null ? "" : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(","); }).join("\n"); }
  function download(name, text) {
    var blob = new Blob([text], { type: "text/csv" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------------------------------------------------------------- forecast
  function forecastView() {
    var f = cache.forecast, bt = cache.backtest, m = cache.model;
    var labels = f.weekStarts.map(function (t) { return { short: fshort(t), long: "Week of " + fdate(t) }; });
    var total = f.totalOpen + f.totalNew;
    var v = $("#view-forecast");
    v.innerHTML = '<div class="page-head"><h1>Cash forecast, next 13 weeks</h1><p class="lead">Each open invoice is forecast from how that customer has actually paid over the last six months. New sales are added from each customer\'s recent buying.</p></div>' +
      '<div class="stats" style="margin-top:0">' + stat(money(total), "expected over 13 weeks") + stat(money(f.totalOpen), "from invoices already open") + stat(money(f.totalNew), "from new sales (estimate)") + stat(money(f.notExpected), "of open invoices not expected to be collected") + "</div>" +
      '<div class="panel" style="margin-top:20px"><div class="panel-head"><div><h2>Expected cash by week</h2><p>Invoices from Severe accounts are not expected to keep flowing as new sales, and old or disputed invoices are discounted.</p></div></div>' +
      '<div class="chart" id="fc-chart"></div><div class="legend"><span><i class="swatch sq" style="background:var(--accent)"></i>From open invoices</span><span><i class="swatch sq" style="background:var(--accent-light)"></i>From new sales</span></div></div>' +
      (bt ? '<div class="panel"><div class="panel-head"><div><h2>Is the forecast any good?</h2><p>The same method was run as if today were ' + fdate(bt.start) + ", using only what was known then, and compared with the cash that actually came in over the next 13 weeks.</p></div></div>" +
        '<div class="result-figs">' +
          '<div><div class="v">' + (bt.totalError >= 0 ? "+" : "") + pct(bt.totalError, 1) + '</div><div class="l">13-week total, forecast ' + money(bt.totalPredicted) + " against " + money(bt.totalActual) + " actual</div></div>" +
          '<div><div class="v">' + (bt.first4Error >= 0 ? "+" : "") + pct(bt.first4Error, 1) + '</div><div class="l">first 4 weeks, which rest mostly on invoices already open</div></div>' +
          '<div><div class="v">' + pct(bt.weeklyMape, 1) + '</div><div class="l">average miss in a single week (timing evens out over a month)</div></div>' +
        '</div><div class="chart" id="bt-chart" style="margin-top:18px"></div><div class="legend"><span><i class="swatch" style="background:var(--ink)"></i>Actual cash</span><span><i class="swatch" style="background:var(--accent)"></i>Forecast</span></div></div>'
        : '<div class="panel"><h2>Back-test</h2><p class="muted">A back-test needs at least 10 months of invoice history with paid dates.</p></div>') +
      '<div class="panel"><div class="panel-head"><div><h2>Week by week</h2></div></div><div class="table-wrap"><table><thead><tr><th>Week starting</th><th class="num">From open invoices</th><th class="num">From new sales</th><th class="num">Total</th><th class="num">Running total</th></tr></thead><tbody>' +
        (function () { var run = 0; return f.weekStarts.map(function (t, i) { var tot = f.fromOpen[i] + f.fromNew[i]; run += tot; return "<tr><td>" + fdate(t) + '</td><td class="num">' + full(f.fromOpen[i]) + '</td><td class="num">' + full(f.fromNew[i]) + '</td><td class="num">' + full(tot) + '</td><td class="num">' + full(run) + "</td></tr>"; }).join(""); })() +
      "</tbody></table></div></div>";
    C.stackedBars($("#fc-chart"), labels, [{ name: "From open invoices", values: f.fromOpen, color: "var(--accent)" }, { name: "From new sales", values: f.fromNew, color: "var(--accent-light)" }]);
    if (bt) C.lines($("#bt-chart"), bt.weekStarts.map(function (t) { return { short: fshort(t), long: "Week of " + fdate(t) }; }),
      [{ name: "Actual cash", values: bt.actual, color: "var(--ink)" }, { name: "Forecast", values: bt.predicted, color: "var(--accent)", dash: "6 4" }]);
  }

  // ---------------------------------------------------------------- what if
  var wi = { severe: "card", capHigh: false, capAll: false, lostShare: 0.4, margin: 0.30 };
  function whatif() {
    var v = $("#view-whatif");
    v.innerHTML = '<div class="page-head"><h1>What if we tighten credit?</h1><p class="lead">Every limit cut avoids some credit loss and gives up some sales. Choose a policy and see whether it pays for itself over a year.</p></div>' +
      '<div class="grid-2 whatif-grid" style="margin-top:0"><div class="panel"><h2 style="margin-bottom:16px">Policy</h2><div class="controls">' +
        '<div class="field"><span class="label" id="sev-l">Severe accounts</span><div class="seg" role="group" aria-labelledby="sev-l">' +
          [["none", "Leave as is"], ["card", "Card or prepay only"], ["hold", "Hold all orders"]].map(function (o) { return '<button type="button" data-sev="' + o[0] + '" aria-pressed="' + (wi.severe === o[0]) + '">' + o[1] + "</button>"; }).join("") +
        '</div><span class="hint">Card or prepay keeps about half of their buying; a hold stops it.</span></div>' +
        '<label class="check"><input type="checkbox" id="w-high"' + (wi.capHigh ? " checked" : "") + "><span><b>Enforce the recommended limit on High accounts</b><br><span class=\"muted\">Orders above the limit wait for payment.</span></span></label>" +
        '<label class="check"><input type="checkbox" id="w-all"' + (wi.capAll ? " checked" : "") + "><span><b>Enforce recommended limits on every account</b><br><span class=\"muted\">Includes Low and Watch accounts.</span></span></label>" +
        '<div class="field"><label for="w-lost">Blocked sales the business loses: <span id="w-lost-v"></span></label><input type="range" id="w-lost" min="0" max="100" step="5" value="' + wi.lostShare * 100 + '"><span class="hint">The rest still arrive, paid faster or by card.</span></div>' +
        '<div class="field"><label for="w-margin">Gross margin on parts: <span id="w-margin-v"></span></label><input type="range" id="w-margin" min="10" max="50" step="1" value="' + Math.round(wi.margin * 100) + '"></div>' +
      '</div></div><div class="panel"><h2 style="margin-bottom:16px">Over the next year</h2><div class="result-figs" id="w-figs"></div><div class="verdict" id="w-verdict"></div>' +
      '<h3 style="margin:22px 0 8px">Each policy on its own</h3><div class="table-wrap"><table class="policy-table" id="w-policies"></table></div>' +
      '<p class="small muted" style="margin-top:14px">The last column is the share of affected accounts that would have to fail within a year for the policy to break even. Compare it with what your write-off history says. Expected loss = exposure × yearly default rate by band (Low 0.5%, Watch 2%, High 8%, Severe 30%) × 80% lost when an account fails. Exposure today is the larger of what an account owes and what it runs up in its busiest month, because limits are not enforced.</p></div></div>';
    $all("[data-sev]").forEach(function (b) { b.addEventListener("click", function () { wi.severe = b.dataset.sev; $all("[data-sev]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); drawWhatif(); }); });
    $("#w-high").addEventListener("change", function (e) { wi.capHigh = e.target.checked; drawWhatif(); });
    $("#w-all").addEventListener("change", function (e) { wi.capAll = e.target.checked; drawWhatif(); });
    $("#w-lost").addEventListener("input", function (e) { wi.lostShare = e.target.value / 100; drawWhatif(); });
    $("#w-margin").addEventListener("input", function (e) { wi.margin = e.target.value / 100; drawWhatif(); });
    drawWhatif();
  }
  function drawWhatif() {
    var m = cache.model;
    $("#w-lost-v").textContent = pct(wi.lostShare);
    $("#w-margin-v").textContent = pct(wi.margin);
    var r = E.scenario(m, wi);
    $("#w-figs").innerHTML = '<div><div class="v">' + money(r.lossAvoided) + '</div><div class="l">credit loss avoided (from ' + money(r.lossBefore) + " to " + money(r.lossAfter) + ')</div></div>' +
      '<div><div class="v">' + money(r.marginLost) + '</div><div class="l">margin given up on ' + money(r.salesLost) + " of lost sales</div></div>" +
      '<div><div class="v" style="color:var(--' + (r.net >= 0 ? "low" : "severe") + ')">' + (r.net >= 0 ? "+" : "−") + money(Math.abs(r.net)) + '</div><div class="l">net effect a year</div></div>';
    var touched = r.accountsHeld + r.accountsCut;
    $("#w-verdict").textContent = touched === 0 ? "No accounts are affected by this policy." :
      (r.net >= 0 ? "This policy pays for itself: it avoids more credit loss than the margin it gives up, across " + touched + " accounts."
        : "This policy gives up more margin than it saves in credit loss, across " + touched + " accounts. At a " + pct(wi.margin) + " margin, refusing orders only pays when an account is very likely to fail" +
          (r.breakEvenRate ? ": here, if more than " + pct(Math.min(r.breakEvenRate, 9.99)) + " of the affected accounts would fail within a year." : ".") +
          " Keeping the sale on card or prepayment is cheaper than losing it.");
    var pols = [
      ["Severe to card or prepay", { severe: "card" }],
      ["Hold all Severe orders", { severe: "hold" }],
      ["Cap High at recommended", { capHigh: true, severe: "none" }],
      ["Cap every account", { capAll: true, severe: "none" }]
    ];
    $("#w-policies").innerHTML = '<thead><tr><th>Policy</th><th class="num">Accounts</th><th class="num">Loss avoided</th><th class="num">Margin given up</th><th class="num">Net a year</th><th class="num">Breaks even at failure rate</th></tr></thead><tbody>' + pols.map(function (p) {
      var x = E.scenario(m, Object.assign({ lostShare: wi.lostShare, margin: wi.margin }, p[1]));
      return "<tr><td>" + p[0] + '</td><td class="num">' + (x.accountsHeld + x.accountsCut) + '</td><td class="num">' + money(x.lossAvoided) + '</td><td class="num">' + money(x.marginLost) + '</td><td class="num" style="color:var(--' + (x.net >= 0 ? "low" : "severe") + ')">' + (x.net >= 0 ? "+" : "−") + money(Math.abs(x.net)) + '</td><td class="num">' + (x.breakEvenRate === null ? "–" : x.breakEvenRate > 1 ? "Never" : pct(x.breakEvenRate)) + "</td></tr>";
    }).join("") + "</tbody>";
  }

  // ---------------------------------------------------------------- method
  function method() {
    var s = cache.model.settings, bt = cache.backtest;
    var rules = [
      ["Pays late", 30, "Average days past the due date over the last 6 months, weighted by invoice amount. Open past-due invoices count at their current age, so an account that has stopped paying still looks late.", "0 points if on time, full 30 at 45 days late or more"],
      ["Getting worse", 15, "Days late in the last 3 months against the 3 months before.", "Full 15 if 20 days slower or more"],
      ["Old balance", 20, "Share of the open balance more than 60 days past due.", "Full 20 if half or more is that old"],
      ["Over limit", 15, "What the account owes against the limit on file. No limit on file with a balance owed scores 8.", "0 up to 80% used, full 15 at 200%"],
      ["Returned payments", 10, "Bounced checks or returned card payments in the last 12 months.", "5 points each"],
      ["Disputes", 5, "Share of invoices disputed in the last 6 months.", "Full 5 at 15% or more"],
      ["Broken promises", 5, "Payment promises missed in the last 90 days.", "2.5 points each"]
    ];
    $("#view-method").innerHTML = '<div class="page-head"><h1>How it works</h1><p class="lead">Every number comes from plain rules that a credit team can check by hand. There is no black box: each score, limit and forecast line can be traced back to invoices.</p></div>' +
      '<div class="panel method">' +
      "<h2>1. Risk score: seven rules, 100 points</h2><p>Each rule has a cap, so no single signal decides the score. Higher means riskier.</p>" +
      '<div class="table-wrap"><table><thead><tr><th>Rule</th><th class="num">Max points</th><th>What it measures</th><th>Scale</th></tr></thead><tbody>' +
        rules.map(function (r) { return "<tr><td><b>" + r[0] + '</b></td><td class="num">' + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td></tr>"; }).join("") +
      "</tbody></table></div>" +
      '<p style="margin-top:14px">Bands: ' + s.bands.map(function (b, i) { var nx = s.bands[i + 1]; return chip(b.name) + " " + b.min + (nx ? "–" + (nx.min - 1) : "+"); }).join("&nbsp;&nbsp; ") + "</p>" +
      "<h2>2. Recommended credit limit</h2><p>A limit should let a good customer keep buying the way it buys, and no more.</p>" +
      '<div class="formula">Need = (average month of purchases + ¼ of the gap to the busiest month) × (payment terms + ' + s.allowanceDays + " days) ÷ 30<br>Recommended = Need × " + s.bands.map(function (b) { return b.name + " " + b.limitMultiplier; }).join(", ") + "</div>" +
      "<ul><li>Severe accounts get no open credit: new orders ship on a card on file or prepayment, so the sale is kept without adding exposure.</li><li>Three or more returned payments in 12 months also means card or prepayment only, whatever the score.</li><li>Accounts under 6 months old are capped at " + full(s.probationCap) + " until they build a payment record.</li><li>Accounts with no orders and no balance for 90 days have their limit closed. An open limit nobody uses is still exposure.</li><li>A limit is raised when it is below two-thirds of the recommendation and lowered when it is more than 1.5 times it. In between, it is kept, so the team is not chasing small differences.</li></ul>" +
      '<p>Who signs: new limits up to $5,000 by a credit analyst, up to $25,000 by the credit manager, above that by the controller. Holds, card-on-file moves and closures by the credit manager.</p>' +
      "<h2>3. Cash forecast</h2><p>For every open invoice, the model looks at how many days late this customer paid each invoice over the last 6 months. Only the outcomes still possible today count: an invoice already 20 days late cannot be paid 5 days late. The invoice is spread across those outcomes and lands in the weeks they point to.</p>" +
      "<ul><li>Each band is discounted for invoices that may never be collected: " + BANDS.map(function (b) { return b + " " + pct(s.collectible[b]); }).join(", ") + " collected.</li><li>Disputed invoices count at half and arrive 30 days later. Invoices more than 90 days late count at 60%.</li><li>Accounts with too little history use the payment pattern of the whole book.</li><li>New sales are each account's last 13 weeks of buying, carried forward, paid after its usual number of days. Severe accounts add no new sales.</li></ul>" +
      (bt ? "<p><b>Tested, not assumed.</b> Run as if today were " + fdate(bt.start) + ", the forecast for the next 13 weeks was " + money(bt.totalPredicted) + " against " + money(bt.totalActual) + " that actually came in, a difference of " + pct(Math.abs(bt.totalError), 1) + ".</p>" : "") +
      "<h2>4. What-if</h2><p>Expected yearly loss for an account is its exposure × the yearly default rate for its band (" + BANDS.map(function (b) { return b + " " + pct(s.defaultRate[b], 1); }).join(", ") + ") × " + pct(s.lossGivenDefault) + " lost when an account fails. A policy lowers exposure but blocks some orders; the share of blocked orders the business loses costs its gross margin. The default rates are planning assumptions, not measured from this data, and should be replaced with the company's own write-off history.</p>" +
      "<h2>5. Limits of this model</h2><ul><li>It uses only the company's own invoices. A real review also checks trade references, a business credit report and, for large limits, financial statements.</li><li>Broken promises come from the collections log; if that is not supplied, the rule scores zero.</li><li>Rules and weights are a starting point, set by judgment. With a few years of write-offs they should be re-weighted against which accounts actually failed.</li></ul>" +
      '<p class="muted small">This run: ' + cache.model.accounts.length + " accounts and " + state.invoices.length.toLocaleString("en-US") + " invoices scored in " + cache.ms + " ms, in your browser.</p>" +
      "</div>";
  }

  // ---------------------------------------------------------------- your data
  var TEMPLATES = {
    invoices: "invoice_id,customer_id,customer_name,invoice_date,due_date,amount,paid_date,settled_by,disputed,returned_payment\nINV-1001,C001,Example Collision,2026-08-04,2026-09-03,412.50,2026-09-10,payment,N,N\nINV-1002,C001,Example Collision,2026-09-15,2026-10-15,288.00,,,N,N\nINV-1003,C002,Sample Auto Repair,2026-09-20,2026-10-20,1290.75,2026-10-02,credit,Y,N\n",
    customers: "customer_id,customer_name,yard,segment,terms_days,credit_limit,limit_set_by,limit_set_date,account_opened,card_on_file,broken_promises_90d\nC001,Example Collision,Sacramento,Body shop,30,2500,Sales,2021-03-10,2019-06-01,N,0\nC002,Sample Auto Repair,Fresno,Repair shop,30,,,,2024-11-15,Y,1\n"
  };
  var pending = { invoices: null, customers: null, invName: "", cusName: "" };
  function dataView() {
    var v = $("#view-data");
    v.innerHTML = '<div class="page-head"><h1>Try it on your own AR file</h1><p class="lead">Export open and paid invoices from your accounting system as CSV, drop them here, and get the same review for your book.</p></div>' +
      '<div class="privacy"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style="flex:none;margin-top:2px"><path d="M10 1 3 4v5c0 4.5 3 8.3 7 9.5 4-1.2 7-5 7-9.5V4l-7-3z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m6.5 10 2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><div><b>Your files never leave this computer.</b> This page has no server. Your browser reads the files and does every calculation itself; close the tab and nothing remains.</div></div>' +
      '<div class="grid-2" style="margin-top:0"><div class="panel"><h2 style="margin-bottom:12px">Your files</h2><div class="drop" id="drop">' +
        '<div class="file-row"><label for="file-inv"><b>Invoices</b> (required)</label><input type="file" id="file-inv" accept=".csv,text/csv"></div>' +
        '<div class="file-row"><label for="file-cus"><b>Customers</b> (optional, for limits)</label><input type="file" id="file-cus" accept=".csv,text/csv"></div>' +
        '<div class="file-row"><label for="asof"><b>Review date</b> (optional)</label><input type="date" id="asof" style="border:1px solid var(--rule-strong);border-radius:6px;padding:7px 9px"></div>' +
        '<p class="small muted" style="margin:10px 0 0">You can also drag both files onto this box.</p></div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button class="btn" type="button" id="run">Run the review</button><button class="btn ghost" type="button" id="reset">Back to the Westline sample</button></div>' +
        '<div id="data-msg"></div></div>' +
      '<div class="panel"><h2 style="margin-bottom:10px">What the files need</h2><p><b>Invoices:</b> one row per invoice with a customer ID, invoice date and amount. Add the due date and the paid date (blank if still open) to unlock payment scoring and the forecast. Column names are matched loosely, so "Invoice Date", "Doc Date" or "Posting Date" all work.</p>' +
        '<p><b>Customers:</b> credit limit, terms, who set the limit and when, and whether a card is on file. Without it, the review still scores risk and forecasts cash, using 30-day terms.</p>' +
        '<p>Dates can be 2026-10-31 or 10/31/2026. Amounts can include $ and commas.</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="btn ghost" type="button" data-tpl="invoices">Invoice template</button><button class="btn ghost" type="button" data-tpl="customers">Customer template</button><button class="btn ghost" type="button" id="dl-sample">Download the Westline sample</button></div></div></div>';
    $("#file-inv").addEventListener("change", function (e) { readFile(e.target.files[0], "invoices"); });
    $("#file-cus").addEventListener("change", function (e) { readFile(e.target.files[0], "customers"); });
    var drop = $("#drop");
    ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) {
      Array.prototype.forEach.call(e.dataTransfer.files, function (f) {
        var head = /cust|limit|account/i.test(f.name) && !/inv/i.test(f.name) ? "customers" : "invoices";
        readFile(f, head);
      });
    });
    $("#run").addEventListener("click", function () {
      if (!pending.invoices) return msg("err", "Choose an invoice file first.");
      var asOf = $("#asof").value ? E.parseDate($("#asof").value) : null;
      var r = load(pending.invoices, pending.customers, pending.invName.replace(/\.csv$/i, ""), asOf);
      if (r.error) return msg("err", r.error);
      state.source = "upload";
      msg("ok", "Read " + r.invoices.toLocaleString("en-US") + " invoices" + (r.skipped ? " (" + r.skipped + " rows skipped: missing customer, date or amount)" : "") + ". The review is ready on every tab.");
      setTimeout(function () { go("overview"); }, 900);
    });
    $("#reset").addEventListener("click", function () { loadSample(); go("overview"); });
    $all("[data-tpl]").forEach(function (b) { b.addEventListener("click", function () { download(b.dataset.tpl + "-template.csv", TEMPLATES[b.dataset.tpl]); }); });
    $("#dl-sample").addEventListener("click", function () { download("westline-invoices.csv", window.SAMPLE_DATA.invoices); setTimeout(function () { download("westline-customers.csv", window.SAMPLE_DATA.customers); }, 400); });
  }
  function readFile(file, kind) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      pending[kind] = r.result;
      if (kind === "invoices") pending.invName = file.name; else pending.cusName = file.name;
      msg("ok", "Loaded " + file.name + " as the " + (kind === "invoices" ? "invoice" : "customer") + " file." + (pending.invoices ? " Select Run the review." : " Now add the invoice file."));
    };
    r.onerror = function () { msg("err", "Could not read " + file.name + ". Save it as CSV and try again."); };
    r.readAsText(file);
  }
  function msg(kind, text) { var el = $("#data-msg"); if (el) el.innerHTML = '<div class="msg ' + kind + '" role="status">' + esc(text) + "</div>"; }

  // ---------------------------------------------------------------- credit memo
  var lastFocus = null;
  function openMemo(id) {
    var a = cache.model.accounts.find(function (x) { return x.id === id; });
    if (!a) return;
    lastFocus = document.activeElement;
    var asOf = cache.model.asOf;
    var months = [];
    for (var k = 11; k >= 0; k--) { var d = new Date(asOf); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - k); months.push(d.getTime()); }
    var sales = months.map(function (t) { return a.monthly[E.monthKey(t)] || 0; });
    var lateByMonth = months.map(function (t) {
      var key = E.monthKey(t), num = 0, den = 0;
      a.invoices.forEach(function (i) { if (i.paid && i.settledBy === "payment" && E.monthKey(i.paid) === key) { num += Math.max(0, (i.paid - i.due) / DAY) * i.amount; den += i.amount; } });
      return den ? num / den : 0;
    });
    var labels = months.map(function (t) { var d = new Date(t); return { short: MONTHS[d.getUTCMonth()], long: MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear() }; });
    var ag = a.aging;
    var decisionLimit = a.action === "Card or prepay only" || a.action === "Move to card on file" ? "No open credit" : full(a.recLimit);
    $("#memo").innerHTML =
      '<div class="memo-head"><div><h2>' + esc(a.name) + '</h2><div class="memo-meta">' + esc([a.id, a.yard, a.segment, "Net " + a.terms].filter(Boolean).join(", ")) +
        (a.opened ? ", customer since " + fdate(a.opened) : "") + "<br>Review date " + fdate(asOf) + "</div></div>" +
        '<div style="text-align:right">' + chip(a.band) + '<div style="font-size:30px;font-weight:600;margin-top:4px">' + a.score + '<span class="muted" style="font-size:15px;font-weight:400"> / 100 risk points</span></div></div></div>' +
      '<div class="memo-decision"><div><div class="l">Limit on file</div><div class="v">' + (a.limit ? full(a.limit) : "None") + '</div><div class="s">' + esc((a.limitSetBy && a.limitSetBy !== "Not recorded" ? "Set by " + a.limitSetBy : "No record of who set it") + (a.limitSetDate ? ", " + fdate(a.limitSetDate) : "")) + "</div></div>" +
        '<div><div class="l">Recommended</div><div class="v">' + decisionLimit + '</div><div class="s">' + esc(a.action) + "</div></div>" +
        '<div><div class="l">Signs off</div><div class="v" style="font-size:18px;padding-top:4px">' + esc(a.approver || "No change needed") + '</div><div class="s">Owes ' + full(a.open) + (a.limit ? ", " + pct(a.open / a.limit) + " of limit" : "") + "</div></div></div>" +
      (whyList(a).length ? "<h3>Why</h3><ul class=\"reasons\">" + whyList(a).map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>" : "") +
      "<h3>How the score adds up</h3><table class=\"parts\"><tbody>" + a.scoreParts.map(function (p) {
        return "<tr><td style=\"width:140px\"><b>" + esc(p.label) + '</b></td><td style="width:34%"><div class="bar"><i style="width:' + (p.points / p.max * 100) + "%;background:var(--" + a.band.toLowerCase() + ')"></i></div></td><td class="num" style="width:70px">' + (Math.round(p.points * 10) / 10) + " / " + p.max + '</td><td class="muted">' + esc(p.why) + "</td></tr>";
      }).join("") + "</tbody></table>" +
      '<div class="memo-charts"><div><h3>Purchases by month</h3><div class="chart" id="memo-sales"></div></div><div><h3>Days past due when paid</h3><div class="chart" id="memo-late"></div></div></div>' +
      "<h3>Open balance by age</h3><table><thead><tr><th class=\"num\">Not yet due</th><th class=\"num\">1–30</th><th class=\"num\">31–60</th><th class=\"num\">61–90</th><th class=\"num\">91–120</th><th class=\"num\">120+</th><th class=\"num\">Total</th></tr></thead><tbody><tr>" +
        [ag.current, ag.d1_30, ag.d31_60, ag.d61_90, ag.d91_120, ag.d120, a.open].map(function (x) { return '<td class="num">' + (x ? full(x) : "–") + "</td>"; }).join("") + "</tr></tbody></table>" +
      '<p class="small muted" style="margin-top:10px">Last payment ' + (a.lastPayment ? fdate(a.lastPayment) + " (" + days(a.daysSincePayment) + " ago)" : "none on record") + ". Average month of purchases " + full(a.avgMonthly) + ", busiest month " + full(a.peakMonthly) + ".</p>" +
      '<div class="signoff"><div>Prepared by</div><div>Approved by (' + esc(a.approver || "not required") + ")</div></div>";
    $("#backdrop").hidden = false; $("#drawer").hidden = false;
    C.bars($("#memo-sales"), labels, sales, { ref: a.limit || null, refLabel: a.limit ? "Limit on file" : "" });
    C.bars($("#memo-late"), labels, lateByMonth, { color: "var(--" + a.band.toLowerCase() + ")", fmt: function (v) { return Math.round(v) + "d"; } });
    $("#close-drawer").focus();
  }
  function closeMemo() { $("#backdrop").hidden = true; $("#drawer").hidden = true; C.hideTip(); if (lastFocus) lastFocus.focus(); }

  // ---------------------------------------------------------------- start
  function loadSample() {
    state.source = "sample";
    var r = load(window.SAMPLE_DATA.invoices, window.SAMPLE_DATA.customers, "Westline Auto Parts (sample)");
    if (r.error) $("#source-label").textContent = r.error;
  }
  document.addEventListener("DOMContentLoaded", function () {
    var cfg = window.SITE_CONFIG || {};
    if (cfg.authorName) $("#credit").innerHTML = "Built by " + (cfg.authorLink ? '<a href="' + esc(cfg.authorLink) + '" rel="noopener">' + esc(cfg.authorName) + "</a>" : esc(cfg.authorName));
    $all(".tab").forEach(function (t) { t.addEventListener("click", function () { go(t.dataset.view); }); });
    $all("[data-goto]").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.goto); }); });
    $("#close-drawer").addEventListener("click", closeMemo);
    $("#backdrop").addEventListener("click", closeMemo);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#drawer").hidden) closeMemo(); });
    $("#print-memo").addEventListener("click", function () { document.body.classList.add("printing-memo"); window.print(); setTimeout(function () { document.body.classList.remove("printing-memo"); }, 500); });
    var t; window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(function () { if (cache.model && state.view !== "data") render(state.view); }, 200); });
    var start = (location.hash || "#overview").slice(1);
    loadSample();
    go(["overview", "accounts", "limits", "forecast", "whatif", "method", "data"].indexOf(start) !== -1 ? start : "overview");
  });
})();
