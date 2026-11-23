"""Reproduce the Performance reviews summary from the supplied CSV."""
import csv, sqlite3
from pathlib import Path
root = Path(__file__).resolve().parent
with (root / 'dataset.csv').open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE reviews (review_id TEXT, agent TEXT, week TEXT, attempts REAL, contacts REAL, promises REAL, followup_pct REAL, quality_pct REAL)')
db.executemany('INSERT INTO reviews VALUES (?,?,?,?,?,?,?,?)', [[r[k] for k in ['review_id', 'agent', 'week', 'attempts', 'contacts', 'promises', 'followup_pct', 'quality_pct']] for r in rows])
for row in db.execute((root / 'analysis.sql').read_text()):
    print(row)
