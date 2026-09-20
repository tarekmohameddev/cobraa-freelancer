import { BrowserWindow, desktopCapturer, screen, dialog, clipboard, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { performOcr } from './ocr'
import { translateText } from './translate'
import { debugLog } from './debug'

let overlayWin: BrowserWindow | null = null
let resultWin: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null
let capturedDesktopImage: Electron.NativeImage | null = null

export type QuickCaptureResultData = {
  loading: boolean
  imageBase64: string
  ocrText: string
  translatedText: string
  toLang: string
  error: string | null
}

// Kept in memory so the result window can fetch it on mount
let pendingData: QuickCaptureResultData | null = null

export function setMainWindowRef(win: BrowserWindow): void {
  mainWin = win
}

export async function startQuickCapture(): Promise<void> {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.focus()
    return
  }

  // Hide main window so it's not in the screenshot
  mainWin?.hide()

  // Let the window fully hide before capturing
  await new Promise<void>((r) => setTimeout(r, 200))

  const display = screen.getPrimaryDisplay()
  const { scaleFactor } = display
  const { width: sw, height: sh } = display.size

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(sw * scaleFactor),
        height: Math.round(sh * scaleFactor)
      }
    })

    if (sources.length > 0) {
      capturedDesktopImage = sources[0].thumbnail
    }
  } catch (err: any) {
    debugLog('quickCapture.desktopCaptureError', { error: err?.message })
  }

  const { x, y, width, height } = display.bounds

  overlayWin = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    await overlayWin.loadURL(`${devUrl}?window=overlay`)
  } else {
    await overlayWin.loadFile(path.join(__dirname, '../renderer/index.html'), {
      query: { window: 'overlay' }
    })
  }

  overlayWin.setAlwaysOnTop(true, 'screen-saver')
  overlayWin.focus()
}

export function cropSelectedRegion(bounds: {
  x: number
  y: number
  width: number
  height: number
}): string {
  if (!capturedDesktopImage) throw new Error('No desktop image captured')
  const display = screen.getPrimaryDisplay()
  const { scaleFactor } = display
  const cropRect = {
    x: Math.max(0, Math.round(bounds.x * scaleFactor)),
    y: Math.max(0, Math.round(bounds.y * scaleFactor)),
    width: Math.max(1, Math.round(bounds.width * scaleFactor)),
    height: Math.max(1, Math.round(bounds.height * scaleFactor))
  }

  const cropped = capturedDesktopImage.crop(cropRect)
  const dataUrl = cropped.toDataURL()
  return dataUrl.split(',')[1] ?? ''
}

export async function saveCapturedImage(
  imageBase64: string
): Promise<{ ok: boolean; canceled?: boolean; filePath?: string; error?: string }> {
  try {
    const imgBuffer = Buffer.from(imageBase64, 'base64')
    try {
      const nImg = nativeImage.createFromBuffer(imgBuffer)
      clipboard.writeImage(nImg)
    } catch {}

    const defaultFilename = `screenshot_${new Date().toISOString().replace(/[:.]/g, '-')}.png`
    const saveOptions: Electron.SaveDialogOptions = {
      title: 'حفظ لقطة الشاشة',
      defaultPath: defaultFilename,
      filters: [
        { name: 'PNG Image', extensions: ['png'] },
        { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }
      ]
    }
    const targetWin =
      overlayWin && !overlayWin.isDestroyed()
        ? overlayWin
        : mainWin && !mainWin.isDestroyed()
          ? mainWin
          : null

    const { canceled, filePath } = targetWin
      ? await dialog.showSaveDialog(targetWin, saveOptions)
      : await dialog.showSaveDialog(saveOptions)

    if (canceled || !filePath) {
      return { ok: false, canceled: true }
    }

    await fs.promises.writeFile(filePath, imgBuffer)
    return { ok: true, filePath }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to save image' }
  }
}

export async function handleRegionSelected(bounds: {
  x: number
  y: number
  width: number
  height: number
}): Promise<void> {
  // Kept for backward compatibility if ever called
  closeOverlay()
  setAndPush({ loading: true, imageBase64: '', ocrText: '', translatedText: '', toLang: 'en', error: null })
  openResultWindow()

  try {
    debugLog('quickCapture.captureRegion', bounds)
    const imageBase64 = await captureRegion(bounds)

    // Show image while waiting for OCR
    setAndPush({ loading: true, imageBase64, ocrText: '', translatedText: '', toLang: 'en', error: null })

    // OCR
    let ocrText = ''
    try {
      ocrText = await performOcr({ imageBase64, language: 'en' })
      debugLog('quickCapture.ocr.done', { textLen: ocrText.length })
    } catch (e: any) {
      throw new Error(`OCR failed: ${e?.message ?? 'unknown'}`)
    }

    // Translate (best-effort)
    let translatedText = ''
    let translationError: string | null = null
    if (ocrText.trim()) {
      try {
        translatedText = await translateText({ text: ocrText, from: 'auto', to: 'en' })
      } catch (e: any) {
        translationError = e?.message || 'Translation failed'
      }
    }

    setAndPush({
      loading: false,
      imageBase64,
      ocrText,
      translatedText,
      toLang: 'en',
      error: translationError
    })
  } catch (e: any) {
    debugLog('quickCapture.error', { error: e?.message })
    setAndPush({
      loading: false,
      imageBase64: pendingData?.imageBase64 ?? '',
      ocrText: '',
      translatedText: '',
      toLang: 'en',
      error: e?.message || 'Capture failed'
    })
    mainWin?.show()
  }
}

export function cancelCapture(): void {
  closeOverlay()
  mainWin?.show()
  mainWin?.focus()
}

export async function retranslate(text: string, from: string, to: string): Promise<string> {
  return translateText({ text, from, to })
}

export function closeResultWindow(): void {
  if (resultWin && !resultWin.isDestroyed()) {
    resultWin.close()
  }
}

export function getPendingData(): QuickCaptureResultData | null {
  return pendingData
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function setAndPush(data: QuickCaptureResultData): void {
  pendingData = data
  if (resultWin && !resultWin.isDestroyed()) {
    resultWin.webContents.send('quickCapture:result', data)
  }
}

function openResultWindow(): void {
  if (resultWin && !resultWin.isDestroyed()) {
    resultWin.focus()
    return
  }

  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea

  resultWin = new BrowserWindow({
    width: 480,
    height: 600,
    x: x + width - 500,
    y: y + Math.round((height - 600) / 2),
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 380,
    minHeight: 400,
    skipTaskbar: false,
    title: 'Quick Capture',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL
  void (devUrl
    ? resultWin.loadURL(`${devUrl}?window=result`)
    : resultWin.loadFile(path.join(__dirname, '../renderer/index.html'), {
        query: { window: 'result' }
      }))

  resultWin.on('closed', () => {
    resultWin = null
    pendingData = null
    mainWin?.show()
    mainWin?.focus()
  })
}

function closeOverlay(): void {
  capturedDesktopImage = null
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.close()
    overlayWin = null
  }
}

async function captureRegion(bounds: {
  x: number
  y: number
  width: number
  height: number
}): Promise<string> {
  const display = screen.getPrimaryDisplay()
  const { scaleFactor } = display
  const { width: sw, height: sh } = display.size

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(sw * scaleFactor),
      height: Math.round(sh * scaleFactor)
    }
  })

  if (!sources.length) throw new Error('No screen sources available')

  const full = sources[0].thumbnail
  const cropRect = {
    x: Math.max(0, Math.round(bounds.x * scaleFactor)),
    y: Math.max(0, Math.round(bounds.y * scaleFactor)),
    width: Math.max(1, Math.round(bounds.width * scaleFactor)),
    height: Math.max(1, Math.round(bounds.height * scaleFactor))
  }

  const cropped = full.crop(cropRect)
  const dataUrl = cropped.toDataURL()
  return dataUrl.split(',')[1] ?? ''
}
