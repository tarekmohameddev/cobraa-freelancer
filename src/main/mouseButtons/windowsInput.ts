import koffi from 'koffi'
import type { BrowserWindow } from 'electron'
import { debugLog } from '../debug'
import type { RawMouseSignature } from './types'

const WM_INPUT = 0x00ff
const WM_KEYDOWN = 0x0100
const WM_KEYUP = 0x0101
const WM_SYSKEYDOWN = 0x0104
const WM_SYSKEYUP = 0x0105
const WM_XBUTTONDOWN = 0x020b
const WM_XBUTTONUP = 0x020c
const WM_MBUTTONDOWN = 0x0207
const WM_MBUTTONUP = 0x0208

const RID_INPUT = 0x10000003
const RIDI_DEVICENAME = 0x20000007
const RIM_TYPEMOUSE = 0
const RIM_TYPEKEYBOARD = 1
const RIM_TYPEHID = 2
const RIDEV_INPUTSINK = 0x00000100
const RI_KEY_BREAK = 1
const WH_KEYBOARD_LL = 13
const WH_MOUSE_LL = 14
const HC_ACTION = 0
const STANDARD_MOUSE_BTNS = 0x0001 | 0x0002 | 0x0004 | 0x0008 | 0x0010 | 0x0020 | 0x0400 | 0x0800

const VK_NAMES: Record<number, string> = {
  0x08: 'BACK',
  0x09: 'TAB',
  0x0d: 'RETURN',
  0x10: 'SHIFT',
  0x11: 'CONTROL',
  0x12: 'MENU',
  0x1b: 'ESCAPE',
  0x20: 'SPACE',
  0x70: 'F1',
  0x71: 'F2',
  0x72: 'F3',
  0x73: 'F4',
  0x74: 'F5',
  0x75: 'F6',
  0x76: 'F7',
  0x77: 'F8',
  0x78: 'F9',
  0x79: 'F10',
  0x7a: 'F11',
  0x7b: 'F12',
  0xa0: 'LSHIFT',
  0xa1: 'RSHIFT',
  0xa2: 'LCTRL',
  0xa3: 'RCTRL',
  0xa4: 'LALT',
  0xa5: 'RALT',
  0x5b: 'LWIN',
  0x5c: 'RWIN',
  0xa6: 'BROWSER_BACK',
  0xa7: 'BROWSER_FORWARD',
  0xad: 'VOLUME_MUTE',
  0xae: 'VOLUME_DOWN',
  0xaf: 'VOLUME_UP',
  0xb3: 'MEDIA_PLAY_PAUSE'
}

function vkName(vk: number) {
  if (VK_NAMES[vk]) return VK_NAMES[vk]
  if ((vk >= 0x30 && vk <= 0x39) || (vk >= 0x41 && vk <= 0x5a)) return String.fromCharCode(vk)
  return `VK_${vk.toString(16).toUpperCase().padStart(2, '0')}`
}

export type RawHandler = (evt: RawMouseSignature) => void

let onRaw: RawHandler | null = null
let allowGlobalKeys = false
let boundSignatures = new Set<string>()
let hookedWin: BrowserWindow | null = null
let kbdHook: unknown = null
let mouseHook: unknown = null
const pinned: unknown[] = []

const user32 = koffi.load('user32.dll')

const RAWINPUTDEVICE = koffi.struct('RAWINPUTDEVICE', {
  usUsagePage: 'uint16',
  usUsage: 'uint16',
  dwFlags: 'uint32',
  hwndTarget: 'void *'
})

const RAWINPUTHEADER = koffi.struct('RAWINPUTHEADER', {
  dwType: 'uint32',
  dwSize: 'uint32',
  hDevice: 'void *',
  wParam: 'uintptr'
})

const RAWMOUSE = koffi.struct('RAWMOUSE', {
  usFlags: 'uint16',
  _pad: 'uint16',
  ulButtons: 'uint32',
  ulRawButtons: 'uint32',
  lLastX: 'int32',
  lLastY: 'int32',
  ulExtraInformation: 'uint32'
})

const RAWKEYBOARD = koffi.struct('RAWKEYBOARD', {
  MakeCode: 'uint16',
  Flags: 'uint16',
  Reserved: 'uint16',
  VKey: 'uint16',
  Message: 'uint32',
  ExtraInformation: 'uint32'
})

const KBDLLHOOKSTRUCT = koffi.struct('KBDLLHOOKSTRUCT', {
  vkCode: 'uint32',
  scanCode: 'uint32',
  flags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr'
})

const POINT = koffi.struct('POINT', {
  x: 'int32',
  y: 'int32'
})

const MSLLHOOKSTRUCT = koffi.struct('MSLLHOOKSTRUCT', {
  pt: POINT,
  mouseData: 'uint32',
  flags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr'
})

const RegisterRawInputDevices = user32.func(
  'int __stdcall RegisterRawInputDevices(void *pRawInputDevices, uint32 uiNumDevices, uint32 cbSize)'
)
const GetRawInputData = user32.func(
  'uint32 __stdcall GetRawInputData(void *hRawInput, uint32 uiCommand, void *pData, uint32 *pcbSize, uint32 cbSizeHeader)'
)
const GetRawInputDeviceInfoW = user32.func(
  'uint32 __stdcall GetRawInputDeviceInfoW(void *hDevice, uint32 uiCommand, void *pData, uint32 *pcbSize)'
)
const CallNextHookEx = user32.func(
  'intptr __stdcall CallNextHookEx(void *hhk, int nCode, uintptr wParam, intptr lParam)'
)

const HOOKPROC = koffi.proto('intptr __stdcall HOOKPROC(int nCode, uintptr wParam, intptr lParam)')
const SetWindowsHookExW = user32.func(
  'void *__stdcall SetWindowsHookExW(int idHook, HOOKPROC *lpfn, void *hMod, uint32 dwThreadId)'
)
const UnhookWindowsHookEx = user32.func('int __stdcall UnhookWindowsHookEx(void *hhk)')

const nameCache = new Map<string, string>()

function emit(evt: RawMouseSignature) {
  onRaw?.(evt)
}

function asHandle(value: unknown): unknown {
  if (Buffer.isBuffer(value)) {
    return value.length >= 8 ? value.readBigUInt64LE(0) : BigInt(value.readUInt32LE(0))
  }
  return value
}

function deviceName(hDevice: unknown): string {
  const key = String(hDevice)
  const cached = nameCache.get(key)
  if (cached !== undefined) return cached
  const size = Buffer.alloc(4)
  GetRawInputDeviceInfoW(hDevice, RIDI_DEVICENAME, null, size)
  const chars = size.readUInt32LE(0)
  if (!chars) {
    nameCache.set(key, '')
    return ''
  }
  const buf = Buffer.alloc(chars * 2)
  GetRawInputDeviceInfoW(hDevice, RIDI_DEVICENAME, buf, size)
  const name = buf.toString('utf16le').replace(/\0+$/, '')
  nameCache.set(key, name)
  return name
}

function parseVidPid(name: string): { vid: number; pid: number } | null {
  const u = name.toUpperCase()
  const vid = /VID_([0-9A-F]{4})/.exec(u)
  const pid = /PID_([0-9A-F]{4})/.exec(u)
  if (!vid || !pid) return null
  return { vid: Number.parseInt(vid[1], 16), pid: Number.parseInt(pid[1], 16) }
}

function isAiMouse(name: string) {
  const u = name.toUpperCase()
  return u.includes('VID_248A') || u.includes('ITING') || u.includes('PID_CA08')
}

function isTelemetry(data: Buffer) {
  return data.length >= 2 && data[0] === 0x0a && (data[1] === 0x9c || data[1] === 0x26)
}

function hidSignature(vid: number, pid: number, data: Buffer) {
  const body = data[0] === 0x00 && data.length > 1 ? data.subarray(1) : data
  if (body.length >= 4 && body[0] === 0x0a && body[1] === 0x03) {
    return `hid:${vid.toString(16).toUpperCase().padStart(4, '0')}:${pid.toString(16).toUpperCase().padStart(4, '0')}:p8:${body[2].toString(16).padStart(2, '0')}`
  }
  if (isTelemetry(body)) return `hid:${vid.toString(16).toUpperCase().padStart(4, '0')}:${pid.toString(16).toUpperCase().padStart(4, '0')}:tele:${body[1].toString(16)}`
  const prefix = body.subarray(0, Math.min(2, body.length)).toString('hex')
  if (body.length <= 8) {
    return `hid:${vid.toString(16).toUpperCase().padStart(4, '0')}:${pid.toString(16).toUpperCase().padStart(4, '0')}:${body.toString('hex')}`
  }
  return `hid:${vid.toString(16).toUpperCase().padStart(4, '0')}:${pid.toString(16).toUpperCase().padStart(4, '0')}:${prefix}:${body.length}`
}

function handleRawInput(hRawInput: unknown) {
  const handle = asHandle(hRawInput)
  const size = Buffer.alloc(4)
  GetRawInputData(handle, RID_INPUT, null, size, koffi.sizeof(RAWINPUTHEADER))
  const nbytes = size.readUInt32LE(0)
  if (!nbytes) return
  const buf = Buffer.alloc(nbytes)
  const got = GetRawInputData(handle, RID_INPUT, buf, size, koffi.sizeof(RAWINPUTHEADER))
  if (got !== nbytes) return

  const header = koffi.decode(buf, RAWINPUTHEADER)
  const name = deviceName(header.hDevice)
  const ids = parseVidPid(name)
  const fromMouse = isAiMouse(name)
  const payloadOff = koffi.sizeof(RAWINPUTHEADER)

  if (header.dwType === RIM_TYPEKEYBOARD) {
    if (!fromMouse) return
    const kb = koffi.decode(buf.subarray(payloadOff), RAWKEYBOARD)
    const down = (kb.Flags & RI_KEY_BREAK) === 0
    const vid = ids?.vid ?? 0
    const pid = ids?.pid ?? 0
    const sig = `kbd:${vid.toString(16).toUpperCase().padStart(4, '0')}:${pid.toString(16).toUpperCase().padStart(4, '0')}:${vkName(kb.VKey)}`
    emit({ type: 'raw', signature: sig, down, source: 'keyboard', vid, pid, vk: kb.VKey })
    return
  }

  if (!fromMouse) return
  const vid = ids?.vid ?? 0x248a
  const pid = ids?.pid ?? 0xca08

  if (header.dwType === RIM_TYPEMOUSE) {
    const mouse = koffi.decode(buf.subarray(payloadOff), RAWMOUSE)
    const flags = mouse.ulButtons & 0xffff
    const extra = flags & ~STANDARD_MOUSE_BTNS
    if (extra & 0x0040) emit({ type: 'raw', signature: `mouse:${vid.toString(16).toUpperCase().padStart(4, '0')}:${pid.toString(16).toUpperCase().padStart(4, '0')}:x1`, down: true, source: 'mouse', vid, pid })
    if (extra & 0x0080) emit({ type: 'raw', signature: `mouse:${vid.toString(16).toUpperCase().padStart(4, '0')}:${pid.toString(16).toUpperCase().padStart(4, '0')}:x1`, down: false, source: 'mouse', vid, pid })
    if (extra & 0x0100) emit({ type: 'raw', signature: `mouse:${vid.toString(16).toUpperCase().padStart(4, '0')}:${pid.toString(16).toUpperCase().padStart(4, '0')}:x2`, down: true, source: 'mouse', vid, pid })
    if (extra & 0x0200) emit({ type: 'raw', signature: `mouse:${vid.toString(16).toUpperCase().padStart(4, '0')}:${pid.toString(16).toUpperCase().padStart(4, '0')}:x2`, down: false, source: 'mouse', vid, pid })
    return
  }

  if (header.dwType === RIM_TYPEHID) {
    const dwSizeHid = buf.readUInt32LE(payloadOff)
    const dwCount = buf.readUInt32LE(payloadOff + 4)
    const data = buf.subarray(payloadOff + 8, payloadOff + 8 + dwSizeHid * dwCount)
    if (isTelemetry(data) || (data.length > 1 && data[0] === 0x00 && isTelemetry(data.subarray(1)))) return
    const body = data[0] === 0x00 && data.length > 1 ? data.subarray(1) : data
    const sig = hidSignature(vid, pid, data)
    if (sig.includes(':tele:')) return
    const down = body.length >= 4 && body[0] === 0x0a && body[1] === 0x03 ? body[3] !== 0 : true
    emit({ type: 'raw', signature: sig, down, source: 'rawhid', vid, pid, bytes: data.length })
  }
}

function isTypingVk(vk: number) {
  if (vk >= 0x30 && vk <= 0x39) return true
  if (vk >= 0x41 && vk <= 0x5a) return true
  return vk === 0x20 || vk === 0x08 || vk === 0x09 || vk === 0x0d
}

function shouldCaptureVk(vk: number, learn: boolean) {
  if (vk === 0x1b) return false
  if ([0x10, 0x11, 0x12, 0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0x5b, 0x5c].includes(vk)) return false
  if (learn) {
    // Extra mouse buttons are HID / F-keys / media — never bind typed letters.
    if (isTypingVk(vk)) return false
    return (vk >= 0x70 && vk <= 0x87) || (vk >= 0xa6 && vk <= 0xb7)
  }
  if (vk >= 0x70 && vk <= 0x87) return true
  if (vk >= 0xa6 && vk <= 0xb7) return true
  return false
}

export function setLearnMode(_active: boolean) {
  // Extra buttons come from the mouse HID device, never from laptop typing.
  allowGlobalKeys = false
}

export function setBoundSignatures(sigs: string[]) {
  boundSignatures = new Set(sigs)
}

export function startWindowsInput(win: BrowserWindow, handler: RawHandler) {
  if (hookedWin) stopWindowsInput(hookedWin)
  onRaw = handler
  hookedWin = win

  try {
    const hwnd = win.getNativeWindowHandle()
    const ridSize = koffi.sizeof(RAWINPUTDEVICE)
    const RIDEV_PAGEONLY = 0x00000020
    const specs: Array<[number, number, number]> = [
      [0x01, 0x06, RIDEV_INPUTSINK],
      [0x01, 0x02, RIDEV_INPUTSINK],
      [0x0c, 0x01, RIDEV_INPUTSINK],
      [0x01, 0x80, RIDEV_INPUTSINK],
      [0xff03, 0x00, RIDEV_INPUTSINK | RIDEV_PAGEONLY]
    ]
    const devices = Buffer.alloc(ridSize * specs.length)
    for (let i = 0; i < specs.length; i++) {
      const [page, usage, flags] = specs[i]
      const off = i * ridSize
      devices.writeUInt16LE(page, off)
      devices.writeUInt16LE(usage, off + 2)
      devices.writeUInt32LE(flags, off + 4)
      hwnd.copy(devices, off + 8)
    }
    const ok = RegisterRawInputDevices(devices, specs.length, ridSize)
    if (!ok) debugLog('mouse:rawinput', { error: 'RegisterRawInputDevices failed' })
    else debugLog('mouse:rawinput', { ok: true, hwndBytes: hwnd.length })

    win.hookWindowMessage(WM_INPUT, (_wParam, lParam) => {
      try {
        handleRawInput(lParam)
      } catch (e: any) {
        debugLog('mouse:rawinput-err', { message: e?.message || String(e) })
      }
    })
  } catch (e: any) {
    debugLog('mouse:rawinput-err', { message: e?.message || String(e) })
  }

  try {
    const kbdCb = koffi.register((nCode: number, wParam: number, lParam: number) => {
      if (nCode === HC_ACTION) {
        try {
          const info = koffi.decode(lParam, KBDLLHOOKSTRUCT) as { vkCode: number; flags: number }
          const down = wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN
          const up = wParam === WM_KEYUP || wParam === WM_SYSKEYUP
          if ((down || up) && shouldCaptureVk(info.vkCode, allowGlobalKeys)) {
            const sig = `llkbd:${vkName(info.vkCode)}`
            if (allowGlobalKeys || boundSignatures.has(sig)) {
              emit({ type: 'raw', signature: sig, down, source: 'll-keyboard', vk: info.vkCode })
            }
          }
        } catch {
          // ignore decode errors
        }
      }
      return CallNextHookEx(kbdHook, nCode, wParam, lParam)
    }, koffi.pointer(HOOKPROC))
    pinned.push(kbdCb)
    kbdHook = SetWindowsHookExW(WH_KEYBOARD_LL, kbdCb, null, 0)

    const mouseCb = koffi.register((nCode: number, wParam: number, lParam: number) => {
      if (nCode === HC_ACTION) {
        try {
          const info = koffi.decode(lParam, MSLLHOOKSTRUCT) as { mouseData: number }
          if (wParam === WM_XBUTTONDOWN || wParam === WM_XBUTTONUP) {
            const which = (info.mouseData >> 16) & 0xffff
            const sig = which === 2 ? 'llmouse:x2' : 'llmouse:x1'
            if (allowGlobalKeys || boundSignatures.has(sig)) {
              emit({ type: 'raw', signature: sig, down: wParam === WM_XBUTTONDOWN, source: 'll-mouse' })
            }
          } else if (wParam === WM_MBUTTONDOWN || wParam === WM_MBUTTONUP) {
            const sig = 'llmouse:middle'
            if (allowGlobalKeys || boundSignatures.has(sig)) {
              emit({ type: 'raw', signature: sig, down: wParam === WM_MBUTTONDOWN, source: 'll-mouse' })
            }
          }
        } catch {
          // ignore
        }
      }
      return CallNextHookEx(mouseHook, nCode, wParam, lParam)
    }, koffi.pointer(HOOKPROC))
    pinned.push(mouseCb)
    mouseHook = SetWindowsHookExW(WH_MOUSE_LL, mouseCb, null, 0)
    debugLog('mouse:hooks', { kbd: Boolean(kbdHook), mouse: Boolean(mouseHook) })
  } catch (e: any) {
    debugLog('mouse:hooks-err', { message: e?.message || String(e) })
  }
}

export function stopWindowsInput(win?: BrowserWindow | null) {
  const target = win ?? hookedWin
  try {
    target?.unhookWindowMessage(WM_INPUT)
  } catch {
    // ignore
  }
  if (kbdHook) UnhookWindowsHookEx(kbdHook)
  if (mouseHook) UnhookWindowsHookEx(mouseHook)
  kbdHook = null
  mouseHook = null
  hookedWin = null
  onRaw = null
}
