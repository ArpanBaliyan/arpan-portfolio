"""Prepare the static public tree without repository metadata or build tools."""
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'public-site'
if DEST.exists():
    if not DEST.resolve().is_relative_to(ROOT):raise ValueError('Unexpected packaging destination')
    shutil.rmtree(DEST)
DEST.mkdir()
for name in ['assets','projects','data','legacy']:
    shutil.copytree(ROOT/name,DEST/name,ignore=shutil.ignore_patterns('*.inspect.ndjson','__pycache__','*.pyc'))
for name in ['index.html','404.html','.nojekyll','project-map.html']:
    if (ROOT/name).exists():shutil.copy2(ROOT/name,DEST/name)
print('Static site packaged in public-site/')
