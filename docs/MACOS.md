# macOS 版说明

macOS 版与 Windows 版共用同一套任务模型、本地存储、Supabase 账号和 React 界面，
平台差异集中在 `src/main/platform/`。布局、快捷键逻辑和操作习惯尽量与 Windows
版本保持一致，只替换窗口材质、菜单栏行为和视觉语言。

## 体验

- **无边框、无红黄绿按钮**：使用 AppKit 原生窗口的圆角、阴影和透明内容层，
  隐藏标题栏和交通灯。窗口仍然是普通可交互窗口，不是不可点击的桌面小组件。
- **原生玻璃**：macOS 26 (Tahoe) 使用 `NSGlassEffectView`（Liquid Glass）；
  macOS 13–15 回退到 Electron 的 `vibrancy: under-window`；两者都不可用时回退
  到半透明/纯色外观。
- **菜单栏挂件**：设置 `LSUIElement` 并隐藏 Dock 图标，关闭窗口（`Cmd+W`）会
  收进菜单栏，而不是退出。菜单栏图标左键显示/隐藏窗口，右键打开菜单。
- **macOS 应用菜单**：`Cmd+N` 新建任务，`Cmd+,` 设置与归档，`Cmd+W` 关闭，
  `Cmd+Q` 退出，`Cmd+H` 隐藏应用。渲染层也处理 `Cmd+N` / `Cmd+,`，避免合成
  键盘事件或菜单快捷键在测试环境中失效。
- **布局不变**：仍然是 408px 宽、按内容自动调整高度、右键任务、专注模式、
  归档、置顶、主题切换。只把字体换成 SF Pro / PingFang SC，并调整玻璃透明度、
  圆角内的留白和控件尺寸。

## 关键实现

| 文件 | 作用 |
| --- | --- |
| `src/main/platform/appearance.ts` | 窗口材质、macOS 26 检测、原生标题栏配置 |
| `src/main/platform/glass.ts` | 懒加载可选的 `electron-liquid-glass`，安装 `NSGlassEffectView` |
| `src/main/platform/menu.ts` | macOS 应用菜单与快捷键 |
| `src/main/platform/autoStart.ts` | macOS Login Item 与 Windows 启动文件夹 |
| `src/renderer/src/styles.css` | `data-platform="darwin"` 下的 SF 字体、玻璃覆盖色、控件样式 |

窗口使用 `frame: true` + `titleBarStyle: 'hidden'`，再调用
`setWindowButtonVisibility(false)`。这不是“伪无边框”：AppKit 仍然提供原生圆角
窗口蒙版、阴影和材质裁剪，同时标题栏和三个按钮不可见。Electron 的纯
`frame: false + transparent` 在 macOS 26 上会失去新的 Liquid Glass 材质，因此
没有采用。

`electron-liquid-glass` 放在 `optionalDependencies`，只有 macOS 会安装；Windows
构建不会加载或打包原生模块。安装失败、系统版本低于 26 或私有 API 失效时，
`glass.ts` 会返回 `false`，主进程回退到旧版 vibrancy 或半透明外观，并在界面
顶部显示一条可关闭的警告。

## 数据位置

- macOS：`~/Library/Application Support/Fujian/`
  - `tasks.json`
  - `settings.json`
  - 同名 `.bak` 备份
  - `cloud-auth.bin` / `cloud-sync.json`（登录与同步后）
- Windows：`%APPDATA%\Fujian\`

两端的 Supabase 数据和账号互通。

## 构建

账号同步的配置在构建时读取项目根目录的 `.env.local`，它被 `.gitignore` 排除，
不会从 Windows 的 clone 自动带过来。需要把 Windows 上的 `.env.local` 复制到 Mac
项目根目录，或按 `.env.example` 重新填入 `SUPABASE_URL` 和
`SUPABASE_PUBLISHABLE_KEY`，然后重新构建；只改文件不重跑构建不会生效。

```bash
npm ci

# 本地调试：当前 Apple Silicon，未打包 .app
npm run build:mac:dir

# 明确构建 arm64 未打包 .app
npm run build:mac:arm64

# 正式 DMG：配置里是 dmg + universal；universal 需要同时准备 Intel/ARM 运行时
npm run build:mac
```

已在本机验证：

- macOS 26.0.1（Darwin 25.0.0），Apple Silicon（M4 Max）
- Electron 45.2.3
- `npm run test:ui`：38 项通过
- `npm run test:layout`：6 项通过
- `npm run test:mac`：13 项通过
- `npm run test:notes`：42 项通过
- `electron-builder --mac --dir --arm64` 生成的 `浮笺.app` 可启动，菜单栏图标、
  Dock 隐藏、原生玻璃和应用菜单均正常

`build:mac` 的 universal 目标尚未在 Intel Mac 上验证；`electron-liquid-glass`
的 arm64 预编译二进制已验证，x64 预编译文件随包存在，但需要一台 Intel Mac 或
CI 做最终验证。

## 签名与分发

当前产物未签名、未公证，只适合本机或受信任设备测试。对外分发需要：

- Apple Developer Program 的 Developer ID Application 证书
- hardened runtime
- notarization
- 在 CI 或本机配置签名凭据

如果从网络下载未签名版本，Gatekeeper 可能拦截；开发时可以在“系统设置 →
隐私与安全性”中允许，或对本地构建执行：

```bash
xattr -dr com.apple.quarantine /path/to/浮笺.app
```

## 已知边界

- **Liquid Glass 依赖私有 AppKit 类**：`NSGlassEffectView` 目前没有公开的
  Electron API。`electron-liquid-glass` 通过 `NSClassFromString` 使用它；未来
  macOS 更新可能改变行为。代码有回退路径，但需要跟随系统版本验证。
- **不是 WidgetKit 小组件**：macOS 桌面小组件默认不可直接交互，做成交互式
  Widget 会增加使用摩擦，所以仍然使用可交互的浮窗；只是视觉上贴近系统小组件。
- **没有 Dock 图标**：与 Windows 版 `skipTaskbar` 的行为对齐。需要退出时用菜单栏
  右键菜单或 `Cmd+Q`。
- **通用包**：默认配置是 universal，但本次只在 arm64 上完成实机验证。
- **截图**：`docs/macos/` 中的预览使用合成桌面壁纸；实际背景是用户当前桌面，
  由 AppKit 实时采样和模糊。
