from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import socket
import ssl
import sys

HOST = "0.0.0.0"
PORT = 8080

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
CERT_FILE = SCRIPT_DIR / "192.168.15.5+2.pem"
KEY_FILE = SCRIPT_DIR / "192.168.15.5+2-key.pem"
SITE_DIR = PROJECT_ROOT

IGNORED_SOCKET_ERRORS = (
    BrokenPipeError,
    ConnectionAbortedError,
    ConnectionResetError,
    ssl.SSLEOFError,
    ssl.SSLZeroReturnError,
)


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        _, exc, _ = sys.exc_info()
        if isinstance(exc, IGNORED_SOCKET_ERRORS):
            return
        super().handle_error(request, client_address)



def get_local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except Exception:
        return "127.0.0.1"


if not CERT_FILE.exists():
    raise FileNotFoundError(f"Certificado não encontrado: {CERT_FILE}")

if not KEY_FILE.exists():
    raise FileNotFoundError(f"Chave privada não encontrada: {KEY_FILE}")

if not SITE_DIR.exists():
    raise FileNotFoundError(f"Pasta do site não encontrada: {SITE_DIR}")

handler_class = partial(NoCacheHandler, directory=str(SITE_DIR))
httpd = QuietThreadingHTTPServer((HOST, PORT), handler_class)

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile=str(CERT_FILE), keyfile=str(KEY_FILE))
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

local_ip = get_local_ip()

print("HTTPS local rodando em:")
print(f"  https://localhost:{PORT}")
print(f"  https://127.0.0.1:{PORT}")
print(f"  https://{local_ip}:{PORT}")
print(f"Servindo arquivos de: {SITE_DIR}")
print(f"Usando certificado: {CERT_FILE}")
print("Pra testar no Meta Quest, abre a URL com o IP da rede local.")

httpd.serve_forever()
