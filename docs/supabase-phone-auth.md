# Supabase 手机号 OTP 认证配置

项目已切换为 Supabase Phone Auth。注册和登录都通过短信验证码完成。

## 1. 进入 Supabase Dashboard

```text
Supabase Dashboard -> 你的项目
```

## 2. 启用 Phone Provider

进入：

```text
Authentication -> Sign In / Providers -> Phone
```

开启 Phone provider。

## 3. 配置 SMS Provider

如果没有配置短信服务商，验证码无法发送。

如果使用 Twilio，需要填写：

```text
Account SID
Auth Token
Messaging Service SID
```

保存后建议先在 Supabase Dashboard 里测试短信发送。

## 4. URL Configuration

进入：

```text
Authentication -> URL Configuration
```

填写：

```text
Site URL:
https://stately-sawine-1efd4d.netlify.app

Redirect URLs:
https://stately-sawine-1efd4d.netlify.app/**
http://localhost:3000/**
```

## 5. 手机号格式

Supabase Phone Auth 要求 E.164 格式，例如：

```text
+8613812345678
```

当前项目会把 11 位中国手机号自动转换为 E.164：

```text
13812345678 -> +8613812345678
```

## 6. 登录注册流程

注册：

```ts
supabase.auth.signInWithOtp({
  phone,
  options: {
    shouldCreateUser: true
  }
});
```

登录：

```ts
supabase.auth.signInWithOtp({
  phone,
  options: {
    shouldCreateUser: false
  }
});
```

验证：

```ts
supabase.auth.verifyOtp({
  phone,
  token,
  type: "sms"
});
```

## 7. 排障

- 验证码无法发送：检查 Phone provider 是否开启、SMS Provider 是否配置、Twilio 凭据是否正确。
- 手机号登录后没有进入工作台：检查用户是否已获得 `betaAccess`。
- 管理员无法访问 `/admin`：检查 `ADMIN_PHONES`、`ADMIN_EMAILS` 或 `ADMIN_USER_IDS` 是否配置。
