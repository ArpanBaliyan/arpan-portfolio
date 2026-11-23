/*
 * Credit Control engine
 * ---------------------
 * Every number on the site comes from this file. It has no screen code, so the
 * same functions can be tested on their own (see tools/check_engine.js).
 *
 * The flow:
 *   1. read the two CSV files (invoices, and optionally customers)
 *   2. build one profile per customer as of a chosen date
 *   3. score the risk of each customer from 7 plain rules (0 to 100 points)
 *   4. recommend a credit limit and an action for each customer
 *   5. forecast cash coming in over the next 13 weeks, invoice by invoice
 *   6. test the forecast by running it from an earlier date and comparing it
 *      with the cash that actually came in
 */
(function (root) {
  "use strict";

  var DAY = 86400000;

  // ------------------------------------------------------------------ settings
  // Every threshold the model uses lives here, so it can be explained and changed.
  var DEFAULTS = {
    historyDays: 180,          // payment behaviour window
    allowanceDays: 15,         // days of slack added to terms when sizing a limit
    newAccountDays: 180,       // accounts younger than this are on probation
    probationCap: 5000,        // highest limit an account on probation can get
    minLimit: 500,             // smallest limit worth setting for an active account
    bands: [                   // risk points -> band
      { name: "Low", min: 0, limitMultiplier: 1.1 },
      { name: "Watch", min: 20, limitMultiplier: 1.0 },
      { name: "High", min: 40, limitMultiplier: 0.6 },
      { name: "Severe", min: 60, limitMultiplier: 0 }
    ],
    // chance that an account in each band defaults within a year (used for expected loss)
    defaultRate: { Low: 0.005, Watch: 0.02, High: 0.08, Severe: 0.30 },
    lossGivenDefault: 0.8,
    // share of an open invoice we expect to collect at all, by band (used in the forecast)
    collectible: { Low: 0.99, Watch: 0.96, High: 0.88, Severe: 0.6 },
    approval: [               // who signs a new limit
      { upTo: 5000, role: "Credit analyst" },
      { upTo: 25000, role: "Credit manager" },
      { upTo: Infinity, role: "Controller" }
    ],
    grossMargin: 0.30,
    forecastWeeks: 13
  };

  // ------------------------------------------------------------------ CSV reading
  function parseCSV(text) {
    var rows = [], row = [], field = "", i = 0, q = false, c;
    text = String(text || "").replace(/^﻿/, "");
    while (i < text.length) {
      c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); });
  }

  // Many systems name the same column differently. These are the names we accept.
  var INVOICE_COLUMNS = {
    invoice_id: ["invoice_id", "invoice", "num", "invoice no", "invoice number", "invoice #", "inv no", "document no", "doc no", "reference"],
    customer_id: ["customer_id", "customer id", "customer", "customer no", "customer number", "account", "account no", "account number", "cust id", "acct"],
    customer_name: ["customer_name", "customer name", "name", "account name", "company"],
    invoice_date: ["invoice_date", "invoice date", "date", "doc date", "document date", "posting date"],
    due_date: ["due_date", "due date", "due", "net due date"],
    amount: ["amount", "invoice amount", "original amount", "total", "invoice total", "amount usd"],
    paid_date: ["paid_date", "paid date", "payment date", "date paid", "closed date", "cleared date"],
    settled_by: ["settled_by", "settled by", "settlement", "closed by"],
    disputed: ["disputed", "dispute", "in dispute"],
    returned_payment: ["returned_payment", "returned payment", "bounced", "nsf", "returned check"]
  };
  var CUSTOMER_COLUMNS = {
    customer_id: INVOICE_COLUMNS.customer_id,
    customer_name: INVOICE_COLUMNS.customer_name,
    yard: ["yard", "branch", "location", "region", "site"],
    segment: ["segment", "customer type", "type", "industry", "class"],
    terms_days: ["terms_days", "terms", "payment terms", "net days", "terms days"],
    credit_limit: ["credit_limit", "credit limit", "limit"],
    limit_set_by: ["limit_set_by", "limit set by", "approved by", "set by"],
    limit_set_date: ["limit_set_date", "limit set date", "limit date", "last review", "limit review date"],
    account_opened: ["account_opened", "account opened", "opened", "open date", "customer since"],
    card_on_file: ["card_on_file", "card on file", "card"],
    broken_promises_90d: ["broken_promises_90d", "broken promises", "broken promises 90d", "missed promises"]
  };

  function norm(h) { return String(h).trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " "); }

  function mapColumns(header, spec) {
    var found = {}, used = {};
    var normed = header.map(norm);
    Object.keys(spec).forEach(function (key) {
      var names = spec[key].map(norm);
      for (var j = 0; j < normed.length; j++) {
        if (!used[j] && names.indexOf(normed[j]) !== -1) { found[key] = j; used[j] = true; return; }
      }
    });
    return found;
  }

  function parseDate(s) {
    s = String(s || "").trim();
    if (!s) return null;
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);           // US style M/D/YYYY
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return Date.UTC(y, +m[1] - 1, +m[2]); }
    var t = Date.parse(s + " UTC");
    if (!isNaN(t)) { var d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
    return null;
  }

  function parseMoney(s) {
    if (s === undefined || s === null) return NaN;
    s = String(s).trim();
    var neg = /^\(.*\)$/.test(s);
    var v = parseFloat(s.replace(/[$,()\s]/g, ""));
    return neg ? -v : v;
  }

  function yes(s) { return /^(y|yes|true|1|x)$/i.test(String(s || "").trim()); }

  function readInvoices(text) {
    var rows = parseCSV(text);
    if (rows.length < 2) return { error: "The invoice file has no rows." };
    var col = mapColumns(rows[0], INVOICE_COLUMNS);
    var missing = ["customer_id", "invoice_date", "amount"].filter(function (k) { return col[k] === undefined; });
    if (missing.length) return { error: "The invoice file needs these columns: " + missing.join(", ") + ". Download the template to see the expected headers." };
    var out = [], skipped = 0;
    for (var r = 1; r < rows.length; r++) {
      var x = rows[r];
      var inv = {
        id: col.invoice_id !== undefined ? x[col.invoice_id] : "row " + r,
        cust: String(x[col.customer_id] || "").trim(),
        custName: col.customer_name !== undefined ? x[col.customer_name] : "",
        date: parseDate(x[col.invoice_date]),
        due: col.due_date !== undefined ? parseDate(x[col.due_date]) : null,
        amount: parseMoney(x[col.amount]),
        paid: col.paid_date !== undefined ? parseDate(x[col.paid_date]) : null,
        settledBy: col.settled_by !== undefined ? String(x[col.settled_by] || "").trim().toLowerCase() : "",
        disputed: col.disputed !== undefined ? yes(x[col.disputed]) : false,
        returned: col.returned_payment !== undefined ? yes(x[col.returned_payment]) : false
      };
      if (!inv.cust || inv.date === null || !isFinite(inv.amount) || inv.amount <= 0) { skipped++; continue; }
      if (inv.paid !== null && !inv.settledBy) inv.settledBy = "payment";
      out.push(inv);
    }
    return { invoices: out, skipped: skipped, hasPaidDates: col.paid_date !== undefined, hasDueDates: col.due_date !== undefined };
  }

  function readCustomers(text) {
    var rows = parseCSV(text);
    if (rows.length < 2) return { error: "The customer file has no rows." };
    var col = mapColumns(rows[0], CUSTOMER_COLUMNS);
    if (col.customer_id === undefined) return { error: "The customer file needs a customer_id column." };
    var out = {};
    for (var r = 1; r < rows.length; r++) {
      var x = rows[r];
      var get = function (k) { return col[k] !== undefined ? x[col[k]] : undefined; };
      var id = String(get("customer_id") || "").trim();
      if (!id) continue;
      var lim = parseMoney(get("credit_limit"));
      out[id] = {
        name: get("customer_name") || "",
        yard: get("yard") || "",
        segment: get("segment") || "",
        terms: parseInt(get("terms_days"), 10) || null,
        limit: isFinite(lim) && lim > 0 ? lim : 0,
        limitSetBy: get("limit_set_by") || "",
        limitSetDate: parseDate(get("limit_set_date")),
        opened: parseDate(get("account_opened")),
        cardOnFile: yes(get("card_on_file")),
        brokenPromises: parseInt(get("broken_promises_90d"), 10) || 0
      };
    }
    return { customers: out };
  }

  // ------------------------------------------------------------------ helpers
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function days(ms) { return Math.round(ms / DAY); }
  function niceLimit(x) {
    if (x <= 0) return 0;
    var step = x < 5000 ? 250 : x < 20000 ? 500 : 1000;
    return Math.max(step, Math.round(x / step) * step);
  }
  function weightedMean(pairs) {     // [[value, weight], ...]
    var s = 0, w = 0;
    pairs.forEach(function (p) { s += p[0] * p[1]; w += p[1]; });
    return w ? s / w : null;
  }
  function monthKey(t) { var d = new Date(t); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; }
  function bandOf(points, s) {
    var b = s.bands[0];
    s.bands.forEach(function (x) { if (points >= x.min) b = x; });
    return b;
  }
  function approverFor(newLimit, s) {
    for (var i = 0; i < s.approval.length; i++) if (newLimit <= s.approval[i].upTo) return s.approval[i].role;
    return s.approval[s.approval.length - 1].role;
  }

  // ------------------------------------------------------------------ the model
  /*
   * Build everything as of one date, using only what was known on that date.
   * Invoices raised after asOf are ignored, and a payment made after asOf
   * counts as still open. That is what makes the back-test honest.
   */
  function buildModel(invoicesAll, customersIn, opts) {
    var s = Object.assign({}, DEFAULTS, (opts && opts.settings) || {});
    var asOf = opts && opts.asOf;
    if (!asOf) {
      asOf = 0;
      invoicesAll.forEach(function (i) { if (i.date > asOf) asOf = i.date; if (i.paid && i.paid > asOf) asOf = i.paid; });
    }
    var custInfo = customersIn || {};
    var hasLimits = Object.keys(custInfo).some(function (k) { return custInfo[k].limit > 0; });

    // group invoices by customer, as known on asOf
    var groups = {};
    invoicesAll.forEach(function (i) {
      if (i.date > asOf) return;
      var info = custInfo[i.cust] || {};
      var terms = info.terms || 30;
      var inv = {
        id: i.id, amount: i.amount, date: i.date,
        due: i.due !== null && i.due !== undefined ? i.due : i.date + terms * DAY,
        paid: i.paid !== null && i.paid !== undefined && i.paid <= asOf ? i.paid : null,
        settledBy: i.paid !== null && i.paid !== undefined && i.paid <= asOf ? i.settledBy : "",
        disputed: i.disputed, returned: i.returned && i.paid !== null && i.paid <= asOf
      };
      (groups[i.cust] = groups[i.cust] || { name: i.custName, invoices: [] }).invoices.push(inv);
    });
    Object.keys(custInfo).forEach(function (id) { if (!groups[id]) groups[id] = { name: "", invoices: [] }; });

    var accounts = [];
    var poolDbt = [];   // everyone's late days, used when a customer has too little history

    Object.keys(groups).forEach(function (id) {
      var g = groups[id], info = custInfo[id] || {};
      var invs = g.invoices;
      var a = {
        id: id,
        name: info.name || g.name || id,
        yard: info.yard || "",
        segment: info.segment || "",
        terms: info.terms || 30,
        limit: info.limit || 0,
        limitSetBy: info.limitSetBy || "",
        limitSetDate: info.limitSetDate || null,
        opened: info.opened || null,
        cardOnFile: !!info.cardOnFile,
        brokenPromises: info.brokenPromises || 0,
        invoices: invs
      };

      var since = asOf - s.historyDays * DAY;
      var firstInvoice = invs.reduce(function (m, i) { return Math.min(m, i.date); }, Infinity);
      a.firstInvoice = isFinite(firstInvoice) ? firstInvoice : null;
      var ageDays = a.opened ? days(asOf - a.opened) : (a.firstInvoice ? days(asOf - a.firstInvoice) : 0);
      a.accountAgeDays = ageDays;

      // open balance and aging
      a.open = 0; a.pastDue = 0; a.over60 = 0; a.over90 = 0; a.disputedOpen = 0;
      a.aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d120: 0 };
      var openPairs = [];
      invs.forEach(function (i) {
        if (i.paid) return;
        var late = days(asOf - i.due);
        a.open += i.amount;
        if (i.disputed) a.disputedOpen += i.amount;
        if (late > 0) { a.pastDue += i.amount; openPairs.push([late, i.amount]); }
        if (late > 60) a.over60 += i.amount;
        if (late > 90) a.over90 += i.amount;
        var k = late <= 0 ? "current" : late <= 30 ? "d1_30" : late <= 60 ? "d31_60" : late <= 90 ? "d61_90" : late <= 120 ? "d91_120" : "d120";
        a.aging[k] += i.amount;
      });

      // payment behaviour: days beyond terms on invoices paid in the window
      var paidRecent = [], paidPrior = [], dbtSamples = [], dtpSamples = [];
      invs.forEach(function (i) {
        if (!i.paid || i.settledBy !== "payment") return;
        var dbt = days(i.paid - i.due);
        if (i.paid > since) {
          paidRecent.push([dbt, i.amount]);
          dbtSamples.push({ dbt: dbt, w: i.amount });
          dtpSamples.push({ d: days(i.paid - i.date), w: i.amount });
          if (i.paid > asOf - 90 * DAY) a._r = (a._r || []).concat([[dbt, i.amount]]);
          else a._p = (a._p || []).concat([[dbt, i.amount]]);
        }
      });
      a.dbtSamples = dbtSamples;
      a.dtpSamples = dtpSamples;
      dbtSamples.forEach(function (x) { poolDbt.push(x); });
      a.paidDbt = weightedMean(paidRecent);
      // open past-due invoices count at their current age, so an account that
      // has simply stopped paying still looks late
      a.effectiveDbt = weightedMean(paidRecent.concat(openPairs));
      var recent = (a._r || []).concat(openPairs);
      var prior = a._p || [];
      a.dbtRecent = weightedMean(recent);
      a.dbtPrior = weightedMean(prior);
      a.trend = a.dbtRecent !== null && a.dbtPrior !== null && prior.length >= 2 ? a.dbtRecent - a.dbtPrior : null;
      delete a._r; delete a._p;

      // buying pattern
      var monthly = {};
      invs.forEach(function (i) { var k = monthKey(i.date); monthly[k] = (monthly[k] || 0) + i.amount; });
      a.monthly = monthly;
      var sales6 = 0, sales90 = 0, peak = 0;
      var mcount = 0;
      for (var m = 0; m < 6; m++) {
        var d = new Date(asOf); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - m);
        var v = monthly[monthKey(d.getTime())] || 0;
        peak = Math.max(peak, v);
      }
      invs.forEach(function (i) {
        if (i.date > since) sales6 += i.amount;
        if (i.date > asOf - 90 * DAY) sales90 += i.amount;
      });
      mcount = clamp(Math.ceil(Math.min(s.historyDays, Math.max(ageDays, 30)) / 30), 1, 6);
      a.avgMonthly = sales6 / mcount;
      a.peakMonthly = peak;
      a.sales90 = sales90;
      a.active = sales90 > 0 || a.open > 0;

      // credit events
      var since12 = asOf - 365 * DAY;
      a.returnedPayments = invs.filter(function (i) { return i.returned && i.paid && i.paid > since12; }).length;
      var inv6 = invs.filter(function (i) { return i.date > since; });
      a.disputeRate = inv6.length ? inv6.filter(function (i) { return i.disputed; }).length / inv6.length : 0;
      var lastPay = 0;
      invs.forEach(function (i) { if (i.paid && i.settledBy === "payment" && i.paid > lastPay) lastPay = i.paid; });
      a.lastPayment = lastPay || null;
      a.daysSincePayment = lastPay ? days(asOf - lastPay) : null;

      accounts.push(a);
    });

    // ---------------------------------------------------------------- score
    accounts.forEach(function (a) { scoreAccount(a, s, hasLimits); });

    // ---------------------------------------------------------------- limits
    accounts.forEach(function (a) { recommendLimit(a, s, hasLimits); });

    var model = { asOf: asOf, settings: s, accounts: accounts, hasLimits: hasLimits, poolDbt: poolDbt };
    model.summary = summarise(model);
    return model;
  }

  /*
   * Risk points, 0 to 100. Higher means riskier. Seven rules, each with a cap,
   * so no single signal can dominate and every point can be explained.
   */
  function scoreAccount(a, s, hasLimits) {
    var parts = [];
    var dbt = a.effectiveDbt === null ? 0 : a.effectiveDbt;
    parts.push({ key: "late", label: "Pays late", max: 30,
      points: clamp(dbt / 45, 0, 1) * 30,
      why: a.effectiveDbt === null ? "No payment history in the last 6 months" : "Pays on average " + Math.round(dbt) + " days " + (dbt >= 0 ? "after" : "before") + " the due date" });
    var tr = a.trend === null ? 0 : a.trend;
    parts.push({ key: "trend", label: "Getting worse", max: 15,
      points: clamp(tr / 20, 0, 1) * 15,
      why: a.trend === null ? "Not enough history to see a trend" : (tr > 0 ? "Paying " + Math.round(tr) + " days slower than 3 to 6 months ago" : "Paying " + Math.round(-tr) + " days faster than 3 to 6 months ago") });
    var aged = a.open > 0 ? a.over60 / a.open : 0;
    parts.push({ key: "aged", label: "Old balance", max: 20,
      points: clamp(aged / 0.5, 0, 1) * 20,
      why: Math.round(aged * 100) + "% of the open balance is more than 60 days past due" });
    var limPts, limWhy;
    if (!hasLimits) { limPts = 0; limWhy = "No credit limits were supplied"; }
    else if (!a.limit) { limPts = a.open > 0 ? 8 : 0; limWhy = "No credit limit on file"; }
    else {
      var util = a.open / a.limit;
      limPts = clamp((util - 0.8) / 1.2, 0, 1) * 15;
      limWhy = "Owes " + Math.round(util * 100) + "% of the limit on file";
    }
    parts.push({ key: "limit", label: "Over limit", max: 15, points: limPts, why: limWhy });
    parts.push({ key: "returned", label: "Returned payments", max: 10,
      points: Math.min(10, a.returnedPayments * 5),
      why: a.returnedPayments + " returned payment" + (a.returnedPayments === 1 ? "" : "s") + " in the last 12 months" });
    parts.push({ key: "disputes", label: "Disputes", max: 5,
      points: clamp(a.disputeRate / 0.15, 0, 1) * 5,
      why: Math.round(a.disputeRate * 100) + "% of invoices disputed in the last 6 months" });
    parts.push({ key: "promises", label: "Broken promises", max: 5,
      points: Math.min(5, a.brokenPromises * 2.5),
      why: a.brokenPromises + " broken payment promise" + (a.brokenPromises === 1 ? "" : "s") + " in the last 90 days" });
    parts.forEach(function (p) { p.points = Math.round(p.points * 10) / 10; });
    a.scoreParts = parts;
    a.score = Math.round(parts.reduce(function (t, p) { return t + p.points; }, 0));
    var b = bandOf(a.score, s);
    a.band = b.name;
    a.bandMultiplier = b.limitMultiplier;
  }

  /*
   * Recommended limit = what the account needs to keep buying the way it buys,
   * adjusted for risk.
   *   need = (average month + a quarter of the gap to the busiest month) x (terms + 15 days) / 30
   *   recommended = need x band multiplier (Low 1.1, Watch 1.0, High 0.6, Severe 0)
   */
  function recommendLimit(a, s, hasLimits) {
    var base = a.avgMonthly + 0.25 * Math.max(0, a.peakMonthly - a.avgMonthly);
    a.need = base * (a.terms + s.allowanceDays) / 30;
    var rec = niceLimit(a.need * a.bandMultiplier);
    if (a.bandMultiplier > 0 && a.sales90 > 0) rec = Math.max(rec, s.minLimit);
    a.probation = a.accountAgeDays < s.newAccountDays;
    if (a.probation && rec > s.probationCap) rec = s.probationCap;
    var reasons = [];
    var action;
    if (!a.active) {
      rec = 0;
      action = a.limit > 0 ? "Close dormant limit" : "No action";
      if (a.limit > 0) reasons.push("No orders and nothing owed in 90 days, but a limit of " + money(a.limit) + " is still open");
    } else if (a.band === "Severe") {
      rec = 0;
      action = a.cardOnFile ? "Move to card on file" : "Card or prepay only";
      reasons.push("Risk points of " + a.score + " put the account in the Severe band");
      if (a.cardOnFile) reasons.push("A card is on file, so orders can continue as card payments");
      else reasons.push("New orders ship on card or prepayment until the past-due balance is cleared, so the sale is kept without adding exposure");
    } else if (a.returnedPayments >= 3) {
      // repeat returned payments: keep selling, but only against card or prepayment
      rec = 0;
      action = a.cardOnFile ? "Move to card on file" : "Card or prepay only";
      reasons.push(a.returnedPayments + " returned payments in 12 months. Policy: three or more means card or prepayment only, whatever the score");
    } else if (hasLimits && !a.limit) {
      action = "Set first limit";
      reasons.push("The account buys on credit with no limit on file");
    } else if (!hasLimits) {
      action = "Set limit";
    } else if (a.limit < rec * 0.67) {
      action = "Raise";
      reasons.push("Buys about " + money(a.avgMonthly) + " a month, more than the " + money(a.limit) + " limit supports");
    } else if (a.limit > rec * 1.5) {
      action = "Lower";
      reasons.push("The " + money(a.limit) + " limit is " + (a.limit / Math.max(rec, 1)).toFixed(1) + " times what the account needs");
    } else {
      action = "Keep";
    }
    if (a.probation && a.active && a.band !== "Severe") reasons.push("Account is under 6 months old, so the limit is capped at " + money(s.probationCap) + " until it has more history");
    if (a.band === "High" && a.active && rec > 0) reasons.push("High risk band, so the limit is sized at 60% of need");
    a.recLimit = rec;
    a.action = action;
    a.change = rec - (a.limit || 0);
    a.overLimit = a.limit > 0 && a.open > a.limit;
    a.drift = a.limit > 0 && rec > 0 ? a.limit / rec : null;
    a.approver = action === "Card or prepay only" || action === "Move to card on file" || action === "Close dormant limit"
      ? "Credit manager"
      : action === "Keep" || action === "No action" ? "" : approverFor(Math.max(rec, a.limit || 0), s);
    a.reasons = reasons;
    // exposure: what we could lose if the account fails
    a.exposureNow = Math.max(a.open, a.peakMonthly * (a.terms + Math.max(0, a.effectiveDbt || 0)) / 30);
    a.expectedLoss = a.open * s.defaultRate[a.band] * s.lossGivenDefault;
  }

  function money(x) {
    if (x === null || x === undefined || !isFinite(x)) return "–";
    var neg = x < 0; x = Math.abs(x);
    var s = x >= 1e6 ? "$" + (x / 1e6).toFixed(2) + "M" : x >= 10000 ? "$" + Math.round(x / 1000) + "K" : "$" + Math.round(x).toLocaleString("en-US");
    return (neg ? "−" : "") + s;
  }

  function summarise(model) {
    var s = model.settings;
    var acc = model.accounts.filter(function (a) { return a.active || a.limit > 0; });
    var sum = { accounts: acc.length, open: 0, pastDue: 0, over60: 0, bands: {}, actions: {}, expectedLoss: 0,
      limitsOnFile: 0, recommendedTotal: 0, noLimit: 0, overLimit: 0, overLimitAmount: 0, over3x: 0, under3x: 0, dormant: 0, dormantAmount: 0 };
    s.bands.forEach(function (b) { sum.bands[b.name] = { accounts: 0, open: 0, expectedLoss: 0, sales: 0 }; });
    acc.forEach(function (a) {
      sum.open += a.open; sum.pastDue += a.pastDue; sum.over60 += a.over60;
      var b = sum.bands[a.band]; b.accounts++; b.open += a.open; b.expectedLoss += a.expectedLoss; b.sales += a.avgMonthly;
      sum.expectedLoss += a.expectedLoss;
      sum.actions[a.action] = (sum.actions[a.action] || 0) + 1;
      sum.limitsOnFile += a.limit || 0;
      sum.recommendedTotal += a.recLimit || 0;
      if (a.active && model.hasLimits && !a.limit) sum.noLimit++;
      if (a.overLimit) { sum.overLimit++; sum.overLimitAmount += a.open - a.limit; }
      if (a.active && a.limit > 0 && a.avgMonthly > 3 * a.limit) sum.over3x++;
      if (a.active && a.limit > 0 && a.recLimit > 0 && a.limit > 3 * a.recLimit) sum.under3x++;
      if (a.action === "Close dormant limit") { sum.dormant++; sum.dormantAmount += a.limit; }
    });
    // who set the limits that have drifted most
    var setters = {};
    acc.forEach(function (a) {
      if (!a.limit || !a.active || !a.recLimit) return;
      var k = a.limitSetBy || "Not recorded";
      var t = setters[k] = setters[k] || { name: k, count: 0, off: 0, neverReviewed: 0 };
      t.count++;
      if (a.drift > 1.5 || a.drift < 0.67) t.off++;
    });
    sum.setters = Object.keys(setters).map(function (k) { return setters[k]; }).sort(function (x, y) { return y.count - x.count; });
    // limits not reviewed in over a year
    sum.staleLimits = acc.filter(function (a) { return a.limit > 0 && a.limitSetDate && model.asOf - a.limitSetDate > 365 * DAY; }).length;
    sum.limitsCount = acc.filter(function (a) { return a.limit > 0; }).length;
    return sum;
  }

  // ------------------------------------------------------------------ forecast
  /*
   * Cash forecast, invoice by invoice.
   * For each open invoice we look at how many days late this customer paid
   * over the last 6 months. Only the outcomes still possible today count
   * (an invoice already 20 days late cannot be paid 5 days late). Each
   * outcome gets an equal share of the invoice, scaled by how collectible the
   * band is, and lands in the week it would arrive.
   * A second layer estimates cash from invoices not raised yet, using each
   * customer's recent weekly sales and how long they take to pay.
   */
  function forecast(model, weeks) {
    var s = model.settings;
    weeks = weeks || s.forecastWeeks;
    var start = model.asOf;
    var end = start + weeks * 7 * DAY;
    var openLayer = new Array(weeks).fill(0), newLayer = new Array(weeks).fill(0);
    var notExpected = 0, beyond = 0;
    var pool = model.poolDbt;
    function weekOf(t) { return Math.floor((t - start - 1) / (7 * DAY)); }

    model.accounts.forEach(function (a) {
      var samples = a.dbtSamples.length >= 4 ? a.dbtSamples : pool;
      var collectible = s.collectible[a.band];
      a.invoices.forEach(function (i) {
        if (i.paid) return;
        var age = days(start - i.due);
        var possible = samples.filter(function (x) { return x.dbt > age; });
        var amount = i.amount * collectible * (i.disputed ? 0.5 : 1) * (age > 90 ? 0.6 : 1);
        notExpected += i.amount - amount;
        if (!possible.length) {
          // older than anything this customer has paid: spread a reduced share evenly
          var share = amount * 0.35;
          for (var w = 0; w < weeks; w++) openLayer[w] += share / weeks;
          beyond += amount - share;
          return;
        }
        var wsum = possible.reduce(function (t, x) { return t + x.w; }, 0);
        possible.forEach(function (x) {
          var payDay = i.due + x.dbt * DAY + (i.disputed ? 30 * DAY : 0);
          if (payDay <= start) payDay = start + DAY;
          var part = amount * x.w / wsum;
          var w = weekOf(payDay);
          if (w >= 0 && w < weeks) openLayer[w] += part; else beyond += part;
        });
      });

      // invoices not raised yet
      if (a.band === "Severe" || a.sales90 <= 0) return;
      var weekly = a.sales90 / 13;
      var dtp = a.dtpSamples.length >= 4 ? a.dtpSamples : null;
      var meanDtp = dtp ? weightedMean(dtp.map(function (x) { return [x.d, x.w]; })) : a.terms + 10;
      for (var k = 0; k < weeks; k++) {
        var raised = start + (k + 0.5) * 7 * DAY;
        var pay = raised + meanDtp * DAY;
        var wk = weekOf(pay);
        if (wk >= 0 && wk < weeks) newLayer[wk] += weekly * collectible;
      }
    });

    var labels = [];
    for (var w = 0; w < weeks; w++) labels.push(start + (w * 7 + 1) * DAY);
    return { start: start, end: end, weekStarts: labels, fromOpen: openLayer, fromNew: newLayer,
      notExpected: notExpected, beyond: beyond,
      totalOpen: openLayer.reduce(sum0, 0), totalNew: newLayer.reduce(sum0, 0) };
  }
  function sum0(a, b) { return a + b; }

  // Cash actually received each week (payments only, not credits)
  function actualCash(invoicesAll, start, weeks) {
    var out = new Array(weeks).fill(0);
    invoicesAll.forEach(function (i) {
      if (!i.paid || (i.settledBy && i.settledBy !== "payment")) return;
      if (i.date > start + weeks * 7 * DAY) return;
      var w = Math.floor((i.paid - start - 1) / (7 * DAY));
      if (w >= 0 && w < weeks) out[w] += i.amount;
    });
    return out;
  }

  /*
   * Back-test: pretend today is 13 weeks ago, build the model with only what
   * was known then, forecast 13 weeks, and compare with what actually came in.
   */
  function backtest(invoicesAll, customers, asOf, settings) {
    var weeks = 13;
    var past = asOf - weeks * 7 * DAY;
    var earliest = invoicesAll.reduce(function (m, i) { return Math.min(m, i.date); }, Infinity);
    if (past - earliest < 200 * DAY) return null;  // not enough history to test
    var m = buildModel(invoicesAll, customers, { asOf: past, settings: settings });
    var f = forecast(m, weeks);
    var predicted = f.fromOpen.map(function (v, k) { return v + f.fromNew[k]; });
    var actual = actualCash(invoicesAll, past, weeks);
    var tp = predicted.reduce(sum0, 0), ta = actual.reduce(sum0, 0);
    var ape = 0, n = 0;
    actual.forEach(function (v, k) { if (v > 0) { ape += Math.abs(predicted[k] - v) / v; n++; } });
    // the first 4 weeks lean almost entirely on invoices already open
    var p4 = predicted.slice(0, 4).reduce(sum0, 0), a4 = actual.slice(0, 4).reduce(sum0, 0);
    return { start: past, weekStarts: f.weekStarts, predicted: predicted, actual: actual, fromOpen: f.fromOpen,
      totalPredicted: tp, totalActual: ta, totalError: ta ? (tp - ta) / ta : 0, weeklyMape: n ? ape / n : 0,
      first4Error: a4 ? (p4 - a4) / a4 : 0 };
  }

  // ------------------------------------------------------------------ what-if
  /*
   * Trade-off between credit losses avoided and sales given up.
   * Expected annual loss for an account = exposure x yearly default rate x 80% loss.
   * Exposure today is the larger of what it owes and what it runs up in its
   * busiest month, because limits are not enforced. A policy caps exposure;
   * the sales the cap blocks are partly lost (the rest arrive as card payments
   * or faster payments), and lost sales cost their gross margin.
   */
  function scenario(model, p) {
    var s = model.settings;
    var res = { lossBefore: 0, lossAfter: 0, salesLost: 0, marginLost: 0, accountsHeld: 0, accountsCut: 0,
      exposureBefore: 0, exposureAfter: 0, byBand: {} };
    s.bands.forEach(function (b) { res.byBand[b.name] = { before: 0, after: 0 }; });
    model.accounts.forEach(function (a) {
      if (!a.active) return;
      var rate = (p.defaultRate || s.defaultRate)[a.band] * s.lossGivenDefault;
      var exposure = a.exposureNow;
      var after = exposure;
      var annualSales = a.avgMonthly * 12;
      var blocked = 0;
      if (a.band === "Severe" && (p.severe === "hold" || p.severe === "card")) {
        after = a.open;                       // nothing new on credit
        // card or prepay keeps most of the buying; a hard hold loses more of it
        blocked = annualSales * (p.severe === "card" ? 0.5 : 1);
        res.accountsHeld++;
      } else if ((a.band === "High" && p.capHigh) || (p.capAll && a.band !== "Severe")) {
        if (a.recLimit < exposure) {
          after = Math.max(a.recLimit, 0);
          blocked = annualSales * clamp((exposure - a.recLimit) / exposure, 0, 1);
          res.accountsCut++;
        }
      }
      var lost = blocked * p.lostShare;
      res.salesLost += lost;
      res.marginLost += lost * (p.margin !== undefined ? p.margin : s.grossMargin);
      res.lossBefore += exposure * rate;
      res.lossAfter += after * rate;
      res.exposureBefore += exposure;
      res.exposureAfter += after;
      res.byBand[a.band].before += exposure * rate;
      res.byBand[a.band].after += after * rate;
    });
    res.lossAvoided = res.lossBefore - res.lossAfter;
    res.net = res.lossAvoided - res.marginLost;
    // the yearly failure rate at which this policy breaks even, for the accounts it touches
    var cut = res.exposureBefore - res.exposureAfter;
    res.breakEvenRate = cut > 0 ? res.marginLost / (cut * s.lossGivenDefault) : null;
    return res;
  }

  var api = {
    DEFAULTS: DEFAULTS, DAY: DAY,
    parseCSV: parseCSV, readInvoices: readInvoices, readCustomers: readCustomers,
    buildModel: buildModel, forecast: forecast, backtest: backtest, actualCash: actualCash,
    scenario: scenario, money: money, niceLimit: niceLimit, parseDate: parseDate, monthKey: monthKey
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CreditEngine = api;
})(typeof window !== "undefined" ? window : this);
