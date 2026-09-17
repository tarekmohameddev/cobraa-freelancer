import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, ChatSendInput, DebugEvent } from '@renderer/lib/ipc'
import { getApi } from '@renderer/lib/ipc'

type UseChatState = {
  messages: ChatMessage[]
  sending: boolean
  error: string | null
}

function isPendingAssistant(m: ChatMessage | undefined) {
  return Boolean(
    m?.role === 'assistant' && (m.pending === true || m.content === '' || m.content === '...' || m.content === '…')
  )
}

function textFromDebugEvent(evt: DebugEvent): string | null {
  const data = evt.data as { text?: unknown; body?: unknown } | undefined
  if (evt.category === 'chat.replyText' && typeof data?.text === 'string') {
    const t = data.text.trim()
    return t || null
  }
  if (evt.category === 'chat.response' && typeof data?.body === 'string') {
    const t = data.body.trim()
    return t || null
  }
  return null
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hi — I'm Cobraa. Ask me anything, or press the mic to dictate and send."
    }
  ])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sendingRef = useRef(false)

  const finishAssistant = (content: string) => {
    const text = content.trim()
    if (!text) return
    setMessages((prev) => {
      const idx = prev.findIndex((m) => isPendingAssistant(m))
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { role: 'assistant', content: text }
        return next
      }
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && last.content === text) return prev
      return [...prev, { role: 'assistant', content: text }]
    })
  }

  useEffect(() => {
    const unsub = getApi().onDebugEvent((evt) => {
      const text = textFromDebugEvent(evt)
      if (!text) return
      finishAssistant(text)
    })
    return unsub
  }, [])

  const send = async (text: string, opts?: { stream?: boolean; web_search?: boolean }) => {
    const trimmed = text.trim()
    if (!trimmed || sendingRef.current) return

    setError(null)
    sendingRef.current = true
    setSending(true)

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: '', pending: true }
    ])

    try {
      const input: ChatSendInput = {
        stream: false,
        messages: [{ role: 'user', content: trimmed }],
        web_search: opts?.web_search ?? false,
        ai_mode: 'creative',
        model: 3
      }
      const res = await getApi().chatSend(input)
      if (!res || typeof res !== 'object') return
      if (!res.ok) {
        setError(res.error)
        finishAssistant(`Error: ${res.error}`)
        return
      }
      const reply = typeof res.replyText === 'string' ? res.replyText.trim() : ''
      if (reply) finishAssistant(reply)
    } catch (e: any) {
      const msg = e?.message || 'Send failed'
      setError(msg)
      finishAssistant(`Sorry — chat failed: ${msg}`)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const state = useMemo<UseChatState>(() => ({ messages, sending, error }), [messages, sending, error])

  return { ...state, send, setMessages }
}
