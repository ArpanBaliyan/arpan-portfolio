// demo.js — Westline AR Command Center: seeded demo-data generator.
// Builds the exports that the phase 1 workbook does not already hold, from the phase 1
// account list, so every source agrees. Same seed -> same data, in Node and in Apps Script.
var WL_DEMO = (function () {
  'use strict';

  function hash(s) { var h = 1779033703 ^ s.length; for (var i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
  function rng(seed) { var a = hash(String(seed)); return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function between(r, lo, hi) { return lo + (hi - lo) * r(); }
  function intB(r, lo, hi) { return Math.floor(between(r, lo, hi + 1)); }
  function money(x) { return Math.round(x * 100) / 100; }
  function usd(x) { var s = Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (x < 0 ? '-$' : '$') + s; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayToYMD(d) { var dt = new Date(d * 86400000); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() }; }
  function ymd(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
  function iso(d) { var o = dayToYMD(d); return o.y + '-' + ('0' + o.m).slice(-2) + '-' + ('0' + o.d).slice(-2); }
  function dmy(d) { var o = dayToYMD(d); return o.d + ' ' + MON[o.m - 1] + ' ' + o.y; }
  function us(d) { var o = dayToYMD(d); return o.m + '/' + o.d + '/' + o.y; }
  function isBiz(d) { var w = dayToYMD(d).wd; return w > 0 && w < 6; }
  function hhmm(mins) { var h = Math.floor(mins / 60), m = mins % 60; return h + ':' + ('0' + m).slice(-2); }
  function num(s) { s = String(s || '').replace(/[$,\s]/g, ''); var v = parseFloat(s); return isNaN(v) ? 0 : v; }
  function p1date(s) { // "26 Oct 2026"
    var m = String(s || '').match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})/); if (!m) return null;
    return ymd(+m[3], MON.indexOf(m[2]) + 1, +m[1]);
  }

  var AS_OF = ymd(2026, 10, 26);
  var AGENTS = [
    ['agent_key', 'name', 'email', 'role', 'active', 'daily_capacity', 'max_bucket', 'pinned_accounts', 'start_date'],
    ['LEAD', 'Collections Lead', 'collections.lead@westline-demo.example', 'owner', 'TRUE', '30', '120+', '', '2023-07-10'],
    ['ROHIT', 'Rohit Verma', 'rohit.verma@westline-demo.example', 'agent', 'TRUE', '80', '120+', '', '2024-02-05'],
    ['ANANYA', 'Ananya Desai', 'ananya.desai@westline-demo.example', 'agent', 'TRUE', '80', '120+', '', '2024-06-17'],
    ['KABIR', 'Kabir Singh', 'kabir.singh@westline-demo.example', 'agent', 'TRUE', '80', '91-120', '', '2026-08-03']
  ];
  var CITIES = { SAC: [['Sacramento', '958'], ['Roseville', '956'], ['Folsom', '956'], ['Elk Grove', '956'], ['Davis', '956'], ['Woodland', '956']],
    FRS: [['Fresno', '937'], ['Clovis', '936'], ['Visalia', '932'], ['Madera', '936'], ['Hanford', '932'], ['Selma', '936']],
    RIV: [['Riverside', '925'], ['Corona', '928'], ['Moreno Valley', '925'], ['Fontana', '923'], ['Rialto', '923'], ['Norco', '928']],
    SJC: [['San Jose', '951'], ['Sunnyvale', '940'], ['Campbell', '950'], ['Milpitas', '950'], ['Cupertino', '950'], ['Los Gatos', '950']] };
  var AREA = { SAC: ['916', '279'], FRS: ['559'], RIV: ['951', '909'], SJC: ['408', '669'] };
  var STREETS = ['Industrial Blvd', 'Main St', 'Commerce Way', 'Auburn Blvd', 'Blackstone Ave', 'Kings Canyon Rd', 'Magnolia Ave', 'Arlington Ave', 'Stevens Creek Blvd', 'Monterey Rd', 'Florin Rd', 'Shaw Ave', 'Van Buren Blvd', 'Capitol Expy', 'Power Inn Rd'];
  var EMAILDOM = ['mailbox.example', 'postbox.example', 'inbox.example', 'relay.example', 'dispatch.example', 'messaging.example'];
  var REPS = { SAC: ['Mike Delgado', 'Tina Brooks'], FRS: ['Raul Ortega', 'Dana Kim'], RIV: ['Steve Haro', 'Lupe Garza'], SJC: ['Kevin Tran'] };
  var GEN_NAMES = ['Valley Auto Body', 'Pacific Collision', 'Sierra Body Works', 'Delta Auto Repair', 'Golden Bear Garage', 'Central Coast Fleet', 'Foothill Motors', 'Riverbend Collision', 'Bayview Auto Repair', 'Oak Park Body Shop', 'Citrus Auto Care', 'Redwood Transmission', 'Mission Auto Body', 'Eastside Collision', 'Westgate Garage', 'Northgate Body & Paint', 'Canyon Auto Repair', 'Harbor Fleet Services', 'Summit Tire & Service', 'Lakeside Collision'];

  function slug(name) { return name.toLowerCase().replace(/&/g, 'and').replace(/#\d+/g, '').replace(/[^a-z]+/g, '').slice(0, 28); }

  // phase1 = {accounts:[[hdr],...], invoices:[[hdr],...], calls:[[hdr],...], requests:[[hdr],...]}
  function build(phase1) {
    var r = rng('westline-phase3-v1');
    var A = phase1.accounts, H = A[0];
    function col(hdr, name) { var i = hdr.indexOf(name); if (i < 0) throw new Error('Phase 1 column missing: ' + name); return i; }
    var ai = { id: col(H, 'Account ID'), name: col(H, 'Account'), seg: col(H, 'Segment'), yard: col(H, 'Yard'), group: col(H, 'Group'), owner: col(H, 'Owner'), limit: col(H, 'Credit limit'), lsrc: col(H, 'Limit source'), broken: col(H, 'Broken promises (90 days)'), risk: col(H, 'Risk'), dispute: col(H, 'Open dispute') };
    var I = phase1.invoices, IH = I[0];
    var ii = { acct: col(IH, 'Account ID'), open: col(IH, 'Open balance'), due: col(IH, 'Due date'), inv: col(IH, 'Invoice') };
    var bal = {}, oldest = {}, invByAcct = {};
    for (var k = 1; k < I.length; k++) { var row = I[k]; if (!row[ii.acct]) continue; var id = row[ii.acct]; bal[id] = (bal[id] || 0) + num(row[ii.open]); var dd = p1date(row[ii.due]); var dpd = dd === null ? 0 : AS_OF - dd; if (!(id in oldest) || dpd > oldest[id]) oldest[id] = dpd; (invByAcct[id] = invByAcct[id] || []).push(row[ii.inv]); }

    var accts = [], used = {};
    for (k = 1; k < A.length; k++) { var a = A[k]; if (!a[ai.id]) continue; used[+a[ai.id].slice(2)] = 1;
      accts.push({ id: a[ai.id], name: a[ai.name], seg: a[ai.seg], yard: a[ai.yard], group: a[ai.group], owner: a[ai.owner], limit: a[ai.limit], lsrc: a[ai.lsrc], broken: +a[ai.broken] || 0, risk: a[ai.risk] || 'Medium', dispute: a[ai.dispute], bal: bal[a[ai.id]] || 0, oldest: oldest[a[ai.id]] || 0, active: true }); }
    // paid-up and dormant accounts that do not appear in phase 1 (no open balance today)
    var gaps = []; for (var n = 10101; n <= 10830; n++) if (!used[n]) gaps.push(n);
    var yards = ['SAC', 'SAC', 'FRS', 'FRS', 'RIV', 'SJC'];
    for (k = 0; k < 96 && k < gaps.length; k++) {
      var y = pick(r, yards), base = pick(r, GEN_NAMES), city = pick(r, CITIES[y])[0];
      accts.push({ id: 'C-' + gaps[k], name: base + ' ' + city, seg: pick(r, ['Collision repair', 'Collision repair', 'General repair', 'General repair', 'Dealer service', 'Fleet']), yard: y, group: '', owner: '', limit: pick(r, ['$1,000', '$2,500', '$5,000', '$7,500', '', '$1,000']), lsrc: pick(r, ['Placeholder at onboarding', 'Raised on sales request', 'Set from credit review']), broken: 0, risk: pick(r, ['Low', 'Low', 'Low', 'Medium']), dispute: '', bal: 0, oldest: 0, active: false, dormant: r() < 0.3 });
    }
    accts.sort(function (x, y2) { return x.id < y2.id ? -1 : 1; });

    // per-account profile used by every generated export
    accts.forEach(function (a) {
      var rr = rng('acct-' + a.id);
      var riskIx = { Low: 0, Medium: 1, High: 2, Critical: 3 }[a.risk] || 1;
      a.riskIx = riskIx;
      var scale = a.seg === 'MSO location' ? 1.6 : a.seg === 'Dealer service' ? 1.4 : a.seg === 'Fleet' ? 1.2 : a.seg === 'Retail on account' ? 0.3 : 1;
      a.monthly = money(Math.max(250, (a.bal > 0 ? a.bal * between(rr, 0.9, 1.9) : between(rr, 600, 6000)) * scale));
      if (a.id === 'C-10452') a.monthly = 9200; // the $10K-a-month-on-a-small-limit story from phase 2
      var yrs = riskIx === 3 ? between(rr, 0.1, 3) : between(rr, 0.2, 9.5);
      a.opened = AS_OF - Math.round(yrs * 365);
      if (rr() < 0.025) a.opened = AS_OF - intB(rr, 20, 80);
      a.terms = rr() < 0.82 ? 30 : rr() < 0.5 ? 15 : 45;
      a.city = pick(rr, CITIES[a.yard]); a.area = pick(rr, AREA[a.yard]);
      a.phone = a.area + (intB(rr, 200, 989), '55501') + ('0' + intB(rr, 0, 9999)).slice(-2);
      a.phone2 = rr() < 0.35 ? a.area + (intB(rr, 200, 989), '55501') + ('0' + intB(rr, 0, 9999)).slice(-2) : '';
      var person = pick(rr, ['maria', 'jose', 'mike', 'linda', 'sam', 'tony', 'priya', 'kevin', 'ana', 'dave', 'rosa', 'tim']);
      a.contact = person.charAt(0).toUpperCase() + person.slice(1) + ' ' + pick(rr, ['Lopez', 'Nguyen', 'Smith', 'Patel', 'Garcia', 'Kim', 'Brown', 'Singh', 'Reyes', 'Chen']);
      a.email = rr() < 0.55 ? 'ap@' + slug(a.name) + '.example' : person + '.' + slug(a.name).slice(0, 8) + '@' + pick(rr, EMAILDOM);
      a.street = intB(rr, 100, 9899) + ' ' + pick(rr, STREETS);
      a.zip = a.city[1] + ('0' + intB(rr, 1, 99)).slice(-2);
      a.rep = pick(rr, REPS[a.yard]);
      a.dormant = a.dormant || false;
    });

    // ---------- 1. Customer master export (messy on purpose) ----------
    var cm = [['Cust #', 'Customer Name', 'DBA', 'Acct Opened', 'Type', 'Status', 'Terms', 'Cr Limit', 'Street', 'City', 'St', 'Zip', 'Phone', 'Alt Phone', 'E-mail', 'Contact', 'Yard', 'Sales Rep']];
    var mr = rng('master-mess');
    accts.forEach(function (a) {
      var row = [a.id, a.name, a.group ? a.group : '', us(a.opened), a.seg === 'Retail on account' ? 'B2C' : 'B2B', a.riskIx === 3 && mr() < 0.5 ? 'Credit Hold' : 'Active', 'NET' + a.terms, a.limit ? a.limit.replace('$', '').replace(',', '') : '', a.street, a.city[0], 'CA', a.zip, '(' + a.phone.slice(0, 3) + ') ' + a.phone.slice(3, 6) + '-' + a.phone.slice(6), a.phone2, a.email, a.contact, a.yard, a.rep];
      var x = mr();
      if (x < 0.05) row[1] = row[1].toUpperCase();
      else if (x < 0.07) row[1] = row[1] + ',';
      else if (x < 0.08) row[1] = '  ' + row[1] + '  ';
      x = mr();
      if (x < 0.06) row[12] = a.phone; else if (x < 0.10) row[12] = '+1 ' + a.phone.slice(0, 3) + '.' + a.phone.slice(3, 6) + '.' + a.phone.slice(6); else if (x < 0.12) row[12] = row[12] + ' x' + intB(mr, 10, 39); else if (x < 0.14) row[12] = a.phone.slice(0, 7); else if (x < 0.155) row[12] = '';
      x = mr();
      if (x < 0.07) row[14] = ''; else if (x < 0.10) row[14] = row[14].toUpperCase(); else if (x < 0.12) row[14] = row[14].replace('mailbox.example', 'gmial.com').replace('postbox.example', 'yahooo.com').replace('.com', '.con'); else if (x < 0.13) row[14] = row[14] + '; billing@' + slug(a.name) + '.example'; else if (x < 0.135) row[14] = 'N/A';
      x = mr();
      if (x < 0.05) row[10] = 'Calif'; else if (x < 0.08) row[10] = 'ca '; else if (x < 0.09) row[10] = 'California'; else if (x < 0.095) row[10] = '';
      x = mr();
      if (x < 0.04) row[11] = row[11] + '-' + intB(mr, 1000, 9999); else if (x < 0.05) row[11] = '';
      x = mr();
      if (x < 0.06) row[3] = dmy(a.opened); else if (x < 0.09) row[3] = iso(a.opened); else if (x < 0.11) row[3] = String(a.opened + 25569); else if (x < 0.12) row[3] = '';
      x = mr();
      if (x < 0.05 && row[7]) row[7] = '$' + Number(row[7]).toLocaleString('en-US') + '.00'; else if (x < 0.07) row[7] = row[7] ? row[7] : 'N/A';
      x = mr();
      if (x < 0.04) row[0] = row[0].toLowerCase(); else if (x < 0.06) row[0] = ' ' + row[0].replace('-', '- ');
      if (mr() < 0.05) row[6] = pick(mr, ['Net 30', 'N30', '30 days', 'net30']);
      cm.push(row);
    });
    // a few rows in the wrong columns, a numeric name, and duplicate accounts
    var dupSrc = accts.filter(function (a) { return a.active; });
    for (k = 0; k < 9; k++) {
      var s = dupSrc[Math.floor(mr() * dupSrc.length)], nid = 'C-' + (10831 + k);
      var d = [nid, k % 3 === 0 ? s.name.toUpperCase() : s.name.replace(' & ', ' and '), '', us(AS_OF - intB(mr, 30, 900)), 'B2B', 'Active', 'NET30', pick(mr, ['1000', '2500', '']), k % 2 ? s.street : s.street.replace('St', 'Street'), s.city[0], 'CA', s.zip, k % 3 === 1 ? s.phone : '(' + s.phone.slice(0, 3) + ') ' + s.phone.slice(3, 6) + '-' + s.phone.slice(6), '', k % 3 === 2 ? s.email : '', s.contact, s.yard, s.rep];
      cm.push(d);
    }
    cm.push(['C-10842', '41522', '', '1/9/2025', 'B2B', 'Active', 'NET30', '1500', '771 Commerce Way', 'Fresno', 'CA', '93722', '(559) 555-0166', '', 'ap@kerbautoworks.example', 'Gina Kerb', 'FRS', 'Dana Kim']);
    cm.push(['C-10843', 'ap@rioautocare.example', '', '3/2/2024', 'B2B', 'Active', 'NET30', '2000', '18 Main St', 'Corona', 'CA', '92879', '', '', '', 'Rio Auto Care', 'RIV', 'Steve Haro']);
    cm.push(['', 'Lakeside Collision Norco', '', '5/5/2023', 'B2B', 'Active', 'NET30', '2500', '402 Magnolia Ave', 'Norco', 'CA', '92860', '(951) 555-0145', '', 'office@lakesidecollision.example', 'Ray Ochoa', 'RIV', 'Lupe Garza']);
    cm.push(['C-10844', 'Delta Auto Repair Selma', '', '7/15/2026', 'B2B', 'Active', 'NET30', '-500', '9 Shaw Ave', 'Selma', 'CA', '93662', '(559) 555-0180', '', 'deltaautoselma@gmail.example', 'Sal Ruiz', 'FRS', 'Raul Ortega']);

    // ---------- 2. Sales & returns history (12 months, wide) ----------
    var months = []; for (k = 11; k >= 0; k--) { var mm = 10 - k, yy = 2026; while (mm <= 0) { mm += 12; yy--; } months.push([yy, mm]); }
    var sh = ['Customer', 'Customer Name'];
    months.forEach(function (p) { sh.push('Net Sales ' + MON[p[1] - 1] + ' ' + String(p[0]).slice(2)); });
    sh.push('Returns 12M', 'Gross Sales 12M', 'Orders 12M');
    var sales = [sh];
    accts.forEach(function (a) {
      var rr = rng('sales-' + a.id), row = [a.id, a.name], gross = 0, ret = 0, orders = 0;
      var regular = [0.97, 0.88, 0.72, 0.5][a.riskIx], retRate = [between(rr, 0.02, 0.06), between(rr, 0.04, 0.1), between(rr, 0.08, 0.17), between(rr, 0.14, 0.26)][a.riskIx];
      var trend = between(rr, -0.25, 0.45);
      months.forEach(function (p, ix) {
        var openedMonth = ymd(p[0], p[1], 28) >= a.opened;
        var buys = openedMonth && rr() < regular && !(a.dormant && ix >= 5);
        var v = buys ? a.monthly * (1 + trend * (ix - 11) / 11) * between(rr, 0.7, 1.3) : 0;
        v = money(Math.max(0, v)); gross += v / (1 - retRate); ret += v / (1 - retRate) * retRate; orders += v > 0 ? intB(rr, 3, 22) : 0;
        row.push(v ? v.toFixed(2) : '0');
      });
      row.push(money(ret).toFixed(2), money(gross).toFixed(2), String(orders));
      sales.push(row);
    });

    // ---------- 3. Payment history summary (12 months) ----------
    var pay = [['Customer', 'Invoices Paid 12M', 'Amount Paid 12M', 'Paid Within Terms+5', 'Avg Days To Pay', 'Max Days Late 6M', 'NSF 12M', 'Last Payment']];
    var nsfAcct = {}; (phase1.requests || []).slice(1).forEach(function (q) { if (/bounced/i.test(q[3] || '')) nsfAcct[q[4]] = 1; });
    accts.forEach(function (a) {
      var rr = rng('pay-' + a.id), srow = sales[accts.indexOf(a) + 1], paidAmt = 0;
      for (var m2 = 2; m2 < 14; m2++) paidAmt += num(srow[m2]);
      paidAmt = money(paidAmt * between(rr, 0.92, 1.0));
      var within = [between(rr, 0.86, 0.99), between(rr, 0.68, 0.9), between(rr, 0.42, 0.75), between(rr, 0.15, 0.5)][a.riskIx];
      var maxLate = Math.max(a.oldest, Math.round([between(rr, 0, 12), between(rr, 5, 35), between(rr, 25, 70), between(rr, 60, 140)][a.riskIx]));
      var avg = a.terms + Math.round([between(rr, -4, 4), between(rr, 3, 14), between(rr, 12, 35), between(rr, 30, 80)][a.riskIx]);
      var nsf = nsfAcct[a.id] ? 1 : (a.riskIx >= 2 && rr() < 0.12 ? 1 : 0);
      var invPaid = paidAmt > 0 ? Math.max(1, Math.round(paidAmt / between(rr, 250, 700))) : 0;
      pay.push([a.id, String(invPaid), paidAmt.toFixed(2), paidAmt > 0 ? money(paidAmt * within).toFixed(2) : '0', paidAmt > 0 ? String(avg) : '', String(maxLate), String(nsf), paidAmt > 0 ? us(AS_OF - intB(rr, 1, a.dormant ? 200 : 40)) : '']);
    });

    // ---------- 4. Chargeback tracker ----------
    var CB_SET = [ // [brand, code, root causes weighted, share]
      ['Visa', '13.6', ['LATE_CREDIT', 'LATE_RETURN_PICKUP', 'LATE_SCAN', 'SALES_DID_NOT_INFORM'], 0.42],
      ['Mastercard', '4853', ['LATE_CREDIT', 'LATE_SCAN', 'SALES_DID_NOT_INFORM'], 0.16],
      ['Visa', '13.3', ['WRONG_PART', 'WRONG_PART', 'DAMAGED', 'CUSTOMER_ERROR'], 0.08],
      ['Visa', '13.1', ['LATE_RETURN_PICKUP', 'CUSTOMER_ERROR', 'OTHER'], 0.07],
      ['Visa', '10.4', ['FRIENDLY_FRAUD', 'TRUE_FRAUD'], 0.05],
      ['Mastercard', '4837', ['FRIENDLY_FRAUD', 'TRUE_FRAUD'], 0.03],
      ['Visa', '12.6.1', ['DUPLICATE_BILLING'], 0.04],
      ['American Express', 'C02', ['LATE_CREDIT', 'SALES_DID_NOT_INFORM'], 0.07],
      ['Discover', 'RN2', ['LATE_CREDIT'], 0.03],
      ['Visa', '13.7', ['SALES_DID_NOT_INFORM', 'CUSTOMER_ERROR'], 0.04]
    ];
    var cbh = ['Case #', 'Received', 'Respond By', 'Account', 'Customer', 'Invoice', 'Txn Date', 'Amount', 'Card', 'Last 4', 'Reason Code', 'Processor Case ID', 'Yard', 'Sales Rep', 'Root Cause', 'Status', 'Submitted', 'Outcome Date', 'Recovered', 'Notes'];
    var cb = [cbh], cr = rng('chargebacks'), actives = accts.filter(function (a) { return a.active; });
    var cbDays = []; for (var dd2 = ymd(2026, 1, 5); dd2 <= AS_OF; dd2++) if (isBiz(dd2)) cbDays.push(dd2);
    for (k = 0; k < 46; k++) {
      var recv = k < 35 ? cbDays[Math.floor(cr() * (cbDays.length - 18))] : cbDays[cbDays.length - 1 - Math.floor(cr() * 7)];
      var t = cr(), acc = 0, set = CB_SET[0]; for (var j = 0; j < CB_SET.length; j++) { acc += CB_SET[j][3]; if (t < acc) { set = CB_SET[j]; break; } }
      var a2 = pick(cr, actives), amt = money(between(cr, 85, 2400)), txn = recv - intB(cr, 12, 75);
      var due = recv + 10; while (!isBiz(due)) due++;
      var root = pick(cr, set[2]), closed = recv < AS_OF - 21;
      var status, sub = '', outD = '', rec = '';
      if (closed) {
        var preventable = /LATE|SALES/.test(root);
        var u = cr();
        if (preventable && u < 0.30) { status = 'REFUNDED_BEFORE'; }
        else if (u < 0.40) { status = 'ACCEPTED'; }
        else { status = cr() < (root === 'TRUE_FRAUD' ? 0.25 : 0.88) ? 'WON' : 'LOST'; sub = us(recv + intB(cr, 2, 7)); outD = us(recv + intB(cr, 25, 60)); rec = status === 'WON' ? amt.toFixed(2) : '0'; }
        if ((status === 'WON' || status === 'LOST') && recv + 45 > AS_OF) { status = 'SUBMITTED'; outD = ''; rec = ''; }
      } else {
        status = pick(cr, ['NEW', 'GATHERING', 'GATHERING', 'SUBMITTED']); if (status === 'SUBMITTED') sub = us(recv + 2);
      }
      var invs = invByAcct[a2.id] || [];
      var notes = '';
      if (k === 40) notes = 'Customer read card 4111111111111111 to rep over phone';
      if (k === 43) due = null;
      cb.push(['CB-26' + ('00' + (k + 1)).slice(-3), us(recv), due === null ? '' : us(due), a2.id, a2.name, invs.length ? pick(cr, invs) : a2.yard + '-' + intB(cr, 2601, 2610) + '-' + intB(cr, 1000, 9999), us(txn), amt.toFixed(2), set[0], String(intB(cr, 1000, 9999)), set[1], 'PRC' + intB(cr, 100000, 999999), a2.yard, a2.rep, closed ? root : (cr() < 0.4 ? root : ''), status, sub, outD, rec, notes]);
    }

    // ---------- 5. Escalations ----------
    var esc = [['Esc #', 'Opened', 'Account', 'Type', 'Severity', 'Owner', 'Status', 'Next Step', 'Next Step Date', 'Closed', 'Amount']];
    var er = rng('escalations'), n2 = 0;
    accts.filter(function (a) { return a.dispute; }).forEach(function (a) {
      n2++;
      var opened = AS_OF - intB(er, 3, 40);
      esc.push(['ESC-' + (2600 + n2), us(opened), a.id, 'Dispute: ' + a.dispute, a.bal > 3000 ? 'High' : 'Medium', er() < 0.4 ? 'Collections Lead' : a.owner, pick(er, ['Open', 'Waiting on other team', 'Open']), pick(er, ['Get return scan from yard', 'Confirm credit memo with AR', 'Send photos to customer', 'Price check with sales desk', 'Call customer with resolution']), us(AS_OF + intB(er, -6, 4)), '', a.bal.toFixed(2)]);
    });
    var escTypes = ['Stuck refund', 'Statement does not match', 'Key-account reconciliation', 'Broker / fraud order check', 'Customer complaint – service'];
    for (k = 0; k < 14; k++) {
      var a3 = pick(er, actives), op = AS_OF - intB(er, 1, 55), done = er() < 0.45;
      esc.push(['ESC-' + (2600 + (++n2)), us(op), a3.id, pick(er, escTypes), pick(er, ['High', 'Medium', 'Low']), pick(er, ['Collections Lead', a3.owner || 'Collections Lead']), done ? 'Closed' : pick(er, ['Open', 'Waiting on customer']), done ? '' : pick(er, ['Call customer back', 'Chase AP for refund', 'Reconcile line by line']), done ? '' : us(AS_OF + intB(er, -9, 5)), done ? us(op + intB(er, 1, 9)) : '', money(between(er, 120, 4200)).toFixed(2)]);
    }

    // ---------- 6. Alerts inbox (PowerLink alerts routed to email) ----------
    var al = [['Received', 'From', 'Subject', 'Body', 'Message ID']], ar = rng('alerts'), mid = 7700;
    var over60 = accts.filter(function (a) { return a.active && a.oldest > 60; });
    var overLim = accts.filter(function (a) { var l = num(a.limit); return a.active && l > 0 && a.bal > l; });
    var flagged = accts.filter(function (a) { return nsfAcct[a.id]; });
    function alertRow(type, a, when) {
      var amt = money(between(ar, 90, 2600)), so = 'SO-' + intB(ar, 480000, 489999), o = dayToYMD(when.d);
      var stamp = o.m + '/' + o.d + '/' + o.y + ' ' + hhmm(when.m);
      var subj = { NEW_ORDER_OVER60: '[PowerLink Alert] New order on account with 60+ day balance', ORDER_OVER_LIMIT: '[PowerLink Alert] Order exceeds credit limit', ORDER_ON_FLAGGED: '[PowerLink Alert] Order on flagged account (NSF / chargeback)' }[type];
      var body = 'Account: ' + a.id + ' ' + a.name + ' | Order: ' + so + ' | Amount: ' + usd(amt) + ' | Yard: ' + a.yard + ' | Created: ' + stamp;
      al.push([iso(when.d) + ' ' + hhmm(when.m), 'alerts@powerlink.westline-demo.example', subj, body, 'msg-' + (mid++)]);
    }
    var aDays = []; for (dd2 = AS_OF - 14; dd2 <= AS_OF; dd2++) if (isBiz(dd2)) aDays.push(dd2);
    for (k = 0; k < 30 && over60.length; k++) alertRow('NEW_ORDER_OVER60', pick(ar, over60), { d: pick(ar, aDays), m: intB(ar, 420, 1020) });
    for (k = 0; k < 22 && overLim.length; k++) alertRow('ORDER_OVER_LIMIT', pick(ar, overLim), { d: pick(ar, aDays), m: intB(ar, 420, 1020) });
    for (k = 0; k < 8 && flagged.length; k++) alertRow('ORDER_ON_FLAGGED', pick(ar, flagged), { d: pick(ar, aDays), m: intB(ar, 420, 1020) });
    al.push([iso(AS_OF) + ' 7:41', 'alerts@powerlink.westline-demo.example', '[PowerLink Alert] Daily job summary', 'Alert job completed. 14 alerts sent. No errors.', 'msg-' + (mid++)]);
    al.push([iso(AS_OF - 3) + ' 9:12', 'alerts@powerlink.westline-demo.example', '[PowerLink Alert] New order on account with 60+ day balance', 'Acct C-1O399 Hanford Body & Paint order created by counter', 'msg-' + (mid++)]);
    al.push(al[5].slice()); // the same message delivered twice

    // ---------- 7. Call history export (Form v2, earlier weeks) ----------
    var ch = [['Timestamp', 'Email Address', 'Account ID', 'Outcome', 'Promise Amount', 'Promise Date', 'Next Follow-up Date', 'Notes']];
    var hr = rng('call-history');
    var email = { 'Collections Lead': AGENTS[1][2], 'Rohit Verma': AGENTS[2][2], 'Ananya Desai': AGENTS[3][2], 'Kabir Singh': AGENTS[4][2] };
    var prof = { 'Collections Lead': { n: 22, rpc: 0.5, fu: 0.9, setfu: 0.95 }, 'Rohit Verma': { n: 46, rpc: 0.31, fu: 0.8, setfu: 0.9 }, 'Ananya Desai': { n: 44, rpc: 0.29, fu: 0.84, setfu: 0.92 }, 'Kabir Singh': { n: 42, rpc: 0.3, fu: 0.42, setfu: 0.72 } };
    var mine = {}; accts.forEach(function (a) { if (a.active && a.owner) (mine[a.owner] = mine[a.owner] || []).push(a); });
    var hDays = []; for (dd2 = ymd(2026, 9, 28); dd2 < AS_OF - 3; dd2++) if (isBiz(dd2)) hDays.push(dd2);
    var nextDue = {}, pending = {};
    hDays.forEach(function (day) {
      Object.keys(prof).forEach(function (ag) {
        var P = prof[ag], pool = mine[ag] || [];
        var due = pool.filter(function (a) { return (pending[a.id] && day >= pending[a.id].date && hr() < 0.92) || (nextDue[a.id] !== undefined && nextDue[a.id] <= day && hr() < P.fu); });
        var rest = pool.filter(function (a) { return due.indexOf(a) < 0; }).sort(function (x, z) { return (z.oldest + z.bal / 200) * (0.5 + hr()) - (x.oldest + x.bal / 200) * (0.5 + hr()); });
        var todays = due.concat(rest).slice(0, P.n), t0 = 420;
        if (ag !== 'Collections Lead') { var others = Object.keys(mine).filter(function (o) { return o !== ag && o !== 'Collections Lead'; }); for (var cx = 0; cx < 3; cx++) { var op = mine[pick(hr, others)]; if (op && op.length) todays.splice(intB(hr, 0, todays.length), 0, pick(hr, op)); } }
        todays.forEach(function (a) {
          t0 += intB(hr, 3, 9); if (t0 > 1020) return;
          var rpc = hr() < P.rpc * (a.riskIx === 3 ? 0.6 : 1), out, pa = '', pd = '', fu = '';
          var pend = pending[a.id];
          if (pend && day >= pend.date) { delete pending[a.id]; if (pend.kept) { rpc = true; out = 'Already paid – remittance sent'; } else { rpc = hr() < 0.4; out = rpc ? pick(hr, ['Refused / hardship', 'Callback requested']) : pick(hr, ['No answer', 'Left voicemail']); } }
          else if (rpc) { var u = hr(); out = u < 0.38 ? 'Promise to pay' : u < 0.5 ? 'Paid on call' : u < 0.72 ? 'Callback requested' : u < 0.82 ? 'Already paid – remittance sent' : u < 0.9 ? 'Refused / hardship' : u < 0.96 ? 'Dispute raised' : 'Refund / credit request'; }
          else { var v = hr(); out = v < 0.45 ? 'No answer' : v < 0.78 ? 'Left voicemail' : v < 0.95 ? 'Reached shop – AP contact unavailable' : 'Wrong number'; }
          if (out === 'Promise to pay') { pa = usd(money(Math.min(a.bal || 300, (a.bal || 300) * between(hr, 0.3, 1)))); var pdd = day + intB(hr, 1, 6); while (!isBiz(pdd)) pdd++; pd = us(pdd); pending[a.id] = { date: pdd, kept: hr() < (ag === 'Kabir Singh' ? 0.74 : ag === 'Collections Lead' ? 0.9 : 0.82) }; }
          if (out === 'Paid on call') pa = usd(money((a.bal || 250) * between(hr, 0.2, 0.8)));
          var gap = out === 'Promise to pay' ? 0 : a.oldest > 60 ? 2 : a.oldest > 30 ? 3 : 5;
          var fud = day + (out === 'Promise to pay' ? (num(pd) ? 0 : 0) : gap); if (out === 'Promise to pay') { var pp = pd.split('/'); fud = ymd(+pp[2], +pp[0], +pp[1]) + 1; }
          while (!isBiz(fud)) fud++;
          if (hr() < P.setfu) fu = us(fud);
          nextDue[a.id] = fud;
          ch.push([us(day) + ' ' + hhmm(t0) + ':00', email[ag], hr() < 0.01 ? a.id.replace('C-', 'C') : a.id, out, pa, pd, fu, '']);
        });
      });
    });

    // ---------- 8. Assignments (starting point = phase 1 owners) ----------
    var asg = [['account_id', 'agent_key', 'since', 'approved_by', 'approved_at']];
    var keyOf = { 'Collections Lead': 'LEAD', 'Rohit Verma': 'ROHIT', 'Ananya Desai': 'ANANYA', 'Kabir Singh': 'KABIR' };
    accts.forEach(function (a) { if (a.owner && keyOf[a.owner]) asg.push([a.id, keyOf[a.owner], '2026-10-01', 'Collections Lead', '2026-10-01']); });

    return { Customer_Master_Export: cm, Sales_History_Export: sales, Payment_History_Export: pay, Chargeback_Tracker: cb, Escalations: esc, Alerts_Inbox: al, Call_History_Export: ch, Agents: AGENTS.map(function (x) { return x.slice(); }), Assignments: asg };
  }

  return { build: build, AS_OF_ISO: '2026-10-26' };
})();
if (typeof module !== 'undefined') module.exports = WL_DEMO;
