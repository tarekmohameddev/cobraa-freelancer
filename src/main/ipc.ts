import { BrowserWindow, ipcMain } from 'electron'
import { loginWithEmailPassword, logout as logoutAuth } from './auth'
import { getSession } from './session'
import { getChatReplyText, sendChat, type ChatSendInput } from './chat'
import { setSpeechEmitter, speechChunk, speechStart, speechStop } from './speech'
import { setDebugEmitter } from './debug'
import { translateText, type TranslateInput } from './translate'
import { performOcr, type OcrInput } from './ocr'
import {
  cancelCapture,
  closeResultWindow,
  getPendingData,
  handleRegionSelected,
  retranslate,
  startQuickCapture
} from './quickCapture'
import {
  cancelLearn,
  clearAllBindings,
  clearBinding,
  getStatus,
  startLearn
} from './mouseButtons'
import type { MouseAction } from './mouseButtons/types'
import { getApiMode, isMockMode } from './api/config'

export function registerIpcHandlers(win: BrowserWindow) {
  const channels = [
    'auth:login',
    'auth:getSession',
    'auth:logout',
    'chat:send',
    'speech:start',
    'speech:chunk',
    'speech:stop',
    'translate:text',
    'ocr:image',
    'quickCapture:start',
    'quickCapture:regionSelected',
    'quickCapture:cancel',
    'quickCapture:close',
    'quickCapture:retranslate',
    'quickCapture:getData',
    'mouse:status',
    'mouse:startLearn',
    'mouse:cancelLearn',
    'mouse:clearBinding',
    'mouse:clearAll',
    'dev:apiMode'
  ] as const
  for (const ch of channels) {
    try {
      ipcMain.removeHandler(ch)
    } catch {
      // first registration
    }
  }

  setDebugEmitter((evt) => {
    if (!win.isDestroyed()) win.webContents.send('debug:event', evt)
  })

  setSpeechEmitter((evt) => {
    win.webContents.send('speech:event', evt)
  })

  ipcMain.handle('auth:login', async (_evt, input: { email: string; password: string }) => {
    try {
      const session = await loginWithEmailPassword(input)
      return { ok: true as const, session }
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Login failed' }
    }
  })

  ipcMain.handle('auth:getSession', async () => {
    try {
      return { ok: true as const, session: getSession() }
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Failed to load session' }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    try {
      logoutAuth()
      return { ok: true as const }
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Logout failed' }
    }
  })

  ipcMain.handle('chat:send', async (_evt, input: ChatSendInput) => {
    try {
      const data = await sendChat(input)
      const replyText = getChatReplyText(data)
      const text = replyText ? String(replyText) : 'No reply received.'
      return { ok: true as const, replyText: text }
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Chat request failed' }
    }
  })

  ipcMain.handle('speech:start', async (_evt, input: { language?: string }) => {
    try {
      // ensure emitter is bound to the current window
      setSpeechEmitter((evt) => {
        win.webContents.send('speech:event', evt)
      })
      await speechStart(input)
      return { ok: true as const }
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Speech start failed' }
    }
  })

  ipcMain.handle('speech:chunk', async (_evt, input: { audioBase64: string }) => {
    try {
      return await speechChunk(input)
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Speech chunk failed' }
    }
  })

  ipcMain.handle('speech:stop', async () => {
    try {
      return await speechStop()
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Speech stop failed' }
    }
  })

  ipcMain.handle('translate:text', async (_evt, input: TranslateInput) => {
    try {
      const text = await translateText(input)
      return { ok: true as const, text }
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Translation failed' }
    }
  })

  ipcMain.handle('ocr:image', async (_evt, input: OcrInput) => {
    try {
      const text = await performOcr(input)
      return { ok: true as const, text }
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'OCR failed' }
    }
  })

  ipcMain.handle('quickCapture:start', async () => {
    try {
      await startQuickCapture()
      return { ok: true as const }
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Quick capture start failed' }
    }
  })

  ipcMain.handle('quickCapture:regionSelected', async (_evt, bounds: { x: number; y: number; width: number; height: number }) => {
    try {
      await handleRegionSelected(bounds)
      return { ok: true as const }
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Region capture failed' }
    }
  })

  ipcMain.handle('quickCapture:cancel', () => {
    cancelCapture()
    return { ok: true as const }
  })

  ipcMain.handle('quickCapture:close', () => {
    closeResultWindow()
    return { ok: true as const }
  })

  ipcMain.handle('quickCapture:retranslate', async (_evt, input: { text: string; from: string; to: string }) => {
    try {
      const text = await retranslate(input.text, input.from, input.to)
      return { ok: true as const, text }
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Retranslation failed' }
    }
  })

  ipcMain.handle('quickCapture:getData', () => {
    return getPendingData()
  })

  ipcMain.handle('mouse:status', () => getStatus())
  ipcMain.handle('mouse:startLearn', (_evt, action: MouseAction) => {
    startLearn(action)
    return { ok: true as const }
  })
  ipcMain.handle('mouse:cancelLearn', () => {
    cancelLearn()
    return { ok: true as const }
  })
  ipcMain.handle('mouse:clearBinding', (_evt, action: MouseAction) => {
    clearBinding(action)
    return { ok: true as const }
  })
  ipcMain.handle('mouse:clearAll', () => {
    clearAllBindings()
    return { ok: true as const }
  })

  ipcMain.handle('dev:apiMode', () => ({
    ok: true as const,
    mode: getApiMode(),
    mock: isMockMode()
  }))
}

