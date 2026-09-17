const { app, BrowserWindow } = require('electron')
const path = require('path')

app.setName('cobraa-mouse-sim')
app.setAppUserModelId('cobraa.mouse-sim')

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 248,
    height: 468,
    minWidth: 220,
    minHeight: 400,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: '#0b1220',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  try {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } catch {
    // mac-only option
  }

  win.loadFile(path.join(__dirname, 'index.html'))
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    win = null
  })

  setInterval(() => {
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver')
  }, 4000)
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
