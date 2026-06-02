import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    SESSION_SECRET = os.environ.get("SESSION_SECRET", "").strip()
    LICENSE_HASH_SECRET = os.environ.get(
        "LICENSE_HASH_SECRET",
        "dev-license-hash-secret-change-me",
    )
    MAIN_APP_DATABASE_URL = (
        os.environ.get("MAIN_APP_DATABASE_URL", "").strip()
        or (
            os.environ.get("DATABASE_URL", "").strip()
            if os.environ.get("DATABASE_URL", "").strip().startswith(("postgres://", "postgresql://"))
            else ""
        )
    )
    DATABASE_PATH = os.environ.get(
        "DATABASE_PATH",
        str(BASE_DIR / "data" / "licenses.sqlite3"),
    )
    ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123456")
