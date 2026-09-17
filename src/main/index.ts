import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { registerIpcHandlers } from './ipc'
import { startMouseButtonService, stopMouseButtonService } from './mouseButtons'
import { setMainWindowRef } from './quickCapture'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    show: false,
    title: 'Cobraa',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  setMainWindowRef(mainWindow)
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

