// app.js — renders every section of the page from the engine output in data/command-center.js
(function () {
  var W = window.WCC, K = W.kpi, S = window.SITE || {};
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function usd(c, d) { var x = (c || 0) / 100; return (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d === 0 ? 0 : 2, maximumFractionDigits: d === 0 ? 0 : 2 }); }
  function pct(x, dp) { return x === null || x === undefined ? '–' : (x * 100).toFixed(dp || 0) + '%'; }
  function table(head, rows, opts) {
    opts = opts || {}; var num = opts.num || [];
    return '<table class="tbl' + (opts.cls ? ' ' + opts.cls : '') + '"><thead><tr>' + head.map(function (h, i) { return '<th' + (num.indexOf(i) >= 0 ? ' class="num"' : '') + ' scope="col">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { var html = opts.html && opts.html.indexOf(i) >= 0, nw = typeof c === 'string' && (c.length <= 12 || /^(C-\d{5}|REQ-|ESC-|CB-)/.test(c)) || (typeof c === 'string' && i === 0 && c.length <= 18); return '<td' + (num.indexOf(i) >= 0 ? ' class="num"' : opts.why === i ? ' class="why"' : nw ? ' style="white-space:nowrap"' : '') + '>' + (html ? c : esc(c)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  var nice = function (iso) { var d = new Date(iso + 'T12:00:00Z'); return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };

  // ---------- hero ----------
  $('heroLead').textContent = 'Westline Auto Parts is a fictional four-yard parts distributor in California that sells on credit to body shops and garages. Every morning this system reads the team\'s Google Sheets, joins them into one view of every account, and produces finished work: ranked call lists, credit limits with reasons, chargeback drafts and a queue of decisions for management. This page shows the run for ' + nice(W.as_of) + '.';
  var cell = function (amt, lab, hl) { return '<div class="cell"><span class="amt">' + (hl ? '<span class="mark">' + esc(amt) + '</span>' : esc(amt)) + '</span><span class="lab">' + esc(lab) + '</span></div>'; };
  $('tie').innerHTML = '<div class="row">' + cell(W.tieout.ex, 'AR export from PowerLink') + '<span class="eq" aria-hidden="true">=</span>' + cell(W.tieout.ex, 'After cleaning, ' + W.counts.invoices + ' invoices') + '<span class="eq" aria-hidden="true">=</span>' + cell(W.tieout.ex, 'Sum of all ' + W.counts.a360 + ' accounts', true) + '</div>' +
    '<div class="verdict"><b>' + W.recon.filter(function (r) { return r.result === 'PASS'; }).length + ' of ' + W.recon.length + ' reconciliation checks passed</b>, so this run was published. If any of them fails, nothing is overwritten.</div>';
  var cr = K.credit.actions;
  var facts = [[W.counts.a360 + ' accounts', 'joined from 8 sheets into one row each'], [K.promises_today + ' promises', usd(K.promises_today_amt, 0) + ' due today, on the lists first'], [pct(K.over60_pct, 1), 'of open AR is older than 60 days'],
    [K.mgmt.n + ' accounts', 'ready for a management decision'], [(cr.INCREASE || 0) + ' raises, ' + (cr.DECREASE || 0) + ' cuts', 'out of ' + K.credit.reviewed + ' credit limits reviewed'], [K.cust_records_with_problems + ' records', 'in the customer master need a person to fix them']];
  $('facts').innerHTML = facts.map(function (f) { return '<li><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span></li>'; }).join('');

  // ---------- this morning ----------
  $('promises').innerHTML = '<h3>Promises due today</h3><div class="scroll">' + table(['Account', 'Customer', 'Promised', 'Taken by'], W.owner.promises.slice(0, 10), { num: [2] }) + '</div><p class="small muted">' + K.promises_today + ' in total; the first ' + Math.min(10, K.promises_today) + ' shown.</p>';
  $('risk').innerHTML = '<h3>Still ordering while late or over limit</h3><div class="scroll">' + table(['Account', 'Customer', 'Past due', 'Alerts, 7 days', 'Oldest days'], W.owner.risk.map(function (r) { return [r[0], r[1], r[2], r[3], r[5]]; }), { num: [2, 3, 4] }) + '</div><p class="small muted">From PowerLink alerts routed to email and parsed by the script.</p>';
  $('agenda').innerHTML = table(['Topic', 'Item', 'Detail'], W.owner.agenda);
  var mails = W.emails;
  $('mailTabs').innerHTML = mails.map(function (m, i) { var n = { owner_brief: 'Owner brief', agent_today: 'Daily list', agent_weekly: 'Weekly scorecard' }[m.kind] + (m.kind === 'owner_brief' ? '' : ' · ' + ({ ROHIT: 'Rohit', ANANYA: 'Ananya', KABIR: 'Kabir', LEAD: 'Lead' }[m.to] || m.to)); return '<button role="tab" aria-selected="' + (i === 0) + '" data-i="' + i + '">' + esc(n) + '</button>'; }).join('');
  function showMail(i) { var m = mails[i]; $('mailBody').innerHTML = '<div class="hdr">Subject: ' + esc(m.subject) + '</div><div class="body">' + m.html + '</div>'; [].forEach.call($('mailTabs').children, function (b) { b.setAttribute('aria-selected', String(+b.dataset.i === i)); }); }
  $('mailTabs').addEventListener('click', function (e) { if (e.target.dataset.i) showMail(+e.target.dataset.i); }); showMail(0);

  // ---------- lists ----------
  $('listTabs').innerHTML = W.lists.map(function (l, i) { return '<button role="tab" aria-selected="' + (i === 1) + '" data-i="' + i + '">' + esc(l.agent) + ' (' + l.size + ')</button>'; }).join('');
  function showList(i) { var l = W.lists[i]; $('listBody').innerHTML = '<div class="scroll" style="margin:0">' + table(['#', 'Account', 'Customer', 'Past due', 'Days', 'Next action', 'Why it is on the list'], l.rows, { num: [0, 3, 4], why: 6 }) + '</div><p class="small muted">Top 12 of ' + l.size + '. The full list is a Google Sheet shared only with ' + esc(l.agent.split(' ')[0]) + '.</p>';
    [].forEach.call($('listTabs').children, function (b) { b.setAttribute('aria-selected', String(+b.dataset.i === i)); }); }
  $('listTabs').addEventListener('click', function (e) { if (e.target.dataset.i) showList(+e.target.dataset.i); }); showList(1);
  $('tracker').innerHTML = table(['Type', 'ID', 'Account', 'What', 'Owner', 'Due', 'Days overdue', 'Reminder'], W.tracker.map(function (t) { var tag = t[6] >= 5 ? 'late' : t[6] >= 1 ? 'late' : t[7] === 'Due today' ? 'today' : ''; return [t[0], t[1], t[2], t[3], t[4], t[5], t[6], '<span class="tag ' + tag + '">' + esc(t[7]) + '</span>']; }), { num: [6], html: [7] });

  // ---------- management ----------
  $('mgmtLead').textContent = K.mgmt.n + ' accounts (' + usd(K.mgmt.amt, 0) + ' past due) have run out of normal options: 120+ days late, promises broken twice, unreachable, refusing, a bounced check that never cleared, or new orders while 60+ days late. Each comes with the rule that put it here and a recommended route.';
  var rule = { M1: '120+ days late', M2: 'many tries, no contact', M3: 'two promises broken', M4: 'refused to pay', M5: 'unreachable', M6: 'bounced check not cleared', M7: 'business closed', M8: 'still ordering while 60+ days late' };
  $('mgmtTable').innerHTML = table(['Account', 'Customer', 'Past due', 'Oldest days', 'Recommended route', 'Why it is here'], W.mgmt.map(function (r) { return [r[0], r[1], r[2], r[3], r[4], r[5].split(', ').map(function (x) { return rule[x.slice(0, 2)] || x; }).join('; ')]; }), { num: [2, 3] });

  // ---------- credit ----------
  var cc = K.credit;
  $('creditLead').textContent = 'Every one of the ' + cc.reviewed + ' credit accounts gets a limit sized to one buying cycle (recent monthly purchases × terms + 15 days), adjusted by a seven-part risk score. ' + cc.over_limit + ' accounts owe more than their limit and ' + cc.no_limit + ' buy on credit with no limit at all. Dots inside the blue band are right-sized.';
  var col = { INCREASE: '#2E7048', SET: '#2E7048', DECREASE: '#A8382B', DORMANT: '#C98C7F', KEEP: '#8C99A8', HOLD: '#16233F', SUSPEND: '#16233F', STARTER: '#2457A6', CASH_OR_CARD: '#16233F' };
  CH.scatter($('scatter'), W.creditScatter, function (a) { return col[a] || '#8C99A8'; }, 'Credit limit on file against what each account needs');
  $('scatter').insertAdjacentHTML('beforeend', '<div class="legend"><span><i style="background:#2E7048"></i>Raise</span><span><i style="background:#A8382B"></i>Lower</span><span><i style="background:#C98C7F"></i>Dormant, lower</span><span><i style="background:#16233F"></i>Hold</span><span><i style="background:#2457A6"></i>New account</span><span><i style="background:#8C99A8"></i>Keep</span></div><figcaption>Each dot is an account with a limit on file. Hover for details.</figcaption>');
  var order = ['INCREASE', 'DECREASE', 'KEEP', 'DORMANT', 'HOLD', 'STARTER', 'SET', 'CASH_OR_CARD'], names = { INCREASE: 'Raise', DECREASE: 'Lower', KEEP: 'Keep', DORMANT: 'Dormant: lower to $500', HOLD: 'Hold', STARTER: 'New account: starter limit', SET: 'Set a first limit', CASH_OR_CARD: 'Move to card or prepay' };
  $('creditActions').innerHTML = '<h3>Decisions, ready for approval</h3>' + table(['Action', 'Accounts'], order.filter(function (k) { return cr[k]; }).map(function (k) { return [names[k], cr[k]]; }), { num: [1] }) +
    '<p class="small muted">Limits on file total ' + usd(cc.exposure_now, 0) + '; recommended ' + usd(cc.exposure_rec, 0) + '. Nothing changes until a person ticks approve; each decision is logged.</p>';
  $('creditMethod').innerHTML = '<h3>How the score works</h3>' + table(['Part', 'Points'], [['Pays within terms (share of dollars, 12 months)', 35], ['How late at worst (6 months)', 20], ['Promises kept (90 days)', 10], ['Return rate', 10], ['Years as a customer', 10], ['Buys every month', 10], ['No bounced checks or lost chargebacks', 5]], { num: [1] }) +
    '<p class="small muted">Tiers A 85+ (×1.5), B 70–84 (×1.25), C 55–69 (×1), D 40–54 (×0.75), E under 40 (card or prepay). Hard gates come first: closed, bounced check not cleared, 90+ days late, open fraud chargeback, new account, dormant.</p>';
  $('creditTable').innerHTML = table(['Account', 'Customer', 'Limit now', 'Recommended', 'Action', 'Tier', 'Score', 'Why'], W.credit.slice(0, 15), { num: [2, 3, 6], why: 7 });

  // ---------- chargebacks ----------
  var cb = K.cb;
  var prevAmt = W.cb.roots.filter(function (r) { return r[3]; }).reduce(function (s, r) { return s + r[2]; }, 0), fraudAmt = W.cb.roots.filter(function (r) { return /FRAUD/.test(r[0]); }).reduce(function (s, r) { return s + r[2]; }, 0);
  document.querySelector('#cb h2').textContent = prevAmt > fraudAmt ? 'Chargebacks: late refunds cost more than fraud' : 'Chargebacks: where the money goes';
  $('cbLead').textContent = cb.total + ' chargebacks in 2026 so far (' + usd(cb.amt, 0) + '). ' + cb.preventable_n + ' of them trace to a step inside the company: a late return pickup, a late scan, a credit memo that was not raised, or sales not telling accounting. Of the cases fought to a decision, ' + pct(cb.win_rate) + ' were won.';
  var roots = W.cb.roots.slice().sort(function (a, b) { return b[2] - a[2]; }), rn = { LATE_CREDIT: 'Credit memo raised late', LATE_RETURN_PICKUP: 'Return picked up late', LATE_SCAN: 'Return scanned late', SALES_DID_NOT_INFORM: 'Sales did not tell accounting', WRONG_PART: 'Wrong part shipped', DAMAGED: 'Damaged in delivery', FRIENDLY_FRAUD: 'Customer disputed a valid charge', TRUE_FRAUD: 'Fraud', DUPLICATE_BILLING: 'Billed twice', CUSTOMER_ERROR: 'Customer error', OTHER: 'Other' };
  CH.bars($('rootChart'), roots.map(function (r) { return { name: rn[r[0]] || r[0], v: r[2], color: r[3] ? '#A8382B' : '#8C99A8', text: CH.money(r[2]) + ' · ' + r[1] + ' case' + (r[1] > 1 ? 's' : '') }; }), { label: 'Chargeback dollars by root cause', labelWidth: 280 });
  $('rootChart').insertAdjacentHTML('beforeend', '<div class="legend"><span><i style="background:#A8382B"></i>Preventable inside the company</span><span><i style="background:#8C99A8"></i>Other causes</span></div><figcaption>Closed and open cases with a root cause recorded, 2026.</figcaption>');
  $('cbOpen').innerHTML = table(['Case', 'Customer', 'Amount', 'Code', 'Category', 'Respond by', 'Business days left', 'Status'], W.cb.open.map(function (x) { return [x[0], x[1], x[2], x[3], x[4].replace(/_/g, ' ').toLowerCase(), x[5], x[7] === 'SUBMITTED' ? '–' : x[6] <= 3 ? '<span class="tag ' + (x[6] < 0 ? 'late' : 'today') + '">' + x[6] + '</span>' : x[6], x[7].toLowerCase()]; }), { num: [2, 6], html: [6] });
  $('doc').textContent = W.doc.text;

  // ---------- team ----------
  $('teamTable').innerHTML = table(['Agent', 'Calls', 'Weighted', 'Contact vs expected', 'Follow-ups on time', 'Promises kept', 'Collected', 'Untouched 14d+', 'Score', 'Prior week'],
    W.perf.week.map(function (p, i) { var pv = W.perf.prev[i]; return [p.agent, p.calls, p.weighted.toFixed(0), p.rpc_index, p.fu_due ? p.fu_met + ' of ' + p.fu_due + ' (' + pct(p.fu_rate) + ')' : '–', p.kept_due ? p.kept + ' of ' + p.kept_due : '–', usd(p.collected, 0), p.untouched, p.score, pv.score]; }), { num: [1, 2, 3, 6, 7, 8, 9] });
  CH.alloc($('allocChart'), W.allocation, 'Workload before and after the proposed reallocation');
  $('allocChart').insertAdjacentHTML('beforeend', '<div class="legend"><span><i style="background:#C8D2CA;border-radius:0"></i>Today</span><span><i style="background:#16233F;border-radius:0"></i>After the proposal</span></div><figcaption>Workload as a share of each person\'s target (aging weight × balance). The proposal moves ' + W.moves + ' accounts, keeping existing owners unless someone is over 115% of target.</figcaption>');

  // ---------- cleaning ----------
  var q = W.quality;
  $('cleanLead').textContent = 'The customer master export has ' + q.read + ' rows with the usual problems: phones in five formats, typos in email domains, "Calif" for California, ZIP+4, dates as serial numbers, lower-case IDs, a name that is just a number. The cleaner fixes what is safe, explains every change, and sends the rest to a fix queue sorted by money owed. The export itself is never changed.';
  $('ba').innerHTML = table(['Field', 'In the export', 'In the clean copy', 'What happened'], W.examples.map(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x[2]) ? [x[0], x[1], new Date(x[2] + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }), x[3].replace(x[2], new Date(x[2] + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }))] : x; }), { cls: 'ba' });
  var en = { EMAIL_BLANK: 'No email address', PHONE_BLANK: 'No phone number', ZIP_BLANK: 'No ZIP', LIMIT_BLANK: 'No credit limit on file', OPEN_DATE_BLANK: 'No account open date', PHONE_INVALID: 'Phone is not a valid US number', NAME_IS_NUMBER: 'Name is only digits', VALUE_IN_WRONG_COLUMN: 'Email typed in the name field', ID_BLANK: 'Row with no account ID', LIMIT_NEGATIVE: 'Negative credit limit', EMAIL_INVALID: 'Email not valid', ZIP_STATE_MISMATCH: 'ZIP outside California', STATE_BLANK: 'No state', ID_DUPLICATE: 'Same account ID twice' };
  var counts = {}; q.issues.forEach(function (x) { counts[x[0]] = x[1]; });
  $('errs').innerHTML = table(['Problem', 'Records', 'Example'], W.errors.map(function (e) { return [en[e[0]] || e[0], counts[e[0]] || 1, (e[1] || '(blank ID)') + (e[2] ? ': ' + e[2] : '')]; }), { num: [1] });
  $('dups').innerHTML = table(['Confidence', 'Accounts', 'Names'], q.dups) + '<p class="small muted">' + K.dups + ' groups found by name + phone, email, or name + ZIP. Shops in a chain that share one AP inbox are not counted as duplicates. Nothing is merged automatically: a person marks same or different.</p>';

  // ---------- controls ----------
  $('checks').innerHTML = W.recon.map(function (r) { return '<li><span class="res' + (r.result === 'FAIL' ? ' fail' : '') + '">' + r.result + '</span><div><b>' + esc(r.name) + '</b><div class="d">' + esc(r.detail) + '</div></div></li>'; }).join('');
  var sv = W.sources;
  $('srcList').innerHTML = [['PowerLink AR export', sv.invoices + ' open invoices'], ['Customer master export', sv.customers + ' rows'], ['Call logs (Google Form)', sv.calls.toLocaleString('en-US') + ' calls'], ['Request sheet from other teams', sv.requests + ' requests'], ['Escalation sheet', sv.escalations + ' items'], ['Chargeback tracker', sv.chargebacks + ' cases'], ['PowerLink alerts by email', sv.alerts + ' messages'], ['Sales and payment history', '12 months']]
    .map(function (x) { return '<li>' + esc(x[0]) + ' <span class="muted">(' + esc(x[1]) + ')</span></li>'; }).join('');

  // ---------- phases ----------
  var u = S.githubUser && S.githubUser !== 'YOUR-USERNAME' ? S.githubUser : null, base = u ? 'https://' + u + '.github.io/' : null;
  var p1 = base ? base + 'westline-collections/' : '#', p2 = base ? base + 'westline-credit-control/' : '#', repo = u ? 'https://github.com/' + u + '/westline-command-center' : '#';
  $('phaseCards').innerHTML = [
    ['Phase 1', 'Collections desk', 'A Google Sheets operating workbook with priority scoring and a ranked work queue, a collections dashboard, a month-end reconciliation SOP, a chargeback root-cause map and a team playbook.', p1, 'Open phase 1'],
    ['Phase 2', 'Credit review and cash forecast', 'A seven-rule risk score for every account, limits sized to how each customer buys, a 13-week cash forecast back-tested against actual cash, and a what-if on tightening credit.', p2, 'Open phase 2'],
    ['Phase 3', 'AR Command Center', 'Automates the desk on top of both: reads the phase 1 workbook in place, cleans the customer master, builds one view of every account, and publishes call lists, credit decisions, chargeback drafts and a management queue after reconciling to the cent.', '#top', 'You are here']]
    .map(function (p) { return '<div><div class="n">' + p[0] + '</div><h3>' + esc(p[1]) + '</h3><p class="small">' + esc(p[2]) + '</p>' + (p[3] === '#top' ? '<span class="tag ok">' + p[4] + '</span>' : '<a href="' + p[3] + '">' + p[4] + '</a>') + '</div>'; }).join('');
  $('links').innerHTML = '<a class="btn primary" href="' + repo + '">See the code and tests</a><a class="btn" href="portfolio.html">All three phases on one page</a>';
  $('foot').innerHTML = 'Westline Auto Parts is fictional and every record is synthetic; the methods are the ones used on a real collections desk.' + (S.authorName ? ' Built by ' + (S.authorLink ? '<a href="' + esc(S.authorLink) + '">' + esc(S.authorName) + '</a>' : esc(S.authorName)) + '.' : '') + ' Data as of ' + esc(nice(W.as_of)) + '.';

  // nav highlight
  var links = [].slice.call(document.querySelectorAll('.bar nav a')), secs = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) links.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id); }); }); }, { rootMargin: '-40% 0px -55% 0px' }); secs.forEach(function (s) { if (s) io.observe(s); }); }
})();
