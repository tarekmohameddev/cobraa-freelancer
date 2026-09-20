import koffi from 'koffi'
import { clipboard } from 'electron'
import { debugLog } from './debug'

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()')
const SetForegroundWindow = user32.func('int __stdcall SetForegroundWindow(void *hWnd)')
const BringWindowToTop = user32.func('int __stdcall BringWindowToTop(void *hWnd)')
const GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *lpdwProcessId)')
const AttachThreadInput = user32.func('int __stdcall AttachThreadInput(uint32 idAttach, uint32 idAttachTo, int fAttach)')
const keybd_event = user32.func('void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)')
const GetCurrentThreadId = kernel32.func('uint32 __stdcall GetCurrentThreadId()')

const VK_CONTROL = 0x11
const VK_V = 0x56
const KEYEVENTF_KEYUP = 0x0002

let lastExternalForegroundHwnd: unknown = null
const internalHwnds = new Set<string>()

export function registerInternalHwnd(hwnd: unknown) {
  if (hwnd) {
    internalHwnds.add(String(hwnd))
  }
}

export function unregisterInternalHwnd(hwnd: unknown) {
  if (hwnd) {
    internalHwnds.delete(String(hwnd))
  }
}

export function isInternalHwnd(hwnd: unknown): boolean {
  if (!hwnd) return false
  return internalHwnds.has(String(hwnd))
}

export function getForegroundHwnd(): unknown {
  try {
    return GetForegroundWindow()
  } catch {
    return null
  }
}

export function updateLastExternalHwnd(hwnd?: unknown): unknown {
  const current = hwnd ?? getForegroundHwnd()
  if (current && !isInternalHwnd(current)) {
    lastExternalForegroundHwnd = current
  }
  return lastExternalForegroundHwnd
}

export function getLastExternalHwnd(): unknown {
  return lastExternalForegroundHwnd
}

export function forceForeground(hwnd: unknown): boolean {
  if (!hwnd) return false
  try {
    const currentHwnd = GetForegroundWindow()
    if (String(currentHwnd) === String(hwnd)) return true

    const currentPid = [0]
    const currentThreadId = GetCurrentThreadId()
    const targetThreadId = GetWindowThreadProcessId(hwnd, currentPid)

    if (targetThreadId && targetThreadId !== currentThreadId) {
      AttachThreadInput(currentThreadId, targetThreadId, 1)
      BringWindowToTop(hwnd)
      SetForegroundWindow(hwnd)
      AttachThreadInput(currentThreadId, targetThreadId, 0)
    } else {
      BringWindowToTop(hwnd)
      SetForegroundWindow(hwnd)
    }
    return true
  } catch (e: any) {
    debugLog('input:forceForeground-err', { message: e?.message || String(e) })
    return false
  }
}

export function simulateCtrlV() {
  try {
    // Press Ctrl+V
    keybd_event(VK_CONTROL, 0, 0, 0)
    keybd_event(VK_V, 0, 0, 0)
    // Release V, then Ctrl
    keybd_event(VK_V, 0, KEYEVENTF_KEYUP, 0)
    keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
  } catch (e: any) {
    debugLog('input:simulateCtrlV-err', { message: e?.message || String(e) })
  }
}

export async function pasteTextIntoActiveWindow(
  text: string,
  targetHwnd?: unknown
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = (text || '').trim()
  if (!trimmed) {
    return { ok: false, error: 'Empty text to insert' }
  }

  const hwnd = targetHwnd || lastExternalForegroundHwnd || getForegroundHwnd()
  debugLog('input:pasteText', { textLength: trimmed.length, hwnd: String(hwnd) })

  if (hwnd && !isInternalHwnd(hwnd)) {
    forceForeground(hwnd)
    await new Promise((resolve) => setTimeout(resolve, 60))
  }

  // Backup existing clipboard text
  let originalClipboard = ''
  try {
    originalClipboard = clipboard.readText()
  } catch {
    // ignore
  }

  try {
    clipboard.writeText(trimmed)
    await new Promise((resolve) => setTimeout(resolve, 30))

    simulateCtrlV()

    // Keep the new text on clipboard briefly so the target app processes paste
    setTimeout(() => {
      try {
        // Only restore if user had non-empty previous clipboard
        if (originalClipboard && originalClipboard !== trimmed) {
          clipboard.writeText(originalClipboard)
        }
      } catch {
        // ignore
      }
    }, 300)

    return { ok: true }
  } catch (e: any) {
    debugLog('input:paste-failed', { error: e?.message || String(e) })
    return { ok: false, error: e?.message || 'Failed to paste text' }
  }
}
