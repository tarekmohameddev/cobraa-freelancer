import { APP_KEY, SIGN_KEY, hasLiveSecrets } from './api/config'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function formatTimestamp(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}:${pad2(d.getSeconds())}`
}

const CUSTOM_VALUE = 10
const APP_VERSION = '3.3.1.1'

function xorLatin1Base64(payload: string) {
  const keyBuf = Buffer.from(SIGN_KEY, 'utf8')
  const result = Buffer.alloc(payload.length)
  for (let i = 0; i < payload.length; i++) {
    result[i] = payload.charCodeAt(i) ^ keyBuf[i % keyBuf.length]
  }
  return result.toString('base64')
}

/**
 * Verified signature generator (Docs/Otek-AI_API_Documentation.md section 8.3).
 * Used by chat: { userId, timestamp, appkey } XOR + base64.
 */
export function generateChatSign(userId: number) {
  if (!hasLiveSecrets()) return 'mock-sign'
  const payload = JSON.stringify({
    userId: Number.parseInt(String(userId), 10),
    timestamp: formatTimestamp(new Date()),
    appkey: APP_KEY
  })
  return xorLatin1Base64(payload)
}

/**
 * Otek getSignVal() — required by translate and OCR.
 * Extra fields (custom, version, uidToken, …) are checked server-side;
 * the chat-only sign returns 403 "Mouse verification fails".
 */
export function generateToolSign(input: { userId: number; token?: string; language?: string }) {
  if (!hasLiveSecrets()) return 'mock-sign'
  const payload = JSON.stringify({
    userId: Number.parseInt(String(input.userId), 10),
    timestamp: formatTimestamp(new Date()),
    appkey: APP_KEY,
    snCode: '',
    version: APP_VERSION,
    timeRandom: Math.random(),
    randomtime: `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`,
    uidToken: input.token || '',
    snToken: '',
    custom: CUSTOM_VALUE,
    language: input.language || 'en'
  })
  return xorLatin1Base64(payload)
}
