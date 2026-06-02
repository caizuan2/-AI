import sqlite3
from pathlib import Path

from flask import current_app, g
from werkzeug.security import generate_password_hash

from .security import utc_now


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        database_path = Path(current_app.config["DATABASE_PATH"])
        database_path.parent.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(database_path)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")

    return g.db


def close_db(error: object | None = None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_login_at TEXT
        );

        CREATE TABLE IF NOT EXISTS licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code_hash TEXT NOT NULL UNIQUE,
            code_mask TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'unused'
                CHECK (status IN ('unused', 'used', 'disabled')),
            expires_at TEXT,
            created_at TEXT NOT NULL,
            used_at TEXT,
            used_by TEXT
        );

        CREATE TABLE IF NOT EXISTS activation_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            license_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            activated_at TEXT NOT NULL,
            ip TEXT,
            user_agent TEXT,
            FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
        CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON licenses(expires_at);
        CREATE INDEX IF NOT EXISTS idx_activation_user_id ON activation_records(user_id);
        """
    )

    ensure_default_admin(db)
    db.commit()


def ensure_default_admin(db: sqlite3.Connection) -> None:
    username = current_app.config["ADMIN_USERNAME"]
    password = current_app.config["ADMIN_PASSWORD"]
    existing = db.execute(
        "SELECT id FROM admins WHERE username = ?",
        (username,),
    ).fetchone()

    if existing:
        return

    db.execute(
        """
        INSERT INTO admins (username, password_hash, created_at)
        VALUES (?, ?, ?)
        """,
        (username, generate_password_hash(password), utc_now()),
    )
