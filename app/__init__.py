from flask import Flask
from flask_cors import CORS
from config import Config

def create_app(config_class=Config):
    """Application factory pattern"""
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # Enable CORS
    CORS(app, supports_credentials=True)
    
    # Register blueprints
    from app.auth import auth_bp
    from app.s3 import s3_bp
    from app.views import views_bp
    
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(s3_bp, url_prefix='/api/s3')
    app.register_blueprint(views_bp)
    
    return app
