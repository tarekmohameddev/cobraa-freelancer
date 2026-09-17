import { getSession } from './session'
import { generateToolSign } from './sign'
import { debugLog } from './debug'
import { apiPostJson } from './api/http'

const LANG_MAP: Record<string, string> = {
  auto: 'English',
  en: 'English',
  ar: 'Arabic',
  zh: 'Chinese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  pt: 'Portuguese',
  it: 'Italian',
  tr: 'Turkish'
}

export type TranslateInput = {
  text: string
  from: string
  to: string
}

function apiLanguage(code: string) {
  const raw = (code || '').trim()
  if (!raw) return 'English'
  return LANG_MAP[raw.toLowerCase()] || raw
}

function extractTranslatedText(res: unknown): string | null {
  if (typeof res === 'string') {
    const t = res.trim()
    if (!t || t.startsWith('{') || t.toLowerCase().includes('verification')) return t || null
    return t
  }
  const r = res as Record<string, any>
  if (typeof r?.texts === 'string' && r.texts.trim()) return r.texts.trim()
  if (typeof r?.data?.texts === 'string' && r.data.texts.trim()) return r.data.texts.trim()
  if (typeof r?.data?.content === 'string') return r.data.content.trim()
  if (typeof r?.retVal?.transResult === 'string') return r.retVal.transResult.trim()
  if (typeof r?.content === 'string') return r.content.trim()
  if (typeof r?.data === 'string') return (r.data as string).trim()
  return null
}

function apiError(res: unknown): string | null {
  if (typeof res === 'string' && res.trim()) return res.trim()
  const r = res as Record<string, any>
  if (typeof r?.msg === 'string' && r.msg && r.status !== 10010) return r.msg
  if (typeof r?.message === 'string' && r.message) return r.message
  if (typeof r?.errMessage === 'string' && r.errMessage) return r.errMessage
  return null
}

export async function translateText(input: TranslateInput): Promise<string> {
  const session = getSession()
  if (!session) throw new Error('Not authenticated')

  const sign = generateToolSign({ userId: session.userId, token: session.token })
  const src = apiLanguage(input.from)
  const dst = apiLanguage(input.to)
  const body = {
    sign,
    choice: 2,
    src_language: src,
    dst_language: dst,
    messages: input.text,
    require: '',
    domain: 'usingFreeTranslation',
    stream: false
  }

  debugLog('translate.request', {
    path: '/gapi/v3/aigc/translate/text',
    from: src,
    to: dst,
    textLen: input.text.length
  })

  const res = await apiPostJson({
    name: 'translate',
    apiPath: '/gapi/v3/aigc/translate/text',
    body,
    fingerprint: `${src}|${dst}|${input.text.trim().slice(0, 240)}`,
    timeoutMs: 60_000
  })

  debugLog('translate.response', { status: res.status, body: res.data })

  const err = apiError(res.data)
  const text = extractTranslatedText(res.data)
  if (res.status >= 400 || (err && !text)) {
    throw new Error(err || `Translation failed (HTTP ${res.status})`)
  }
  if (!text) throw new Error(err || 'No translated text in response')
  return text
}
