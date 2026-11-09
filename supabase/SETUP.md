# Supabase 初始化

项目 URL 和 Publishable key 已经放在项目根目录的 `.env.local`，不要提交这个文件。

## 1. 建表

打开 Supabase Dashboard → **SQL Editor** → New query。

依次运行两个迁移：

1. [`migrations/001_tasks.sql`](migrations/001_tasks.sql)
2. [`migrations/002_notes.sql`](migrations/002_notes.sql)

正常结果：`Success. No rows returned`。

然后到 **Table Editor**，应该能看到 `public.tasks` 和 `public.notes`，两张表都开启 RLS。

## 2. 开启邮箱验证码登录

Supabase Dashboard → **Authentication** → **Providers** → **Email**。

- 确认 Email 已启用
- 生产环境使用 Resend 自定义 SMTP：
  - Host：`smtp.resend.com`
  - Port：`465`
  - Username：`resend`
  - Password：Resend API Key
  - Sender：`noreply@fujian.fyi`
- 域名在 Resend 中通过 DNS 验证后才能发信

## 3. 确认邮件里显示的是 6 位验证码

Supabase Dashboard → **Authentication** → **Email Templates** → **Magic Link**。

模板正文里要包含：

```text
{{ .Token }}
```

否则邮件里只有登录链接，没有可以直接输入的 6 位数字验证码。

## 4. 第一次测试

用你自己的测试邮箱作为收件邮箱（不要提交到仓库）。

在 Resend → Emails 里确认状态为 `Delivered`。  
如果收不到，先检查垃圾邮件；仍收不到再检查 SMTP 配置和 Resend 日志。

## 安全边界

- 客户端只用 **Publishable key**
- **不要**把 Secret key / `service_role` 放进 Electron 或 `.env.local`
- `tasks` 和 `notes` 表必须保持 RLS 开启
- 公开注册前还要做发码限流、邀请码/验证码、备份和隐私政策
