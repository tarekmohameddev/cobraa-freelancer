import { contextBridge, ipcRenderer } from 'electron'

const api = {
  authLogin: (input: { email: string; password: string }) => ipcRenderer.invoke('auth:login', input),
  authGetSession: () => ipcRenderer.invoke('auth:getSession'),
  authLogout: () => ipcRenderer.invoke('auth:logout'),

  chatSend: (input: any) => ipcRenderer.invoke('chat:send', input),
  onChatReply: (cb: (text: string) => void) => {
    const handler = (_evt: unknown, text: string) => cb(text)
    ipcRenderer.on('chat:reply', handler)
    return () => ipcRenderer.removeListener('chat:reply', handler)
  },
  onChatChunk: (cb: (chunk: string) => void) => {
    const handler = (_evt: unknown, chunk: string) => cb(chunk)
    ipcRenderer.on('chat:chunk', handler)
    return () => ipcRenderer.removeListener('chat:chunk', handler)
  },

  onDebugEvent: (cb: (evt: any) => void) => {
    const handler = (_evt: unknown, payload: any) => cb(payload)
    ipcRenderer.on('debug:event', handler)
    return () => ipcRenderer.removeListener('debug:event', handler)
  },

  speechStart: (input: { language?: string }) => ipcRenderer.invoke('speech:start', input),
  speechChunk: (input: { audioBase64: string }) => ipcRenderer.invoke('speech:chunk', input),
  speechStop: () => ipcRenderer.invoke('speech:stop'),
  onSpeechEvent: (cb: (evt: any) => void) => {
    const handler = (_evt: unknown, payload: any) => cb(payload)
    ipcRenderer.on('speech:event', handler)
    return () => ipcRenderer.removeListener('speech:event', handler)
  },

  translateText: (input: { text: string; from: string; to: string }) =>
    ipcRenderer.invoke('translate:text', input),

  ocrImage: (input: { imageBase64: string; language?: string }) =>
    ipcRenderer.invoke('ocr:image', input),

  // Quick Capture
  quickCaptureStart: () => ipcRenderer.invoke('quickCapture:start'),
  quickCaptureRegionSelected: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('quickCapture:regionSelected', bounds),
  quickCaptureCancel: () => ipcRenderer.invoke('quickCapture:cancel'),
  quickCaptureClose: () => ipcRenderer.invoke('quickCapture:close'),
  quickCaptureRetranslate: (input: { text: string; from: string; to: string }) =>
    ipcRenderer.invoke('quickCapture:retranslate', input),
  quickCaptureGetData: () => ipcRenderer.invoke('quickCapture:getData'),
  onQuickCaptureResult: (cb: (data: unknown) => void) => {
    const handler = (_evt: unknown, data: unknown) => cb(data)
    ipcRenderer.on('quickCapture:result', handler)
    return () => ipcRenderer.removeListener('quickCapture:result', handler)
  },

  mouseStatus: () => ipcRenderer.invoke('mouse:status'),
  mouseStartLearn: (action: 'translate' | 'ai' | 'voice' | 'ocr') =>
    ipcRenderer.invoke('mouse:startLearn', action),
  mouseCancelLearn: () => ipcRenderer.invoke('mouse:cancelLearn'),
  mouseClearBinding: (action: 'translate' | 'ai' | 'voice' | 'ocr') =>
    ipcRenderer.invoke('mouse:clearBinding', action),
  mouseClearAll: () => ipcRenderer.invoke('mouse:clearAll'),
  onMouseButton: (cb: (evt: unknown) => void) => {
    const handler = (_evt: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on('mouse:button', handler)
    return () => ipcRenderer.removeListener('mouse:button', handler)
  },
  onMouseStatus: (cb: (evt: unknown) => void) => {
    const handler = (_evt: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on('mouse:status', handler)
    return () => ipcRenderer.removeListener('mouse:status', handler)
  },

  apiMode: () => ipcRenderer.invoke('dev:apiMode')
}

contextBridge.exposeInMainWorld('api', api)

