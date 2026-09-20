import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { registerInternalHwnd, unregisterInternalHwnd } from './windowsTextInsertion'

let overlayWin: BrowserWindow | null = null
let currentData = {
  status: 'idle' as 'idle' | 'listening' | 'processing' | 'done',
  language: 'en',
  transcript: ''
}

export function getVoiceOverlayData() {
  return currentData
}

export function openVoiceOverlay(opts?: { language?: string; transcript?: string }): void {
  currentData = {
    status: 'listening',
    language: opts?.language || 'en',
    transcript: opts?.transcript || ''
  }

  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('voiceOverlay:data', currentData)
    return
  }

  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  const overlayWidth = 380
  const overlayHeight = 72
  const posX = Math.round(x + (width - overlayWidth) / 2)
  const posY = Math.round(y + height - overlayHeight - 64)

  overlayWin = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: posX,
    y: posY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false, // Do not steal focus from WhatsApp / Word
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

  overlayWin.setAlwaysOnTop(true, 'screen-saver')
  overlayWin.setIgnoreMouseEvents(false)

  try {
    const handle = overlayWin.getNativeWindowHandle()
    registerInternalHwnd(handle)
  } catch {
    // ignore
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL
  void (devUrl
    ? overlayWin.loadURL(`${devUrl}?window=voice-overlay`)
    : overlayWin.loadFile(path.join(__dirname, '../renderer/index.html'), {
        query: { window: 'voice-overlay' }
      }))

  overlayWin.on('closed', () => {
    try {
      if (overlayWin) unregisterInternalHwnd(overlayWin.getNativeWindowHandle())
    } catch {
      // ignore
    }
    overlayWin = null
    currentData.status = 'idle'
  })
}

export function updateVoiceOverlay(data: {
  transcript?: string
  status?: 'idle' | 'listening' | 'processing' | 'done'
  language?: string
}): void {
  if (data.transcript !== undefined) currentData.transcript = data.transcript
  if (data.status !== undefined) currentData.status = data.status
  if (data.language !== undefined) currentData.language = data.language

  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('voiceOverlay:data', currentData)
  }
}

export function closeVoiceOverlay(): void {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.close()
    overlayWin = null
  }
  currentData.status = 'idle'
}
