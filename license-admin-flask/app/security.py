import hashlib
import re
import secrets
from datetime import datetime, timezone


LICENSE_PREFIX = "AIKB"
LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
LICENSE_PATTERN = re.compile(r"^AIKB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_code(code: str) -> str:
    cleaned = re.sub(r"\s+", "", code.strip().upper())
    if cleaned.startswith(LICENSE_PREFIX) and "-" not in cleaned:
        return f"{cleaned[:4]}-{cleaned[4:8]}-{cleaned[8:12]}-{cleaned[12:16]}"
    return cleaned


def is_valid_code_format(code: str) -> bool:
    return bool(LICENSE_PATTERN.fullmatch(normalize_code(code)))


def generate_license_code() -> str:
    groups = [
        "".join(secrets.choice(LICENSE_ALPHABET) for _ in range(4))
        for _ in range(3)
    ]
    return f"{LICENSE_PREFIX}-{'-'.join(groups)}"


def hash_license_code(code: str) -> str:
    normalized = normalize_code(code)
    return hashlib.sha256(f"aikb-license:{normalized}".encode("utf-8")).hexdigest()


def mask_license_code(code: str) -> str:
    normalized = normalize_code(code)
    return f"AIKB-****-****-{normalized[-4:]}"


def is_expired(expires_at: str | None) -> bool:
    if not expires_at:
        return False
    try:
        expiry = datetime.fromisoformat(expires_at)
    except ValueError:
        return True
    return expiry < datetime.now(timezone.utc)
