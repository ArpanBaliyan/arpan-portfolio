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
