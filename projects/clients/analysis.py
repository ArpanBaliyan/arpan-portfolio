"""Reproduce the Client handling summary from the supplied CSV."""
import csv, sqlite3
from pathlib import Path
root = Path(__file__).resolve().parent
with (root / 'dataset.csv').open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE clients (client_id TEXT, client TEXT, locations REAL, health TEXT, open_issues REAL, opportunity_usd REAL, stage TEXT, next_action TEXT, central_contact TEXT, review_cadence TEXT, discovery_question TEXT)')
db.executemany('INSERT INTO clients VALUES (?,?,?,?,?,?,?,?,?,?,?)', [[r[k] for k in ['client_id', 'client', 'locations', 'health', 'open_issues', 'opportunity_usd', 'stage', 'next_action', 'central_contact', 'review_cadence', 'discovery_question']] for r in rows])
for row in db.execute((root / 'analysis.sql').read_text()):
    print(row)
