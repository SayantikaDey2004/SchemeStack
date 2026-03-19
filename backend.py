from flask import Flask
from flask_cors import CORS
from routes.schemes import schemes_bp

app = Flask(__name__)
CORS(app) 

app.register_blueprint(schemes_bp)

if __name__ == "__main__":
    app.run(debug=True)