from flask import Blueprint, render_template, session

views_bp = Blueprint('views', __name__)

@views_bp.route('/')
def index():
    """Main application page"""
    return render_template('index.html', user=session.get('user'))

@views_bp.route('/health')
def health():
    """Health check endpoint"""
    return {'status': 'healthy', 'service': 'S3 Manager'}, 200
