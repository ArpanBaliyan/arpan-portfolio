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
