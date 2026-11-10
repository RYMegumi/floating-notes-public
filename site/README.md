# 浮笺官网

静态站点，部署目标是 **Cloudflare Pages**，不需要服务器。

## Cloudflare Pages

连接公开仓库 `floating-notes-public`：

- Framework preset：`None`
- Build command：留空
- Build output directory：`site`
- Production branch：`main`

然后在 Pages 的 **Custom domains** 里添加：

```text
fujian.fyi
```

域名已经托管在 Cloudflare，按面板提示确认 DNS 即可，HTTPS 会自动签发。

## 安装包

不要把 100MB 的 exe 放进 Pages。安装包放在 GitHub Releases：

```text
https://github.com/RYMegumi/floating-notes-public/releases/latest
```

每个版本打一个 tag，例如 `v1.4.0`，然后在 Release 里上传：

```text
浮笺-1.4.0-win-x64.exe
```

页面上的「下载 Windows 版」和「前往 GitHub 下载」都指向 latest release，发新版本时不需要改网页。

## 本地预览

```bash
python -m http.server 4173 --directory site
```

打开 `http://127.0.0.1:4173/`。

## 域名与网络

```text
访客 → fujian.fyi → Cloudflare Pages（静态 HTML/CSS）
下载按钮 → GitHub Releases（exe）
应用 → Supabase（登录、数据库）
验证码邮件 → Resend
```

没有 VPS、没有 Nginx、没有需要自己维护的服务器进程。
