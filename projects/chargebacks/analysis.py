"""Reproduce the Chargebacks summary from the supplied CSV."""
import csv, sqlite3
from pathlib import Path
root = Path(__file__).resolve().parent
with (root / 'dataset.csv').open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE chargebacks (case_id TEXT, customer TEXT, amount_usd REAL, reason TEXT, status TEXT, days_to_deadline REAL, root_cause TEXT, owner TEXT, evidence_required TEXT)')
db.executemany('INSERT INTO chargebacks VALUES (?,?,?,?,?,?,?,?,?)', [[r[k] for k in ['case_id', 'customer', 'amount_usd', 'reason', 'status', 'days_to_deadline', 'root_cause', 'owner', 'evidence_required']] for r in rows])
for row in db.execute((root / 'analysis.sql').read_text()):
    print(row)
