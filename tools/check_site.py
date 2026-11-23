"""One bounded build check: records, references and analysis reproducibility."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote,urlsplit
import json,sqlite3,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
class Links(HTMLParser):
    def __init__(self):super().__init__();self.urls=[]
    def handle_starttag(self,tag,attrs):
        for key,value in attrs:
            if key in ['src','href'] and value:self.urls.append(value)
errors=[];count=0
for f in [ROOT/'index.html',*ROOT.glob('projects/*/*.html')]:
    p=Links();p.feed(f.read_text('utf-8'))
    for url in p.urls:
        u=urlsplit(url)
        if u.scheme or u.netloc or not u.path:continue
        target=(f.parent/unquote(u.path)).resolve()
        if not target.exists():errors.append(f'{f.relative_to(ROOT)}: missing {url}')
    count+=1
catalog=json.loads((ROOT/'data/catalog.json').read_text('utf-8'))
with sqlite3.connect(ROOT/'data/portfolio.sqlite') as db:
    for p in catalog:
        assert db.execute(f'SELECT COUNT(*) FROM "{p["id"].replace("-","_")}"').fetchone()[0]==p['records']
        assert len(p['data'])==p['records']
        result=subprocess.run([sys.executable,str(ROOT/'projects'/p['id']/'analysis.py')],capture_output=True,text=True)
        if result.returncode:errors.append(p['id']+': analysis did not run')
if errors:raise SystemExit('\n'.join(errors))
print(f'PASS: {count} authored pages, 10 data tables, 10 reproducible Python/SQL analyses, and local resource links.')
