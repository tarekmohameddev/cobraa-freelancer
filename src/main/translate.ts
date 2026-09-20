import { clipboard } from 'electron'
import axios from 'axios'
import { getSession } from './session'
import { generateToolSign } from './sign'
import { debugLog } from './debug'
import { apiPostJson } from './api/http'
import { isMockMode } from './api/config'

const LANG_MAP: Record<string, string> = {
  auto: 'auto',
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

const CODE_TO_ISO: Record<string, string> = {
  english: 'en',
  arabic: 'ar',
  chinese: 'zh',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  japanese: 'ja',
  korean: 'ko',
  russian: 'ru',
  portuguese: 'pt',
  italian: 'it',
  turkish: 'tr'
}

export type TranslateInput = {
  text: string
  from: string
  to: string
}

export function detectLanguage(text: string): { from: string; to: string } {
  const trimmed = (text || '').trim()
  // Check for Arabic unicode range
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(trimmed)) {
    return { from: 'ar', to: 'en' }
  }
  // Check for Chinese unicode range
  if (/[\u4e00-\u9fa5]/.test(trimmed)) {
    return { from: 'zh', to: 'en' }
  }
  // Default to English -> Arabic
  return { from: 'en', to: 'ar' }
}

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
}

function normalizeIso(lang: string): string {
  const l = (lang || '').trim().toLowerCase()
  if (CODE_TO_ISO[l]) return CODE_TO_ISO[l]
  return l.slice(0, 2)
}

function apiLanguage(code: string) {
  const raw = (code || '').trim()
  if (!raw || raw.toLowerCase() === 'auto') return 'auto'
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

export async function translateWithMyMemory(
  text: string,
  fromLang: string,
  toLang: string
): Promise<string | null> {
  const fromIso = normalizeIso(fromLang)
  const toIso = normalizeIso(toLang)
  if (!text || !fromIso || !toIso || fromIso === toIso) return text

  const langpair = `${fromIso}|${toIso}`
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`

  try {
    const res = await axios.get(url, {
      timeout: 10_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    })
    const data = res.data
    const status = data?.responseStatus
    const translated = data?.responseData?.translatedText
    if ((status === 200 || status === '200') && typeof translated === 'string' && translated.trim()) {
      const decoded = decodeHtmlEntities(translated.trim())
      if (!decoded.toLowerCase().includes('is an invalid target')) {
        return decoded
      }
    }
  } catch (e: any) {
    debugLog('translate.mymemory-error', { error: e?.message || String(e) })
  }
  return null
}

export async function translateText(input: TranslateInput): Promise<string> {
  const trimmed = (input.text || '').trim()
  if (!trimmed) return ''

  // Determine actual languages
  let fromCode = input.from || 'auto'
  let toCode = input.to || 'en'

  if (fromCode === 'auto' || !fromCode) {
    const detected = detectLanguage(trimmed)
    fromCode = detected.from
    if (!input.to || input.to === 'auto' || input.to === fromCode) {
      toCode = detected.to
    }
  }

  const session = getSession()
  const mock = isMockMode() || !session

  // In mock/freelancer mode or when unauthenticated, use free high-fidelity translation
  if (mock) {
    const memResult = await translateWithMyMemory(trimmed, fromCode, toCode)
    if (memResult) {
      debugLog('translate.mymemory-success', { from: fromCode, to: toCode, textLen: trimmed.length })
      return memResult
    }
  }

  // Try live vendor API if authenticated
  if (session && !isMockMode()) {
    try {
      const sign = generateToolSign({ userId: session.userId, token: session.token })
      const src = apiLanguage(fromCode)
      const dst = apiLanguage(toCode)
      const body = {
        sign,
        choice: 2,
        src_language: src,
        dst_language: dst,
        messages: trimmed,
        require: '',
        domain: 'usingFreeTranslation',
        stream: false
      }

      debugLog('translate.request', {
        path: '/gapi/v3/aigc/translate/text',
        from: src,
        to: dst,
        textLen: trimmed.length
      })

      const res = await apiPostJson({
        name: 'translate',
        apiPath: '/gapi/v3/aigc/translate/text',
        body,
        fingerprint: `${src}|${dst}|${trimmed.slice(0, 240)}`,
        timeoutMs: 60_000
      })

      debugLog('translate.response', { status: res.status, body: res.data })

      const text = extractTranslatedText(res.data)
      if (text && !text.startsWith(`[${dst}]`)) {
        return text
      }
    } catch (err: any) {
      debugLog('translate.vendor-failed', { error: err?.message || String(err) })
    }
  }

  // Fallback to MyMemory if live API wasn't used or failed
  const fallback = await translateWithMyMemory(trimmed, fromCode, toCode)
  if (fallback) return fallback

  return trimmed
}

export async function translateClipboard(): Promise<{
  original: string
  translated: string
  from: string
  to: string
} | null> {
  let text = ''
  try {
    text = clipboard.readText().trim()
  } catch (e: any) {
    debugLog('translate.clipboard-read-error', { error: e?.message })
    return null
  }

  if (!text) {
    debugLog('translate.clipboard-empty', {})
    return null
  }

  const { from, to } = detectLanguage(text)
  debugLog('translate.clipboard-start', { text, from, to })

  try {
    const translated = await translateText({ text, from, to })
    if (translated) {
      clipboard.writeText(translated)
      debugLog('translate.clipboard-done', { original: text, translated, from, to })
      return {
        original: text,
        translated,
        from,
        to
      }
    }
  } catch (e: any) {
    debugLog('translate.clipboard-fail', { error: e?.message })
  }

  return null
}
