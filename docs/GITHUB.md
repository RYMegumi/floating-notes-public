# GitHub 仓库与推送

## 先建私有仓库

建议仓库名：`floating-notes`，可见性选 **Private**。

创建时不要勾选 README、`.gitignore` 或 License，保持空仓库，避免第一次 push 冲突。

## 当前 Windows 机器的状态

- 已安装 Git，本地仓库已存在
- 还没有 remote
- 还没有 `gh` CLI
- 还没有 SSH key
- Git credential helper 未配置

所以现在不能直接 push。先选一种认证方式。

## 方式 A：SSH（推荐）

### Windows

```powershell
ssh-keygen -t ed25519 -C "你的邮箱"
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" | Set-Clipboard
```

打开 GitHub → Settings → SSH and GPG keys → New SSH key，把剪贴板内容粘贴进去。

测试：

```powershell
ssh -T git@github.com
```

看到 `Hi <用户名>! You've successfully authenticated` 即可。

如果 22 端口被网络阻断，改用 SSH over 443。编辑
`C:\Users\<你>\.ssh\config`：

```text
Host github.com
  HostName ssh.github.com
  Port 443
  User git
```

再测试：

```powershell
ssh -T github.com
```

### 添加 remote 并推送

在项目根目录：

```bash
git remote add origin git@github.com:<你的用户名>/floating-notes.git
git push -u origin main --tags
```

以后：

```bash
git push
```

### macOS 上拉取

```bash
git clone git@github.com:<你的用户名>/floating-notes.git
cd floating-notes
npm ci
cp .env.example .env.local
# 填入 Supabase URL / Publishable key
npm run build:mac:dir
```

Mac 也需要生成自己的 SSH key 并添加到 GitHub；不要把 Windows 的私钥复制过去。

## 方式 B：HTTPS + Personal Access Token

如果不想配 SSH：

1. GitHub → Settings → Developer settings → Personal access tokens
2. Fine-grained token，只给 `floating-notes` 仓库 `Contents: Read and write`
3. 添加 remote：

```bash
git remote add origin https://github.com/<你的用户名>/floating-notes.git
git push -u origin main --tags
```

第一次 push 会要求登录/token。不要把 token 写进 remote URL，也不要提交到仓库。

如果电脑上装了 Git Credential Manager，它会弹浏览器登录。当前机器没有检测到它，
所以 HTTPS 可能会提示输入用户名和 token。

## 方式 C：GitHub CLI

```powershell
winget install --id GitHub.cli
gh auth login
gh repo create floating-notes --private --source . --remote origin --push
```

这条命令会自动创建私有仓库并 push。

## 推送前检查

```bash
git status
git remote -v
git log --oneline -3
```

确认：

- `.env.local` 没有被 `git status` 列出
- 没有 `dist/`、`out/`、`node_modules/`、签名证书
- 当前分支是 `main`
- 没有把 Resend API Key、Supabase `service_role` key 或邮箱密码放进任何文件

## 如果访问 GitHub 失败

先测 443：

```powershell
Test-NetConnection github.com -Port 443
```

本机当前可以连通 GitHub HTTPS 和 `ssh.github.com:443`。如果以后开启系统代理后
Git 不走代理，可以临时配置：

```bash
git config --global http.proxy http://127.0.0.1:7897
git config --global https.proxy http://127.0.0.1:7897
```

不用代理时记得取消：

```bash
git config --global --unset http.proxy
git config --global --unset https.proxy
```
