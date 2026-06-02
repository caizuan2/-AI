from functools import wraps
from typing import Any, Callable

from flask import (
    Blueprint,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash

from .db import get_db
from .security import utc_now

bp = Blueprint("auth", __name__)


def admin_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapped_view(*args: Any, **kwargs: Any) -> Any:
        if not session.get("admin_id"):
            return redirect(url_for("auth.login"))
        return view(*args, **kwargs)

    return wrapped_view


@bp.route("/admin/login", methods=["GET", "POST"])
def login() -> str:
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        db = get_db()
        admin = db.execute(
            "SELECT * FROM admins WHERE username = ?",
            (username,),
        ).fetchone()

        if admin and check_password_hash(admin["password_hash"], password):
            session.clear()
            session["admin_id"] = admin["id"]
            session["admin_username"] = admin["username"]
            db.execute(
                "UPDATE admins SET last_login_at = ? WHERE id = ?",
                (utc_now(), admin["id"]),
            )
            db.commit()
            return redirect(url_for("main.dashboard"))

        flash("管理员账号或密码错误。", "error")

    return render_template("login.html")


@bp.post("/admin/logout")
def logout() -> str:
    session.clear()
    return redirect(url_for("auth.login"))
