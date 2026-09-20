import { BrowserWindow, screen } from 'electron'
import path from 'node:path'

let aiOverlayWin: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null
let pendingText = ''

export function setAiOverlayMainWindowRef(win: BrowserWindow | null): void {
  mainWin = win
}

export function openAiOverlay(initialText: string = ''): void {
  pendingText = initialText

  if (aiOverlayWin && !aiOverlayWin.isDestroyed()) {
    aiOverlayWin.webContents.send('aiOverlay:data', { text: pendingText })
    aiOverlayWin.focus()
    return
  }

  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  const overlayWidth = 420
  const overlayHeight = 260
  const posX = x + width - overlayWidth - 32
  const posY = y + Math.round((height - overlayHeight) / 2)

  aiOverlayWin = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: posX,
    y: posY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  aiOverlayWin.setAlwaysOnTop(true, 'screen-saver')

  const devUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL
  void (devUrl
    ? aiOverlayWin.loadURL(`${devUrl}?window=ai-overlay`)
    : aiOverlayWin.loadFile(path.join(__dirname, '../renderer/index.html'), {
        query: { window: 'ai-overlay' }
      }))

  aiOverlayWin.on('closed', () => {
    aiOverlayWin = null
    pendingText = ''
  })
}

export function closeAiOverlay(): void {
  if (aiOverlayWin && !aiOverlayWin.isDestroyed()) {
    aiOverlayWin.close()
    aiOverlayWin = null
  }
}

export function getAiOverlayData(): { text: string } {
  return { text: pendingText }
}

export function submitAiOverlay(text: string): void {
  const trimmed = (text || '').trim()
  closeAiOverlay()

  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore()
    if (!mainWin.isVisible()) mainWin.show()
    mainWin.focus()
    if (trimmed) {
      mainWin.webContents.send('chat:autoSend', { text: trimmed })
    }
  }
}
