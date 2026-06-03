import secrets
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from flask import current_app

from .security import hash_license_code


class MainAppSyncError(RuntimeError):
    pass


def get_main_app_sync_status() -> dict[str, object]:
    has_database_url = bool(current_app.config.get("MAIN_APP_DATABASE_URL", "").strip())
    has_license_secret = True

    if has_database_url:
        message = "已配置主项目同步，生成的卡密可用于 AI 知识库线上激活页。"
    else:
        message = "未配置 MAIN_APP_DATABASE_URL，当前卡密不能写入线上 Supabase。"

    return {
        "ready": has_database_url,
        "hasDatabaseUrl": has_database_url,
        "hasLicenseSecret": has_license_secret,
        "message": message,
    }


def sync_license_keys_to_main_app(codes: list[str], expires_at: str | None) -> int:
    status = get_main_app_sync_status()

    if not status["ready"]:
        raise MainAppSyncError(str(status["message"]))

    try:
        import psycopg
    except ImportError as error:
        raise MainAppSyncError("缺少 psycopg 依赖，请重新执行 pip install -r requirements.txt。") from error

    database_url = normalize_postgres_url(current_app.config["MAIN_APP_DATABASE_URL"])
    expires_value = parse_timestamp(expires_at)
    inserted = 0

    try:
        with psycopg.connect(database_url) as connection:
            with connection.cursor() as cursor:
                for code in codes:
                    cursor.execute(
                        """
                        INSERT INTO "license_keys" ("id", "keyHash", "status", "expiresAt")
                        VALUES (%s, %s, CAST(%s AS "LicenseKeyStatus"), %s)
                        ON CONFLICT ("keyHash") DO NOTHING
                        """,
                        (
                            make_license_id(),
                            hash_license_code(code),
                            "UNUSED",
                            expires_value,
                        ),
                    )
                    inserted += cursor.rowcount
    except Exception as error:
        raise MainAppSyncError(f"同步到主项目 Supabase 失败：{error}") from error

    return inserted


def make_license_id() -> str:
    return f"lic_{secrets.token_urlsafe(18).replace('-', '').replace('_', '')[:24]}"


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None

    parsed = datetime.fromisoformat(value)

    if parsed.tzinfo:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)

    return parsed


def normalize_postgres_url(url: str) -> str:
    parts = urlsplit(url)
    scheme = "postgresql" if parts.scheme == "postgres" else parts.scheme
    query = dict(parse_qsl(parts.query, keep_blank_values=True))

    # Prisma accepts a few query params that psycopg/libpq doesn't.
    for prisma_only_key in ("pgbouncer", "schema", "connection_limit", "pool_timeout"):
        query.pop(prisma_only_key, None)

    hostname = parts.hostname or ""
    if "supabase" in hostname.lower():
        query.setdefault("sslmode", "require")

    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
