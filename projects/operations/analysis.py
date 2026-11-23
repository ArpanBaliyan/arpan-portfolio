"""Reproduce the Operations knowledge summary from the supplied CSV."""
import csv, sqlite3
from pathlib import Path
root = Path(__file__).resolve().parent
with (root / 'dataset.csv').open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE operations (ticket_id TEXT, customer TEXT, stage TEXT, elapsed_hours REAL, target_hours REAL, owner TEXT, status TEXT, next_action TEXT)')
db.executemany('INSERT INTO operations VALUES (?,?,?,?,?,?,?,?)', [[r[k] for k in ['ticket_id', 'customer', 'stage', 'elapsed_hours', 'target_hours', 'owner', 'status', 'next_action']] for r in rows])
for row in db.execute((root / 'analysis.sql').read_text()):
    print(row)
