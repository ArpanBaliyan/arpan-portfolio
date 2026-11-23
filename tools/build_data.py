"""Rebuild the fictional case-study datasets. Python standard library only.
Run from any directory: python tools/build_data.py
No live company data, network access, credentials or paid services are used.
"""
from pathlib import Path
from datetime import date, timedelta
from collections import Counter
import csv, json, random, sqlite3

ROOT = Path(__file__).resolve().parents[1]
RNG = random.Random(73129)
AS_OF = date(2026, 10, 30)
CATALOG = json.loads((ROOT / 'tools/catalog.json').read_text('utf-8'))
YARDS = ['North yard', 'Valley yard', 'Coastal yard', 'Central yard']
AGENTS = ['Maya Chen', 'Jordan Lee', 'Sam Rivera']
TEAMS = ['Client desk', 'Returns', 'Cash application', 'Dispatch', 'Sales', 'Yard team']
FIRST = ['Alder', 'Bluewater', 'Cedar', 'Driftwood', 'Eastbank', 'Fairview', 'Glenrock', 'Harbour', 'Ironwood', 'Juniper', 'Kingsway', 'Lakeside', 'Maple', 'Northstar', 'Oakfield', 'Parkside', 'Quarry', 'Redwood', 'Summit', 'Tidewater']
LAST = ['Auto Body', 'Repair Group', 'Fleet Services', 'Motor Works', 'Collision Centre', 'Parts Network', 'Service Garage', 'Vehicle Care', 'Auto Group']
def pick(seq): return RNG.choice(seq)
def customer(i): return f'{FIRST[i % len(FIRST)]} {LAST[(i // len(FIRST)) % len(LAST)]}'
def dollars(lo, hi): return round(RNG.uniform(lo, hi), 2)
def record(slug, i):
    name = customer(i); owner = AGENTS[i % 3]
    if slug == 'collections':
        status = pick(['Collect', 'Collect', 'Promise due', 'Return check', 'Credit pending', 'Dispute review'])
        return dict(account_id=f'W{i+1:05}', customer=name, yard=YARDS[i % 4], open_usd=dollars(80, 18000), days_from_invoice=RNG.randint(31, 180), status=status, owner=owner, next_action={'Collect':'Confirm the payable balance and request a payment date.', 'Promise due':'Check whether the agreed payment arrived before following up.', 'Return check':'Confirm open pickup and delivery-ticket status.', 'Credit pending':'Obtain the scan reference and request the credit memo.', 'Dispute review':'Pause the disputed ask and reconcile the evidence.'}[status])
    if slug == 'chargebacks':
        reason = pick(['Refund not received', 'Merchandise not received', 'Not as described', 'Duplicate processing'])
        return dict(case_id=f'DS-{i+1:04}', customer=name, amount_usd=dollars(95, 6200), reason=reason, status=pick(['Research', 'Evidence ready', 'Submitted', 'Won', 'Accepted refund', 'Lost']), days_to_deadline=RNG.randint(-2, 14), root_cause=pick(['Credit not raised', 'Pickup delayed', 'Scan missing', 'Refund pending', 'Delivery query', 'Partial credit']), owner=owner,
                    evidence_required={'Refund not received':['Return approval', 'Credit memo', 'Refund transaction reference'], 'Merchandise not received':['Order confirmation', 'Ship-to agreement', 'Proof of delivery'], 'Not as described':['Ordered part specification', 'Dispatch photos', 'Return offer'], 'Duplicate processing':['Both invoice references', 'Transaction references', 'Shipment evidence']}[reason])
    if slug == 'training':
        score=RNG.randint(55,100); module=['Account checks','Customer conversations','Follow-up discipline','Escalation practice'][i%4]
        return dict(assessment_id=f'TR-{i+1:04}', learner=['Alex Morgan','Riley Park','Taylor Quinn','Casey Brooks'][(i//4)%4], week=i%4+1, module=module, score_pct=score, pass_mark_pct=80, coach=owner, next_action='Supervised practice and re-assessment' if score<80 else 'Progress to the next practical demonstration')
    if slug == 'audits':
        critical=RNG.random()<.06
        return dict(audit_id=f'QA-{i+1:04}', agent=owner, sample_type=pick(['Random','Escalation','High exposure','New colleague']), score_pct=RNG.randint(58,98), critical_failure='Yes' if critical else 'No', finding='Sensitive information handling needs immediate review' if critical else pick(['Follow-up date not confirmed','Return check not documented','Clear explanation and accurate next step','Payment commitment not read back','Evidence linked correctly']), owner=owner, status=pick(['Open','Coaching booked','Rechecked','Closed']))
    if slug == 'clients':
        health=pick(['Stable','Watch','Service recovery']); issues=0 if health=='Stable' else RNG.randint(1,6)
        return dict(client_id=f'CL-{i+1:04}',client=name,locations=RNG.randint(2,45),health=health,open_issues=issues,opportunity_usd=dollars(5000,85000),stage=pick(['Discovery','Qualified','Proposal','On hold']),next_action='Resolve the service issue with a named owner before discussing expansion.' if issues else 'Arrange a discovery conversation about branch coverage.', central_contact=f'Contact {i+1:03}',review_cadence='Monthly',discovery_question='Which branches have the most difficulty getting the right part at the right time?')
    if slug == 'customer-data':
        issue=pick(['Possible duplicate','Missing email','Invalid phone','Name inconsistency','Missing owner','Postal code format'])
        return dict(record_id=f'DQ-{i+1:04}',customer=name,account_id=f'W{i+1:05}',issue=issue,severity=pick(['High','Medium','Low']),proposed_fix={'Possible duplicate':'Compare address, tax reference and account history before merging.','Missing email':'Confirm the correct accounts-payable contact.','Invalid phone':'Verify against a known contact channel.','Name inconsistency':'Standardise display name and preserve original text.','Missing owner':'Assign the responsible relationship owner.','Postal code format':'Preserve as text and confirm the five-digit format.'}[issue],owner=owner,status=pick(['Review','Approved','Applied','Deferred']),severity_points=RNG.randint(1,3))
    if slug == 'operations':
        stage=pick(['Return approved','Pickup','Yard scan','Credit memo','Refund']); target={'Return approved':4,'Pickup':72,'Yard scan':24,'Credit memo':48,'Refund':48}[stage]; elapsed=RNG.randint(1,target*3)
        return dict(ticket_id=f'OP-{i+1:04}',customer=name,stage=stage,elapsed_hours=elapsed,target_hours=target,owner={'Return approved':'Client desk','Pickup':'Dispatch','Yard scan':'Yard team','Credit memo':'Returns','Refund':'Cash application'}[stage],status='Overdue' if elapsed>target else 'Within target',next_action='Confirm the missing hand-off evidence and agree a completion time.' if elapsed>target else 'Monitor the next hand-off.')
    if slug == 'cash-flow':
        return dict(week=(AS_OF+timedelta(days=3+7*i)).isoformat(),receipts_usd=dollars(58000,88000),supplier_usd=dollars(33000,49000),payroll_usd=16500 if i%2==0 else 0,refunds_usd=dollars(1000,5500),other_usd=dollars(3500,7500),owner='Planning desk',assumption='Illustrative receipts and commitments; not a predictive claim.')
    if slug == 'reviews':
        attempts=RNG.randint(220,420); contacts=RNG.randint(80,min(190,attempts))
        return dict(review_id=f'RV-{i+1:04}',agent=owner,week=(AS_OF-timedelta(days=7*(i//3))).isoformat(),attempts=attempts,contacts=contacts,promises=RNG.randint(20,min(70,contacts)),followup_pct=RNG.randint(65,99),quality_pct=RNG.randint(72,98))
    if slug == 'meetings':
        topic=pick(['Delayed refunds','Client reconciliation','Contact data quality','Broken promises','New colleague ramp','Branch expansion'])
        return dict(action_id=f'MT-{i+1:04}',meeting=pick(['Weekly operations review','Client account review','Team coaching','Monthly management review']),topic=topic,decision={'Delayed refunds':'Approve a daily refund exception review.','Client reconciliation':'Use one consolidated branch statement.','Contact data quality':'Verify missing AP contacts this week.','Broken promises':'Review contact and promise evidence before escalation.','New colleague ramp':'Add supervised practice on return checks.','Branch expansion':'Complete discovery before issuing a proposal.'}[topic],owner=pick(TEAMS),due_date=(AS_OF+timedelta(days=RNG.randint(-10,14))).isoformat(),status=pick(['Open','In progress','Blocked','Done']),priority=pick(['High','Medium','Low']),priority_points=RNG.randint(1,3))

def write_json(p, obj):
    p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')

database=ROOT/'data/portfolio.sqlite'; database.parent.mkdir(exist_ok=True)
db=sqlite3.connect(database)
for project in CATALOG:
    slug=project['id']; rows=[record(slug,i) for i in range(project['records'])]
    directory=ROOT/'projects'/slug; directory.mkdir(parents=True,exist_ok=True)
    fields=project['fields']+[k for k in rows[0] if k not in project['fields']]
    write_json(directory/'data.json',rows)
    with (directory/'dataset.csv').open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows({k:json.dumps(v) if isinstance(v,list) else v for k,v in row.items()} for row in rows)
    table=slug.replace('-','_'); db.execute(f'DROP TABLE IF EXISTS "{table}"')
    types={k:('REAL' if isinstance(rows[0][k],(int,float)) else 'TEXT') for k in fields}
    db.execute(f'CREATE TABLE "{table}" ('+', '.join(f'"{k}" {types[k]}' for k in fields)+')')
    db.executemany(f'INSERT INTO "{table}" VALUES ('+','.join('?' for _ in fields)+')',[[json.dumps(row[k]) if isinstance(row[k],list) else row[k] for k in fields] for row in rows])
    group=project['group']; metric=project['metric']
    aggregate='AVG' if project['unit'] in ['PCT','HOURS'] else 'SUM'
    if project['unit']=='COUNT': select='COUNT(*) AS records'
    else: select=f'COUNT(*) AS records, ROUND({aggregate}("{metric}"),2) AS value'
    query=f'SELECT "{group}", {select}\nFROM "{table}"\nGROUP BY "{group}"\nORDER BY records DESC;'
    (directory/'analysis.sql').write_text('-- Synthetic case-study data. No real company records.\n'+query+'\n',encoding='utf-8')
    results=[dict(zip([c[0] for c in cursor.description],r)) for cursor in [db.execute(query)] for r in cursor.fetchall()]
    (directory/'analysis.py').write_text(f'''"""Reproduce the {project['title']} summary from the supplied CSV."""
import csv, sqlite3
from pathlib import Path
root = Path(__file__).resolve().parent
with (root / 'dataset.csv').open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
db = sqlite3.connect(':memory:')
db.execute({('CREATE TABLE '+table+' ('+', '.join(k+' '+types[k] for k in fields)+')')!r})
db.executemany('INSERT INTO {table} VALUES ({','.join('?' for _ in fields)})', [[r[k] for k in {fields!r}] for r in rows])
for row in db.execute((root / 'analysis.sql').read_text()):
    print(row)
''',encoding='utf-8')
    project['data']=rows;project['sql']=query;project['sqlResults']=results;project['asOf']=AS_OF.isoformat()
    project['dictionary']=[dict(field=k,type=types[k],definition=('US dollars, illustrative amount' if k.endswith('_usd') else 'Percentage points from 0 to 100' if k.endswith('_pct') else k.replace('_',' ').capitalize())) for k in fields]
    write_json(directory/'dictionary.json',project['dictionary'])
    notebook={'cells':[{'cell_type':'markdown','metadata':{},'source':[f'# {project["name"]}\n','Synthetic case study. Run the next cell to reproduce the grouped analysis.']},{'cell_type':'code','execution_count':None,'metadata':{},'outputs':[],'source':['%run analysis.py']}],'metadata':{'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'}},'nbformat':4,'nbformat_minor':5}
    write_json(directory/'analysis.ipynb',notebook)
db.commit(); db.close()
write_json(ROOT/'data/catalog.json',CATALOG)
(ROOT/'assets/data.js').write_text('window.PORTFOLIO = '+json.dumps(CATALOG,ensure_ascii=False)+';\n',encoding='utf-8')
print('Built',len(CATALOG),'case studies,',sum(p['records'] for p in CATALOG),'fictional records, CSVs, SQL, notebooks and SQLite.')
