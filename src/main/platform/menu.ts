import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { translate, type Language } from '../../shared/i18n'

export interface ApplicationMenuActions {
  openApp: () => void
  openSettings: () => void
  createTask: () => void
  createNote: () => void
}

/**
 * Windows/Linux use a frameless widget and do not need a native app menu.
 * macOS still needs the standard application menu for Cmd+Q, copy/paste,
 * hide/minimize, and the About item.
 */
export function installApplicationMenu(
  actions: ApplicationMenuActions,
  language: Language = 'zh-CN'
): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }

  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      {
        label: translate(language, '设置与归档…'),
        accelerator: 'Command+,',
        click: actions.openSettings
      },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }

  const fileMenu: MenuItemConstructorOptions = {
    label: translate(language, '文件'),
    submenu: [
      {
        label: translate(language, '新建任务'),
        accelerator: 'Command+N',
        click: actions.createTask
      },
      {
        label: translate(language, '新建随记'),
        accelerator: 'Command+Shift+N',
        click: actions.createNote
      },
      { type: 'separator' },
      {
        label: translate(language, '打开浮笺'),
        accelerator: 'Command+0',
        click: actions.openApp
      },
      { type: 'separator' },
      { role: 'close' }
    ]
  }

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      appMenu,
      fileMenu,
      { role: 'editMenu' },
      { role: 'windowMenu' }
    ])
  )
}
