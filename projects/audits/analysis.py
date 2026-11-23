"""Reproduce the Audits summary from the supplied CSV."""
import csv, sqlite3
from pathlib import Path
root = Path(__file__).resolve().parent
with (root / 'dataset.csv').open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE audits (audit_id TEXT, agent TEXT, sample_type TEXT, score_pct REAL, critical_failure TEXT, finding TEXT, owner TEXT, status TEXT)')
db.executemany('INSERT INTO audits VALUES (?,?,?,?,?,?,?,?)', [[r[k] for k in ['audit_id', 'agent', 'sample_type', 'score_pct', 'critical_failure', 'finding', 'owner', 'status']] for r in rows])
for row in db.execute((root / 'analysis.sql').read_text()):
    print(row)
