"""Reproduce the Customer database summary from the supplied CSV."""
import csv, sqlite3
from pathlib import Path
root = Path(__file__).resolve().parent
with (root / 'dataset.csv').open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE customer_data (record_id TEXT, customer TEXT, account_id TEXT, issue TEXT, severity TEXT, proposed_fix TEXT, owner TEXT, status TEXT, severity_points REAL)')
db.executemany('INSERT INTO customer_data VALUES (?,?,?,?,?,?,?,?,?)', [[r[k] for k in ['record_id', 'customer', 'account_id', 'issue', 'severity', 'proposed_fix', 'owner', 'status', 'severity_points']] for r in rows])
for row in db.execute((root / 'analysis.sql').read_text()):
    print(row)
