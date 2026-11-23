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
