import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChatMessage } from '@renderer/components/ChatMessage'
import { ChatInput, type SpeechLang } from '@renderer/components/ChatInput'
import { useChat } from '@renderer/hooks/useChat'
import { useSpeech } from '@renderer/hooks/useSpeech'
import { getApi } from '@renderer/lib/ipc'

export function ChatPage() {
  const { messages, sending, error, send } = useChat()
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
      if (evt.action === 'ai' && evt.gesture === 'double') {
        setComposerFocusToken((n) => n + 1)
        return
      }
      if (evt.action !== 'voice') return
      if (evt.gesture === 'double') {
        if (micActiveRef.current) return
        setSpeechLanguage(speechLang === 'ar' ? 'en' : 'ar')
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
        })()
        return
      }
      if (evt.gesture === 'click') void onToggleMic()
    })
  }, [speechLang, start, stop, flushIntoInput])

  const topError = useMemo(() => speechError || error, [speechError, error])

  return (
    <>
      {topError ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {topError}
        </div>
      ) : null}

      <div className="flex-1 overflow-auto bg-gradient-to-b from-zinc-50 to-white p-4 dark:from-zinc-950 dark:to-zinc-950">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((m, idx) => (
            <ChatMessage key={idx} message={m} />
          ))}
          <div ref={endRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl">
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
    </>
  )
}
