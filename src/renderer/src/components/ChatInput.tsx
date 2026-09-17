import React, { useEffect, useMemo, useRef } from 'react'
import { Globe, Mic, MicOff, SendHorizonal } from 'lucide-react'

export type SpeechLang = 'en' | 'ar'

export function ChatInput({
  value,
  onChange,
  onSend,
  sending,
  micActive,
  onToggleMic,
  transcript,
  speechLang = 'en',
  onSpeechLangChange = () => {},
  webSearch = false,
  onWebSearchChange = () => {},
  focusToken = 0
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  sending: boolean
  micActive: boolean
  onToggleMic: () => void
  transcript?: string
  speechLang?: SpeechLang
  onSpeechLangChange?: (lang: SpeechLang) => void
  webSearch?: boolean
  onWebSearchChange?: (enabled: boolean) => void
  focusToken?: number
}) {
  const canSend = useMemo(() => value.trim().length > 0 && !sending, [value, sending])
  const isArabic = speechLang === 'ar'
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!focusToken) return
    composerRef.current?.focus()
  }, [focusToken])

  return (
    <div className="border-t border-zinc-200 bg-white/70 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
      {micActive || transcript ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <div className={`min-w-0 flex-1 truncate ${isArabic ? 'text-right' : ''}`} dir={isArabic ? 'rtl' : 'ltr'}>
            {micActive ? (isArabic ? 'جاري الاستماع…' : 'Listening…') : isArabic ? 'النص' : 'Transcript'}
            {transcript ? `: ${transcript}` : ''}
          </div>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={onToggleMic}
          className={[
            'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition',
            micActive
              ? 'border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-900/60'
              : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900'
          ].join(' ')}
          title={micActive ? 'Stop mic' : isArabic ? 'ميكروفون عربي' : 'Start mic'}
        >
          {micActive ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        <div className="inline-flex h-11 shrink-0 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            disabled={micActive}
            onClick={() => onSpeechLangChange('en')}
            className={`px-3 text-sm font-semibold ${
              speechLang === 'en'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900'
            } disabled:cursor-not-allowed disabled:opacity-60`}
            title="English speech recognition"
          >
            EN
          </button>
          <button
            type="button"
            disabled={micActive}
            onClick={() => onSpeechLangChange('ar')}
            className={`px-3 text-sm font-semibold ${
              speechLang === 'ar'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900'
            } disabled:cursor-not-allowed disabled:opacity-60`}
            title="Arabic speech recognition"
          >
            AR
          </button>
        </div>

        <div className="flex-1">
          <textarea
            ref={composerRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (canSend) onSend()
              }
            }}
            rows={1}
            dir={isArabic ? 'rtl' : 'ltr'}
            placeholder={isArabic ? 'اكتب رسالة…' : 'Type a message…'}
            className="max-h-40 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-800 dark:bg-zinc-950"
          />
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>{isArabic ? 'Enter للإرسال، Shift+Enter لسطر جديد.' : 'Press Enter to send, Shift+Enter for a new line.'}</span>
            {webSearch ? <span className="text-emerald-600 dark:text-emerald-400">Web search on</span> : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onWebSearchChange(!webSearch)}
          className={[
            'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition',
            webSearch
              ? 'border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-900/60'
              : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900'
          ].join(' ')}
          title={webSearch ? 'Disable web search' : 'Enable web search'}
        >
          <Globe className="h-4 w-4" />
          Search
        </button>

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          title="Send"
        >
          <SendHorizonal className="h-4 w-4" />
          Send
        </button>
      </div>
    </div>
  )
}
