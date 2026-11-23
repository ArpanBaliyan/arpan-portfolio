"""Reproduce the Meetings summary from the supplied CSV."""
import csv, sqlite3
from pathlib import Path
root = Path(__file__).resolve().parent
with (root / 'dataset.csv').open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE meetings (action_id TEXT, meeting TEXT, topic TEXT, decision TEXT, owner TEXT, due_date TEXT, status TEXT, priority TEXT, priority_points REAL)')
db.executemany('INSERT INTO meetings VALUES (?,?,?,?,?,?,?,?,?)', [[r[k] for k in ['action_id', 'meeting', 'topic', 'decision', 'owner', 'due_date', 'status', 'priority', 'priority_points']] for r in rows])
for row in db.execute((root / 'analysis.sql').read_text()):
    print(row)
