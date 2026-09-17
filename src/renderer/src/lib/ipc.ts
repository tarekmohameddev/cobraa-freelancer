export type AuthSession = {
  userId: number
  token: string
  email?: string
}

export type AuthLoginInput = {
  email: string
  password: string
}

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
  pending?: boolean
}

export type ChatSendInput = {
  messages: ChatMessage[]
  stream?: boolean
  web_search?: boolean
  ai_mode?: 'creative' | 'balanced' | 'precise'
  model?: number
}

export type ChatSendResult =
  | { ok: true; replyText?: string }
  | { ok: false; error: string }

export type SpeechEvent =
  | { type: 'status'; value: 'connected' | 'closed' }
  | { type: 'partial'; value: string }
  | { type: 'final'; value: string }
  | { type: 'end' }
  | { type: 'error'; value: string; raw?: unknown }
  | { type: 'raw'; value: unknown }

export type DebugEvent = {
  ts: string
  category: string
  data: unknown
}

export type QuickCaptureResultData = {
  loading: boolean
  imageBase64: string
  ocrText: string
  translatedText: string
  toLang: string
  error: string | null
}

export type MouseAction = 'translate' | 'ai' | 'voice' | 'ocr'
export type MouseGesture = 'down' | 'up' | 'click' | 'double' | 'long'

export type MouseButtonEvent = {
  action: MouseAction
  gesture: MouseGesture
  signature: string
  clipboardText?: string
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

export type CobraaAPI = {
  authLogin: (input: AuthLoginInput) => Promise<{ ok: true; session: AuthSession } | { ok: false; error: string }>
  authGetSession: () => Promise<{ ok: true; session: AuthSession | null } | { ok: false; error: string }>
  authLogout: () => Promise<{ ok: true } | { ok: false; error: string }>

  chatSend: (input: ChatSendInput) => Promise<ChatSendResult>
  onChatReply: (cb: (text: string) => void) => () => void
  onChatChunk: (cb: (chunk: string) => void) => () => void
  onDebugEvent: (cb: (evt: DebugEvent) => void) => () => void

  speechStart: (input: { language?: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  speechChunk: (input: { audioBase64: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  speechStop: () => Promise<{ ok: true } | { ok: false; error: string }>
  onSpeechEvent: (cb: (evt: SpeechEvent) => void) => () => void

  translateText: (input: {
    text: string
    from: string
    to: string
  }) => Promise<{ ok: true; text: string } | { ok: false; error: string }>

  ocrImage: (input: {
    imageBase64: string
    language?: string
  }) => Promise<{ ok: true; text: string } | { ok: false; error: string }>

  // Quick Capture
  quickCaptureStart: () => Promise<{ ok: true } | { ok: false; error: string }>
  quickCaptureRegionSelected: (bounds: {
    x: number
    y: number
    width: number
    height: number
  }) => Promise<{ ok: true } | { ok: false; error: string }>
  quickCaptureCancel: () => Promise<{ ok: true }>
  quickCaptureClose: () => Promise<{ ok: true }>
  quickCaptureRetranslate: (input: {
    text: string
    from: string
    to: string
  }) => Promise<{ ok: true; text: string } | { ok: false; error: string }>
  quickCaptureGetData: () => Promise<QuickCaptureResultData | null>
  onQuickCaptureResult: (cb: (data: QuickCaptureResultData) => void) => () => void

  mouseStatus: () => Promise<MouseServiceStatus>
  mouseStartLearn: (action: MouseAction) => Promise<{ ok: true }>
  mouseCancelLearn: () => Promise<{ ok: true }>
  mouseClearBinding: (action: MouseAction) => Promise<{ ok: true }>
  mouseClearAll: () => Promise<{ ok: true }>
  onMouseButton: (cb: (evt: MouseButtonEvent) => void) => () => void
  onMouseStatus: (cb: (evt: MouseServiceStatus) => void) => () => void
  apiMode: () => Promise<{ ok: true; mode: 'live' | 'record' | 'mock'; mock: boolean }>
}

export function getApi(): CobraaAPI {
  const api = (window as any).api as CobraaAPI | undefined
  if (!api) {
    throw new Error('Preload API not found. Is the preload script loaded and contextIsolation enabled?')
  }
  return api
}

