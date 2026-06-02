# AI 知识库卡密管理后台

这是一个独立的 Flask 卡密管理后台，用于给 AI 知识库应用生成和验证激活卡密。

## 功能

- 管理员登录
- 批量生成卡密
- 卡密格式：`AIKB-XXXX-XXXX-XXXX`
- 卡密状态：未使用、已使用、已禁用
- 设置卡密有效期
- 导出卡密 CSV
- 查看激活记录
- 公共激活页面
- REST API：`POST /api/activate`
- 管理员密码哈希存储
- 卡密数据库只存 hash，不保存明文
- 防止重复激活

## 项目结构

```text
license-admin-flask/
  app/
    __init__.py
    auth.py
    config.py
    db.py
    routes.py
    security.py
    static/
      css/styles.css
      js/activate.js
    templates/
      activate.html
      activations.html
      base.html
      dashboard.html
      generated.html
      licenses.html
      login.html
  .env.example
  .gitignore
  README.md
  requirements.txt
  run.py
```

## 本地启动

```bash
cd license-admin-flask
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python run.py
```

浏览器打开：

```text
http://127.0.0.1:5000
```

后台登录：

```text
http://127.0.0.1:5000/admin/login
```

默认管理员：

```text
账号：admin
密码：admin123456
```

正式使用前请在 `.env` 中修改管理员密码和密钥。

## 环境变量

```env
SECRET_KEY=change-me-to-a-long-random-string
LICENSE_HASH_SECRET=change-me-and-keep-it-stable
DATABASE_PATH=./data/licenses.sqlite3
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123456
```

说明：

- `SECRET_KEY`：Flask Session 加密密钥。
- `LICENSE_HASH_SECRET`：卡密 HMAC hash 密钥，必须长期保持不变；修改后旧卡密将无法验证。
- `DATABASE_PATH`：SQLite 数据库路径。
- `ADMIN_USERNAME`：默认管理员账号。
- `ADMIN_PASSWORD`：首次初始化数据库时写入的默认管理员密码。

## 生成卡密

1. 登录后台：`/admin/login`
2. 进入“卡密”
3. 输入生成数量和可选有效期
4. 点击“生成卡密”
5. 在结果页立即下载本批明文 CSV

注意：明文卡密只显示一次。数据库中只保存 hash 和脱敏后的卡密展示值。

## 激活卡密

公共页面：

```text
http://127.0.0.1:5000/activate
```

接口：

```http
POST /api/activate
Content-Type: application/json
```

请求：

```json
{
  "code": "AIKB-XXXX-XXXX-XXXX",
  "user_id": "手机号或账号ID"
}
```

成功返回：

```json
{
  "success": true,
  "message": "激活成功。"
}
```

失败返回：

```json
{
  "success": false,
  "message": "卡密已被使用，不能重复激活。"
}
```

## curl 示例

```bash
curl -X POST http://127.0.0.1:5000/api/activate ^
  -H "Content-Type: application/json" ^
  -d "{\"code\":\"AIKB-XXXX-XXXX-XXXX\",\"user_id\":\"13352833702\"}"
```

## 数据库说明

SQLite 会自动初始化，默认路径：

```text
license-admin-flask/data/licenses.sqlite3
```

主要表：

- `admins`：管理员账号
- `licenses`：卡密 hash、脱敏值、状态、有效期、使用人
- `activation_records`：激活记录、用户ID、时间戳、IP、User Agent

## 后续迁移到 MySQL/PostgreSQL

当前项目的数据库操作集中在 `app/db.py` 和 `app/routes.py`。后期可以替换为 SQLAlchemy 或其他 ORM，再将 SQLite 迁移到 MySQL/PostgreSQL。

需要保持的核心安全规则：

- 卡密继续只存 hash
- `LICENSE_HASH_SECRET` 不能丢失
- 激活接口必须使用事务防止重复激活
- 管理员密码继续使用哈希存储
