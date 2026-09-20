import { app, BrowserWindow, Menu, nativeTheme, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { registerIpcHandlers } from './ipc'
import { startMouseButtonService, stopMouseButtonService } from './mouseButtons'
import { setMainWindowRef } from './quickCapture'
import { setAiOverlayMainWindowRef } from './aiOverlay'
import { setVoiceDictationMainWindow } from './voiceDictation'
import { registerInternalHwnd } from './windowsTextInsertion'

let mainWindow: BrowserWindow | null = null

function getAppIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '../../resources/icon.png'),
    path.join(process.cwd(), 'resources/icon.png'),
    path.join(__dirname, '../resources/icon.png'),
    path.join(app.getAppPath(), 'resources/icon.png'),
    path.join(process.cwd(), 'resources/logo.png')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return undefined
}

function createWindow() {
  Menu.setApplicationMenu(null)
  nativeTheme.themeSource = 'light'

  if (process.platform === 'win32') {
    app.setAppUserModelId('store.cobraa.app')
  }

  const iconPath = getAppIcon()

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    show: false,
    title: 'Cobraa',
    icon: iconPath,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#18181b',
      height: 34
    },
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  if (iconPath) {
    mainWindow.setIcon(nativeImage.createFromPath(iconPath))
  }

  try {
    const handle = mainWindow.getNativeWindowHandle()
    registerInternalHwnd(handle)
  } catch {
    // ignore
  }

  mainWindow.removeMenu()

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  setMainWindowRef(mainWindow)
  setAiOverlayMainWindowRef(mainWindow)
  setVoiceDictationMainWindow(mainWindow)
  registerIpcHandlers(mainWindow)
  startMouseButtonService(() => mainWindow)
  console.log('[Cobraa] mouse extra-button listener attached')

  const devUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL
  console.log('[Cobraa] renderer URL:', devUrl || `(file) ${path.join(__dirname, '../renderer/index.html')}`)
  if (devUrl) {
    void mainWindow.webContents.session.clearCache()
    void mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopMouseButtonService()
  if (process.platform !== 'darwin') app.quit()
})

