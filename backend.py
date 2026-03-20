import os
from ipaddress import ip_address
from urllib.parse import urlparse

from flask import Flask, request
from routes.schemes import schemes_bp

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False


def _parse_allowed_origins() -> set:
    raw = os.getenv('CORS_ALLOWED_ORIGINS', '')
    origins = {item.strip() for item in raw.split(',') if item.strip()}
    # Safe defaults for local development when env var is not configured.
    if not origins:
        origins = {
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        }
    return origins


ALLOWED_ORIGINS = _parse_allowed_origins()
ALLOW_VERCEL_PREVIEWS = os.getenv('CORS_ALLOW_VERCEL_PREVIEWS', 'true').strip().lower() == 'true'
ALLOW_PRIVATE_NETWORK = os.getenv('CORS_ALLOW_PRIVATE_NETWORK', 'true').strip().lower() == 'true'


def _is_private_network_host(hostname: str) -> bool:
    if not hostname:
        return False
    if hostname in {'localhost', '127.0.0.1', '::1'}:
        return True

    try:
        return ip_address(hostname).is_private
    except ValueError:
        return False


def _origin_allowed(origin: str) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    if origin.startswith('http://localhost:') or origin.startswith('http://127.0.0.1:'):
        return True
    parsed = urlparse(origin)
    if ALLOW_PRIVATE_NETWORK and _is_private_network_host(parsed.hostname or ''):
        return True
    if ALLOW_VERCEL_PREVIEWS and origin.endswith('.vercel.app'):
        return True
    return False

# Simple CORS header support
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin', '')
    if _origin_allowed(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Vary'] = 'Origin'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    return response

app.register_blueprint(schemes_bp)

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=8000)