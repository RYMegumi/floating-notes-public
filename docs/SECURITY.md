# 安全边界

## 当前建议：私有仓库

在公开发布源码或安装包之前，建议 GitHub 仓库保持 **Private**。

原因：

- Git 历史里仍有个人 Windows 路径、测试邮箱等开发痕迹
- Supabase 项目当前允许公开注册，发码限流和滥用防护尚未完成
- 应用未签名，也没有正式的隐私政策、账号删除和备份方案
- 这是一个连接到真实后端的开发版本，不适合作为匿名公共 demo

## 已经做对的部分

- 客户端只使用 Supabase Publishable key
- `service_role` key 不在客户端、源码或 `.env.local` 中
- `.env.local` 被 `.gitignore` 忽略，且没有进入 Git 历史
- `tasks` 和 `notes` 表启用了 RLS，用户只能读写自己的任务和随记
- 邮箱验证码通过 Resend + 自有域名发送
- Resend API Key 只保存在 Supabase SMTP 设置中
- 随记的 DeepSeek API Key 通过 Electron `safeStorage` 加密保存在本机
  `llm-key.bin`，只在主进程使用，不写入设置 JSON，也不上传 Supabase

## 绝对不能提交

- Supabase `service_role` / Secret key
- Resend API Key
- DeepSeek API Key
- 邮箱密码或 Gmail App Password
- Apple Developer 证书、私钥、notarytool 凭据
- 任何用户的真实任务内容或邮箱导出

## 公开仓库前必须完成

1. 清理 Git 历史中的个人路径、邮箱和测试数据
2. 决定是否使用独立于个人项目的 Supabase 项目
3. 关闭公开注册，或加邀请码/白名单/验证码/限流
4. 加隐私政策和账号删除说明
5. 应用签名与公证（至少 macOS；Windows 也应考虑代码签名）
6. 备份与恢复方案
7. 确认没有把真实 `.env.local` 或用户数据提交进仓库

## 客户端密钥说明

Electron 安装包里的 Supabase Publishable key 不是“秘密”，它本来就会分发给
客户端。真正的安全边界是：

- RLS
- 关闭或限制注册
- 服务端限流
- 不在客户端放 service_role key
- 定期检查 Auth / Resend 日志
