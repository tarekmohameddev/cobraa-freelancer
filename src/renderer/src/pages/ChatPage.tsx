import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChatMessage } from '@renderer/components/ChatMessage'
import { ChatInput, type SpeechLang } from '@renderer/components/ChatInput'
import { useChat } from '@renderer/context/ChatContext'
import { useSpeech } from '@renderer/hooks/useSpeech'
import { getApi } from '@renderer/lib/ipc'
import { MessageSquare, Plus } from 'lucide-react'

export function ChatPage() {
  const { messages, sending, error, send, temporaryChat, setTemporaryChat, startNewChat } = useChat()
  const [input, setInput] = useState('')
  const { micActive, transcript, start, stop, error: speechError, flushIntoInput } = useSpeech()
  const [webSearch, setWebSearch] = useState(() => localStorage.getItem('cobraa:webSearch') === '1')
  const [speechLang, setSpeechLang] = useState<SpeechLang>(() => {
    const stored = localStorage.getItem('cobraa:speechLang')
    return stored === 'ar' ? 'ar' : 'en'
  })

  const setSpeechLanguage = (lang: SpeechLang) => {
    if (micActive) return
    setSpeechLang(lang)
    localStorage.setItem('cobraa:speechLang', lang)
  }

  const endRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const onSend = async () => {
    const text = input
    setInput('')
    await send(text, { stream: false, web_search: webSearch })
  }

  const onToggleMic = async () => {
    if (micActive) {
      await stop()
      const text = flushIntoInput()
      if (text) setInput((v) => (v ? `${v} ${text}` : text))
      return
    }
    await start({ language: speechLang === 'ar' ? 'ar-SA' : 'en-US' })
  }

  const micActiveRef = useRef(micActive)
  micActiveRef.current = micActive
  const holdTalkRef = useRef(false)
  const [composerFocusToken, setComposerFocusToken] = useState(0)

  useEffect(() => {
    return getApi().onMouseButton((evt) => {
      if (evt.action === 'ai') {
        if (evt.gesture === 'click' || evt.gesture === 'double') {
          setComposerFocusToken((n) => n + 1)
          return
        }
        if (evt.gesture === 'long') {
          holdTalkRef.current = true
          if (!micActiveRef.current) void start({ language: speechLang === 'ar' ? 'ar-SA' : 'en-US' })
          return
        }
        if (evt.gesture === 'up' && holdTalkRef.current) {
          holdTalkRef.current = false
          void (async () => {
            await stop()
            const text = flushIntoInput()
            if (text) setInput((v) => (v ? `${v} ${text}` : text))
            setComposerFocusToken((n) => n + 1)
          })()
          return
        }
        return
      }
    })
  }, [speechLang, start, stop, flushIntoInput])

  useEffect(() => {
    return getApi().onChatAutoSend((data) => {
      if (data?.text) {
        setInput('')
        void send(data.text, { stream: false, web_search: webSearch })
      }
    })
  }, [send, webSearch])

  const topError = useMemo(() => speechError || error, [speechError, error])

  const isEmpty = messages.length === 0

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
      {topError ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {topError}
        </div>
      ) : null}

      {/* Top action row below the title bar border */}
      <div className="flex shrink-0 items-center justify-between px-6 pt-3.5 pb-1">
        <button
          type="button"
          onClick={() => {
            const next = !temporaryChat
            setTemporaryChat(next)
            if (next) {
              startNewChat()
              setInput('')
            }
          }}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition ${
            temporaryChat
              ? 'border-[#00007B]/40 bg-[#00007B]/10 text-[#00007B] dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-300'
              : 'border-zinc-200/90 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'
          }`}
          title="Toggle temporary chat (conversations are not saved to history)"
        >
          <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
          <span>Temporary</span>
          <span
            className={`relative inline-block h-3.5 w-6 rounded-full transition-colors ${
              temporaryChat ? 'bg-[#00007B] dark:bg-blue-500' : 'bg-zinc-200 dark:bg-zinc-700'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full bg-white transition-transform ${
                temporaryChat ? 'translate-x-2.5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        {!isEmpty && (
          <button
            type="button"
            onClick={() => {
              startNewChat()
              setInput('')
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New chat</span>
          </button>
        )}
      </div>

      {isEmpty ? (
        /* Empty State — Exact match to requested mockup */
        <div className="relative flex flex-1 flex-col items-center justify-center px-6 pb-16">
          <div className="w-full max-w-3xl lg:max-w-4xl space-y-7 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              How can I assist you
            </h1>

            <div className="text-left">
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={() => void onSend()}
                sending={sending}
                micActive={micActive}
                onToggleMic={() => void onToggleMic()}
                transcript={transcript}
                speechLang={speechLang}
                onSpeechLangChange={setSpeechLanguage}
                webSearch={webSearch}
                onWebSearchChange={(enabled) => {
                  setWebSearch(enabled)
                  localStorage.setItem('cobraa:webSearch', enabled ? '1' : '0')
                }}
                focusToken={composerFocusToken}
              />
            </div>
          </div>

          <div className="absolute bottom-5 left-0 right-0 text-center text-xs text-zinc-400 dark:text-zinc-500 select-none">
            AI may also make mistakes. Please verify important information.
          </div>
        </div>
      ) : (
        /* Active Conversation State */
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Messages stream */}
          <div className="flex-1 overflow-auto px-6 py-4">
            <div className="mx-auto max-w-3xl lg:max-w-4xl space-y-5">
              {messages.map((m, idx) => (
                <ChatMessage key={idx} message={m} />
              ))}
              <div ref={endRef} />
            </div>
          </div>

          {/* Docked composer at bottom */}
          <div className="mx-auto w-full max-w-3xl lg:max-w-4xl px-6 pb-3">
            <ChatInput
              value={input}
              onChange={setInput}
              onSend={() => void onSend()}
              sending={sending}
              micActive={micActive}
              onToggleMic={() => void onToggleMic()}
              transcript={transcript}
              speechLang={speechLang}
              onSpeechLangChange={setSpeechLanguage}
              webSearch={webSearch}
              onWebSearchChange={(enabled) => {
                setWebSearch(enabled)
                localStorage.setItem('cobraa:webSearch', enabled ? '1' : '0')
              }}
              focusToken={composerFocusToken}
            />

            <div className="pt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500 select-none">
              AI may also make mistakes. Please verify important information.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
