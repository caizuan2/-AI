from flask import Flask

from .auth import bp as auth_bp
from .config import Config
from .db import close_db, init_db
from .routes import bp as main_bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    app.teardown_appcontext(close_db)

    with app.app_context():
        init_db()

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)

    return app
