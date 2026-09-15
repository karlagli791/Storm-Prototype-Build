"""Tiny local receiver for in-page captures: POST /save?name=foo.jpg with a data URL body.
usage: python save_server.py <out_dir> [port=5199]"""
import sys, os, base64
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
out = sys.argv[1]; port = int(sys.argv[2]) if len(sys.argv) > 2 else 5199
os.makedirs(out, exist_ok=True)
class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        q = parse_qs(urlparse(self.path).query); name = os.path.basename(q.get('name', ['capture.png'])[0])
        body = self.rfile.read(int(self.headers.get('Content-Length', '0'))).decode()
        data = base64.b64decode(body.split(',', 1)[1] if ',' in body else body)
        open(os.path.join(out, name), 'wb').write(data)
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b'ok')
        print('saved', name, len(data), flush=True)
    def log_message(self, *a): pass
HTTPServer(('127.0.0.1', port), H).serve_forever()
