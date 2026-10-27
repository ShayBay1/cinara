# Serves the exported web app (dist/) with single-page fallback, so /admin and other routes load.
import http.server, os, socketserver, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path):
            self.path = '/index.html'
        return super().send_head()
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('', PORT), H) as s:
    print(f'Snippets is running at http://localhost:{PORT}  (admin: http://localhost:{PORT}/admin)  Close this window to stop.')
    s.serve_forever()
