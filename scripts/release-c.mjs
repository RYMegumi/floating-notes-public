import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const distDir = path.join(root, 'dist')
const appDir = 'C:\\Users\\jiang\\Apps\\浮笺'
const stableExe = path.join(appDir, '浮笺.exe')
const stableChecksum = `${stableExe}.sha256`
const buildTemp = path.join(root, '.cache', 'release-tmp')

function runningInstances() {
  const command =
    '$dir = $env:FUJIAN_RELEASE_APP_DIR; ' +
    'Get-CimInstance Win32_Process | ' +
    'Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase) } | ' +
    'ForEach-Object { "$($_.ProcessId)`t$($_.ExecutablePath)" }'
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    {
      cwd: root,
      env: { ...process.env, FUJIAN_RELEASE_APP_DIR: appDir },
      encoding: 'utf8',
      windowsHide: true
    }
  )
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || '无法检查运行中的浮笺进程。')
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function findArtifact() {
  if (!fs.existsSync(distDir)) return null
  const candidates = fs
    .readdirSync(distDir)
    .filter((name) => /^浮笺-.*便携版\.exe$/.test(name))
    .map((name) => {
      const full = path.join(distDir, name)
      return { full, mtime: fs.statSync(full).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
  return candidates[0]?.full ?? null
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const input = fs.createReadStream(file)
    input.on('error', reject)
    input.on('data', (chunk) => hash.update(chunk))
    input.on('end', () => resolve(hash.digest('hex')))
  })
}

function cleanOldFiles() {
  if (!fs.existsSync(appDir)) return
  for (const name of fs.readdirSync(appDir)) {
    if (name === path.basename(stableExe) || name === path.basename(stableChecksum)) continue
    if (!/^浮笺-.*\.(exe|exe\.sha256|zip|zip\.sha256)$/.test(name)) continue
    const full = path.join(appDir, name)
    try {
      fs.rmSync(full, { force: true })
      console.log(`CLEAN  ${name}`)
    } catch (error) {
      console.warn(`WARN   无法删除旧文件 ${name}: ${error.message}`)
    }
  }
}

function retargetStartupShortcut() {
  const startupDir = path.join(
    process.env.APPDATA ?? '',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup'
  )
  const shortcut = path.join(startupDir, '浮笺.lnk')
  if (!fs.existsSync(shortcut)) return

  const command =
    '$w = New-Object -ComObject WScript.Shell; ' +
    '$s = $w.CreateShortcut($env:FUJIAN_STARTUP_LINK); ' +
    '$s.TargetPath = $env:FUJIAN_STABLE_EXE; ' +
    '$s.WorkingDirectory = Split-Path $env:FUJIAN_STABLE_EXE; ' +
    '$s.IconLocation = $env:FUJIAN_STABLE_EXE; ' +
    "$s.Description = '浮笺 · 桌面任务'; " +
    '$s.Save()'
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    {
      env: {
        ...process.env,
        FUJIAN_STARTUP_LINK: shortcut,
        FUJIAN_STABLE_EXE: stableExe
      },
      encoding: 'utf8',
      windowsHide: true
    }
  )
  if (result.status !== 0) {
    console.warn('WARN   未能更新已有的开机启动快捷方式，请在设置里重新开关一次开机自启。')
  } else {
    console.log('UPDATE  已把开机启动快捷方式指向新的稳定路径。')
  }
}

async function main() {
  const running = runningInstances()
  if (running.length > 0) {
    console.error('浮笺当前正在运行，不能替换正在使用的 exe。')
    console.error('请从设置页底部或托盘菜单退出浮笺后，再运行 npm run release。')
    for (const line of running) console.error(`  ${line}`)
    process.exitCode = 2
    return
  }

  const installOnly = process.argv.includes('--install-only')
  if (!installOnly) {
    fs.mkdirSync(buildTemp, { recursive: true })
    const env = {
      ...process.env,
      TEMP: buildTemp,
      TMP: buildTemp,
      ELECTRON_BUILDER_CACHE: path.join(root, '.cache', 'electron-builder'),
      ELECTRON_BUILDER_BINARIES_MIRROR:
        process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??
        'https://npmmirror.com/mirrors/electron-builder-binaries/',
      ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/',
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      ELECTRON_BUILDER_COMPRESSION_LEVEL: process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ?? '5'
    }

    console.log('Building portable EXE...')
    const build = spawnSync(
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', 'npm run build:win'],
      {
        cwd: root,
        env,
        stdio: 'inherit',
        windowsHide: true
      }
    )
    if (build.status !== 0) {
      console.error('构建失败，当前正在使用的版本没有被改动。')
      process.exitCode = 1
      return
    }
  } else {
    console.log('跳过构建，安装 dist 中最新的便携版。')
  }

  const artifact = findArtifact()
  if (!artifact) {
    console.error('构建结束但没有找到便携版 exe。')
    process.exitCode = 1
    return
  }

  fs.mkdirSync(appDir, { recursive: true })
  fs.copyFileSync(artifact, stableExe)
  const hash = await sha256File(stableExe)
  fs.writeFileSync(stableChecksum, `${hash}  ${path.basename(stableExe)}\r\n`, 'utf8')
  cleanOldFiles()
  retargetStartupShortcut()

  console.log('')
  console.log(`RELEASED ${stableExe}`)
  console.log(`SHA256   ${hash}`)
  console.log('任务数据仍在 %APPDATA%\\Fujian，不会被清理。')
}

main().catch((error) => {
  console.error('发布失败:', error)
  process.exitCode = 1
})
