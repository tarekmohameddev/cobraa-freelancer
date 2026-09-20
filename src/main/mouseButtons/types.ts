export type MouseAction = 'translate' | 'ai' | 'voice' | 'ocr'

export type MouseGesture = 'down' | 'up' | 'click' | 'double' | 'long'

export type RawMouseSignature = {
  type: 'raw'
  signature: string
  down: boolean
  source?: string
  vid?: number
  pid?: number
  iface?: number
  vk?: number
  bytes?: number
}

export type MouseDaemonStatus = {
  type: 'status'
  listening?: boolean
  devices?: Array<{ vid: number; pid: number; name: string; collections: number }>
  baselineMs?: number
  message?: string
}

export type MouseDaemonError = {
  type: 'error'
  message: string
}

export type MouseButtonEvent = {
  action: MouseAction
  gesture: MouseGesture
  signature: string
  clipboardText?: string
  originalText?: string
  translatedText?: string
  from?: string
  to?: string
}

export type MouseBindingMap = {
  version: 1
  bindings: Record<string, MouseAction>
}

export type MouseLearnState = {
  action: MouseAction | null
}

export type MouseServiceStatus = {
  running: boolean
  error: string | null
  devices: Array<{ vid: number; pid: number; name: string; collections: number }>
  bindings: Record<string, MouseAction>
  learning: MouseAction | null
  lastEvent: MouseButtonEvent | null
  lastRawSignature: string | null
}
