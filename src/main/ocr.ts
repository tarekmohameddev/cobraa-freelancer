import { getSession } from './session'
import { generateToolSign } from './sign'
import { debugLog } from './debug'
import { apiPostJson } from './api/http'

export type OcrInput = {
  imageBase64: string
  language?: string
}

function extractOcrText(res: unknown): string | null {
  if (typeof res === 'string') {
    const t = res.trim()
    return t || null
  }
  const r = res as Record<string, any>
  const blocks = Array.isArray(r?.data) ? r.data : Array.isArray(r?.data?.data) ? r.data.data : null
  const status = r?.status
  if (blocks && (status === 10000 || status === '10000' || status === 1e4 || status == null)) {
    const lines: string[] = blocks
      .map((block: any) => block?.DetectedText ?? block?.detectedText ?? block?.text ?? block?.content ?? '')
      .filter((s: string) => typeof s === 'string' && s.trim())
    return lines.length > 0 ? lines.join('\n') : ''
  }
  if (status === 10001 || status === '10001') return ''
  if (typeof r?.data?.content === 'string') return r.data.content.trim()
  if (typeof r?.content === 'string') return r.content.trim()
  if (typeof r?.data === 'string') return (r.data as string).trim()
  return null
}

function apiError(res: unknown): string | null {
  if (typeof res === 'string' && res.trim() && !res.trim().startsWith('{')) return res.trim()
  const r = res as Record<string, any>
  if (typeof r?.msg === 'string' && r.msg && r.status !== 10000 && r.status !== 10001) return r.msg
  if (typeof r?.message === 'string' && r.message) return r.message
  if (typeof r?.errMessage === 'string' && r.errMessage) return r.errMessage
  return null
}

export async function performOcr(input: OcrInput): Promise<string> {
  const session = getSession()
  if (!session) throw new Error('Not authenticated')

  const language = input.language && input.language !== 'auto' ? input.language : 'en'
  const sign = generateToolSign({ userId: session.userId, token: session.token })
  const body = {
    sign,
    ocr_language: language,
    messages: input.imageBase64
  }

  debugLog('ocr.request', {
    path: '/gapi/v3/aigc/ocr',
    language,
    imageSize: input.imageBase64.length
  })

  const res = await apiPostJson({
    name: 'ocr',
    apiPath: '/gapi/v3/aigc/ocr',
    body,
    fingerprint: `ocr:${language}`,
    timeoutMs: 120_000,
    maxBodyLength: 12 * 1024 * 1024
  })

  debugLog('ocr.response', { status: res.status, body: res.data })

  if (res.status >= 400) {
    throw new Error(apiError(res.data) || `OCR failed (HTTP ${res.status})`)
  }

  const err = apiError(res.data)
  const text = extractOcrText(res.data)
  if (text === '') return ''
  if (text == null) throw new Error(err || 'No text extracted from image')
  return text
}
