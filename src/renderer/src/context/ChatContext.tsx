import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, ChatSendInput, DebugEvent } from '@renderer/lib/ipc'
import { getApi } from '@renderer/lib/ipc'

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

export interface ChatContextValue {
  sessions: ChatSession[]
  activeSessionId: string | null
  messages: ChatMessage[]
  sending: boolean
  error: string | null
  temporaryChat: boolean
  setTemporaryChat: (val: boolean) => void
  send: (text: string, opts?: { stream?: boolean; web_search?: boolean }) => Promise<void>
  startNewChat: () => void
  loadSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, newTitle: string) => void
  clearAllSessions: () => void
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  clearMessages: () => void
}

const STORAGE_KEY = 'cobraa:chatHistory'
const ACTIVE_SESSION_KEY = 'cobraa:activeSessionId'

function sanitizeMessages(msgs: unknown): ChatMessage[] {
  if (!Array.isArray(msgs)) return []
  return msgs
    .filter(
      (m): m is ChatMessage =>
        m != null &&
        typeof m === 'object' &&
        typeof (m as any).role === 'string' &&
        typeof (m as any).content === 'string'
    )
    .filter((m) => m.content.trim() !== '' || !m.pending)
    .map((m) => ({
      role: m.role,
      content: m.content,
      pending: false
    }))
}

function loadStoredSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((s) => s && typeof s.id === 'string' && typeof s.title === 'string')
      .map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
        updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
        messages: sanitizeMessages(s.messages)
      }))
      .filter((s) => s.messages.length > 0)
  } catch (err) {
    console.error('Failed to parse chat history from localStorage', err)
    return []
  }
}

function saveStoredSessions(sessions: ChatSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch (err) {
    console.error('Failed to save chat history to localStorage', err)
  }
}

function generateTitle(text: string): string {
  const firstLine = text.split('\n').find((l) => l.trim().length > 0) || text
  const clean = firstLine.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New conversation'
  return clean.length > 36 ? clean.slice(0, 36) + '…' : clean
}

function isPendingAssistant(m: ChatMessage | undefined) {
  return Boolean(
    m?.role === 'assistant' &&
      (m.pending === true || m.content === '' || m.content === '...' || m.content === '…')
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

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadStoredSessions())
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_SESSION_KEY)
      if (stored) {
        const all = loadStoredSessions()
        if (all.some((s) => s.id === stored)) return stored
      }
    } catch {}
    return null
  })

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_SESSION_KEY)
      if (stored) {
        const all = loadStoredSessions()
        const found = all.find((s) => s.id === stored)
        if (found) return found.messages
      }
    } catch {}
    return []
  })

  const [temporaryChat, setTemporaryChat] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId

  const temporaryChatRef = useRef(temporaryChat)
  temporaryChatRef.current = temporaryChat

  const sendingRef = useRef(false)
  sendingRef.current = sending

  // Sync sessions to localStorage
  useEffect(() => {
    saveStoredSessions(sessions)
  }, [sessions])

  // Sync activeSessionId to localStorage
  useEffect(() => {
    if (activeSessionId && !temporaryChat) {
      localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId)
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY)
    }
  }, [activeSessionId, temporaryChat])

  const finishAssistant = (content: string, targetSessionId?: string | null) => {
    const text = content.trim()
    if (!text) return
    const sId = targetSessionId ?? activeSessionIdRef.current

    setMessages((prev) => {
      const idx = prev.findIndex((m) => isPendingAssistant(m))
      let updated: ChatMessage[]
      if (idx >= 0) {
        updated = [...prev]
        updated[idx] = { role: 'assistant', content: text, pending: false }
      } else {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.content === text) return prev
        updated = [...prev, { role: 'assistant', content: text, pending: false }]
      }

      if (!temporaryChatRef.current && sId) {
        setSessions((prevSessions) => {
          const sIdx = prevSessions.findIndex((s) => s.id === sId)
          if (sIdx >= 0) {
            const next = [...prevSessions]
            next[sIdx] = {
              ...next[sIdx],
              updatedAt: Date.now(),
              messages: updated
            }
            return next
          }
          return prevSessions
        })
      }

      return updated
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

    const isTemp = temporaryChatRef.current
    let targetSessionId = activeSessionIdRef.current

    if (!isTemp && !targetSessionId) {
      targetSessionId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
      activeSessionIdRef.current = targetSessionId
      setActiveSessionId(targetSessionId)
    }

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const pendingMsg: ChatMessage = { role: 'assistant', content: '', pending: true }

    let currentMessages: ChatMessage[] = []
    setMessages((prev) => {
      currentMessages = [...prev, userMsg, pendingMsg]
      return currentMessages
    })

    if (!isTemp && targetSessionId) {
      setSessions((prevSessions) => {
        const existingIdx = prevSessions.findIndex((s) => s.id === targetSessionId)
        if (existingIdx >= 0) {
          const updated = [...prevSessions]
          updated[existingIdx] = {
            ...updated[existingIdx],
            updatedAt: Date.now(),
            messages: currentMessages
          }
          const [moved] = updated.splice(existingIdx, 1)
          return [moved, ...updated]
        } else {
          const newSession: ChatSession = {
            id: targetSessionId!,
            title: generateTitle(trimmed),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: currentMessages
          }
          return [newSession, ...prevSessions]
        }
      })
    }

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
        finishAssistant(`Error: ${res.error}`, targetSessionId)
        return
      }
      const reply = typeof res.replyText === 'string' ? res.replyText.trim() : ''
      if (reply) finishAssistant(reply, targetSessionId)
    } catch (e: any) {
      const msg = e?.message || 'Send failed'
      setError(msg)
      finishAssistant(`Sorry — chat failed: ${msg}`, targetSessionId)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const startNewChat = () => {
    setActiveSessionId(null)
    activeSessionIdRef.current = null
    setMessages([])
    setTemporaryChat(false)
    temporaryChatRef.current = false
    setError(null)
    localStorage.removeItem(ACTIVE_SESSION_KEY)
  }

  const loadSession = (id: string) => {
    const found = sessions.find((s) => s.id === id)
    if (!found) return
    setActiveSessionId(found.id)
    activeSessionIdRef.current = found.id
    setMessages(found.messages)
    setTemporaryChat(false)
    temporaryChatRef.current = false
    setError(null)
    localStorage.setItem(ACTIVE_SESSION_KEY, found.id)
  }

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeSessionIdRef.current === id) {
      startNewChat()
    }
  }

  const renameSession = (id: string, newTitle: string) => {
    const trimmed = newTitle.trim()
    if (!trimmed) return
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: trimmed, updatedAt: Date.now() } : s))
    )
  }

  const clearAllSessions = () => {
    setSessions([])
    startNewChat()
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }

  const clearMessages = () => {
    setMessages([])
  }

  const value = useMemo<ChatContextValue>(
    () => ({
      sessions,
      activeSessionId,
      messages,
      sending,
      error,
      temporaryChat,
      setTemporaryChat,
      send,
      startNewChat,
      loadSession,
      deleteSession,
      renameSession,
      clearAllSessions,
      setMessages,
      clearMessages
    }),
    [sessions, activeSessionId, messages, sending, error, temporaryChat]
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return ctx
}

export const useChatContext = useChat
