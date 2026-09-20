import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, Notification, app, clipboard } from 'electron'
import { debugLog } from '../debug'
import { createGestureDetector } from './gestures'
import { loadBindings, saveBindings } from './mapping'
import { translateClipboard } from '../translate'
import type {
  MouseAction,
  MouseBindingMap,
  MouseButtonEvent,
  MouseDaemonError,
  MouseDaemonStatus,
  MouseServiceStatus,
  RawMouseSignature
} from './types'
import { setBoundSignatures, setLearnMode, startWindowsInput, stopWindowsInput } from './windowsInput'
import { setSimulatorInjector, startSimulatorBridge, stopSimulatorBridge } from './simulator'
import { DEFAULT_SIM_BINDINGS } from './simSignatures'
import { openAiOverlay } from '../aiOverlay'
import {
  isVoiceDictating,
  isVoiceTranslating,
  startVoiceDictation,
  startVoiceTranslation,
  stopVoiceDictation,
  stopVoiceTranslation,
  toggleVoiceLanguage
} from '../voiceDictation'
import { updateLastExternalHwnd } from '../windowsTextInsertion'

let child: ChildProcessWithoutNullStreams | null = null
let bindings: MouseBindingMap = { version: 1, bindings: {} }
let learning: MouseAction | null = null
let lastEvent: MouseButtonEvent | null = null
let lastRawSignature: string | null = null
let devices: MouseServiceStatus['devices'] = []
let running = false
let error: string | null = null
let getWindow: () => BrowserWindow | null = () => null

const gestures = createGestureDetector((evt) => {
  const clipboardText = (evt.action === 'translate' || evt.action === 'ai') ? clipboard.readText().trim() : ''
  const payload: MouseButtonEvent = clipboardText ? { ...evt, clipboardText } : evt
  lastEvent = payload
  debugLog('mouse:gesture', payload)

  if (evt.action === 'voice') {
    if (evt.gesture === 'down') {
      updateLastExternalHwnd()
    } else if (evt.gesture === 'long') {
      void startVoiceDictation()
    } else if (evt.gesture === 'up') {
      if (isVoiceDictating()) {
        void stopVoiceDictation()
      }
    } else if (evt.gesture === 'double') {
      toggleVoiceLanguage()
    } else if (evt.gesture === 'click') {
      if (isVoiceDictating()) {
        void stopVoiceDictation()
      } else {
        void startVoiceDictation()
      }
    }
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('mouse:button', payload)
    }
    return
  }

  if (evt.action === 'translate') {
    if (evt.gesture === 'down') {
      updateLastExternalHwnd()
    } else if (evt.gesture === 'long') {
      void startVoiceTranslation()
    } else if (evt.gesture === 'up') {
      if (isVoiceTranslating()) {
        void stopVoiceTranslation()
      }
    } else if (evt.gesture === 'click' || evt.gesture === 'double') {
      if (isVoiceTranslating()) {
        void stopVoiceTranslation()
        return
      }
      void (async () => {
        const result = await translateClipboard()
        const enrichedPayload: MouseButtonEvent = {
          ...payload,
          clipboardText: result?.translated || payload.clipboardText,
          originalText: result?.original || payload.clipboardText,
          translatedText: result?.translated,
          from: result?.from,
          to: result?.to
        }
        lastEvent = enrichedPayload
        debugLog('mouse:translated', enrichedPayload)

        const win = getWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('mouse:button', enrichedPayload)
        }

        if (result?.translated) {
          try {
            if (Notification.isSupported()) {
              new Notification({
                title: 'Cobraa Translate',
                body: `Copied to clipboard: "${result.translated.slice(0, 80)}${result.translated.length > 80 ? '...' : ''}"`
              }).show()
            }
          } catch {
            // ignore notification error
          }
        }
      })()
    }
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('mouse:button', payload)
    }
    return
  }

  if (evt.action === 'ai' && evt.gesture === 'double') {
    const text = clipboard.readText().trim()
    openAiOverlay(text)
    return
  }

  const win = getWindow()
  if (win && !win.isDestroyed()) {
    if (evt.action === 'ai' && (evt.gesture === 'click' || evt.gesture === 'long')) {
      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.show()
      win.focus()
    }
    win.webContents.send('mouse:button', payload)
  }
})

function daemonScript(): string | null {
  const candidates = [
    path.join(process.cwd(), 'scripts', 'mouse_button_daemon.py'),
    path.join(app.getAppPath(), 'scripts', 'mouse_button_daemon.py'),
    path.join(__dirname, '../../scripts/mouse_button_daemon.py'),
    path.join(process.resourcesPath, 'scripts', 'mouse_button_daemon.py')
  ]
  return candidates.find((p) => fs.existsSync(p)) ?? null
}

function pythonCmd(): string {
  return process.platform === 'win32' ? 'python' : 'python3'
}

function broadcastStatus() {
  const win = getWindow()
  if (win && !win.isDestroyed()) win.webContents.send('mouse:status', getStatus())
}

export function getStatus(): MouseServiceStatus {
  return {
    running,
    error,
    devices,
    bindings: bindings.bindings,
    learning,
    lastEvent,
    lastRawSignature
  }
}

function handleRaw(raw: RawMouseSignature) {
  lastRawSignature = raw.signature
  debugLog('mouse:raw', raw)

  if (learning && raw.signature === 'llkbd:ESCAPE' && raw.down) {
    learning = null
    setLearnMode(false)
    sendDaemon('IDLE')
    broadcastStatus()
    return
  }

  if (learning && raw.down) {
    const ok =
      (raw.signature.startsWith('hid:') && !raw.signature.includes(':tele:')) ||
      raw.signature.startsWith('mouse:') ||
      raw.signature.startsWith('kbd:') ||
      raw.signature.startsWith('llmouse:')
    if (!ok) {
      broadcastStatus()
      return
    }
    const taken = Object.entries(bindings.bindings).find(([, action]) => action === learning)
    const next = { ...bindings.bindings }
    if (taken) delete next[taken[0]]
    next[raw.signature] = learning
    bindings = { version: 1, bindings: next }
    saveBindings(bindings)
    setBoundSignatures(Object.keys(bindings.bindings))
    debugLog('mouse:bound', { action: learning, signature: raw.signature })
    learning = null
    setLearnMode(false)
    sendDaemon('IDLE')
    broadcastStatus()
    return
  }

  const action = bindings.bindings[raw.signature]
  if (!action) {
    broadcastStatus()
    return
  }
  gestures.onEdge(action, raw.signature, raw.down)
  broadcastStatus()
}

function onLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return
  let parsed: RawMouseSignature | MouseDaemonStatus | MouseDaemonError
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return
  }
  if (parsed.type === 'status') {
    if (parsed.devices) {
      const sim = { vid: 0x248a, pid: 0xca08, name: 'Cobraa mouse simulator', collections: 1 }
      devices = [sim, ...parsed.devices.filter((d) => d.name !== sim.name)]
    }
    if (parsed.message) debugLog('mouse:daemon', parsed)
    broadcastStatus()
    return
  }
  if (parsed.type === 'error') {
    error = parsed.message
    debugLog('mouse:error', parsed)
    broadcastStatus()
    return
  }
  if (parsed.type === 'raw') handleRaw(parsed)
}

function sendDaemon(cmd: string) {
  try {
    child?.stdin.write(`${cmd}\n`)
  } catch {
    // ignore
  }
}

export function startMouseButtonService(windowGetter: () => BrowserWindow | null) {
  getWindow = windowGetter
  bindings = loadBindings()
  setBoundSignatures(Object.keys(bindings.bindings))
  setSimulatorInjector((signature, down) => {
    handleRaw({ type: 'raw', signature, down, source: 'simulator' })
  })
  startSimulatorBridge()
  const win = windowGetter()
  if (win && !win.isDestroyed()) {
    startWindowsInput(win, handleRaw)
  }
  running = true
  error = null
  if (!devices.some((d) => d.name === 'Cobraa mouse simulator')) {
    devices = [
      { vid: 0x248a, pid: 0xca08, name: 'Cobraa mouse simulator', collections: 1 },
      ...devices
    ]
  }
  if (child) {
    broadcastStatus()
    return
  }

  const script = daemonScript()
  if (!script) {
    debugLog('mouse:daemon', { warning: 'Python vendor HID daemon script not found' })
    broadcastStatus()
    return
  }

  try {
    child = spawn(pythonCmd(), ['-u', script, '--hid-only'], {
      cwd: path.dirname(path.dirname(script)),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
  } catch (e: any) {
    debugLog('mouse:daemon', { warning: e?.message || 'Failed to start mouse button daemon' })
    broadcastStatus()
    return
  }

  let buf = ''
  child.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8')
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ''
    for (const line of lines) onLine(line)
  })
  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim()
    if (text) debugLog('mouse:daemon-stderr', { text })
  })
  child.on('exit', (code) => {
    child = null
    debugLog('mouse:daemon-exit', { code })
    broadcastStatus()
  })
  broadcastStatus()
}

export function stopMouseButtonService() {
  gestures.reset()
  setLearnMode(false)
  sendDaemon('QUIT')
  stopSimulatorBridge()
  const win = getWindow()
  stopWindowsInput(win)
  if (child) {
    child.kill()
    child = null
  }
  running = false
}

export function startLearn(action: MouseAction) {
  learning = action
  setLearnMode(true)
  sendDaemon('LEARN')
  broadcastStatus()
}

export function cancelLearn() {
  learning = null
  setLearnMode(false)
  sendDaemon('IDLE')
  broadcastStatus()
}

export function clearBinding(action: MouseAction) {
  const next = { ...bindings.bindings }
  for (const [sig, mapped] of Object.entries(next)) {
    if (mapped === action) delete next[sig]
  }
  bindings = { version: 1, bindings: next }
  saveBindings(bindings)
  setBoundSignatures(Object.keys(bindings.bindings))
  broadcastStatus()
}

export function clearAllBindings() {
  bindings = { version: 1, bindings: { ...DEFAULT_SIM_BINDINGS } }
  saveBindings(bindings)
  setBoundSignatures(Object.keys(bindings.bindings))
  broadcastStatus()
}
