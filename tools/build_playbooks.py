"""Create practical decision matrices and reusable handover templates."""
from pathlib import Path
import json,csv,html
from build_pages import shell
ROOT=Path(__file__).resolve().parents[1]
CAT=json.loads((ROOT/'tools/catalog.json').read_text())
MATRICES={
'collections':[
 ['Delivered invoice, no return or credit','Collections specialist','Invoice, delivery status, account statement','Confirm payable amount and agree a payment date.'],
 ['Return request still open','Dispatch and client desk','Return request, pickup booking, delivery-ticket reference','Confirm the return status before the collection ask.'],
 ['Return scanned, no credit posted','Returns owner','Scan reference, original invoice, authorised deductions','Request the credit and tell the customer the next update time.'],
 ['Customer says payment already made','Cash application','Payment date, amount, method and remittance reference','Trace the receipt before requesting a duplicate payment.'],
 ['Multi-location client, branch balances disagree','Relationship owner','Consolidated branch statement and client remittance','Reconcile centrally and avoid duplicate calls to each branch.'],
 ['No response after documented follow-ups','Process owner','Verified contact history and outstanding evidence','Review the escalation route under the actual company policy.']],
'chargebacks':[
 ['Refund is genuinely owed','Refund owner','Return receipt, credit memo, payment history','Complete the approved refund route and record the case outcome.'],
 ['Refund already processed','Case owner','Transaction reference, amount and processing date','Prepare the evidence showing what was refunded and when.'],
 ['Delivery disputed on a broker order','Case owner','Order instructions, agreed ship-to, delivery evidence','Establish the contractual facts before preparing a response.'],
 ['Part specification disputed','Sales and case owner','Ordered specification, dispatch photos, return correspondence','Compare the supplied part with the documented order.'],
 ['Two transactions alleged to be duplicates','Cash application','Both invoice and transaction references','Establish whether there were separate authorised orders.'],
 ['Response deadline unclear','Case owner','Notice and processor correspondence','Obtain the actual deadline from the processor. Do not infer it.']],
'training':[
 ['Days 1–3: account foundations','Coach','Account screen examples and glossary','Identify invoice, statement, delivery and credit records.'],
 ['Days 4–5: collectible-balance checks','Learner with coach','Ten fictional cases and recorded decisions','Explain collect, pause or investigate for each case.'],
 ['Days 6–8: conversation practice','Coach','Call framework and role-play observations','Practise opening, listening, explaining and agreeing the next action.'],
 ['Days 9–10: logging and promises','Learner with coach','Disposition records and payment commitments','Record amount, method, date, owner and follow-up accurately.'],
 ['Days 11–15: supervised desk','Learner','Observed calls and exception handovers','Handle normal follow-ups and route disputes with evidence.'],
 ['Days 16–20: independent demonstration','Coach and process owner','Quality samples, practical test and coaching record','Agree the work the learner can own and the support still needed.']],
'audits':[
 ['Account preparation — 25 points','Reviewer','Delivery, return, credit and account checks','Full: complete preparation. Partial: a non-critical gap. Zero: no usable preparation.'],
 ['Communication — 25 points','Reviewer','Conversation and confirmation of understanding','Full: clear and respectful. Partial: unclear explanation. Zero: misleading or hostile.'],
 ['Payment accuracy — 20 points','Reviewer','Payable amount and commitment read-back','Full: correct ask and confirmation. Partial: incomplete confirmation. Zero: incorrect ask.'],
 ['Follow-up ownership — 15 points','Reviewer','Agreed next action and date','Full: specific action, owner and date. Partial: one missing. Zero: none agreed.'],
 ['Documentation — 15 points','Reviewer','Disposition, notes and evidence references','Full: traceable record. Partial: minor gap. Zero: missing or unusable record.'],
 ['Critical control failure — separate flag','Process owner','Privacy incident or unsafe payment handling evidence','Escalate immediately. A high total score does not cancel this finding.']],
'clients':[
 ['Relationship map','Account owner','Central AP contact, branch stakeholders, decision process','Agree the most efficient contact route and review cadence.'],
 ['Service recovery','Service owner','Issue history, promised update and customer impact','Resolve the operational obstacle before an expansion discussion.'],
 ['Discovery','Account owner','Client need, current coverage, ordering obstacles','Ask which branches and services would be most useful to improve.'],
 ['Qualification','Account owner','Decision maker, buying need, timing and service constraints','Record evidence and unknowns. Do not label an unqualified idea as revenue.'],
 ['Proposal','Sales approver','Scope, terms, fulfilment capacity and approval','Present a realistic offer with a specific next decision.'],
 ['Ongoing review','Relationship owner','Agreed actions, branch performance and client feedback','Close the last commitments before creating the next account plan.']],
'customer-data':[
 ['Account identifier','Data steward','Original export and source account screen','Preserve as text. Never drop leading zeroes.'],
 ['Possible duplicate','Account owner','Address, contact, business identifier and account history','Review the evidence before any merge. Similar names are insufficient.'],
 ['Missing AP contact','Client desk','Customer confirmation through a known channel','Record the confirmed contact, date and person who checked it.'],
 ['Email or phone format','Data steward','Original text and validation rule','Standardise unambiguous formatting. Flag uncertain changes.'],
 ['Name correction','Account owner','Source name, corrected display name and reason','Retain the source value and a traceable correction record.'],
 ['Correction approval','Designated reviewer','Proposed change and supporting evidence','Apply only the approved correction and retain a change log.']],
'operations':[
 ['Return approval to pickup','Client desk to dispatch','Approved return and pickup address','Confirm the booking and tell the customer when to expect it.'],
 ['Pickup to yard receipt','Dispatch to yard team','Pickup reference and returned-part identification','Confirm receipt before closing the transport task.'],
 ['Receipt to scan','Yard team','Physical receipt and scan reference','Record the item against its original order.'],
 ['Scan to credit memo','Returns to accounting','Scan, original invoice and authorised deductions','Raise the credit or state exactly what prevents it.'],
 ['Credit to refund','Accounting to payment owner','Approved credit and original payment reference','Process the approved refund and record the transaction reference.'],
 ['Refund to customer confirmation','Client desk','Refund reference and realistic processing expectation','Explain what has been processed and confirm the customer outcome.']],
'cash-flow':[
 ['Opening cash','Planning owner','Confirmed bank balance at the forecast start','Enter the cash available at the start. Do not substitute open receivables.'],
 ['Receipts','Collections and planning','Expected amount, timing and payment evidence','Separate an expected receipt from cash already received.'],
 ['Supplier payments','Payables','Due dates and approved payment schedule','Include the actual payment timing and any confirmed deferral.'],
 ['Payroll and other commitments','Planning owner','Scheduled cash outflows','Use payment dates, not only expense recognition dates.'],
 ['Refund downside','Refund and planning owners','Approved refunds and unresolved return backlog','Show the effect of higher refund payments explicitly.'],
 ['Forecast review','Planning owner','Forecast and actual receipts by the same week','Explain differences and revise future assumptions without rewriting history.']],
'reviews':[
 ['Activity','Team owner','Attempts within the same period','Discuss workload and account mix before interpreting the number.'],
 ['Contact rate','Team owner','Contacts divided by attempts for the same period','Use the aggregate numerator and denominator, not an average of percentages.'],
 ['Follow-up compliance','Team owner','Due follow-ups and completed follow-ups','Confirm what was due and whether the action happened on time.'],
 ['Quality','Reviewer','Observable call and account-check evidence','Use examples of behaviour rather than personality labels.'],
 ['Coaching agreement','Colleague and coach','One improvement, support and review date','Make the commitment specific enough to observe next week.'],
 ['Follow-through','Coach','Next-period examples and previous commitment','Review the agreed action and adjust support before setting another target.']],
'meetings':[
 ['Weekly operations review','Process owner','Overdue hand-offs, refund queue, blocked actions','Resolve dependencies and assign completion dates.'],
 ['Client account review','Relationship owner','Branch summary, service issues, agreed commitments','Confirm the relationship outcome and next joint action.'],
 ['Team coaching','Coach and colleague','Work samples and previous coaching agreement','Agree one useful behaviour and the support needed.'],
 ['Monthly management review','Process owner','Trends, exceptions and decisions needing approval','Explain the issue, options and requested decision.'],
 ['Decision record','Meeting owner','What was approved, declined or deferred','Record the rationale and any condition on the decision.'],
 ['Action follow-through','Action owner','Evidence of completion or dependency','Close with an outcome or escalate the actual blocker.']]
}
for p in CAT:
    slug=p['id'];rows=MATRICES[slug];directory=ROOT/'projects'/slug
    with (directory/'handover-template.csv').open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.writer(f);w.writerow(['reference','situation','evidence','decision_required','next_action','owner','due_date','dependency','status','outcome_confirmation']);w.writerow(['EXAMPLE-001',rows[0][0],rows[0][2],p['decision'],rows[0][3],rows[0][1],'2026-11-02','Confirm the source evidence','Open','Awaiting confirmation'])
    matrix=''.join('<tr>'+''.join('<td class="long">'+html.escape(v)+'</td>' for v in row)+'</tr>' for row in rows)
    content=f'''<main id="main" class="wrap section"><div class="breadcrumbs"><a href="index.html">{html.escape(p['title'])}</a><span>/</span><span>Fieldbook</span></div><p class="eyebrow">Practical decisions and handovers</p><h1 style="font-size:clamp(2.6rem,5vw,4rem);margin:20px 0">{html.escape(p['name'])}</h1><p class="muted">{html.escape(p['approach'])}</p><div class="actions"><button class="button primary" onclick="window.print()">Print the fieldbook</button><a class="button" href="handover-template.csv" download>Download handover template</a><a class="button" href="index.html">Open the workspace</a></div><section class="section"><h2>Decision and ownership matrix</h2><p class="data-note">Illustrative portfolio procedure. Apply the actual employer's authority, terms and evidence requirements when using a similar process.</p><div class="workspace"><div class="table-scroll" style="max-height:none"><table style="white-space:normal"><thead><tr><th>Situation or criterion</th><th>Owner</th><th>Evidence</th><th>Decision or next step</th></tr></thead><tbody>{matrix}</tbody></table></div></div></section><section class="study-section"><h2>Before handing the work over</h2><ul class="method-list"><li>State the reference and customer issue clearly enough that the next person can identify the record.</li><li>Attach or link the evidence. Separate a confirmed fact from something that still needs checking.</li><li>Ask for a specific decision or action. Explain which customer or operational outcome it enables.</li><li>Confirm the owner, due date and dependency. Keep the original customer commitment visible.</li><li>Close the loop with the customer or referring team after the outcome is confirmed.</li></ul><h2>Questions for a review conversation</h2><div class="overview-columns"><div><h3>Understand the decision</h3><p>What is known? What is still uncertain? What could make the current action wrong? Who has the authority to decide?</p></div><div><h3>Improve the next hand-off</h3><p>What evidence was missing? Where did time pass without ownership? What check or clearer agreement would prevent a repeat?</p></div></div><p class="data-note" style="margin-top:30px">Fictional examples support a discussion of method. These are not claims of measured employer outcomes.</p></section></main>'''
    (directory/'playbook.html').write_text(shell(p['name']+' fieldbook',content,'../../'),encoding='utf-8')
print('Built ten decision fieldbooks and ten reusable handover templates.')
