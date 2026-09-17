import { getSession } from './session'
import { generateChatSign } from './sign'
import { debugLog } from './debug'
import { apiPostJson } from './api/http'

const CHAT_PATH = '/gapi/v3/mimousechat'

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type ChatSendInput = {
  messages: ChatMessage[]
  stream?: boolean
  web_search?: boolean
  ai_mode?: 'creative' | 'balanced' | 'precise'
  model?: number
}

function extractTextDeep(obj: any): string | null {
  if (obj == null) return null
  if (typeof obj === 'string') return obj
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj)

  const mimouse = obj?.data?.choices?.[0]?.message?.content ?? obj?.data?.choices?.[0]?.content
  if (typeof mimouse === 'string') return mimouse

  const direct =
    obj?.data?.delta ??
    obj?.data?.contentDelta ??
    obj?.data?.content ??
    obj?.data?.text ??
    obj?.data?.answer ??
    obj?.delta ??
    obj?.content ??
    obj?.text ??
    null
  if (typeof direct === 'string') return direct

  if (typeof obj?.data === 'string') return obj.data

  const oai =
    obj?.choices?.[0]?.delta?.content ??
    obj?.choices?.[0]?.message?.content ??
    obj?.choices?.[0]?.text ??
    null
  if (typeof oai === 'string') return oai

  const nestedCandidates = [obj?.data, obj?.result, obj?.message, obj?.payload]
  for (const c of nestedCandidates) {
    const t = extractTextDeep(c)
    if (t) return t
  }

  return null
}

/** Extract reply text from MiMouse chat API response (same as working script). */
export function getChatReplyText(chatRes: any): string | null {
  if (chatRes == null) return null
  if (typeof chatRes === 'string') {
    const t = chatRes.trim()
    return t.length > 0 ? t : null
  }
  const extracted = extractTextDeep(chatRes)
  if (typeof extracted === 'string') {
    const t = extracted.trim()
    if (t.length > 0) return t
  }
  const ok = chatRes.retCode === '0000' || chatRes.retCode === 0
  if (!ok || chatRes.data === undefined) return null
  const data = chatRes.data
  if (typeof data === 'string') {
    const t = data.trim()
    return t.length > 0 ? t : null
  }
  const choices = data?.choices
  if (Array.isArray(choices) && choices[0]?.message?.content) return choices[0].message.content
  if (Array.isArray(choices) && choices[0]?.content) return choices[0].content
  if (typeof data?.content === 'string') return data.content
  return null
}

export async function sendChat(input: ChatSendInput): Promise<unknown> {
  const session = getSession()
  if (!session) throw new Error('Not authenticated')

  const sign = generateChatSign(session.userId)
  const userMessages = input.messages.filter((m) => m.role === 'user')
  const lastUser = userMessages.length > 0 ? userMessages[userMessages.length - 1] : input.messages[input.messages.length - 1]
  const lastContent = lastUser?.role === 'user' && lastUser?.content ? lastUser.content : ''
  const singleMessage =
    lastUser?.role === 'user' && lastUser?.content
      ? [{ role: 'user' as const, content: lastUser.content }]
      : input.messages

  const body = {
    stream: false,
    messages: singleMessage,
    sign,
    custom: 10,
    web_search: input.web_search ?? false,
    ai_mode: input.ai_mode ?? 'creative',
    model: input.model ?? 3,
    llm_index: 'azure'
  }

  debugLog('chat.request', { mode: 'non-stream', path: CHAT_PATH, body })
  const res = await apiPostJson({
    name: 'chat',
    apiPath: CHAT_PATH,
    body,
    fingerprint: lastContent.trim().slice(0, 240),
    timeoutMs: 60_000
  })
  const chatRes = res.data
  debugLog('chat.response', { mode: 'non-stream', body: chatRes })
  const replyText = getChatReplyText(chatRes)
  debugLog('chat.replyText', { text: replyText || 'No reply received.' })
  return chatRes
}
