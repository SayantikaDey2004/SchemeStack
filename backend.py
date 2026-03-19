from flask import Flask
from routes.schemes import schemes_bp

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False

# Simple CORS header support
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

app.register_blueprint(schemes_bp)

if __name__ == "__main__":
    app.run(debug=True)