import http.server
import socketserver

PORT = 8000

class SecurityHeadersHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Mandatory headers for SharedArrayBuffer (SQLite WASM / OPFS)
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        # Handle React routing by serving index.html for 404s
        super().end_headers()

    def do_GET(self):
        # Basic SPA routing: if file doesn't exist, serve index.html
        import os
        path = self.translate_path(self.path)
        if not os.path.exists(path) and "." not in self.path:
            self.path = "/index.html"
        return super().do_GET()

if __name__ == "__main__":
    import os
    # Ensure we serve from the build directory
    build_dir = os.path.join(os.getcwd(), "scf-client", "dist")
    if not os.path.exists(build_dir):
        print(f"Error: {build_dir} not found. Run 'npm run build' inside scf-client first.")
    else:
        os.chdir(build_dir)
        with socketserver.TCPServer(("", PORT), SecurityHeadersHandler) as httpd:
            print(f"Serving SCF Editor at http://localhost:{PORT}")
            print("Security headers (COOP/COEP) enabled.")
            httpd.serve_forever()
