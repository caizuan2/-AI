import csv
import io
from datetime import datetime, time, timezone
from typing import Any

from flask import (
    Blueprint,
    Response,
    current_app,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    url_for,
)

from .auth import admin_required
from .db import get_db
from .security import (
    generate_license_code,
    hash_license_code,
    is_expired,
    is_valid_code_format,
    mask_license_code,
    normalize_code,
    utc_now,
)

bp = Blueprint("main", __name__)

STATUS_LABELS = {
    "unused": "未使用",
    "used": "已使用",
    "disabled": "已禁用",
}


@bp.get("/")
def index() -> str:
    return redirect(url_for("main.activate_page"))


@bp.get("/activate")
def activate_page() -> str:
    return render_template("activate.html")


@bp.get("/admin")
@admin_required
def dashboard() -> str:
    db = get_db()
    stats = {
        "total": db.execute("SELECT COUNT(*) AS value FROM licenses").fetchone()["value"],
        "unused": db.execute(
            "SELECT COUNT(*) AS value FROM licenses WHERE status = 'unused'"
        ).fetchone()["value"],
        "used": db.execute(
            "SELECT COUNT(*) AS value FROM licenses WHERE status = 'used'"
        ).fetchone()["value"],
        "disabled": db.execute(
            "SELECT COUNT(*) AS value FROM licenses WHERE status = 'disabled'"
        ).fetchone()["value"],
        "activations": db.execute(
            "SELECT COUNT(*) AS value FROM activation_records"
        ).fetchone()["value"],
    }
    recent = db.execute(
        """
        SELECT ar.user_id, ar.activated_at, l.code_mask
        FROM activation_records ar
        JOIN licenses l ON l.id = ar.license_id
        ORDER BY ar.activated_at DESC
        LIMIT 8
        """
    ).fetchall()
    return render_template("dashboard.html", stats=stats, recent=recent)


@bp.route("/admin/licenses", methods=["GET"])
@admin_required
def licenses() -> str:
    status = request.args.get("status", "").strip()
    db = get_db()

    if status in STATUS_LABELS:
        rows = db.execute(
            """
            SELECT * FROM licenses
            WHERE status = ?
            ORDER BY created_at DESC
            LIMIT 500
            """,
            (status,),
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT * FROM licenses
            ORDER BY created_at DESC
            LIMIT 500
            """
        ).fetchall()

    return render_template(
        "licenses.html",
        licenses=rows,
        status=status,
        status_labels=STATUS_LABELS,
    )


@bp.post("/admin/licenses/generate")
@admin_required
def generate_licenses() -> str:
    count_raw = request.form.get("count", "1").strip()
    expires_date = request.form.get("expires_at", "").strip()

    try:
        count = int(count_raw)
    except ValueError:
        flash("生成数量必须是数字。", "error")
        return redirect(url_for("main.licenses"))

    if count < 1 or count > 5000:
        flash("单次生成数量必须在 1 到 5000 之间。", "error")
        return redirect(url_for("main.licenses"))

    expires_at = parse_expiry_date(expires_date)
    if expires_date and not expires_at:
        flash("有效期日期格式不正确。", "error")
        return redirect(url_for("main.licenses"))

    db = get_db()
    generated: list[str] = []
    attempts = 0

    while len(generated) < count:
        attempts += 1
        if attempts > count * 10:
            flash("生成卡密时遇到过多重复，请重新尝试。", "error")
            return redirect(url_for("main.licenses"))

        code = generate_license_code()
        code_hash = hash_license_code(code)
        try:
            db.execute(
                """
                INSERT INTO licenses (code_hash, code_mask, status, expires_at, created_at)
                VALUES (?, ?, 'unused', ?, ?)
                """,
                (code_hash, mask_license_code(code), expires_at, utc_now()),
            )
            generated.append(code)
        except Exception:
            continue

    db.commit()
    return render_template(
        "generated.html",
        codes=generated,
        expires_at=expires_at,
        csv_content=build_plaintext_csv(generated, expires_at),
    )


@bp.post("/admin/licenses/<int:license_id>/disable")
@admin_required
def disable_license(license_id: int) -> str:
    db = get_db()
    license_row = db.execute(
        "SELECT id, status FROM licenses WHERE id = ?",
        (license_id,),
    ).fetchone()

    if not license_row:
        flash("卡密不存在。", "error")
    elif license_row["status"] == "used":
        flash("已使用卡密不能禁用。", "error")
    elif license_row["status"] == "disabled":
        flash("卡密已经是禁用状态。", "info")
    else:
        db.execute(
            "UPDATE licenses SET status = 'disabled' WHERE id = ?",
            (license_id,),
        )
        db.commit()
        flash("卡密已禁用。", "success")

    return redirect(url_for("main.licenses"))


@bp.get("/admin/licenses/export.csv")
@admin_required
def export_licenses() -> Response:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, code_mask, status, expires_at, created_at, used_at, used_by
        FROM licenses
        ORDER BY created_at DESC
        """
    ).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "code_mask", "status", "expires_at", "created_at", "used_at", "used_by"])
    for row in rows:
        writer.writerow(
            [
                row["id"],
                row["code_mask"],
                STATUS_LABELS.get(row["status"], row["status"]),
                row["expires_at"] or "",
                row["created_at"],
                row["used_at"] or "",
                row["used_by"] or "",
            ]
        )

    return csv_response(output.getvalue(), "licenses-export.csv")


@bp.post("/admin/licenses/generated.csv")
@admin_required
def download_generated_csv() -> Response:
    csv_content = request.form.get("csv_content", "")
    return csv_response(csv_content, "generated-license-codes.csv")


@bp.get("/admin/activations")
@admin_required
def activations() -> str:
    db = get_db()
    rows = db.execute(
        """
        SELECT ar.*, l.code_mask
        FROM activation_records ar
        JOIN licenses l ON l.id = ar.license_id
        ORDER BY ar.activated_at DESC
        LIMIT 1000
        """
    ).fetchall()
    return render_template("activations.html", activations=rows)


@bp.post("/api/activate")
def api_activate() -> tuple[Response, int]:
    payload = request.get_json(silent=True) or {}
    raw_code = str(payload.get("code", ""))
    user_id = str(payload.get("user_id", "")).strip()

    if not raw_code.strip() or not user_id:
        return api_error("卡密和用户ID不能为空。", 400)

    code = normalize_code(raw_code)
    if not is_valid_code_format(code):
        return api_error("卡密格式不正确，应为 AIKB-XXXX-XXXX-XXXX。", 400)

    db = get_db()
    code_hash = hash_license_code(code)

    try:
        db.execute("BEGIN IMMEDIATE")
        license_row = db.execute(
            "SELECT * FROM licenses WHERE code_hash = ?",
            (code_hash,),
        ).fetchone()

        if not license_row:
            db.rollback()
            return api_error("卡密不存在。", 404)

        if license_row["status"] == "disabled":
            db.rollback()
            return api_error("卡密已被禁用。", 403)

        if license_row["status"] == "used":
            db.rollback()
            return api_error("卡密已被使用，不能重复激活。", 409)

        if is_expired(license_row["expires_at"]):
            db.rollback()
            return api_error("卡密已过期。", 403)

        now = utc_now()
        db.execute(
            """
            UPDATE licenses
            SET status = 'used', used_at = ?, used_by = ?
            WHERE id = ? AND status = 'unused'
            """,
            (now, user_id, license_row["id"]),
        )
        db.execute(
            """
            INSERT INTO activation_records
                (license_id, user_id, activated_at, ip, user_agent)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                license_row["id"],
                user_id,
                now,
                request.headers.get("X-Forwarded-For", request.remote_addr or ""),
                request.headers.get("User-Agent", ""),
            ),
        )
        db.commit()
    except Exception as error:
        db.rollback()
        current_app.logger.exception("License activation failed: %s", error)
        return api_error("激活失败，请稍后重试。", 500)

    return jsonify({"success": True, "message": "激活成功。"}), 200


def parse_expiry_date(value: str) -> str | None:
    if not value:
        return None
    try:
        date_value = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None
    expiry = datetime.combine(date_value, time(23, 59, 59), timezone.utc)
    return expiry.isoformat()


def build_plaintext_csv(codes: list[str], expires_at: str | None) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["code", "expires_at"])
    for code in codes:
        writer.writerow([code, expires_at or ""])
    return output.getvalue()


def csv_response(content: str, filename: str) -> Response:
    response = Response(content, mimetype="text/csv; charset=utf-8")
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def api_error(message: str, status_code: int) -> tuple[Response, int]:
    return jsonify({"success": False, "message": message}), status_code
