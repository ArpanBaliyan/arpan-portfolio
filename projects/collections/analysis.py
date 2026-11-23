"""Reproduce the Collections summary from the supplied CSV."""
import csv, sqlite3
from pathlib import Path
root = Path(__file__).resolve().parent
with (root / 'dataset.csv').open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE collections (account_id TEXT, customer TEXT, yard TEXT, open_usd REAL, days_from_invoice REAL, status TEXT, owner TEXT, next_action TEXT)')
db.executemany('INSERT INTO collections VALUES (?,?,?,?,?,?,?,?)', [[r[k] for k in ['account_id', 'customer', 'yard', 'open_usd', 'days_from_invoice', 'status', 'owner', 'next_action']] for r in rows])
for row in db.execute((root / 'analysis.sql').read_text()):
    print(row)
