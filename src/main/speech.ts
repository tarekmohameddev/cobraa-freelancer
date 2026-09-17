import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import { isMockMode, speechWsBase } from './api/config'
import { speechTranscript } from './api/fixtures'

export type SpeechEvent =
  | { type: 'status'; value: 'connected' | 'closed' }
  | { type: 'partial'; value: string }
  | { type: 'final'; value: string }
  | { type: 'end' }
  | { type: 'error'; value: string; raw?: unknown }
  | { type: 'raw'; value: unknown }

type Session = {
  ws: WebSocket | null
  language: string
  tranLan: string
  initialized: boolean
  mock: boolean
  timers: ReturnType<typeof setTimeout>[]
  finalSent: boolean
}

let session: Session | null = null
let emit: ((evt: SpeechEvent) => void) | null = null

export function setSpeechEmitter(fn: (evt: SpeechEvent) => void) {
  emit = fn
}

function mapTranLan(language: string) {
  const l = (language || '').toLowerCase()
  if (l.startsWith('ar')) return 'Arabic'
  if (l.startsWith('en')) return 'Chinese'
  if (l.startsWith('zh')) return 'English'
  return 'English'
}

function clearTimers(s: Session) {
  for (const t of s.timers) clearTimeout(t)
  s.timers = []
}

function closeSession() {
  if (!session) return
  clearTimers(session)
  try {
    session.ws?.removeAllListeners()
    session.ws?.close()
  } catch {
    // ignore
  } finally {
    session = null
  }
}

function startMockSpeech() {
  const s: Session = {
    ws: null,
    language: 'en-US',
    tranLan: 'Chinese',
    initialized: true,
    mock: true,
    timers: [],
    finalSent: false
  }
  session = s
  emit?.({ type: 'status', value: 'connected' })
  s.timers.push(
    setTimeout(() => {
      if (session !== s) return
      emit?.({ type: 'partial', value: speechTranscript.slice(0, 12) })
    }, 280)
  )
  s.timers.push(
    setTimeout(() => {
      if (session !== s) return
      s.finalSent = true
      emit?.({ type: 'final', value: speechTranscript })
    }, 900)
  )
}

export async function speechStart(input?: { language?: string }) {
  closeSession()

  if (isMockMode()) {
    startMockSpeech()
    if (session) session.language = input?.language || 'en-US'
    return { ok: true as const }
  }

  const language = input?.language || 'en-US'
  const tranLan = mapTranLan(language)
  const url = speechWsBase() + randomUUID()

  const ws = new WebSocket(url)
  session = { ws, language, tranLan, initialized: false, mock: false, timers: [], finalSent: false }

  ws.on('open', () => {
    emit?.({ type: 'status', value: 'connected' })
  })

  ws.on('message', (data: WebSocket.RawData) => {
    const text = typeof data === 'string' ? data : data.toString('utf8')
    try {
      const msg: any = JSON.parse(text)
      if (msg?.success === false) {
        emit?.({
          type: 'error',
          value: msg?.message || msg?.msg || 'Speech backend returned error.',
          raw: msg
        })
        return
      }

      if (msg?.status === 'recognizing') {
        emit?.({ type: 'partial', value: msg?.data || '' })
        return
      }
      if (msg?.status === 'recognized') {
        emit?.({ type: 'final', value: msg?.data || '' })
        return
      }
      if (msg?.status === 'end') {
        emit?.({ type: 'end' })
        return
      }

      emit?.({ type: 'raw', value: msg })
    } catch (e: any) {
      emit?.({ type: 'error', value: `Parse speech response failed: ${e?.message || String(e)}` })
    }
  })

  ws.on('error', (err: Error) => {
    emit?.({ type: 'error', value: err?.message || 'WebSocket error' })
  })

  ws.on('close', () => {
    emit?.({ type: 'status', value: 'closed' })
  })

  return { ok: true as const }
}

export async function speechChunk(input: { audioBase64: string }) {
  if (!session) return { ok: false as const, error: 'Speech session not started' }
  if (session.mock) return { ok: true as const }

  const ws = session.ws
  if (!ws || ws.readyState !== WebSocket.OPEN) return { ok: false as const, error: 'Speech socket not open' }

  if (!session.initialized) {
    ws.send(
      JSON.stringify({
        type: 'recognize',
        recognizeLan: session.language,
        tranLan: session.tranLan,
        state: 0
      })
    )
    session.initialized = true
  }

  ws.send(
    JSON.stringify({
      type: 'recognize',
      state: 1,
      audio: input.audioBase64
    })
  )

  return { ok: true as const }
}

export async function speechStop() {
  if (!session) return { ok: true as const }

  if (session.mock) {
    if (!session.finalSent) emit?.({ type: 'final', value: speechTranscript })
    emit?.({ type: 'end' })
    emit?.({ type: 'status', value: 'closed' })
    closeSession()
    return { ok: true as const }
  }

  const ws = session.ws
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: 'recognize', state: 2 }))
      await new Promise((r) => setTimeout(r, 150))
    } catch {
      // ignore
    }
  }

  closeSession()
  return { ok: true as const }
}
