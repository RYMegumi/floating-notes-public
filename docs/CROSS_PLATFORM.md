# 跨平台开发

## 目标

一个仓库、一个 `main` 分支，同时构建 Windows 和 macOS。

不建立长期并行的 `windows` / `mac` 分支；功能代码只写一份，平台差异集中到
`src/main/platform/`。

## 目录

```text
src/
  shared/            共用类型、排序、Supabase 数据契约
  main/
    index.ts         主进程入口、窗口、IPC、同步
    account.ts       Supabase 登录与同步
    store.ts         本地 JSON 存储
    theme.ts         系统主题和强调色
    platform/
      index.ts       平台层出口
      appearance.ts  acrylic / vibrancy / liquid glass / solid
      glass.ts       macOS 26 NSGlassEffectView（可选原生依赖）
      autoStart.ts   Windows 启动文件夹 / macOS Login Item
      menu.ts        macOS 应用菜单
  preload/           IPC 桥
  renderer/          共用 React UI
```

新增平台差异时，优先放进 `platform/`，不要把 `if (process.platform)` 散落到业务逻辑里。

## 环境变量

构建需要 Supabase 项目配置：

```bash
cp .env.example .env.local
```

在 `.env.local` 填入：

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

`.env.local` 永远不提交。Windows 和 macOS 使用同一套 Supabase 项目与数据库，
账号和同步数据天然互通。

## Windows

在 Windows 上：

```bash
npm ci
npm run build:win
```

产物在 `dist/`。

## macOS

macOS 的 DMG 和签名必须在 macOS 上构建。首次准备：

```bash
npm ci
npm run build:mac:dir   # 先构建未打包的 .app，便于本地调试
```

正式 DMG：

```bash
npm run build:mac
```

默认 target 是 `dmg` + `universal`（Apple Silicon + Intel）。

### 未签名版本

未签名的 `.app` 可以被 Gatekeeper 拦截。自己开发时可以用右键打开，或：

```bash
xattr -dr com.apple.quarantine /path/to/浮笺.app
```

不要把这个做法当作对外分发方案。

### 对外分发

需要 Apple Developer Program：

- Developer ID Application 证书
- hardened runtime
- notarization
- 在 CI 或本机配置签名凭据

没有签名和公证的 Mac 版本只适合自己测试。

## macOS 验证状态

已在 macOS 26.0.1 / Apple Silicon 上验证：

- 原生圆角、阴影、透明内容层；标题栏和红黄绿按钮隐藏
- macOS 26 `NSGlassEffectView` Liquid Glass，旧系统回退 `vibrancy`
- 菜单栏 template image（18pt / 36px @2x），左键切换窗口、右键菜单
- Dock 图标隐藏（`LSUIElement`），关闭窗口收进菜单栏
- macOS 应用菜单、`Cmd+N` / `Cmd+,` / `Cmd+W` / `Cmd+Q`
- SF Pro / PingFang SC 字体、浅色/深色玻璃样式
- `npm run test:ui`（38 项）、`npm run test:layout`（6 项）、`npm run test:mac`（13 项）、`npm run test:notes`（42 项）
- `electron-builder --mac --dir --arm64` 打包产物启动与原生玻璃验证

仍需补齐：

- Intel / universal 包实机验证
- Developer ID 签名与公证
- 菜单栏图标的长期视觉回归（不同菜单栏图标密度/深浅壁纸）
- 开机自启在签名正式包中的 Login Item 验证

## CI

`.github/workflows/ci.yml` 会在 Windows 和 macOS 上执行：

```bash
npm ci
npm run build
```

这保证同一份源码在两个平台都能通过类型检查和构建。发布打包可以后续再加
签名和上传 artifact 的 job。

## Git

- 功能开发：`feat/...` 分支
- 合并回 `main`
- 发布：在 `main` 上打同一个 tag
- 产物：同一个 tag 下放 Windows 和 macOS 文件
- 不提交 `node_modules`、`dist`、`out`、`.env.local`、签名证书
