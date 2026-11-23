"""Reproduce the Cash flow summary from the supplied CSV."""
import csv, sqlite3
from pathlib import Path
root = Path(__file__).resolve().parent
with (root / 'dataset.csv').open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE cash_flow (week TEXT, receipts_usd REAL, supplier_usd REAL, payroll_usd REAL, refunds_usd REAL, other_usd REAL, owner TEXT, assumption TEXT)')
db.executemany('INSERT INTO cash_flow VALUES (?,?,?,?,?,?,?,?)', [[r[k] for k in ['week', 'receipts_usd', 'supplier_usd', 'payroll_usd', 'refunds_usd', 'other_usd', 'owner', 'assumption']] for r in rows])
for row in db.execute((root / 'analysis.sql').read_text()):
    print(row)
