// Westline AR Command Center — one file for Google Apps Script.
// Paste this whole file into Extensions → Apps Script of the Control sheet, save, reload the sheet, then AR Center → 1. Set up and run the demo.

// ===================== core.js =====================
// core.js — Westline AR Command Center: utilities, data contracts and cleaners (Modules 0–1).
// Pure JavaScript: no Google services here, so the same code runs in Apps Script and in tests.
var WL_CORE = (function () {
  'use strict';

  // ---------------- Config defaults (Appendix of the blueprint) ----------------
  var DEFAULTS = {
    AS_OF: '2026-10-26', TIME_ZONE: 'America/Los_Angeles', TEST_MODE: true,
    BLANK_TOKENS: ['n/a', 'na', 'null', 'none', '-', '--', '#n/a', '0000-00-00', 'tbd'],
    ID_PATTERN: '^C-\\d{5}$', MIN_VALID_DATE: '1990-01-01',
    EMAIL_DOMAIN_FIXES: { 'gmial.com': 'gmail.com', 'gmail.con': 'gmail.com', 'yahooo.com': 'yahoo.com', 'hotmial.com': 'hotmail.com' },
    DEFAULT_TERMS: 30, MIN_BALANCE_TO_WORK: 25, PROMISE_GRACE_DAYS: 2,
    FU_CADENCE: { 'Current': 10, '1-30': 5, '31-60': 3, '61-90': 2, '91-120': 2, '120+': 2 },
    FOLLOWUP_GRACE_BDAYS: 1, ATTRIBUTION_DAYS: 14,
    W: { 'Current': 1.0, '1-30': 1.0, '31-60': 1.3, '61-90': 1.6, '91-120': 2.0, '120+': 2.5 },
    PRI_AGE: { 'Current': 5, '1-30': 15, '31-60': 30, '61-90': 45, '91-120': 55, '120+': 60 },
    PRI_SIZE: [[250, 0], [1000, 5], [5000, 10], [15000, 15], [Infinity, 20]],
    PRI_PTP_DUE: 25, PRI_PTP_BROKEN: 20, PRI_FU_LATE: 10, PRI_FU_LATE3: 15, PRI_NEVER: 15, PRI_STALE: 10,
    PRI_ORDERING_60: 15, PRI_OVER_LIMIT: 5, PRI_NSF: 10, PRI_NO_CONTACT: -10, PRI_CALLED_TODAY: -50,
    TARGET_WEIGHTED_ATTEMPTS_DAY: 60, MIN_ATTEMPTS_FOR_SCORE: 20, SHOW_TEAM_RANK: false,
    COMPOSITE: { followup: 25, rpcIndex: 20, kept: 15, effort: 15, untouched: 15, quality: 10 },
    WL_BALANCE_UNIT: 5000, WL_REBALANCE_PCT: 1.15, WL_REBALANCE_TARGET: 1.05,
    SMALL_CLAIMS_MAX: 12500, MIN_CLAIM_BALANCE: 250,
    QUERY_SLA_BDAYS: { 'bounced': 1, 'cod': 1, 'remittance': 2, 'not on account': 2, 'short payment': 2, 'refund': 3, 'credit memo': 3, 'statement': 3, 'other': 3 },
    ESC_SLA_BDAYS: { High: 1, Medium: 2, Low: 5 },
    CREDIT: { STARTER: 1500, DORMANT: 500, MIN: 500, ROUND: 500, BUFFER_DAYS: 15,
      TIERS: [['A', 85, 1.5, 100000], ['B', 70, 1.25, 50000], ['C', 55, 1.0, 25000], ['D', 40, 0.75, 10000], ['E', 0, 0, 0]],
      STEP_MULT: 2, STEP_ADD: 5000, NOCHURN_PCT: 0.15, NOCHURN_MIN: 500 },
    CB_DEFAULT_RESPONSE_DAYS: 7, SWING_ALERT_PCT: 0.25,
    HOLIDAYS: ['2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03', '2026-09-07', '2026-11-26', '2026-11-27', '2026-12-25'],
    AUDIT_PER_AGENT: 5, WORKLIST_EMAIL_ROWS: 25
  };
  function config(over) { var c = JSON.parse(JSON.stringify(DEFAULTS)); c.PRI_SIZE[4][0] = Infinity; if (over) for (var k in over) c[k] = over[k]; return c; }

  // ---------------- Basic helpers ----------------
  var MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MONC = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function str(v) { return v === null || v === undefined ? '' : String(v); }
  function trim(v) { return str(v).replace(/\s+/g, ' ').trim(); }
  function makeBlank(cfg) { var set = {}; cfg.BLANK_TOKENS.forEach(function (t) { set[t] = 1; }); return function (v) { var s = trim(v).toLowerCase(); return s === '' || set[s] === 1; }; }
  function ymd(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
  function parts(day) { var t = new Date(day * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay() }; }
  function iso(day) { if (day === null || day === undefined || isNaN(day)) return ''; var p = parts(day); return p.y + '-' + ('0' + p.m).slice(-2) + '-' + ('0' + p.d).slice(-2); }
  function nice(day) { if (day === null || day === undefined) return ''; var p = parts(day); return p.d + ' ' + MONC[p.m - 1] + ' ' + p.y; }
  function short(day) { if (day === null || day === undefined) return ''; var p = parts(day); return MONC[p.m - 1] + ' ' + p.d; }
  function isoToDay(s) { var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? ymd(+m[1], +m[2], +m[3]) : null; }
  function validYMD(y, m, d) { if (m < 1 || m > 12 || d < 1 || d > 31) return null; var day = ymd(y, m, d), p = parts(day); return p.m === m && p.d === d ? day : null; }
  function timeMins(s) { var m = String(s || '').match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i); if (!m) return null; var h = +m[1]; if (m[3]) { var pm = /pm/i.test(m[3]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; } return h * 60 + (+m[2]); }

  // parseDate -> {d: day number or null, min: minutes or null, issue}
  function parseDate(v, asOf) {
    if (v instanceof Date && !isNaN(v)) return { d: ymd(v.getFullYear(), v.getMonth() + 1, v.getDate()), min: v.getHours() * 60 + v.getMinutes() };
    if (typeof v === 'number') { if (v > 20000 && v < 80000) return { d: Math.floor(v) - 25569, min: null }; return { d: null, issue: 'DATE_NUMBER_OUT_OF_RANGE' }; }
    var s = trim(v), m, d = null, y;
    if (s === '') return { d: null };
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) d = validYMD(+m[1], +m[2], +m[3]);
    else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) { y = +m[3]; if (y < 100) y += y < 70 ? 2000 : 1900; d = validYMD(y, +m[1], +m[2]); }
    else if ((m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]+(\d{4})/))) d = validYMD(+m[3], MON.indexOf(m[2].toLowerCase()) + 1, +m[1]);
    else if ((m = s.match(/^([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{4})/))) d = validYMD(+m[3], MON.indexOf(m[1].toLowerCase()) + 1, +m[2]);
    else if ((m = s.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]*(?: |$)/)) && asOf !== undefined) { var p = parts(asOf); d = validYMD(p.y, MON.indexOf(m[2].toLowerCase()) + 1, +m[1]); if (d !== null && d > asOf + 31) d = validYMD(p.y - 1, MON.indexOf(m[2].toLowerCase()) + 1, +m[1]); }
    else if ((m = s.match(/^(\d{5})(\.\d+)?$/))) { var n = +m[1]; if (n > 20000 && n < 80000) d = n - 25569; }
    if (d === null) return { d: null, issue: 'DATE_UNREADABLE' };
    return { d: d, min: null };
  }
  function dateTime(v, asOf) { var r = parseDate(v, asOf); if (r.d === null) return r; var s = trim(v); var mm = s.match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?)\s*$/i); r.min = mm ? timeMins(mm[1]) : null; return r; }

  // parseMoney -> {c: integer cents or null, issue}
  function parseMoney(v, isBlank) {
    if (typeof v === 'number') return { c: Math.round(v * 100) };
    var s = trim(v); if (isBlank(s)) return { c: null };
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
    s = s.replace(/[$,\s]/g, '');
    if (/^-/.test(s)) { neg = !neg; s = s.slice(1); }
    if (!/^\d+(\.\d+)?$/.test(s)) return { c: null, issue: 'MONEY_NOT_A_NUMBER' };
    var c = Math.round(parseFloat(s) * 100); return { c: neg ? -c : c };
  }
  function dollars(c) { return c === null || c === undefined ? '' : Math.round(c) / 100; }
  function fmtUSD(c) { if (c === null || c === undefined) return ''; var x = Math.round(c) / 100, s = Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (x < 0 ? '-$' : '$') + s; }
  function fmtUSD0(c) { var x = Math.round((c || 0) / 100), s = Math.abs(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (x < 0 ? '-$' : '$') + s; }
  function pct(x, dp) { return (x === null || isNaN(x)) ? '' : (x * 100).toFixed(dp === undefined ? 0 : dp) + '%'; }

  // ---------------- Business days ----------------
  function makeCal(cfg) {
    var hol = {}; cfg.HOLIDAYS.forEach(function (h) { hol[isoToDay(h)] = 1; });
    function isBiz(d) { var w = parts(d).wd; return w > 0 && w < 6 && !hol[d]; }
    function addBiz(d, n) { var x = d; while (n > 0) { x++; if (isBiz(x)) n--; } while (n < 0) { x--; if (isBiz(x)) n++; } return x; }
    function bizBetween(a, b) { if (a === b) return 0; if (b < a) return -bizBetween(b, a); var n = 0; for (var x = a + 1; x <= b; x++) if (isBiz(x)) n++; return n; }
    return { isBiz: isBiz, addBiz: addBiz, bizBetween: bizBetween };
  }

  // ---------------- Field normalizers (each returns {v, issues:[{sev,code,msg}]}) ----------------
  function iss(sev, code, msg) { return { sev: sev, code: code, msg: msg }; }
  function normId(v, cfg) {
    var raw = str(v), s = raw.toUpperCase().replace(/\s+/g, ''), out = [], re = new RegExp(cfg.ID_PATTERN);
    if (s === '') return { v: '', issues: [iss('ERROR', 'ID_BLANK', 'Account ID is blank; row left out of the clean data')] };
    var m = s.match(/^C-?(\d{5})$/); if (m) s = 'C-' + m[1];
    if (s !== raw) out.push(iss('INFO', 'ID_NORMALIZED', 'Account ID "' + raw + '" read as ' + s));
    if (!re.test(s)) out.push(iss('WARN', 'ID_PATTERN', 'Account ID "' + s + '" does not match the usual pattern'));
    return { v: s, issues: out };
  }
  function titleCase(s) { return s.toLowerCase().replace(/\b([a-z])/g, function (x) { return x.toUpperCase(); }).replace(/\b(Llc|Inc|Mso|Ap)\b/g, function (x) { return x.toUpperCase(); }).replace(/ And /g, ' & '); }
  function normName(v) {
    var raw = str(v), s = trim(raw).replace(/[,.;]+$/, ''), out = [];
    if (s === '') return { v: '', display: '', issues: [iss('ERROR', 'NAME_BLANK', 'Customer name is blank')] };
    if (/^[\d\s.,-]+$/.test(s)) out.push(iss('ERROR', 'NAME_IS_NUMBER', 'Name "' + s + '" is only digits; probably a value from another column'));
    if (/@/.test(s)) out.push(iss('ERROR', 'VALUE_IN_WRONG_COLUMN', 'Name "' + s + '" looks like an email address'));
    if (s !== raw) out.push(iss('INFO', 'NAME_TRIMMED', 'Extra spaces or trailing punctuation removed'));
    var display = (s === s.toUpperCase() && /[A-Z]{3}/.test(s)) ? titleCase(s) : s;
    if (display !== s) out.push(iss('INFO', 'NAME_ALL_CAPS', 'Shown as "' + display + '"; original kept'));
    return { v: s, display: display, issues: out };
  }
  function normPhone(v) {
    var raw = trim(v), out = [], ext = '';
    if (raw === '') return { v: '', ext: '', issues: [iss('WARN', 'PHONE_BLANK', 'No phone number')] };
    var mx = raw.match(/\s*(?:x|ext\.?)\s*(\d+)\s*$/i); if (mx) { ext = mx[1]; raw = raw.slice(0, mx.index); out.push(iss('INFO', 'PHONE_EXTENSION', 'Extension ' + ext + ' moved to its own field')); }
    var d = raw.replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1);
    if (d.length !== 10 || /^[01]/.test(d) || /^(\d)\1{9}$/.test(d) || /^\d{3}55501\d{2}$/.test(d)) { out.push(iss('WARN', 'PHONE_INVALID', 'Phone "' + trim(v) + '" is not a valid 10-digit US number')); return { v: '', raw: trim(v), ext: ext, issues: out }; }
    var f = '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
    if (f !== raw.trim()) out.push(iss('INFO', 'PHONE_FORMATTED', 'Phone reformatted to ' + f));
    return { v: f, ext: ext, issues: out };
  }
  function normEmail(v, cfg, isBlank) {
    var raw = trim(v), out = [];
    if (isBlank(raw)) return { v: '', alt: '', issues: [iss('WARN', 'EMAIL_BLANK', 'No email address')] };
    var s = raw.toLowerCase().replace(/^mailto:/, ''), list = s.split(/[;,\s]+/).filter(Boolean), alt = '';
    s = list[0]; if (list.length > 1) { alt = list.slice(1).join('; '); out.push(iss('INFO', 'EMAIL_MULTIPLE', 'Extra addresses moved to email_alt')); }
    var dom = s.split('@')[1] || '';
    if (cfg.EMAIL_DOMAIN_FIXES[dom]) { out.push(iss('INFO', 'EMAIL_DOMAIN_FIXED', dom + ' corrected to ' + cfg.EMAIL_DOMAIN_FIXES[dom])); s = s.replace(dom, cfg.EMAIL_DOMAIN_FIXES[dom]); }
    else if (/\.con$/.test(dom)) { out.push(iss('INFO', 'EMAIL_DOMAIN_FIXED', '.con corrected to .com')); s = s.replace(/\.con$/, '.com'); }
    if (raw !== s && !out.length) out.push(iss('INFO', 'EMAIL_LOWERCASED', 'Email lowercased'));
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(s)) { out.push(iss('WARN', 'EMAIL_INVALID', 'Email "' + raw + '" is not valid')); return { v: '', alt: alt, issues: out }; }
    return { v: s, alt: alt, issues: out };
  }
  var STATES = { CA: 'CA', CALIF: 'CA', CAL: 'CA', CALIFORNIA: 'CA', NV: 'NV', NEVADA: 'NV', OR: 'OR', OREGON: 'OR', AZ: 'AZ', ARIZONA: 'AZ', WA: 'WA', TX: 'TX' };
  function normState(v) { var s = trim(v).toUpperCase().replace(/\./g, ''); if (s === '') return { v: '', issues: [iss('WARN', 'STATE_BLANK', 'State is blank')] }; var m = STATES[s]; if (!m) return { v: '', issues: [iss('WARN', 'STATE_UNKNOWN', 'State "' + trim(v) + '" not recognized')] }; return { v: m, issues: m !== trim(v) ? [iss('INFO', 'STATE_MAPPED', '"' + trim(v) + '" mapped to ' + m)] : [] }; }
  function normZip(v, state) {
    var s = trim(v), out = [], zip4 = '';
    if (s === '') return { v: '', zip4: '', issues: [iss('WARN', 'ZIP_BLANK', 'ZIP is blank')] };
    var m = s.match(/^(\d{5})-(\d{4})$/); if (m) { s = m[1]; zip4 = m[2]; out.push(iss('INFO', 'ZIP_PLUS4', 'ZIP+4 split; ZIP kept as ' + s)); }
    if (/^\d{4}$/.test(s)) { s = '0' + s; out.push(iss('WARN', 'ZIP_PADDED', 'Leading zero restored; check it')); }
    if (!/^\d{5}$/.test(s)) return { v: '', zip4: '', issues: out.concat([iss('WARN', 'ZIP_INVALID', 'ZIP "' + trim(v) + '" is not 5 digits')]) };
    if (state === 'CA' && s[0] !== '9') out.push(iss('WARN', 'ZIP_STATE_MISMATCH', 'ZIP ' + s + ' is not a California ZIP'));
    return { v: s, zip4: zip4, issues: out };
  }
  function normTerms(v, cfg) { var s = trim(v).toLowerCase().replace(/\s+/g, ''); var m = s.match(/^(?:net|n)?(\d{1,3})(?:days?)?$/); if (m) return { v: +m[1], issues: ('net' + m[1]) !== s ? [iss('INFO', 'TERMS_MAPPED', '"' + trim(v) + '" read as NET' + m[1])] : [] }; if (s === 'cod') return { v: 0, issues: [] }; return { v: cfg.DEFAULT_TERMS, issues: [iss('WARN', 'TERMS_UNKNOWN', 'Terms "' + trim(v) + '" unknown; NET' + cfg.DEFAULT_TERMS + ' used')] }; }
  function matchKeyName(s) { return str(s).toLowerCase().replace(/&/g, ' and ').replace(/#(\d+)/g, ' n$1 ').replace(/\b(inc|llc|corp|co|ltd|the|and)\b/g, ' ').replace(/[^a-z0-9]/g, ''); }

  // ---------------- Data contracts and header mapping ----------------
  var CONTRACTS = {
    customers: { required: ['account_id', 'customer_name'], fields: {
      account_id: ['cust #', 'cust no', 'account id', 'account', 'customer id', 'customer number', 'acct'], customer_name: ['customer name', 'name', 'business name', 'account name', 'company'],
      dba_name: ['dba', 'trade name'], account_open_date: ['acct opened', 'date of origin', 'open date', 'account open date', 'created', 'since'], account_type: ['type', 'customer type'],
      account_status: ['status'], terms: ['terms', 'payment terms'], credit_limit: ['cr limit', 'credit limit', 'limit'], address1: ['street', 'address', 'address1', 'addr'], city: ['city'],
      state: ['st', 'state'], zip: ['zip', 'zip code', 'postal'], phone: ['phone', 'tel', 'phone number'], phone_alt: ['alt phone', 'phone 2', 'mobile', 'cell'], email: ['e-mail', 'email', 'email address'],
      contact_name: ['contact', 'attn'], yard: ['yard', 'location', 'branch'], salesperson: ['sales rep', 'rep', 'salesperson'] } },
    invoices: { required: ['account_id', 'invoice_no', 'open_amount'], fields: {
      invoice_no: ['invoice', 'invoice no', 'inv #', 'document no'], account_id: ['account id', 'customer id', 'cust #'], invoice_date: ['invoice date', 'inv date'], original_amount: ['amount', 'original amount', 'invoice amount'],
      open_amount: ['open balance', 'open amount', 'amount due', 'balance'], due_date: ['due date', 'due'], yard: ['yard', 'location'], flag: ['flag', 'note'] } },
    activity: { required: ['logged_at', 'agent', 'account_id', 'disposition'], fields: {
      logged_at: ['timestamp', 'logged at', 'date'], agent: ['email address', 'specialist', 'agent', 'agent email'], account_id: ['account id', 'account'], disposition: ['outcome', 'disposition'],
      promise_amount: ['promise amount', 'amount'], promise_date: ['promise date'], next_followup_date: ['next follow-up date', 'next followup date', 'follow-up date'], notes: ['notes'] } },
    queries: { required: ['query_id', 'created_at', 'account_id', 'status'], fields: {
      query_id: ['request id', 'query id', 'id'], created_at: ['raised', 'created', 'created at'], raised_by: ['from team', 'raised by'], category: ['request type', 'category', 'type'], account_id: ['account id'],
      amount: ['amount'], assigned_to: ['owner', 'assigned to'], first_contact_at: ['first customer contact'], closed_at: ['resolved', 'closed'], status: ['status'], resolution: ['outcome', 'resolution'], due_date: ['due date', 'due'] } },
    escalations: { required: ['esc_id', 'account_id', 'status'], fields: {
      esc_id: ['esc #', 'escalation id', 'id'], opened_at: ['opened', 'opened at'], account_id: ['account', 'account id'], type: ['type'], severity: ['severity'], owner: ['owner'], status: ['status'],
      next_step: ['next step'], next_step_date: ['next step date'], closed_at: ['closed'], amount: ['amount'] } },
    chargebacks: { required: ['cb_id', 'received_date', 'amount', 'reason_code', 'status'], fields: {
      cb_id: ['case #', 'cb id', 'case id'], received_date: ['received', 'received date'], response_due_date: ['respond by', 'response due', 'due date'], account_id: ['account', 'account id'], customer_name: ['customer'],
      invoice_no: ['invoice'], txn_date: ['txn date', 'transaction date'], amount: ['amount'], card_brand: ['card', 'card brand'], card_last4: ['last 4', 'last4', 'card last 4'], reason_code: ['reason code', 'reason'],
      processor_case_id: ['processor case id'], yard: ['yard'], salesperson: ['sales rep'], root_cause: ['root cause'], status: ['status'], submitted_date: ['submitted'], outcome_date: ['outcome date'],
      recovered_amount: ['recovered'], notes: ['notes'] } },
    sales: { required: ['account_id'], fields: { account_id: ['customer', 'account id', 'cust #'], returns_12m: ['returns 12m'], gross_12m: ['gross sales 12m'], orders_12m: ['orders 12m'] } },
    payments: { required: ['account_id', 'amount_paid_12m'], fields: { account_id: ['customer', 'account id'], invoices_paid_12m: ['invoices paid 12m'], amount_paid_12m: ['amount paid 12m'],
      paid_within_terms: ['paid within terms+5'], avg_days_to_pay: ['avg days to pay'], max_days_late_6m: ['max days late 6m'], nsf_12m: ['nsf 12m'], last_payment: ['last payment'] } },
    alerts: { required: ['received', 'subject', 'body'], fields: { received: ['received'], from: ['from'], subject: ['subject'], body: ['body'], message_id: ['message id'] } }
  };
  function normHeader(h) { return trim(h).toLowerCase().replace(/[^a-z0-9#+]+/g, ' ').trim(); }
  function mapHeaders(dataset, header, extraAliases) {
    var c = CONTRACTS[dataset], H = header.map(normHeader), idx = {}, used = {};
    Object.keys(c.fields).forEach(function (f) {
      var aliases = c.fields[f].concat((extraAliases && extraAliases[dataset] && extraAliases[dataset][f]) || []);
      for (var i = 0; i < aliases.length; i++) { var j = H.indexOf(normHeader(aliases[i])); if (j >= 0 && !used[j]) { idx[f] = j; used[j] = 1; break; } }
    });
    var missing = c.required.filter(function (f) { return idx[f] === undefined; });
    var ignored = header.filter(function (h, j) { return !used[j] && trim(h) !== ''; });
    return { idx: idx, missing: missing, ignored: ignored };
  }
  function getter(map) { return function (row, f) { var j = map.idx[f]; return j === undefined ? '' : row[j]; }; }

  // ---------------- Cleaners ----------------
  function issueRec(list, dataset, acct, rowNo, field, i, original) { list.push({ dataset: dataset, account_id: acct, row: rowNo, field: field, sev: i.sev, code: i.code, msg: i.msg, original: str(original) }); }

  function cleanCustomers(rows, cfg, ctx) {
    var isBlank = ctx.isBlank, map = mapHeaders('customers', rows[0], ctx.aliases), g = getter(map);
    if (map.missing.length) throw new Error('Customer master: required column ' + map.missing.join(', ') + ' not found; add an alias in HeaderAliases');
    var out = [], issues = [], byId = {}, minDate = isoToDay(cfg.MIN_VALID_DATE);
    var ov = ctx.overrides || {};
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r]; if (row.every(function (x) { return trim(x) === ''; })) continue;
      var recIss = [], add = function (field, list, orig) { list.forEach(function (i) { recIss.push({ field: field, i: i, orig: orig }); }); };
      var id = normId(g(row, 'account_id'), cfg); add('account_id', id.issues, g(row, 'account_id'));
      var o = (ov[id.v] || {});
      var nm = normName(o.customer_name !== undefined ? o.customer_name : g(row, 'customer_name')); add('customer_name', nm.issues, g(row, 'customer_name'));
      var st = normState(g(row, 'state')); add('state', st.issues, g(row, 'state'));
      var zp = normZip(g(row, 'zip'), st.v); add('zip', zp.issues, g(row, 'zip'));
      var ph = normPhone(o.phone !== undefined ? o.phone : g(row, 'phone')); add('phone', ph.issues, g(row, 'phone'));
      var ph2 = trim(g(row, 'phone_alt')) ? normPhone(g(row, 'phone_alt')) : { v: '', issues: [] }; add('phone_alt', ph2.issues.filter(function (x) { return x.sev !== 'INFO'; }), g(row, 'phone_alt'));
      var em = normEmail(o.email !== undefined ? o.email : g(row, 'email'), cfg, isBlank); add('email', em.issues, g(row, 'email'));
      var tm = normTerms(g(row, 'terms'), cfg); add('terms', tm.issues, g(row, 'terms'));
      var od = parseDate(g(row, 'account_open_date')), odIss = [];
      if (od.issue) odIss.push(iss('WARN', od.issue, 'Open date "' + trim(g(row, 'account_open_date')) + '" could not be read'));
      else if (od.d === null) odIss.push(iss('WARN', 'OPEN_DATE_BLANK', 'Account open date is blank'));
      else if (od.d > ctx.asOf) { odIss.push(iss('WARN', 'DATE_IN_FUTURE', 'Open date is in the future')); od.d = null; }
      else if (od.d < minDate) { odIss.push(iss('WARN', 'DATE_TOO_OLD', 'Open date before ' + cfg.MIN_VALID_DATE)); od.d = null; }
      else if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trim(g(row, 'account_open_date')))) odIss.push(iss('INFO', 'DATE_FORMAT', 'Date "' + trim(g(row, 'account_open_date')) + '" read as ' + iso(od.d)));
      add('account_open_date', odIss, g(row, 'account_open_date'));
      var lim = parseMoney(o.credit_limit !== undefined ? o.credit_limit : g(row, 'credit_limit'), isBlank), limIss = [];
      if (lim.issue) limIss.push(iss('ERROR', lim.issue, 'Credit limit "' + trim(g(row, 'credit_limit')) + '" is not a number'));
      else if (lim.c !== null && lim.c < 0) { limIss.push(iss('ERROR', 'LIMIT_NEGATIVE', 'Credit limit is negative')); lim.c = null; }
      else if (lim.c === null) limIss.push(iss('WARN', 'LIMIT_BLANK', 'No credit limit on file'));
      add('credit_limit', limIss, g(row, 'credit_limit'));
      var rec = { account_id: id.v, customer_name: nm.v, name_display: nm.display || nm.v, dba_name: trim(g(row, 'dba_name')), open_date: od.d, account_type: trim(g(row, 'account_type')) || 'B2B', status: trim(g(row, 'account_status')) || 'Active',
        terms: tm.v, credit_limit: lim.c, address1: trim(g(row, 'address1')), city: trim(g(row, 'city')), state: st.v, zip: zp.v, zip4: zp.zip4, phone: ph.v, phone_ext: ph.ext, phone_alt: ph2.v, email: em.v, email_alt: em.alt,
        contact: trim(g(row, 'contact_name')), yard: trim(g(row, 'yard')).toUpperCase(), salesperson: trim(g(row, 'salesperson')), source_row: r + 1 };
      var nErr = 0, nWarn = 0; recIss.forEach(function (x) { if (x.i.sev === 'ERROR') nErr++; if (x.i.sev === 'WARN') nWarn++; issueRec(issues, 'customers', rec.account_id, r + 1, x.field, x.i, x.orig); });
      rec.quality = Math.max(0, 100 - 40 * nErr - 10 * nWarn); rec.errors = nErr; rec.warns = nWarn;
      rec.issue_codes = recIss.filter(function (x) { return x.i.sev !== 'INFO'; }).map(function (x) { return x.i.code; }).join(', ');
      if (!rec.account_id) continue; // blank ID never enters the clean table
      if (byId[rec.account_id]) { issueRec(issues, 'customers', rec.account_id, r + 1, 'account_id', iss('ERROR', 'ID_DUPLICATE', 'Account ID appears more than once; first row kept'), rec.account_id); continue; }
      if (nm.issues.some(function (x) { return x.sev === 'ERROR'; })) rec.name_display = rec.name_display + ' [check name]';
      byId[rec.account_id] = rec; out.push(rec);
    }
    // probable duplicates
    var keys = {}; function k(type, val, rec) { if (!val) return; var key = type + '|' + val; (keys[key] = keys[key] || []).push(rec); }
    out.forEach(function (c) { var nk = matchKeyName(c.customer_name); var pd = c.phone.replace(/\D/g, ''); if (nk && pd) k('K1', nk + pd, c); if (c.email && !/^ap@|^office@|^info@/.test(c.email)) k('K2', c.email, c); else if (c.email) k('K2', c.email, c); if (nk && c.zip) k('K3', nk + c.zip, c); if (pd) k('K4', pd, c); });
    var groups = {}, conf = { K1: 'HIGH', K2: 'HIGH', K3: 'MEDIUM', K4: 'LOW' }, rank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    Object.keys(keys).forEach(function (key) { var g2 = keys[key]; if (g2.length < 2) return; var ids = g2.map(function (x) { return x.account_id; }).sort(); var gk = ids.join('+'); var t = key.split('|')[0], cf = conf[t];
      if (t === 'K2') { var names = {}; g2.forEach(function (x) { names[matchKeyName(x.customer_name)] = 1; }); if (Object.keys(names).length > 1) { cf = 'LOW'; t = 'K2S'; } } // different shops sharing one AP inbox
      if (!groups[gk] || rank[cf] > rank[groups[gk].confidence]) groups[gk] = { ids: ids, confidence: cf, key: t, recs: g2 }; });
    var dups = Object.keys(groups).map(function (k2) { return groups[k2]; }).filter(function (g) { return !(g.key === 'K2S' && g.ids.length > 4); }).sort(function (a, b) { return rank[b.confidence] - rank[a.confidence] || a.ids.length - b.ids.length || (a.ids[0] < b.ids[0] ? -1 : 1); });
    return { rows: out, byId: byId, issues: issues, dups: dups, ignored: map.ignored, read: rows.length - 1 };
  }

  function cleanInvoices(rows, cfg, ctx) {
    var map = mapHeaders('invoices', rows[0], ctx.aliases), g = getter(map), out = [], issues = [], rejected = 0, rawTotal = 0;
    if (map.missing.length) throw new Error('AR export: required column ' + map.missing.join(', ') + ' not found');
    var seen = {};
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r]; if (row.every(function (x) { return trim(x) === ''; })) continue;
      var id = normId(g(row, 'account_id'), cfg), amt = parseMoney(g(row, 'open_amount'), ctx.isBlank);
      if (amt.c !== null) rawTotal += amt.c;
      if (!id.v || amt.c === null) { rejected++; issueRec(issues, 'ar', id.v, r + 1, !id.v ? 'account_id' : 'open_amount', iss('ERROR', 'AR_ROW_UNREADABLE', 'Invoice row could not be read'), g(row, 'open_amount')); continue; }
      var inv = trim(g(row, 'invoice_no')), key = id.v + '|' + inv;
      if (seen[key]) { rejected++; rawTotal -= amt.c; issueRec(issues, 'ar', id.v, r + 1, 'invoice_no', iss('ERROR', 'AR_DUPLICATE_INVOICE', 'Invoice ' + inv + ' listed twice; second copy ignored'), inv); continue; }
      seen[key] = 1;
      var invd = parseDate(g(row, 'invoice_date'), ctx.asOf).d, due = parseDate(g(row, 'due_date'), ctx.asOf).d;
      if (due === null && invd !== null) { var c = ctx.customers.byId[id.v]; due = invd + (c ? c.terms : cfg.DEFAULT_TERMS); issueRec(issues, 'ar', id.v, r + 1, 'due_date', iss('INFO', 'DUE_FROM_TERMS', 'Due date computed from invoice date + terms'), ''); }
      var orig = parseMoney(g(row, 'original_amount'), ctx.isBlank).c;
      if (orig !== null && amt.c > orig) issueRec(issues, 'ar', id.v, r + 1, 'open_amount', iss('WARN', 'OPEN_GT_ORIGINAL', 'Open amount is larger than the invoice amount'), g(row, 'open_amount'));
      if (!ctx.customers.byId[id.v]) issueRec(issues, 'ar', id.v, r + 1, 'account_id', iss('WARN', 'ORPHAN_INVOICE', 'Invoice account is not in the customer master'), id.v);
      out.push({ account_id: id.v, invoice_no: inv, invoice_date: invd, due_date: due, original: orig, open: amt.c, yard: trim(g(row, 'yard')).toUpperCase(), flag: trim(g(row, 'flag')), dpd: due === null ? 0 : ctx.asOf - due });
    }
    return { rows: out, issues: issues, rejected: rejected, read: rows.length - 1, rawTotal: rawTotal };
  }

  var DISPO = [[/promise to pay/i, 'RPC_PROMISE'], [/paid on call/i, 'RPC_PAID'], [/already paid/i, 'RPC_PAID'], [/callback/i, 'RPC_CALLBACK'], [/dispute/i, 'RPC_DISPUTE'], [/refused|hardship/i, 'RPC_REFUSED'],
    [/refund|credit request/i, 'RPC_OTHER'], [/no answer/i, 'NO_ANSWER'], [/voicemail/i, 'VOICEMAIL'], [/ap contact unavailable|reached shop/i, 'THIRD_PARTY'], [/wrong number/i, 'WRONG_NUMBER'], [/disconnected/i, 'DISCONNECTED'], [/email/i, 'EMAIL_SENT']];
  function stdOutcome(s) { for (var i = 0; i < DISPO.length; i++) if (DISPO[i][0].test(s)) return DISPO[i][1]; return null; }

  function cleanActivity(sources, cfg, ctx) {
    var out = [], issues = [], read = 0, rejected = 0, newTags = {};
    sources.forEach(function (src) {
      var rows = src.rows; if (!rows || rows.length < 2) return;
      var map = mapHeaders('activity', rows[0], ctx.aliases), g = getter(map);
      if (map.missing.length) throw new Error(src.name + ': required column ' + map.missing.join(', ') + ' not found');
      for (var r = 1; r < rows.length; r++) {
        var row = rows[r]; if (row.every(function (x) { return trim(x) === ''; })) continue; read++;
        var ts = dateTime(g(row, 'logged_at'), ctx.asOf), ag = ctx.agentOf(g(row, 'agent')), id = normId(g(row, 'account_id'), cfg), oc = stdOutcome(g(row, 'disposition'));
        if (ts.d === null || !ag || !oc || !id.v) {
          rejected++; var why = ts.d === null ? 'timestamp unreadable' : !ag ? 'agent "' + trim(g(row, 'agent')) + '" not in Agents tab' : !oc ? 'outcome "' + trim(g(row, 'disposition')) + '" not mapped' : 'account ID blank';
          if (!oc) newTags[trim(g(row, 'disposition'))] = 1;
          issueRec(issues, 'activity', id.v, r + 1, 'row', iss('ERROR', 'ACTIVITY_REJECTED', src.name + ' row: ' + why), ''); continue;
        }
        id.issues.forEach(function (i) { if (i.sev !== 'INFO' || i.code === 'ID_NORMALIZED') issueRec(issues, 'activity', id.v, r + 1, 'account_id', i, g(row, 'account_id')); });
        if (!ctx.known[id.v]) issueRec(issues, 'activity', id.v, r + 1, 'account_id', iss('WARN', 'ACTIVITY_UNKNOWN_ACCOUNT', 'Call logged on an account not in the customer master or AR'), id.v);
        var pd = parseDate(g(row, 'promise_date'), ctx.asOf).d, fu = parseDate(g(row, 'next_followup_date'), ctx.asOf).d;
        out.push({ day: ts.d, min: ts.min === null ? 0 : ts.min, agent: ag, account_id: id.v, outcome: oc, raw_outcome: trim(g(row, 'disposition')), amount: parseMoney(g(row, 'promise_amount'), ctx.isBlank).c, promise_date: pd, followup: fu, source: src.name, row: r + 1, has_fu_field: map.idx.next_followup_date !== undefined });
      }
    });
    out.sort(function (a, b) { return a.day - b.day || a.min - b.min || (a.account_id < b.account_id ? -1 : a.account_id > b.account_id ? 1 : 0); });
    return { rows: out, issues: issues, read: read, rejected: rejected, newTags: Object.keys(newTags) };
  }

  function statusGroup(s) { s = trim(s).toLowerCase(); if (/resolved|closed|cancel|done/.test(s)) return 'DONE'; if (/waiting/.test(s)) return 'WAITING'; return 'OPEN'; }
  function slaFor(cat, cfg) { var c = trim(cat).toLowerCase(), t = cfg.QUERY_SLA_BDAYS; for (var k in t) if (k !== 'other' && c.indexOf(k) >= 0) return t[k]; return t.other; }

  function cleanQueries(rows, cfg, ctx) {
    var map = mapHeaders('queries', rows[0], ctx.aliases), g = getter(map), out = [], issues = [];
    if (map.missing.length) throw new Error('Query sheet: required column ' + map.missing.join(', ') + ' not found');
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r]; if (row.every(function (x) { return trim(x) === ''; })) continue;
      var c = dateTime(g(row, 'created_at'), ctx.asOf), id = normId(g(row, 'account_id'), cfg), grp = statusGroup(g(row, 'status'));
      var due = parseDate(g(row, 'due_date'), ctx.asOf).d, dueSrc = 'sheet';
      if (due === null && c.d !== null) { due = ctx.cal.addBiz(c.d, slaFor(g(row, 'category'), cfg)); dueSrc = 'SLA'; }
      out.push({ query_id: trim(g(row, 'query_id')), created: c.d, created_min: c.min, raised_by: trim(g(row, 'raised_by')), category: trim(g(row, 'category')), account_id: id.v, amount: parseMoney(g(row, 'amount'), ctx.isBlank).c,
        assigned: trim(g(row, 'assigned_to')), assigned_key: ctx.agentOf(g(row, 'assigned_to')), status: trim(g(row, 'status')), group: grp, resolution: trim(g(row, 'resolution')), closed: parseDate(g(row, 'closed_at'), ctx.asOf).d,
        first_contact: trim(g(row, 'first_contact_at')), due: due, due_src: dueSrc, overdue_bdays: grp === 'DONE' || due === null ? 0 : Math.max(0, ctx.cal.bizBetween(due, ctx.asOf)), row: r + 1 });
    }
    return { rows: out, issues: issues, read: rows.length - 1 };
  }

  function cleanEscalations(rows, cfg, ctx) {
    var map = mapHeaders('escalations', rows[0], ctx.aliases), g = getter(map), out = [];
    if (map.missing.length) throw new Error('Escalation sheet: required column ' + map.missing.join(', ') + ' not found');
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r]; if (row.every(function (x) { return trim(x) === ''; })) continue;
      var grp = statusGroup(g(row, 'status')), sev = trim(g(row, 'severity')) || 'Medium', opened = parseDate(g(row, 'opened_at'), ctx.asOf).d;
      var nsd = parseDate(g(row, 'next_step_date'), ctx.asOf).d; if (nsd === null && opened !== null) nsd = ctx.cal.addBiz(opened, cfg.ESC_SLA_BDAYS[sev] || 2);
      out.push({ esc_id: trim(g(row, 'esc_id')), opened: opened, account_id: normId(g(row, 'account_id'), cfg).v, type: trim(g(row, 'type')), severity: sev, owner: trim(g(row, 'owner')), owner_key: ctx.agentOf(g(row, 'owner')),
        status: trim(g(row, 'status')), group: grp, next_step: trim(g(row, 'next_step')), next_step_date: nsd, closed: parseDate(g(row, 'closed_at'), ctx.asOf).d, amount: parseMoney(g(row, 'amount'), ctx.isBlank).c,
        overdue_bdays: grp === 'DONE' || nsd === null ? 0 : Math.max(0, ctx.cal.bizBetween(nsd, ctx.asOf)), dispute: /dispute|pricing|damage|wrong part|duplicate|core/i.test(g(row, 'type')), row: r + 1 });
    }
    return { rows: out, read: rows.length - 1 };
  }

  // Reason-code map: network code -> internal category (owner confirms against the processor portal)
  var REASON_MAP = { 'Visa|10.4': 'FRAUD', 'Visa|13.1': 'NOT_RECEIVED', 'Visa|13.3': 'NOT_AS_DESCRIBED', 'Visa|13.6': 'CREDIT_NOT_PROCESSED', 'Visa|13.7': 'CANCELLED', 'Visa|12.6.1': 'DUPLICATE', 'Visa|12.6.2': 'DUPLICATE',
    'Mastercard|4837': 'FRAUD', 'Mastercard|4863': 'FRAUD', 'Mastercard|4853': 'CARDHOLDER_DISPUTE', 'Mastercard|4834': 'DUPLICATE', 'Mastercard|4855': 'NOT_RECEIVED', 'Mastercard|4808': 'AUTHORIZATION',
    'American Express|C02': 'CREDIT_NOT_PROCESSED', 'American Express|C08': 'NOT_RECEIVED', 'American Express|C31': 'NOT_AS_DESCRIBED', 'American Express|F29': 'FRAUD',
    'Discover|RN2': 'CREDIT_NOT_PROCESSED', 'Discover|RG': 'NOT_RECEIVED', 'Discover|UA02': 'FRAUD' };
  var CB_EVIDENCE = {
    FRAUD: ['Signed order or PO from the buyer', 'History of undisputed orders on the same card', 'Delivery to the customer\'s business address (signed)', 'Emails or calls with the buyer about this order'],
    NOT_RECEIVED: ['Signed delivery receipt or driver pickup log', 'Will-call signature or photo at drop-off', 'Tracking or route sheet for the delivery date'],
    NOT_AS_DESCRIBED: ['Part number and interchange match to the order', 'Photos and inspection notes', 'Return / warranty policy the buyer accepted', 'Record of the return or exchange offered'],
    CREDIT_NOT_PROCESSED: ['Credit memo number, date and amount (if issued)', 'Return receiving scan, or proof the part never came back', 'Core return record or restocking-fee terms accepted'],
    CANCELLED: ['Proof the order shipped before any cancellation', 'Cancellation policy accepted at order', 'Proof the goods were taken'],
    DUPLICATE: ['Two separate invoices and two separate deliveries', 'Or proof the other payment applied to a different invoice'],
    CARDHOLDER_DISPUTE: ['Signed delivery receipt', 'Credit memo or proof no credit was due', 'Return policy accepted', 'Customer communications'],
    AUTHORIZATION: ['Authorization approval record for the transaction'], UNMAPPED: ['Confirm the reason code in the processor portal'] };
  var PREVENTABLE = { LATE_RETURN_PICKUP: 1, LATE_SCAN: 1, LATE_CREDIT: 1, SALES_DID_NOT_INFORM: 1, WRONG_PART: 1 };

  function cleanChargebacks(rows, cfg, ctx) {
    var map = mapHeaders('chargebacks', rows[0], ctx.aliases), g = getter(map), out = [], issues = [];
    if (map.missing.length) throw new Error('Chargeback tracker: required column ' + map.missing.join(', ') + ' not found');
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r]; if (row.every(function (x) { return trim(x) === ''; })) continue;
      var notes = trim(g(row, 'notes')), last4 = trim(g(row, 'card_last4'));
      if (/\d{13,19}/.test(notes)) { notes = notes.replace(/\d{13,19}/g, '[REMOVED]'); issueRec(issues, 'chargebacks', trim(g(row, 'account_id')), r + 1, 'notes', iss('CRITICAL', 'PCI_CARD_NUMBER', 'A full card number was found in Notes and removed from the clean copy; delete it from the tracker row ' + (r + 1)), ''); }
      if (last4.replace(/\D/g, '').length > 4) { last4 = ''; issueRec(issues, 'chargebacks', trim(g(row, 'account_id')), r + 1, 'card_last4', iss('CRITICAL', 'PCI_LAST4_TOO_LONG', 'Last 4 held more than 4 digits; blanked'), ''); }
      var brand = trim(g(row, 'card_brand')), code = trim(g(row, 'reason_code')), cat = REASON_MAP[brand + '|' + code] || 'UNMAPPED';
      var recv = parseDate(g(row, 'received_date'), ctx.asOf).d, due = parseDate(g(row, 'response_due_date'), ctx.asOf).d, est = false;
      if (due === null && recv !== null) { due = recv + cfg.CB_DEFAULT_RESPONSE_DAYS; est = true; issueRec(issues, 'chargebacks', trim(g(row, 'account_id')), r + 1, 'response_due_date', iss('WARN', 'DUE_DATE_ESTIMATED', 'No respond-by date; ' + cfg.CB_DEFAULT_RESPONSE_DAYS + ' days after receipt used'), ''); }
      var status = trim(g(row, 'status')).toUpperCase(), root = trim(g(row, 'root_cause')).toUpperCase();
      out.push({ cb_id: trim(g(row, 'cb_id')), received: recv, due: due, due_estimated: est, account_id: normId(g(row, 'account_id'), cfg).v, customer: trim(g(row, 'customer_name')), invoice_no: trim(g(row, 'invoice_no')), txn_date: parseDate(g(row, 'txn_date'), ctx.asOf).d,
        amount: parseMoney(g(row, 'amount'), ctx.isBlank).c || 0, brand: brand, last4: last4, code: code, category: cat, case_id: trim(g(row, 'processor_case_id')), yard: trim(g(row, 'yard')), salesperson: trim(g(row, 'salesperson')),
        root: root, preventable: !!PREVENTABLE[root], status: status, open: /^(NEW|GATHERING|SUBMITTED)$/.test(status), submitted: parseDate(g(row, 'submitted_date'), ctx.asOf).d, outcome_date: parseDate(g(row, 'outcome_date'), ctx.asOf).d,
        recovered: parseMoney(g(row, 'recovered_amount'), ctx.isBlank).c || 0, notes: notes, row: r + 1 });
    }
    return { rows: out, issues: issues, read: rows.length - 1 };
  }

  function cleanSales(rows, cfg, ctx) {
    var map = mapHeaders('sales', rows[0], ctx.aliases), g = getter(map), monthCols = [];
    rows[0].forEach(function (h, j) { if (/^net sales/i.test(trim(h))) monthCols.push(j); });
    var by = {};
    for (var r = 1; r < rows.length; r++) { var row = rows[r]; var id = normId(g(row, 'account_id'), cfg).v; if (!id) continue;
      var m = monthCols.map(function (j) { var c = parseMoney(row[j], ctx.isBlank).c; return c || 0; });
      by[id] = { months: m, returns: parseMoney(g(row, 'returns_12m'), ctx.isBlank).c || 0, gross: parseMoney(g(row, 'gross_12m'), ctx.isBlank).c || 0, orders: +trim(g(row, 'orders_12m')) || 0 }; }
    return { byId: by, months: monthCols.map(function (j) { return trim(rows[0][j]).replace(/^net sales\s*/i, ''); }), read: rows.length - 1 };
  }
  function cleanPayments(rows, cfg, ctx) {
    var map = mapHeaders('payments', rows[0], ctx.aliases), g = getter(map), by = {};
    for (var r = 1; r < rows.length; r++) { var row = rows[r]; var id = normId(g(row, 'account_id'), cfg).v; if (!id) continue;
      by[id] = { paid: parseMoney(g(row, 'amount_paid_12m'), ctx.isBlank).c || 0, within: parseMoney(g(row, 'paid_within_terms'), ctx.isBlank).c || 0, avgDays: +trim(g(row, 'avg_days_to_pay')) || null,
        maxLate: +trim(g(row, 'max_days_late_6m')) || 0, nsf: +trim(g(row, 'nsf_12m')) || 0, last: parseDate(g(row, 'last_payment'), ctx.asOf).d }; }
    return { byId: by, read: rows.length - 1 };
  }

  // Alerts: patterns are data (AlertPatterns tab), not code
  var ALERT_PATTERNS = [
    { type: 'NEW_ORDER_OVER60', match: '60\\+ day balance' }, { type: 'ORDER_OVER_LIMIT', match: 'exceeds credit limit' }, { type: 'ORDER_ON_FLAGGED', match: 'flagged account' }, { type: 'IGNORE', match: 'daily job summary' } ];
  var ALERT_FIELDS = { account_id: 'Account:\\s*(C-\\d{5})', order_no: 'Order:\\s*(SO-\\d+)', amount: 'Amount:\\s*\\$([\\d,]+\\.\\d{2})', yard: 'Yard:\\s*([A-Z]{3})', created: 'Created:\\s*(\\d{1,2}/\\d{1,2}/\\d{4}\\s+\\d{1,2}:\\d{2})' };
  function parseAlerts(rows, cfg, ctx, patterns) {
    var map = mapHeaders('alerts', rows[0], ctx.aliases), g = getter(map), out = [], seen = {}, dupes = 0, unparsed = [], ignored = 0;
    patterns = patterns || ALERT_PATTERNS;
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r]; if (row.every(function (x) { return trim(x) === ''; })) continue;
      var subj = trim(g(row, 'subject')), body = trim(g(row, 'body')), mid = trim(g(row, 'message_id')) || (subj + body), type = null;
      for (var i = 0; i < patterns.length; i++) if (new RegExp(patterns[i].match, 'i').test(subj + ' ' + body)) { type = patterns[i].type; break; }
      if (type === 'IGNORE') { ignored++; continue; }
      var f = {}; Object.keys(ALERT_FIELDS).forEach(function (k) { var m = body.match(new RegExp(ALERT_FIELDS[k])); f[k] = m ? m[1] : ''; });
      if (!type || !f.account_id) { unparsed.push({ received: trim(g(row, 'received')), subject: subj, body: body, row: r + 1 }); continue; }
      var key = mid + '|' + f.account_id + '|' + f.order_no; if (seen[key]) { dupes++; continue; } seen[key] = 1;
      var cr = dateTime(f.created || g(row, 'received'), ctx.asOf);
      out.push({ type: type, account_id: f.account_id, order_no: f.order_no, amount: parseMoney(f.amount, ctx.isBlank).c, yard: f.yard, day: cr.d, min: cr.min, source: 'email', message_id: mid });
    }
    return { rows: out, unparsed: unparsed, dupes: dupes, ignored: ignored, read: rows.length - 1 };
  }

  return { DEFAULTS: DEFAULTS, config: config, makeBlank: makeBlank, makeCal: makeCal, parseDate: parseDate, dateTime: dateTime, parseMoney: parseMoney, dollars: dollars, fmtUSD: fmtUSD, fmtUSD0: fmtUSD0, pct: pct,
    iso: iso, nice: nice, short: short, isoToDay: isoToDay, ymd: ymd, parts: parts, trim: trim, str: str, normId: normId, normPhone: normPhone, normEmail: normEmail, normState: normState, normZip: normZip, normName: normName,
    mapHeaders: mapHeaders, CONTRACTS: CONTRACTS, REASON_MAP: REASON_MAP, CB_EVIDENCE: CB_EVIDENCE, ALERT_PATTERNS: ALERT_PATTERNS, stdOutcome: stdOutcome,
    cleanCustomers: cleanCustomers, cleanInvoices: cleanInvoices, cleanActivity: cleanActivity, cleanQueries: cleanQueries, cleanEscalations: cleanEscalations, cleanChargebacks: cleanChargebacks, cleanSales: cleanSales, cleanPayments: cleanPayments, parseAlerts: parseAlerts };
})();
if (typeof module !== 'undefined') module.exports = WL_CORE;

// ===================== engine.js =====================
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

// ===================== demo.js =====================
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

// ===================== tests.js =====================
// tests.js — Westline AR Command Center: hand-built fixtures with hand-computed answers.
// Runs in Node (node tests.js) and in Apps Script (AR Center → Run all tests).
var WL_TESTS = (function (C, E) {
  'use strict';
  function fixture() {
    var cust = [['Cust #', 'Customer Name', 'Acct Opened', 'Status', 'Terms', 'Cr Limit', 'Street', 'City', 'St', 'Zip', 'Phone', 'E-mail', 'Yard', 'Sales Rep'],
      ['C-20001', 'Alpha Body Shop', '1/15/2024', 'Active', 'NET30', '1000', '1 Main St', 'Fresno', 'CA', '93701', '(559) 555-2101', 'ap@alpha.com', 'FRS', 'Dana Kim'],
      ['C-20002', 'Bravo Collision', '3/1/2020', 'Active', 'NET30', '5000', '2 Main St', 'Fresno', 'CA', '93701', '(559) 555-2102', 'ap@bravo.com', 'FRS', 'Dana Kim'],
      ['C-20003', 'Charlie Garage', '3/1/2020', 'Active', 'NET30', '2000', '3 Main St', 'Fresno', 'CA', '93701', '(559) 555-2103', 'ap@charlie.com', 'FRS', 'Dana Kim'],
      ['C-20004', 'Delta Motors', '3/1/2020', 'Active', 'NET30', '8000', '4 Main St', 'Fresno', 'CA', '93701', '(559) 555-2104', 'ap@delta.com', 'FRS', 'Dana Kim'],
      ['C-20005', 'Echo Fleet', '3/1/2020', 'Active', 'NET30', '3000', '5 Main St', 'Fresno', 'CA', '93701', '(559) 555-2105', 'ap@echo.com', 'FRS', 'Dana Kim'],
      ['c20004', 'Delta Motors', '3/1/2020', 'Active', 'NET30', '8000', '4 Main St', 'Fresno', 'CA', '93701', '', '', 'FRS', 'Dana Kim'],
      ['C-20006', '41522', '3/1/2020', 'Active', 'NET30', '1000', '6 Main St', 'Fresno', 'CA', '93701', '(559) 555-2106', '', 'FRS', 'Dana Kim'],
      ['C-20007', 'BRAVO COLLISION', '3/1/2025', 'Active', 'NET30', '', '2 Main Street', 'Fresno', 'Calif', '93701', '559.555.2102', 'ap@bravo.com', 'FRS', 'Dana Kim']];
    // as of Mon 2026-10-26. Due dates set so DPD is exact.
    var inv = [['Invoice', 'Account ID', 'Invoice date', 'Amount', 'Open balance', 'Due date', 'Yard'],
      ['I-1', 'C-20001', '9/11/2026', '1200.00', '1200.00', '9/11/2026', 'FRS'],     // 45 DPD, 31-60
      ['I-2', 'C-20002', '6/27/2026', '500.00', '500.00', '6/27/2026', 'FRS'],       // 121 DPD
      ['I-3', 'C-20003', '6/29/2026', '500.00', '500.00', '6/29/2026', 'FRS'],       // 119 DPD
      ['I-4', 'C-20004', '7/1/2026', '1000.00', '1000.00', '7/28/2026', 'FRS'],      // 90 DPD, $1,000 past due
      ['I-5', 'C-20005', '10/20/2026', '400.00', '400.00', '11/19/2026', 'FRS'],     // current
      ['I-6', 'C-20005', '10/1/2026', '-50.00', '-50.00', '10/31/2026', 'FRS']];     // credit memo
    var calls = [['Timestamp', 'Specialist', 'Account ID', 'Outcome', 'Amount', 'Promise date'],
      ['20 Oct 2026 9:00', 'Agent One', 'C-20001', 'Promise to pay', '$300.00', '26 Oct 2026'],  // due today
      ['15 Oct 2026 9:00', 'Agent One', 'C-20003', 'Promise to pay', '$200.00', '19 Oct 2026'],  // kept below
      ['20 Oct 2026 9:00', 'Agent One', 'C-20003', 'Already paid – remittance sent', '', ''],
      ['13 Oct 2026 9:00', 'Agent Two', 'C-20004', 'Promise to pay', '$400.00', '16 Oct 2026'],  // broken
      ['22 Oct 2026 9:00', 'Agent Two', 'C-20005', 'Promise to pay', '$100.00', '30 Oct 2026']]; // upcoming
    var hist = [['Timestamp', 'Email Address', 'Account ID', 'Outcome', 'Promise Amount', 'Promise Date', 'Next Follow-up Date']];
    var req = [['Request ID', 'Raised', 'From team', 'Request type', 'Account ID', 'Amount', 'Owner', 'Status', 'Outcome']];
    var esc = [['Esc #', 'Opened', 'Account', 'Type', 'Severity', 'Owner', 'Status', 'Next Step', 'Next Step Date']];
    var cb = [['Case #', 'Received', 'Respond By', 'Account', 'Customer', 'Invoice', 'Amount', 'Card', 'Last 4', 'Reason Code', 'Status', 'Notes'],
      ['CB-1', '10/20/2026', '', 'C-20002', 'Bravo', 'I-2', '100.00', 'Visa', '1234', '13.6', 'NEW', 'card 4111111111111111 read out']];
    var m = [0, 0, 0, 7000, 7000, 7000, 7000, 7000, 7000, 9200, 9200, 9200]; // last 3 avg 9,200; last 6 avg 8,100; 9 months with purchases
    var sh = ['Customer'].concat(m.map(function (x, i) { return 'Net Sales M' + (i + 1); }), ['Returns 12M', 'Gross Sales 12M', 'Orders 12M']);
    var sales = [sh, ['C-20001'].concat(m.map(String), ['3500', '50000', '40'])];
    var pay = [['Customer', 'Amount Paid 12M', 'Paid Within Terms+5', 'Max Days Late 6M', 'NSF 12M'], ['C-20001', '50000', '40000', '20', '0']];
    var alerts = [['Received', 'From', 'Subject', 'Body', 'Message ID'],
      ['2026-10-26 08:00', 'x', 'New order on account with 60+ day balance', 'Account: C-20004 Delta | Order: SO-1 | Amount: $10.00 | Yard: FRS | Created: 10/26/2026 08:00', 'm1'],
      ['2026-10-26 08:00', 'x', 'New order on account with 60+ day balance', 'Account: C-20004 Delta | Order: SO-1 | Amount: $10.00 | Yard: FRS | Created: 10/26/2026 08:00', 'm1'],
      ['2026-10-26 08:05', 'x', 'New order on account with 60+ day balance', 'Acct C-2OOO4 typed by hand', 'm2']];
    var agents = [['agent_key', 'name', 'email', 'role', 'active', 'daily_capacity', 'max_bucket'], ['ONE', 'Agent One', 'one@x.com', 'agent', 'TRUE', '2', '120+'], ['TWO', 'Agent Two', 'two@x.com', 'agent', 'TRUE', '5', '120+'], ['LEAD', 'Lead', 'lead@x.com', 'owner', 'TRUE', '5', '120+']];
    var asg = [['account_id', 'agent_key'], ['C-20001', 'ONE'], ['C-20002', 'TWO'], ['C-20003', 'ONE'], ['C-20004', 'TWO'], ['C-20005', 'TWO']];
    return { customers: cust, invoices: inv, calls: calls, callHistory: hist, requests: req, escalations: esc, chargebacks: cb, sales: sales, payments: pay, alerts: alerts, agents: agents, assignments: asg, overrides: [['account_id', 'field', 'corrected_value', 'reason', 'by', 'active']] };
  }

  function run() {
    var res = { pass: 0, fail: 0, failures: [] };
    function eq(name, got, want) { var ok = JSON.stringify(got) === JSON.stringify(want); if (ok) res.pass++; else { res.fail++; res.failures.push(name + ': expected ' + JSON.stringify(want) + ', got ' + JSON.stringify(got)); } }
    var cfg = C.config(), blank = C.makeBlank(cfg), asOf = C.isoToDay('2026-10-26');
    // --- parsers
    eq('date US', C.iso(C.parseDate('3/4/24').d), '2024-03-04');
    eq('date D Mon YYYY', C.iso(C.parseDate('26 Oct 2026').d), '2026-10-26');
    eq('date serial', C.iso(C.parseDate('46321').d), '2026-10-26');
    eq('date no year', C.iso(C.parseDate('12 Oct 8:05', asOf).d), '2026-10-12');
    eq('date invalid', C.parseDate('2024-13-01').issue, 'DATE_UNREADABLE');
    eq('money', C.parseMoney('$1,234.50', blank).c, 123450);
    eq('money parens', C.parseMoney('(50.00)', blank).c, -5000);
    eq('money trailing minus', C.parseMoney('1234.50-', blank).c, -123450);
    eq('money letter O', C.parseMoney('12O.00', blank).issue, 'MONEY_NOT_A_NUMBER');
    eq('money blank token', C.parseMoney('N/A', blank).c, null);
    eq('phone dots', C.normPhone('916.432.1188').v, '(916) 432-1188');
    eq('phone ext', C.normPhone('(916) 432-1188 x22').ext, '22');
    eq('phone short', C.normPhone('9165551').v, '');
    eq('email typo', C.normEmail('MIKE@GMIAL.COM', cfg, blank).v, 'mike@gmail.com');
    eq('email multiple', C.normEmail('a@b.com; c@d.com', cfg, blank).alt, 'c@d.com');
    eq('zip pad', C.normZip('5820', 'CA').v, '05820');
    eq('zip+4', C.normZip('95670-1234', 'CA').v, '95670');
    eq('state', C.normState('Calif').v, 'CA');
    eq('id normalize', C.normId(' c- 10452', cfg).v, 'C-10452');
    // --- full run on the fixture
    var R = E.run(fixture(), { AS_OF: '2026-10-26' });
    var A = {}; R.tabs.Account_360.rows.forEach(function (r) { A[r[0]] = r; });
    var col = function (name) { return R.tabs.Account_360.cols.map(function (c) { return c[0]; }).indexOf(name); };
    eq('customers: duplicate ID dropped', R.tabs.Clean_Customers.rows.length, 7);
    eq('customers: numeric name flagged', R.tabs.Customer_Issues.rows.some(function (r) { return r[0] === 'C-20006' && r[4] === 'NAME_IS_NUMBER'; }), true);
    eq('customers: duplicate group found', R.tabs.Duplicate_Candidates.rows.some(function (r) { return r[3] === 'C-20002 + C-20007'; }), true);
    eq('AR ties', R.recon.filter(function (r) { return r.code === 'R2'; })[0].result, 'PASS');
    eq('all recon pass', R.published, true);
    eq('credit memo nets against balance', A['C-20005'][col('open_balance')], 350);
    eq('promise due today', A['C-20001'][col('promise_status')], 'DUE_TODAY');
    eq('promise kept', A['C-20003'][col('promise_status')], 'KEPT');
    eq('promise broken', A['C-20004'][col('promise_status')], 'BROKEN');
    eq('promise upcoming -> promise watch', A['C-20005'][col('lane')], 'PROMISE_WATCH');
    // priority for C-20001: 31-60 bucket 30 + size $1,200 -> 10 + promise due today 25 + over limit $200 -> 5 = 70
    eq('priority C-20001', A['C-20001'][col('priority')], 70);
    eq('mgmt M1 at 121 days', A['C-20002'][col('lane')], 'MGMT_REVIEW');
    eq('open chargeback routes to resolve dispute', R.tabs.Mgmt_Review.rows.filter(function (r) { return r[0] === 'C-20002'; })[0][8], 'RESOLVE DISPUTE');
    eq('near miss 119 days not in mgmt', A['C-20003'][col('lane')] !== 'MGMT_REVIEW', true);
    eq('alerts dedupe', R.kpi.alerts.dupes, 1);
    eq('alerts unparsed kept', R.kpi.alerts.unparsed, 1);
    eq('PCI number removed', R.tabs.CB_Work.rows[0][13].indexOf('4111') < 0, true);
    eq('chargeback due estimated', R.tabs.CB_Work.rows[0][13], 'Respond-by date estimated (missing on tracker)');
    // credit worked example (blueprint B13): avg3 9,200, avg6 8,100, NET30, tier B -> need 17,250 -> 17,500; current 1,000 -> step cap 6,000
    var cr = {}; R.tabs.Credit_Review.rows.forEach(function (r) { cr[r[0]] = r; });
    eq('credit tier', cr['C-20001'][8], 'B');
    eq('credit recommended (step capped)', cr['C-20001'][5], 6000);
    eq('credit action', cr['C-20001'][7], 'INCREASE');
    eq('credit flags', cr['C-20001'][28].indexOf('STEP_CAPPED') >= 0, true);
    eq('credit gate G3 for 90+ days late', cr['C-20004'][27].indexOf('G3') === 0, true);
    eq('worklist isolation', R.tabs.WL_ONE.rows.every(function (r) { return !r[1] || ['C-20001', 'C-20003'].indexOf(r[1]) >= 0; }), true);
    var R2 = E.run(fixture(), { AS_OF: '2026-10-26' });
    eq('deterministic', JSON.stringify(R2.tabs.Allocation_Proposal.rows) === JSON.stringify(R.tabs.Allocation_Proposal.rows) && JSON.stringify(R2.tabs.Credit_Review.rows) === JSON.stringify(R.tabs.Credit_Review.rows), true);
    return res;
  }
  return { run: run, fixture: fixture };
})(typeof WL_CORE !== 'undefined' ? WL_CORE : require('./core.js'), typeof WL_ENGINE !== 'undefined' ? WL_ENGINE : require('./engine.js'));
if (typeof module !== 'undefined') { module.exports = WL_TESTS; if (require.main === module) { var r = WL_TESTS.run(); console.log('PASS ' + r.pass + ' / FAIL ' + r.fail); r.failures.forEach(function (f) { console.log('  ' + f); }); } }

// ===================== gas.js =====================
// gas.js — Westline AR Command Center: the Google Apps Script layer.
// Reads the phase 1 workbook in place (never edits it), builds the other workbooks,
// runs the engine above, writes every tab, sends test emails and drafts rebuttals.

var PHASE1_ID = '1sFlLS6mAK7cFcEKEgzpgrn-WLVm3QvnApi9Bqa14p3Q';
var TZ = 'America/Los_Angeles';
var FILES = {
  inputs: 'WCC Inputs – demo exports',
  data: 'WCC Data – cleaned',
  output: 'WCC Output – Command Center',
  mgmt: 'WCC Management – aggregates (no customer data)'
};
var TAB_HOME = {
  data: ['Clean_Customers', 'Customer_Issues', 'Duplicate_Candidates', 'Fix_Queue', 'Alerts_Log'],
  output: ['Owner_Today', 'Account_360', 'Mgmt_Review', 'Credit_Review', 'Allocation_Proposal', 'Agent_Scorecard', 'Account_Effort', 'Audit_Sample', 'Query_Tracker', 'CB_Work', 'Meeting_Agenda'],
  mgmt: ['KPI_Summary', 'Aging_Mix', 'Lane_Summary', 'Credit_Summary', 'CB_Summary', 'Team_Summary', 'Data_Quality'],
  control: ['Recon']
};
var INPUT_TABS = ['Customer_Master_Export', 'Sales_History_Export', 'Payment_History_Export', 'Chargeback_Tracker', 'Escalations', 'Alerts_Inbox', 'Call_History_Export'];
var CONFIG_DEFAULTS = [
  ['AS_OF', '2026-10-26', 'Run date for the demo. In live use set this to TODAY.'],
  ['TEST_MODE', 'TRUE', 'TRUE sends every email only to the person running the script.'],
  ['ALLOWED_EMAIL_DOMAIN', 'westline-demo.example', 'Emails to any other domain are refused.'],
  ['MIN_BALANCE_TO_WORK', '25', 'Below this the account is CLEAR.'],
  ['PROMISE_GRACE_DAYS', '2', 'Days after the promise date before a promise counts as broken.'],
  ['SMALL_CLAIMS_MAX', '12500', 'California small-claims limit for a business; confirm with the court before use.'],
  ['MIN_CLAIM_BALANCE', '250', 'Below this, route to write-off review instead of claims.'],
  ['TARGET_WEIGHTED_ATTEMPTS_DAY', '60', 'Weighted calls per day for a full-time agent.'],
  ['CB_DEFAULT_RESPONSE_DAYS', '7', 'Used only when the tracker has no respond-by date.']
];

// ---------------- Menu ----------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('AR Center')
    .addItem('1. Set up and run the demo (first time)', 'setupAndRunDemo')
    .addSeparator()
    .addItem('Run now', 'runNow')
    .addItem('Run all tests', 'runAllTests')
    .addItem('Apply approvals (credit, fixes, allocation)', 'applyApprovals')
    .addItem('Explain an account…', 'explainAccount')
    .addItem('Send today\'s emails', 'sendTodaysEmails')
    .addItem('Create rebuttal drafts', 'createRebuttalDrafts')
    .addSeparator()
    .addItem('Install daily schedule', 'installSchedules')
    .addItem('Remove schedules', 'removeSchedules')
    .addToUi();
}

// ---------------- Helpers ----------------
function ctl_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function props_() { return PropertiesService.getDocumentProperties(); }
function folder_() { var f = DriveApp.getFileById(ctl_().getId()).getParents(); return f.hasNext() ? f.next() : DriveApp.getRootFolder(); }
function me_() { return Session.getEffectiveUser().getEmail(); }
function fileId_(key) { return props_().getProperty('FILE_' + key); }
function book_(key, title) {
  if (key === 'control') return ctl_();
  var id = fileId_(key);
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* recreate below */ } }
  var name = title || FILES[key] || key;
  var ss = SpreadsheetApp.create(name);
  ss.setSpreadsheetLocale('en_US'); ss.setSpreadsheetTimeZone(TZ);
  DriveApp.getFileById(ss.getId()).moveTo(folder_());
  props_().setProperty('FILE_' + key, ss.getId());
  return ss;
}
function sheet_(ss, name) { var sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name); return sh; }
function dropDefault_(ss) { var s = ss.getSheetByName('Sheet1'); if (s && ss.getSheets().length > 1) ss.deleteSheet(s); }
function readTab_(ss, name) { var sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() === 0) return []; return sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues(); }
function writeRaw_(ss, name, rows) {
  var sh = sheet_(ss, name); sh.clear();
  if (!rows.length) return sh;
  var w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  var data = rows.map(function (r) { var x = r.slice(); while (x.length < w) x.push(''); return x; });
  sh.getRange(1, 1, data.length, w).setNumberFormat('@').setValues(data);
  sh.setFrozenRows(1); sh.getRange(1, 1, 1, w).setFontWeight('bold').setBackground('#e8edf5');
  return sh;
}
var FMT_ = { t: '@', id: '@', d: 'd mmm yyyy', m: '$#,##0.00', n: '0.0', i: '0', p: '0.0%', b: null };
function writeTab_(ss, t) {
  var sh = sheet_(ss, t.name); sh.clear(); sh.clearConditionalFormatRules();
  var w = t.cols.length, n = t.rows.length;
  if (sh.getMaxColumns() < w) sh.insertColumnsAfter(sh.getMaxColumns(), w - sh.getMaxColumns());
  if (sh.getMaxRows() < n + 1) sh.insertRowsAfter(sh.getMaxRows(), n + 1 - sh.getMaxRows());
  sh.getRange(1, 1, 1, w).setValues([t.cols.map(function (c) { return c[0]; })]).setFontWeight('bold').setBackground('#1d3557').setFontColor('#ffffff').setWrap(true);
  if (n) {
    // text columns become plain text BEFORE writing so IDs and ZIPs keep their leading zeros
    var j = 0; while (j < w) { var k = j, ty = t.cols[j][1]; while (k + 1 < w && t.cols[k + 1][1] === ty) k++; if (FMT_[ty]) sh.getRange(2, j + 1, n, k - j + 1).setNumberFormat(FMT_[ty]); j = k + 1; }
    var data = t.rows.map(function (r) { var x = r.slice(0, w); while (x.length < w) x.push(''); return x.map(function (v) { return v === null || v === undefined ? '' : v; }); });
    sh.getRange(2, 1, n, w).setValues(data);
    t.cols.forEach(function (c, ix) { if (c[1] === 'b') sh.getRange(2, ix + 1, n, 1).insertCheckboxes(); });
  }
  sh.setFrozenRows(1); if (t.note) sh.getRange(1, 1).setNote(t.note);
  if (w <= 25) sh.autoResizeColumns(1, w);
  return sh;
}
function config_() {
  var rows = readTab_(ctl_(), 'Config'), o = {};
  rows.slice(1).forEach(function (r) { if (r[0]) o[r[0]] = r[1]; });
  var c = {};
  if (o.AS_OF) c.AS_OF = String(o.AS_OF).toUpperCase() === 'TODAY' ? Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') : o.AS_OF;
  c.TEST_MODE = String(o.TEST_MODE || 'TRUE').toUpperCase() !== 'FALSE';
  ['MIN_BALANCE_TO_WORK', 'PROMISE_GRACE_DAYS', 'SMALL_CLAIMS_MAX', 'MIN_CLAIM_BALANCE', 'TARGET_WEIGHTED_ATTEMPTS_DAY', 'CB_DEFAULT_RESPONSE_DAYS'].forEach(function (k) { if (o[k] !== undefined && o[k] !== '' && !isNaN(+o[k])) c[k] = +o[k]; });
  c.ALLOWED_EMAIL_DOMAIN = o.ALLOWED_EMAIL_DOMAIN || 'westline-demo.example';
  return c;
}
function log_(what, detail) { var sh = sheet_(ctl_(), 'RunLog'); if (sh.getLastRow() === 0) sh.appendRow(['when (PT)', 'what', 'detail']); sh.appendRow([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'), what, detail]); }

// ---------------- Inputs ----------------
function phase1_() {
  var p = SpreadsheetApp.openById(PHASE1_ID);
  return { accounts: readTab_(p, 'Accounts'), invoices: readTab_(p, 'Worklist'), calls: readTab_(p, 'Call Log'), requests: readTab_(p, 'Requests'), kpis: readTab_(p, 'Monthly KPIs') };
}
function inputs_(p1) {
  var ib = book_('inputs'), c = ctl_(), pat = readTab_(c, 'AlertPatterns');
  return { customers: readTab_(ib, 'Customer_Master_Export'), invoices: p1.invoices, calls: p1.calls, callHistory: readTab_(ib, 'Call_History_Export'), requests: p1.requests,
    escalations: readTab_(ib, 'Escalations'), chargebacks: readTab_(ib, 'Chargeback_Tracker'), sales: readTab_(ib, 'Sales_History_Export'), payments: readTab_(ib, 'Payment_History_Export'), alerts: readTab_(ib, 'Alerts_Inbox'),
    agents: readTab_(c, 'Agents'), assignments: readTab_(c, 'Assignments'), overrides: readTab_(c, 'Overrides'),
    alertPatterns: pat.length > 1 ? pat.slice(1).filter(function (r) { return r[0]; }).map(function (r) { return { type: r[0], match: r[1] }; }) : null };
}

// ---------------- Setup ----------------
function setupAndRunDemo() {
  var ss = ctl_(); ss.setSpreadsheetLocale('en_US'); ss.setSpreadsheetTimeZone(TZ);
  var p1 = phase1_(), g = WL_DEMO.build(p1);
  if (!ss.getSheetByName('Config')) writeRaw_(ss, 'Config', [['key', 'value', 'what it does']].concat(CONFIG_DEFAULTS));
  writeRaw_(ss, 'Agents', g.Agents); writeRaw_(ss, 'Assignments', g.Assignments);
  if (!ss.getSheetByName('Overrides')) writeRaw_(ss, 'Overrides', [['account_id', 'field', 'corrected_value', 'reason', 'entered_by', 'active']]);
  writeRaw_(ss, 'AlertPatterns', [['type', 'phrase that identifies it (regular expression)']].concat(WL_CORE.ALERT_PATTERNS.map(function (x) { return [x.type, x.match]; })));
  ['ChangeLog', 'MailLog'].forEach(function (n) { if (!ss.getSheetByName(n)) sheet_(ss, n); });
  var ib = book_('inputs'); INPUT_TABS.forEach(function (n) { writeRaw_(ib, n, g[n]); }); dropDefault_(ib);
  ib.getSheetByName('Customer_Master_Export').getRange(1, 1).setNote('Synthetic PowerLink customer master. Deliberately messy: the cleaner in WCC Data must cope with it.');
  log_('Setup', 'Demo inputs generated from phase 1 (' + (g.Customer_Master_Export.length - 1) + ' customers, ' + (g.Call_History_Export.length - 1) + ' earlier calls)');
  runAllTests();
  var R = runNow(true);
  if (R && R.published) { createRebuttalDrafts(R); buildDashboard_(R, p1); buildAsk_(R); sendTodaysEmails(R); }
  filesTab_();
  try { SpreadsheetApp.getUi().alert('Westline AR Command Center is ready', 'All reconciliation checks: ' + (R.published ? 'PASS' : 'FAIL – see Recon') + '.\nOpen the Files tab for every link. Test emails were sent to ' + me_() + '.', SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* no UI when run from a trigger */ }
}

function filesTab_() {
  var rows = [['what', 'link']];
  ['output', 'data', 'mgmt', 'inputs'].forEach(function (k) { var id = fileId_(k); if (id) rows.push([FILES[k], 'https://docs.google.com/spreadsheets/d/' + id]); });
  ['LEAD', 'ROHIT', 'ANANYA', 'KABIR'].forEach(function (k) { var id = fileId_('WL_' + k); if (id) rows.push(['Worklist – ' + k, 'https://docs.google.com/spreadsheets/d/' + id]); });
  var rf = props_().getProperty('FOLDER_REBUTTALS'); if (rf) rows.push(['Rebuttal drafts (Google Docs)', 'https://drive.google.com/drive/folders/' + rf]);
  rows.push(['Phase 1 workbook (read only by this system)', 'https://docs.google.com/spreadsheets/d/' + PHASE1_ID]);
  writeRaw_(ctl_(), 'Files', rows);
}

// ---------------- Run ----------------
function runNow(quiet) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) { log_('Run skipped', 'Another run is in progress'); return null; }
  try {
    var t0 = Date.now(), cfg = config_(), p1 = phase1_(), R = WL_ENGINE.run(inputs_(p1), cfg);
    writeTab_(ctl_(), R.tabs.Recon);
    if (!R.published) {
      log_('Run FAILED recon', R.recon.filter(function (r) { return r.result === 'FAIL'; }).map(function (r) { return r.code + ' ' + r.detail; }).join(' | '));
      sendMail_(me_(), '[AR] Run blocked: a reconciliation check failed', '<p>Outputs were not published; the previous results stay live. See the Recon tab.</p>', cfg, 'run_failed');
      return R;
    }
    ['data', 'output', 'mgmt'].forEach(function (k) { var ss = book_(k); TAB_HOME[k].forEach(function (n) { writeTab_(ss, R.tabs[n]); }); dropDefault_(ss); });
    var own = book_('output').getSheetByName('Owner_Today'), ov = own.getRange(2, 1, Math.max(1, own.getLastRow() - 1), 1).getValues();
    ov.forEach(function (v, i) { if (v[0] === '§') own.getRange(i + 2, 1, 1, 7).setFontWeight('bold').setBackground('#e8edf5'); });
    var agentNames = {}; readTab_(ctl_(), 'Agents').slice(1).forEach(function (r) { agentNames[r[0]] = r[1]; });
    WL_AGENT_KEYS_(R).forEach(function (k) { var wb = book_('WL_' + k, 'WCC Worklist – ' + (agentNames[k] || k)); writeTab_(wb, rename_(R.tabs['WL_' + k], 'Today')); dropDefault_(wb); });
    var issues = R.issues.filter(function (i) { return i.sev === 'ERROR' || i.sev === 'CRITICAL'; }).map(function (i) { return [i.dataset, i.account_id, i.row, i.field, i.sev, i.code, i.msg]; });
    writeTab_(ctl_(), { name: 'IssueLog', cols: [['dataset', 't'], ['account_id', 'id'], ['row', 'i'], ['field', 't'], ['severity', 't'], ['code', 't'], ['message', 't']], rows: issues, note: 'Errors and critical issues only; warnings are listed per record in WCC Data.' });
    log_('Run published', R.counts.a360 + ' accounts · ' + R.recon.length + ' checks passed · ' + Math.round((Date.now() - t0) / 1000) + 's');
    return R;
  } finally { lock.releaseLock(); }
}
function rename_(t, name) { return { name: name, cols: t.cols, rows: t.rows, note: t.note }; }
function WL_AGENT_KEYS_(R) { return Object.keys(R.tabs).filter(function (n) { return n.indexOf('WL_') === 0; }).map(function (n) { return n.slice(3); }); }

// ---------------- Emails ----------------
function sendMail_(to, subject, html, cfg, tag) {
  var real = to;
  if (cfg.TEST_MODE) { to = me_(); subject = '[TEST] ' + subject; }
  else if (String(to).split('@')[1] !== cfg.ALLOWED_EMAIL_DOMAIN) { log_('Email BLOCKED', 'Recipient outside ' + cfg.ALLOWED_EMAIL_DOMAIN + ': ' + to); return false; }
  if (MailApp.getRemainingDailyQuota() < 5) { log_('Email held', 'Daily quota nearly used'); return false; }
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: 'Westline AR Command Center' });
  var sh = sheet_(ctl_(), 'MailLog'); if (sh.getLastRow() === 0) sh.appendRow(['when', 'tag', 'intended for', 'sent to', 'subject']);
  sh.appendRow([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), tag, real, to, subject]);
  return true;
}
function sendTodaysEmails(R) {
  if (!R || !R.emails) R = runNow(true); if (!R || !R.published) return;
  var cfg = config_(), agents = readTab_(ctl_(), 'Agents'), email = {}; agents.slice(1).forEach(function (r) { email[r[0]] = r[2]; });
  R.emails.forEach(function (e) { sendMail_(email[e.to] || me_(), e.subject, e.html, cfg, e.kind); });
}

// ---------------- Rebuttal drafts ----------------
function createRebuttalDrafts(R) {
  if (!R || !R.docs) R = runNow(true); if (!R) return;
  var fid = props_().getProperty('FOLDER_REBUTTALS'), f;
  if (fid) { try { f = DriveApp.getFolderById(fid); } catch (e) { f = null; } }
  if (!f) { f = folder_().createFolder('Rebuttal drafts'); props_().setProperty('FOLDER_REBUTTALS', f.getId()); }
  R.docs.forEach(function (d) {
    var it = f.getFilesByName(d.title); if (it.hasNext()) return; // never overwrite a draft someone may have edited
    var doc = DocumentApp.create(d.title), body = doc.getBody(), lines = d.text.split('\n');
    body.appendParagraph(lines[0]).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    lines.slice(1).forEach(function (l) { var p = body.appendParagraph(l); if (l === 'Summary' || l === 'Exhibits to attach') p.setHeading(DocumentApp.ParagraphHeading.HEADING2); });
    var first = body.getChild(0); if (first.asParagraph().getText() === '') body.removeChild(first);
    doc.saveAndClose(); DriveApp.getFileById(doc.getId()).moveTo(f);
  });
  log_('Rebuttal drafts', R.docs.length + ' drafts checked in ' + f.getName());
}

// ---------------- Dashboard (management workbook) ----------------
function buildDashboard_(R, p1) {
  var ss = book_('mgmt');
  var hist = (p1.kpis || []).filter(function (r) { return r[0]; });
  if (hist.length > 1) {
    var H = hist[0], ix = function (n) { return H.indexOf(n); };
    var rows = hist.slice(1).map(function (r) { var pc = function (s) { return parseFloat(String(s).replace('%', '')) / 100; }, mo = function (s) { return parseFloat(String(s).replace(/[$,]/g, '')); };
      return [r[0], mo(r[ix('Collected')]), mo(r[ix('Company target')]), pc(r[ix('Older than 60 days')]), pc(r[ix('Card share')]), parseFloat(r[ix('DSO')])]; });
    writeTab_(ss, { name: 'Monthly_History', cols: [['month', 't'], ['collected', 'm'], ['company target', 'm'], ['older than 60 days', 'p'], ['card share', 'p'], ['DSO', 'n']], rows: rows, note: 'From the phase 1 workbook (Monthly KPIs), read in place.' });
  }
  var d = sheet_(ss, 'Dashboard'); d.clear(); d.getCharts().forEach(function (c) { d.removeChart(c); });
  ss.setActiveSheet(d); ss.moveActiveSheet(1);
  d.getRange('A1').setValue('Westline AR Command Center — management view').setFontSize(16).setFontWeight('bold');
  d.getRange('A2').setValue('As of ' + R.kpi.as_of + '. Aggregates only: no customer names or account numbers on this file. All checks: ' + (R.published ? 'PASS' : 'FAIL'));
  function place(builder, title, row, col) { d.insertChart(builder.setPosition(row, col, 0, 0).setOption('title', title).setOption('width', 560).setOption('height', 300).setOption('legend', { position: 'bottom' }).build()); }
  var mh = ss.getSheetByName('Monthly_History');
  if (mh) {
    var last = mh.getLastRow();
    place(d.newChart().setChartType(Charts.ChartType.LINE).addRange(mh.getRange('A1:A' + last)).addRange(mh.getRange('D1:D' + last)).setOption('vAxis', { format: 'percent' }), 'Share of AR older than 60 days (phase 1 history)', 4, 1);
    place(d.newChart().setChartType(Charts.ChartType.COMBO).addRange(mh.getRange('A1:C' + last)).setOption('seriesType', 'bars').setOption('series', { 1: { type: 'line' } }), 'Collected vs company target', 4, 8);
  }
  var am = ss.getSheetByName('Aging_Mix'); if (am) place(d.newChart().setChartType(Charts.ChartType.COLUMN).addRange(am.getRange('A1:B7')), 'Open AR by age, today', 20, 1);
  var cs = ss.getSheetByName('CB_Summary');
  if (cs) { var n = cs.getLastRow(), vals = cs.getRange(1, 1, n, 1).getValues(), rs = 0; for (var i = 1; i < n; i++) if (vals[i][0] === 'By root cause') { rs = i + 1; break; }
    if (rs) place(d.newChart().setChartType(Charts.ChartType.BAR).addRange(cs.getRange(rs, 2, n - rs + 1, 1)).addRange(cs.getRange(rs, 4, n - rs + 1, 1)), 'Chargeback dollars by root cause, 2026', 20, 8); }
  var ls = ss.getSheetByName('Lane_Summary'); if (ls) place(d.newChart().setChartType(Charts.ChartType.BAR).addRange(ls.getRange('A1:B7')), 'Accounts by lane, today', 36, 1);
  dropDefault_(ss);
}

// ---------------- Ask tab (Output workbook) ----------------
function buildAsk_(R) {
  var ss = book_('output'), sh = sheet_(ss, 'Ask'); sh.clear();
  var cols = R.tabs.Account_360.cols.map(function (c) { return c[0]; });
  function L(name) { var n = cols.indexOf(name) + 1, s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  var show = [L('account_id'), L('customer'), L('agent'), L('past_due'), L('oldest_dpd'), L('next_action')].join(',');
  var Q = [
    ['Over limit and still ordering', L('over_limit') + ' > 0 and ' + L('orders_over_limit') + ' >= 1'],
    ['Promises due today', L('promise_status') + " = 'DUE_TODAY'"],
    ['Broken promises', L('promise_status') + " = 'BROKEN'"],
    ['Past due, not called for 14+ days', L('past_due') + ' > 0 and (' + L('days_since_touch') + ' >= 14 or ' + L('days_since_touch') + ' is null)'],
    ['Follow-ups that are late', L('follow_up_late_bdays') + ' >= 1'],
    ['Ready for management review', L('lane') + " = 'MGMT_REVIEW'"],
    ['Ordering while 60+ days late', L('orders_while_60_plus') + ' >= 1'],
    ['Disputes blocking collection', L('lane') + " = 'DISPUTE'"],
    ['Credit hold recommended', L('credit_action') + " = 'HOLD'"],
    ['Called by 2+ agents this week', L('agents_7d') + ' >= 2'],
    ['50 biggest past-due accounts', L('past_due') + ' > 0']];
  sh.getRange('A1').setValue('Ask a question').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setValue('Pick a question:'); sh.getRange('B2').setValue(Q[0][0]).setBackground('#fff7d6').setFontWeight('bold');
  sh.getRange('B2').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Q.map(function (q) { return q[0]; }), true).build());
  var f = '"No accounts match"', last = 'Account_360!A1:' + L('next_action');
  for (var i = Q.length - 1; i >= 0; i--) f = 'IF($B$2="' + Q[i][0] + '",QUERY(' + last + ',"select ' + show + ' where ' + Q[i][1] + ' order by ' + L('past_due') + ' desc' + (i === Q.length - 1 ? ' limit 50' : '') + '",1),' + f + ')';
  sh.getRange('A3').setValue('Rule: every answer is a live QUERY on Account_360, refreshed by each run.').setFontColor('#5b6573');
  sh.getRange('A5').setFormula('=IFERROR(' + f + ',"No accounts match")');
  ss.setActiveSheet(sh); ss.moveActiveSheet(2);
}

// ---------------- Approvals ----------------
function applyApprovals() {
  var out = book_('output'), data = book_('data'), c = ctl_(), who = me_(), when = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), n = { credit: 0, fix: 0, alloc: 0 };
  var cr = out.getSheetByName('Credit_Review'); if (cr && cr.getLastRow() > 1) { var v = cr.getDataRange().getValues(), h = v[0];
    var log = sheet_(c, 'ChangeLog'); if (log.getLastRow() === 0) log.appendRow(['when', 'account_id', 'old limit', 'new limit', 'action', 'tier', 'override', 'reason', 'approved by']);
    v.slice(1).forEach(function (r) { if (r[h.indexOf('approve')] === true) { var ov = r[h.indexOf('override limit')]; log.appendRow([when, r[0], r[4], ov !== '' ? ov : r[5], r[7], r[8], ov !== '' ? 'yes' : 'no', ov !== '' ? r[h.indexOf('override reason')] : r[h.indexOf('reasons')], who]); n.credit++; } }); }
  var fq = data.getSheetByName('Fix_Queue'); if (fq && fq.getLastRow() > 1) { var f = fq.getDataRange().getValues(), ovs = sheet_(c, 'Overrides');
    f.slice(1).forEach(function (r) { if (r[6] === true && String(r[5]).trim() !== '') { ovs.appendRow([r[0], r[4], r[5], 'Fix_Queue', who, 'TRUE']); n.fix++; } }); }
  var ap = out.getSheetByName('Allocation_Proposal'); if (ap && ap.getLastRow() > 1) { var a = ap.getDataRange().getValues(), asg = c.getSheetByName('Assignments'), cur = asg.getDataRange().getValues(), rowOf = {};
    var keyOf = {}; readTab_(c, 'Agents').slice(1).forEach(function (r) { keyOf[r[1]] = r[0]; });
    cur.forEach(function (r, i) { rowOf[r[0]] = i + 1; });
    a.slice(1).forEach(function (r) { if (r[8] === true && keyOf[r[6]]) { var row = [r[0], keyOf[r[6]], when.slice(0, 10), who, when]; if (rowOf[r[0]]) asg.getRange(rowOf[r[0]], 1, 1, 5).setValues([row]); else asg.appendRow(row); n.alloc++; } }); }
  log_('Approvals applied', n.credit + ' credit decisions logged, ' + n.fix + ' fixes saved, ' + n.alloc + ' accounts reassigned');
  try { SpreadsheetApp.getUi().alert('Applied: ' + n.credit + ' credit decisions, ' + n.fix + ' data fixes, ' + n.alloc + ' reassignments. Run now to refresh every list.'); } catch (e) { }
}

// ---------------- Explain an account ----------------
function explainAccount(id) {
  if (!id) { var ui = SpreadsheetApp.getUi(), r = ui.prompt('Explain an account', 'Account ID (for example C-10452):', ui.ButtonSet.OK_CANCEL); if (r.getSelectedButton() !== ui.Button.OK) return; id = r.getResponseText(); }
  id = WL_CORE.normId(id, WL_CORE.config()).v;
  var R = WL_ENGINE.run(inputs_(phase1_()), config_()), a = R._A[id], rows = [['part', 'detail']];
  if (!a) { rows.push(['Not found', id + ' has no balance, recent call, open item or alert']); }
  else {
    rows.push(['Account', id + ' · ' + a.name + ' · yard ' + a.yard + ' · agent ' + R._agentName(a.agent)]);
    rows.push(['Lane', a.lane + (a.route ? ' → ' + a.route : '') + (a.mgmt_codes.length ? ' (rules ' + a.mgmt_codes.join(', ') + ')' : '')]);
    rows.push(['Priority score', a.score + ' = ' + a.reasons.map(function (x) { return x.code + ' ' + (x.pts > 0 ? '+' : '') + x.pts; }).join(', ')]);
    rows.push(['Next action', a.action]);
    (R._inv[id] || []).forEach(function (x) { rows.push(['Invoice ' + x.invoice_no, WL_CORE.fmtUSD(x.open) + ' open · due ' + WL_CORE.nice(x.due_date) + ' · ' + x.dpd + ' days past due' + (x.flag ? ' · ' + x.flag : '')]); });
    (R._act[id] || []).slice(-15).forEach(function (x) { rows.push(['Call ' + WL_CORE.nice(x.day), R._agentName(x.agent) + ' · ' + x.raw_outcome + (x.amount ? ' · ' + WL_CORE.fmtUSD(x.amount) : '') + (x.promise_date !== null ? ' by ' + WL_CORE.nice(x.promise_date) : '') + ' (' + x.source + ' row ' + x.row + ')']); });
    var c = R._credit[id]; if (c) { rows.push(['Credit', c.action + ' · tier ' + c.tier + ' · score ' + c.score + ' (' + c.parts.join(' + ') + ') · limit ' + WL_CORE.fmtUSD0(c.cur) + ' → ' + WL_CORE.fmtUSD0(c.rec)]); rows.push(['Credit reasons', c.reasons]); }
  }
  writeRaw_(ctl_(), 'Explain', rows); ctl_().setActiveSheet(ctl_().getSheetByName('Explain'));
}

// ---------------- Tests and schedules ----------------
function runAllTests() {
  var r = WL_TESTS.run(), rows = [['result', 'detail'], [r.fail === 0 ? 'PASS' : 'FAIL', r.pass + ' passed, ' + r.fail + ' failed · ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')]].concat(r.failures.map(function (f) { return ['FAIL', f]; }));
  writeRaw_(ctl_(), 'Tests', rows); log_('Tests', r.pass + ' passed, ' + r.fail + ' failed'); return r;
}
function scheduledRun() { var R = runNow(true); if (R && R.published) sendTodaysEmails(R); }
function installSchedules() {
  removeSchedules();
  ScriptApp.newTrigger('scheduledRun').timeBased().atHour(6).nearMinute(30).everyDays(1).inTimezone(TZ).create();
  log_('Schedule', 'Daily run and emails at about 6:30 AM Pacific');
}
function removeSchedules() { ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); }); }

