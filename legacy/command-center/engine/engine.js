// engine.js — Westline AR Command Center: Modules 2–12 (Account 360 to reconciliation).
// Pure JavaScript. Input: raw sheet rows. Output: finished tables, emails, KPIs and recon checks.
var WL_ENGINE = (function (C) {
  'use strict';
  var BUCKETS = ['Current', '1-30', '31-60', '61-90', '91-120', '120+'];
  function bucketOf(dpd) { return dpd <= 0 ? 'Current' : dpd <= 30 ? '1-30' : dpd <= 60 ? '31-60' : dpd <= 90 ? '61-90' : dpd <= 120 ? '91-120' : '120+'; }
  function tab(name, cols, rows, note) { return { name: name, cols: cols, rows: rows, note: note || '' }; }
  function sum(a, f) { var s = 0; a.forEach(function (x) { s += f ? f(x) : x; }); return s; }
  function by(a, k) { var o = {}; a.forEach(function (x) { (o[x[k]] = o[x[k]] || []).push(x); }); return o; }
  function round1(x) { return Math.round(x * 10) / 10; }
  function seeded(seed) { var h = 2166136261; for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000000) / 1000000; }; }
  function esc(s) { return C.str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function run(input, cfgOver) {
    var cfg = C.config(cfgOver), asOf = C.isoToDay(cfg.AS_OF), cal = C.makeCal(cfg), isBlank = C.makeBlank(cfg);
    var R = { tabs: {}, issues: [], recon: [], kpi: {}, emails: [], docs: [], site: {}, log: [] };
    function put(t) { R.tabs[t.name] = t; }

    // ---------- Agents and assignments ----------
    var agents = [], agentByKey = {}, agentLookup = {};
    input.agents.slice(1).forEach(function (r) { if (!C.trim(r[0])) return; var a = { key: C.trim(r[0]), name: C.trim(r[1]), email: C.trim(r[2]).toLowerCase(), role: C.trim(r[3]), active: /true|yes|1/i.test(r[4]), cap: +r[5] || 60, maxBucket: C.trim(r[6]) || '120+' };
      agents.push(a); agentByKey[a.key] = a; agentLookup[a.key.toLowerCase()] = a.key; agentLookup[a.name.toLowerCase()] = a.key; agentLookup[a.email] = a.key; });
    var ownerKey = (agents.filter(function (a) { return a.role === 'owner'; })[0] || agents[0]).key;
    function agentOf(v) { return agentLookup[C.trim(v).toLowerCase()] || null; }
    var assign = {}; (input.assignments || []).slice(1).forEach(function (r) { var id = C.normId(r[0], cfg).v; if (id && agentByKey[C.trim(r[1])]) assign[id] = C.trim(r[1]); });
    var overrides = {}; (input.overrides || []).slice(1).forEach(function (r) { if (!/false|no/i.test(r[5] || 'TRUE')) { var id = C.normId(r[0], cfg).v; (overrides[id] = overrides[id] || {})[C.trim(r[1])] = C.trim(r[2]); } });

    var ctx = { asOf: asOf, isBlank: isBlank, cal: cal, agentOf: agentOf, overrides: overrides, aliases: input.aliases || null };

    // ---------- Module 1: clean every source ----------
    var cust = C.cleanCustomers(input.customers, cfg, ctx); ctx.customers = cust;
    var inv = C.cleanInvoices(input.invoices, cfg, ctx);
    var known = {}; Object.keys(cust.byId).forEach(function (k) { known[k] = 1; }); inv.rows.forEach(function (x) { known[x.account_id] = 1; }); ctx.known = known;
    var act = C.cleanActivity([{ name: 'Call Log (phase 1)', rows: input.calls }, { name: 'Call History export', rows: input.callHistory }], cfg, ctx);
    var qry = C.cleanQueries(input.requests, cfg, ctx);
    var escl = C.cleanEscalations(input.escalations, cfg, ctx);
    var cbs = C.cleanChargebacks(input.chargebacks, cfg, ctx);
    var sales = C.cleanSales(input.sales, cfg, ctx);
    var pays = C.cleanPayments(input.payments, cfg, ctx);
    var alerts = C.parseAlerts(input.alerts, cfg, ctx, input.alertPatterns);
    R.issues = cust.issues.concat(inv.issues, act.issues, qry.issues, cbs.issues);

    // ---------- Module 2: Account 360 ----------
    var invBy = by(inv.rows, 'account_id'), actBy = by(act.rows, 'account_id'), qBy = by(qry.rows, 'account_id'), eBy = by(escl.rows, 'account_id'), cbBy = by(cbs.rows, 'account_id'), alBy = by(alerts.rows, 'account_id');
    var universe = {};
    Object.keys(invBy).forEach(function (k) { universe[k] = 1; });
    act.rows.forEach(function (x) { if (x.day >= asOf - 30) universe[x.account_id] = 1; });
    qry.rows.forEach(function (x) { if (x.group !== 'DONE' && x.account_id) universe[x.account_id] = 1; });
    escl.rows.forEach(function (x) { if (x.group !== 'DONE' && x.account_id) universe[x.account_id] = 1; });
    cbs.rows.forEach(function (x) { if (x.open && x.account_id) universe[x.account_id] = 1; });
    alerts.rows.forEach(function (x) { if (x.day >= asOf - 30) universe[x.account_id] = 1; });
    var ids = Object.keys(universe).sort();
    var weekStart = asOf - ((C.parts(asOf).wd + 6) % 7) - 7, weekEnd = weekStart + 4; // last full Mon–Fri
    var monthStart = C.ymd(C.parts(asOf).y, C.parts(asOf).m, 1);

    var A360 = ids.map(function (id) {
      var c = cust.byId[id] || {}, iv = invBy[id] || [], ac = actBy[id] || [], a = { account_id: id, in_master: !!cust.byId[id] };
      a.name = c.name_display || (iv[0] ? '(not in customer master)' : '(not in customer master)'); a.yard = c.yard || (iv[0] && iv[0].yard) || ''; a.salesperson = c.salesperson || ''; a.status = c.status || '';
      a.phone = c.phone || ''; a.phone_alt = c.phone_alt || ''; a.email = c.email || ''; a.contact = c.contact || ''; a.terms = c.terms || cfg.DEFAULT_TERMS; a.quality = c.quality === undefined ? '' : c.quality;
      a.limit = c.credit_limit === undefined ? null : c.credit_limit;
      // balance and aging
      a.open = 0; a.credits = 0; a.b = {}; BUCKETS.forEach(function (b) { a.b[b] = 0; }); a.oldest = 0; a.n_inv = 0; a.largest = 0; a.credit_pending = 0;
      iv.forEach(function (x) { if (x.open < 0) { a.credits += x.open; return; } a.open += x.open; a.n_inv++; a.b[bucketOf(x.dpd)] += x.open; if (x.dpd > a.oldest) a.oldest = x.dpd; if (x.open > a.largest) a.largest = x.open; if (/credit pending/i.test(x.flag)) a.credit_pending++; });
      a.balance = a.open + a.credits; a.past_due = a.open - a.b['Current']; a.oldest_bucket = a.n_inv ? bucketOf(a.oldest) : '';
      // activity
      var att = function (d0) { return ac.filter(function (x) { return x.day >= d0; }); };
      a.att7 = att(asOf - 6).length; a.att30 = att(asOf - 29).length; a.att_all = ac.length;
      var a60 = att(asOf - 59); a.att60 = a60.length; a.days60 = Object.keys(by(a60, 'day')).length;
      var isRPC = function (x) { return /^RPC_/.test(x.outcome); }, isContact = function (x) { return isRPC(x) || x.outcome === 'THIRD_PARTY'; };
      a.contacts30 = att(asOf - 29).filter(isContact).length; a.rpc30 = att(asOf - 29).filter(isRPC).length; a.rpc60 = a60.filter(isRPC).length;
      var last = ac[ac.length - 1]; a.last_day = last ? last.day : null; a.last_agent = last ? last.agent : ''; a.last_outcome = last ? last.raw_outcome : '';
      var lastC = ac.filter(isRPC).slice(-1)[0]; a.last_contact = lastC ? lastC.day : null; a.last_rpc_outcome = lastC ? lastC.outcome : '';
      a.since_touch = last ? asOf - last.day : null; a.never = !last; a.called_today = !!(last && last.day === asOf);
      a.agents7 = Object.keys(by(att(asOf - 6), 'agent')).length; a.agents30 = Object.keys(by(att(asOf - 29), 'agent')).length;
      a.wrong3 = ac.slice(-3).length === 3 && ac.slice(-3).every(function (x) { return x.outcome === 'WRONG_NUMBER' || x.outcome === 'DISCONNECTED'; });
      a.paid60 = a60.some(function (x) { return x.outcome === 'RPC_PAID'; }) || !!(pays.byId[id] && pays.byId[id].last !== null && pays.byId[id].last >= asOf - 60);
      // promises
      a.broken90 = 0; a.kept90 = 0; a.promise = null; var proms = [];
      ac.forEach(function (x, i) { if (x.outcome !== 'RPC_PROMISE' || x.promise_date === null) return;
        var limitDay = x.promise_date + cfg.PROMISE_GRACE_DAYS, paid = ac.slice(i + 1).some(function (y) { return y.outcome === 'RPC_PAID' && y.day <= limitDay; });
        var st = paid ? 'KEPT' : x.promise_date === asOf ? 'DUE_TODAY' : x.promise_date > asOf ? 'UPCOMING' : limitDay >= asOf ? 'IN_GRACE' : 'BROKEN';
        var p = { day: x.day, agent: x.agent, amount: x.amount, date: x.promise_date, status: st }; proms.push(p);
        if (x.promise_date >= asOf - 90) { if (st === 'KEPT') a.kept90++; if (st === 'BROKEN') a.broken90++; } });
      a.promise = proms.length ? proms[proms.length - 1] : null; a.promises = proms;
      a.promise_status = a.promise ? a.promise.status : 'NONE';
      // follow-up due
      a.fu_due = null; a.fu_src = '';
      if (last) { if (last.followup !== null) { a.fu_due = last.followup; a.fu_src = 'Set by agent'; } else { a.fu_due = cal.addBiz(last.day, cfg.FU_CADENCE[a.oldest_bucket || 'Current'] || 5); a.fu_src = 'Default cadence'; }
        if (a.promise && (a.promise_status === 'DUE_TODAY' || a.promise_status === 'UPCOMING' || a.promise_status === 'IN_GRACE') && a.promise.day >= last.day - 0 && last.followup === null) { a.fu_due = cal.addBiz(a.promise.date, 1); a.fu_src = 'Day after promise'; }
        if (a.promise_status === 'BROKEN') { a.fu_due = Math.min(a.fu_due, cal.addBiz(a.promise.date + cfg.PROMISE_GRACE_DAYS, 1)); a.fu_src = 'Broken promise'; } }
      a.fu_late = a.fu_due !== null && a.fu_due < asOf ? cal.bizBetween(a.fu_due, asOf) : 0;
      // ownership
      a.agent = assign[id] || ''; a.agent_name = a.agent ? agentByKey[a.agent].name : '';
      // cross-sheet
      var q = (qBy[id] || []).filter(function (x) { return x.group !== 'DONE'; }), e = (eBy[id] || []).filter(function (x) { return x.group !== 'DONE'; }), cb = (cbBy[id] || []).filter(function (x) { return x.open; });
      a.q_open = q.length; a.q_ids = q.map(function (x) { return x.query_id; }).join(', '); a.q_oldest = q.length ? Math.max.apply(null, q.map(function (x) { return asOf - x.created; })) : 0;
      a.e_open = e.length; a.e_ids = e.map(function (x) { return x.esc_id; }).join(', '); a.e_sev = e.some(function (x) { return x.severity === 'High'; }) ? 'High' : e.length ? 'Medium' : '';
      a.e_dispute = e.some(function (x) { return x.dispute; });
      a.cb_open = cb.length; a.cb_amt = sum(cb, function (x) { return x.amount; }); a.cb_due = cb.length ? Math.min.apply(null, cb.map(function (x) { return x.due; })) : null; a.cb_fraud = cb.some(function (x) { return x.category === 'FRAUD'; });
      var bounced = (qBy[id] || []).filter(function (x) { return /bounced/i.test(x.category) && x.created >= asOf - 90; });
      a.nsf_open = bounced.some(function (x) { return x.group !== 'DONE' || /COD/i.test(x.resolution); }); a.nsf90 = bounced.length > 0;
      a.nsf_aged = bounced.some(function (x) { return (x.group !== 'DONE' || /COD/i.test(x.resolution)) && x.created <= asOf - 14; });
      var lastDisputeIx = -1; ac.forEach(function (x, i) { if (x.outcome === 'RPC_DISPUTE' && x.day >= asOf - 30) lastDisputeIx = i; });
      a.dispute = a.e_dispute || a.cb_open > 0 || a.credit_pending > 0 || (lastDisputeIx >= 0 && !ac.slice(lastDisputeIx + 1).some(function (x) { return x.outcome === 'RPC_PAID'; }));
      // alerts
      var al = alBy[id] || [];
      a.alerts7 = al.filter(function (x) { return x.day >= asOf - 6; }).length; a.alerts30 = al.filter(function (x) { return x.day >= asOf - 29; }).length;
      a.ord60 = al.filter(function (x) { return x.type === 'NEW_ORDER_OVER60' && x.day >= asOf - 29; }).length; a.ordOL = al.filter(function (x) { return x.type === 'ORDER_OVER_LIMIT' && x.day >= asOf - 29; }).length;
      a.ordFlag = al.filter(function (x) { return x.type === 'ORDER_ON_FLAGGED' && x.day >= asOf - 29; }).length;
      var la = al[al.length - 1]; a.last_alert = la ? la.type : ''; a.last_alert_day = la ? la.day : null;
      // credit use
      a.over_limit = a.limit !== null && a.limit > 0 ? Math.max(0, a.balance - a.limit) : 0; a.util = a.limit ? a.balance / a.limit : null;
      return a;
    });
    var A = {}; A360.forEach(function (a) { A[a.account_id] = a; });

    // ---------- Module 4 rules (needed by lanes) ----------
    function mgmtCodes(a) {
      var codes = [];
      if (a.oldest >= 120 && a.past_due >= 10000) codes.push('M1_AGE_120');
      if (a.oldest >= 90 && a.att60 >= 6 && a.days60 >= 3 && a.rpc60 === 0 && !a.paid60) codes.push('M2_EXHAUSTED_90');
      if (a.oldest >= 60 && a.broken90 >= 2) codes.push('M3_BROKEN_TWICE');
      if (a.oldest >= 60 && a.last_rpc_outcome === 'RPC_REFUSED') codes.push('M4_REFUSED');
      if (a.oldest >= 60 && ((!a.phone && !a.phone_alt) || a.wrong3) && !a.email) codes.push('M5_UNREACHABLE');
      if (a.nsf_aged && a.past_due > 0) codes.push('M6_NSF_UNPAID');
      if (/closed|out of business|bankrupt/i.test(a.status)) codes.push('M7_CLOSED_BUSINESS');
      if (a.ord60 >= 2) codes.push('M8_STILL_ORDERING');
      return codes;
    }
    function route(a, codes) {
      if (codes.length === 1 && codes[0] === 'M8_STILL_ORDERING') return 'CREDIT_HOLD';
      if (a.dispute || a.q_open) return a.credit_pending || /credit|refund|return|short/i.test(qryTypes(a)) ? 'CREDIT_REVIEW' : 'RESOLVE_DISPUTE';
      if (a.credits < 0) return 'CREDIT_REVIEW';
      if (codes.indexOf('M5_UNREACHABLE') >= 0 || codes.indexOf('M7_CLOSED_BUSINESS') >= 0 || a.past_due < cfg.MIN_CLAIM_BALANCE * 100) return 'WRITE_OFF_REVIEW';
      if (a.oldest >= 90 && a.past_due <= cfg.SMALL_CLAIMS_MAX * 100 && a.att60 >= 6) return 'SMALL_CLAIMS';
      if (codes.indexOf('M8_STILL_ORDERING') >= 0 && a.oldest < 90) return 'CREDIT_HOLD';
      return 'DEMAND_LETTER';
    }
    function qryTypes(a) { return (qBy[a.account_id] || []).filter(function (x) { return x.group !== 'DONE'; }).map(function (x) { return x.category; }).join(' '); }

    // ---------- Module 3: lanes, priority, next action ----------
    A360.forEach(function (a) {
      a.mgmt_codes = mgmtCodes(a);
      var reasons = [], pts = 0; function addp(p, code, text) { pts += p; reasons.push({ code: code, pts: p, text: text }); }
      if (a.open <= cfg.MIN_BALANCE_TO_WORK * 100 && a.past_due <= 0) a.lane = 'CLEAR';
      else if (/bankrupt|legal|referred/i.test(a.status)) a.lane = 'HOLD';
      else if (a.mgmt_codes.length && !(a.mgmt_codes.length === 1 && a.mgmt_codes[0] === 'M8_STILL_ORDERING' && a.oldest < 61)) a.lane = 'MGMT_REVIEW';
      else if (a.dispute || a.q_open) a.lane = 'DISPUTE';
      else if (a.promise_status === 'UPCOMING' || a.promise_status === 'IN_GRACE') a.lane = 'PROMISE_WATCH';
      else if (a.open > 0) a.lane = 'WORK';
      else a.lane = 'CLEAR';
      if (a.lane === 'MGMT_REVIEW') a.route = route(a, a.mgmt_codes);
      if (a.open > 0) {
        var ob = a.oldest_bucket || 'Current';
        addp(cfg.PRI_AGE[ob], 'AGE_' + ob, 'oldest invoice ' + a.oldest + ' days past due');
        var size = cfg.PRI_SIZE.filter(function (s) { return a.past_due / 100 < s[0]; })[0]; if (size[1]) addp(size[1], 'SIZE', C.fmtUSD0(a.past_due) + ' past due');
        if (a.promise_status === 'DUE_TODAY') addp(cfg.PRI_PTP_DUE, 'PTP_DUE_TODAY', 'promise of ' + C.fmtUSD(a.promise.amount) + ' due today');
        if (a.promise_status === 'BROKEN' && a.promise.date >= asOf - 7) addp(cfg.PRI_PTP_BROKEN, 'PTP_BROKEN', 'promise broken on ' + C.short(a.promise.date));
        if (a.fu_late >= 1) addp(a.fu_late >= 3 ? cfg.PRI_FU_LATE3 : cfg.PRI_FU_LATE, 'FOLLOWUP_LATE', 'follow-up ' + a.fu_late + ' business day' + (a.fu_late > 1 ? 's' : '') + ' late');
        if (a.never && a.past_due > 0) addp(cfg.PRI_NEVER, 'NEVER_TOUCHED', 'no call logged since 28 Sep');
        else if (a.since_touch >= 14 && a.past_due > 0) addp(cfg.PRI_STALE, 'NO_TOUCH_14D', 'not called for ' + a.since_touch + ' days');
        if (a.ord60 >= 1) addp(cfg.PRI_ORDERING_60, 'ORDERING_WHILE_60P', a.ord60 + ' new order' + (a.ord60 > 1 ? 's' : '') + ' while 60+ days late');
        if (a.over_limit > 0) addp(cfg.PRI_OVER_LIMIT, 'OVER_LIMIT', C.fmtUSD0(a.over_limit) + ' over limit');
        if (a.nsf90) addp(cfg.PRI_NSF, 'NSF_RECENT', 'bounced check in last 90 days');
        if (a.att30 >= 8 && a.contacts30 === 0) addp(cfg.PRI_NO_CONTACT, 'NO_CONTACT_8', a.att30 + ' tries, no contact');
        if (a.called_today) addp(cfg.PRI_CALLED_TODAY, 'CALLED_TODAY', 'already called today');
      }
      a.score = Math.round(pts); a.reasons = reasons;
      a.why = reasons.filter(function (r) { return r.pts > 0; }).sort(function (x, y) { return y.pts - x.pts; }).slice(0, 3).map(function (r) { return r.text; }).join('; ');
      a.action = nextAction(a);
    });
    function nextAction(a) {
      if (a.lane === 'CLEAR') return 'Nothing due';
      if (a.lane === 'MGMT_REVIEW') return 'Owner: management review (' + a.route.replace(/_/g, ' ').toLowerCase() + ')';
      if (a.promise_status === 'DUE_TODAY') return 'Confirm payment of ' + C.fmtUSD(a.promise.amount) + ' promised for today';
      if (a.promise_status === 'BROKEN' && a.promise.date >= asOf - 7) return 'Broken promise of ' + C.fmtUSD(a.promise.amount) + ' on ' + C.short(a.promise.date) + ': get a new date, ask for card';
      if (a.lane === 'DISPUTE') return 'Resolve first: ' + [a.e_ids, a.q_ids, a.cb_open ? a.cb_open + ' open chargeback' : '', a.credit_pending ? 'credit pending on ' + a.credit_pending + ' invoice' : ''].filter(Boolean).join(', ');
      if (a.lane === 'PROMISE_WATCH') return 'Wait: promise of ' + C.fmtUSD(a.promise.amount) + ' due ' + C.short(a.promise.date);
      if (a.att30 >= 8 && a.contacts30 === 0) return a.att30 + ' tries, no contact: email statement, try alternate contacts';
      if (a.wrong3 || (!a.phone && !a.phone_alt)) return 'Find a working number (sales rep, last order, email)';
      if (a.never) return 'First contact: verify AP contact, send statement';
      if (a.past_due >= 150000) return 'Collect ' + C.fmtUSD0(a.past_due) + ' past due; lead with card payment';
      return 'Collect ' + C.fmtUSD0(a.past_due) + ' past due (oldest ' + a.oldest + ' days)';
    }

    // ---------- Module 6: allocation proposal ----------
    var activeAgents = agents.filter(function (x) { return x.active; });
    var bIx = function (b) { return BUCKETS.indexOf(b.replace('–', '-')); };
    function workload(a) { return cfg.W[a.oldest_bucket || 'Current'] * (1 + Math.min(a.past_due / (cfg.WL_BALANCE_UNIT * 100), 2)); }
    var workable = A360.filter(function (a) { return a.lane === 'WORK' || a.lane === 'DISPUTE' || a.lane === 'PROMISE_WATCH'; });
    var totalCap = sum(activeAgents, function (x) { return x.cap; }), totalWL = sum(workable, workload);
    var target = {}, load = {}; activeAgents.forEach(function (x) { target[x.key] = totalWL * x.cap / totalCap; load[x.key] = 0; });
    var proposal = [];
    function eligible(ag, a) { return bIx(a.oldest_bucket || 'Current') <= bIx(ag.maxBucket); }
    workable.slice().sort(function (x, y) { return workload(y) - workload(x) || (x.account_id < y.account_id ? -1 : 1); }).forEach(function (a) {
      var cur = a.agent && agentByKey[a.agent] && agentByKey[a.agent].active ? agentByKey[a.agent] : null, to = cur, reason = 'KEEP';
      if (!cur) reason = a.agent ? 'AGENT_INACTIVE' : 'NEW';
      else if (!eligible(cur, a)) { to = null; reason = 'BUCKET_LIMIT'; }
      if (!to) { var cands = activeAgents.filter(function (g) { return eligible(g, a); }); cands.sort(function (g1, g2) { return load[g1.key] / target[g1.key] - load[g2.key] / target[g2.key]; }); to = cands[0] || agentByKey[ownerKey]; }
      load[to.key] += workload(a); proposal.push({ a: a, from: a.agent, to: to.key, reason: reason, wl: workload(a) });
    });
    // rebalance: move stale, no-promise, not recently touched accounts from overloaded agents
    activeAgents.forEach(function (g) {
      if (load[g.key] <= target[g.key] * cfg.WL_REBALANCE_PCT) return;
      var movable = proposal.filter(function (p) { return p.to === g.key && p.reason === 'KEEP' && (p.a.since_touch === null || p.a.since_touch >= 7) && (p.a.last_contact === null || p.a.last_contact < asOf - 30) && p.a.promise_status !== 'UPCOMING' && !p.a.q_open; })
        .sort(function (x, y) { return x.wl - y.wl || (x.a.account_id < y.a.account_id ? -1 : 1); });
      for (var i = 0; i < movable.length && load[g.key] > target[g.key] * cfg.WL_REBALANCE_TARGET; i++) {
        var p = movable[i], under = activeAgents.filter(function (h) { return h.key !== g.key && eligible(h, p.a) && load[h.key] < target[h.key]; }).sort(function (h1, h2) { return load[h1.key] / target[h1.key] - load[h2.key] / target[h2.key]; })[0];
        if (!under) break; load[g.key] -= p.wl; load[under.key] += p.wl; p.to = under.key; p.reason = 'REBALANCE';
      }
    });
    var changes = proposal.filter(function (p) { return p.reason !== 'KEEP'; });

    // ---------- Worklists (Module 3, step 4) — today's lists use current approved assignments ----------
    var lists = {};
    agents.forEach(function (g) {
      var mine = A360.filter(function (a) { return a.agent === g.key && (a.lane === 'WORK' || a.lane === 'DISPUTE' || (a.lane === 'PROMISE_WATCH' && a.promise_status === 'DUE_TODAY')); });
      var mustToday = A360.filter(function (a) { return a.agent === g.key && a.promise_status === 'DUE_TODAY' && mine.indexOf(a) < 0; });
      mine = mine.concat(mustToday).sort(function (x, y) { return y.score - x.score || y.past_due - x.past_due || (x.account_id < y.account_id ? -1 : 1); });
      var today = mine.filter(function (a, i) { return i < g.cap || a.promise_status === 'DUE_TODAY'; }), overflow = mine.filter(function (a) { return today.indexOf(a) < 0; });
      lists[g.key] = { today: today, overflow: overflow };
    });
    var unassigned = A360.filter(function (a) { return !a.agent && a.past_due > 0 && a.lane !== 'CLEAR'; });

    // ---------- Module 5: agent performance ----------
    var W = cfg.W;
    function periodStats(d0, d1) {
      var rows = act.rows.filter(function (x) { return x.day >= d0 && x.day <= d1; });
      var base = {}; BUCKETS.forEach(function (b) { base[b] = { n: 0, rpc: 0 }; });
      rows.forEach(function (x) { var a = A[x.account_id], b = a ? (a.oldest_bucket || 'Current') : 'Current'; base[b].n++; if (/^RPC_/.test(x.outcome)) base[b].rpc++; });
      var teamKept = 0, teamDue = 0;
      A360.forEach(function (a) { a.promises.forEach(function (p) { if (p.date >= d0 && p.date <= d1 && (p.status === 'KEPT' || p.status === 'BROKEN')) { teamDue++; if (p.status === 'KEPT') teamKept++; } }); });
      var out = {};
      agents.forEach(function (g) {
        var r = rows.filter(function (x) { return x.agent === g.key; }), s = { agent: g, attempts: r.length };
        s.unique = Object.keys(by(r, 'account_id')).length;
        s.weighted = round1(sum(r, function (x) { var a = A[x.account_id]; return W[a ? (a.oldest_bucket || 'Current') : 'Current']; }));
        s.contacts = r.filter(function (x) { return /^RPC_/.test(x.outcome) || x.outcome === 'THIRD_PARTY'; }).length; s.rpc = r.filter(function (x) { return /^RPC_/.test(x.outcome); }).length;
        s.contact_rate = r.length ? s.contacts / r.length : null; s.rpc_rate = r.length ? s.rpc / r.length : null;
        var pr = r.filter(function (x) { return x.outcome === 'RPC_PROMISE'; }); s.promises = pr.length; s.promised = sum(pr, function (x) { return x.amount || 0; });
        var kept = 0, due = 0, collected = 0;
        A360.forEach(function (a) { a.promises.forEach(function (p) { if (p.agent === g.key && p.date >= d0 && p.date <= d1 && (p.status === 'KEPT' || p.status === 'BROKEN')) { due++; if (p.status === 'KEPT') { kept++; collected += p.amount || 0; } } }); });
        collected += sum(r.filter(function (x) { return x.outcome === 'RPC_PAID' && x.amount; }), function (x) { return x.amount; });
        s.kept = kept; s.kept_due = due; s.kept_rate = due ? kept / due : null; s.collected = collected;
        // follow-up compliance: follow-ups this agent set that fell due in the period
        var fuDue = 0, fuMet = 0, lateSum = 0, lateN = 0, lateAccts = [];
        act.rows.forEach(function (x, i) {
          if (x.agent !== g.key || x.followup === null || x.followup < d0 || x.followup > d1 || x.followup > asOf) return;
          var nxt = null; for (var j = i + 1; j < act.rows.length; j++) { var y = act.rows[j]; if (y.account_id === x.account_id && y.day > x.day) { nxt = y; break; } }
          if (nxt && nxt.day < x.followup) return; // someone already called earlier; superseded
          var limit = cal.addBiz(x.followup, cfg.FOLLOWUP_GRACE_BDAYS);
          if ((!nxt || nxt.day > limit) && limit >= asOf) return; // still inside its window today: pending, not missed
          fuDue++;
          if (nxt && nxt.day <= limit) fuMet++; else { var lateBy = nxt ? cal.bizBetween(x.followup, nxt.day) : cal.bizBetween(x.followup, Math.min(asOf, d1 + 7)); lateSum += lateBy; lateN++; lateAccts.push(x.account_id); }
        });
        s.fu_due = fuDue; s.fu_met = fuMet; s.fu_rate = fuDue ? fuMet / fuDue : null; s.fu_avg_late = lateN ? round1(lateSum / lateN) : 0; s.fu_late_accts = lateAccts;
        // fairness: expected RPC for this agent's bucket mix at the team rate
        var exp = 0; r.forEach(function (x) { var a = A[x.account_id], b = a ? (a.oldest_bucket || 'Current') : 'Current'; exp += base[b].n ? base[b].rpc / base[b].n : 0; });
        s.rpc_index = exp ? Math.round(s.rpc / exp * 100) : null;
        s.kept_index = s.kept_rate !== null && teamDue ? Math.round(s.kept_rate / (teamKept / teamDue) * 100) : null;
        s.untouched = A360.filter(function (a) { return a.agent === g.key && a.past_due > 0 && (a.since_touch === null || a.since_touch >= 14); }).length;
        s.untouched_ids = A360.filter(function (a) { return a.agent === g.key && a.past_due > 0 && (a.since_touch === null || a.since_touch >= 14); }).map(function (a) { return a.account_id; });
        s.dup_effort = r.filter(function (x) { var a = A[x.account_id]; return a && a.agent && a.agent !== g.key && act.rows.some(function (y) { return y.account_id === x.account_id && y.day === x.day && y.agent === a.agent; }); }).length;
        var rej = act.issues.filter(function (i) { return i.code === 'ACTIVITY_UNKNOWN_ACCOUNT' || i.code === 'ID_NORMALIZED'; }).length;
        s.bad_rows = r.filter(function (x) { return !known[x.account_id] || x.raw_outcome === ''; }).length; s.quality = r.length ? 1 - s.bad_rows / r.length : null;
        var days = 0; for (var d = d0; d <= Math.min(d1, asOf); d++) if (cal.isBiz(d)) days++;
        s.days = days; s.effort = days ? s.weighted / (days * cfg.TARGET_WEIGHTED_ATTEMPTS_DAY * (g.cap / 80)) : null;
        var assigned = A360.filter(function (a) { return a.agent === g.key && a.past_due > 0; }).length;
        var cw = cfg.COMPOSITE, parts2 = {
          followup: s.fu_rate === null ? null : s.fu_rate, rpcIndex: s.rpc_index === null ? null : Math.min(s.rpc_index, 150) / 150, kept: s.kept_rate,
          effort: s.effort === null ? null : Math.min(s.effort, 1.2) / 1.2, untouched: assigned ? 1 - Math.min(1, s.untouched / assigned * 4) : 1, quality: s.quality };
        var tw = 0, tot = 0; Object.keys(cw).forEach(function (k) { if (parts2[k] !== null && parts2[k] !== undefined) { tw += cw[k]; tot += cw[k] * parts2[k]; } });
        s.parts = parts2; s.score = r.length >= (d1 - d0 >= 4 ? cfg.MIN_ATTEMPTS_FOR_SCORE : 1) && tw ? Math.round(tot / tw * 100) : null;
        out[g.key] = s;
      });
      return out;
    }
    var perfWeek = periodStats(weekStart, weekEnd), perfMTD = periodStats(monthStart, asOf), perfToday = periodStats(asOf, asOf), perfPrevWeek = periodStats(weekStart - 7, weekEnd - 7);
    // worklist completion today
    agents.forEach(function (g) { var l = lists[g.key].today; var done = l.filter(function (a) { return a.called_today; }).length; perfToday[g.key].wl_done = done; perfToday[g.key].wl_size = l.length; });

    // audit sample (seeded per week)
    var audit = [];
    agents.filter(function (g) { return g.role !== 'owner'; }).forEach(function (g) {
      var rows = act.rows.filter(function (x) { return x.agent === g.key && x.day >= weekStart && x.day <= weekEnd; }), rnd = seeded(C.iso(weekStart) + g.key);
      var hard = rows.filter(function (x) { var a = A[x.account_id]; return a && a.oldest > 60; }), pickN = function (arr, n, out) { var c = arr.slice(); while (out.length < n && c.length) { var i = Math.floor(rnd() * c.length); if (out.indexOf(c[i]) < 0) out.push(c[i]); c.splice(i, 1); } return out; };
      var chosen = pickN(hard, 2, []); chosen = pickN(rows, cfg.AUDIT_PER_AGENT, chosen);
      chosen.sort(function (x, y) { return x.day - y.day || x.min - y.min; }).forEach(function (x) { audit.push({ g: g, x: x }); });
    });

    // ---------- Module 8: credit engine ----------
    var CR = cfg.CREDIT, credit = [];
    Object.keys(cust.byId).sort().forEach(function (id) {
      var c = cust.byId[id], a = A[id] || { balance: 0, open: 0, past_due: 0, oldest: 0, broken90: 0, ordOL: 0, ord60: 0, cb_fraud: false, nsf_open: false, util: null, over_limit: 0 };
      var s = sales.byId[id] || { months: [], returns: 0, gross: 0, orders: 0 }, p = pays.byId[id] || { paid: 0, within: 0, maxLate: 0, nsf: 0, last: null };
      var m = s.months, avg = function (n) { var x = m.slice(-n); return x.length ? sum(x) / n : 0; }, avg3 = avg(3), avg6 = avg(6), avg12 = avg(12);
      var buyMonths = m.filter(function (v) { return v > 0; }).length, last6 = m.slice(-6).filter(function (v) { return v > 0; }).length;
      var tenureD = c.open_date === null ? null : asOf - c.open_date;
      var lostCB = (cbBy[id] || []).filter(function (x) { return x.status === 'LOST' && x.received >= asOf - 365; }).length;
      var cur = c.credit_limit, row = { id: id, c: c, a: a, avg3: avg3, avg6: avg6, avg12: avg12, cur: cur, tenure: tenureD, retRate: s.gross ? s.returns / s.gross : 0, buyMonths: buyMonths };
      var gate = null, rec = null, action, flags = [];
      if (/closed|bankrupt|legal/i.test(c.status)) { gate = 'G1 Closed / legal'; rec = 0; action = 'SUSPEND'; }
      else if (a.nsf_open || /credit hold/i.test(c.status)) { gate = a.nsf_open ? 'G2 Bounced check not cleared' : 'G2 Account on credit hold'; rec = cur; action = 'HOLD'; }
      else if (a.oldest >= 90 && a.past_due >= 50000) { gate = 'G3 Balance 90+ days late'; rec = Math.min(cur === null ? Infinity : cur, Math.ceil(a.balance / 50000) * 50000); action = 'HOLD'; }
      else if (a.cb_fraud) { gate = 'G4 Open fraud chargeback'; rec = cur; action = 'HOLD'; }
      // score (always computed for transparency)
      var within = p.paid ? p.within / p.paid : null;
      var pt = within === null ? 20 : within >= 0.9 ? 35 : within >= 0.75 ? 28 : within >= 0.6 ? 20 : within >= 0.4 ? 10 : 0;
      var ml = Math.max(p.maxLate || 0, a.oldest || 0), dl = ml <= 0 ? 20 : ml <= 30 ? 16 : ml <= 60 ? 10 : ml <= 90 ? 4 : 0;
      var pr = a.broken90 === 0 ? 10 : a.broken90 === 1 ? 5 : 0;
      var rr = row.retRate <= 0.05 ? 10 : row.retRate <= 0.1 ? 7 : row.retRate <= 0.2 ? 4 : 0;
      var tn = tenureD === null ? 4 : tenureD >= 1095 ? 10 : tenureD >= 365 ? 7 : tenureD >= 182 ? 4 : 2;
      var rg = buyMonths >= 10 ? 10 : buyMonths >= 7 ? 7 : buyMonths >= 4 ? 4 : 1;
      var neg = (p.nsf || 0) + lostCB, ng = neg === 0 ? 5 : neg === 1 ? 2 : 0;
      var score = pt + dl + pr + rr + tn + rg + ng, tier = CR.TIERS.filter(function (t) { return score >= t[1]; })[0];
      var need = Math.max(avg3, avg6) * (row.c.terms + CR.BUFFER_DAYS) / 30;
      var needLimit = tier[2] ? Math.min(Math.ceil(need * tier[2] / (CR.ROUND * 100)) * CR.ROUND * 100, tier[3] * 100) : 0;
      if (tier[2] && needLimit < CR.MIN * 100) needLimit = CR.MIN * 100;
      if (!gate && tenureD !== null && tenureD < 90) { gate = 'G5 Account under 90 days old'; rec = Math.min(CR.STARTER * 100, needLimit || CR.STARTER * 100); action = 'STARTER'; }
      if (!gate && last6 === 0) { gate = 'G6 No purchases in 6 months'; rec = Math.min(CR.DORMANT * 100, cur === null ? CR.DORMANT * 100 : cur); action = 'DORMANT'; }
      if (!gate) {
        rec = needLimit;
        if (tier[0] === 'E') { action = 'CASH_OR_CARD'; flags.push('Tier E: move to card on file or prepay'); }
        if (cur !== null && rec > cur) { var cap = Math.max(cur * CR.STEP_MULT, cur + CR.STEP_ADD * 100); if (rec > cap) { rec = cap; flags.push('STEP_CAPPED'); } }
        if (cur !== null && rec < cur && tier[0] !== 'E') { var floor = Math.ceil(a.balance / (CR.ROUND * 100)) * CR.ROUND * 100; if (rec < floor) { rec = Math.min(cur, floor); flags.push('FLOOR_AT_BALANCE'); } }
        if (!action) {
          if (cur === null) action = 'SET';
          else { var diff = rec - cur; action = Math.abs(diff) < Math.max(cur * CR.NOCHURN_PCT, CR.NOCHURN_MIN * 100) ? 'KEEP' : diff > 0 ? 'INCREASE' : 'DECREASE'; if (action === 'KEEP') rec = cur; }
        }
      }
      if (rec === Infinity) rec = cur;
      if ((tier[0] === 'A' || tier[0] === 'B') && a.util !== null && a.util >= 0.9 && a.ordOL >= 1 && (action === 'INCREASE' || action === 'SET')) flags.push('URGENT_INCREASE');
      if ((tier[0] === 'D' || tier[0] === 'E') && a.over_limit > 0) flags.push('OVER_LIMIT_RISK');
      var reasons = [];
      if (gate) reasons.push(gate.replace(/^G\d /, '') + '.');
      reasons.push(within === null ? 'No payments in 12 months.' : 'Pays ' + C.pct(within) + ' of dollars within terms.');
      reasons.push(buyMonths + ' of 12 months with purchases; average net purchases ' + C.fmtUSD0(Math.max(avg3, avg6)) + '/month (best of 3 and 6 months).');
      if (cur !== null && need > 0) reasons.push('Limit on file ' + C.fmtUSD0(cur) + (cur / need >= 2 ? ' is ' + (cur / need).toFixed(cur / need >= 10 ? 0 : 1) + '× one buying cycle (' : ' covers ' + C.pct(cur / need) + ' of one buying cycle (') + C.fmtUSD0(need) + ').');
      else if (cur === null) reasons.push('No limit on file.');
      if (ml > 30) reasons.push('Paid up to ' + ml + ' days late in the last 6 months.');
      if (a.broken90) reasons.push(a.broken90 + ' broken promise' + (a.broken90 > 1 ? 's' : '') + ' in 90 days.');
      if (neg) reasons.push(neg + ' bounced check or lost chargeback in 12 months.');
      if (a.ordOL) reasons.push(a.ordOL + ' order' + (a.ordOL > 1 ? 's' : '') + ' placed over limit in 30 days.');
      credit.push({ id: id, name: c.name_display, yard: c.yard, rep: c.salesperson, cur: cur, rec: rec === null ? cur : rec, action: action, tier: tier[0], score: score, parts: [pt, dl, pr, rr, tn, rg, ng], avg3: avg3, avg6: avg6, avg12: avg12,
        ret: row.retRate, terms: c.terms, bal: a.balance || 0, past: a.past_due || 0, oldest: a.oldest || 0, util: a.util, ordOL: a.ordOL || 0, ord60: a.ord60 || 0, neg: neg, tenure: tenureD, gate: gate || '', flags: flags, reasons: reasons.join(' '), within: within, need: need });
      if (A[id]) A[id].credit_action = action, A[id].credit_tier = tier[0], A[id].credit_rec = rec;
    });

    // ---------- Module 9: chargebacks ----------
    var cbOpen = cbs.rows.filter(function (x) { return x.open; }).sort(function (x, y) { return x.due - y.due; });
    cbOpen.forEach(function (x) { x.days_left = cal.bizBetween(asOf, x.due); x.missing = C.CB_EVIDENCE[x.category].filter(function (e, i) { return i > 0 || x.category === 'UNMAPPED' ? true : false; }); });
    var contested = cbs.rows.filter(function (x) { return x.status === 'WON' || x.status === 'LOST'; }), won = contested.filter(function (x) { return x.status === 'WON'; });
    var cbYear = cbs.rows.filter(function (x) { return x.received >= C.ymd(2026, 1, 1); });

    // ---------- Module 7: queries and escalations tracker ----------
    var trackItems = [];
    qry.rows.filter(function (x) { return x.group !== 'DONE'; }).forEach(function (x) { trackItems.push({ kind: 'Query', id: x.query_id, account: x.account_id, what: x.category, owner_key: x.assigned_key, owner: x.assigned, status: x.status, due: x.due, due_src: x.due_src, overdue: x.overdue_bdays, amount: x.amount, opened: x.created }); });
    escl.rows.filter(function (x) { return x.group !== 'DONE'; }).forEach(function (x) { trackItems.push({ kind: 'Escalation', id: x.esc_id, account: x.account_id, what: x.type + (x.next_step ? ' — next: ' + x.next_step : ''), owner_key: x.owner_key, owner: x.owner, status: x.status, due: x.next_step_date, due_src: 'sheet', overdue: x.overdue_bdays, amount: x.amount, opened: x.opened, severity: x.severity }); });
    trackItems.forEach(function (t) { t.stage = t.overdue >= 5 ? 'STUCK (owner brief)' : t.overdue >= 3 ? 'Overdue 3+ days: cc owner' : t.overdue >= 1 ? 'Overdue: "did you work on this?"' : t.due === asOf ? 'Due today' : t.due !== null && t.due < asOf ? 'Overdue' : 'Upcoming'; });
    trackItems.sort(function (x, y) { return y.overdue - x.overdue || (x.due || 0) - (y.due || 0); });

    // ---------- Reconciliation (B19) ----------
    function check(code, name, ok, detail, blocking) { R.recon.push({ code: code, name: name, result: ok ? 'PASS' : (blocking ? 'FAIL' : 'WARN'), detail: detail, blocking: !!blocking }); }
    var a360Open = sum(A360, function (a) { return a.open + a.credits; }), cleanOpen = sum(inv.rows, function (x) { return x.open; });
    check('R1', 'Row conservation', cust.read === cust.rows.length + (cust.read - cust.rows.length) && inv.read === inv.rows.length + inv.rejected && act.read === act.rows.length + act.rejected,
      'Customers ' + cust.read + ' read → ' + cust.rows.length + ' clean + ' + (cust.read - cust.rows.length) + ' rejected/duplicate; invoices ' + inv.read + ' → ' + inv.rows.length + ' + ' + inv.rejected + '; calls ' + act.read + ' → ' + act.rows.length + ' + ' + act.rejected, true);
    check('R2', 'AR total ties to the cent', inv.rawTotal === cleanOpen && cleanOpen === a360Open, 'Export ' + C.fmtUSD(inv.rawTotal) + ' = clean ' + C.fmtUSD(cleanOpen) + ' = Account 360 ' + C.fmtUSD(a360Open), true);
    var bad3 = A360.filter(function (a) { return sum(BUCKETS, function (b) { return a.b[b]; }) + a.credits !== a.balance; }).length;
    check('R3', 'Buckets add up for every account', bad3 === 0, bad3 + ' accounts out of balance', true);
    var two = {}; BUCKETS.forEach(function (b) { two[b] = 0; }); inv.rows.forEach(function (x) { if (x.open > 0) two[bucketOf(x.dpd)] += x.open; });
    var r4 = BUCKETS.every(function (b) { return two[b] === sum(A360, function (a) { return a.b[b]; }); });
    check('R4', 'Two-path bucket totals agree', r4, BUCKETS.map(function (b) { return b + ' ' + C.fmtUSD0(two[b]); }).join(' · '), true);
    var unknownAgents = act.issues.filter(function (i) { return /not in Agents/.test(i.msg); }).length;
    check('R6', 'Every call has a known agent and outcome', act.read === act.rows.length + act.rejected && unknownAgents === 0, act.rows.length + ' calls kept, ' + act.rejected + ' rejected (' + unknownAgents + ' unknown agent)', unknownAgents > 0);
    var dupIds = A360.length - Object.keys(A).length;
    check('R7', 'Unique account IDs', dupIds === 0, A360.length + ' accounts, ' + dupIds + ' duplicates', true);
    var leak = 0; Object.keys(lists).forEach(function (k) { lists[k].today.forEach(function (a) { if (a.agent !== k) leak++; }); });
    check('R8', 'Each worklist holds only its agent\'s accounts', leak === 0, leak + ' rows on the wrong list', true);
    check('R9', 'Sources are fresh', true, 'AR as of ' + C.nice(asOf) + '; calls through ' + C.nice(act.rows.length ? act.rows[act.rows.length - 1].day : asOf), false);
    var badCredit = credit.filter(function (c) { return c.rec !== null && (c.rec < 0 || (c.tier !== 'E' && c.rec > CR.TIERS[0][3] * 100)) || (c.action !== 'KEEP' && !c.reasons); }).length;
    check('R11', 'Credit sanity', badCredit === 0, badCredit + ' recommendations outside the rules', true);
    R.published = R.recon.every(function (r) { return r.result !== 'FAIL'; });

    // ---------- KPIs ----------
    var K = R.kpi; K.as_of = C.iso(asOf); K.ar = a360Open; K.past_due = sum(A360, function (a) { return a.past_due; });
    K.buckets = {}; BUCKETS.forEach(function (b) { K.buckets[b] = sum(A360, function (a) { return a.b[b]; }); });
    K.over60 = K.buckets['61-90'] + K.buckets['91-120'] + K.buckets['120+']; K.over60_pct = K.over60 / K.ar;
    K.accounts = A360.length; K.with_balance = A360.filter(function (a) { return a.open > 0; }).length;
    K.lanes = {}; ['WORK', 'PROMISE_WATCH', 'DISPUTE', 'MGMT_REVIEW', 'HOLD', 'CLEAR'].forEach(function (l) { var x = A360.filter(function (a) { return a.lane === l; }); K.lanes[l] = { n: x.length, amt: sum(x, function (a) { return a.past_due; }) }; });
    K.promises_today = A360.filter(function (a) { return a.promise_status === 'DUE_TODAY'; }); K.promises_today_amt = sum(K.promises_today, function (a) { return a.promise.amount || 0; });
    K.broken_week = A360.filter(function (a) { return a.promise_status === 'BROKEN' && a.promise.date >= asOf - 7; });
    K.untouched14 = A360.filter(function (a) { return a.past_due > 0 && (a.since_touch === null || a.since_touch >= 14); });
    K.calls_today = act.rows.filter(function (x) { return x.day === asOf; }).length; K.calls_week = act.rows.filter(function (x) { return x.day >= weekStart && x.day <= weekEnd; }).length;
    K.cust_read = cust.read; K.cust_clean = cust.rows.length; K.issue_counts = {}; cust.issues.forEach(function (i) { var k = i.sev + '|' + i.code; K.issue_counts[k] = (K.issue_counts[k] || 0) + 1; });
    K.cust_records_with_problems = cust.rows.filter(function (c) { return c.errors || c.warns; }).length; K.dups = cust.dups.length; K.avg_quality = sum(cust.rows, function (c) { return c.quality; }) / cust.rows.length;
    K.cb = { total: cbYear.length, amt: sum(cbYear, function (x) { return x.amount; }), contested: contested.length, won: won.length, win_rate: contested.length ? won.length / contested.length : null, recovered: sum(won, function (x) { return x.recovered; }),
      preventable_n: cbYear.filter(function (x) { return x.preventable; }).length, preventable_amt: sum(cbYear.filter(function (x) { return x.preventable; }), function (x) { return x.amount; }), open: cbOpen.length, open_amt: sum(cbOpen, function (x) { return x.amount; }), due3: cbOpen.filter(function (x) { return x.days_left <= 3; }).length };
    var actCounts = {}; credit.forEach(function (c) { actCounts[c.action] = (actCounts[c.action] || 0) + 1; });
    K.credit = { reviewed: credit.length, actions: actCounts, exposure_now: sum(credit, function (c) { return c.cur || 0; }), exposure_rec: sum(credit, function (c) { return c.rec || 0; }), urgent: credit.filter(function (c) { return c.flags.indexOf('URGENT_INCREASE') >= 0; }).length,
      over_limit: A360.filter(function (a) { return a.over_limit > 0; }).length, no_limit: credit.filter(function (c) { return c.cur === null; }).length,
      tiers: CR.TIERS.map(function (t) { return [t[0], credit.filter(function (c) { return c.tier === t[0]; }).length]; }) };
    K.mgmt = { n: K.lanes.MGMT_REVIEW.n, amt: sum(A360.filter(function (a) { return a.lane === 'MGMT_REVIEW'; }), function (a) { return a.past_due; }) };
    K.alerts = { parsed: alerts.rows.length, dupes: alerts.dupes, unparsed: alerts.unparsed.length, ignored: alerts.ignored };
    K.queries_open = trackItems.length; K.stuck = trackItems.filter(function (t) { return t.overdue >= 5; }).length;
    K.week = { start: C.iso(weekStart), end: C.iso(weekEnd) };

    // ---------- Output tables ----------
    var T = 't', ID = 'id', D = 'd', M = 'm', N = 'n', I = 'i', P = 'p', B = 'b';
    function dd(day) { return day === null || day === undefined ? '' : C.iso(day); }
    function mm(c) { return c === null || c === undefined ? '' : C.dollars(c); }
    function nm(name) { var a = agentByKey[name]; return a ? a.name : name || ''; }

    put(tab('Clean_Customers', [['account_id', ID], ['customer_name', T], ['name_display', T], ['account_type', T], ['status', T], ['terms_days', I], ['credit_limit', M], ['open_date', D], ['address1', T], ['city', T], ['state', T], ['zip', ID], ['phone', T], ['phone_ext', T], ['phone_alt', T], ['email', T], ['email_alt', T], ['contact', T], ['yard', T], ['salesperson', T], ['quality_score', I], ['problems', T], ['source_row', I]],
      cust.rows.map(function (c) { return [c.account_id, c.customer_name, c.name_display, c.account_type, c.status, c.terms, mm(c.credit_limit), dd(c.open_date), c.address1, c.city, c.state, c.zip, c.phone, c.phone_ext, c.phone_alt, c.email, c.email_alt, c.contact, c.yard, c.salesperson, c.quality, c.issue_codes, c.source_row]; }),
      'Clean copy of the customer master. The export itself is never changed; corrections typed in Fix_Queue are re-applied on every run.'));
    put(tab('Customer_Issues', [['account_id', ID], ['source_row', I], ['field', T], ['severity', T], ['issue', T], ['original_value', T], ['what happened', T]],
      cust.issues.filter(function (i) { return i.sev !== 'INFO'; }).map(function (i) { return [i.account_id, i.row, i.field, i.sev, i.code, i.original, i.msg]; })));
    put(tab('Duplicate_Candidates', [['group', I], ['confidence', T], ['matched on', T], ['account_ids', T], ['names', T], ['phones', T], ['emails', T], ['open balance', M], ['decision', T]],
      cust.dups.map(function (g, i) { return [i + 1, g.confidence, { K1: 'name + phone', K2: 'email + name', K2S: 'shared email, different shop names (check: one AP inbox for a chain?)', K3: 'name + ZIP', K4: 'phone' }[g.key], g.ids.join(' + '), g.recs.map(function (r) { return r.customer_name; }).join(' | '), g.recs.map(function (r) { return r.phone; }).join(' | '), g.recs.map(function (r) { return r.email; }).join(' | '), mm(sum(g.ids, function (x) { return A[x] ? A[x].balance : 0; })), '']; })));
    var fixRows = cust.rows.filter(function (c) { return c.errors || /PHONE_INVALID|PHONE_BLANK|EMAIL_INVALID|EMAIL_BLANK|LIMIT_BLANK/.test(c.issue_codes); }).map(function (c) { return { c: c, bal: A[c.account_id] ? A[c.account_id].balance : 0 }; })
      .sort(function (x, y) { return y.c.errors - x.c.errors || y.bal - x.bal || (x.c.account_id < y.c.account_id ? -1 : 1); }).slice(0, 150);
    put(tab('Fix_Queue', [['account_id', ID], ['customer', T], ['open balance', M], ['problems', T], ['field to fix', T], ['correct value (type here)', T], ['apply', B]],
      fixRows.map(function (x) { var f = /NAME/.test(x.c.issue_codes) ? 'customer_name' : /LIMIT/.test(x.c.issue_codes) ? 'credit_limit' : /PHONE/.test(x.c.issue_codes) ? 'phone' : 'email'; return [x.c.account_id, x.c.name_display, mm(x.bal), x.c.issue_codes, f, '', false]; }),
      'Money-relevant fixes first. Type the correct value, tick apply, then use AR Center → Apply approvals. The fix is stored in Overrides and survives every future upload.'));

    put(tab('Account_360', [['account_id', ID], ['customer', T], ['yard', T], ['agent', T], ['lane', T], ['priority', I], ['open_balance', M], ['past_due', M], ['current', M], ['d1_30', M], ['d31_60', M], ['d61_90', M], ['d91_120', M], ['d120_plus', M], ['oldest_dpd', I], ['open_invoices', I],
      ['last_call', D], ['last_agent', T], ['last_outcome', T], ['last_contact', D], ['days_since_touch', I], ['calls_7d', I], ['calls_30d', I], ['contacts_30d', I], ['agents_7d', I], ['promise_status', T], ['promise_amount', M], ['promise_date', D], ['broken_90d', I],
      ['follow_up_due', D], ['follow_up_source', T], ['follow_up_late_bdays', I], ['open_queries', T], ['open_escalations', T], ['open_chargebacks', I], ['alerts_30d', I], ['orders_while_60_plus', I], ['orders_over_limit', I], ['credit_limit', M], ['over_limit', M], ['utilization', P], ['credit_action', T], ['nsf_90d', B], ['dispute', B], ['phone', T], ['email', T], ['why', T], ['next_action', T]],
      A360.slice().sort(function (x, y) { return y.score - x.score || y.past_due - x.past_due || (x.account_id < y.account_id ? -1 : 1); }).map(function (a) { return [a.account_id, a.name, a.yard, nm(a.agent), a.lane, a.score, mm(a.balance), mm(a.past_due), mm(a.b['Current']), mm(a.b['1-30']), mm(a.b['31-60']), mm(a.b['61-90']), mm(a.b['91-120']), mm(a.b['120+']), a.oldest, a.n_inv,
        dd(a.last_day), nm(a.last_agent), a.last_outcome, dd(a.last_contact), a.since_touch === null ? '' : a.since_touch, a.att7, a.att30, a.contacts30, a.agents7, a.promise_status, a.promise ? mm(a.promise.amount) : '', a.promise ? dd(a.promise.date) : '', a.broken90,
        dd(a.fu_due), a.fu_src, a.fu_late, a.q_ids, a.e_ids, a.cb_open, a.alerts30, a.ord60, a.ordOL, mm(a.limit), mm(a.over_limit), a.util === null ? '' : round1(a.util * 1000) / 1000, a.credit_action || '', a.nsf90, a.dispute, a.phone, a.email, a.why, a.action]; }),
      'One row per account that has a balance, a recent call, an open query, escalation or chargeback, or a recent alert. Every later tab reads from here.'));

    var wlCols = [['rank', I], ['account_id', ID], ['customer', T], ['phone', T], ['alt phone', T], ['email', T], ['contact', T], ['balance', M], ['past_due', M], ['oldest_dpd', I], ['bucket', T], ['last contact', T], ['promise', T], ['open items', T], ['next action', T], ['why it is on your list', T], ['done', B]];
    function wlRow(a, i) { return [i + 1, a.account_id, a.name, a.phone || '(no valid phone)', a.phone_alt, a.email, a.contact, mm(a.balance), mm(a.past_due), a.oldest, a.oldest_bucket, a.last_contact ? C.short(a.last_contact) + ' · ' + a.last_rpc_outcome.replace('RPC_', '').toLowerCase() : (a.last_day ? 'no contact; last try ' + C.short(a.last_day) : 'never called'), a.promise && a.promise.status !== 'KEPT' ? C.fmtUSD(a.promise.amount) + ' ' + a.promise.status.toLowerCase().replace('_', ' ') + ' ' + C.short(a.promise.date) : '', [a.q_ids, a.e_ids].filter(Boolean).join(', '), a.action, a.why, false]; }
    agents.forEach(function (g) {
      var L = lists[g.key];
      put(tab('WL_' + g.key, wlCols, L.today.map(wlRow).concat(L.overflow.length ? [['', '', 'Overflow — work these only after the list above', '', '', '', '', '', '', '', '', '', '', '', '', '', '']] : [], L.overflow.map(function (a, i) { return wlRow(a, L.today.length + i); })),
        g.name + ' — ' + L.today.length + ' accounts for ' + C.nice(asOf) + ', ranked by priority. Promises due today are always included.'));
    });

    put(tab('Mgmt_Review', [['account_id', ID], ['customer', T], ['yard', T], ['agent', T], ['open_balance', M], ['past_due', M], ['oldest_dpd', I], ['entry rules', T], ['recommended route', T], ['calls (all)', I], ['calls 60d', I], ['days tried 60d', I], ['last contact', D], ['last outcome', T], ['promises broken 90d', I], ['open items', T], ['orders while 60+ (30d)', I], ['phone on file', T], ['email on file', T], ['decision', T], ['decision by', T], ['notes', T]],
      A360.filter(function (a) { return a.lane === 'MGMT_REVIEW'; }).sort(function (x, y) { return y.past_due - x.past_due; }).map(function (a) { return [a.account_id, a.name, a.yard, nm(a.agent), mm(a.balance), mm(a.past_due), a.oldest, a.mgmt_codes.join(', '), a.route.replace(/_/g, ' '), a.att_all, a.att60, a.days60, dd(a.last_contact), a.last_outcome, a.broken90, [a.q_ids, a.e_ids, a.cb_open ? a.cb_open + ' CB' : ''].filter(Boolean).join(', '), a.ord60, a.phone ? 'yes' : 'NO', a.email ? 'yes' : 'NO', '', '', '']; }),
      'Accounts that have run out of normal collection options. Nothing is written off by the system; pick a decision and the owner forwards the evidence pack.'));

    put(tab('Credit_Review', [['account_id', ID], ['customer', T], ['yard', T], ['sales rep', T], ['current limit', M], ['recommended limit', M], ['change', M], ['action', T], ['tier', T], ['score', I], ['pays on time (35)', I], ['lateness (20)', I], ['promises (10)', I], ['returns (10)', I], ['tenure (10)', I], ['regular buying (10)', I], ['no NSF / lost CB (5)', I],
      ['avg net sales 3m', M], ['avg net sales 6m', M], ['avg net sales 12m', M], ['return rate', P], ['terms', I], ['open balance', M], ['past due', M], ['oldest dpd', I], ['utilization', P], ['orders over limit 30d', I], ['gate', T], ['flags', T], ['reasons', T], ['approve', B], ['override limit', M], ['override reason', T]],
      credit.slice().sort(function (x, y) { var o = { HOLD: 0, SUSPEND: 0, CASH_OR_CARD: 1, INCREASE: 2, SET: 3, DECREASE: 4, STARTER: 5, DORMANT: 6, KEEP: 7 }; return (o[x.action] - o[y.action]) || (Math.abs((y.rec || 0) - (y.cur || 0)) - Math.abs((x.rec || 0) - (x.cur || 0))) || (x.id < y.id ? -1 : 1); })
        .map(function (c) { return [c.id, c.name, c.yard, c.rep, mm(c.cur), mm(c.rec), c.rec === null || c.cur === null ? mm(c.rec) : mm(c.rec - c.cur), c.action, c.tier, c.score].concat(c.parts, [mm(Math.round(c.avg3)), mm(Math.round(c.avg6)), mm(Math.round(c.avg12)), round1(c.ret * 1000) / 1000, c.terms, mm(c.bal), mm(c.past), c.oldest, c.util === null ? '' : round1(c.util * 1000) / 1000, c.ordOL, c.gate, c.flags.join(', '), c.reasons, false, '', '']); }),
      'Every credit account: the limit it should have, why, and the figures used. Tick approve, then AR Center → Apply approvals writes the ChangeLog. New limits are entered in PowerLink by hand.'));

    put(tab('Allocation_Proposal', [['account_id', ID], ['customer', T], ['bucket', T], ['past_due', M], ['workload', N], ['current agent', T], ['proposed agent', T], ['reason', T], ['approve', B]],
      changes.map(function (p) { return [p.a.account_id, p.a.name, p.a.oldest_bucket, mm(p.a.past_due), round1(p.wl), nm(p.from), nm(p.to), p.reason, p.reason !== 'REBALANCE']; })
        .concat([['', '', '', '', '', '', '', '', '']], activeAgents.map(function (g) { var before = sum(workable.filter(function (a) { return a.agent === g.key; }), workload); return ['SUMMARY', g.name, 'target ' + round1(target[g.key]), '', round1(load[g.key]), 'before ' + round1(before) + ' (' + Math.round(before / target[g.key] * 100) + '%)', 'after ' + round1(load[g.key]) + ' (' + Math.round(load[g.key] / target[g.key] * 100) + '%)', '', '']; })),
      'Workload = aging weight × (1 + past due ÷ $5,000, capped at 2). Existing owners are kept unless an agent is over 115% of target or not allowed the bucket.'));

    function perfRows(P0, label) { return agents.map(function (g) { var s = P0[g.key]; return [label, g.name, s.attempts, s.unique, s.weighted, s.contact_rate === null ? '' : s.contact_rate, s.rpc_rate === null ? '' : s.rpc_rate, s.rpc_index === null ? '' : s.rpc_index, s.promises, mm(s.promised), s.kept_due ? s.kept + '/' + s.kept_due : '', s.kept_rate === null ? '' : s.kept_rate, mm(s.collected), s.fu_due ? s.fu_met + '/' + s.fu_due : '', s.fu_rate === null ? '' : s.fu_rate, s.fu_avg_late, s.untouched, s.dup_effort, s.score === null ? 'not enough activity' : s.score]; }); }
    var perfCols = [['period', T], ['agent', T], ['calls', I], ['accounts', I], ['weighted calls', N], ['contact rate', P], ['RPC rate', P], ['RPC vs expected (100 = team)', I], ['promises', I], ['promised $', M], ['kept / due', T], ['kept rate', P], ['$ collected (attributed)', M], ['follow-ups on time', T], ['follow-up rate', P], ['avg days late', N], ['untouched 14d+', I], ['calls on others\' accounts', I], ['score', T]];
    put(tab('Agent_Scorecard', perfCols, perfRows(perfToday, 'Today ' + C.short(asOf)).concat(perfRows(perfWeek, 'Week ' + C.short(weekStart) + '–' + C.short(weekEnd)), perfRows(perfPrevWeek, 'Week ' + C.short(weekStart - 7) + '–' + C.short(weekEnd - 7)), perfRows(perfMTD, 'Month to date')),
      'Aging-weighted: a call on a 61–90 day account counts 1.6, 120+ counts 2.5. "RPC vs expected" compares each agent with the team rate for the same mix of buckets, so harder portfolios are not penalized.'));

    var effort = A360.filter(function (a) { return a.agents30 >= 2; }).map(function (a) {
      var ac = (actBy[a.account_id] || []).filter(function (x) { return x.day >= asOf - 29; }), per = by(ac, 'agent');
      var res = ac.filter(function (x) { return x.outcome === 'RPC_PAID' || x.outcome === 'RPC_PROMISE'; }).slice(-1)[0];
      return [a.account_id, a.name, nm(a.agent), Object.keys(per).map(function (k) { return nm(k) + ' ' + per[k].length; }).join(' · '), ac.length, res ? nm(res.agent) + ' (' + res.raw_outcome + ', ' + C.short(res.day) + ')' : 'none yet', a.fu_late ? 'late ' + a.fu_late + 'd' : 'on time', mm(a.past_due)]; });
    put(tab('Account_Effort', [['account_id', ID], ['customer', T], ['assigned to', T], ['calls by agent (30d)', T], ['total calls', I], ['resolving contact', T], ['follow-up now', T], ['past_due', M]], effort, 'Accounts worked by more than one agent in 30 days: who called, how often, and who got the result.'));

    put(tab('Audit_Sample', [['agent', T], ['date', D], ['time', T], ['account_id', ID], ['customer', T], ['outcome logged', T], ['promise', T], ['follow-up set', T], ['account bucket', T], ['disposition matches notes (Y/N)', T], ['follow-up correct (Y/N)', T], ['next step clear (Y/N)', T], ['call quality 1–5', T], ['result (Pass/Coach)', T], ['comment', T]],
      audit.map(function (z) { var a = A[z.x.account_id] || {}; return [z.g.name, dd(z.x.day), Math.floor(z.x.min / 60) + ':' + ('0' + z.x.min % 60).slice(-2), z.x.account_id, a.name || '', z.x.raw_outcome, z.x.outcome === 'RPC_PROMISE' ? C.fmtUSD(z.x.amount) + ' by ' + C.short(z.x.promise_date) : '', z.x.followup !== null ? C.short(z.x.followup) : (z.x.has_fu_field ? 'MISSING' : 'n/a (old form)'), a.oldest_bucket || '', '', '', '', '', '', '']; }),
      'Five calls per agent from last week, picked at random (at least two on 61+ day accounts). Review each and mark Pass or Coach.'));

    put(tab('Query_Tracker', [['type', T], ['id', T], ['account_id', ID], ['customer', T], ['what', T], ['owner', T], ['status', T], ['opened', D], ['due', D], ['due from', T], ['business days overdue', I], ['reminder stage', T], ['amount', M]],
      trackItems.map(function (t) { var a = A[t.account] || cust.byId[t.account] || {}; return [t.kind, t.id, t.account, a.name || a.name_display || '', t.what, t.owner, t.status, dd(t.opened), dd(t.due), t.due_src, t.overdue, t.stage, mm(t.amount)]; }),
      'Open items from the query sheet and the escalation sheet, with due dates (service level by request type when the sheet has none) and the reminder each owner gets.'));

    put(tab('CB_Work', [['case', T], ['account_id', ID], ['customer', T], ['amount', M], ['card', T], ['reason code', T], ['category', T], ['received', D], ['respond by', D], ['business days left', I], ['status', T], ['root cause', T], ['evidence to attach', T], ['note', T]],
      cbOpen.map(function (x) { return [x.cb_id, x.account_id, x.customer, mm(x.amount), x.brand + ' ' + x.last4, x.code, x.category.replace(/_/g, ' '), dd(x.received), dd(x.due), x.days_left, x.status, x.root, C.CB_EVIDENCE[x.category].join('; '), x.due_estimated ? 'Respond-by date estimated (missing on tracker)' : x.notes]; })));

    var catRows = {}; cbYear.forEach(function (x) { var k = x.category; catRows[k] = catRows[k] || { n: 0, amt: 0, won: 0, lost: 0, prev: 0 }; catRows[k].n++; catRows[k].amt += x.amount; if (x.status === 'WON') catRows[k].won++; if (x.status === 'LOST') catRows[k].lost++; if (x.preventable) catRows[k].prev++; });
    var rootRows = {}; cbYear.forEach(function (x) { if (!x.root) return; rootRows[x.root] = rootRows[x.root] || { n: 0, amt: 0 }; rootRows[x.root].n++; rootRows[x.root].amt += x.amount; });
    put(tab('CB_Summary', [['view', T], ['item', T], ['cases', I], ['amount', M], ['won', I], ['lost', I], ['win rate', P], ['preventable cases', I]],
      Object.keys(catRows).sort(function (x, y) { return catRows[y].amt - catRows[x].amt; }).map(function (k) { var r = catRows[k]; return ['By category', k.replace(/_/g, ' '), r.n, mm(r.amt), r.won, r.lost, r.won + r.lost ? r.won / (r.won + r.lost) : '', r.prev]; })
        .concat(Object.keys(rootRows).sort(function (x, y) { return rootRows[y].amt - rootRows[x].amt; }).map(function (k) { return ['By root cause', k.replace(/_/g, ' ').toLowerCase() + (PREV(k) ? ' (preventable)' : ''), rootRows[k].n, mm(rootRows[k].amt), '', '', '', PREV(k) ? rootRows[k].n : 0]; })),
      '2026 year to date. No customer names; safe for the management report.'));
    function PREV(k) { return /LATE|SALES_DID|WRONG_PART/.test(k); }

    put(tab('Alerts_Log', [['type', T], ['account_id', ID], ['customer', T], ['order', T], ['amount', M], ['yard', T], ['created', D], ['time', T], ['source', T], ['message id', T]],
      alerts.rows.slice().sort(function (x, y) { return y.day - x.day || y.min - x.min; }).map(function (x) { var a = A[x.account_id] || {}; return [x.type, x.account_id, a.name || '', x.order_no, mm(x.amount), x.yard, dd(x.day), x.min === null ? '' : Math.floor(x.min / 60) + ':' + ('0' + x.min % 60).slice(-2), x.source, x.message_id]; })
        .concat(alerts.unparsed.map(function (u) { return ['UNPARSED', '', '', '', '', '', '', '', 'email', 'Row ' + u.row + ': ' + u.subject + ' — ' + u.body]; }))));

    put(tab('Recon', [['check', T], ['what it proves', T], ['result', T], ['detail', T]], R.recon.map(function (r) { return [r.code, r.name, r.result, r.detail]; }), R.published ? 'All blocking checks passed; outputs published.' : 'A blocking check failed. Outputs were NOT published; yesterday\'s stay live.'));

    // KPI summary for management (aggregates only)
    var kpiRows = [['As of', C.nice(asOf), ''], ['Open AR (worklist export)', C.dollars(K.ar), 'money'], ['Past due', C.dollars(K.past_due), 'money'], ['Older than 60 days', K.over60_pct, 'pct'],
      ['Accounts with a balance', K.with_balance, 'int'], ['Calls logged today (so far)', K.calls_today, 'int'], ['Calls last week', K.calls_week, 'int'], ['Promises due today', K.promises_today.length, 'int'], ['Promised $ due today', C.dollars(K.promises_today_amt), 'money'],
      ['Promises broken last 7 days', K.broken_week.length, 'int'], ['Past-due accounts untouched 14+ days', K.untouched14.length, 'int'], ['Accounts in management review', K.mgmt.n, 'int'], ['Past due in management review', C.dollars(K.mgmt.amt), 'money'],
      ['Open queries + escalations', K.queries_open, 'int'], ['Stuck 5+ business days', K.stuck, 'int'], ['Chargebacks 2026 (cases)', K.cb.total, 'int'], ['Chargeback win rate (contested)', K.cb.win_rate, 'pct'], ['Chargebacks preventable (share)', K.cb.preventable_n / K.cb.total, 'pct'],
      ['Credit accounts reviewed', K.credit.reviewed, 'int'], ['Accounts over limit', K.credit.over_limit, 'int'], ['Accounts with no limit on file', K.credit.no_limit, 'int'], ['Customer records needing a fix', K.cust_records_with_problems, 'int'], ['Probable duplicate groups', K.dups, 'int']];
    put(tab('KPI_Summary', [['measure', T], ['value', N], ['format', T]], kpiRows));
    put(tab('Aging_Mix', [['bucket', T], ['amount', M], ['share', P]], BUCKETS.map(function (b) { return [b, mm(K.buckets[b]), K.buckets[b] / K.ar]; })));
    put(tab('Lane_Summary', [['lane', T], ['accounts', I], ['past due', M]], Object.keys(K.lanes).map(function (l) { return [l.replace('_', ' '), K.lanes[l].n, mm(K.lanes[l].amt)]; })));
    put(tab('Credit_Summary', [['action', T], ['accounts', I], ['current limits', M], ['recommended limits', M]], Object.keys(actCounts).sort().map(function (k) { var x = credit.filter(function (c) { return c.action === k; }); return [k, x.length, mm(sum(x, function (c) { return c.cur || 0; })), mm(sum(x, function (c) { return c.rec || 0; }))]; })
      .concat(CR.TIERS.map(function (t) { return ['Tier ' + t[0], credit.filter(function (c) { return c.tier === t[0]; }).length, '', '']; }))));
    put(tab('Team_Summary', [['agent', T], ['calls last week', I], ['RPC rate', P], ['RPC vs expected', I], ['follow-up on time', P], ['kept rate', P], ['score', T]], agents.map(function (g) { var s = perfWeek[g.key]; return [g.role === 'owner' ? 'Collections Lead' : 'Agent ' + (agents.indexOf(g)), s.attempts, s.rpc_rate === null ? '' : s.rpc_rate, s.rpc_index === null ? '' : s.rpc_index, s.fu_rate === null ? '' : s.fu_rate, s.kept_rate === null ? '' : s.kept_rate, s.score === null ? '' : s.score]; }), 'Agents shown without names on the management view.'));
    var dq = {}; Object.keys(K.issue_counts).forEach(function (k) { var p = k.split('|'); if (p[0] !== 'INFO') dq[p[1]] = (dq[p[1]] || 0) + K.issue_counts[k]; });
    put(tab('Data_Quality', [['issue', T], ['records', I]], Object.keys(dq).sort(function (x, y) { return dq[y] - dq[x]; }).map(function (k) { return [k, dq[k]]; })));

    // Owner_Today and Meeting_Agenda
    var ownerRows = [];
    function sec(t) { ownerRows.push(['§', t, '', '', '', '', '']); }
    function line(a, b, c, d, e, f) { ownerRows.push(['', a || '', b || '', c === undefined ? '' : c, d || '', e || '', f || '']); }
    sec('1. Run status'); R.recon.forEach(function (r) { line(r.code + ' ' + r.name, r.result, '', r.detail); }); line('Customer records needing a fix', K.cust_records_with_problems + ' of ' + K.cust_clean, '', 'Fix_Queue lists the ones with money on them first'); line('Unparsed alerts', K.alerts.unparsed, '', 'See Alerts_Log; nothing is dropped silently');
    sec('2. Deadlines'); cbOpen.filter(function (x) { return x.days_left <= 3; }).forEach(function (x) { line('Chargeback ' + x.cb_id, x.account_id + ' ' + x.customer, mm(x.amount), x.category.replace(/_/g, ' ') + ' · ' + x.status, 'respond by ' + C.nice(x.due) + (x.due_estimated ? ' (estimated)' : ''), x.days_left + ' business days left'); });
    trackItems.filter(function (t) { return t.due === asOf || t.overdue >= 1; }).slice(0, 15).forEach(function (t) { line(t.kind + ' ' + t.id, t.account + ' ' + ((A[t.account] || {}).name || ''), mm(t.amount), t.what, t.owner, t.overdue ? t.overdue + ' business days overdue' : 'due today'); });
    sec('3. Money today'); K.promises_today.forEach(function (a) { line('Promise due today', a.account_id + ' ' + a.name, mm(a.promise.amount), nm(a.promise.agent), a.phone, 'confirm payment'); });
    K.broken_week.slice(0, 15).forEach(function (a) { line('Broken promise', a.account_id + ' ' + a.name, mm(a.promise.amount), 'was due ' + C.short(a.promise.date), nm(a.agent), 'new date + card'); });
    sec('4. Risk'); A360.filter(function (a) { return a.alerts7 > 0 && (a.oldest > 60 || a.over_limit > 0 || a.nsf90); }).sort(function (x, y) { return y.past_due - x.past_due; }).slice(0, 15).forEach(function (a) { line('Ordering while risky', a.account_id + ' ' + a.name, mm(a.past_due), a.alerts7 + ' alert(s) in 7 days · ' + a.last_alert.replace(/_/g, ' ').toLowerCase(), 'oldest ' + a.oldest + 'd · tier ' + (a.credit_tier || ''), a.credit_action === 'HOLD' ? 'credit hold recommended' : 'call before releasing next order'); });
    sec('5. Team'); agents.forEach(function (g) { var s = perfToday[g.key], w = perfWeek[g.key]; line(g.name, 'today: ' + s.attempts + ' calls, list ' + s.wl_done + '/' + s.wl_size + ' done', '', 'last week score ' + (w.score === null ? 'n/a' : w.score), 'follow-ups on time ' + C.pct(w.fu_rate), s.untouched + ' past-due accounts untouched 14d+'); });
    if (unassigned.length) line('Unassigned past-due accounts', unassigned.length, '', 'see Allocation_Proposal');
    sec('6. Stuck (5+ business days)'); trackItems.filter(function (t) { return t.overdue >= 5; }).forEach(function (t) { line(t.kind + ' ' + t.id, t.account, mm(t.amount), t.what, t.owner, t.overdue + ' business days overdue'); });
    sec('7. Meeting agenda'); var agenda = [];
    A360.filter(function (a) { return a.lane === 'MGMT_REVIEW'; }).sort(function (x, y) { return y.past_due - x.past_due; }).slice(0, 5).forEach(function (a) { agenda.push(['Decide route', a.account_id + ' ' + a.name, mm(a.past_due), a.route.replace(/_/g, ' ').toLowerCase(), a.mgmt_codes.join(', ')]); });
    credit.filter(function (c) { return c.flags.indexOf('URGENT_INCREASE') >= 0 || c.action === 'HOLD'; }).sort(function (x, y) { return y.bal - x.bal; }).slice(0, 5).forEach(function (c) { agenda.push(['Approve credit', c.id + ' ' + c.name, mm(c.rec), c.action + ' (tier ' + c.tier + ')', c.gate || c.flags.join(', ')]); });
    cbs.rows.filter(function (x) { return x.status === 'LOST' && x.outcome_date !== null && x.outcome_date >= asOf - 30; }).forEach(function (x) { agenda.push(['Chargeback lost', x.cb_id + ' ' + x.customer, mm(x.amount), x.category.replace(/_/g, ' ').toLowerCase(), x.root.toLowerCase()]); });
    agents.forEach(function (g) { var w = perfWeek[g.key]; if (w.fu_rate !== null && w.fu_rate < 0.8) agenda.push(['Coaching', g.name, '', 'follow-ups on time ' + C.pct(w.fu_rate), w.fu_late_accts.length + ' late follow-ups last week']); });
    agenda.forEach(function (x) { line(x[0], x[1], x[2], x[3], x[4]); });
    put(tab('Owner_Today', [['section', T], ['item', T], ['account / detail', T], ['amount', M], ['about', T], ['owner / contact', T], ['do this', T]], ownerRows, 'Built ' + C.nice(asOf) + ' from every sheet. Section rows start with §.'));
    put(tab('Meeting_Agenda', [['topic', T], ['item', T], ['amount', M], ['detail', T], ['why', T]], agenda));

    // ---------- Emails (Module 11) ----------
    function table(head, rows) { return '<table style="border-collapse:collapse;width:100%;font-size:13px">' + '<tr>' + head.map(function (h) { return '<th style="text-align:left;border-bottom:2px solid #1d3557;padding:6px 8px;color:#1d3557">' + esc(h) + '</th>'; }).join('') + '</tr>' + rows.map(function (r, i) { return '<tr style="background:' + (i % 2 ? '#f6f8fb' : '#fff') + '">' + r.map(function (c) { return '<td style="padding:6px 8px;border-bottom:1px solid #e6e9ef;vertical-align:top">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>'; }
    function wrap(title, lead, body) { return '<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;color:#1b1f24"><div style="font-size:12px;color:#5b6573;letter-spacing:.04em;text-transform:uppercase">Westline AR Command Center · ' + esc(C.nice(asOf)) + '</div><h2 style="margin:6px 0 4px;font-size:20px">' + esc(title) + '</h2><p style="margin:0 0 14px;color:#33404f">' + lead + '</p>' + body + '<p style="margin-top:18px;font-size:12px;color:#5b6573">Every figure comes from the published sheets after the reconciliation checks passed.</p></div>'; }
    var ownerHtml = wrap('Good morning — ' + K.promises_today.length + ' promises (' + C.fmtUSD0(K.promises_today_amt) + ') are due today',
      'Past due ' + C.fmtUSD0(K.past_due) + ' · older than 60 days ' + C.pct(K.over60_pct, 1) + ' · ' + K.cb.due3 + ' chargeback(s) due within 3 business days · ' + K.stuck + ' item(s) stuck 5+ days.',
      '<h3 style="font-size:15px;margin:14px 0 6px">Promises due today</h3>' + table(['Account', 'Customer', 'Promised', 'Agent', 'Phone'], K.promises_today.map(function (a) { return [a.account_id, a.name, C.fmtUSD(a.promise.amount), nm(a.promise.agent), a.phone]; })) +
      '<h3 style="font-size:15px;margin:14px 0 6px">Deadlines</h3>' + table(['Item', 'Account', 'Due', 'Status'], cbOpen.filter(function (x) { return x.days_left <= 3; }).map(function (x) { return [x.cb_id + ' (chargeback)', x.account_id + ' ' + x.customer, C.short(x.due), x.status]; }).concat(trackItems.filter(function (t) { return t.overdue >= 1 || t.due === asOf; }).slice(0, 10).map(function (t) { return [t.kind + ' ' + t.id, t.account, t.due === null ? '' : C.short(t.due), t.overdue ? t.overdue + 'd overdue · ' + t.owner : 'due today · ' + t.owner]; }))) +
      '<h3 style="font-size:15px;margin:14px 0 6px">Meeting agenda</h3>' + table(['Topic', 'Item', 'Detail'], agenda.map(function (x) { return [x[0], x[1], x[3]]; })));
    R.emails.push({ to: ownerKey, kind: 'owner_brief', subject: '[AR] Owner brief · ' + C.short(asOf) + ' · ' + K.promises_today.length + ' promises due (' + C.fmtUSD0(K.promises_today_amt) + ')', html: ownerHtml });
    agents.filter(function (g) { return g.role !== 'owner'; }).forEach(function (g) {
      var L = lists[g.key].today, due = L.filter(function (a) { return a.promise_status === 'DUE_TODAY'; });
      var html = wrap(g.name.split(' ')[0] + ', your ' + L.length + ' accounts for today', due.length + ' promise' + (due.length === 1 ? '' : 's') + ' due today (' + C.fmtUSD0(sum(due, function (a) { return a.promise.amount || 0; })) + '). Start at the top; the list is ranked.',
        table(['#', 'Account', 'Customer', 'Phone', 'Past due', 'Days', 'Do this'], L.slice(0, cfg.WORKLIST_EMAIL_ROWS).map(function (a, i) { return [i + 1, a.account_id, a.name, a.phone || '(find number)', C.fmtUSD0(a.past_due), a.oldest, a.action]; })) +
        '<p style="margin-top:10px;font-size:13px">The full list (' + L.length + ' accounts) is in your worklist file.</p>');
      R.emails.push({ to: g.key, kind: 'agent_today', subject: '[AR] ' + g.name + ' · ' + C.short(asOf) + ' · ' + L.length + ' accounts, ' + due.length + ' promises due', html: html });
      var w = perfWeek[g.key], pw = perfPrevWeek[g.key];
      var wh = wrap(g.name.split(' ')[0] + ', last week\'s scorecard: ' + (w.score === null ? 'n/a' : w.score) + (pw.score !== null && w.score !== null ? ' (' + (w.score >= pw.score ? '+' : '') + (w.score - pw.score) + ' vs the week before)' : ''), 'Aging-weighted, so harder accounts count more.',
        table(['Measure', 'Last week', 'Week before'], [['Calls', w.attempts, pw.attempts], ['RPC rate', C.pct(w.rpc_rate), C.pct(pw.rpc_rate)], ['RPC vs expected (100 = team)', w.rpc_index, pw.rpc_index], ['Follow-ups on time', w.fu_due ? w.fu_met + '/' + w.fu_due + ' (' + C.pct(w.fu_rate) + ')' : '', pw.fu_due ? C.pct(pw.fu_rate) : ''], ['Promises kept', w.kept_due ? w.kept + '/' + w.kept_due : '', pw.kept_due ? pw.kept + '/' + pw.kept_due : ''], ['$ collected (attributed)', C.fmtUSD0(w.collected), C.fmtUSD0(pw.collected)], ['Past-due accounts untouched 14d+', w.untouched, '']]) +
        '<p style="margin-top:10px;font-size:13px"><b>Focus this week:</b> ' + (w.fu_rate !== null && w.fu_rate < 0.85 ? w.fu_late_accts.length + ' follow-ups were late by ' + w.fu_avg_late + ' business days on average. Clear those accounts first: ' + w.fu_late_accts.slice(0, 6).join(', ') + '.' : w.untouched > 0 ? w.untouched + ' past-due accounts have not been called for 14+ days: ' + w.untouched_ids.slice(0, 6).join(', ') + '.' : 'keep the follow-up discipline; push for card payment on calls over $1,500.') + '</p>');
      R.emails.push({ to: g.key, kind: 'agent_weekly', subject: '[AR] Weekly scorecard · ' + g.name + ' · ' + C.short(weekStart) + '–' + C.short(weekEnd), html: wh });
    });

    // ---------- Rebuttal drafts (Module 9) ----------
    cbOpen.filter(function (x) { return x.status !== 'SUBMITTED'; }).slice(0, 6).forEach(function (x) {
      var a = A[x.account_id] || {}, c = cust.byId[x.account_id] || {}, s = sales.byId[x.account_id], orders = s ? s.orders : 0;
      var body = ['Chargeback response — case ' + x.cb_id + ' (processor case ' + x.case_id + ')', '', 'Merchant: Westline Auto Parts', 'Cardholder business: ' + x.customer + ' (account ' + x.account_id + ', customer since ' + (c.open_date !== null && c.open_date !== undefined ? C.nice(c.open_date) : 'n/a') + ')',
        'Transaction: ' + C.fmtUSD(x.amount) + ' on ' + (x.txn_date !== null ? C.nice(x.txn_date) : 'n/a') + ', ' + x.brand + ' ending ' + x.last4 + ', invoice ' + x.invoice_no, 'Reason code: ' + x.brand + ' ' + x.code + ' (' + x.category.replace(/_/g, ' ').toLowerCase() + ')', '',
        'Summary', 'Westline supplied the parts on invoice ' + x.invoice_no + ' to the cardholder\'s business at its account address. ' + ({ FRAUD: 'The order was placed by a long-standing business customer and delivered to its own premises; this card has been used on the account before without dispute.', NOT_RECEIVED: 'The order was delivered and signed for; the delivery record is attached.', NOT_AS_DESCRIBED: 'The part supplied matches the part number and interchange ordered; the customer was offered a return under the accepted policy.', CREDIT_NOT_PROCESSED: 'The credit the customer refers to has been reviewed against the return record; see the credit memo or the receiving record attached.', CARDHOLDER_DISPUTE: 'The goods were delivered as ordered and the account has been reconciled; supporting records are attached.', DUPLICATE: 'Each charge relates to a separate invoice and a separate delivery.', CANCELLED: 'The order shipped before any cancellation was requested.' }[x.category] || 'Supporting records are attached.'),
        '', 'Account history: ' + orders + ' orders in the last 12 months; open balance ' + C.fmtUSD(a.balance || 0) + '.', '', 'Exhibits to attach', ].concat(C.CB_EVIDENCE[x.category].map(function (e, i) { return (i + 1) + '. ' + e + '  [ ] have  [ ] missing'; }), ['', 'Respond by: ' + C.nice(x.due) + (x.due_estimated ? ' (estimated — confirm in the processor portal)' : ''), 'Prepared by: Collections Lead, Westline Auto Parts']);
      R.docs.push({ cb_id: x.cb_id, title: 'Rebuttal draft – ' + x.cb_id + ' – ' + x.customer, text: body.join('\n') });
    });

    // ---------- Website data ----------
    R.site = { kpi: K, recon: R.recon, published: R.published, as_of: C.iso(asOf), week: K.week,
      perf: { week: agents.map(function (g) { var s = perfWeek[g.key]; return { agent: g.name, role: g.role, calls: s.attempts, weighted: s.weighted, rpc_rate: s.rpc_rate, rpc_index: s.rpc_index, fu_rate: s.fu_rate, fu_due: s.fu_due, fu_met: s.fu_met, fu_late: s.fu_avg_late, kept: s.kept, kept_due: s.kept_due, kept_rate: s.kept_rate, collected: s.collected, untouched: s.untouched, score: s.score }; }),
        prev: agents.map(function (g) { var s = perfPrevWeek[g.key]; return { agent: g.name, score: s.score, fu_rate: s.fu_rate, rpc_index: s.rpc_index, calls: s.attempts }; }) },
      lists: agents.map(function (g) { return { agent: g.name, key: g.key, size: lists[g.key].today.length, rows: lists[g.key].today.slice(0, 12).map(function (a, i) { return [i + 1, a.account_id, a.name, C.fmtUSD0(a.past_due), a.oldest, a.action, a.why]; }) }; }),
      mgmt: A360.filter(function (a) { return a.lane === 'MGMT_REVIEW'; }).sort(function (x, y) { return y.past_due - x.past_due; }).map(function (a) { return [a.account_id, a.name, C.fmtUSD0(a.past_due), a.oldest, a.route.replace(/_/g, ' ').toLowerCase(), a.mgmt_codes.join(', ').replace(/_/g, ' ')]; }),
      credit: credit.filter(function (c) { return c.action !== 'KEEP'; }).sort(function (x, y) { return Math.abs((y.rec || 0) - (y.cur || 0)) - Math.abs((x.rec || 0) - (x.cur || 0)); }).slice(0, 40).map(function (c) { return [c.id, c.name, c.cur === null ? 'none' : C.fmtUSD0(c.cur), c.rec === null ? '' : C.fmtUSD0(c.rec), c.action, c.tier, c.score, c.reasons]; }),
      creditScatter: credit.filter(function (c) { return c.cur !== null && c.need > 0; }).map(function (c) { return [Math.round(c.need / 100), Math.round(c.cur / 100), c.tier, c.action]; }),
      cb: { cats: Object.keys(catRows).map(function (k) { return [k, catRows[k].n, catRows[k].amt / 100, catRows[k].won, catRows[k].lost]; }), roots: Object.keys(rootRows).map(function (k) { return [k, rootRows[k].n, rootRows[k].amt / 100, PREV(k)]; }), open: cbOpen.map(function (x) { return [x.cb_id, x.customer, C.fmtUSD(x.amount), x.brand + ' ' + x.code, x.category, C.short(x.due), x.days_left, x.status]; }) },
      quality: { read: cust.read, clean: cust.rows.length, problems: K.cust_records_with_problems, dups: cust.dups.filter(function (g) { return g.confidence !== 'LOW'; }).slice(0, 8).map(function (g) { return [g.confidence, g.ids.join(' + '), g.recs.map(function (r) { return r.customer_name; }).join(' | ')]; }), issues: Object.keys(dq).map(function (k) { return [k, dq[k]]; }).sort(function (x, y) { return y[1] - x[1]; }),
        samples: cust.issues.filter(function (i) { return i.sev !== 'INFO' && i.original; }).slice(0, 0) },
      owner: { promises: K.promises_today.map(function (a) { return [a.account_id, a.name, C.fmtUSD(a.promise.amount), nm(a.promise.agent)]; }), agenda: agenda.map(function (x) { return [x[0], x[1], x[3]]; }), risk: A360.filter(function (a) { return a.alerts7 > 0 && (a.oldest > 60 || a.over_limit > 0 || a.nsf90); }).sort(function (x, y) { return y.past_due - x.past_due; }).slice(0, 8).map(function (a) { return [a.account_id, a.name, C.fmtUSD0(a.past_due), a.alerts7, a.last_alert, a.oldest]; }) },
      tracker: trackItems.slice(0, 15).map(function (t) { return [t.kind, t.id, t.account, t.what, t.owner, t.due === null ? '' : C.short(t.due), t.overdue, t.stage]; }),
      allocation: activeAgents.map(function (g) { var before = sum(workable.filter(function (a) { return a.agent === g.key; }), workload); return { agent: g.name, target: target[g.key], before: before, after: load[g.key] }; }), moves: changes.length };
    R._A = A; R._credit = {}; credit.forEach(function (c) { R._credit[c.id] = c; }); R._inv = invBy; R._act = actBy; R._agentName = nm;
    R.counts = { customers: cust.rows.length, invoices: inv.rows.length, calls: act.rows.length, queries: qry.rows.length, escalations: escl.rows.length, chargebacks: cbs.rows.length, alerts: alerts.rows.length, a360: A360.length };
    return R;
  }
  return { run: run, BUCKETS: BUCKETS, bucketOf: bucketOf };
})(typeof WL_CORE !== 'undefined' ? WL_CORE : require('./core.js'));
if (typeof module !== 'undefined') module.exports = WL_ENGINE;
