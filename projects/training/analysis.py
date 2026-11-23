"""Reproduce the Team training summary from the supplied CSV."""
import csv, sqlite3
from pathlib import Path
root = Path(__file__).resolve().parent
with (root / 'dataset.csv').open(encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE training (assessment_id TEXT, learner TEXT, week REAL, module TEXT, score_pct REAL, pass_mark_pct REAL, coach TEXT, next_action TEXT)')
db.executemany('INSERT INTO training VALUES (?,?,?,?,?,?,?,?)', [[r[k] for k in ['assessment_id', 'learner', 'week', 'module', 'score_pct', 'pass_mark_pct', 'coach', 'next_action']] for r in rows])
for row in db.execute((root / 'analysis.sql').read_text()):
    print(row)
