"""Optional Python/SQLite service for the portfolio. No third-party packages.

Local: python tools/server.py
Container: docker build -t arpan-portfolio . && docker run -p 8080:8080 arpan-portfolio
The GitHub Pages edition does not require this service.
"""
import json, os, sqlite3
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
CATALOG=json.loads((ROOT/'data/catalog.json').read_text('utf-8'))
PROJECTS={p['id']:p for p in CATALOG}
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
    def do_GET(self):
        path=urlsplit(self.path).path.rstrip('/')
        if path=='/api/health':return self.respond({'status':'ok','data':'synthetic','projects':len(PROJECTS)})
        if path=='/api/projects':return self.respond([{k:p[k] for k in ['id','title','name','summary','strength']} for p in CATALOG])
        if path.startswith('/api/projects/'):
            p=PROJECTS.get(path.split('/')[-1]);return self.respond(p['data'] if p else {'error':'Unknown project'},200 if p else 404)
        if path.startswith('/api/analysis/'):
            p=PROJECTS.get(path.split('/')[-1])
            if not p:return self.respond({'error':'Unknown project'},404)
            # Queries are fixed build-time statements, selected by a whitelist.
            with sqlite3.connect(f'file:{ROOT / "data/portfolio.sqlite"}?mode=ro',uri=True) as db:
                db.row_factory=sqlite3.Row;rows=[dict(r) for r in db.execute(p['sql'])]
            return self.respond(rows)
        if path.startswith('/api/'):return self.respond({'error':'Endpoint not found'},404)
        return super().do_GET()
    def respond(self,obj,status=200):
        body=json.dumps(obj).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)
if __name__=='__main__':
    port=int(os.environ.get('PORT','8080'));host=os.environ.get('HOST','127.0.0.1')
    print(f'Portfolio preview: http://{host}:{port}',flush=True)
    ThreadingHTTPServer((host,port),Handler).serve_forever()
